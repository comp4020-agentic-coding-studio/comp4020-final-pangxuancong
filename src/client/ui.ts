// The HTML around the level: the Parts Tray, the round panel (phase, players,
// status and score, one line of guidance), the four-step strip, and the cards
// that sit over the level between runs (docs/ART_DIRECTION.md).
import { CHARACTERS } from "../shared/characters.ts";
import type { BuildChoice } from "../shared/level.ts";
import { levelById } from "../shared/levels.ts";
import type { PlayerView, Snapshot } from "../shared/protocol.ts";
import { DRAW_INTRO_MS, DRAW_SPIN_MS, type Draw, type Vote } from "../shared/rounds.ts";
import { reducedMotion, setReducedMotion } from "./motion.ts";
import { chime, isMuted, plop, setMuted, sfx, tick } from "./sound.ts";
import { iCanBuild, myPlayer, store, touch } from "./state.ts";

const $ = (id: string): HTMLElement => document.getElementById(id)!;
const el = {
  where: $("where"), round: $("round"), pill: $("pill"), roster: $("roster"), guide: $("guide"), overlay: $("overlay"),
  tray: $("tray"), trayPanel: document.querySelector<HTMLElement>(".tray-panel")!, steps: $("steps"),
  rotate: $("rotate") as HTMLButtonElement, cancel: $("cancel") as HTMLButtonElement, skip: $("skip") as HTMLButtonElement,
  commit: $("commit") as HTMLButtonElement, message: $("message"), help: $("help"), pad: $("pad"),
};

// ---------- touch controls ----------
// A touch screen gets on-screen buttons: left and right held, jump tapped
// (each press counts, so a quick tap is never missed). They show from the
// first touch, or on a coarse pointer, and only while there is a character
// of yours to move.
let touchScreen = window.matchMedia("(pointer: coarse)").matches;
addEventListener("touchstart", () => {
  if (touchScreen) return;
  touchScreen = true;
  render();
}, { passive: true, once: true });

function wirePad(): void {
  const held = new Map<number, "left" | "right">();
  const sync = (): void => {
    touch.left = [...held.values()].includes("left");
    touch.right = [...held.values()].includes("right");
    for (const b of el.pad.querySelectorAll<HTMLElement>("[data-pad=left], [data-pad=right]")) b.classList.toggle("down", touch[b.dataset.pad as "left" | "right"]);
  };
  el.pad.addEventListener("pointerdown", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-pad]");
    if (!b) return;
    e.preventDefault();
    try {
      b.setPointerCapture(e.pointerId); // keep the press if the thumb slides off
    } catch {
      // not a capturable pointer; the press still counts
    }
    const what = b.dataset.pad;
    if (what === "jump") {
      touch.jumps++;
      b.classList.add("down");
      setTimeout(() => b.classList.remove("down"), 120);
    } else {
      held.set(e.pointerId, what as "left" | "right");
      sync();
    }
  });
  const up = (e: PointerEvent): void => {
    if (held.delete(e.pointerId)) sync();
  };
  for (const t of ["pointerup", "pointercancel", "lostpointercapture"] as const) el.pad.addEventListener(t, up);
  // a long press must not open a menu or select text
  el.pad.addEventListener("contextmenu", (e) => e.preventDefault());
}
wirePad();

// is there a runner of mine on screen right now
const moving = (snap: Snapshot): boolean => {
  const me = snap.players.find((p) => p.id === store.me);
  if (snap.phase === "SELECT" || snap.phase === "DRAW") return me?.character != null;
  return (snap.phase === "COUNTDOWN" || snap.phase === "RUN") && me?.run === "RUNNING";
};

