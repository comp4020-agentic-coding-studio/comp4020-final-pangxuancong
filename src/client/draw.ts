// How things look: a wooden display box on a desk. Shelves and crates with
// grey metal brackets, steel posts, brass and muted colour, soft contact
// shadows (docs/ART_DIRECTION.md). Item functions draw relative to (ox, oy) =
// the bottom-left of the item's footprint, so a container placed there can
// squash towards the ground.
import type Phaser from "phaser";
import { CELL, FAN_DIRS, FAN_REACH, MOVING_TRAVEL, type ItemType } from "../shared/level.ts";

export const C = {
  paper: 0xf4efe6,
  paperLight: 0xfaf6ee,
  ink: 0x2b2a28,
  inkSoft: 0x6a655d,
  wood: 0xc08c58,
  woodLight: 0xd9aa72,
  woodDark: 0x8f6339,
  woodDeep: 0x6b4728,
  steel: 0x8d9194,
  steelDark: 0x5d6265,
  steelLight: 0xb5b9bb,
  brass: 0xc9a03d,
  mustard: 0xe0ae45,
  red: 0xb24a3e,
  redDark: 0x8e3a31,
  green: 0x6f8f5c,
  greenDark: 0x52703f,
  blue: 0x5f87b0,
  blueDark: 0x46698c,
};

type G = Phaser.GameObjects.Graphics;

const shadow = (g: G, x: number, y: number, w: number, h: number, r = 4): void => {
  g.fillStyle(C.ink, 0.12);
  g.fillRoundedRect(x + 3, y + 5, w, h, r);
};

const bolt = (g: G, x: number, y: number): void => {
  g.fillStyle(C.steelDark, 1);
  g.fillCircle(x, y, 2.2);
  g.fillStyle(C.steelLight, 1);
  g.fillCircle(x - 0.6, y - 0.6, 0.9);
};

// a grey L-bracket on a corner, with two bolts
const bracket = (g: G, x: number, y: number, flipX: boolean): void => {
  const s = flipX ? -1 : 1;
  g.fillStyle(C.steel, 1);
  g.fillRect(flipX ? x - 14 : x, y, 14, 5);
  g.fillRect(flipX ? x - 5 : x, y, 5, 14);
  bolt(g, x + s * 9, y + 2.5);
  bolt(g, x + s * 2.5, y + 9);
};

// a plank with grain, used everywhere wood shows
export function plank(g: G, x: number, y: number, w: number, h: number, colour = C.wood): void {
  g.fillStyle(colour, 1);
  g.fillRoundedRect(x, y, w, h, Math.min(4, h / 2));
  g.fillStyle(C.woodLight, 0.7);
  g.fillRect(x + 3, y + 2, w - 6, 2);
  g.fillStyle(C.woodDark, 0.9);
  g.fillRect(x + 2, y + h - 3, w - 4, 3);
  g.lineStyle(1, C.woodDeep, 0.18);
  for (let i = 1; i < Math.floor(w / 46) + 1; i++) {
    const gx = x + (w / (Math.floor(w / 46) + 1)) * i;
    g.lineBetween(gx, y + 4, gx + 6, y + h - 4);
  }
}

// Base geometry. Wide pieces are crates under a shelf; tall thin pieces are
// steel posts with a wooden cap.
export function drawBlock(g: G, x: number, y: number, w: number, h: number): void {
  shadow(g, x, y, w, h, 3);
  if (h > w * 2.5) {
    g.fillStyle(C.steel, 1);
    g.fillRect(x + 4, y + 10, w - 8, h - 10);
    g.fillStyle(C.steelLight, 0.6);
    g.fillRect(x + 7, y + 12, 4, h - 14);
    g.fillStyle(C.steelDark, 1);
    g.fillRect(x + w - 10, y + 12, 3, h - 14);
    for (let by = y + 36; by < y + h - 10; by += 44) {
      g.fillStyle(C.steelDark, 0.8);
      g.fillRect(x + 4, by, w - 8, 3);
      bolt(g, x + 12, by + 10);
      bolt(g, x + w - 12, by + 10);
    }
    plank(g, x - 4, y, w + 8, 14);
    return;
  }
  // the crate body: framed boards
  g.fillStyle(C.woodDark, 1);
  g.fillRect(x + 2, y + 10, w - 4, h - 10);
  g.fillStyle(C.wood, 1);
  g.fillRect(x + 8, y + 18, w - 16, h - 24);
  g.lineStyle(1.5, C.woodDark, 0.55);
  for (let bx = x + 8 + 28; bx < x + w - 10; bx += 28) g.lineBetween(bx, y + 18, bx, y + h - 6);
  g.lineStyle(3, C.woodDark, 0.7);
  if (h > 70) g.lineBetween(x + 10, y + h - 8, x + w - 10, y + 20);
  // the shelf on top, overhanging a little, held by brackets
  plank(g, x - 4, y, w + 8, 14);
  bracket(g, x + 2, y + 14, false);
  bracket(g, x + w - 2, y + 14, true);
}

