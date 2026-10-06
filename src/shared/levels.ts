// The three base courses (docs/GAME_LOOP.md). Each is passable at round 1 with
// no player pieces (checked in spec/levels.test.ts); what players build after
// that is up to them. Levels 2 and 3 follow the human's reference drawings.
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

export const LEVELS: readonly LevelDef[] = [
  {
    id: 1,
    name: "The Gaps",
    blurb: "Three gaps and a tower to climb. A good first table.",
    blocks: [
      b(0, 14, 6, 4, "crate"), // start ledge
      b(10, 14, 3, 4, "crate"),
      b(16, 12, 3, 6, "crate"),
      b(22, 9, 2, 9, "post"), // the tower
      b(27, 10, 5, 8, "crate"), // goal ledge
    ],
    fixtures: [],
    start: { col: 0, row: 10, w: 5, h: 4 },
    spawn: { x: 2 * CELL, y: 14 * CELL },
    ...goalAt(29, 10),
    decor: [],
  },
  {
    id: 2,
    name: "The Tower",
    blurb: "Stairs over spikes, a steel tower, a fan and a hanging swing.",
    blocks: [
      b(0, 17, 32, 1, "floor"),
      b(0, 13, 5, 1, "shelf"), b(0, 14, 1, 3, "post"), b(1, 15, 2, 2, "crate"), // start
      b(3, 16, 2, 1, "shelf"),
      b(6, 12, 3, 1, "shelf"),
      b(6, 16, 3, 1, "shelf"),
      b(9, 13, 4, 1, "shelf"), b(9, 14, 1, 3, "post"), // the spike shelf
      b(13, 12, 2, 1, "shelf"), b(13, 13, 1, 4, "post"),
      b(15, 10, 2, 1, "shelf"),
      b(19, 7, 1, 7, "post"), b(19, 6, 3, 1, "shelf"), // the tower and its cap
      b(18, 9, 1, 1, "peg"), b(18, 11, 1, 1, "peg"),
      b(15, 14, 6, 1, "shelf"), b(15, 15, 1, 2, "post"), b(18, 15, 2, 2, "crate"),
      b(20, 10, 3, 1, "shelf"), // the fan shelf
      b(22, 13, 4, 1, "shelf"), // the swing's frame
      b(24, 11, 3, 1, "shelf"),
      b(27, 10, 5, 1, "shelf"), b(31, 11, 1, 6, "post"), b(28, 15, 2, 2, "crate"), // goal
    ],
    // the swing hangs from the underside of its frame
    fixtures: [...spikes(12, 10, 11), fixture("fan", 20, 9, 0), fixture("moving", 22, 15, 0, 13 * CELL + 20)],
    start: { col: 0, row: 9, w: 4, h: 4 },
    spawn: { x: 2 * CELL, y: 13 * CELL },
    ...goalAt(29, 10),
    decor: [],
  },
  {
    id: 3,
    name: "The Swing",
    blurb: "A spike pit, a high frame, a swing on a rail and a windy tower.",
    blocks: [
      b(0, 17, 32, 1, "floor"),
      b(0, 13, 3, 1, "shelf"), b(0, 14, 1, 3, "post"), b(1, 15, 2, 2, "crate"), // start
      b(3, 14, 2, 1, "peg"),
      b(5, 13, 2, 1, "peg"),
      b(7, 12, 2, 1, "peg"),
      b(10, 15, 2, 1, "shelf"), b(10, 16, 1, 1, "post"),
      b(10, 11, 1, 1, "peg"),
      b(11, 9, 1, 1, "peg"),
      b(12, 8, 1, 9, "post"), b(12, 7, 3, 1, "shelf"), // the frame
      b(19, 12, 2, 1, "shelf"),
      b(21, 9, 1, 5, "post"), // the windy tower
      b(22, 10, 3, 1, "shelf"),
      b(21, 14, 4, 1, "shelf"), b(21, 15, 1, 2, "post"), b(24, 15, 1, 2, "post"), b(22, 15, 2, 2, "crate"),
      b(25, 11, 2, 1, "peg"),
      b(27, 9, 2, 1, "shelf"),
      b(28, 11, 4, 1, "shelf"), b(31, 12, 1, 5, "post"), b(29, 15, 2, 2, "crate"), // goal
    ],
    // the swing hangs from the rail
    fixtures: [...spikes(16, 6, 9), fixture("moving", 14, 13, 0, 10 * CELL), fixture("fan", 22, 9, 0), ...spikes(13, 22, 24)],
    start: { col: 0, row: 9, w: 3, h: 4 },
    spawn: { x: 1.5 * CELL, y: 13 * CELL },
    ...goalAt(30, 11),
    // the rail the swing hangs from
    decor: [{ from: [12, 10], to: [21, 10] }],
  },
];

export const levelById = (id: number | null | undefined): LevelDef => LEVELS.find((l) => l.id === id) ?? LEVELS[0];
