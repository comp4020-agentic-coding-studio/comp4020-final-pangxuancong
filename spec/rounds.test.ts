import { expect, it } from "vitest";
import {
  BUILD_IDLE_MS, BUILD_MAX_MS, COUNTDOWN_MS, DRAW_MS, LOCK_MS, MAX_PLAYERS, MAX_ROUNDS, RECONNECT_GRACE_MS, RESULTS_MS, RUN_IDLE_MS, type RoundState,
  SEAT_HOLD_MS, SELECT_MS, STAMP_MS, VOTE_MS, WIN_POINTS, act, claim, drawResult, join, leave, moved, newRoundState, pick, report, tick, tooSimple,
  touchBuild, unclaim, vote,
} from "../src/shared/rounds.ts";
import { type ScoreEvent, killCredit, tally } from "../src/shared/score.ts";

// The round rules (docs/GAME_LOOP.md) as a pure function of player states and
// time. Phases end when players are resolved, never on a gameplay timer; the
// AFK and idle limits only stop a walked-away player holding everyone up.

// joining and taking the next free character (a seat)
const sit = (s: RoundState, id: string, t = 0): void => {
  join(s, id, id.toUpperCase(), t);
  for (let c = 0; c < MAX_PLAYERS; c++) if (claim(s, id, c, t)) return;
};
const twoBuilding = (t = 0): RoundState => {
  const s = newRoundState(1, t);
  sit(s, "a", t);
  sit(s, "b", t);
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

it("S3: a disconnected player holds BUILD only for the reconnect grace", () => {
  const s = twoBuilding();
  act(s, "a", "PLACED");
  leave(s, "b", 1000);
  expect(tick(s, 1000 + RECONNECT_GRACE_MS - 1)).toBeNull(); // a wifi blip costs nothing
  expect(tick(s, 1000 + RECONNECT_GRACE_MS)?.to).toBe("COUNTDOWN");
});

it("keeps a dropped player's seat: back within the grace, they still build", () => {
  const s = twoBuilding();
  act(s, "a", "PLACED");
  leave(s, "b", 1000);
  tick(s, 3000);
  join(s, "b", "B", 3000);
  const b = s.players.find((p) => p.id === "b")!;
  expect(b.build).toBe("WAITING");
  expect(tick(s, 1000 + RECONNECT_GRACE_MS + 1)).toBeNull(); // b is back: BUILD waits for b
  act(s, "b", "SKIPPED");
  expect(tick(s, 20_000)?.to).toBe("COUNTDOWN");
});

it("gives each active player exactly one build action", () => {
  const s = twoBuilding();
  expect(act(s, "a", "PLACED")).toBe(true);
  expect(act(s, "a", "PLACED")).toBe(false);
  expect(act(s, "a", "SKIPPED")).toBe(false);
});

it("lets players take a seat during BUILD, and makes later ones wait for the next build", () => {
  const s = twoBuilding();
  join(s, "c", "C", 500);
  expect(s.players.find((p) => p.id === "c")?.active).toBe(false); // watching until a character is chosen
  expect(claim(s, "c", 0, 500)).toBe(false); // the Chicken is a's
  expect(claim(s, "c", 2, 500)).toBe(true);
  expect(s.players.find((p) => p.id === "c")?.active).toBe(true);
  act(s, "a", "PLACED");
  act(s, "b", "SKIPPED");
  act(s, "c", "SKIPPED");
  toRun(s, 1000);
  sit(s, "d", 5000);
  const d = s.players.find((p) => p.id === "d")!;
  expect(d.character).toBe(3); // seated...
  expect(d.active).toBe(false); // ...but this run had already started
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
  sit(s, "a", 500_000);
  // the first player into an empty BUILD gets the full window
  expect(tick(s, 500_000 + BUILD_IDLE_MS - 1)).toBeNull();
  leave(s, "a", 540_000);
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

it("S4: a disconnected runner holds RUN only for the reconnect grace", () => {
  const s = twoBuilding();
  act(s, "a", "PLACED");
  act(s, "b", "SKIPPED");
  const t = toRun(s, 0);
  report(s, "a", "DEAD");
  leave(s, "b", t);
  moved(s, "b", t);
  expect(tick(s, t + RECONNECT_GRACE_MS - 1)).toBeNull();
  expect(tick(s, t + RECONNECT_GRACE_MS)?.to).toBe("RESULTS");
  expect(s.players.find((p) => p.id === "b")?.run).toBe("DISCONNECTED");
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

it("S9: four characters are four seats; a fifth person watches and takes a seat once it is released", () => {
  const s = newRoundState(1, 0);
  for (const id of ["a", "b", "c", "d", "e"]) sit(s, id, 0);
  expect(s.players.filter((p) => p.active).map((p) => p.id)).toEqual(["a", "b", "c", "d"]);
  expect(s.players.find((p) => p.id === "e")?.character).toBeNull();
  expect(MAX_PLAYERS).toBe(4);
  for (const id of ["a", "b", "c", "d"]) act(s, id, "SKIPPED");
  let t = toRun(s, 0);
  leave(s, "b", t);
  for (const id of ["a", "c", "d"]) report(s, id, "DEAD");
  t += RECONNECT_GRACE_MS;
  tick(s, t);
  tick(s, t + RESULTS_MS);
  expect(s.phase).toBe("BUILD");
  // b's seat (the Big Dog) is held for b, so e still cannot have it
  expect(claim(s, "e", 1, t + RESULTS_MS)).toBe(false);
  t += SEAT_HOLD_MS;
  tick(s, t);
  expect(s.players.some((p) => p.id === "b")).toBe(false);
  expect(claim(s, "e", 1, t)).toBe(true);
  // meanwhile the others timed out of BUILD, so e plays from the next one
  expect(s.phase).toBe("COUNTDOWN");
  expect(s.players.find((p) => p.id === "e")).toMatchObject({ character: 1, active: false });
});

it("gives a returning player their seat, character and place back within the seat hold", () => {
  const s = twoBuilding();
  for (const id of ["a", "b"]) act(s, id, "SKIPPED");
  let t = toRun(s, 0);
  leave(s, "b", t);
  report(s, "a", "DEAD");
  t += RECONNECT_GRACE_MS;
  expect(tick(s, t)?.to).toBe("RESULTS");
  expect(tick(s, t + RESULTS_MS)?.to).toBe("BUILD");
  // still away at the next build: on the roster, and its grace is already over
  expect(s.players.find((p) => p.id === "b")).toMatchObject({ character: 1, active: true, build: "DISCONNECTED" });
  t += RESULTS_MS + 30_000;
  join(s, "b", "B", t);
  expect(s.players.find((p) => p.id === "b")).toMatchObject({ character: 1, active: true, build: "WAITING" });
});

it("chooses a map by where seated players stand: all agree, or the clock runs out after the first", () => {
  const s = newRoundState(1, 0, "SELECT");
  sit(s, "a", 0);
  sit(s, "b", 0);
  join(s, "w", "W", 0); // watching: no vote
  expect(pick(s, "w", 1, 0)).toBe(false);
  expect(s.players.every((p) => !p.active)).toBe(true); // nobody plays while choosing
  expect(tick(s, 600_000)).toBeNull(); // no clock before anyone stands under a sign
  expect(pick(s, "a", 3, 600_000)).toBe(true);
  expect(pick(s, "a", 7, 600_000)).toBe(false); // no such map
  expect(tick(s, 600_000 + SELECT_MS - 1)).toBeNull();
  expect(tick(s, 600_000 + SELECT_MS)).toEqual({ to: "BUILD", newLevel: true, archive: false, layout: 3 });
  expect(s.players.filter((p) => p.active).map((p) => p.id)).toEqual(["a", "b"]);
  expect(s.players.find((p) => p.id === "w")?.active).toBe(false);

  // everyone under the same sign: a short lock, then that map
  const all = newRoundState(1, 0, "SELECT");
  sit(all, "a", 0);
  sit(all, "b", 0);
  pick(all, "a", 2, 10);
  pick(all, "b", 2, 20);
  expect(tick(all, 20)).toBeNull();
  pick(all, "b", null, 500); // walked off again: the lock starts over
  tick(all, 600);
  pick(all, "b", 2, 1000);
  expect(tick(all, 1000)).toBeNull();
  expect(tick(all, 1000 + LOCK_MS - 1)).toBeNull();
  expect(tick(all, 1000 + LOCK_MS)).toEqual({ to: "BUILD", newLevel: true, archive: false, layout: 2 });
});

it("draws a split vote by lot, weighted by the votes", () => {
  // three for map 1 and one for map 2: map 1 three times in four
  const options = [{ layout: 1, votes: 3 }, { layout: 2, votes: 1 }];
  expect(drawResult(options, 0)).toBe(1);
  expect(drawResult(options, 0.74)).toBe(1);
  expect(drawResult(options, 0.75)).toBe(2);
  expect(drawResult(options, 0.999)).toBe(2);
  const counts = { 1: 0, 2: 0 } as Record<number, number>;
  for (let i = 0; i < 1000; i++) counts[drawResult(options, i / 1000)]++;
  expect(counts).toEqual({ 1: 750, 2: 250 });

  const s = newRoundState(1, 0, "SELECT");
  for (const id of ["a", "b", "c", "d"]) sit(s, id, 0);
  for (const id of ["a", "b", "c"]) pick(s, id, 1, 0);
  pick(s, "d", 2, 0);
  tick(s, 0);
  expect(tick(s, LOCK_MS, 0, () => 0.9)).toEqual({ to: "DRAW" });
  expect(s.draw).toEqual({ options: [{ layout: 1, votes: 3 }, { layout: 2, votes: 1 }], result: 2 });
  expect(tick(s, LOCK_MS + DRAW_MS - 1)).toBeNull(); // the draw animation plays
  expect(tick(s, LOCK_MS + DRAW_MS)).toEqual({ to: "BUILD", newLevel: true, archive: false, layout: 2 });
});

it("lets a seated player swap to a free character or give the seat up while choosing, not mid-game", () => {
  const s = newRoundState(1, 0, "SELECT");
  sit(s, "a", 0);
  sit(s, "b", 0);
  expect(claim(s, "a", 1, 0)).toBe(false); // b's
  expect(claim(s, "a", 3, 0)).toBe(true);
  expect(unclaim(s, "b")).toBe(true);
  expect(s.players.find((p) => p.id === "b")?.character).toBeNull();
  pick(s, "a", 1, 0);
  tick(s, 0);
  tick(s, LOCK_MS);
  expect(s.phase).toBe("BUILD");
  expect(claim(s, "a", 0, LOCK_MS)).toBe(false); // seated players keep their character in a game
});

it("keeps every seat's character into the next game", () => {
  const s = twoBuilding();
  const t = toLevelEnd(s, ["a", "b"]);
  vote(s, "a", "RESTART");
  vote(s, "b", "RESTART");
  expect(tick(s, t + 1)?.to).toBe("SELECT");
  expect(Object.fromEntries(s.players.map((p) => [p.id, p.character]))).toEqual({ a: 0, b: 1 });
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
  sit(s, "a", 0);
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
  leave(s, "b", t);
  t += RECONNECT_GRACE_MS;
  expect(tick(s, t)).toMatchObject({ to: "RESULTS", tooSimple: false });
});

it("lets a player alone score for the flag: too simple needs two runners", () => {
  const s = newRoundState(1, 0);
  sit(s, "a", 0);
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