export function drawItem(g: G, type: ItemType, rot: number, ox: number, oy: number): void {
  switch (type) {
    case "platform": {
      if (rot) {
        const x = ox + 10, y = oy - 3 * CELL;
        shadow(g, x, y, 20, 3 * CELL);
        g.fillStyle(C.steel, 1);
        g.fillRect(x + 2, y + 4, 16, 3 * CELL - 8);
        g.fillStyle(C.steelLight, 0.6);
        g.fillRect(x + 4, y + 6, 3, 3 * CELL - 12);
        bolt(g, x + 10, y + 12);
        bolt(g, x + 10, y + 3 * CELL - 12);
        plank(g, x - 2, y, 24, 8);
        plank(g, x - 2, y + 3 * CELL - 8, 24, 8);
      } else {
        const x = ox, y = oy - CELL;
        shadow(g, x, y, 3 * CELL, 20);
        plank(g, x, y, 3 * CELL, 20);
        bolt(g, x + 8, y + 9);
        bolt(g, x + 3 * CELL - 8, y + 9);
      }
      return;
    }
    case "spring": {
      shadow(g, ox + 3, oy - 6, 34, 6, 3);
      g.fillStyle(C.woodDeep, 1);
      g.fillRoundedRect(ox + 3, oy - 6, 34, 6, 3);
      g.lineStyle(3.5, C.brass, 1);
      g.beginPath();
      g.moveTo(ox + 20, oy - 6);
      for (const [x, y] of [[9, -8], [31, -11], [9, -14], [31, -17], [9, -20]]) g.lineTo(ox + x, oy + y);
      g.lineTo(ox + 20, oy - 21);
      g.strokePath();
      g.fillStyle(C.mustard, 1);
      g.fillRoundedRect(ox + 3, oy - 25, 34, 6, 3);
      g.fillStyle(0xffffff, 0.3);
      g.fillRect(ox + 6, oy - 24, 26, 1.5);
      return;
    }
    case "spike": {
      g.fillStyle(C.ink, 0.12);
      g.fillRect(ox + 6, oy - 1, 32, 3);
      g.fillStyle(C.woodDeep, 1);
      g.fillRoundedRect(ox + 2, oy - 5, 36, 5, 2);
      for (let i = 0; i < 3; i++) {
        const x = ox + 3 + i * 11.3;
        g.fillStyle(C.red, 1);
        g.fillTriangle(x, oy - 5, x + 11, oy - 5, x + 5.5, oy - 24);
        g.fillStyle(C.redDark, 1);
        g.fillTriangle(x + 5.5, oy - 5, x + 11, oy - 5, x + 5.5, oy - 24);
      }
      return;
    }
    case "fan": {
      const cx = ox + CELL / 2, cy = oy - CELL / 2;
      const d = FAN_DIRS[rot % 4];
      shadow(g, ox + 6, oy - 34, 28, 28, 6);
      // a steel stand behind, the hub in front; blades are drawn by drawFanBlades
      g.fillStyle(C.steelDark, 1);
      g.fillRoundedRect(ox + 6, oy - 34, 28, 28, 6);
      g.fillStyle(C.steel, 1);
      g.fillRoundedRect(ox + 8, oy - 32, 24, 24, 5);
      // a nub on the side the wind comes out of
      g.fillStyle(C.blueDark, 1);
      g.fillCircle(cx + d.x * 13, cy + d.y * 13, 3);
      return;
    }
    case "moving": {
      // the track, then the plank at its start; the plank is moved by the scene
      if (rot) {
        g.fillStyle(C.steelDark, 0.55);
        g.fillRect(ox + CELL - 2, oy - 4 * CELL + 4, 4, 4 * CELL - 8);
      } else {
        g.fillStyle(C.steelDark, 0.55);
        g.fillRect(ox + 6, oy - CELL + 8, 5 * CELL - 12, 4);
      }
      return;
    }
  }
}

// The fan's blades and wind, drawn around (cx, cy); `spin` is an angle.
export function drawFanBlades(g: G, rot: number, cx: number, cy: number, spin: number, wind: number): void {
  const d = FAN_DIRS[rot % 4];
  if (wind > 0) {
    // soft airflow lines along the zone
    g.lineStyle(2, C.blue, 0.28 * wind);
    const reach = FAN_REACH * CELL;
    for (let i = -1; i <= 1; i++) {
      const off = i * 10;
      const phase = (spin * 6 + i * 13) % 30;
      for (let s = 26 + phase; s < reach + 10; s += 30) {
        const ax = cx + d.x * s + (d.y !== 0 ? off : 0), ay = cy + d.y * s + (d.x !== 0 ? off : 0);
        g.lineBetween(ax, ay, ax + d.x * 12, ay + d.y * 12);
      }
    }
  }
  g.fillStyle(C.blue, 1);
  for (let i = 0; i < 4; i++) {
    const a = spin + (i * Math.PI) / 2;
    const bx = cx + Math.cos(a) * 7, by = cy + Math.sin(a) * 7;
    g.fillEllipse(bx, by, 14, 7);
  }
  g.fillStyle(C.brass, 1);
  g.fillCircle(cx, cy, 3.5);
}

