// The round state machine (docs/GAME_LOOP.md), as plain data and functions so
// it can be tested without a server. Phases end on player states, never on a
// gameplay timer; the AFK and idle limits are resilience only. Time is always
// passed in.

export const MAX_ROUNDS = 6;
export const COUNTDOWN_MS = 3000;
export const RESULTS_MS = 3500;
export const LEVEL_DONE_MS = 7000; // results after round 6, when the level is finished
export const BUILD_IDLE_MS = 40_000; // no build activity: auto-skip
export const BUILD_MAX_MS = 120_000; // nobody is left waiting after this
export const RUN_IDLE_MS = 30_000; // a character that has not moved: out

export type Phase = "BUILD" | "COUNTDOWN" | "RUN" | "RESULTS";
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
}

export interface RoundState {
  phase: Phase;
  phaseStartedAt: number;
  phaseEndsAt: number | null; // COUNTDOWN and RESULTS only
  round: number; // 1..MAX_ROUNDS
  players: Player[];
}

export type Transition =
  | { to: "COUNTDOWN" }
  | { to: "RUN" }
  | { to: "RESULTS"; levelDone: boolean }
  | { to: "BUILD"; newLevel: boolean };

export const newRoundState = (round: number, now: number): RoundState => ({
  phase: "BUILD",
  phaseStartedAt: now,
  phaseEndsAt: null,
  round,
  players: [],
});

export const activePlayers = (s: RoundState): Player[] => s.players.filter((p) => p.active);
const find = (s: RoundState, id: string): Player | undefined => s.players.find((p) => p.id === id);

export function join(s: RoundState, id: string, name: string, now: number): Player {
  // the first person into an empty BUILD gets the whole build window
  if (s.phase === "BUILD" && !s.players.some((q) => q.active && q.connected)) s.phaseStartedAt = now;
  let p = find(s, id);
  if (!p) {
    p = { id, name, connected: true, active: false, build: "WAITING", run: null, lastActivityAt: now };
    s.players.push(p);
  }
  p.connected = true;
  p.name = name;
  // the roster is open during BUILD; a returning player who had not acted waits again
  if (s.phase === "BUILD") {
    if (!p.active || p.build === "DISCONNECTED") {
      p.active = true;
      p.build = "WAITING";
      p.lastActivityAt = now;
    }
  }
  return p;
}

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

// Applies timeouts and moves to the next phase when its condition holds.
// Returns the transition taken, if any; the caller does the side effects
// (persisting the round, starting a new level, broadcasting).
export function tick(s: RoundState, now: number): Transition | null {
  switch (s.phase) {
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
      const levelDone = s.round >= MAX_ROUNDS;
      s.phase = "RESULTS";
      s.phaseStartedAt = now;
      s.phaseEndsAt = now + (levelDone ? LEVEL_DONE_MS : RESULTS_MS);
      return { to: "RESULTS", levelDone };
    }
    case "RESULTS": {
      if (now < s.phaseEndsAt!) return null;
      const newLevel = s.round >= MAX_ROUNDS;
      s.round = newLevel ? 1 : s.round + 1;
      startBuild(s, now);
      return { to: "BUILD", newLevel };
    }
  }
}

// A fresh BUILD: everyone connected is on the roster, nobody has acted.
function startBuild(s: RoundState, now: number): void {
  s.phase = "BUILD";
  s.phaseStartedAt = now;
  s.phaseEndsAt = null;
  s.players = s.players.filter((p) => p.connected);
  for (const p of s.players) {
    p.active = true;
    p.build = "WAITING";
    p.run = null;
    p.lastActivityAt = now;
  }
}
