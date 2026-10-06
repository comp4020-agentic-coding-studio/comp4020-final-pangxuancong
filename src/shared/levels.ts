// The three base courses (docs/GAME_LOOP.md). Each is passable at round 1 with
// no player pieces (checked in spec/levels.test.ts); what players build after
// that is up to them. Levels 2 and 3 began from the human's reference drawings.
// Fixtures are pieces that belong to the course: they work like player pieces
// but cannot be demolished and score nobody.
import { CELL, type CellRect, type Item, type ItemType, type PixelRect } from "./level.ts";

export type BlockStyle = "crate" | "post" | "shelf" | "floor" | "peg";
export interface Block extends CellRect { style: BlockStyle }

export interface LevelDef {
  id: number;
  name: string;
  blurb: string;
  blocks: Block[];
  fixtures: Item[];
  start: CellRect; // nobody builds here
  goal: CellRect; // nor here
  spawn: { x: number; y: number }; // feet of the first player
  flag: { x: number; y: number }; // foot of the pole
  goalTrigger: PixelRect; // touching it finishes the run
  // purely visual: rails and ropes drawn behind the course, in cells
  decor: { from: [number, number]; to: [number, number] }[];
}

const b = (col: number, row: number, w: number, h: number, style: BlockStyle): Block => ({ col, row, w, h, style });
let n = 0;
const fixture = (type: ItemType, col: number, row: number, rot = 0, hangFrom?: number): Item => ({
  id: `fixture-${++n}`, type, col, row, rot, createdBy: "the level", createdById: "", createdRound: 0,
  ...(hangFrom === undefined ? {} : { hangFrom }),
});
const spikes = (row: number, from: number, to: number): Item[] => Array.from({ length: to - from + 1 }, (_, i) => fixture("spike", from + i, row));

// the flag stands on the cell at (col, row); the trigger is the space above it
const goalAt = (col: number, row: number): Pick<LevelDef, "goal" | "flag" | "goalTrigger"> => ({
  goal: { col: col - 1, row: row - 3, w: 3, h: 3 },
  flag: { x: (col + 0.5) * CELL, y: row * CELL },
  goalTrigger: { x: (col - 0.5) * CELL, y: (row - 2.5) * CELL, w: 2 * CELL, h: 2.5 * CELL },
});

