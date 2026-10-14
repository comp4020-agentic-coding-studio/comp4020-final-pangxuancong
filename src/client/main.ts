/// <reference types="vite/client" />
// Wires the browser together: an identity, the socket, the shared store, the
// Phaser scene and the HTML shell. The server's snapshot is the truth; this
// file never decides a phase, a placement or an outcome.
import Phaser from "phaser";
import { io, type Socket } from "socket.io-client";
import { ROTATIONS, VIEW_H, VIEW_W, type BuildChoice } from "../shared/level.ts";
import { MOVEMENT } from "../shared/movement.ts";
import { type ClientToServer, PROTOCOL, type ServerToClient } from "../shared/protocol.ts";
import { LevelScene } from "./scene.ts";
import { bus, emptySelection, iCanBuild, store } from "./state.ts";
import { PIECES, buildTray, buttons, muteButton, onSeat, render, renderPhase, say, snapshotArrived } from "./ui.ts";

// The room is in the URL: /r/CODE.
const room = location.pathname.match(/^\/r\/([A-Za-z0-9]{4,8})\/?$/)?.[1]?.toUpperCase() ?? "";
if (!room) location.replace("/");

// Who you are in this room survives a refresh and closing the tab, so coming
// back within the seat hold gets your seat and points back. A second tab
// already open in the same room is someone new (docs/MULTIPLAYER.md).
const KEY = `chain-reaction-player:${room}`;
const OPEN = `chain-reaction-open:${room}`;
const stored = (k: Storage, key: string): { id: string; name: string } | null => {
  try {
    return JSON.parse(k.getItem(key) ?? "null");
  } catch {
    return null;
  }
};
// this tab's own identity first (a refresh); otherwise the room's last one,
// unless another tab is using it right now
let saved = stored(sessionStorage, KEY);
if (!saved) {
  const last = stored(localStorage, KEY);
  const openAt = Number(localStorage.getItem(`${OPEN}:${last?.id}`) ?? 0);
  if (last && Date.now() - openAt > 4000) saved = last;
}
const playerId = saved?.id ?? crypto.randomUUID();
const remember = (name: string): void => {
  try {
    const v = JSON.stringify({ id: playerId, name });
    sessionStorage.setItem(KEY, v);
    localStorage.setItem(KEY, v);
  } catch {
    // private windows may refuse; this tab still works
  }
};
remember(saved?.name ?? "");
// a heartbeat, so another tab can tell this identity is in use
const beat = (): void => {
  try {
    localStorage.setItem(`${OPEN}:${playerId}`, String(Date.now()));
  } catch {}
};
beat();
setInterval(beat, 1500);
addEventListener("pagehide", () => {
  try {
    localStorage.removeItem(`${OPEN}:${playerId}`);
  } catch {}
});

const socket: Socket<ServerToClient, ClientToServer> = io({ auth: { playerId, name: saved?.name ?? "", room } });

const scene = new LevelScene();
let sceneReady = false;
new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: VIEW_W,
  height: VIEW_H,
  backgroundColor: "#f4efe6",
  physics: { default: "arcade", arcade: { gravity: { x: 0, y: MOVEMENT.gravity } } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true },
  scene,
});
// for driving the game from browser tests during development only
if (import.meta.env.DEV) Object.assign(window, { chainReaction: { scene, store, bus, socket } });
scene.onReady = () => {
  sceneReady = true;
  scene.applySnapshot();
};

// ---------- from the server ----------

let warnedProtocol = false;
socket.on("snapshot", (snap) => {
  if (snap.protocol !== PROTOCOL && !warnedProtocol) {
    warnedProtocol = true;
    console.error(`server protocol ${snap.protocol}, this page ${PROTOCOL}`);
    say(import.meta.env.DEV
      ? "This page and the server are different versions: restart pnpm dev, then reload."
      : "The game has been updated. Reload the page to keep playing.", true);
  }
  const before = store.snap;
  store.snap = snap;
  // the server names me by my public tag, never by my own id
  store.me = snap.you;
  snapshotArrived();
  const me = snap.players.find((p) => p.id === snap.you);
  if (me && saved?.name !== me.name) {
    saved = { id: playerId, name: me.name };
    remember(me.name);
  }
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

socket.on("room:missing", () => {
  say(`There is no room ${room}. Back to the lobby…`, true);
  setTimeout(() => location.replace("/"), 1500);
});
socket.on("disconnect", (reason) => {
  if (reason !== "io server disconnect") say("Lost the connection. Reconnecting… your seat is kept for two minutes.", true);
});
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
bus.pick = (layout) => socket.emit("level:pick", layout);
bus.result = (r) => socket.emit("run:result", r);
bus.say = say;

const HINTS: Record<BuildChoice, string> = {
  platform: "Click the level to put it there. R turns it into a post.",
  spring: "Click the level to put it there. Land on its pad to bounce high.",
  spike: "Click the level to put it there. +0.2 for you each time it gets someone else.",
  fan: "Click the level to put it there. R turns which way it blows.",
  moving: "Click the level to put it there. R switches between sliding sideways and up and down.",
  launcher: "Click the level to put it there. R turns where it fires. One shot a second; a hit knocks a runner out. +0.2 for you each time it gets someone else.",
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
muteButton();
onSeat((c) => (c === null ? socket.emit("seat:leave") : socket.emit("seat:claim", c)));
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
