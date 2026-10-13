// The level, drawn and played. The server decides what is in the level and
// whose turn it is; this scene draws that, lets this player preview a piece,
// and simulates only this player's own character (docs/MOVEMENT.md). Other
// characters are interpolated from their snapshots and never collide.
import Phaser from "phaser";
import {
  CELL, COLS, DEATH_Y, FAN_DIRS, HEIGHT, type Item, type PixelRect, type Proposal, ROWS,
  LAUNCH_INTERVAL_MS, SHOT_KNOCKBACK, SHOT_RADIUS, SHOT_SPEED, VIEW_H, VIEW_W, WIDTH, body, muzzle, shotRange, shotsAt, cellToPixels, fanZone, footprint, movingOffset, movingVelocity, placementError,
} from "../shared/level.ts";
import { type Block, type LevelDef, levelById } from "../shared/levels.ts";
import { MOVEMENT, type Side, canWallJump, wallJumpVelocity } from "../shared/movement.ts";
import type { Phase } from "../shared/rounds.ts";
import { C, type Pose, drawCharacter, drawCourseBlock, drawFanBlades, drawItem, drawMovingPlank, drawShot, drawTravel, hex } from "./draw.ts";
import { bus, iCanBuild, store } from "./state.ts";

const POSE_EVERY_MS = 80; // ~12 a second
const INTERP_DELAY_MS = 110;
// characters are drawn a little wider than their collision box, to read at a glance
const FIGURE_SCALE = 1.3;
const MOVING_PULL = 6; // per second: how hard a moving platform is pulled back onto its track
// shelves and pegs are planks: only their top is solid
const blockBody = (b: Block): PixelRect => {
  const r = cellToPixels(b);
  return b.style === "shelf" ? { ...r, h: 20 } : b.style === "peg" ? { ...r, h: 16 } : r;
};
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

interface PlacedView {
  item: Item;
  fixed: boolean; // part of the course: never demolished
  view: Phaser.GameObjects.Container;
  solid: Phaser.GameObjects.Rectangle;
  // fans: blades and wind, redrawn every frame
  blades?: Phaser.GameObjects.Graphics;
  // moving platforms: the plank, moved every frame
  plank?: Phaser.GameObjects.Graphics;
}

interface Remote {
  view: Phaser.GameObjects.Container;
  figure: Phaser.GameObjects.Graphics;
  colour: number;
  character: number;
  lastVy: number;
  lastDustAt: number;
  facing: -1 | 1;
  samples: { t: number; x: number; y: number; vx: number; vy: number; facing: -1 | 1 }[];
  gone: boolean;
}

interface Local {
  rect: Phaser.GameObjects.Rectangle; // the physics body
  view: Phaser.GameObjects.Container;
  figure: Phaser.GameObjects.Graphics;
  colour: number;
  character: number;
  facing: -1 | 1;
  lastDustAt: number;
  fallSpeed: number; // how hard the last fall was, for the landing dust
  lastWallTouchAt: number | null;
  lastWallSide: Side;
  wasOnGround: boolean;
  live: boolean; // simulating; false once dead or finished
  lastPoseAt: number;
  // knocked out of the level by a launcher: tumbling, no input, no collisions
  flung: { by: string; at: number } | null;
}

const inside = (r: PixelRect, x: number, y: number): boolean => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
const NAMES: Record<string, string> = { platform: "Platform", spring: "Spring", spike: "Spike", fan: "Fan", moving: "Moving platform", launcher: "Launcher" };

export class LevelScene extends Phaser.Scene {
  private solids!: Phaser.Physics.Arcade.StaticGroup;
  private springs!: Phaser.Physics.Arcade.StaticGroup;
  private spikes!: Phaser.Physics.Arcade.StaticGroup;
  private movers!: Phaser.Physics.Arcade.Group;
  private goal!: Phaser.GameObjects.Zone;
  private placed = new Map<string, PlacedView>();
  private remotes = new Map<string, Remote>();
  private local: Local | null = null;
  private buildLayer!: Phaser.GameObjects.Graphics; // grid and protected zones, BUILD only
  private traceLayer!: Phaser.GameObjects.Graphics;
  private ghost!: Phaser.GameObjects.Graphics;
  private ghostPiece!: Phaser.GameObjects.Graphics; // my preview's piece, drawn translucent
  private previewLabels = new Map<string, Phaser.GameObjects.Text>();
  private flag!: Phaser.GameObjects.Container;
  private keys!: Record<"left" | "right" | "up" | "down" | "a" | "d" | "w" | "s" | "e" | "space", Phaser.Input.Keyboard.Key>;
  // the camera: following your own runner, someone you watch, or free
  private followTarget: Phaser.GameObjects.Components.Transform | null = null;
  private watching: string | null = null; // out of the run: whose run we follow
  private watchLostAt = 0;
  private freeLook = false;
  private banner!: Phaser.GameObjects.Text;
  // runners outside the view, as badges on its edge; deaths flash there too
  private pointers = new Map<string, Phaser.GameObjects.Container>();
  private flashes: { x: number; y: number; at: number; view: Phaser.GameObjects.Container }[] = [];
  private dragFrom: { x: number; y: number } | null = null;
  private pointerInside = false;
  private lastView = "";
  private phase: Phase | null = null;
  private runStartedAt = 0; // performance.now() when RUN began, for moving platforms
  private spin = 0; // fan blades
  private course: LevelDef = levelById(1);
  private courseLayout = 0; // which course is built, 0 for none yet
  private courseObjects: Phaser.GameObjects.GameObject[] = [];
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private shotLayer!: Phaser.GameObjects.Graphics;
  private shotRanges = new Map<string, number>(); // launcher id: how far its shots fly
  private spent = new Set<string>(); // shots that hit a player or a moving plank this run
  private lastVolley = new Map<string, number>(); // launcher id: last shot fired, for the puff
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  hoverInfo = "";
  // set by main.ts; called once the scene exists
  onReady = (): void => {};

  constructor() {
    super("level");
  }

  create(): void {
    this.physics.world.setBounds(0, -600, WIDTH, HEIGHT + 1200);
    this.physics.world.setBoundsCollision(true, true, false, false);
    this.solids = this.physics.add.staticGroup();
    this.springs = this.physics.add.staticGroup();
    this.spikes = this.physics.add.staticGroup();
    this.movers = this.physics.add.group({ allowGravity: false, immovable: true });

    this.buildLayer = this.add.graphics().setDepth(0);
    this.traceLayer = this.add.graphics().setDepth(1);
    this.drawBackdrop();
    this.buildCourse(levelById(1));
    // particles: soft dust for feet, little sparks for springs and wall kicks
    const dot = this.make.graphics({ x: 0, y: 0 }, false);
    dot.fillStyle(0xffffff, 1);
    dot.fillCircle(5, 5, 5);
    dot.generateTexture("dot", 10, 10);
    dot.destroy();
    this.dust = this.add.particles(0, 0, "dot", {
      lifespan: { min: 280, max: 520 }, speed: { min: 18, max: 70 }, scale: { start: 0.55, end: 0 },
      alpha: { start: 0.55, end: 0 }, tint: [0xd8cbb2, 0xc9b896, 0xe6dccb], gravityY: -30, emitting: false,
    }).setDepth(14);
    this.sparks = this.add.particles(0, 0, "dot", {
      lifespan: { min: 250, max: 450 }, speed: { min: 60, max: 150 }, scale: { start: 0.35, end: 0 },
      alpha: { start: 0.9, end: 0 }, gravityY: 300, emitting: false,
    }).setDepth(16);
    this.shotLayer = this.add.graphics().setDepth(13);
    this.ghost = this.add.graphics().setDepth(20);
    this.ghostPiece = this.add.graphics().setDepth(20);

    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      left: kb.addKey(K.LEFT), right: kb.addKey(K.RIGHT), up: kb.addKey(K.UP), down: kb.addKey(K.DOWN),
      a: kb.addKey(K.A), d: kb.addKey(K.D), w: kb.addKey(K.W), s: kb.addKey(K.S), e: kb.addKey(K.E), space: kb.addKey(K.SPACE),
    };