// Each course: the original table (the human's drawings) along the bottom
// of a 48×27 world, then a second half to the right that climbs to the flag.
export const LEVELS: readonly LevelDef[] = [
  {
    id: 1,
    name: "The Gaps",
    blurb: "Gaps between crates, two towers to climb. A good first table.",
    blocks: [
      b(0, 23, 6, 4, "crate"), // start ledge
      b(10, 23, 3, 4, "crate"),
      b(16, 21, 3, 6, "crate"),
      b(22, 18, 2, 9, "post"), // the first tower
      b(27, 19, 5, 8, "crate"),
      b(34, 21, 3, 6, "crate"),
      b(39, 15, 2, 12, "post"), // the second tower
      b(43, 16, 5, 11, "crate"), // goal ledge
    ],
    fixtures: [],
    start: { col: 0, row: 19, w: 5, h: 4 },
    spawn: { x: 2 * CELL, y: 23 * CELL },
    ...goalAt(45, 16),
    decor: [],
  },
  {
    id: 2,
    name: "The Tower",
    blurb: "Stairs over spikes, a steel tower, a fan, a swing, then a taller tower.",
    blocks: [
      b(0, 26, 48, 1, "floor"),
      b(0, 22, 5, 1, "shelf"), b(0, 23, 1, 3, "post"), b(1, 24, 2, 2, "crate"), // start
      b(3, 25, 2, 1, "shelf"),
      b(6, 21, 3, 1, "shelf"),
      b(6, 25, 3, 1, "shelf"),
      b(9, 22, 4, 1, "shelf"), b(9, 23, 1, 3, "post"), // the spike shelf
      b(13, 21, 2, 1, "shelf"), b(13, 22, 1, 4, "post"),
      b(15, 19, 2, 1, "shelf"),
      b(19, 16, 1, 7, "post"), b(19, 15, 3, 1, "shelf"), // the tower and its cap
      b(18, 18, 1, 1, "peg"), b(18, 20, 1, 1, "peg"),
      b(15, 23, 6, 1, "shelf"), b(15, 24, 1, 2, "post"), b(18, 24, 2, 2, "crate"),
      b(20, 19, 3, 1, "shelf"), // the fan shelf
      b(22, 22, 4, 1, "shelf"), // the swing's frame
      b(24, 20, 3, 1, "shelf"),
      b(27, 19, 5, 1, "shelf"), b(31, 20, 1, 6, "post"), b(28, 24, 2, 2, "crate"), // the old goal
      b(33, 17, 3, 1, "shelf"), b(33, 18, 1, 8, "post"),
      b(38, 9, 2, 17, "post"), // the tall tower
      b(42, 10, 6, 1, "shelf"), b(47, 11, 1, 15, "post"), // goal
    ],
    // the swing hangs from the underside of its frame; an up-fan under the goal
    fixtures: [
      ...spikes(21, 10, 11), fixture("fan", 20, 18, 0), fixture("moving", 22, 24, 0, 22 * CELL + 20),
      ...spikes(25, 34, 36), fixture("fan", 42, 25, 3),
    ],
    start: { col: 0, row: 18, w: 4, h: 4 },
    spawn: { x: 2 * CELL, y: 22 * CELL },
    ...goalAt(45, 10),
    decor: [],
  },
  {
    id: 3,
    name: "The Swing",
    blurb: "A spike pit, a high frame, a swing on a rail, a windy tower and a lift.",
    blocks: [
      b(0, 26, 48, 1, "floor"),
      b(0, 22, 3, 1, "shelf"), b(0, 23, 1, 3, "post"), b(1, 24, 2, 2, "crate"), // start
      b(3, 23, 2, 1, "peg"),
      b(5, 22, 2, 1, "peg"),
      b(7, 21, 2, 1, "peg"),
      b(10, 24, 2, 1, "shelf"), b(10, 25, 1, 1, "post"),
      b(10, 20, 1, 1, "peg"),
      b(11, 18, 1, 1, "peg"),
      b(12, 17, 1, 9, "post"), b(12, 16, 3, 1, "shelf"), // the frame
      b(19, 21, 2, 1, "shelf"),
      b(21, 18, 1, 5, "post"), // the windy tower
      b(22, 19, 3, 1, "shelf"),
      b(21, 23, 4, 1, "shelf"), b(21, 24, 1, 2, "post"), b(24, 24, 1, 2, "post"), b(22, 24, 2, 2, "crate"),
      b(25, 20, 2, 1, "peg"),
      b(27, 18, 2, 1, "shelf"),
      b(28, 20, 4, 1, "shelf"), b(31, 21, 1, 5, "post"), b(29, 24, 2, 2, "crate"), // the old goal
      b(34, 18, 2, 1, "peg"),
      b(41, 14, 3, 1, "shelf"),
      b(44, 10, 1, 16, "post"), b(44, 9, 4, 1, "shelf"), // goal tower
    ],
    // the swing hangs from the rail; the lift rides up and down past the pit
    fixtures: [
      ...spikes(25, 6, 9), fixture("moving", 14, 22, 0, 19 * CELL), fixture("fan", 22, 18, 0), ...spikes(22, 22, 24),
      ...spikes(25, 33, 40), fixture("moving", 37, 13, 1),
    ],
    start: { col: 0, row: 18, w: 3, h: 4 },
    spawn: { x: 1.5 * CELL, y: 22 * CELL },
    ...goalAt(46, 9),
    // the rail the swing hangs from
    decor: [{ from: [12, 19], to: [21, 19] }],
  },
];

export const levelById = (id: number | null | undefined): LevelDef => LEVELS.find((l) => l.id === id) ?? LEVELS[0];
