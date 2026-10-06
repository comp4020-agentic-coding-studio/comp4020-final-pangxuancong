// The HTML around the level: where we are in the level, who is on the round,
// what to do now, and the box of pieces. Quiet and secondary to the canvas
// (docs/ART_DIRECTION.md).
import type { BuildChoice } from "../shared/level.ts";
import type { PlayerView } from "../shared/protocol.ts";
import { iCanBuild, myPlayer, store } from "./state.ts";

const $ = (id: string): HTMLElement => document.getElementById(id)!;
const el = {
  where: $("where"), roster: $("roster"), phase: $("phase"), overlay: $("overlay"), build: $("build"), tray: $("tray"),
  rotate: $("rotate") as HTMLButtonElement, cancel: $("cancel") as HTMLButtonElement, skip: $("skip") as HTMLButtonElement,
  commit: $("commit") as HTMLButtonElement, message: $("message"), help: $("help"),
};

export const PIECES: { choice: BuildChoice; name: string; key: string; icon: string }[] = [
  {
    choice: "platform", name: "Platform", key: "1",
    icon: `<rect x="4" y="12" width="48" height="9" rx="3" fill="#b98a5a"/><rect x="6" y="18" width="44" height="2" fill="#8a6440"/><circle cx="9" cy="16" r="1.4" fill="#c9a03d"/><circle cx="47" cy="16" r="1.4" fill="#c9a03d"/>`,
  },
  {
    choice: "spring", name: "Spring", key: "2",
    icon: `<rect x="16" y="25" width="24" height="4" rx="2" fill="#8a6440"/><polyline points="28,25 20,22 36,19 20,16 36,13 28,12" fill="none" stroke="#c9a03d" stroke-width="2.2" stroke-linejoin="round"/><rect x="17" y="8" width="22" height="4" rx="2" fill="#d8aa4c"/>`,
  },
  {
    choice: "spike", name: "Spike", key: "3",
    icon: `<rect x="14" y="26" width="28" height="3" rx="1.5" fill="#6e4f33"/><path d="M15 26 L20 13 L25 26 Z M23 26 L28 13 L33 26 Z M31 26 L36 13 L41 26 Z" fill="#a54e43"/>`,
  },
  {
    choice: "bomb", name: "Bomb", key: "4",
    icon: `<circle cx="27" cy="20" r="9" fill="#2b2a28"/><circle cx="24" cy="17" r="2.2" fill="#fff" opacity=".3"/><path d="M32 12 Q36 6 40 8" fill="none" stroke="#8a6440" stroke-width="2"/><circle cx="40.5" cy="7.5" r="2" fill="#d8aa4c"/>`,
  },
];

let receivedAt = 0;
export const snapshotArrived = (): void => {
  receivedAt = performance.now();
};
const remaining = (ms: number | null): number | null => (ms === null ? null : Math.max(0, ms - (performance.now() - receivedAt)));

export function buildTray(onChoose: (c: BuildChoice) => void): void {
  el.tray.innerHTML = PIECES.map(
    (p) => `<button type="button" class="piece${p.choice === "bomb" ? " bomb" : ""}" data-choice="${p.choice}" aria-pressed="false" title="${p.name} (${p.key})">
      <svg viewBox="0 0 56 32" aria-hidden="true">${p.icon}</svg>${p.name}</button>`,
  ).join("");
  el.tray.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".piece");
    if (b && !b.disabled) onChoose(b.dataset.choice as BuildChoice);
  });
}

const STATE_WORDS: Record<string, string> = {
  WAITING: "building", PLACED: "placed", SKIPPED: "skipped", DISCONNECTED: "away",
  RUNNING: "running", DEAD: "fell", FINISHED: "made it",
};

function stateWord(p: PlayerView): string {
  const snap = store.snap!;
  if (!p.active) return "watching";
  if (snap.phase === "BUILD") return STATE_WORDS[p.build];
  if (snap.phase === "COUNTDOWN" && p.run === "RUNNING") return "ready";
  return STATE_WORDS[p.run ?? "DISCONNECTED"];
}

const isDone = (p: PlayerView): boolean => {
  const phase = store.snap!.phase;
  return phase === "BUILD" ? p.build !== "WAITING" : p.run !== "RUNNING";
};

const names = (ps: PlayerView[]): string => {
  const n = ps.map((p) => p.name);
  return n.length <= 2 ? n.join(" and ") : `${n.slice(0, -1).join(", ")} and ${n.at(-1)}`;
};

