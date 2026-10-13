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
export const SELECT_MS = 30_000; // after the first player stands under a map, the rest have this long
export const LOCK_MS = 2000; // everyone under a map: this long to change their mind
export const DRAW_MS = 5000; // a split vote: the weighted draw, then its result
export const LEVEL_IDS = [1, 2, 3] as const;
// A dropped connection is not leaving: for this long the round treats the
// player as still here (a wifi blip costs nothing), and for SEAT_HOLD_MS their
// character, seat and points wait for them (docs/decisions/0002-rooms-and-seats.md).
export const RECONNECT_GRACE_MS = 8000;
export const SEAT_HOLD_MS = 120_000;
export const BUILD_IDLE_MS = 40_000; // no build activity: auto-skip
export const BUILD_MAX_MS = 120_000; // nobody is left waiting after this
export const RUN_IDLE_MS = 30_000; // a character that has not moved: out

export type Phase = "SELECT" | "DRAW" | "BUILD" | "COUNTDOWN" | "RUN" | "RESULTS" | "LEVEL_END";
export type Vote = "ARCHIVE" | "RESTART";
export type BuildState = "WAITING" | "PLACED" | "SKIPPED" | "DISCONNECTED";
export type RunState = "RUNNING" | "DEAD" | "FINISHED" | "DISCONNECTED";

export interface Player {
  id: string;
  name: string;
  connected: boolean;
  leftAt: number | null; // when the connection dropped, while it is down
  active: boolean; // on this round's roster; otherwise spectating
  build: BuildState;
  run: RunState | null; // null until the roster closes
  lastActivityAt: number; // build activity, or character movement during RUN
  joinedAt: number;
  vote: Vote | null; // LEVEL_END only
  pick: number | null; // SELECT only: the map they stand under
  character: number | null; // the seat: index into CHARACTERS; null watches
}

// A split vote is settled by a draw weighted by the votes for each map.
export interface Draw { options: { layout: number; votes: number }[]; result: number }

export interface RoundState {
  phase: Phase;
  phaseStartedAt: number;
  phaseEndsAt: number | null; // COUNTDOWN, RESULTS, LEVEL_END, and SELECT once someone picks
  round: number; // 1..MAX_ROUNDS
  players: Player[];
  firstPickAt: number | null; // SELECT: someone stood under a map
  allInAt: number | null; // SELECT: since when every seated player has
  draw: Draw | null; // DRAW
}

export type Transition =
  | { to: "COUNTDOWN" }
  | { to: "RUN" }
  | { to: "RESULTS"; levelDone: boolean; tooSimple: boolean }
  | { to: "LEVEL_END" }
  | { to: "SELECT" }
  | { to: "DRAW" }
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
  firstPickAt: null,
  allInAt: null,
  draw: null,
});

export const activePlayers = (s: RoundState): Player[] => s.players.filter((p) => p.active);
const find = (s: RoundState, id: string): Player | undefined => s.players.find((p) => p.id === id);
const seated = (s: RoundState): Player[] => s.players.filter((p) => p.character !== null);

// Connecting, or reconnecting. Joining gives no seat: a player takes one by
// choosing a character (claim). Someone coming back to a seat they still hold
// carries on; if they had not built yet this BUILD, they still can.
export function join(s: RoundState, id: string, name: string, now: number): Player {
  let p = find(s, id);
  if (!p) {
    p = { id, name, connected: false, leftAt: null, active: false, build: "WAITING", run: null, lastActivityAt: now, joinedAt: now, vote: null, pick: null, character: null };
    s.players.push(p);
  }
  p.connected = true;
  p.leftAt = null;
  p.name = name;
  if (s.phase === "BUILD" && p.active && p.build === "DISCONNECTED") {
    p.build = "WAITING";
    p.lastActivityAt = now;
  }
  return p;
}

// Choosing one of the four characters is taking a seat. A free character can
// be taken at any time; it plays from now if BUILD is open, otherwise from the
// next BUILD. While choosing a level a seated player may swap to another free one.
export function claim(s: RoundState, id: string, character: number, now: number): boolean {
  const p = find(s, id);
  if (!p?.connected || !Number.isInteger(character) || character < 0 || character >= MAX_PLAYERS) return false;
  if (p.character === character) return true;
  if (s.players.some((q) => q.character === character)) return false;
  if (p.character !== null && s.phase !== "SELECT") return false;
  // the first person into an empty BUILD gets the whole build window
  if (s.phase === "BUILD" && !s.players.some((q) => q.active && q.connected)) s.phaseStartedAt = now;
  p.character = character;
  if (s.phase === "BUILD" && !p.active) {
    p.active = true;
    p.build = "WAITING";
    p.lastActivityAt = now;
  }
  return true;
}

// Giving a seat back to watch, while choosing a level.
export function unclaim(s: RoundState, id: string): boolean {
  const p = find(s, id);
  if (!p || p.character === null || s.phase !== "SELECT") return false;
  p.character = null;
  p.pick = null;
  return true;
}

// Standing under a map's sign (or walking away from it: null). Seated
// players only; the clock starts with the first.
export function pick(s: RoundState, id: string, level: number | null, now: number): boolean {
  const p = find(s, id);
  if (s.phase !== "SELECT" || !p?.connected || p.character === null) return false;
  if (level !== null && !(LEVEL_IDS as readonly number[]).includes(level)) return false;
  if (p.pick === level) return true;
  p.pick = level;
  if (level !== null && s.firstPickAt === null) s.firstPickAt = now;
  s.allInAt = null; // a change of mind restarts the short lock
  return true;
}