export const PIECES: { choice: BuildChoice; name: string; icon: string }[] = [
  {
    choice: "platform", name: "Platform",
    icon: `<rect x="3" y="11" width="50" height="10" rx="3" fill="#c08c58"/><rect x="5" y="18" width="46" height="3" fill="#8f6339"/><circle cx="9" cy="16" r="1.6" fill="#5d6265"/><circle cx="47" cy="16" r="1.6" fill="#5d6265"/>`,
  },
  {
    choice: "spring", name: "Spring",
    icon: `<rect x="15" y="26" width="26" height="4" rx="2" fill="#6b4728"/><polyline points="28,26 18,23 38,20 18,17 38,14 28,12" fill="none" stroke="#c9a03d" stroke-width="2.6" stroke-linejoin="round"/><rect x="15" y="7" width="26" height="5" rx="2" fill="#e0ae45"/>`,
  },
  {
    choice: "spike", name: "Spike",
    icon: `<rect x="11" y="26" width="34" height="4" rx="2" fill="#6b4728"/><path d="M12 26 L17.5 10 L23 26 Z M23 26 L28.5 10 L34 26 Z M34 26 L39.5 10 L45 26 Z" fill="#b24a3e"/><path d="M17.5 26 L17.5 10 L23 26 Z M28.5 26 L28.5 10 L34 26 Z M39.5 26 L39.5 10 L45 26 Z" fill="#8e3a31"/>`,
  },
  {
    choice: "fan", name: "Fan",
    icon: `<ellipse cx="28" cy="10" rx="4" ry="7" fill="#5f87b0"/><ellipse cx="28" cy="24" rx="4" ry="7" fill="#5f87b0"/><ellipse cx="21" cy="17" rx="7" ry="4" fill="#5f87b0"/><ellipse cx="35" cy="17" rx="7" ry="4" fill="#5f87b0"/><circle cx="28" cy="17" r="3" fill="#c9a03d"/><path d="M44 12 h8 M44 17 h9 M44 22 h8" stroke="#5f87b0" stroke-width="1.6" stroke-linecap="round" opacity=".6"/>`,
  },
  {
    choice: "moving", name: "Moving platform",
    icon: `<rect x="12" y="15" width="32" height="9" rx="3" fill="#6f8f5c"/><rect x="14" y="17" width="28" height="2" fill="#fff" opacity=".3"/><path d="M4 9 h10 M4 9 l3 -2.5 M4 9 l3 2.5 M52 9 h-10 M52 9 l-3 -2.5 M52 9 l-3 2.5" stroke="#6a655d" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
  },
  {
    choice: "launcher", name: "Launcher",
    icon: `<rect x="14" y="5" width="22" height="22" rx="4" fill="#5d6265"/><rect x="16" y="7" width="18" height="18" rx="3" fill="#8d9194"/><rect x="25" y="12" width="14" height="8" fill="#2b2a28"/><rect x="36" y="11" width="2.5" height="10" fill="#c9a03d"/><circle cx="25" cy="16" r="3.5" fill="#b24a3e"/><circle cx="48" cy="16" r="3.4" fill="#2b2a28"/><circle cx="43" cy="16" r="1.6" fill="#2b2a28" opacity=".25"/>`,
  },
  {
    choice: "bomb", name: "Demolition bomb",
    icon: `<circle cx="26" cy="19" r="10" fill="#2b2a28"/><circle cx="22.5" cy="15.5" r="2.6" fill="#fff" opacity=".3"/><path d="M32 11 Q36 4 41 6" fill="none" stroke="#8f6339" stroke-width="2"/><path d="M41 6 l3 -3 M41 6 l4 0 M41 6 l2 3" stroke="#e0ae45" stroke-width="1.8" stroke-linecap="round"/>`,
  },
];

// Small heads of the four characters, for the roster and the score tables.
const HEADS = [
  `<ellipse cx="12" cy="14" rx="7" ry="9" fill="#fbf8f2" stroke="#2b2a28" stroke-width="1.4"/><ellipse cx="12" cy="4.5" rx="3" ry="3.2" fill="#d8402f" stroke="#2b2a28" stroke-width="1.2"/><path d="M18 12 l5 2 l-5 2 z" fill="#f0a63a" stroke="#2b2a28" stroke-width="1"/><circle cx="15" cy="11" r="1.2" fill="#2b2a28"/>`,
  `<circle cx="11" cy="13" r="7.5" fill="#d9a25a" stroke="#2b2a28" stroke-width="1.4"/><ellipse cx="18" cy="15" rx="4.5" ry="3.2" fill="#f3d9b0" stroke="#2b2a28" stroke-width="1.2"/><circle cx="21.5" cy="14.5" r="1.4" fill="#2b2a28"/><ellipse cx="6" cy="14" rx="3" ry="6" fill="#9b6a2a" stroke="#2b2a28" stroke-width="1.1"/><circle cx="13" cy="10.5" r="1.2" fill="#2b2a28"/>`,
  `<rect x="7" y="4" width="13" height="8" rx="3.5" fill="#86c932" stroke="#2b2a28" stroke-width="1.2"/><rect x="8" y="9" width="7" height="8" fill="#86c932"/><path d="M3 15 h18 a2 2 0 0 1 0 0 l-2 6 a3 3 0 0 1 -3 2 h-8 a3 3 0 0 1 -3 -2 z" fill="#b76a36" stroke="#2b2a28" stroke-width="1.2"/><ellipse cx="9" cy="3.5" rx="2.5" ry="1.8" fill="#2b2a28"/><circle cx="11" cy="7" r="1.1" fill="#2b2a28"/>`,
  `<circle cx="12" cy="12" r="9" fill="#fbfbfa" stroke="#2b2a28" stroke-width="1.4"/><ellipse cx="14" cy="12.5" rx="5.5" ry="4.5" fill="#f3e1c8" stroke="#2f86d9" stroke-width="1.2"/><rect x="9" y="13" width="10" height="4" rx="1.5" fill="#8cc4ef"/><circle cx="12" cy="11" r="0.9" fill="#2b2a28"/><circle cx="16" cy="11" r="0.9" fill="#2b2a28"/><path d="M12 3 v4" stroke="#2f86d9" stroke-width="1.6"/>`,
];
export const head = (character: number | null, colour = "#9a948a"): string =>
  character === null
    ? `<span class="head"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6" fill="${colour}"/></svg></span>`
    : `<span class="head" title="${CHARACTERS[character].name}"><svg viewBox="0 0 24 24" aria-hidden="true">${HEADS[character]}</svg></span>`;

let receivedAt = 0;
export const snapshotArrived = (): void => {
  receivedAt = performance.now();
};
const remaining = (ms: number | null): number | null => (ms === null ? null : Math.max(0, ms - (performance.now() - receivedAt)));

export function buildTray(onChoose: (c: BuildChoice) => void): void {
  el.tray.innerHTML = PIECES.map(
    (p, i) => `<button type="button" class="piece${p.choice === "bomb" ? " bomb" : ""}" data-choice="${p.choice}" aria-pressed="false" title="${p.name} (${i + 1})">
      <svg viewBox="0 0 56 32" aria-hidden="true">${p.icon}</svg><span>${p.name}</span><kbd>${i + 1}</kbd></button>`,
  ).join("");
  el.tray.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".piece");
    if (b && !b.disabled) onChoose(b.dataset.choice as BuildChoice);
  });
}

