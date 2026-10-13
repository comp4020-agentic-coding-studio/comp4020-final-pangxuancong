// The round state machine (docs/GAME_LOOP.md), as plain data and functions so
// it can be tested without a server. Phases end on player states, never on a
// gameplay timer; the AFK and idle limits are resilience only. Time is always
// passed in.

export const MAX_ROUNDS = 6;
export const WIN_POINTS = 4; // reaching this at a round's end wins the game early
export const MAX_PLAYERS = 4;
export const COUNTDOWN_MS = 3000;
export const RESULTS_MS = 4500; // the round card and its score bars
export const STAMP_MS = 1500; // extra, when everyone made it: "too simple"
export const VOTE_MS = 40_000; // LEVEL_END: the score reveal, then archive or restart
export const SELECT_MS = 20_000; // after the first pick, the rest have this long
export const LEVEL_IDS = [1, 2, 3] as const;
export const BUILD_IDLE_MS = 40_000; // no build activity: auto-skip
export const BUILD_MAX_MS = 120_000; // nobody is left waiting after this
export const RUN_IDLE_MS = 30_000; // a character that has not moved: out

export type Phase = "SELECT" | "BUILD" | "COUNTDOWN" | "RUN" | "RESULTS" | "LEVEL_END";
export type Vote = "ARCHIVE" | "RESTART";
export type BuildState = "WAITING" | "PLACED" | "SKIPPED" | "DISCONNECTED";
export type RunState = "RUNNING" | "DEAD" | "FINISHED" | "DISCONNECTED";

export interface Player {
  id: string;
  name: string;
  connected: boolean;
  active: boolean; // on this round's roster; otherwise spectating
  build: BuildState;
  run: RunState | null; // null until the roster closes
  lastActivityAt: number; // build activity, or character movement during RUN
  joinedAt: number; // seats go in order of arrival
  vote: Vote | null; // LEVEL_END only
  pick: number | null; // SELECT only: which level
  character: number | null; // index into CHARACTERS while seated
}

export interface RoundState {
  phase: Phase;
  phaseStartedAt: number;
  phaseEndsAt: number | null; // COUNTDOWN, RESULTS, LEVEL_END, and SELECT once someone picks
  round: number; // 1..MAX_ROUNDS
  players: Player[];
}

export type Transition =
  | { to: "COUNTDOWN" }
  | { to: "RUN" }
  | { to: "RESULTS"; levelDone: boolean; tooSimple: boolean }
  | { to: "LEVEL_END" }
  | { to: "SELECT" }
  | { to: "BUILD"; newLevel: false }
  | { to: "BUILD"; newLevel: true; archive: true }
  | { to: "BUILD"; newLevel: true; archive: false; layout: number };

// A game in progress resumes in BUILD; with none, everyone starts by choosing a level.
export const newRoundState = (round: number, now: number, phase: "BUILD" | "SELECT" = "BUILD"): RoundState => ({
  phase,
  phaseStartedAt: now,
  phaseEndsAt: null,
  round,
  players: [],
});

export const activePlayers = (s: RoundState): Player[] => s.players.filter((p) => p.active);
const find = (s: RoundState, id: string): Player | undefined => s.players.find((p) => p.id === id);
const seatsTaken = (s: RoundState): number => s.players.filter((p) => p.active && p.connected).length;

export function join(s: RoundState, id: string, name: string, now: number): Player {
  // the first person into an empty BUILD gets the whole build window
  if (s.phase === "BUILD" && !s.players.some((q) => q.active && q.connected)) s.phaseStartedAt = now;
  let p = find(s, id);
  if (!p) {
    p = { id, name, connected: false, active: false, build: "WAITING", run: null, lastActivityAt: now, joinedAt: now, vote: null, pick: null, character: null };
    s.players.push(p);
  }
  // the roster is open during BUILD while a seat is free; a returning player
  // who had not acted waits again
  const seat = seatsTaken(s) < MAX_PLAYERS || (p.active && p.build !== "DISCONNECTED");
  p.connected = true;
  p.name = name;
  if (s.phase === "BUILD" && seat) {
    if (!p.active || p.build === "DISCONNECTED") {
      p.active = true;
      p.build = "WAITING";
      p.lastActivityAt = now;
    }
    if (p.character === null) p.character = freeCharacter(s);
  }
  return p;
}