export function render(): void {
  const snap = store.snap;
  if (!snap) return;
  el.where.textContent = `Level ${snap.levelId} · Round ${snap.round} of ${snap.maxRounds}`;

  const roster = [...snap.players].sort((a, b) => Number(b.active) - Number(a.active));
  el.roster.innerHTML = roster
    .map(
      (p) => `<li class="${p.id === store.me ? "me" : ""} ${isDone(p) ? "done" : ""}"><span class="dot" style="background:${p.colour}"></span>${escape(p.name)}${p.id === store.me ? " (you)" : ""} <span class="state">· ${stateWord(p)}</span></li>`,
    )
    .join("");

  renderPhase();

  const building = iCanBuild();
  el.build.hidden = !building;
  if (building) {
    const sel = store.sel;
    for (const b of el.tray.querySelectorAll<HTMLButtonElement>(".piece")) {
      b.setAttribute("aria-pressed", String(sel.choice === b.dataset.choice));
      b.disabled = b.dataset.choice === "bomb" && snap.items.length === 0;
      if (b.disabled) b.title = "Nothing has been placed yet";
    }
    el.rotate.disabled = sel.choice !== "platform";
    el.cancel.disabled = !sel.choice;
    const bomb = sel.choice === "bomb";
    el.commit.textContent = bomb ? "Demolish" : "Place";
    el.commit.classList.toggle("danger", bomb);
    el.commit.disabled = bomb ? !sel.target : !sel.pinned;
  }

  el.help.innerHTML =
    snap.phase === "BUILD" && building
      ? `Choose a piece, then click the level to put it there. <kbd>R</kbd> turns a platform, <kbd>Enter</kbd> places, <kbd>Esc</kbd> cancels. Pieces are permanent once placed.`
      : snap.phase === "RUN" || snap.phase === "COUNTDOWN"
        ? `<kbd>←</kbd> <kbd>→</kbd> or <kbd>A</kbd> <kbd>D</kbd> to move · <kbd>↑</kbd> <kbd>W</kbd> or <kbd>Space</kbd> to jump · against a wall, jump again to climb it`
        : "";
}

// the parts that count down are refreshed on a timer, the rest on snapshots
export function renderPhase(): void {
  const snap = store.snap;
  if (!snap) return;
  const me = myPlayer();
  const active = snap.players.filter((p) => p.active);
  const others = active.filter((p) => p.id !== store.me);
  let text = "";
  let overlay = "";

  switch (snap.phase) {
    case "BUILD": {
      const waiting = others.filter((p) => p.build === "WAITING");
      if (iCanBuild()) {
        text = snap.round === 1 && snap.items.length === 0
          ? "Build: the level is bare. Add one piece, or skip and see how it runs."
          : "Build: add one piece, demolish one, or skip.";
        const left = remaining(snap.buildDeadlineMs);
        if (left !== null) text += `<span class="deadline">auto-skip in ${Math.ceil(left / 1000)} s</span>`;
      } else if (me?.active) {
        text = waiting.length ? `Waiting for ${escape(names(waiting))} to build…` : "Starting the run…";
      } else {
        text = "Joining…";
      }
      break;
    }
    case "COUNTDOWN": {
      const left = remaining(snap.phaseRemainingMs) ?? 0;
      text = me?.active ? "Get ready at the start." : "A run is about to start. You'll join at the next build.";
      overlay = `<div class="count" data-n="${Math.ceil(left / 1000)}">${Math.max(1, Math.ceil(left / 1000))}</div>`;
      break;
    }
    case "RUN": {
      const running = others.filter((p) => p.run === "RUNNING");
      if (me?.run === "RUNNING") text = "Run! Reach the flag.";
      else if (!me?.active) text = "A run is on. You'll join at the next build.";
      else text = running.length ? `${me.run === "FINISHED" ? "You made it." : "You fell."} Waiting for ${escape(names(running))}…` : "Run over.";
      break;
    }
    case "RESULTS": {
      const made = active.filter((p) => p.run === "FINISHED");
      text = snap.levelDone ? "Level complete. A fresh level is next." : `Round ${snap.round} is over. Next: build round ${snap.round + 1}.`;
      const rows = active
        .map((p) => `<li><span class="who"><span class="dot" style="background:${p.colour}"></span>${escape(p.name)}</span><span>${STATE_WORDS[p.run ?? "DISCONNECTED"]}</span></li>`)
        .join("");
      const summary = made.length === 0 ? "Nobody reached the flag." : made.length === active.length ? "Everyone reached the flag." : `${made.length} of ${active.length} reached the flag.`;
      overlay = `<div class="card"><h2>${snap.levelDone ? `Level ${snap.levelId} complete` : `Round ${snap.round} of ${snap.maxRounds}`}</h2><p>${summary}</p><ul>${rows}</ul>${
        snap.levelDone ? "<p>Six rounds built this level. The next one starts bare.</p>" : ""
      }</div>`;
      break;
    }
  }
  if (el.phase.innerHTML !== text) el.phase.innerHTML = text;
  // only replace the overlay when it changes, so the countdown animation replays per number
  const current = el.overlay.innerHTML;
  if (current !== overlay) el.overlay.innerHTML = overlay;
  el.overlay.hidden = overlay === "";
}

export function say(text: string, error = false): void {
  el.message.textContent = text;
  el.message.classList.toggle("error", error);
}

export const buttons = { rotate: el.rotate, cancel: el.cancel, skip: el.skip, commit: el.commit };

const escape = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