// The moving platform's plank, its top-left at (x, y).
export function drawMovingPlank(g: G, x: number, y: number): void {
  shadow(g, x, y, 2 * CELL, 20);
  g.fillStyle(C.greenDark, 1);
  g.fillRoundedRect(x, y, 2 * CELL, 20, 4);
  g.fillStyle(C.green, 1);
  g.fillRoundedRect(x + 2, y + 2, 2 * CELL - 4, 13, 3);
  g.fillStyle(0xffffff, 0.25);
  g.fillRect(x + 5, y + 4, 2 * CELL - 10, 2);
  bolt(g, x + 7, y + 10);
  bolt(g, x + 2 * CELL - 7, y + 10);
}

// little arrows showing which way a moving platform travels, for previews
export function drawTravel(g: G, rot: number, ox: number, oy: number, colour: number, alpha: number): void {
  g.lineStyle(2, colour, alpha);
  if (rot) {
    const x = ox + CELL;
    g.lineBetween(x, oy - 4 * CELL + 30, x, oy - 4 * CELL + 30 + MOVING_TRAVEL);
  } else {
    const y = oy - CELL / 2 + 8;
    g.lineBetween(ox + 2 * CELL / 2, y, ox + CELL + MOVING_TRAVEL, y);
  }
}

export type Pose = "stand" | "run" | "jump" | "fall" | "wall";

// A small jointed figure, feet at (0, 0), about 30 px tall. `t` drives the
// running cycle.
export function drawFigure(g: G, colour: number, facing: -1 | 1, pose: Pose = "stand", t = 0): void {
  const dark = shade(colour, 0.72);
  g.fillStyle(C.ink, 0.13);
  g.fillEllipse(0, 1, 20, 4);
  const swing = pose === "run" ? Math.sin(t * 0.018) : 0;
  const hipY = -12;
  const shoulderY = -22;
  // legs
  const leg = (dir: number, colourLeg: number): void => {
    let fx = 0, kneeX = 0, fy = 0;
    if (pose === "run") { fx = dir * swing * 8; kneeX = fx * 0.4 + facing * 2; }
    else if (pose === "jump") { fx = dir * 4 + facing * 2; kneeX = facing * 4; fy = -3; }
    else if (pose === "fall") { fx = dir * 6; kneeX = dir * 3; }
    else if (pose === "wall") { fx = -facing * 3 + dir * 2; kneeX = -facing * 1; fy = dir > 0 ? -4 : 0; }
    else { fx = dir * 3.5; kneeX = dir * 2; }
    g.lineStyle(4.5, colourLeg, 1);
    g.beginPath();
    g.moveTo(dir * 2, hipY);
    g.lineTo(kneeX + dir * 1.5, hipY + 6 + fy / 2);
    g.lineTo(fx, fy - 1);
    g.strokePath();
  };
  leg(-1, dark);
  // body
  g.lineStyle(7, colour, 1);
  g.lineBetween(0, hipY, facing * 1, shoulderY);
  leg(1, colour);
  // arms
  const arm = (dir: number, c: number): void => {
    let hx = 0, hy = 0;
    if (pose === "run") { hx = -dir * swing * 7 + facing * 2; hy = shoulderY + 9; }
    else if (pose === "jump") { hx = dir * 6 + facing * 3; hy = shoulderY - 8; }
    else if (pose === "fall") { hx = dir * 9; hy = shoulderY - 4; }
    else if (pose === "wall") { hx = -facing * 8; hy = shoulderY - 6 + dir * 3; }
    else { hx = dir * 4; hy = shoulderY + 10; }
    g.lineStyle(4, c, 1);
    g.lineBetween(facing * 1 + dir, shoulderY + 1, hx, hy);
  };
  arm(-1, dark);
  arm(1, colour);
  // head, looking where it goes
  g.fillStyle(colour, 1);
  g.fillCircle(facing * 1.5, -29, 6);
  g.fillStyle(0xffffff, 0.3);
  g.fillCircle(facing * 1.5 - 2, -31, 2);
  g.fillStyle(C.ink, 0.85);
  g.fillCircle(facing * 4, -29.5, 1.2);
}

export const hex = (css: string): number => Number.parseInt(css.replace("#", ""), 16);

function shade(c: number, k: number): number {
  const r = Math.round(((c >> 16) & 255) * k), gr = Math.round(((c >> 8) & 255) * k), b = Math.round((c & 255) * k);
  return (r << 16) | (gr << 8) | b;
}