    // the world is larger than the view: the camera never leaves it
    this.cameras.main.setBounds(0, 0, WIDTH, HEIGHT);
    this.lookAtStart();
    this.input.mouse?.disableContextMenu();
    // the wheel zooms the level, not the page under it
    this.game.canvas.addEventListener("wheel", (e) => e.preventDefault(), { passive: false });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      this.pointerInside = true;
      if (this.dragFrom) {
        // right or middle drag pans the free camera
        const cam = this.cameras.main;
        if (this.lookFreely()) cam.setScroll(cam.scrollX - (p.x - this.dragFrom.x) / cam.zoom, cam.scrollY - (p.y - this.dragFrom.y) / cam.zoom);
        this.dragFrom = { x: p.x, y: p.y };
        return;
      }
      this.pointerMoved(p.worldX, p.worldY);
    });
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown() || p.middleButtonDown()) this.dragFrom = { x: p.x, y: p.y };
      else this.pointerDown(p.worldX, p.worldY);
    });
    this.input.on("pointerup", () => (this.dragFrom = null));
    this.input.on("wheel", (p: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => this.zoomAt(p, dy));
    this.banner = this.add.text(0, 0, "", {
      fontFamily: "system-ui, sans-serif", fontSize: "16px", color: "#4a4640", backgroundColor: "#faf6eee6", padding: { x: 12, y: 6 },
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(40).setVisible(false);
    this.input.on("gameout", () => {
      this.pointerInside = false;
      this.dragFrom = null;
      this.pointerMoved(-1, -1);
    });

    this.onReady();
  }

  // ---------- the camera ----------

  // zoomed right out the whole world fits the view
  private readonly minZoom = Math.min(VIEW_W / WIDTH, VIEW_H / HEIGHT);

  private lookAtStart(): void {
    const cam = this.cameras.main;
    cam.setZoom(1);
    cam.centerOn(this.course.spawn.x + VIEW_W / 4, this.course.spawn.y - VIEW_H / 4);
  }

  // the wheel zooms the free camera, keeping the point under the pointer still
  private zoomAt(p: Phaser.Input.Pointer, dy: number): void {
    if (!this.lookFreely()) return;
    const cam = this.cameras.main;
    const zoom = Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1 / 0.9), this.minZoom, 1.25);
    const before = cam.getWorldPoint(p.x, p.y);
    cam.setZoom(zoom);
    cam.preRender();
    const after = cam.getWorldPoint(p.x, p.y);
    cam.setScroll(cam.scrollX + before.x - after.x, cam.scrollY + before.y - after.y);
  }

  // RUN (and the countdown before it) follows your own runner at full size.
  // Out of the run (dead, finished, watching) it follows someone still
  // running, until you look around yourself; otherwise the camera is yours.
  private steerCamera(dt: number): void {
    const cam = this.cameras.main;
    const k = this.keys;
    const dx = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
    const dy = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
    let target: Phaser.GameObjects.Components.Transform | null = null;
    if (this.runningMyself()) target = this.local!.rect;
    else if (this.phase === "RUN") {
      if (Phaser.Input.Keyboard.JustDown(k.e)) this.watchNext();
      if (dx || dy) this.freeLook = true;
      if (!this.freeLook) target = this.watchTarget();
    }
    if (target !== this.followTarget) {
      this.followTarget = target;
      if (target) {
        cam.zoomTo(1, reducedMotion.matches ? 0 : 300);
        cam.startFollow(target, false, 0.12, 0.12);
      } else cam.stopFollow();
    }
    if (!target && (dx || dy)) {
      const speed = (700 * dt) / cam.zoom;
      cam.setScroll(cam.scrollX + dx * speed, cam.scrollY + dy * speed);
    }
    this.drawBanner();
    // the view moved under a still pointer: what it points at changed
    const view = `${cam.scrollX.toFixed(1)},${cam.scrollY.toFixed(1)},${cam.zoom.toFixed(3)}`;
    if (view !== this.lastView) {
      this.lastView = view;
      if (this.pointerInside && !this.dragFrom && this.phase === "BUILD") {
        const p = this.input.activePointer;
        p.updateWorldPoint(cam);
        this.pointerMoved(p.worldX, p.worldY);
      }
    }
  }

  private runningMyself(): boolean {
    return !!this.local && (this.phase === "COUNTDOWN" || (this.phase === "RUN" && (this.local.live || !!this.local.flung)));
  }

  // Manual camera input. Refused while you run; while watching, it lets go.
  private lookFreely(): boolean {
    if (this.runningMyself()) return false;
    if (this.followTarget) {
      this.followTarget = null;
      this.cameras.main.stopFollow();
    }
    if (this.phase === "RUN") this.freeLook = true;
    return true;
  }

  // other players still running, in roster order, that we can see
  private runnersToWatch(): string[] {
    return (store.snap?.players ?? [])
      .filter((p) => p.id !== store.me && p.active && p.run === "RUNNING")
      .map((p) => p.id)
      .filter((id) => {
        const r = this.remotes.get(id);
        return !!r && !r.gone && r.samples.length > 0;
      });
  }

  private watchTarget(): Phaser.GameObjects.Components.Transform | null {
    const runners = this.runnersToWatch();
    if (this.watching && runners.includes(this.watching)) return this.remotes.get(this.watching)!.view;
    // they just died or finished: stay a moment to see it, then move on
    const now = performance.now();
    if (this.watching) {
      if (!this.watchLostAt) this.watchLostAt = now;
      if (now - this.watchLostAt < 1000) return null;
    }
    this.watching = runners[0] ?? null;
    this.watchLostAt = 0;
    return this.watching ? this.remotes.get(this.watching)!.view : null;
  }

  watchNext(id?: string): void {
    if (this.runningMyself() || this.phase !== "RUN") return;
    const runners = this.runnersToWatch();
    if (runners.length === 0) return;
    this.watching = id && runners.includes(id) ? id : runners[(runners.indexOf(this.watching ?? "") + 1) % runners.length];
    this.watchLostAt = 0;
    this.freeLook = false;
  }

  private drawBanner(): void {
    let text = "";
    if (this.phase === "RUN" && !this.runningMyself()) {
      const name = (id: string): string => store.snap?.players.find((p) => p.id === id)?.name ?? "";
      const runners = this.runnersToWatch();
      if (this.freeLook) text = runners.length ? "Looking around  ·  E: watch a runner" : "";
      else if (this.watching && runners.includes(this.watching)) {
        text = `Watching ${name(this.watching)}` + (runners.length > 1 ? "  ·  E: next runner" : "") + "  ·  arrows: look around";
      }
    }
    this.banner.setVisible(text !== "");
    if (text !== this.banner.text) this.banner.setText(text);
    this.pin(this.banner, VIEW_W / 2, 10);
  }

  // Place a screen-fixed object (scroll factor 0) at a point of the view, the
  // same size at any zoom: the camera scales it about the view's centre.
  private pin(o: Phaser.GameObjects.Components.Transform, sx: number, sy: number): void {
    const z = this.cameras.main.zoom;
    o.setPosition(VIEW_W / 2 + (sx - VIEW_W / 2) / z, VIEW_H / 2 + (sy - VIEW_H / 2) / z);
    o.setScale(1 / z);
  }

  // Where the edge badge for a world point goes, or null when it is in view.
  private edgePoint(wx: number, wy: number): { x: number; y: number; angle: number } | null {
    const cam = this.cameras.main;
    const v = cam.worldView;
    const sx = (wx - v.x) * cam.zoom, sy = (wy - v.y) * cam.zoom;
    const inset = 34;
    if (sx >= 0 && sx <= VIEW_W && sy >= 0 && sy <= VIEW_H) return null;
    const dx = sx - VIEW_W / 2, dy = sy - VIEW_H / 2;
    const t = Math.min((VIEW_W / 2 - inset) / Math.abs(dx || 1e-6), (VIEW_H / 2 - inset) / Math.abs(dy || 1e-6));
    return { x: VIEW_W / 2 + dx * t, y: VIEW_H / 2 + dy * t, angle: Math.atan2(dy, dx) };
  }

  private makeBadge(id: string, dead: boolean): Phaser.GameObjects.Container {
    const colour = this.colourOf(id);
    const ring = this.add.graphics();
    ring.fillStyle(C.paperLight, 0.96);
    ring.fillCircle(0, 0, 17);
    ring.lineStyle(3, dead ? C.red : colour, 1);
    ring.strokeCircle(0, 0, 17);
    const arrow = this.add.triangle(25, 0, 0, -6, 9, 0, 0, 6, dead ? C.red : colour).setOrigin(0, 0.5);
    const head = this.add.graphics().setScale(0.55);
    drawCharacter(head, this.characterOf(id), 1);
    head.setPosition(0, 13);
    const parts: Phaser.GameObjects.GameObject[] = [ring, arrow, head];
    if (dead) {
      const x = this.add.graphics();
      x.lineStyle(4, C.red, 1);
      x.lineBetween(-9, -9, 9, 9);
      x.lineBetween(9, -9, -9, 9);
      parts.push(x);
    } else {
      const name = store.snap?.players.find((p) => p.id === id)?.name ?? "";
      parts.push(this.add.text(0, 21, name, { fontFamily: "system-ui, sans-serif", fontSize: "10px", color: "#4a4640" }).setOrigin(0.5, 0));
    }
    const c = this.add.container(0, 0, parts).setScrollFactor(0).setDepth(38).setData("arrow", arrow);
    if (!dead) {
      // click a badge to watch that runner
      c.setSize(40, 40).setInteractive({ useHandCursor: true });
      c.on("pointerdown", (p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
        if (p.rightButtonDown()) return;
        e.stopPropagation();
        this.watchNext(id);
      });
    }
    return c;
  }

  private drawPointers(): void {
    const live = new Set<string>();
    if (this.phase === "RUN" || this.phase === "COUNTDOWN") {
      for (const id of this.runnersToWatch()) {
        const r = this.remotes.get(id)!;
        const at = this.edgePoint(r.view.x, r.view.y - 20);
        if (!at) continue;
        live.add(id);
        let c = this.pointers.get(id);
        if (!c) {
          c = this.makeBadge(id, false);
          this.pointers.set(id, c);
        }
        this.pin(c, at.x, at.y);
        (c.getData("arrow") as Phaser.GameObjects.Triangle).setRotation(at.angle).setPosition(Math.cos(at.angle) * 21, Math.sin(at.angle) * 21);
      }
    }
    for (const [id, c] of this.pointers) {
      if (live.has(id)) continue;
      c.destroy();
      this.pointers.delete(id);
    }
    const now = performance.now();
    this.flashes = this.flashes.filter((f) => {
      const at = this.edgePoint(f.x, f.y);
      const age = now - f.at;
      if (!at || age > 1600 || this.phase !== "RUN") {
        f.view.destroy();
        return false;
      }
      this.pin(f.view, at.x, at.y);
      (f.view.getData("arrow") as Phaser.GameObjects.Triangle).setRotation(at.angle).setPosition(Math.cos(at.angle) * 21, Math.sin(at.angle) * 21);
      f.view.setAlpha(age < 1000 ? 1 : 1 - (age - 1000) / 600);
      return true;
    });
  }

  // ---------- the fixed course ----------

  private drawBackdrop(): void {
    // the back of the display box: soft vertical boards, and a dark fall-off
    // at the bottom so any gap reads as somewhere you can fall
    const back = this.add.graphics().setDepth(-2);
    back.fillStyle(C.paperLight, 1);
    back.fillRect(0, 0, WIDTH, HEIGHT);
    back.lineStyle(1, C.woodDark, 0.06);
    for (let x = 160; x < WIDTH; x += 160) back.lineBetween(x, 0, x, HEIGHT);
    back.fillStyle(C.ink, 0.035);
    back.fillRect(0, 0, WIDTH, 10);
    for (let i = 0; i < 6; i++) {
      back.fillStyle(C.ink, 0.035 * (i + 1));
      back.fillRect(0, HEIGHT - 6 * (6 - i), WIDTH, 6);
    }
  }

  // Everything that belongs to one course: blocks, signs, the flag, the goal.
  // Built again when the game moves to a different course.
  private buildCourse(def: LevelDef): void {
    for (const o of this.courseObjects) o.destroy();
    this.courseObjects = [];
    this.course = def;
    this.courseLayout = def.id;
    const keep = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.courseObjects.push(o);
      return o;
    };

    const decor = keep(this.add.graphics().setDepth(3));
    decor.lineStyle(3, C.steelDark, 0.8);
    for (const d of def.decor) decor.lineBetween(d.from[0] * CELL, d.from[1] * CELL, d.to[0] * CELL, d.to[1] * CELL);

    const g = keep(this.add.graphics().setDepth(5));
    // posts behind shelves, floor last so it sits in front of legs
    const order = ["post", "crate", "peg", "shelf", "floor"];
    for (const blk of [...def.blocks].sort((a, b) => order.indexOf(a.style) - order.indexOf(b.style))) {
      const r = cellToPixels(blk);
      drawCourseBlock(g, blk.style, r.x, r.y, r.w, r.h);
      const solid = blockBody(blk);
      keep(this.addSolid(this.solids, solid.x, solid.y, solid.w, solid.h));
    }

    // START: a small painted sign by the spawn
    const { spawn, flag } = def;
    const sign = keep(this.add.graphics().setDepth(4));
    sign.fillStyle(C.woodDeep, 1);
    sign.fillRect(spawn.x + 30, spawn.y - 40, 4, 40);
    sign.fillStyle(C.woodLight, 1);
    sign.lineStyle(2, C.woodDeep, 1);
    sign.fillRoundedRect(spawn.x, spawn.y - 66, 64, 26, 3);
    sign.strokeRoundedRect(spawn.x, spawn.y - 66, 64, 26, 3);
    keep(this.add.text(spawn.x + 32, spawn.y - 53, "START", { fontFamily: "Georgia, serif", fontSize: "14px", fontStyle: "bold", color: "#4a3420" })
      .setOrigin(0.5).setDepth(4));

    // GOAL: a brass pole and a red cloth flag that stirs, and a small sign
    const pole = keep(this.add.graphics().setDepth(6));
    pole.fillStyle(C.ink, 0.12);
    pole.fillEllipse(flag.x + 2, flag.y + 1, 26, 5);
    pole.fillStyle(C.woodDeep, 1);
    pole.fillRoundedRect(flag.x - 10, flag.y - 6, 20, 6, 2);
    pole.fillStyle(C.brass, 1);
    pole.fillRect(flag.x - 2, flag.y - 96, 4, 92);
    pole.fillCircle(flag.x, flag.y - 98, 4);
    const cloth = this.add.graphics();
    cloth.fillStyle(C.red, 1);
    cloth.fillTriangle(0, 0, 0, 32, 48, 14);
    cloth.fillStyle(C.redDark, 1);
    cloth.fillTriangle(0, 18, 0, 32, 30, 22);
    this.flag = keep(this.add.container(flag.x + 2, flag.y - 94, [cloth]).setDepth(6));
    if (!reducedMotion.matches) this.tweens.add({ targets: this.flag, scaleX: 0.86, duration: 900, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    pole.fillStyle(C.woodLight, 1);
    pole.lineStyle(2, C.woodDeep, 1);
    pole.fillRoundedRect(flag.x - 58, flag.y - 34, 50, 22, 3);
    pole.strokeRoundedRect(flag.x - 58, flag.y - 34, 50, 22, 3);
    keep(this.add.text(flag.x - 33, flag.y - 23, "GOAL", { fontFamily: "Georgia, serif", fontSize: "12px", fontStyle: "bold", color: "#4a3420" }).setOrigin(0.5).setDepth(6));

    const t = def.goalTrigger;
    this.goal = keep(this.add.zone(t.x + t.w / 2, t.y + t.h / 2, t.w, t.h));
    this.physics.add.existing(this.goal, true);
  }

  private addSolid(group: Phaser.Physics.Arcade.StaticGroup, x: number, y: number, w: number, h: number): Phaser.GameObjects.Rectangle {
    const r = this.add.rectangle(x + w / 2, y + h / 2, w, h).setVisible(false);
    this.physics.add.existing(r, true);
    group.add(r);
    return r;
  }

  // ---------- following the server ----------

  applySnapshot(): void {
    const snap = store.snap;
    if (!snap) return;
    if (snap.layout !== this.courseLayout) {
      this.clearCharacters();
      this.buildCourse(levelById(snap.layout));
      this.lookAtStart();
    }
    // the course's own pieces work exactly like placed ones
    this.syncItems([...this.course.fixtures, ...snap.items]);
    this.measureShots();
    if (snap.phase !== this.phase) this.enterPhase(snap.phase, snap.phaseElapsedMs);
    this.syncPlayers();
    this.drawBuildLayer();
  }

  private enterPhase(phase: Phase, elapsedMs: number): void {
    const before = this.phase;
    this.phase = phase;
    if (phase === "BUILD" || phase === "LEVEL_END") this.clearCharacters();
    if (phase === "COUNTDOWN" || (phase === "RUN" && before !== "COUNTDOWN")) this.placeAtStart(phase === "RUN");
    if (phase === "RUN") {
      this.spent.clear();
      this.lastVolley.clear();
      this.watching = null;
      this.freeLook = false;
      this.runStartedAt = performance.now() - elapsedMs;
      this.release();
    }
    this.ghost.clear();
    this.ghostPiece.clear();
    for (const l of this.previewLabels.values()) l.destroy();
    this.previewLabels.clear();
  }

  private amRunning(): boolean {
    return store.snap?.players.find((p) => p.id === store.me)?.run === "RUNNING";
  }

  private syncItems(items: Item[]): void {
    const ids = new Set(items.map((i) => i.id));
    for (const [id, pv] of this.placed) {
      if (ids.has(id)) continue;
      // demolished: a small pop, then gone
      this.placed.delete(id);
      pv.solid.destroy();
      pv.blades?.destroy();
      const views: Phaser.GameObjects.GameObject[] = [pv.view, ...(pv.plank ? [pv.plank] : [])];
      const f = footprint(pv.item);
      this.puff((f.col + f.w / 2) * CELL, (f.row + f.h / 2) * CELL, C.woodDark);
      if (reducedMotion.matches) views.forEach((v) => v.destroy());
      else this.tweens.add({ targets: views, alpha: 0, duration: 240, ease: "Quad.in", onComplete: () => views.forEach((v) => v.destroy()) });
    }
    for (const item of items) {
      if (this.placed.has(item.id)) continue;
      const f = footprint(item);
      const g = this.add.graphics();
      drawItem(g, item.type, item.rot, 0, 0);
      const view = this.add.container(f.col * CELL, (f.row + f.h) * CELL, [g]).setDepth(item.type === "spike" ? 9 : 8);
      const b = body(item);
      let solid: Phaser.GameObjects.Rectangle;
      let plank: Phaser.GameObjects.Graphics | undefined;
      if (item.type === "moving") {
        solid = this.add.rectangle(b.x + b.w / 2, b.y + b.h / 2, b.w, b.h).setVisible(false);
        this.physics.add.existing(solid);
        this.movers.add(solid);
        const rb = solid.body as Phaser.Physics.Arcade.Body;
        rb.setAllowGravity(false).setImmovable(true);
        rb.friction.set(1, 0); // riders are carried along
        plank = this.add.graphics().setDepth(8);
      } else {
        const group = item.type === "spring" ? this.springs : item.type === "spike" ? this.spikes : this.solids;
        solid = this.addSolid(group, b.x, b.y, b.w, b.h);
      }
      const blades = item.type === "fan" ? this.add.graphics().setDepth(9) : undefined;
      this.placed.set(item.id, { item, view, solid, blades, plank, fixed: item.id.startsWith("fixture-") });
      // newly committed while we watch: it settles into place
      if (this.phase && !reducedMotion.matches && !item.id.startsWith("fixture-")) {
        view.y -= 14;
        view.alpha = 0.3;
        this.tweens.add({ targets: view, y: view.y + 14, alpha: 1, duration: 280, ease: "Back.out" });
      }
    }
  }

  // Static things a shot stops at: the course and every piece but moving planks.
  private shotSolids(): PixelRect[] {
    const out = this.course.blocks.map(blockBody);
    for (const pv of this.placed.values()) if (pv.item.type !== "moving") out.push(body(pv.item));
    return out;
  }

  private measureShots(): void {
    this.shotRanges.clear();
    const solids = this.shotSolids();
    for (const pv of this.placed.values()) if (pv.item.type === "launcher") this.shotRanges.set(pv.item.id, shotRange(pv.item, solids));
  }

  private drawBuildLayer(): void {
    const g = this.buildLayer;
    const t = this.traceLayer;
    g.clear();
    t.clear();
    const snap = store.snap;
    if (snap?.phase !== "BUILD") return;
    // a faint grid of dots: only while building
    g.fillStyle(C.ink, 0.13);
    for (let c = 1; c < COLS; c++) for (let r = 1; r < ROWS; r++) g.fillCircle(c * CELL, r * CELL, 1.2);
    // protected areas, shown only while relevant
    for (const z of [this.course.start, this.course.goal]) {
      const r = cellToPixels(z);
      g.fillStyle(C.green, 0.07);
      g.fillRoundedRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4, 8);
      g.lineStyle(1.5, C.green, 0.4);
      g.strokeRoundedRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4, 8);
    }
    // where people fell last run
    t.lineStyle(2.5, C.ink, 0.5);
    for (const { x, y } of snap.traces) {
      const cy = Math.min(y, HEIGHT - 12);
      t.lineBetween(x - 6, cy - 6, x + 6, cy + 6);
      t.lineBetween(x - 6, cy + 6, x + 6, cy - 6);
    }
  }

  // ---------- characters ----------

  private characterOf(id: string): number {
    return store.snap?.players.find((q) => q.id === id)?.character ?? 0;
  }

  private colourOf(id: string): number {
    const p = store.snap?.players.find((q) => q.id === id);
    return p ? hex(p.colour) : C.inkSoft;
  }

  // Everyone starts at START, nudged apart a little so all are visible.
  private spawnFor(id: string): { x: number; y: number } {
    const active = (store.snap?.players ?? []).filter((p) => p.active);
    const i = Math.max(0, active.findIndex((p) => p.id === id));
    return { x: this.course.spawn.x - 28 + i * 18, y: this.course.spawn.y };
  }

  private placeAtStart(live: boolean): void {
    this.clearCharacters();
    const snap = store.snap!;
    for (const p of snap.players) {
      if (!p.active || p.run !== "RUNNING") continue;
      const at = this.spawnFor(p.id);
      if (p.id === store.me) this.createLocal(at.x, at.y, live);
      else {
        const r = this.ensureRemote(p.id);
        r.samples = [{ t: performance.now(), x: at.x, y: at.y, vx: 0, vy: 0, facing: 1 }];
        r.view.setPosition(at.x, at.y);
      }
    }
  }

  private createLocal(x: number, y: number, live: boolean): void {
    const colour = this.colourOf(store.me);
    const character = this.characterOf(store.me);
    const rect = this.add.rectangle(x, y - 14, 20, 28).setVisible(false);
    this.physics.add.existing(rect);
    const b = rect.body as Phaser.Physics.Arcade.Body;
    b.setCollideWorldBounds(true);
    b.setMaxVelocity(1000, MOVEMENT.maxFallSpeed);
    b.setAllowGravity(live);
    const figure = this.add.graphics().setScale(FIGURE_SCALE);
    drawCharacter(figure, character, 1);
    // a small marker so you can find yourself among several
    const you = this.add.triangle(0, -64, 0, 0, 10, 0, 5, 7, colour).setOrigin(0.5);
    const label = this.add.text(0, -75, "You", { fontFamily: "system-ui, sans-serif", fontSize: "11px", fontStyle: "bold", color: "#4a4640" }).setOrigin(0.5);
    const view = this.add.container(x, y, [figure, you, label]).setDepth(15);
    this.local = { rect, view, figure, colour, character, facing: 1, lastDustAt: 0, fallSpeed: 0, lastWallTouchAt: null, lastWallSide: 1, wasOnGround: false, live, lastPoseAt: 0, flung: null };
    this.physics.add.collider(rect, this.solids);
    this.physics.add.collider(rect, this.movers);
    this.physics.add.collider(rect, this.springs, (_p, s) => this.bounce(s as Phaser.GameObjects.Rectangle));
    this.physics.add.overlap(rect, this.spikes, (_p, s) => this.die(false, this.itemFor(s as Phaser.GameObjects.Rectangle)?.id));
    this.physics.add.overlap(rect, this.goal, () => this.finish());
  }

  private itemFor(solid: Phaser.GameObjects.Rectangle): Item | undefined {
    for (const pv of this.placed.values()) if (pv.solid === solid) return pv.item;
    return undefined;
  }

  private ensureRemote(id: string): Remote {
    let r = this.remotes.get(id);
    if (r) return r;
    const colour = this.colourOf(id);
    const character = this.characterOf(id);
    const figure = this.add.graphics().setScale(FIGURE_SCALE);
    drawCharacter(figure, character, 1);
    const name = store.snap?.players.find((p) => p.id === id)?.name ?? "";
    const label = this.add.text(0, -64, name, { fontFamily: "system-ui, sans-serif", fontSize: "11px", color: "#6a655d" }).setOrigin(0.5);
    const view = this.add.container(0, 0, [figure, label]).setDepth(12).setAlpha(0.92);
    r = { view, figure, colour, character, lastVy: 0, lastDustAt: 0, facing: 1, samples: [], gone: false };
    this.remotes.set(id, r);
    return r;
  }

  private syncPlayers(): void {
    const snap = store.snap!;
    if (snap.phase !== "RUN" && snap.phase !== "RESULTS") return;
    for (const p of snap.players) {
      if (p.id === store.me) {
        // the server may end my run (an idle tab); stop simulating if so
        if (this.local?.live && p.run !== "RUNNING") {
          if (p.run === "DEAD") this.die(true);
          else this.local.live = false;
        }
        continue;
      }
      const r = this.remotes.get(p.id);
      if (!r || r.gone) continue;
      if (p.run === "DEAD" || p.run === "DISCONNECTED") {
        r.gone = true;
        this.puff(r.view.x, r.view.y - 14, r.colour);
        if (p.run === "DEAD") this.flashes.push({ x: r.view.x, y: r.view.y - 20, at: performance.now(), view: this.makeBadge(p.id, true) });
        r.view.destroy();
        this.remotes.delete(p.id);
      } else if (p.run === "FINISHED") {
        r.gone = true;
        this.tweens.add({ targets: r.view, alpha: 0.5, duration: 400 });
      }
    }
  }

  onRemotePose(id: string, x: number, y: number, vx: number, vy: number, facing: -1 | 1): void {
    if (this.phase !== "RUN") return;
    const p = store.snap?.players.find((q) => q.id === id);
    if (!p || p.run !== "RUNNING") return;
    const r = this.ensureRemote(id);
    r.samples.push({ t: performance.now(), x, y, vx, vy, facing });
    if (r.samples.length > 20) r.samples.shift();
  }

  private clearCharacters(): void {
    if (this.local) {
      this.local.rect.destroy();
      this.local.view.destroy();
      this.local = null;
    }
    for (const r of this.remotes.values()) r.view.destroy();
    this.remotes.clear();
  }

  private bounce(spring: Phaser.GameObjects.Rectangle): void {
    const l = this.local;
    if (!l?.live) return;
    const b = l.rect.body as Phaser.Physics.Arcade.Body;
    const top = (spring.body as Phaser.Physics.Arcade.StaticBody).top;
    if (b.bottom > top + 6) return; // only the pad launches
    b.setVelocityY(-MOVEMENT.springVelocity);
    this.spark(l.rect.x, b.bottom, C.mustard, 8, { min: 200, max: 340 });
    const pv = [...this.placed.values()].find((v) => v.solid === spring);
    if (pv && !reducedMotion.matches) this.tweens.add({ targets: pv.view, scaleY: 0.6, duration: 70, yoyo: true, ease: "Quad.out" });
  }

  // Hit by a shot: knocked along it and up, out through everything, until
  // the runner leaves the level.
  private fling(launcher: Item, dx: number, dy: number): void {
    const l = this.local;
    if (!l?.live) return;
    l.live = false;
    l.flung = { by: launcher.id, at: performance.now() };
    const b = l.rect.body as Phaser.Physics.Arcade.Body;
    b.checkCollision.none = true;
    b.setCollideWorldBounds(false);
    b.setMaxVelocity(2000, 2000);
    const side = dx !== 0 ? dx : l.facing * -1 || 1;
    b.setVelocity(side * SHOT_KNOCKBACK.x, dy > 0 ? SHOT_KNOCKBACK.x * 0.6 : SHOT_KNOCKBACK.y);
    this.spark(l.rect.x, l.rect.y, C.mustard, 14, { min: 0, max: 360 });
    if (!reducedMotion.matches) this.cameras.main.shake(180, 0.006);
  }

  private tumble(time: number): void {
    const l = this.local!;
    l.figure.rotation += 0.35 * (l.facing || 1);
    l.view.setPosition(l.rect.x, l.rect.y + 14);
    this.redrawLocal("fall", time);
    const b = l.rect.body as Phaser.Physics.Arcade.Body;
    if (time - l.lastPoseAt >= POSE_EVERY_MS) {
      l.lastPoseAt = time;
      bus.pose({ x: Math.round(l.rect.x), y: Math.round(l.rect.y + 14), vx: Math.round(b.velocity.x), vy: Math.round(b.velocity.y), facing: l.facing });
    }
    const out = l.rect.x < -60 || l.rect.x > WIDTH + 60 || l.rect.y > DEATH_Y || l.rect.y < -400;
    if (out || performance.now() - l.flung!.at > 2500) this.die(false, l.flung!.by);
  }

  private die(fromServer = false, by?: string): void {
    const l = this.local;
    if (!l || (!l.live && !l.flung)) return;
    l.live = false;
    l.flung = null;
    const x = l.rect.x, y = l.rect.y + 14;
    if (!fromServer) bus.result({ result: "DEAD", x, y: Math.min(y, HEIGHT), by });
    this.puff(x, Math.min(y, HEIGHT - 10) - 14, l.colour);
    this.spark(x, Math.min(y, HEIGHT - 10) - 16, l.colour, 12, { min: 0, max: 360 });
    l.rect.destroy();
    l.view.destroy();
    this.local = null;
    const trap = by ? store.snap?.items.find((i) => i.id === by) : undefined;
    const whose = trap ? (trap.createdById === store.me ? "your own" : `${trap.createdBy}'s`) : "";
    const course = by && !trap ? this.course.fixtures.some((f) => f.id === by) : false;
    bus.say(
      fromServer ? "You stood still too long and dropped out of this run."
        : trap?.type === "launcher" ? `Shot out of the level by ${whose} launcher. Watch how the others do.`
          : trap ? `Caught by ${whose} spike. Watch how the others do.`
            : course ? "Caught by the course. Watch how the others do."
              : "You fell. Watch how the others do.",
    );
  }

  private finish(): void {
    const l = this.local;
    if (!l?.live) return;
    l.live = false;
    // no more input, but it still drops onto the ledge by the flag
    (l.rect.body as Phaser.Physics.Arcade.Body).setVelocityX(0);
    bus.result({ result: "FINISHED", x: l.rect.x, y: l.rect.y + 14 });
    if (!reducedMotion.matches) {
      this.tweens.add({ targets: l.figure, y: -18, duration: 180, yoyo: true, ease: "Quad.out" });
      this.tweens.add({ targets: this.flag, scaleY: 1.2, duration: 160, yoyo: true });
    }
    bus.say("You reached the flag. +1");
  }

  // ---------- particles ----------

  // a little dust kicked back from the feet while running
  private kickDust(x: number, y: number, n: number, facing: -1 | 1): void {
    if (reducedMotion.matches) return;
    this.dust.setParticleSpeed(20, 60);
    this.dust.updateConfig({ angle: facing > 0 ? { min: 190, max: 240 } : { min: 300, max: 350 } });
    this.dust.explode(n, x, y - 2);
  }

  // a puff under the feet on take-off
  private jumpDust(x: number, y: number): void {
    if (reducedMotion.matches) return;
    this.dust.updateConfig({ angle: { min: 160, max: 380 } });
    this.dust.explode(6, x, y - 1);
  }

  // a ring of dust sideways on landing, bigger after a longer fall
  private landDust(x: number, y: number, fallSpeed: number): void {
    if (reducedMotion.matches) return;
    const n = Math.min(10, 3 + Math.round(fallSpeed / 120));
    this.dust.updateConfig({ angle: { min: 165, max: 195 } });
    this.dust.explode(Math.ceil(n / 2), x - 4, y - 2);
    this.dust.updateConfig({ angle: { min: -15, max: 15 } });
    this.dust.explode(Math.ceil(n / 2), x + 4, y - 2);
  }

  private spark(x: number, y: number, colour: number, n: number, angle: { min: number; max: number }): void {
    if (reducedMotion.matches) return;
    this.sparks.updateConfig({ angle, tint: colour });
    this.sparks.explode(n, x, y);
  }

  private puff(x: number, y: number, colour: number): void {
    if (reducedMotion.matches) return;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const dot = this.add.circle(x, y, 4, i % 2 ? colour : C.inkSoft, 0.7).setDepth(16);
      this.tweens.add({ targets: dot, x: x + Math.cos(a) * 22, y: y + Math.sin(a) * 15 - 6, alpha: 0, scale: 0.4, duration: 400, ease: "Quad.out", onComplete: () => dot.destroy() });
    }
  }

  // ---------- building ----------

  private cellAt(x: number, y: number): { col: number; row: number } | null {
    if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return null;
    return { col: Math.floor(x / CELL), row: Math.floor(y / CELL) };
  }

  private itemAt(col: number, row: number, withFixtures = false): Item | null {
    for (const { item, fixed } of this.placed.values()) {
      if (fixed && !withFixtures) continue;
      const f = footprint(item);
      if (col >= f.col && col < f.col + f.w && row >= f.row && row < f.row + f.h) return item;
    }
    return null;
  }

  private pointerMoved(x: number, y: number): void {
    if (store.snap?.phase !== "BUILD") return;
    const sel = store.sel;
    const cell = this.cellAt(x, y);
    if (!cell) {
      if (sel.hover || sel.hoverTarget) {
        sel.hover = null;
        sel.hoverTarget = null;
        bus.selectionChanged();
      }
      return;
    }
    if (sel.choice === "bomb") {
      const id = this.itemAt(cell.col, cell.row)?.id ?? null;
      if (id !== sel.hoverTarget) {
        sel.hoverTarget = id;
        bus.selectionChanged();
      }
      return;
    }
    if (sel.choice) {
      // the pointer holds the middle of a long piece
      const f = footprint({ type: sel.choice, col: 0, row: 0, rot: sel.rot });
      const col = cell.col - Math.floor((f.w - 1) / 2);
      const row = cell.row - Math.floor((f.h - 1) / 2);
      if (sel.hover?.col !== col || sel.hover?.row !== row || sel.hover?.rot !== sel.rot || sel.hover?.type !== sel.choice) {
        sel.hover = { type: sel.choice, col, row, rot: sel.rot };
        bus.selectionChanged();
      }
      return;
    }
    // nothing chosen: say who made what you point at
    const item = this.itemAt(cell.col, cell.row, true);
    this.game.canvas.style.cursor = item ? "help" : "default";
    if (item?.id.startsWith("fixture-")) {
      this.hoverInfo = `${NAMES[item.type]}: part of ${this.course.name}. It cannot be demolished.`;
      return;
    }
    this.hoverInfo = item ? `${NAMES[item.type]} placed by ${item.createdBy}${item.createdRound ? ` in round ${item.createdRound}` : " in an earlier game"}.` : "";
  }

  private pointerDown(x: number, y: number): void {
    if (store.snap?.phase !== "BUILD" || !iCanBuild()) return;
    this.pointerMoved(x, y);
    const sel = store.sel;
    if (sel.choice === "bomb") {
      if (!sel.hoverTarget) return bus.say("Choose one of the placed pieces to demolish.", true);
      sel.target = sel.hoverTarget;
      bus.selectionChanged();
      return;
    }
    if (!sel.choice || !sel.hover) return;
    const error = placementError(this.course, store.snap.items, sel.hover);
    if (error) return bus.say(`Can't place there: ${error}.`, true);
    sel.pinned = { ...sel.hover };
    bus.selectionChanged();
  }

  update(time: number, delta: number): void {
    const runMs = this.phase === "RUN" ? performance.now() - this.runStartedAt : 0;
    this.spin += (delta / 1000) * (this.phase === "RUN" ? 9 : 1.2);
    this.animateItems(runMs, delta / 1000);
    this.animateShots(runMs);
    if (this.phase === "BUILD") this.drawGhosts();
    if (this.local?.flung) this.tumble(time);
    else if (this.local?.live && this.phase === "RUN") this.step(time, delta / 1000);
    else if (this.local) {
      this.local.view.setPosition(this.local.rect.x, this.local.rect.y + 14);
      this.redrawLocal("stand", time);
    }
    this.drawRemotes(time);
    this.steerCamera(delta / 1000);
    this.drawPointers();
  }

  // Launchers' shots, worked out from the time into the run, so every client
  // sees the same volley. A shot that meets a moving plank or a runner is
  // spent; hitting my own runner knocks me out.
  private animateShots(runMs: number): void {
    const g = this.shotLayer;
    g.clear();
    if (this.phase !== "RUN") return;
    const planks = [...this.placed.values()].filter((pv) => pv.plank).map((pv) => (pv.solid.body as Phaser.Physics.Arcade.Body));
    // hit as drawn: the figure stands about 44 px tall over its 20×28 body
    const figure = (feetX: number, feetY: number) => ({ x: feetX - 12, y: feetY - 44, width: 24, height: 44 });
    const me = this.local?.live ? figure(this.local.rect.x, this.local.rect.y + 14) : null;
    const runners = [...this.remotes.values()].filter((r) => !r.gone && r.samples.length);
    const r = SHOT_RADIUS;
    const touches = (x: number, y: number, b: { x: number; y: number; width: number; height: number }): boolean =>
      x + r > b.x && x - r < b.x + b.width && y + r > b.y && y - r < b.y + b.height;
    for (const pv of this.placed.values()) {
      const it = pv.item;
      if (it.type !== "launcher") continue;
      const range = this.shotRanges.get(it.id) ?? 0;
      const m = muzzle(it);
      // a little smoke and a kick each time it fires
      const volley = Math.floor(runMs / LAUNCH_INTERVAL_MS);
      if (this.lastVolley.get(it.id) !== volley) {
        this.lastVolley.set(it.id, volley);
        if (!reducedMotion.matches) {
          this.dust.updateConfig({ angle: { min: 0, max: 360 } });
          this.dust.explode(4, m.x, m.y);
          this.tweens.add({ targets: pv.view, x: pv.view.x - m.dx * 3, y: pv.view.y - m.dy * 3, duration: 60, yoyo: true, ease: "Quad.out" });
        }
      }
      for (const shot of shotsAt(it, range, runMs)) {
        const key = `${it.id}:${shot.firedAt}`;
        if (this.spent.has(key)) continue;
        if (planks.some((b) => touches(shot.x, shot.y, b))) {
          this.spent.add(key);
          this.spark(shot.x, shot.y, C.steelLight, 5, { min: 0, max: 360 });
          continue;
        }
        if (me && touches(shot.x, shot.y, me)) {
          this.spent.add(key);
          this.fling(it, m.dx, m.dy);
          continue;
        }
        // other runners, as drawn: the shot is spent on them too (their own
        // client decides whether they were knocked out)
        if (runners.some((q) => touches(shot.x, shot.y, figure(q.view.x, q.view.y)))) {
          this.spent.add(key);
          continue;
        }
        drawShot(g, shot.x, shot.y, m.dx, m.dy, r);
        // about to hit a wall: a small spark where it ends
        const left = range - ((runMs - shot.firedAt) / 1000) * SHOT_SPEED;
        if (left < 6 && !this.spent.has(key + ":end")) {
          this.spent.add(key + ":end");
          this.spark(shot.x + m.dx * r, shot.y + m.dy * r, C.steelLight, 4, { min: 0, max: 360 });
        }
      }
    }
  }

  // fans spin, moving platforms slide (and carry whoever rides them)
  private animateItems(runMs: number, dt: number): void {
    for (const pv of this.placed.values()) {
      const it = pv.item;
      if (pv.blades) {
        const f = footprint(it);
        pv.blades.clear();
        drawFanBlades(pv.blades, it.rot, (f.col + 0.5) * CELL, (f.row + 0.5) * CELL, this.spin, this.phase === "RUN" ? 1 : 0.35);
      }
      if (pv.plank) {
        const b = body(it);
        const o = movingOffset(it, runMs);
        const rb = pv.solid.body as Phaser.Physics.Arcade.Body;
        const tx = b.x + o.dx, ty = b.y + o.dy;
        if (this.phase === "RUN" && dt > 0) {
          // Physics steps at its own fixed rate, not once per frame, so drive by
          // the track's own velocity plus a gentle pull back onto it; dividing
          // the gap by the frame time overshoots on high refresh rate screens.
          const v = movingVelocity(it, runMs);
          rb.setVelocity(v.vx + (tx - rb.x) * MOVING_PULL, v.vy + (ty - rb.y) * MOVING_PULL);
        } else {
          rb.reset(tx + b.w / 2, ty + b.h / 2);
          rb.setVelocity(0, 0);
        }
        pv.plank.clear();
        if (it.hangFrom !== undefined) {
          // ropes up to its frame or rail, moving with it
          pv.plank.lineStyle(2, C.woodDeep, 0.9);
          for (const rx of [rb.x + 12, rb.x + 2 * CELL - 12]) pv.plank.lineBetween(rx, it.hangFrom, rx, rb.y + 4);
          pv.plank.fillStyle(C.steelDark, 1);
          pv.plank.fillRoundedRect(rb.x + 4, it.hangFrom - 5, 2 * CELL - 8, 8, 3);
        }
        drawMovingPlank(pv.plank, rb.x, rb.y);
      }
    }
  }

  private drawGhosts(): void {
    const g = this.ghost;
    g.clear();
    this.ghostPiece.clear();
    const items = store.snap?.items ?? [];
    // what other players are considering, in their colour
    const seen = new Set<string>();
    for (const pv of store.previews.values()) {
      const colour = this.colourOf(pv.playerId);
      const name = store.snap?.players.find((p) => p.id === pv.playerId)?.name ?? "";
      let at: { x: number; y: number } | null = null;
      if (pv.choice === "bomb" && pv.targetId) {
        const target = items.find((i) => i.id === pv.targetId);
        if (target) {
          const r = cellToPixels(footprint(target));
          g.lineStyle(2, colour, 0.8);
          g.strokeRoundedRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6, 6);
          at = { x: r.x + r.w / 2, y: r.y - 10 };
        }
      } else if (pv.proposal) {
        const f = footprint(pv.proposal);
        g.fillStyle(colour, 0.12);
        g.fillRoundedRect(f.col * CELL, f.row * CELL, f.w * CELL, f.h * CELL, 6);
        g.lineStyle(1.5, colour, 0.6);
        g.strokeRoundedRect(f.col * CELL, f.row * CELL, f.w * CELL, f.h * CELL, 6);
        at = { x: (f.col + f.w / 2) * CELL, y: f.row * CELL - 10 };
      }
      if (!at) continue;
      seen.add(pv.playerId);
      let label = this.previewLabels.get(pv.playerId);
      if (!label) {
        label = this.add.text(0, 0, name, { fontFamily: "system-ui, sans-serif", fontSize: "11px", color: "#6a655d" }).setOrigin(0.5).setDepth(21);
        this.previewLabels.set(pv.playerId, label);
      }
      label.setPosition(at.x, at.y);
    }
    for (const [id, label] of this.previewLabels) if (!seen.has(id)) {
      label.destroy();
      this.previewLabels.delete(id);
    }

    // my own choice
    if (!iCanBuild()) return;
    const sel = store.sel;
    if (sel.choice === "bomb") {
      for (const id of [sel.hoverTarget, sel.target]) {
        const target = id ? items.find((i) => i.id === id) : null;
        if (!target) continue;
        const r = cellToPixels(footprint(target));
        const pinned = id === sel.target;
        g.fillStyle(C.red, pinned ? 0.16 : 0.08);
        g.fillRoundedRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8, 7);
        g.lineStyle(pinned ? 2.5 : 1.5, C.red, pinned ? 0.95 : 0.6);
        g.strokeRoundedRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8, 7);
      }
      return;
    }
    const p: Proposal | null = sel.pinned ?? sel.hover;
    if (!p) return;
    const f = footprint(p);
    const valid = placementError(this.course, items, p) === null;
    const pinned = !!sel.pinned;
    const tint = valid ? C.green : C.red;
    g.fillStyle(tint, pinned ? 0.12 : 0.07);
    g.fillRoundedRect(f.col * CELL, f.row * CELL, f.w * CELL, f.h * CELL, 6);
    g.lineStyle(pinned ? 2.5 : 1.5, tint, pinned ? 0.9 : 0.55);
    g.strokeRoundedRect(f.col * CELL, f.row * CELL, f.w * CELL, f.h * CELL, 6);
    // the piece itself, lifted a little until it is pinned
    const lift = pinned ? 0 : 3;
    drawItem(this.ghostPiece, p.type, p.rot, f.col * CELL, (f.row + f.h) * CELL - lift);
    if (p.type === "fan") {
      // where the wind will blow
      const z = fanZone(p);
      g.lineStyle(1, C.blue, 0.5);
      g.strokeRect(z.x + 2, z.y + 2, z.w - 4, z.h - 4);
      drawFanBlades(this.ghostPiece, p.rot, (f.col + 0.5) * CELL, (f.row + 0.5) * CELL - lift, this.spin, 0.8);
    }
    if (p.type === "launcher") {
      // its line of fire, as far as a shot would go
      const m = muzzle(p);
      const range = shotRange(p, this.shotSolids());
      g.lineStyle(2, C.ink, 0.35);
      for (let d = 0; d < range; d += 18) g.lineBetween(m.x + m.dx * d, m.y + m.dy * d, m.x + m.dx * Math.min(range, d + 9), m.y + m.dy * Math.min(range, d + 9));
      g.fillStyle(C.ink, 0.35);
      g.fillCircle(m.x + m.dx * range, m.y + m.dy * range, 4);
    }
    if (p.type === "moving") {
      const b = body(p);
      drawMovingPlank(this.ghostPiece, b.x, b.y - lift);
      drawTravel(this.ghostPiece, p.rot, f.col * CELL, (f.row + f.h) * CELL, C.greenDark, 0.7);
    }
    this.ghostPiece.setAlpha(valid ? (pinned ? 0.95 : 0.6) : 0.35);
  }

  private drawRemotes(time: number): void {
    const t = performance.now() - INTERP_DELAY_MS;
    for (const r of this.remotes.values()) {
      if (r.gone || r.samples.length === 0) continue;
      const s = r.samples;
      let a = s[0], b = s[0];
      for (let i = s.length - 1; i >= 0; i--) {
        if (s[i].t <= t) {
          a = s[i];
          b = s[Math.min(i + 1, s.length - 1)];
          break;
        }
      }
      const k = b.t === a.t ? 1 : Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)));
      r.view.setPosition(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k);
      r.facing = b.facing;
      const pose: Pose = Math.abs(b.vy) > 80 ? (b.vy < 0 ? "jump" : "fall") : Math.abs(b.vx) > 30 ? "run" : "stand";
      r.figure.clear();
      drawCharacter(r.figure, r.character, r.facing, this.phase === "RUN" ? pose : "stand", time);
      // their dust too: running, and landing after a fall
      if (this.phase === "RUN") {
        const feetX = r.view.x, feetY = r.view.y;
        if (pose === "run" && time - r.lastDustAt > 140) {
          r.lastDustAt = time;
          this.kickDust(feetX - r.facing * 8, feetY, 1, r.facing);
        }
        if (r.lastVy > 250 && Math.abs(b.vy) < 40) this.landDust(feetX, feetY, r.lastVy);
        r.lastVy = b.vy;
      }
    }
  }

  private redrawLocal(pose: Pose, time: number): void {
    const l = this.local!;
    l.figure.clear();
    drawCharacter(l.figure, l.character, l.facing, pose, time);
  }

  // ---------- my own movement ----------

  private step(now: number, dt: number): void {
    const l = this.local!;
    const b = l.rect.body as Phaser.Physics.Arcade.Body;
    const k = this.keys;
    const dir = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
    const jump = Phaser.Input.Keyboard.JustDown(k.up) || Phaser.Input.Keyboard.JustDown(k.w) || Phaser.Input.Keyboard.JustDown(k.space);
    const onGround = b.blocked.down || b.touching.down;

    // fans: inside a zone, the wind sets a drift (sideways) or lifts and presses (up, down)
    let windX = 0, windY = 0;
    for (const pv of this.placed.values()) {
      if (pv.item.type !== "fan" || !inside(fanZone(pv.item), l.rect.x, l.rect.y)) continue;
      const d = FAN_DIRS[pv.item.rot % 4];
      windX += d.x;
      windY += d.y;
    }

    // run: ease towards the target speed, which the wind shifts
    const target = dir * MOVEMENT.moveSpeed + windX * MOVEMENT.fanWindSpeed;
    const accel = (onGround ? MOVEMENT.groundAcceleration : MOVEMENT.airAcceleration) * dt;
    const vx = b.velocity.x;
    b.setVelocityX(Math.abs(target - vx) <= accel ? target : vx + Math.sign(target - vx) * accel);
    if (windY) b.setVelocityY(b.velocity.y + windY * MOVEMENT.fanLift * dt);

    // walls: remember the last touch so a jump just after leaving still counts
    const wallSide: Side | 0 = !onGround && b.blocked.left ? -1 : !onGround && b.blocked.right ? 1 : 0;
    const feetX = l.rect.x, feetY = l.rect.y + 14;
    if (wallSide) {
      l.lastWallTouchAt = now;
      l.lastWallSide = wallSide;
      if (dir === wallSide && b.velocity.y > MOVEMENT.wallSlideSpeed) {
        b.setVelocityY(MOVEMENT.wallSlideSpeed);
        // scraping down the wall
        if (now - l.lastDustAt > 90) {
          l.lastDustAt = now;
          this.dust.updateConfig({ angle: { min: 250, max: 290 } });
          if (!reducedMotion.matches) this.dust.explode(1, feetX + wallSide * 10, feetY - 20);
        }
      }
    }

    if (jump) {
      if (onGround) {
        b.setVelocityY(-MOVEMENT.jumpVelocity);
        this.jumpDust(feetX, feetY);
      } else if (canWallJump(now, wallSide !== 0, l.lastWallTouchAt)) {
        const v = wallJumpVelocity(l.lastWallSide, dir === l.lastWallSide);
        b.setVelocity(v.vx, v.vy);
        // a kick off the wall
        this.spark(feetX + l.lastWallSide * 10, feetY - 14, C.woodLight, 6, l.lastWallSide > 0 ? { min: 120, max: 240 } : { min: -60, max: 60 });
        l.lastWallTouchAt = null;
      }
    }

    // landing: a squash and some dust; running: a little dust behind
    if (!onGround) l.fallSpeed = Math.max(l.fallSpeed, b.velocity.y);
    if (onGround && !l.wasOnGround) {
      if (l.fallSpeed > 150) this.landDust(feetX, feetY, l.fallSpeed);
      if (!reducedMotion.matches) {
        l.view.setScale(1.12, 0.88);
        this.tweens.add({ targets: l.view, scaleX: 1, scaleY: 1, duration: 140, ease: "Quad.out" });
      }
      l.fallSpeed = 0;
    }
    if (onGround && Math.abs(b.velocity.x) > 120 && now - l.lastDustAt > 110) {
      l.lastDustAt = now;
      this.kickDust(feetX - Math.sign(b.velocity.x) * 8, feetY, 1, b.velocity.x > 0 ? 1 : -1);
    }
    l.wasOnGround = onGround;

    l.facing = wallSide && dir === wallSide ? wallSide : dir === 0 ? l.facing : dir > 0 ? 1 : -1;
    const pose: Pose = wallSide && dir === wallSide ? "wall" : !onGround ? (b.velocity.y < 0 ? "jump" : "fall") : Math.abs(b.velocity.x) > 30 ? "run" : "stand";
    this.redrawLocal(pose, now);
    l.view.setPosition(l.rect.x, l.rect.y + 14);

    if (l.rect.y > DEATH_Y) return this.die();

    if (now - l.lastPoseAt >= POSE_EVERY_MS) {
      l.lastPoseAt = now;
      bus.pose({ x: Math.round(l.rect.x), y: Math.round(l.rect.y + 14), vx: Math.round(b.velocity.x), vy: Math.round(b.velocity.y), facing: l.facing });
    }
  }

  // called when a run begins so the countdown figure becomes playable
  release(): void {
    if (!this.local) return;
    this.local.live = this.amRunning();
    (this.local.rect.body as Phaser.Physics.Arcade.Body).setAllowGravity(true);
  }
}
