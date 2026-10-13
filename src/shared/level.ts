// The grid, the pieces and the placement rules. The three base courses live in
// levels.ts. Validation here is technical only (docs/ITEMS.md): bounds,
// protected START and GOAL, and overlap. It never asks whether the level can
// still be finished.
import type { LevelDef } from "./levels.ts";

export const CELL = 40;
export const COLS = 48;
export const ROWS = 27;
export const WIDTH = COLS * CELL; // 1920
export const HEIGHT = ROWS * CELL; // 1080
// the camera's view of it, at zoom 1; RUN follows your own player
export const VIEW_W = 1280;
export const VIEW_H = 720;
// below this a player has fallen out of the world
export const DEATH_Y = HEIGHT + 40;

export interface CellRect { col: number; row: number; w: number; h: number }
export interface PixelRect { x: number; y: number; w: number; h: number }

export const ITEM_TYPES = ["platform", "spring", "spike", "fan", "moving", "launcher"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];
export type BuildChoice = ItemType | "bomb";

// rot: platform and moving platform 0 horizontal / 1 vertical; fan blows and
// launcher fires 0 right, 1 down, 2 left, 3 up; springs and spikes are always 0
export interface Item {
  id: string;
  type: ItemType;
  col: number;
  row: number;
  rot: number;
  createdBy: string; // display name, shown on hover
  createdById: string; // who scores when this spike kills someone else
  createdRound: number;
  // course swings only: the height (px) the plank hangs from, drawn as ropes
  hangFrom?: number;
}

export interface Proposal { type: ItemType; col: number; row: number; rot: number }
type Placed = Pick<Item, "type" | "col" | "row" | "rot">;

export const ROTATIONS: Record<ItemType, number> = { platform: 2, spring: 1, spike: 1, fan: 4, moving: 2, launcher: 4 };

export const footprint = (p: Placed): CellRect => {
  if (p.type === "platform") return p.rot ? { col: p.col, row: p.row, w: 1, h: 3 } : { col: p.col, row: p.row, w: 3, h: 1 };
  // a moving platform owns its whole track
  if (p.type === "moving") return p.rot ? { col: p.col, row: p.row, w: 2, h: 4 } : { col: p.col, row: p.row, w: 5, h: 1 };
  return { col: p.col, row: p.row, w: 1, h: 1 };
};

// Moving platforms slide along their track on a fixed cycle from the start of
// the run, the same on every client.
export const MOVING_PERIOD_MS = 6000; // slow enough to read and step onto
export const MOVING_TRAVEL = 3 * CELL;
export function movingOffset(p: Placed, runMs: number): { dx: number; dy: number } {
  const k = (1 - Math.cos((2 * Math.PI * runMs) / MOVING_PERIOD_MS)) / 2;
  return p.rot ? { dx: 0, dy: k * MOVING_TRAVEL } : { dx: k * MOVING_TRAVEL, dy: 0 };
}
// its velocity in px/s at that moment, the derivative of movingOffset
export function movingVelocity(p: Placed, runMs: number): { vx: number; vy: number } {
  const w = (2 * Math.PI) / MOVING_PERIOD_MS;
  const v = (Math.sin(w * runMs) / 2) * w * 1000 * MOVING_TRAVEL;
  return p.rot ? { vx: 0, vy: v } : { vx: v, vy: 0 };
}

// A fan pushes along its direction across the next four cells.
export const FAN_REACH = 4;
export const FAN_DIRS = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }] as const;
export function fanZone(p: Placed): PixelRect {
  const d = FAN_DIRS[p.rot % 4];
  const x = p.col * CELL, y = p.row * CELL, reach = FAN_REACH * CELL;
  if (d.x === 1) return { x: x + CELL, y, w: reach, h: CELL };
  if (d.x === -1) return { x: x - reach, y, w: reach, h: CELL };
  if (d.y === 1) return { x, y: y + CELL, w: CELL, h: reach };
  return { x, y: y - reach, w: CELL, h: reach };
}

// The solid or lethal part inside the footprint, in pixels.
// for a moving platform: its plank at the start of the track
export function body(p: Placed): PixelRect {
  const x = p.col * CELL;
  const y = p.row * CELL;
  switch (p.type) {
    case "platform":
      return p.rot ? { x: x + 10, y, w: 20, h: 3 * CELL } : { x, y, w: 3 * CELL, h: 20 };
    case "spring": // its pad is the top
      return { x: x + 4, y: y + 17, w: 32, h: 23 };
    case "spike": // a little smaller than drawn, so grazing a tip is forgiven
      return { x: x + 8, y: y + 25, w: 24, h: 15 };
    case "fan": // the housing is solid; the wind is fanZone()
      return { x: x + 6, y: y + 6, w: 28, h: 28 };
    case "moving":
      return { x, y, w: 2 * CELL, h: 20 };
    case "launcher": // the barrel housing is solid
      return { x: x + 4, y: y + 4, w: 32, h: 32 };
  }
}