// the lowest character nobody seated is using
function freeCharacter(s: RoundState): number {
  const used = new Set(s.players.filter((p) => p.active && p.connected).map((p) => p.character));
  for (let c = 0; c < MAX_PLAYERS; c++) if (!used.has(c)) return c;
  return 0;
}

export function pick(s: RoundState, id: string, level: number, now: number): boolean {
  const p = find(s, id);
  if (s.phase !== "SELECT" || !p?.connected || !(LEVEL_IDS as readonly number[]).includes(level)) return false;
  p.pick = level;
  // the first pick starts the clock for everyone else
  if (s.phaseEndsAt === null) s.phaseEndsAt = now + SELECT_MS;
  return true;
}

// Most picks wins; a tie goes to the lower level, nobody picking to level 1.
export const pickResult = (s: RoundState): number => {
  let best: number = LEVEL_IDS[0], most = 0;
  for (const id of LEVEL_IDS) {
    const count = s.players.filter((p) => p.pick === id).length;
    if (count > most) [best, most] = [id, count];
  }
  return best;
};

export function leave(s: RoundState, id: string): void {
  const p = find(s, id);
  if (!p) return;
  p.connected = false;
  if (!p.active) {
    s.players = s.players.filter((q) => q !== p);
    return;
  }
  if (p.build === "WAITING") p.build = "DISCONNECTED";
  if (p.run === "RUNNING") p.run = "DISCONNECTED";
  p.pick = null;
  p.vote = null;
}

// An active player with their build action still unused.
export const canBuild = (s: RoundState, id: string): boolean => {
  const p = find(s, id);
  return s.phase === "BUILD" && !!p && p.active && p.build === "WAITING";
};

export function act(s: RoundState, id: string, result: "PLACED" | "SKIPPED"): boolean {
  if (!canBuild(s, id)) return false;
  find(s, id)!.build = result;
  return true;
}

export function touchBuild(s: RoundState, id: string, now: number): void {
  const p = find(s, id);
  if (p && s.phase === "BUILD") p.lastActivityAt = now;
}

export function moved(s: RoundState, id: string, now: number): void {
  const p = find(s, id);
  if (p && s.phase === "RUN" && p.run === "RUNNING") p.lastActivityAt = now;
}

export function vote(s: RoundState, id: string, v: Vote): boolean {
  const p = find(s, id);
  if (s.phase !== "LEVEL_END" || !p?.connected || (v !== "ARCHIVE" && v !== "RESTART")) return false;
  p.vote = v;
  return true;
}

// Majority of the votes cast; a tie, or nobody voting, archives.
export const voteResult = (s: RoundState): Vote => {
  const archive = s.players.filter((p) => p.vote === "ARCHIVE").length;
  const restart = s.players.filter((p) => p.vote === "RESTART").length;
  return restart > archive ? "RESTART" : "ARCHIVE";
};

export function report(s: RoundState, id: string, result: "DEAD" | "FINISHED"): boolean {
  const p = find(s, id);
  if (s.phase !== "RUN" || !p || p.run !== "RUNNING") return false;
  p.run = result;
  return true;
}

export const buildComplete = (s: RoundState): boolean => {
  const active = activePlayers(s);
  return active.length > 0 && active.every((p) => p.build !== "WAITING") && active.some((p) => p.build !== "DISCONNECTED");
};

export const runComplete = (s: RoundState): boolean => activePlayers(s).every((p) => p.run !== "RUNNING");

// Everyone who stayed in the run reached the flag: the level was too simple,
// and nobody scores that round. Someone who left does not count either way.
export const tooSimple = (s: RoundState): boolean => {
  const ran = activePlayers(s).filter((p) => p.run !== "DISCONNECTED");
  return ran.length > 0 && ran.every((p) => p.run === "FINISHED");
};

