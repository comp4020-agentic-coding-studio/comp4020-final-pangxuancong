import { expect, it } from "vitest";
import { BASE_BLOCKS, GOAL_ZONE, type Item, START_ZONE, demolitionError, placementError } from "../src/shared/level.ts";
import { MOVEMENT, canWallJump, wallJumpVelocity } from "../src/shared/movement.ts";

// Placement is checked for technical validity only (docs/ITEMS.md): never for
// whether the level can still be finished.

const item = (over: Partial<Item>): Item => ({ id: "x", type: "platform", col: 8, row: 6, rot: 0, createdBy: "A", createdRound: 1, ...over });

it("S6: refuses START, GOAL, solid ground, other pieces and the outside", () => {
  expect(placementError([], { type: "spike", col: START_ZONE.col + 1, row: START_ZONE.row + 1, rot: 0 })).toMatch(/start/);
  expect(placementError([], { type: "platform", col: GOAL_ZONE.col - 1, row: GOAL_ZONE.row, rot: 0 })).toMatch(/flag/);
  const b = BASE_BLOCKS[1];
  expect(placementError([], { type: "spring", col: b.col, row: b.row, rot: 0 })).toMatch(/solid/);
  expect(placementError([item({})], { type: "spike", col: 9, row: 6, rot: 0 })).toMatch(/another/);
  expect(placementError([], { type: "platform", col: 30, row: 2, rot: 0 })).toMatch(/outside/);
  expect(placementError([], { type: "platform", col: 8, row: 16, rot: 1 })).toMatch(/outside/);
  for (const bad of [null, {}, { type: "cannon", col: 8, row: 6, rot: 0 }, { type: "spike", col: 8.5, row: 6, rot: 0 }, { type: "spike", col: 8, row: 6, rot: 1 }]) {
    expect(placementError([], bad)).not.toBeNull();
  }
});

it("S6: accepts a legal piece, including one that makes the level harder", () => {
  expect(placementError([], { type: "platform", col: 8, row: 6, rot: 0 })).toBeNull();
  expect(placementError([], { type: "platform", col: 8, row: 6, rot: 1 })).toBeNull();
  // a spike right at the edge of the start ledge: nasty, and allowed
  expect(placementError([], { type: "spike", col: START_ZONE.col + START_ZONE.w, row: START_ZONE.row + START_ZONE.h - 1, rot: 0 })).toBeNull();
  // a wall across the gap in front of the tower: allowed, no path check
  expect(placementError([], { type: "platform", col: 20, row: 6, rot: 1 })).toBeNull();
});

it("S5: the Bomb can name any placed piece, and nothing else", () => {
  const items = [item({ id: "mine", createdBy: "A" }), item({ id: "theirs", col: 12, createdBy: "B" })];
  expect(demolitionError(items, "theirs")).toBeNull();
  expect(demolitionError(items, "mine")).toBeNull();
  // START, GOAL, base geometry and bounds have no item id to name
  for (const target of ["start", "goal", "base-0", "", null, 3]) expect(demolitionError(items, target)).not.toBeNull();
});

it("allows a wall jump while touching, and briefly after leaving", () => {
  expect(canWallJump(1000, true, null)).toBe(true);
  expect(canWallJump(1000, false, 1000 - MOVEMENT.wallJumpGraceMs)).toBe(true);
  expect(canWallJump(1000, false, 1000 - MOVEMENT.wallJumpGraceMs - 1)).toBe(false);
  expect(canWallJump(1000, false, null)).toBe(false);
});

it("kicks away from the wall, and mostly up when pressing into it", () => {
  const off = wallJumpVelocity(1, false);
  const climb = wallJumpVelocity(1, true);
  expect(off.vx).toBeLessThan(0);
  expect(off.vy).toBeLessThan(0);
  expect(Math.abs(climb.vx)).toBeLessThan(Math.abs(off.vx));
  expect(wallJumpVelocity(-1, false).vx).toBeGreaterThan(0);
});
