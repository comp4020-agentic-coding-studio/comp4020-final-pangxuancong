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

// Course pieces by style. Shelves and pegs are planks on brackets: only their
// top 20 px is solid (blockBody in scene.ts), so that is all that is drawn.
export function drawCourseBlock(g: G, style: string, x: number, y: number, w: number, h: number): void {
  switch (style) {
    case "floor": {
      // a long tabletop running under the whole course, on legs
      g.fillStyle(C.ink, 0.1);
      g.fillRect(x, y + 4, w, h);
      plank(g, x, y, w, 18, C.wood);
      g.fillStyle(C.woodDark, 1);
      for (let lx = x + 60; lx < x + w; lx += 300) g.fillRect(lx, y + 18, 12, h - 18);
      g.lineStyle(1, C.woodDeep, 0.35);
      for (let sx = x + 150; sx < x + w; sx += 150) g.lineBetween(sx, y + 2, sx, y + 16);
      return;
    }
    case "shelf": {
      shadow(g, x, y, w, 20, 3);
      plank(g, x, y, w, 20);
      bolt(g, x + 7, y + 10);
      bolt(g, x + w - 7, y + 10);
      // brackets underneath, inside the cell
      if (w >= 2 * CELL) {
        bracketDown(g, x + 10, y + 20);
        bracketDown(g, x + w - 18, y + 20);
      } else bracketDown(g, x + w / 2 - 4, y + 20);
      return;
    }
    case "peg": {
      shadow(g, x + 2, y, w - 4, 16, 3);
      plank(g, x + 2, y, w - 4, 16);
      bracketDown(g, x + w / 2 - 4, y + 16);
      return;
    }
    case "post": {
      shadow(g, x, y, w, h, 2);
      g.fillStyle(C.steel, 1);
      g.fillRect(x + 6, y, w - 12, h);
      g.fillStyle(C.steelLight, 0.6);
      g.fillRect(x + 9, y + 2, 4, h - 4);
      g.fillStyle(C.steelDark, 1);
      g.fillRect(x + w - 12, y + 2, 3, h - 4);
      for (let by = y + 14; by < y + h - 6; by += 40) bolt(g, x + w / 2, by);
      return;
    }
    default:
      drawBlock(g, x, y, w, h);
  }
}

const bracketDown = (g: G, x: number, y: number): void => {
  g.fillStyle(C.woodDark, 1);
  g.fillRect(x, y, 8, 12);
  g.fillTriangle(x, y, x + 8, y, x, y + 14);
  g.fillStyle(C.steel, 1);
  g.fillRect(x + 1, y + 1, 6, 3);
};

export type Pose = "stand" | "run" | "jump" | "fall" | "wall";

const outline = (g: G): void => {
  g.lineStyle(1.8, C.ink, 1);
};