// Applies timeouts and moves to the next phase when its condition holds.
// Returns the transition taken, if any; the caller does the side effects
// (persisting the round, starting a new level, broadcasting). `topPoints` is
// the best score in the game so far: WIN_POINTS ends the game at round end.
export function tick(s: RoundState, now: number, topPoints = 0): Transition | null {
  switch (s.phase) {
    case "SELECT": {
      const here = s.players.filter((p) => p.connected);
      const allIn = here.length > 0 && here.every((p) => p.pick !== null);
      if (!allIn && (s.phaseEndsAt === null || now < s.phaseEndsAt)) return null;
      const layout = pickResult(s);
      s.round = 1;
      startBuild(s, now);
      return { to: "BUILD", newLevel: true, archive: false, layout };
    }
    case "BUILD": {
      const active = activePlayers(s);
      for (const p of active) {
        if (p.build !== "WAITING") continue;
        if (now - p.lastActivityAt >= BUILD_IDLE_MS || now - s.phaseStartedAt >= BUILD_MAX_MS) p.build = "SKIPPED";
      }
      // everyone on the roster left without acting: start over with whoever is here
      if (active.length > 0 && active.every((p) => p.build === "DISCONNECTED")) {
        startBuild(s, now);
        return null;
      }
      if (!buildComplete(s)) return null;
      s.phase = "COUNTDOWN";
      s.phaseStartedAt = now;
      s.phaseEndsAt = now + COUNTDOWN_MS;
      // the roster closes
      for (const p of s.players) p.run = p.active ? (p.connected ? "RUNNING" : "DISCONNECTED") : null;
      return { to: "COUNTDOWN" };
    }
    case "COUNTDOWN": {
      if (now < s.phaseEndsAt!) return null;
      s.phase = "RUN";
      s.phaseStartedAt = now;
      s.phaseEndsAt = null;
      for (const p of activePlayers(s)) p.lastActivityAt = now;
      return { to: "RUN" };
    }
    case "RUN": {
      for (const p of activePlayers(s)) if (p.run === "RUNNING" && now - p.lastActivityAt >= RUN_IDLE_MS) p.run = "DEAD";
      if (!runComplete(s)) return null;
      const simple = tooSimple(s);
      const levelDone = s.round >= MAX_ROUNDS || topPoints >= WIN_POINTS;
      s.phase = "RESULTS";
      s.phaseStartedAt = now;
      s.phaseEndsAt = now + RESULTS_MS + (simple ? STAMP_MS : 0);
      return { to: "RESULTS", levelDone, tooSimple: simple };
    }
    case "RESULTS": {
      if (now < s.phaseEndsAt!) return null;
      if (s.round >= MAX_ROUNDS || topPoints >= WIN_POINTS) {
        s.phase = "LEVEL_END";
        s.phaseStartedAt = now;
        s.phaseEndsAt = now + VOTE_MS;
        for (const p of s.players) p.vote = null;
        return { to: "LEVEL_END" };
      }
      s.round += 1;
      startBuild(s, now);
      return { to: "BUILD", newLevel: false };
    }
    case "LEVEL_END": {
      const voters = s.players.filter((p) => p.connected);
      const allIn = voters.length > 0 && voters.every((p) => p.vote !== null);
      if (!allIn && now < s.phaseEndsAt!) return null;
      s.round = 1;
      if (voteResult(s) === "ARCHIVE") {
        startBuild(s, now);
        return { to: "BUILD", newLevel: true, archive: true };
      }
      startSelect(s, now);
      return { to: "SELECT" };
    }
  }
}

// A fresh BUILD: the first four connected players, in order of arrival, are
// on the roster and nobody has acted; anyone else watches.
function startBuild(s: RoundState, now: number): void {
  s.phase = "BUILD";
  s.phaseStartedAt = now;
  s.phaseEndsAt = null;
  s.players = s.players.filter((p) => p.connected).sort((a, b) => a.joinedAt - b.joinedAt);
  s.players.forEach((p, i) => {
    p.active = i < MAX_PLAYERS;
    p.build = "WAITING";
    p.run = null;
    p.vote = null;
    p.pick = null;
    p.lastActivityAt = now;
    if (!p.active) p.character = null;
  });
  // seated players keep their character; newcomers get a free one
  for (const p of s.players) if (p.active && p.character === null) p.character = freeCharacter(s);
}

function startSelect(s: RoundState, now: number): void {
  s.phase = "SELECT";
  s.phaseStartedAt = now;
  s.phaseEndsAt = null;
  s.players = s.players.filter((p) => p.connected);
  for (const p of s.players) {
    p.active = false;
    p.pick = null;
    p.vote = null;
  }
}