// The votes for each map; one map wins outright, several go to a draw.
export const pickTally = (s: RoundState): { layout: number; votes: number }[] =>
  LEVEL_IDS.map((layout) => ({ layout, votes: seated(s).filter((p) => p.connected && p.pick === layout).length })).filter((o) => o.votes > 0);

// A draw weighted by the votes: 3 for one map and 1 for another is 75% and 25%.
// `r` is in [0, 1).
export const drawResult = (options: { layout: number; votes: number }[], r: number): number => {
  const total = options.reduce((n, o) => n + o.votes, 0);
  let at = r * total;
  for (const o of options) {
    if (at < o.votes) return o.layout;
    at -= o.votes;
  }
  return options.at(-1)!.layout;
};

// The connection dropped. Someone without a seat is simply gone; a seated
// player is held: the round waits RECONNECT_GRACE_MS for them, their seat
// waits SEAT_HOLD_MS (both applied in tick).
export function leave(s: RoundState, id: string, now: number): void {
  const p = find(s, id);
  if (!p) return;
  p.connected = false;
  p.leftAt = now;
  p.vote = null;
  if (p.pick !== null) {
    p.pick = null;
    s.allInAt = null;
  }
  if (p.character === null) s.players = s.players.filter((q) => q !== p);
}

// What a dropped connection costs, once its grace is over: this BUILD or
// RUN goes on without them, and in the end the seat itself.
function expire(s: RoundState, now: number): void {
  for (const p of s.players) {
    if (p.connected || p.leftAt === null) continue;
    if (now - p.leftAt >= RECONNECT_GRACE_MS) {
      if (p.active && p.build === "WAITING" && s.phase === "BUILD") p.build = "DISCONNECTED";
      if (p.run === "RUNNING") p.run = "DISCONNECTED";
    }
  }
  // seats released; someone still on a round's roster stays there, marked away
  s.players = s.players.filter((p) => p.connected || p.leftAt === null || now - p.leftAt < SEAT_HOLD_MS || (p.active && s.phase !== "SELECT" && s.phase !== "BUILD"));
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
// It takes at least two runners: playing alone, the flag still scores.
export const tooSimple = (s: RoundState): boolean => {
  const ran = activePlayers(s).filter((p) => p.run !== "DISCONNECTED");
  return ran.length > 1 && ran.every((p) => p.run === "FINISHED");
};

// Applies timeouts and moves to the next phase when its condition holds.
// Returns the transition taken, if any; the caller does the side effects
// (persisting the round, starting a new level, broadcasting). `topPoints` is
// the best score in the game so far: WIN_POINTS ends the game at round end.
export function tick(s: RoundState, now: number, topPoints = 0, random: () => number = Math.random): Transition | null {
  expire(s, now);
  switch (s.phase) {
    case "SELECT": {
      // everyone seated and here stands under a map, for LOCK_MS; or the
      // clock since the first one runs out
      const here = seated(s).filter((p) => p.connected);
      const allIn = here.length > 0 && here.every((p) => p.pick !== null);
      if (allIn) s.allInAt ??= now;
      else s.allInAt = null;
      const ends = [s.allInAt === null ? Infinity : s.allInAt + LOCK_MS, s.firstPickAt === null ? Infinity : s.firstPickAt + SELECT_MS];
      const at = Math.min(...ends);
      s.phaseEndsAt = Number.isFinite(at) ? at : null;
      const options = pickTally(s);
      if (s.phaseEndsAt === null || now < s.phaseEndsAt) return null;
      if (options.length === 0) {
        // the clock ran out with nobody under a sign any more: wait again
        s.firstPickAt = null;
        s.phaseEndsAt = null;
        return null;
      }
      if (options.length === 1) {
        s.round = 1;
        startBuild(s, now);
        return { to: "BUILD", newLevel: true, archive: false, layout: options[0].layout };
      }
      s.phase = "DRAW";
      s.phaseStartedAt = now;
      s.phaseEndsAt = now + DRAW_MS;
      s.draw = { options, result: drawResult(options, random()) };
      return { to: "DRAW" };
    }
    case "DRAW": {
      if (now < s.phaseEndsAt!) return null;
      const layout = s.draw!.result;
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
      // the roster closes; someone inside their reconnect grace still runs
      // (expire marks them out if they do not come back)
      for (const p of s.players) p.run = p.active ? (p.connected || (p.leftAt !== null && p.build !== "DISCONNECTED") ? "RUNNING" : "DISCONNECTED") : null;
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

// A fresh BUILD: everyone holding a seat is on the roster, and nobody has
// acted. A seat held for someone whose connection is down is on it too: their
// grace runs from when they dropped (expire), and if they are back in time
// they build.
function startBuild(s: RoundState, now: number): void {
  s.phase = "BUILD";
  s.phaseStartedAt = now;
  s.phaseEndsAt = null;
  s.draw = null;
  s.players = s.players.filter((p) => p.connected || p.character !== null).sort((a, b) => a.joinedAt - b.joinedAt);
  for (const p of s.players) {
    p.active = p.character !== null;
    p.build = "WAITING";
    p.run = null;
    p.vote = null;
    p.pick = null;
    p.lastActivityAt = now;
  }
  expire(s, now);
}

// Back to choosing a level: seats are kept, picks start empty.
function startSelect(s: RoundState, now: number): void {
  s.phase = "SELECT";
  s.phaseStartedAt = now;
  s.phaseEndsAt = null;
  s.firstPickAt = null;
  s.allInAt = null;
  s.draw = null;
  for (const p of s.players) {
    p.active = false;
    p.pick = null;
    p.vote = null;
  }
}