// what to say about each player now, and whether it is settled
function status(p: PlayerView, snap: Snapshot): { text: string; cls: string } {
  if (!p.connected && p.character !== null) return { text: "reconnecting…", cls: "out" };
  if (snap.phase === "SELECT" || snap.phase === "DRAW") {
    if (p.character === null) return { text: "watching", cls: "" };
    return p.pick ? { text: `map ${p.pick}`, cls: "ok" } : { text: "choosing…", cls: "wait" };
  }
  if (!p.active) return { text: p.character === null ? "watching" : "next build", cls: "" };
  switch (snap.phase) {
    case "BUILD":
      return { WAITING: { text: "placing…", cls: "wait" }, PLACED: { text: "placed", cls: "ok" }, SKIPPED: { text: "skipped", cls: "ok" }, DISCONNECTED: { text: "away", cls: "out" } }[p.build];
    case "COUNTDOWN":
      return { text: p.run === "RUNNING" ? "ready" : "away", cls: p.run === "RUNNING" ? "ok" : "out" };
    case "LEVEL_END":
      return p.vote ? { text: p.vote === "ARCHIVE" ? "voted keep" : "voted restart", cls: "ok" } : { text: "deciding…", cls: "wait" };
    default:
      return { RUNNING: { text: "running", cls: "wait" }, DEAD: { text: "fell", cls: "out" }, FINISHED: { text: "made it", cls: "ok" }, DISCONNECTED: { text: "away", cls: "out" } }[p.run ?? "DISCONNECTED"];
  }
}

const names = (ps: PlayerView[]): string => {
  const n = ps.map((p) => escape(p.name));
  return n.length <= 2 ? n.join(" and ") : `${n.slice(0, -1).join(", ")} and ${n.at(-1)}`;
};
const pts = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const PHASE_NAMES: Record<string, string> = { SELECT: "Choose a map", DRAW: "Drawing a map", BUILD: "Build phase", COUNTDOWN: "Get ready", RUN: "Run phase", RESULTS: "Round end", LEVEL_END: "Game over" };

