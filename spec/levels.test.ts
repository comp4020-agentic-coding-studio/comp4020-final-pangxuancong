import { expect, it } from "vitest";
import { COLS, ROWS, footprint, placementError } from "../src/shared/level.ts";
import { LEVELS, type LevelDef } from "../src/shared/levels.ts";

// Every base course must be passable at round 1, before anyone builds: what
// players do after that is theirs (docs/PRODUCT.md, P3), but a course that
// starts impossible is a design bug. This is a coarse search on the grid, more
// cautious than the real movement: a jump rises at most 2 cells and crosses
// at most 3, a fall crosses a little more the further it drops, and a player
// next to a wall can climb it (docs/MOVEMENT.md). Fans are ignored, and a
// moving platform's whole track counts as somewhere to stand.

function passable(level: LevelDef): boolean {
  const solid = new Set<string>();
  const deadly = new Set<string>();
  const key = (c: number, r: number): string => `${c},${r}`;
  for (const b of level.blocks) for (let c = b.col; c < b.col + b.w; c++) for (let r = b.row; r < b.row + b.h; r++) solid.add(key(c, r));
  for (const f of level.fixtures) {
    const fp = footprint(f);
    for (let c = fp.col; c < fp.col + fp.w; c++) for (let r = fp.row; r < fp.row + fp.h; r++) {
      if (f.type === "spike") deadly.add(key(c, r));
      else if (f.type === "moving") { if (r === fp.row + fp.h - 1 || f.rot === 0) solid.add(key(c, r)); }
      else solid.add(key(c, r));
    }
  }
  const isSolid = (c: number, r: number): boolean => c < 0 || c >= COLS || solid.has(key(c, r));
  const free = (c: number, r: number): boolean => r >= 0 && r < ROWS && c >= 0 && c < COLS && !solid.has(key(c, r)) && !deadly.has(key(c, r));
  const stand = (c: number, r: number): boolean => free(c, r) && r + 1 < ROWS && isSolid(c, r + 1) && !deadly.has(key(c, r + 1));
  const wall = (c: number, r: number): boolean => free(c, r) && (isSolid(c - 1, r) || isSolid(c + 1, r)) && c > 0 && c < COLS - 1;

  // Nothing solid in the way: either a straight line, or an arc up one cell
  // above the higher end, across, and down.
  const line = (c1: number, r1: number, c2: number, r2: number): boolean => {
    const steps = Math.max(Math.abs(c2 - c1), Math.abs(r2 - r1)) * 2;
    for (let i = 1; i < steps; i++) {
      const c = Math.round(c1 + ((c2 - c1) * i) / steps), r = Math.round(r1 + ((r2 - r1) * i) / steps);
      if (!free(c, r) && !(c === c2 && r === r2)) return false;
    }
    return true;
  };
  const clear = (c1: number, r1: number, c2: number, r2: number): boolean => {
    if (line(c1, r1, c2, r2)) return true;
    const apex = Math.min(r1, r2) - 1;
    if (r1 - apex > 3) return false; // higher than a jump
    for (let r = r1 - 1; r >= apex; r--) if (!free(c1, r)) return false;
    const dir = Math.sign(c2 - c1);
    for (let c = c1; c !== c2; c += dir) if (!free(c, apex)) return false;
    for (let r = apex; r <= r2; r++) if (!free(c2, r)) return false;
    return true;
  };

  const start = { c: Math.floor(level.spawn.x / 40), r: Math.floor(level.spawn.y / 40) - 1 };
  if (!stand(start.c, start.r)) throw new Error(`level ${level.id}: the spawn is not on solid ground`);
  const goal = level.goal;
  const atGoal = (c: number, r: number): boolean => c >= goal.col && c < goal.col + goal.w && r >= goal.row && r < goal.row + goal.h;

  const seen = new Set<string>([key(start.c, start.r)]);
  const queue = [start];
  while (queue.length) {
    const { c, r } = queue.shift()!;
    if (atGoal(c, r)) return true;
    const next: { c: number; r: number }[] = [];
    // jumps and falls to somewhere to stand, or onto a wall to climb
    for (let dc = -6; dc <= 6; dc++) for (let dr = -2; dr <= ROWS; dr++) {
      const c2 = c + dc, r2 = r + dr;
      if (!stand(c2, r2) && !wall(c2, r2) && !atGoal(c2, r2)) continue;
      if (!free(c2, r2)) continue;
      const reach = dr <= 0 ? 3 : 3 + Math.floor(dr / 2);
      if (Math.abs(dc) > reach) continue;
      if (!clear(c, r, c2, r2)) continue;
      next.push({ c: c2, r: r2 });
    }
    // climbing a wall you are next to
    if (wall(c, r) && free(c, r - 1)) next.push({ c, r: r - 1 });
    // stepping off a wall's top onto it
    for (const s of [-1, 1]) if (wall(c, r) && stand(c + s, r - 1) && free(c, r - 1)) next.push({ c: c + s, r: r - 1 });
    for (const n of next) {
      const k = key(n.c, n.r);
      if (seen.has(k)) continue;
      // positions in mid-air only count when hanging on a wall
      if (!stand(n.c, n.r) && !wall(n.c, n.r) && !atGoal(n.c, n.r)) continue;
      seen.add(k);
      queue.push(n);
    }
  }
  return false;
}

it("has three base courses", () => {
  expect(LEVELS.map((l) => l.id)).toEqual([1, 2, 3]);
});

for (const level of LEVELS) {
  it(`level ${level.id} (${level.name}) can be finished before anyone builds`, () => {
    expect(passable(level)).toBe(true);
  });

  it(`level ${level.id} keeps its fixtures, START and GOAL clear of its own blocks`, () => {
    // a fixture overlapping a block, or a protected zone with geometry in it, is a typo
    for (const f of level.fixtures) {
      const others = level.fixtures.filter((g) => g !== f);
      expect(placementError({ ...level, fixtures: others }, [], f), `${f.type} at ${f.col},${f.row}`).toBeNull();
    }
    const inside = (c: number, r: number, z: { col: number; row: number; w: number; h: number }) => c >= z.col && c < z.col + z.w && r >= z.row && r < z.row + z.h;
    for (const b of level.blocks) for (let c = b.col; c < b.col + b.w; c++) for (let r = b.row; r < b.row + b.h; r++) {
      expect(inside(c, r, level.start) || inside(c, r, level.goal), `block cell ${c},${r}`).toBe(false);
    }
  });
}

it("the search itself can say no: a wall from floor to ceiling blocks level 1", () => {
  const sealed = { ...LEVELS[0], blocks: [...LEVELS[0].blocks, { col: 14, row: 0, w: 1, h: ROWS, style: "post" as const }] };
  expect(passable(sealed)).toBe(false);
});
