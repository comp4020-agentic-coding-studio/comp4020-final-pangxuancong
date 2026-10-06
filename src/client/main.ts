/// <reference types="vite/client" />
// Wires the browser together: an identity, the socket, the shared store, the
// Phaser scene and the HTML shell. The server's snapshot is the truth; this
// file never decides a phase, a placement or an outcome.
import Phaser from "phaser";
import { io, type Socket } from "socket.io-client";
import { HEIGHT, ROTATIONS, WIDTH, type BuildChoice } from "../shared/level.ts";
import { MOVEMENT } from "../shared/movement.ts";
import type { ClientToServer, ServerToClient } from "../shared/protocol.ts";
import { LevelScene } from "./scene.ts";
import { bus, emptySelection, iCanBuild, store } from "./state.ts";
import { PIECES, buildTray, buttons, onVote, render, renderPhase, say, snapshotArrived } from "./ui.ts";

// One player per tab: a refresh keeps who you are, a second tab is someone new
// (docs/MULTIPLAYER.md).
const KEY = "chain-reaction-player";
const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as { id: string; name: string } | null;
const playerId = saved?.id ?? crypto.randomUUID();
store.me = playerId;

const socket: Socket<ServerToClient, ClientToServer> = io({ auth: { playerId, name: saved?.name ?? "" } });

const scene = new LevelScene();
let sceneReady = false;
new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: "#f4efe6",
  physics: { default: "arcade", arcade: { gravity: { x: 0, y: MOVEMENT.gravity } } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true },
  scene,
});
// for driving the game from browser tests during development only
if (import.meta.env.DEV) Object.assign(window, { chainReaction: { scene, store } });
scene.onReady = () => {
  sceneReady = true;
  scene.applySnapshot();
};

// ---------- from the server ----------

socket.on("snapshot", (snap) => {
  const before = store.snap;
  store.snap = snap;
  snapshotArrived();
  const me = snap.players.find((p) => p.id === playerId);
  if (me && saved?.name !== me.name) sessionStorage.setItem(KEY, JSON.stringify({ id: playerId, name: me.name }));
  if (before?.phase !== snap.phase || before?.levelId !== snap.levelId) {
    store.sel = emptySelection();
    store.previews.clear();
    // keep "Placed." on screen into the countdown; clear older news
    if (before && !(before.phase === "BUILD" && snap.phase === "COUNTDOWN")) say("");
  }
  // my build is done (or timed out): put the piece down
  if (snap.phase === "BUILD" && !iCanBuild() && store.sel.choice) store.sel = emptySelection();
  // a target that someone else demolished first
  if (store.sel.target && !snap.items.some((i) => i.id === store.sel.target)) store.sel.target = null;
  if (sceneReady) scene.applySnapshot();
  render();
});

socket.on("build:preview", (p) => {
  if ("cleared" in p) store.previews.delete(p.playerId);
  else store.previews.set(p.playerId, p);
});

socket.on("run:pose", (p) => {
  if (sceneReady) scene.onRemotePose(p.playerId, p.x, p.y, p.vx, p.vy, p.facing);
});

socket.on("disconnect", () => say("Lost the connection. Reconnecting…", true));
socket.io.on("reconnect", () => say(""));

// ---------- to the server ----------

// what I am considering, throttled; it also tells the server I am not AFK
let previewTimer: ReturnType<typeof setTimeout> | null = null;
function sendPreview(): void {
  if (previewTimer) return;
  previewTimer = setTimeout(() => {
    previewTimer = null;
    if (!iCanBuild()) return;
    const sel = store.sel;
    if (!sel.choice) return socket.emit("build:preview", null);
    socket.emit("build:preview", {
      choice: sel.choice,
      proposal: sel.choice === "bomb" ? undefined : (sel.pinned ?? sel.hover ?? undefined),
      targetId: sel.choice === "bomb" ? (sel.target ?? sel.hoverTarget ?? undefined) : undefined,
    });
  }, 100);
}

bus.selectionChanged = () => {
  sendPreview();
  render();
};
bus.pose = (p) => socket.volatile.emit("run:pose", p);
bus.result = (r) => socket.emit("run:result", r);
bus.say = say;

const HINTS: Record<BuildChoice, string> = {
  platform: "Click the level to put it there. R turns it into a post.",
  spring: "Click the level to put it there. Land on its pad to bounce high.",
  spike: "Click the level to put it there. +0.2 for you each time it gets someone else.",
  fan: "Click the level to put it there. R turns which way it blows.",
  moving: "Click the level to put it there. R switches between sliding sideways and up and down.",
  bomb: "Click a placed piece to demolish it. Anyone's piece can go.",
};

function choose(choice: BuildChoice): void {
  if (!iCanBuild()) return;
  const same = store.sel.choice === choice;
  store.sel = { ...emptySelection(), choice: same ? null : choice };
  say(same ? "" : HINTS[choice]);
  bus.selectionChanged();
}

function rotate(): void {
  const sel = store.sel;
  if (!sel.choice || sel.choice === "bomb" || ROTATIONS[sel.choice] < 2) return;
  sel.rot = (sel.rot + 1) % ROTATIONS[sel.choice];
  sel.hover = null;
  if (sel.pinned) sel.pinned = { ...sel.pinned, rot: sel.rot };
  bus.selectionChanged();
}

function cancel(): void {
  if (!store.sel.choice) return;
  store.sel = emptySelection();
  say("");
  bus.selectionChanged();
}

function commit(): void {
  if (!iCanBuild()) return;
  const sel = store.sel;
  const done = (r: { ok: true } | { ok: false; error: string }, what: string): void => {
    if (r.ok) {
      store.sel = emptySelection();
      say(what);
    } else {
      say(`Not done: ${r.error}.`, true);
    }
    render();
  };
  if (sel.choice === "bomb" && sel.target) socket.emit("build:bomb", sel.target, (r) => done(r, "Demolished. That piece is gone for everyone."));
  else if (sel.choice && sel.choice !== "bomb" && sel.pinned) socket.emit("build:commit", sel.pinned, (r) => done(r, "Placed. It is part of the level now."));
}

function skip(): void {
  if (!iCanBuild()) return;
  socket.emit("build:skip", (r) => {
    if (r.ok) {
      store.sel = emptySelection();
      say("Skipped this build.");
    }
    render();
  });
}

buildTray(choose);
onVote((v) => socket.emit("level:vote", v));
buttons.rotate.addEventListener("click", rotate);
buttons.cancel.addEventListener("click", cancel);
buttons.skip.addEventListener("click", skip);
buttons.commit.addEventListener("click", commit);

document.addEventListener("keydown", (e) => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || store.snap?.phase !== "BUILD") return;
  const n = Number(e.key);
  if (n >= 1 && n <= PIECES.length) choose(PIECES[n - 1].choice);
  else if (e.key === "r" || e.key === "R") rotate();
  else if (e.key === "Escape") cancel();
  else if (e.key === "Enter" && (store.sel.pinned || store.sel.target)) {
    // even with a tray button focused: Enter means "place it"
    e.preventDefault();
    commit();
  }
});

// countdowns and deadlines tick between snapshots
setInterval(renderPhase, 200);
// pointing at a placed piece while nothing is chosen says who made it
setInterval(() => {
  if (store.snap?.phase === "BUILD" && !store.sel.choice && scene.hoverInfo) say(scene.hoverInfo);
}, 300);