// The four characters (src/shared/characters.ts), feet at (0, 0), about 40 px
// tall, with a dark outline like the human's reference drawings. `t` drives
// the run cycle; poses tilt, tuck and stretch them.
export function drawCharacter(g: G, character: number, facing: -1 | 1, pose: Pose = "stand", t = 0): void {
  const f = facing;
  const cycle = pose === "run" ? Math.sin(t * 0.02) : 0;
  const hop = pose === "run" ? Math.abs(Math.sin(t * 0.02)) * 2 : 0;
  g.fillStyle(C.ink, 0.14);
  g.fillEllipse(0, 1, 24, 5);
  switch (character) {
    case 0: { // Chicken: tall white egg, red comb, orange beak and feet
      const lift = pose === "jump" ? -3 : 0;
      for (const side of [-1, 1]) {
        const fx = side * 4 + cycle * side * 4;
        g.lineStyle(2.4, 0xe9a23b, 1);
        g.lineBetween(side * 3, -9 + lift, fx, -1 + lift);
        g.lineBetween(fx, -1 + lift, fx + f * 4, -1 + lift);
      }
      const y = -hop + lift;
      g.fillStyle(0xfbf8f2, 1);
      g.fillRoundedRect(-10, -38 + y, 20, 30, 10);
      outline(g);
      g.strokeRoundedRect(-10, -38 + y, 20, 30, 10);
      // a wing on the far side, raised when airborne
      const wingUp = pose === "jump" || pose === "fall" ? -7 : 0;
      g.fillStyle(0xe8e2d8, 1);
      g.fillEllipse(-f * 8, -20 + y + wingUp, 10, 12);
      g.strokeEllipse(-f * 8, -20 + y + wingUp, 10, 12);
      g.fillStyle(0xd8402f, 1);
      g.fillEllipse(f * 1, -40 + y, 9, 10);
      g.strokeEllipse(f * 1, -40 + y, 9, 10);
      g.fillStyle(0xf0a63a, 1);
      g.fillTriangle(f * 7, -31 + y, f * 7, -25 + y, f * 15, -28 + y);
      g.lineStyle(1.4, C.ink, 1);
      g.strokeTriangle(f * 7, -31 + y, f * 7, -25 + y, f * 15, -28 + y);
      g.fillStyle(C.ink, 1);
      g.fillCircle(f * 4, -32 + y, 1.6);
      return;
    }
    case 1: { // Big Dog: a golden dog on four short legs, floppy ears, wagging tail
      const y = -hop;
      g.lineStyle(4, 0xa8742f, 1);
      for (const [lx, ph] of [[-8, 0], [-3, Math.PI], [4, Math.PI], [9, 0]] as const) {
        const swing = pose === "run" ? Math.sin(t * 0.02 + ph) * 3 : pose === "jump" ? -2 : 0;
        g.lineBetween(lx * f, -10 + y, lx * f + swing, -1);
      }
      const wag = Math.sin(t * 0.03) * 4;
      g.lineStyle(3, 0xc28a3c, 1);
      g.lineBetween(-f * 13, -18 + y, -f * 18, -26 + y + wag * 0.4);
      g.fillStyle(0xd9a25a, 1);
      g.fillEllipse(0, -16 + y, 30, 15);
      outline(g);
      g.strokeEllipse(0, -16 + y, 30, 15);
      g.fillStyle(0xf3d9b0, 1);
      g.fillEllipse(f * 2, -12 + y, 14, 6);
      // head, snout, nose, ear
      g.fillStyle(0xd9a25a, 1);
      g.fillCircle(f * 12, -27 + y, 9);
      outline(g);
      g.strokeCircle(f * 12, -27 + y, 9);
      g.fillStyle(0xf3d9b0, 1);
      g.fillEllipse(f * 19, -24 + y, 10, 7);
      g.strokeEllipse(f * 19, -24 + y, 10, 7);
      g.fillStyle(C.ink, 1);
      g.fillCircle(f * 23, -25 + y, 2);
      g.fillCircle(f * 14, -29 + y, 1.6);
      g.fillStyle(0x9b6a2a, 1);
      const earFlap = pose === "jump" ? -4 : pose === "fall" ? -6 : 0;
      g.fillEllipse(f * 7, -25 + y + earFlap * 0.5, 7, 13);
      g.strokeEllipse(f * 7, -25 + y + earFlap * 0.5, 7, 13);
      return;
    }
    case 2: { // Pot Horse: a green horse peeking out of a clay pot that hops along
      const bob = pose === "run" ? -Math.abs(Math.sin(t * 0.02)) * 5 : pose === "jump" ? -2 : 0;
      const tilt = pose === "run" ? Math.sin(t * 0.02) * 1.5 : 0;
      const y = bob;
      // the horse first, so the pot's rim covers its base
      g.fillStyle(0x86c932, 1);
      g.fillRoundedRect(-7 + tilt, -38 + y, 12, 22, 5);
      outline(g);
      g.strokeRoundedRect(-7 + tilt, -38 + y, 12, 22, 5);
      g.fillStyle(0x86c932, 1);
      g.fillRoundedRect(f > 0 ? -2 + tilt : -16 + tilt, -40 + y, 18, 11, 5);
      g.strokeRoundedRect(f > 0 ? -2 + tilt : -16 + tilt, -40 + y, 18, 11, 5);
      g.fillStyle(0x5e9a1c, 1);
      g.fillTriangle(-f * 3 + tilt, -38 + y, -f * 1 + tilt, -45 + y, f * 2 + tilt, -38 + y);
      g.fillStyle(C.ink, 1);
      g.fillEllipse(-f * 1 + tilt, -45 + y, 6, 4); // the black tuft
      g.fillCircle(f * 3 + tilt, -36 + y, 1.8);
      g.fillStyle(0x4e8a15, 1);
      g.fillCircle(f * 13 + tilt, -34 + y, 1.3);
      // the pot
      g.fillStyle(0xb76a36, 1);
      g.fillRoundedRect(-15, -20 + y, 30, 20, { tl: 3, tr: 3, bl: 13, br: 13 });
      outline(g);
      g.strokeRoundedRect(-15, -20 + y, 30, 20, { tl: 3, tr: 3, bl: 13, br: 13 });
      g.fillStyle(0xd8894d, 1);
      g.fillEllipse(0, -20 + y, 30, 6);
      g.strokeEllipse(0, -20 + y, 30, 6);
      g.fillStyle(0x5a3018, 1);
      g.fillEllipse(0, -20 + y, 22, 3);
      // two black hooves on the rim
      g.fillStyle(C.ink, 1);
      g.fillEllipse(-4 + f * 2, -21 + y, 6, 4);
      g.fillEllipse(6 + f * 2, -21 + y, 6, 4);
      // the little green-and-white code on the pot
      g.fillStyle(0xfbf6ea, 1);
      g.fillRect(-4, -12 + y, 8, 8);
      g.fillStyle(0x2f9a3a, 1);
      g.fillRect(-3, -11 + y, 2, 2);
      g.fillRect(1, -11 + y, 2, 2);
      g.fillRect(-1, -9 + y, 2, 2);
      g.fillRect(-3, -7 + y, 2, 2);
      g.fillRect(1, -7 + y, 2, 2);
      return;
    }
    default: { // Dabai: a round white protective suit with blue stripes and a blue mask
      const y = -hop;
      for (const side of [-1, 1]) {
        const step = pose === "run" ? cycle * side * 4 : 0;
        g.fillStyle(0xfbfbfa, 1);
        g.fillRoundedRect(side * 6 - 4 + step, -9 + y, 8, 9 - y, 3);
        outline(g);
        g.strokeRoundedRect(side * 6 - 4 + step, -9 + y, 8, 9 - y, 3);
        g.fillStyle(0x2f86d9, 1);
        g.fillRect(side * 6 - 4 + step, -4, 8, 2);
      }
      g.fillStyle(0xfbfbfa, 1);
      g.fillRoundedRect(-12, -27 + y, 24, 20, 9);
      outline(g);
      g.strokeRoundedRect(-12, -27 + y, 24, 20, 9);
      g.fillStyle(0x2f86d9, 1);
      g.fillRect(-1, -27 + y, 2.5, 20);
      g.fillRect(-12, -17 + y, 24, 2.5);
      // stubby arms, up when airborne
      const armUp = pose === "jump" || pose === "fall" ? -8 : 0;
      g.fillStyle(0xfbfbfa, 1);
      for (const side of [-1, 1]) {
        g.fillEllipse(side * 13, -18 + y + armUp, 7, 10);
        outline(g);
        g.strokeEllipse(side * 13, -18 + y + armUp, 7, 10);
      }
      // the hood, its face window and mask
      g.fillStyle(0xfbfbfa, 1);
      g.fillCircle(-f * 1, -34 + y, 11);
      outline(g);
      g.strokeCircle(-f * 1, -34 + y, 11);
      g.lineStyle(2, 0x2f86d9, 1);
      g.lineBetween(-f * 1, -45 + y, -f * 1, -40 + y);
      g.fillStyle(0xf3e1c8, 1);
      g.fillEllipse(f * 4, -34 + y, 13, 11);
      g.lineStyle(1.6, 0x2f86d9, 1);
      g.strokeEllipse(f * 4, -34 + y, 13, 11);
      g.fillStyle(0x8cc4ef, 1);
      g.fillRoundedRect(f * 4 - 6, -33 + y, 12, 6, 2);
      g.fillStyle(C.ink, 1);
      g.fillCircle(f * 4 - 2.5, -36 + y, 1.3);
      g.fillCircle(f * 4 + 2.5, -36 + y, 1.3);
      return;
    }
  }
}

export const hex = (css: string): number => Number.parseInt(css.replace("#", ""), 16);