export function render(): void {
  const snap = store.snap;
  if (!snap) return;
  const course = levelById(snap.layout);
  const choosing = snap.phase === "SELECT" || snap.phase === "DRAW";
  el.where.innerHTML = `Room <b>${snap.room}</b> <button type="button" class="copy" id="copy-link" title="Copy this room's link">Copy link</button> · <a href="/">Lobby</a>`
    + (choosing ? "" : ` · Level ${course.id}: ${course.name} · game ${snap.levelId}${snap.archivedFrom ? `, built on game ${snap.archivedFrom}` : ""}`);
  el.round.textContent = choosing ? "New game" : snap.phase === "LEVEL_END" ? "Game over" : `Round ${snap.round} of ${snap.maxRounds}`;
  el.pill.textContent = PHASE_NAMES[snap.phase];
  el.pill.className = `pill ${snap.phase === "RUN" || snap.phase === "COUNTDOWN" ? "run" : snap.phase === "BUILD" ? "" : "end"}`;

  const players = [...snap.players].sort((a, b) => Number(b.active) - Number(a.active));
  el.roster.innerHTML = players
    .map((p) => {
      const s = status(p, snap);
      return `<li class="${p.id === store.me ? "me" : ""} ${p.active || (choosing && p.character !== null) ? "" : "watching"}">${head(p.character, p.colour)}<span class="name">${escape(p.name)}${p.id === store.me ? " (you)" : ""}</span><span class="pts" title="points this game">${pts(p.points)}</span><span class="state ${s.cls}">${s.text}</span></li>`;
    })
    .join("");

  for (const li of el.steps.querySelectorAll<HTMLElement>("li")) {
    const step = li.dataset.step;
    li.classList.toggle("now", step === snap.phase || (step === "RESULTS" && snap.phase === "LEVEL_END") || (step === "BUILD" && choosing));
  }

  const showPad = touchScreen && moving(snap);
  if (el.pad.hidden === showPad) {
    el.pad.hidden = !showPad;
    if (!showPad) {
      touch.left = touch.right = false;
      touch.jumps = 0;
    }
  }
  document.body.classList.toggle("touch", touchScreen);

  const building = iCanBuild();
  el.trayPanel.classList.toggle("idle", !building);
  const sel = store.sel;
  for (const b of el.tray.querySelectorAll<HTMLButtonElement>(".piece")) {
    b.setAttribute("aria-pressed", String(building && sel.choice === b.dataset.choice));
    b.disabled = !building || (b.dataset.choice === "bomb" && snap.items.length === 0);
  }
  const bomb = sel.choice === "bomb";
  el.rotate.disabled = !building || !sel.choice || bomb || sel.choice === "spring" || sel.choice === "spike";
  el.cancel.disabled = !building || !sel.choice;
  el.skip.disabled = !building;
  el.commit.textContent = bomb ? "Demolish" : "Place";
  el.commit.classList.toggle("danger", bomb);
  el.commit.disabled = !building || (bomb ? !sel.target : !sel.pinned);

  el.help.innerHTML =
    choosing && myPlayer()?.character != null
      ? `<kbd>←</kbd> <kbd>→</kbd> or <kbd>A</kbd> <kbd>D</kbd> to walk · <kbd>↑</kbd> <kbd>W</kbd> or <kbd>Space</kbd> to jump · stand under a sign to vote for that map`
      : snap.phase === "BUILD"
      ? `Choose a piece (<kbd>1</kbd>–<kbd>7</kbd>), click the level to put it there, <kbd>Enter</kbd> to place. <kbd>R</kbd> turns it, <kbd>Esc</kbd> cancels. Pieces are permanent once placed. Look around: scroll to zoom, drag with the right button, or <kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd>.`
      : snap.phase === "RUN" && snap.players.find((p) => p.id === store.me)?.run !== "RUNNING"
        ? `Watching the others: <kbd>E</kbd> for the next runner, or click a badge on the edge · arrows, right drag or the wheel to look around yourself`
      : snap.phase === "RUN" || snap.phase === "COUNTDOWN"
        ? `<kbd>←</kbd> <kbd>→</kbd> or <kbd>A</kbd> <kbd>D</kbd> to move · <kbd>↑</kbd> <kbd>W</kbd> or <kbd>Space</kbd> to jump · against a wall, jump again to climb it`
        : "";
  renderPhase();
}

