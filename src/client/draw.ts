// How things look. Flat shapes in wood, brass and muted colour, with a soft
// contact shadow: a toy on a desk (docs/ART_DIRECTION.md). Every function
// draws relative to (ox, oy) = the bottom-left corner of what it draws, so a
// container placed there can squash towards the ground.
import type Phaser from "phaser";
import { CELL, type ItemType } from "../shared/level.ts";

export const C = {
  paper: 0xf4efe6,
  ink: 0x2b2a28,
  inkSoft: 0x6a655d,
  wood: 0xb98a5a,
  woodLight: 0xcfa271,
  woodDark: 0x8a6440,
  woodDeep: 0x6e4f33,
  brass: 0xc9a03d,
  mustard: 0xd8aa4c,
  red: 0xa54e43,
  green: 0x5f8152,
  blue: 0x5f87b0,
};

type G = Phaser.GameObjects.Graphics;

const shadow = (g: G, x: number, y: number, w: number, h: number, r = 5): void => {
  g.fillStyle(C.ink, 0.1);
  g.fillRoundedRect(x + 3, y + 4, w, h, r);
};

export function drawBlock(g: G, x: number, y: number, w: number, h: number): void {
  shadow(g, x, y, w, h, 6);
  g.fillStyle(C.woodDark, 1);
  g.fillRoundedRect(x, y, w, h, 6);
  // a lighter top you can stand on, and faint grain below it
  g.fillStyle(C.wood, 1);
  g.fillRoundedRect(x, y, w, 12, { tl: 6, tr: 6, bl: 0, br: 0 });
  g.fillStyle(C.woodLight, 1);
  g.fillRect(x + 4, y + 2, w - 8, 2);
  g.lineStyle(1, C.woodDeep, 0.25);
  for (let gy = y + 26; gy < y + h - 6; gy += 22) g.lineBetween(x + 10, gy, x + w - 10, gy);
}

export function drawItem(g: G, type: ItemType, rot: 0 | 1, ox: number, oy: number): void {
  switch (type) {
    case "platform": {
      if (rot) {
        // a post: 20 wide, 3 cells tall, centred in its column
        const x = ox + 10, y = oy - 3 * CELL;
        shadow(g, x, y, 20, 3 * CELL);
        g.fillStyle(C.wood, 1);
        g.fillRoundedRect(x, y, 20, 3 * CELL, 5);
        g.fillStyle(C.woodDark, 1);
        g.fillRect(x + 15, y + 4, 3, 3 * CELL - 8);
        g.fillStyle(C.brass, 1);
        g.fillCircle(x + 10, y + 8, 2);
        g.fillCircle(x + 10, y + 3 * CELL - 8, 2);
      } else {
        // a plank on top of its row
        const x = ox, y = oy - CELL;
        shadow(g, x, y, 3 * CELL, 20);
        g.fillStyle(C.wood, 1);
        g.fillRoundedRect(x, y, 3 * CELL, 20, 5);
        g.fillStyle(C.woodDark, 1);
        g.fillRect(x + 4, y + 15, 3 * CELL - 8, 3);
        g.fillStyle(C.woodLight, 1);
        g.fillRect(x + 6, y + 3, 3 * CELL - 12, 2);
        g.fillStyle(C.brass, 1);
        g.fillCircle(x + 9, y + 9, 2);
        g.fillCircle(x + 3 * CELL - 9, y + 9, 2);
      }
      return;
    }
    case "spring": {
      shadow(g, ox + 3, oy - 6, 34, 6, 3);
      g.fillStyle(C.woodDark, 1);
      g.fillRoundedRect(ox + 3, oy - 6, 34, 6, 3);
      g.lineStyle(3, C.brass, 1);
      g.beginPath();
      const zig = [[10, -6], [30, -9], [10, -12], [30, -15], [10, -18]];
      g.moveTo(ox + 20, oy - 6);
      for (const [x, y] of zig) g.lineTo(ox + x, oy + y);
      g.lineTo(ox + 20, oy - 18);
      g.strokePath();
      g.fillStyle(C.mustard, 1);
      g.fillRoundedRect(ox + 4, oy - 23, 32, 6, 3);
      return;
    }
    case "spike": {
      g.fillStyle(C.ink, 0.1);
      g.fillRect(ox + 6, oy - 1, 32, 3);
      g.fillStyle(C.woodDeep, 1);
      g.fillRoundedRect(ox + 3, oy - 4, 34, 4, 2);
      g.fillStyle(C.red, 1);
      for (let i = 0; i < 3; i++) {
        const x = ox + 5 + i * 10;
        g.fillTriangle(x, oy - 4, x + 10, oy - 4, x + 5, oy - 20);
      }
      g.fillStyle(0xffffff, 0.25);
      for (let i = 0; i < 3; i++) g.fillTriangle(ox + 7 + i * 10, oy - 5, ox + 9 + i * 10, oy - 5, ox + 10 + i * 10, oy - 16);
      return;
    }
  }
}

// A small wooden figure, feet at (0, 0).
export function drawFigure(g: G, colour: number, facing: -1 | 1): void {
  g.fillStyle(C.ink, 0.12);
  g.fillEllipse(0, 1, 22, 5);
  g.fillStyle(colour, 1);
  g.fillRoundedRect(-11, -28, 22, 28, 7);
  g.fillStyle(0xffffff, 0.22);
  g.fillRoundedRect(-8, -25, 6, 12, 3);
  // eyes look where it is going
  g.fillStyle(0xffffff, 1);
  g.fillCircle(facing * 3 - 3, -19, 3.2);
  g.fillCircle(facing * 3 + 4, -19, 3.2);
  g.fillStyle(C.ink, 1);
  g.fillCircle(facing * 4 - 3, -19, 1.6);
  g.fillCircle(facing * 4 + 4, -19, 1.6);
}

export const hex = (css: string): number => Number.parseInt(css.replace("#", ""), 16);
