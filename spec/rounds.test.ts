import { expect, it } from "vitest";
import {
  BUILD_IDLE_MS, BUILD_MAX_MS, COUNTDOWN_MS, MAX_PLAYERS, MAX_ROUNDS, RESULTS_MS, RUN_IDLE_MS, type RoundState, VOTE_MS,
  SELECT_MS, STAMP_MS, WIN_POINTS, act, join, leave, moved, newRoundState, pick, report, tick, tooSimple, touchBuild, vote,
} from "../src/shared/rounds.ts";
import { type ScoreEvent, killCredit, tally } from "../src/shared/score.ts";

// The round rules (docs/GAME_LOOP.md) as a pure function of player states and
// time. Phases end when players are resolved, never on a gameplay timer; the
// AFK and idle limits only stop a walked-away player holding everyone up.

const twoBuilding = (t = 0): RoundState => {
  const s = newRoundState(1, t);
  join(s, "a", "A", t);
  join(s, "b", "B", t);
  return s;
};

// play a state forward to the start of RUN
const toRun = (s: RoundState, t: number): number => {
  expect(tick(s, t)?.to).toBe("COUNTDOWN");
  t += COUNTDOWN_MS;
  expect(tick(s, t)?.to).toBe("RUN");
  return t;
};

it("S3: BUILD ends once every active player has placed or skipped, not before", () => {
  const s = twoBuilding();
  act(s, "a", "PLACED");
  expect(tick(s, 1000)).toBeNull(); // B is still WAITING
  expect(s.phase).toBe("BUILD");
  act(s, "b", "SKIPPED");
  expect(tick(s, 2000)).toEqual({ to: "COUNTDOWN" });
});

it("S3: a disconnected player does not hold BUILD", () => {
  const s = twoBuilding();
  act(s, "a", "PLACED");
  leave(s, "b");
  expect(tick(s, 1000)?.to).toBe("COUNTDOWN");
});

it("gives each active player exactly one build action", () => {
  const s = twoBuilding();
  expect(act(s, "a", "PLACED")).toBe(true);
  expect(act(s, "a", "PLACED")).toBe(false);
  expect(act(s, "a", "SKIPPED")).toBe(false);
});

it("lets players join during BUILD, and makes later joiners spectate", () => {
  const s = twoBuilding();
  join(s, "c", "C", 500);
  expect(s.players.find((p) => p.id === "c")?.active).toBe(true);
  act(s, "a", "PLACED");
  act(s, "b", "SKIPPED");
  act(s, "c", "SKIPPED");
  toRun(s, 1000);
  join(s, "d", "D", 5000);
  const d = s.players.find((p) => p.id === "d")!;
  expect(d.active).toBe(false);
  expect(d.run).toBeNull();
});

it("auto-skips a player idle in BUILD (the AFK timeout)", () => {
  const s = twoBuilding();
  act(s, "a", "PLACED");
  expect(tick(s, BUILD_IDLE_MS - 1)).toBeNull();
  expect(tick(s, BUILD_IDLE_MS)?.to).toBe("COUNTDOWN");
  expect(s.players.find((p) => p.id === "b")?.build).toBe("SKIPPED");
});

it("does not let a fidgeting player hold BUILD past the hard limit", () => {
  const s = twoBuilding();
  act(s, "a", "PLACED");
  for (let t = 0; t < BUILD_MAX_MS; t += 10_000) {
    touchBuild(s, "b", t);
    expect(tick(s, t)).toBeNull();
  }
  expect(tick(s, BUILD_MAX_MS)?.to).toBe("COUNTDOWN");
});

it("never completes an empty BUILD, and restarts one everyone left", () => {
  const s = newRoundState(1, 0);
  expect(tick(s, 500_000)).toBeNull();
  join(s, "a", "A", 500_000);
  // the first player into an empty BUILD gets the full window
  expect(tick(s, 500_000 + BUILD_IDLE_MS - 1)).toBeNull();
  leave(s, "a");
  expect(tick(s, 600_000)).toBeNull();
  expect(s.phase).toBe("BUILD");
});

it("S4: RUN continues while anyone is RUNNING and ends when nobody is", () => {
  const s = twoBuilding();
  act(s, "a", "PLACED");
  act(s, "b", "SKIPPED");
  let t = toRun(s, 0);
  report(s, "a", "FINISHED");
  t += 60_000;
  moved(s, "b", t);
  expect(tick(s, t)).toBeNull(); // B is still running: no gameplay timer
  report(s, "b", "DEAD");
  expect(tick(s, t + 1)).toEqual({ to: "RESULTS", levelDone: false, tooSimple: false });
  expect(tick(s, t + 1 + RESULTS_MS)).toEqual({ to: "BUILD", newLevel: false });
  expect(s.round).toBe(2);
  expect(s.players.every((p) => p.build === "WAITING" && p.run === null)).toBe(true);
});

it("S4: a disconnected runner does not hold RUN", () => {
  const s = twoBuilding();
  act(s, "a", "PLACED");
  act(s, "b", "SKIPPED");
  const t = toRun(s, 0);
  report(s, "a", "DEAD");
  leave(s, "b");
  expect(tick(s, t + 1)?.to).toBe("RESULTS");
});

