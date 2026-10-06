// The level: a fixed base course on a grid, plus whatever players have placed.
// Validation here is technical only (docs/ITEMS.md): bounds, protected START
// and GOAL, and overlap. It never asks whether the level can still be finished.

export const CELL = 40;
export const COLS = 32;
export const ROWS = 18;
export const WIDTH = COLS * CELL; // 1280
export const HEIGHT = ROWS * CELL; // 720
// below this a player has fallen out of the world
export const DEATH_Y = HEIGHT + 40;

export interface CellRect { col: number; row: number; w: number; h: number }
export interface PixelRect { x: number; y: number; w: number; h: number }

// Base geometry. Round 1 is passable: run, jump, one wall climb up the tower.
export const BASE_BLOCKS: readonly CellRect[] = [
  { col: 0, row: 14, w: 6, h: 4 }, // start ledge
  { col: 10, row: 14, w: 3, h: 4 },
  { col: 16, row: 12, w: 3, h: 6 },
  { col: 22, row: 9, w: 2, h: 9 }, // the tower
  { col: 27, row: 10, w: 5, h: 8 }, // goal ledge
];

// Nobody may build here. START covers where players spawn; GOAL covers the flag.
export const START_ZONE: CellRect = { col: 0, row: 10, w: 5, h: 4 };
export const GOAL_ZONE: CellRect = { col: 28, row: 7, w: 3, h: 3 };
export const SPAWN = { x: 2 * CELL, y: 14 * CELL }; // feet on the start ledge
export const FLAG = { x: 29.5 * CELL, y: 10 * CELL }; // foot of the pole
// touching this finishes the run
export const GOAL_TRIGGER: PixelRect = { x: 28.5 * CELL, y: 7.5 * CELL, w: 2 * CELL, h: 2.5 * CELL };

export const ITEM_TYPES = ["platform", "spring", "spike"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];
export type BuildChoice = ItemType | "bomb";

export interface Item {
  id: string;
  type: ItemType;
  col: number;
  row: number;
  rot: 0 | 1; // platforms only: 0 horizontal, 1 vertical
  createdBy: string; // display name, shown on hover
  createdRound: number;
}

export interface Proposal { type: ItemType; col: number; row: number; rot: 0 | 1 }

export const footprint = (p: Pick<Item, "type" | "col" | "row" | "rot">): CellRect => {
  if (p.type === "platform") return p.rot ? { col: p.col, row: p.row, w: 1, h: 3 } : { col: p.col, row: p.row, w: 3, h: 1 };
  return { col: p.col, row: p.row, w: 1, h: 1 };
};

// The solid or lethal part inside the footprint, in pixels.
export function body(p: Pick<Item, "type" | "col" | "row" | "rot">): PixelRect {
  const x = p.col * CELL;
  const y = p.row * CELL;
  switch (p.type) {
    case "platform":
      return p.rot ? { x: x + 10, y, w: 20, h: 3 * CELL } : { x, y, w: 3 * CELL, h: 20 };
    case "spring": // its pad is the top
      return { x: x + 4, y: y + 17, w: 32, h: 23 };
    case "spike": // a little smaller than drawn, so grazing a tip is forgiven
      return { x: x + 8, y: y + 25, w: 24, h: 15 };
  }
}

export const cellToPixels = (r: CellRect): PixelRect => ({ x: r.col * CELL, y: r.row * CELL, w: r.w * CELL, h: r.h * CELL });

const overlaps = (a: CellRect, b: CellRect): boolean =>
  a.col < b.col + b.w && b.col < a.col + a.w && a.row < b.row + b.h && b.row < a.row + a.h;

export const isItemType = (v: unknown): v is ItemType => typeof v === "string" && (ITEM_TYPES as readonly string[]).includes(v);

// null when the placement is allowed, otherwise a short reason for the player
export function placementError(items: readonly Item[], p: unknown): string | null {
  if (typeof p !== "object" || p === null) return "nothing to place";
  const { type, col, row, rot } = p as Record<string, unknown>;
  if (!isItemType(type)) return "unknown piece";
  if (!Number.isInteger(col) || !Number.isInteger(row)) return "not on the grid";
  if (rot !== 0 && rot !== 1) return "bad rotation";
  if (rot === 1 && type !== "platform") return "only platforms turn";
  const f = footprint({ type, col: col as number, row: row as number, rot });
  if (f.col < 0 || f.row < 0 || f.col + f.w > COLS || f.row + f.h > ROWS) return "outside the level";
  if (overlaps(f, START_ZONE)) return "the start must stay clear";
  if (overlaps(f, GOAL_ZONE)) return "the flag must stay clear";
  if (BASE_BLOCKS.some((b) => overlaps(f, b))) return "that space is solid";
  if (items.some((i) => overlaps(f, footprint(i)))) return "another piece is there";
  return null;
}

// The Bomb only ever targets player-placed items. START, GOAL, base geometry
// and world bounds have no item id, so they can never be named here.
export function demolitionError(items: readonly Item[], targetId: unknown): string | null {
  if (typeof targetId !== "string" || !items.some((i) => i.id === targetId)) return "nothing there to demolish";
  return null;
}