// the parts that count down are refreshed on a timer, the rest on snapshots
export function renderPhase(): void {
  const snap = store.snap;
  if (!snap) return;
  const me = myPlayer();
  const active = snap.players.filter((p) => p.active);
  const others = active.filter((p) => p.id !== store.me);
  let guide = "";
  let overlay = "";
  let tally = "";

  switch (snap.phase) {
    case "SELECT": {
      const left = remaining(snap.phaseRemainingMs);
      const seated = snap.players.filter((p) => p.character !== null && p.connected);
      const voted = seated.filter((p) => p.pick !== null);
      if (me?.character == null) {
        // first, a character: taking one is taking a seat
        const taken = new Map(snap.players.filter((p) => p.character !== null).map((p) => [p.character!, p]));
        const cards = CHARACTERS.map((c, i) => {
          const holder = taken.get(i);
          return `<button type="button" class="hero" data-seat="${i}" style="--c:${c.colour}" ${holder ? "disabled" : ""}>
            <span class="portrait">${head(i, c.colour)}</span><span class="hname">${c.name}</span>
            <span class="hstate">${holder ? (holder.connected ? "taken" : "held for a returning player") : "free"}</span></button>`;
        }).join("");
        const full = taken.size >= CHARACTERS.length;
        overlay = `<div class="card heroes"><h2>Choose your character</h2>
          <p>${full ? "All four seats are taken. You're watching; a seat frees up when someone leaves for good." : "Your character is your seat in this room. Then walk to the map you want."}</p>
          <div class="hero-row">${cards}</div></div>`;
        guide = full ? `The room is full (${snap.maxPlayers} players). You're watching.` : "Choose a character to take a seat.";
      } else {
        guide = `Walk under the sign of the map you want. ${voted.length} of ${seated.length} ${seated.length === 1 ? "has" : "have"} chosen.`
          + `<button type="button" class="link" data-seat="-1">Give up my seat</button>`;
      }
      if (left !== null) guide += `<span class="deadline">${voted.length === seated.length && seated.length > 0 ? "Everyone has chosen: starting" : "Starting"} in ${Math.ceil(left / 1000)} s</span>`;
      break;
    }
    case "DRAW": {
      const draw = snap.draw;
      if (!draw) break;
      guide = "The vote was split, so the wheel decides: each vote is a share of it.";
      overlay = `<div class="card draw" data-draw="${snap.levelId}:${draw.options.map((o) => o.layout + "x" + o.votes).join(",")}:${draw.result}:${draw.land}">
        <h2>Spin for the map</h2>
        ${wheel(draw, snap)}
        <ul class="odds">${draw.options.map((o, i) => `<li style="--c:${SLICE_COLOURS[i]}"><i></i>Map ${o.layout} · ${levelById(o.layout).name}<b>${pct(o.votes, draw)}</b></li>`).join("")}</ul>
        <p class="drawn" aria-live="polite"></p></div>`;
      break;
    }
    case "BUILD": {
      const waiting = others.filter((p) => p.build === "WAITING");
      if (iCanBuild()) {
        guide = snap.round === 1 && snap.items.length === 0
          ? "The level is bare. Place one piece, or skip and see how it runs. Everyone must finish to start the run."
          : "Place one piece, use the Demolition Bomb on any piece, or skip. Everyone must finish to start the run.";
        const left = remaining(snap.buildDeadlineMs);
        if (left !== null) guide += `<span class="deadline">Auto-skip in ${Math.ceil(left / 1000)} s</span>`;
      } else if (me?.active) {
        guide = waiting.length ? `Waiting for ${names(waiting)} to build…` : "Starting the run…";
      } else if (me?.character != null) {
        guide = "You have a seat. You'll play from the next build.";
      } else {
        guide = `You're watching. ${seatPicker(snap)}`;
      }
      break;
    }
    case "COUNTDOWN": {
      const left = remaining(snap.phaseRemainingMs) ?? 0;
      guide = me?.active ? "Get ready at the start." : "A run is about to start. You'll join at the next build if a seat is free.";
      overlay = `<div class="count">${Math.max(1, Math.ceil(left / 1000))}</div>`;
      break;
    }
    case "RUN": {
      const running = others.filter((p) => p.run === "RUNNING");
      if (me?.run === "RUNNING") guide = "Run! Reach the flag. +1 if you make it.";
      else if (!me?.active) guide = me?.character != null ? "A run is on. You'll play from the next build." : `A run is on. You're watching. ${seatPicker(snap)}`;
      else guide = running.length ? `${me.run === "FINISHED" ? "You made it." : "You fell."} Waiting for ${names(running)}…` : "Run over.";
      break;
    }
    case "RESULTS": {
      const made = active.filter((p) => p.run === "FINISHED");
      const winners = active.filter((p) => p.points >= snap.winPoints);
      guide = winners.length
        ? `${names(winners)} reached ${snap.winPoints} points. Final scores next.`
        : snap.levelDone ? "That was the last round. Final scores next." : `Next: build round ${snap.round + 1}. The level stays as it is.`;
      // each bar runs from before this round to now, out of the points needed to win
      const goal = snap.winPoints;
      const notches = Array.from({ length: goal - 1 }, (_, i) => `<i style="left:${((i + 1) / goal) * 100}%"></i>`).join("");
      const rows = [...active]
        .sort((a, b) => b.points - a.points || b.gained - a.gained)
        .map((p) => {
          const from = Math.max(0, p.points - p.gained);
          return `<li class="track-row${p.points >= goal ? " won" : ""}" data-from="${from}" data-to="${p.points}" style="--c:${p.colour}">
            ${head(p.character, p.colour)}<span class="who">${escape(p.name)}<small>${status(p, snap).text}</small></span>
            <span class="track">${notches}<b class="was" style="width:${Math.min(100, (from / goal) * 100)}%"></b><b class="now" style="width:${Math.min(100, (from / goal) * 100)}%"></b><em class="goal-flag"></em></span>
            <span class="gain">${p.gained ? `+${pts(p.gained)}` : ""}</span><span class="pts">${pts(from)}</span></li>`;
        })
        .join("");
      const summary = snap.tooSimple ? "Everyone reached the flag, so nobody scores this round."
        : made.length === 0 ? "Nobody reached the flag." : `${made.length} of ${active.length} reached the flag.`;
      overlay = `<div class="card round${snap.tooSimple ? " simple" : ""}" data-round="${snap.levelId}:${snap.round}">
        ${snap.tooSimple ? `<div class="stamp" aria-live="polite"><span>Too simple</span><small>no one wins</small></div>` : ""}
        <div class="body"><h2>Round ${snap.round} complete</h2><p>${summary}</p>
        <ol class="tracks">${rows}</ol><p class="goal-note">First to ${goal} points wins · ${snap.maxRounds} rounds at most</p></div></div>`;
      break;
    }
    case "LEVEL_END": {
      const left = remaining(snap.phaseRemainingMs);
      const keep = snap.players.filter((p) => p.vote === "ARCHIVE").length;
      const restart = snap.players.filter((p) => p.vote === "RESTART").length;
      guide = "Keep this level and build on it next game, or choose a new one? Majority decides; a tie keeps it.";
      const best = Math.max(1, ...snap.scores.map((r) => r.points));
      const rows = snap.scores.length
        ? snap.scores
            .map((r, i) => `<li class="row" data-rank="${i}" data-points="${r.points}" data-pct="${Math.round((r.points / best) * 100)}">
              <span class="rank">${i + 1}</span>${head(r.character, r.colour)}<span class="who">${escape(r.name)}<small>${r.finishes} flag${r.finishes === 1 ? "" : "s"} · ${r.kills} spiked</small></span>
              <span class="bar"><span style="background:${r.colour}"></span></span><span class="pts">0</span></li>`)
            .join("")
        : `<li class="row shown">Nobody scored this game.</li>`;
      // the table is rebuilt only once per game, so the reveal plays once
      const early = snap.scores.some((r) => r.points >= snap.winPoints);
      const how = early ? `${escape(snap.scores[0].name)} reached ${snap.winPoints} points in round ${snap.round}` : `${snap.maxRounds} rounds`;
      overlay = `<div class="card final" data-game="${snap.levelId}"><h2>Final scores</h2><p>${how} on level ${snap.layout}: ${levelById(snap.layout).name}.</p><ol class="board">${rows}</ol>
        <div class="vote">
          <button type="button" data-vote="ARCHIVE">Keep building on it</button>
          <button type="button" data-vote="RESTART">Choose a new level</button>
        </div>
        <p class="tally"></p></div>`;
      tally = `${keep} keep · ${restart} new level · decided in ${Math.ceil((left ?? 0) / 1000)} s`;
      break;
    }
  }
  // Replace markup only when it really changes: the countdown animation should
  // replay once per number, and buttons must not be swapped out under a click.
  // (Compare with what was generated, not innerHTML, which the browser rewrites.)
  if (guide !== lastGuide) el.guide.innerHTML = lastGuide = guide;
  if (overlay !== lastOverlay) {
    // the countdown beeps once per number, and higher as the run starts
    const count = overlay.match(/^<div class="count">(\d)/)?.[1];
    if (count) sfx.count(false);
    else if (lastOverlay.startsWith('<div class="count">') && snap.phase === "RUN") sfx.count(true);
    el.overlay.innerHTML = lastOverlay = overlay;
    const final = el.overlay.querySelector<HTMLElement>(".final");
    if (final) revealScores(final);
    const round = el.overlay.querySelector<HTMLElement>(".card.round");
    if (round) fillTracks(round, snap.winPoints);
    const draw = el.overlay.querySelector<HTMLElement>(".card.draw");
    if (draw && snap.draw) spinDraw(draw, snap.draw, snap.phaseElapsedMs + (performance.now() - receivedAt));
  }
  const t = el.overlay.querySelector(".tally");
  if (t && t.textContent !== tally) t.textContent = tally;
  // my own choice, without rebuilding the card
  for (const b of el.overlay.querySelectorAll<HTMLButtonElement>("[data-vote]")) b.setAttribute("aria-pressed", String(me?.vote === b.dataset.vote));
  el.overlay.hidden = overlay === "";
}