it("drops a runner who has not moved for a long time", () => {
  const s = twoBuilding();
  act(s, "a", "PLACED");
  act(s, "b", "SKIPPED");
  const t = toRun(s, 0);
  report(s, "a", "FINISHED");
  expect(tick(s, t + RUN_IDLE_MS - 1)).toBeNull();
  expect(tick(s, t + RUN_IDLE_MS)?.to).toBe("RESULTS");
  expect(s.players.find((p) => p.id === "b")?.run).toBe("DEAD");
});

// play one player through all six rounds to LEVEL_END
const toLevelEnd = (s: RoundState, ids: string[]): number => {
  let t = 0;
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    expect(s.round).toBe(round);
    for (const id of ids) act(s, id, "SKIPPED");
    t = toRun(s, t);
    for (const id of ids) report(s, id, "DEAD");
    expect(tick(s, ++t)).toEqual({ to: "RESULTS", levelDone: round === MAX_ROUNDS, tooSimple: false });
    t += RESULTS_MS;
    expect(tick(s, t)?.to).toBe(round === MAX_ROUNDS ? "LEVEL_END" : "BUILD");
  }
  return t;
};

it("S8: after six rounds, the vote decides: majority restarts (back to choosing a level), a tie keeps the level", () => {
  const s = twoBuilding();
  let t = toLevelEnd(s, ["a", "b"]);
  vote(s, "a", "RESTART");
  expect(tick(s, ++t)).toBeNull(); // B has not voted yet
  vote(s, "b", "RESTART");
  expect(tick(s, ++t)).toEqual({ to: "SELECT" });
  expect(s.round).toBe(1);

  const tie = twoBuilding();
  t = toLevelEnd(tie, ["a", "b"]);
  vote(tie, "a", "RESTART");
  vote(tie, "b", "ARCHIVE");
  expect(tick(tie, ++t)).toEqual({ to: "BUILD", newLevel: true, archive: true });
});

it("S8: nobody voting keeps the level once the vote times out", () => {
  const s = twoBuilding();
  const t = toLevelEnd(s, ["a", "b"]);
  expect(tick(s, t + VOTE_MS - 1)).toBeNull();
  expect(tick(s, t + VOTE_MS)).toEqual({ to: "BUILD", newLevel: true, archive: true });
  expect(vote(s, "a", "RESTART")).toBe(false); // the vote is over
});

it("S9: seats four players; a fifth watches and takes a seat that frees up", () => {
  const s = newRoundState(1, 0);
  for (const id of ["a", "b", "c", "d", "e"]) join(s, id, id.toUpperCase(), 0);
  expect(s.players.filter((p) => p.active).map((p) => p.id)).toEqual(["a", "b", "c", "d"]);
  expect(MAX_PLAYERS).toBe(4);
  for (const id of ["a", "b", "c", "d"]) act(s, id, "SKIPPED");
  let t = toRun(s, 0);
  expect(s.players.find((p) => p.id === "e")?.run).toBeNull();
  leave(s, "b");
  for (const id of ["a", "c", "d"]) report(s, id, "DEAD");
  tick(s, ++t);
  tick(s, t + RESULTS_MS);
  expect(s.phase).toBe("BUILD");
  expect(s.players.filter((p) => p.active).map((p) => p.id)).toEqual(["a", "c", "d", "e"]);
});

it("starts a fresh game by choosing a level: everyone picks, or the clock runs out after the first pick", () => {
  const s = newRoundState(1, 0, "SELECT");
  join(s, "a", "A", 0);
  join(s, "b", "B", 0);
  expect(s.players.every((p) => !p.active)).toBe(true); // nobody is seated while choosing
  expect(tick(s, 600_000)).toBeNull(); // no clock before anyone picks
  expect(pick(s, "a", 3, 600_000)).toBe(true);
  expect(pick(s, "a", 7, 600_000)).toBe(false); // no such level
  expect(tick(s, 600_000 + SELECT_MS - 1)).toBeNull();
  expect(tick(s, 600_000 + SELECT_MS)).toEqual({ to: "BUILD", newLevel: true, archive: false, layout: 3 });
  expect(s.players.every((p) => p.active && p.build === "WAITING")).toBe(true);

  const tie = newRoundState(1, 0, "SELECT");
  join(tie, "a", "A", 0);
  join(tie, "b", "B", 0);
  pick(tie, "a", 3, 1);
  pick(tie, "b", 2, 2);
  expect(tick(tie, 3)).toEqual({ to: "BUILD", newLevel: true, archive: false, layout: 2 }); // all in; a tie goes to the lower level
});