// A launcher fires one shot a second from the start of the run, the same on
// every client. A shot flies straight until it meets anything solid or the
// edge of the world, and vanishes; a player it meets is knocked out of the
// level.
export const LAUNCH_INTERVAL_MS = 1000;
export const SHOT_SPEED = 300; // px/s: slower than a run, so it can be dodged
export const SHOT_RADIUS = 7;
export const SHOT_KNOCKBACK = { x: 900, y: -520 }; // px/s, along the shot and up

export interface Shot { launcherId: string; x: number; y: number; firedAt: number }

// Where a shot leaves the barrel, and its direction.
export function muzzle(p: Placed): { x: number; y: number; dx: number; dy: number } {
  const d = FAN_DIRS[p.rot % 4];
  const cx = (p.col + 0.5) * CELL, cy = (p.row + 0.5) * CELL;
  return { x: cx + d.x * (CELL / 2 + SHOT_RADIUS), y: cy + d.y * (CELL / 2 + SHOT_RADIUS), dx: d.x, dy: d.y };
}

// How far a shot travels before it hits something: the first solid rectangle
// or the edge of the world along its line. Computed once when it is fired.
export function shotRange(p: Placed, solids: readonly PixelRect[]): number {
  const m = muzzle(p);
  const edge = m.dx > 0 ? WIDTH - m.x : m.dx < 0 ? m.x : m.dy > 0 ? HEIGHT - m.y : m.y;
  let range = Math.max(0, edge);
  const r = SHOT_RADIUS;
  for (const s of solids) {
    if (m.dx !== 0) {
      if (m.y + r <= s.y || m.y - r >= s.y + s.h) continue;
      const near = m.dx > 0 ? s.x - (m.x + r) : m.x - r - (s.x + s.w);
      if (near >= -r) range = Math.min(range, Math.max(0, near));
    } else {
      if (m.x + r <= s.x || m.x - r >= s.x + s.w) continue;
      const near = m.dy > 0 ? s.y - (m.y + r) : m.y - r - (s.y + s.h);
      if (near >= -r) range = Math.min(range, Math.max(0, near));
    }
  }
  return range;
}

// The shots in the air at a moment of the run, for a launcher with that range.
export function shotsAt(p: Placed & { id: string }, range: number, runMs: number): Shot[] {
  const out: Shot[] = [];
  const m = muzzle(p);
  const life = (range / SHOT_SPEED) * 1000;
  for (let k = Math.max(0, Math.ceil((runMs - life) / LAUNCH_INTERVAL_MS)); k * LAUNCH_INTERVAL_MS <= runMs; k++) {
    const firedAt = k * LAUNCH_INTERVAL_MS;
    const d = ((runMs - firedAt) / 1000) * SHOT_SPEED;
    if (d > range) continue;
    out.push({ launcherId: p.id, x: m.x + m.dx * d, y: m.y + m.dy * d, firedAt });
  }
  return out;
}

export const cellToPixels = (r: CellRect): PixelRect => ({ x: r.col * CELL, y: r.row * CELL, w: r.w * CELL, h: r.h * CELL });

const overlaps = (a: CellRect, b: CellRect): boolean =>
  a.col < b.col + b.w && b.col < a.col + a.w && a.row < b.row + b.h && b.row < a.row + a.h;

export const isItemType = (v: unknown): v is ItemType => typeof v === "string" && (ITEM_TYPES as readonly string[]).includes(v);

// null when the placement is allowed, otherwise a short reason for the player
export function placementError(level: LevelDef, items: readonly Item[], p: unknown): string | null {
  if (typeof p !== "object" || p === null) return "nothing to place";
  const { type, col, row, rot } = p as Record<string, unknown>;
  if (!isItemType(type)) return "unknown piece";
  if (!Number.isInteger(col) || !Number.isInteger(row)) return "not on the grid";
  if (!Number.isInteger(rot) || (rot as number) < 0 || (rot as number) >= ROTATIONS[type]) return "bad rotation";
  const f = footprint({ type, col: col as number, row: row as number, rot: rot as number });
  if (f.col < 0 || f.row < 0 || f.col + f.w > COLS || f.row + f.h > ROWS) return "outside the level";
  if (overlaps(f, level.start)) return "the start must stay clear";
  if (overlaps(f, level.goal)) return "the flag must stay clear";
  if (level.blocks.some((b) => overlaps(f, b))) return "that space is solid";
  if (level.fixtures.some((i) => overlaps(f, footprint(i)))) return "that is part of the level";
  if (items.some((i) => overlaps(f, footprint(i)))) return "another piece is there";
  return null;
}

// The Bomb only ever targets player-placed items. START, GOAL, base geometry,
// the level's own fixtures and world bounds are not in `items`, so they can
// never be named here.
export function demolitionError(items: readonly Item[], targetId: unknown): string | null {
  if (typeof targetId !== "string" || !items.some((i) => i.id === targetId)) return "nothing there to demolish";
  return null;
}