// The final table, revealed from last place to first: each row slides in,
// its bar grows and its points count up; then the leader is lit and the vote
// appears.
function revealScores(card: HTMLElement): void {
  const rows = [...card.querySelectorAll<HTMLElement>(".row[data-rank]")].reverse();
  const show = (row: HTMLElement): void => {
    row.classList.add("shown");
    const bar = row.querySelector<HTMLElement>(".bar span")!;
    const pts = row.querySelector<HTMLElement>(".pts")!;
    const target = Number(row.dataset.points);
    bar.style.width = `${row.dataset.pct}%`;
    if (reducedMotion.matches) {
      pts.textContent = fmt(target);
      return;
    }
    const start = performance.now();
    const step = (now: number): void => {
      const k = Math.min(1, (now - start) / 800);
      pts.textContent = fmt(Math.round(target * (1 - (1 - k) ** 3) * 10) / 10);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const finish = (): void => {
    const top = card.querySelectorAll<HTMLElement>(".row[data-rank]");
    const best = Number(top[0]?.dataset.points ?? 0);
    if (best > 0) for (const r of top) if (Number(r.dataset.points) === best) r.classList.add("winner");
    card.classList.add("ready");
  };
  if (reducedMotion.matches) {
    rows.forEach(show);
    finish();
    return;
  }
  rows.forEach((row, i) => setTimeout(() => show(row), 500 + i * 650));
  setTimeout(finish, 500 + rows.length * 650 + 600);
}
// The round card's bars: after a beat (longer behind the "too simple" stamp),
// each grows from the points before this round to now, its number counting
// up; a bar that reaches the goal lights its flag.
function fillTracks(card: HTMLElement, goal: number): void {
  const rows = [...card.querySelectorAll<HTMLElement>(".track-row")];
  const delay = card.classList.contains("simple") ? 1700 : 350;
  const fill = (row: HTMLElement): void => {
    const to = Number(row.dataset.to), from = Number(row.dataset.from);
    row.querySelector<HTMLElement>(".now")!.style.width = `${Math.min(100, (to / goal) * 100)}%`;
    row.classList.add("filled");
    const pts = row.querySelector<HTMLElement>(".pts")!;
    if (reducedMotion.matches || to === from) {
      pts.textContent = fmt(to);
      return;
    }
    const start = performance.now();
    const step = (now: number): void => {
      const k = Math.min(1, (now - start) / 900);
      pts.textContent = fmt(Math.round((from + (to - from) * (1 - (1 - k) ** 3)) * 10) / 10);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  if (reducedMotion.matches) {
    card.classList.add("shown");
    rows.forEach(fill);
    return;
  }
  requestAnimationFrame(() => card.classList.add("shown"));
  rows.forEach((row, i) => setTimeout(() => fill(row), delay + i * 160));
}

const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));
let lastGuide = "";
let lastOverlay = "";

// For someone watching mid-game: the free characters, as buttons; taking one
// is taking a seat for the next build (or this one, while it is open).
function seatPicker(snap: Snapshot): string {
  const taken = new Set(snap.players.map((p) => p.character));
  const free = CHARACTERS.map((c, i) => ({ c, i })).filter(({ i }) => !taken.has(i));
  if (free.length === 0) return `The room is full (${snap.maxPlayers} players); a seat frees up when someone leaves for good.`;
  return `Take a free seat:<span class="seat-picks">${free.map(({ c, i }) => `<button type="button" class="seat-pick" data-seat="${i}" title="${c.name}">${head(i, c.colour)}${c.name}</button>`).join("")}</span>`;
}

// ---------- the wheel ----------
// A split vote spins a wheel. Each map is a slice as large as its votes;
// the voters' heads drop into their slice, the wheel spins and slows, the
// pointer flicking on each peg, and stops where the server's draw says
// (`result`, at `land` across its slice). The angle is a function of the
// time into DRAW, so every screen shows the same wheel at the same moment,
// even one that opens mid-spin.

const SLICE_COLOURS = ["#d9aa72", "#9cb98a", "#8fb0cf"];
const WHEEL_R = 120;
const TURNS = 5;
const pct = (votes: number, draw: Draw): string => `${Math.round((votes / draw.options.reduce((n, o) => n + o.votes, 0)) * 100)}%`;

// each slice's start and end angle, in turns from the top, clockwise
function slices(draw: Draw): { layout: number; from: number; to: number }[] {
  const total = draw.options.reduce((n, o) => n + o.votes, 0);
  let at = 0;
  return draw.options.map((o) => {
    const from = at;
    at += o.votes / total;
    return { layout: o.layout, from, to: at };
  });
}

const polar = (turns: number, r: number): [number, number] => [Math.sin(turns * 2 * Math.PI) * r, -Math.cos(turns * 2 * Math.PI) * r];

function wheel(draw: Draw, snap: Snapshot): string {
  const parts = slices(draw).map((sl, i) => {
    const [x1, y1] = polar(sl.from, WHEEL_R), [x2, y2] = polar(sl.to, WHEEL_R);
    const big = sl.to - sl.from > 0.5 ? 1 : 0;
    const mid = (sl.from + sl.to) / 2;
    const [lx, ly] = polar(mid, WHEEL_R * 0.62);
    const deg = mid * 360;
    // the voters for this map, as heads on the rim of their slice
    const voters = snap.players.filter((p) => p.pick === sl.layout && p.character !== null);
    const heads = voters.map((p, k) => {
      const t = sl.from + ((k + 1) / (voters.length + 1)) * (sl.to - sl.from);
      const [hx, hy] = polar(t, WHEEL_R * 0.86);
      return `<g transform="translate(${hx.toFixed(1)} ${hy.toFixed(1)})"><g class="voter" style="--d:${120 + k * 140 + i * 60}ms"><circle r="15" fill="#fffdf8" stroke="${p.colour}" stroke-width="2.5"/><g transform="translate(-11 -11) scale(0.92)">${HEADS[p.character!]}</g></g></g>`;
    }).join("");
    const path = sl.to - sl.from >= 0.9999
      ? `<circle r="${WHEEL_R}" fill="${SLICE_COLOURS[i]}"/>`
      : `<path d="M0 0 L${x1.toFixed(2)} ${y1.toFixed(2)} A${WHEEL_R} ${WHEEL_R} 0 ${big} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" fill="${SLICE_COLOURS[i]}" stroke="#6b4728" stroke-width="2"/>`;
    return `<g class="slice" data-layout="${sl.layout}">${path}
      <g transform="translate(${lx.toFixed(1)} ${ly.toFixed(1)}) rotate(${deg.toFixed(1)})"><text class="sl-n" y="-4">${sl.layout}</text><text class="sl-p" y="14">${pct(draw.options[i].votes, draw)}</text></g>${heads}</g>`;
  }).join("");
  // pegs on the rim at every slice boundary
  const pegs = slices(draw).map((sl) => {
    const [x, y] = polar(sl.from, WHEEL_R - 4);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="#c9a03d" stroke="#6b4728" stroke-width="1.5"/>`;
  }).join("");
  const box = WHEEL_R + 26;
  return `<div class="wheel"><svg viewBox="${-box} ${-box} ${box * 2} ${box * 2}" role="img" aria-label="A wheel with one slice per map, sized by votes">
    <circle r="${WHEEL_R + 12}" fill="#8f6339"/><circle r="${WHEEL_R + 7}" fill="#c08c58"/>
    <g class="spinner">${parts}${pegs}</g>
    <circle r="16" fill="#6b4728"/><circle r="9" fill="#c9a03d"/>
    <g class="pointer" transform="translate(0 ${-(WHEEL_R + 4)})"><path d="M-12 -18 L12 -18 L0 10 Z" fill="#b24a3e" stroke="#4a3420" stroke-width="2" stroke-linejoin="round"/><circle cy="-18" r="5" fill="#4a3420"/></g>
  </svg></div>`;
}

// The wheel's angle in turns at `ms` into DRAW: still while the voters drop
// in, then TURNS full turns and the rest, easing out to stop at the drawn spot.
// Reduced motion keeps the turn (it is the draw) but makes it short and slow
// to start: one turn and the rest, over the last part of the spin.
function angleAt(ms: number, end: number): number {
  const gentle = reducedMotion.matches;
  const spin = gentle ? DRAW_SPIN_MS * 0.5 : DRAW_SPIN_MS;
  const from = DRAW_INTRO_MS + (gentle ? DRAW_SPIN_MS - spin : 0);
  const k = Math.min(1, Math.max(0, (ms - from) / spin));
  return ((gentle ? 1 : TURNS) + end) * (gentle ? 1 - (1 - k) ** 2 : 1 - (1 - k) ** 4);
}

function spinDraw(card: HTMLElement, draw: Draw, elapsedAtArrival: number): void {
  const spinner = card.querySelector<SVGGElement>(".spinner")!;
  const pointer = card.querySelector<SVGGElement>(".pointer")!;
  const drawn = card.querySelector<HTMLElement>(".drawn")!;
  const sl = slices(draw);
  const won = sl.find((s) => s.layout === draw.result)!;
  // the pointer is at the top: the wheel turns so that this spot comes under it
  const spot = won.from + draw.land * (won.to - won.from);
  const end = 1 - spot;
  const startedAt = performance.now() - Math.max(0, elapsedAtArrival);
  const land = (): void => {
    card.querySelector(`.slice[data-layout="${draw.result}"]`)?.classList.add("won");
    card.classList.add("landed");
    drawn.textContent = `Map ${draw.result}: ${levelById(draw.result).name}`;
    chime();
  };
  // the voters drop in, one after another
  card.querySelectorAll<SVGGElement>(".voter").forEach((_v, i) => setTimeout(plop, 120 + i * 140));
  // which slice is under the pointer at an angle: for the peg ticks
  const under = (a: number): number => {
    const at = (((1 - (a % 1)) % 1) + 1) % 1;
    return sl.findIndex((s) => at >= s.from && at < s.to);
  };
  let last = under(0);
  let flick = 0;
  const step = (): void => {
    const ms = performance.now() - startedAt;
    const a = angleAt(ms, end);
    spinner.setAttribute("transform", `rotate(${(a * 360).toFixed(2)})`);
    const now = under(a);
    if (now !== last) {
      last = now;
      flick = 1;
      tick(0.9 + 0.2 * Math.random());
    }
    // the pointer kicks back on each peg, and settles
    flick = reducedMotion.matches ? 0 : flick * 0.82;
    pointer.setAttribute("transform", `translate(0 ${-(WHEEL_R + 4)}) rotate(${(-22 * flick).toFixed(1)})`);
    if (ms < DRAW_INTRO_MS + DRAW_SPIN_MS) requestAnimationFrame(step);
    else land();
  };
  requestAnimationFrame(step);
}

// the mute button, in the header
export function muteButton(): void {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "copy mute";
  const show = (): void => {
    b.textContent = isMuted() ? "Sound off" : "Sound on";
    b.setAttribute("aria-pressed", String(isMuted()));
  };
  b.addEventListener("click", () => {
    setMuted(!isMuted());
    show();
  });
  show();
  // and the motion switch
  const m = document.createElement("button");
  m.type = "button";
  m.className = "copy mute";
  const showMotion = (): void => {
    m.textContent = reducedMotion.matches ? "Motion: reduced" : "Motion: full";
    m.title = "Animations follow your system setting until you choose here";
  };
  m.addEventListener("click", () => {
    setReducedMotion(!reducedMotion.matches);
    showMotion();
  });
  showMotion();
  el.where.parentElement!.append(b, m);
}

export function onVote(fn: (v: Vote) => void, onSeat: (character: number | null) => void): void {
  const click = (e: Event): void => {
    const v = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-vote]");
    if (v) fn(v.dataset.vote as Vote);
    const seat = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-seat]");
    if (seat) onSeat(Number(seat.dataset.seat) < 0 ? null : Number(seat.dataset.seat));
  };
  el.overlay.addEventListener("click", click);
  el.guide.addEventListener("click", click);
  el.where.addEventListener("click", async (e) => {
    if (!(e.target as HTMLElement).closest("#copy-link")) return;
    const b = e.target as HTMLButtonElement;
    try {
      await navigator.clipboard.writeText(location.href);
      b.textContent = "Copied";
    } catch {
      b.textContent = location.href;
    }
    setTimeout(() => (b.textContent = "Copy link"), 1500);
  });
}

export function say(text: string, error = false): void {
  el.message.textContent = text;
  el.message.classList.toggle("error", error);
}

export const buttons = { rotate: el.rotate, cancel: el.cancel, skip: el.skip, commit: el.commit };

const escape = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