it("gives each seat its own character and keeps it into the next game", () => {
  const s = newRoundState(1, 0);
  for (const id of ["a", "b", "c", "d", "e"]) join(s, id, id, 0);
  const chars = s.players.filter((p) => p.active).map((p) => p.character);
  expect(chars).toEqual([0, 1, 2, 3]);
  expect(s.players.find((p) => p.id === "e")?.character).toBeNull();
  leave(s, "a");
  for (const id of ["b", "c", "d"]) act(s, id, "SKIPPED");
  let t = toRun(s, 0);
  for (const id of ["b", "c", "d"]) report(s, id, "DEAD");
  tick(s, ++t);
  tick(s, t + RESULTS_MS);
  // e takes a's seat and the character a left free; the others keep theirs
  expect(Object.fromEntries(s.players.map((p) => [p.id, p.character]))).toEqual({ b: 1, c: 2, d: 3, e: 0 });
});

it("S7: +1 for the flag, +0.2 to the placer per other player spiked, nothing for your own spike", () => {
  const spike = { type: "spike", createdById: "a" };
  expect(killCredit("b", spike)).toBe("a");
  expect(killCredit("a", spike)).toBeNull(); // your own spike
  expect(killCredit("b", { type: "platform", createdById: "a" })).toBeNull();
  expect(killCredit("b", { type: "launcher", createdById: "a" })).toBe("a"); // shot out of the level
  expect(killCredit("a", { type: "launcher", createdById: "a" })).toBeNull();
  expect(killCredit("b", undefined)).toBeNull(); // a fall
  const events: ScoreEvent[] = [
    { round: 1, playerId: "a", name: "A", kind: "finish" },
    { round: 1, playerId: "a", name: "A", kind: "kill" },
    { round: 2, playerId: "a", name: "A", kind: "kill" },
    { round: 2, playerId: "a", name: "A", kind: "kill" },
    { round: 2, playerId: "b", name: "B", kind: "finish" },
  ];
  const all = tally(events);
  expect(all.get("a")).toMatchObject({ points: 1.6, finishes: 1, kills: 3 });
  expect(all.get("b")?.points).toBe(1);
  expect(tally(events, 2).get("a")?.points).toBe(0.4);
});

it("goes to the archive-or-restart vote after six rounds, not before", () => {
  const s = newRoundState(1, 0);
  join(s, "a", "A", 0);
  toLevelEnd(s, ["a"]);
  expect(s.phase).toBe("LEVEL_END");
});

it("calls a round too simple when everyone who ran reached the flag, and holds its card longer", () => {
  const s = twoBuilding();
  act(s, "a", "SKIPPED");
  act(s, "b", "SKIPPED");
  let t = toRun(s, 0);
  report(s, "a", "FINISHED");
  expect(tooSimple(s)).toBe(false); // B is still running
  report(s, "b", "FINISHED");
  expect(tooSimple(s)).toBe(true);
  expect(tick(s, ++t)).toEqual({ to: "RESULTS", levelDone: false, tooSimple: true });
  expect(tick(s, t + RESULTS_MS)).toBeNull(); // the stamp gets its time
  expect(tick(s, t + RESULTS_MS + STAMP_MS)?.to).toBe("BUILD");

  // someone who left does not count, and one runner left alone scores
  for (const id of ["a", "b"]) act(s, id, "SKIPPED");
  t = toRun(s, t + RESULTS_MS + STAMP_MS);
  report(s, "a", "FINISHED");
  leave(s, "b");
  expect(tooSimple(s)).toBe(false);
  expect(tick(s, ++t)).toMatchObject({ tooSimple: false });
});

it("lets a player alone score for the flag: too simple needs two runners", () => {
  const s = newRoundState(1, 0);
  join(s, "a", "A", 0);
  act(s, "a", "SKIPPED");
  let t = toRun(s, 0);
  report(s, "a", "FINISHED");
  expect(tooSimple(s)).toBe(false);
  expect(tick(s, ++t)).toEqual({ to: "RESULTS", levelDone: false, tooSimple: false });
  // three of three is still too simple
  const three = twoBuilding();
  join(three, "c", "C", 0);
  for (const id of ["a", "b", "c"]) act(three, id, "SKIPPED");
  t = toRun(three, 0);
  for (const id of ["a", "b", "c"]) report(three, id, "FINISHED");
  expect(tooSimple(three)).toBe(true);
});

it("ends the game early once someone has the points to win, at the end of that round", () => {
  const s = twoBuilding();
  act(s, "a", "SKIPPED");
  act(s, "b", "SKIPPED");
  let t = toRun(s, 0);
  report(s, "a", "FINISHED");
  report(s, "b", "DEAD");
  expect(tick(s, ++t, WIN_POINTS - 0.2)).toMatchObject({ to: "RESULTS", levelDone: false });
  expect(tick(s, t + RESULTS_MS, WIN_POINTS - 0.2)?.to).toBe("BUILD");
  for (const id of ["a", "b"]) act(s, id, "SKIPPED");
  t = toRun(s, t + RESULTS_MS);
  report(s, "a", "FINISHED");
  report(s, "b", "DEAD");
  expect(tick(s, ++t, WIN_POINTS)).toMatchObject({ to: "RESULTS", levelDone: true });
  expect(tick(s, t + RESULTS_MS, WIN_POINTS)?.to).toBe("LEVEL_END");
  expect(s.round).toBe(2);
});
