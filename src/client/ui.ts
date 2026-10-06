// The HTML around the level: the Parts Tray, the round panel (phase, players,
// status and score, one line of guidance), the four-step strip, and the cards
// that sit over the level between runs (docs/ART_DIRECTION.md).
import { CHARACTERS } from "../shared/characters.ts";
import { CELL, type BuildChoice, footprint } from "../shared/level.ts";
import { LEVELS, type LevelDef, levelById } from "../shared/levels.ts";
import type { PlayerView, Snapshot } from "../shared/protocol.ts";
import type { Vote } from "../shared/rounds.ts";
import { iCanBuild, myPlayer, store } from "./state.ts";

const $ = (id: string): HTMLElement => document.getElementById(id)!;
const el = {
  where: $("where"), round: $("round"), pill: $("pill"), roster: $("roster"), guide: $("guide"), overlay: $("overlay"),
  tray: $("tray"), trayPanel: document.querySelector<HTMLElement>(".tray-panel")!, steps: $("steps"),
  rotate: $("rotate") as HTMLButtonElement, cancel: $("cancel") as HTMLButtonElement, skip: $("skip") as HTMLButtonElement,
  commit: $("commit") as HTMLButtonElement, message: $("message"), help: $("help"),
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

// A map of a course, drawn from its data so it always matches what you get.
export function courseMap(level: LevelDef): string {
  const parts: string[] = [];
  for (const b of level.blocks) {
    const x = b.col * CELL, y = b.row * CELL, w = b.w * CELL, h = b.style === "shelf" || b.style === "peg" ? 20 : b.h * CELL;
    const fill = b.style === "post" ? "#8d9194" : b.style === "floor" ? "#b8834f" : "#c08c58";
    parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${fill}"/>`);
  }
  for (const f of level.fixtures) {
    const fp = footprint(f);
    const x = fp.col * CELL, y = fp.row * CELL;
    if (f.type === "spike") parts.push(`<path d="M${x + 4} ${y + 40} L${x + 20} ${y + 12} L${x + 36} ${y + 40} Z" fill="#b24a3e"/>`);
    else if (f.type === "fan") parts.push(`<circle cx="${x + 20}" cy="${y + 20}" r="16" fill="#5f87b0"/><path d="M${x + 44} ${y + 20} h60" stroke="#5f87b0" stroke-width="6" stroke-dasharray="14 10" opacity=".6"/>`);
    else if (f.type === "moving") parts.push(`<rect x="${x + 60}" y="${y}" width="80" height="18" rx="4" fill="#6f8f5c"/><path d="M${x + 10} ${y + 30} H${x + fp.w * CELL - 10}" stroke="#6f8f5c" stroke-width="4" opacity=".6"/>`);
  }
  const { spawn, flag } = level;
  parts.push(`<rect x="${spawn.x - 24}" y="${spawn.y - 56}" width="48" height="56" rx="6" fill="#6f8f5c" opacity=".35"/>`);
  parts.push(`<path d="M${flag.x} ${flag.y} V${flag.y - 96}" stroke="#c9a03d" stroke-width="7"/><path d="M${flag.x} ${flag.y - 96} l50 18 l-50 18 z" fill="#b24a3e"/>`);
  return `<svg viewBox="0 0 1280 720" aria-hidden="true"><rect width="1280" height="720" fill="#faf6ee"/>${parts.join("")}</svg>`;
}

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
  if (snap.phase === "SELECT") return p.pick ? { text: `picked level ${p.pick}`, cls: "ok" } : { text: "choosing…", cls: "wait" };
  if (!p.active) return { text: "watching", cls: "" };
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

const PHASE_NAMES: Record<string, string> = { SELECT: "Choose a level", BUILD: "Build phase", COUNTDOWN: "Get ready", RUN: "Run phase", RESULTS: "Round end", LEVEL_END: "Game over" };

export function render(): void {
  const snap = store.snap;
  if (!snap) return;
  const course = levelById(snap.layout);
  el.where.textContent = snap.phase === "SELECT" ? "Choosing a level"
    : `Level ${course.id}: ${course.name} · game ${snap.levelId}${snap.archivedFrom ? `, built on game ${snap.archivedFrom}` : ""}`;
  el.round.textContent = snap.phase === "SELECT" ? "New game" : snap.phase === "LEVEL_END" ? "Six rounds done" : `Round ${snap.round} of ${snap.maxRounds}`;
  el.pill.textContent = PHASE_NAMES[snap.phase];
  el.pill.className = `pill ${snap.phase === "RUN" || snap.phase === "COUNTDOWN" ? "run" : snap.phase === "BUILD" ? "" : "end"}`;

  const players = [...snap.players].sort((a, b) => Number(b.active) - Number(a.active));
  el.roster.innerHTML = players
    .map((p) => {
      const s = status(p, snap);
      return `<li class="${p.id === store.me ? "me" : ""} ${p.active || snap.phase === "SELECT" ? "" : "watching"}">${head(p.character, p.colour)}<span class="name">${escape(p.name)}${p.id === store.me ? " (you)" : ""}</span><span class="pts" title="points this game">${pts(p.points)}</span><span class="state ${s.cls}">${s.text}</span></li>`;
    })
    .join("");

  for (const li of el.steps.querySelectorAll<HTMLElement>("li")) {
    const step = li.dataset.step;
    li.classList.toggle("now", step === snap.phase || (step === "RESULTS" && snap.phase === "LEVEL_END") || (step === "BUILD" && snap.phase === "SELECT"));
  }

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
    snap.phase === "BUILD"
      ? `Choose a piece (<kbd>1</kbd>–<kbd>6</kbd>), click the level to put it there, <kbd>Enter</kbd> to place. <kbd>R</kbd> turns it, <kbd>Esc</kbd> cancels. Pieces are permanent once placed.`
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
      guide = "Choose the course for this game. When everyone has picked, the most picked wins; a tie goes to the lower level.";
      const cards = LEVELS.map((l) => {
        const pickers = snap.players.filter((p) => p.pick === l.id).map((p) => head(p.character, p.colour)).join("");
        return `<button type="button" class="level" data-pick="${l.id}">${courseMap(l)}<span class="lname">Level ${l.id} · ${l.name}</span><span class="blurb">${l.blurb}</span><span class="pickers">${pickers}</span></button>`;
      }).join("");
      overlay = `<div class="card select"><h2>Choose a level</h2><div class="levels">${cards}</div><p class="tally"></p></div>`;
      tally = left === null ? "Waiting for the first pick" : `Starting in ${Math.ceil(left / 1000)} s, or when everyone has picked`;
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
      } else {
        guide = `The game is full (${snap.maxPlayers} players). You're watching, and take a seat when one frees up.`;
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
      else if (!me?.active) guide = "A run is on. You're watching.";
      else guide = running.length ? `${me.run === "FINISHED" ? "You made it." : "You fell."} Waiting for ${names(running)}…` : "Run over.";
      break;
    }
    case "RESULTS": {
      const made = active.filter((p) => p.run === "FINISHED");
      guide = snap.round >= snap.maxRounds ? "That was the last round. Final scores next." : `Next: build round ${snap.round + 1}. The level stays as it is.`;
      const rows = [...active]
        .sort((a, b) => b.gained - a.gained || b.points - a.points)
        .map((p) => `<tr><td><span class="who">${head(p.character, p.colour)}${escape(p.name)}</span></td><td>${status(p, snap).text}</td><td class="gain">${p.gained ? `+${pts(p.gained)}` : ""}</td><td>${pts(p.points)}</td></tr>`)
        .join("");
      const summary = made.length === 0 ? "Nobody reached the flag." : made.length === active.length ? "Everyone reached the flag." : `${made.length} of ${active.length} reached the flag.`;
      overlay = `<div class="card"><h2>Round ${snap.round} complete</h2><p>${summary}</p><table>${rows}</table></div>`;
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
      overlay = `<div class="card final" data-game="${snap.levelId}"><h2>Final scores</h2><p>Six rounds on level ${snap.layout}: ${levelById(snap.layout).name}.</p><ol class="board">${rows}</ol>
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
    el.overlay.innerHTML = lastOverlay = overlay;
    const final = el.overlay.querySelector<HTMLElement>(".final");
    if (final) revealScores(final);
  }
  const t = el.overlay.querySelector(".tally");
  if (t && t.textContent !== tally) t.textContent = tally;
  // my own choice, without rebuilding the card
  for (const b of el.overlay.querySelectorAll<HTMLButtonElement>("[data-vote]")) b.setAttribute("aria-pressed", String(me?.vote === b.dataset.vote));
  for (const b of el.overlay.querySelectorAll<HTMLButtonElement>("[data-pick]")) b.setAttribute("aria-pressed", String(me?.pick === Number(b.dataset.pick)));
  el.overlay.hidden = overlay === "";
}

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

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
const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));
let lastGuide = "";
let lastOverlay = "";

export function onVote(fn: (v: Vote) => void, onPick: (level: number) => void): void {
  el.overlay.addEventListener("click", (e) => {
    const v = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-vote]");
    if (v) fn(v.dataset.vote as Vote);
    const p = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-pick]");
    if (p) onPick(Number(p.dataset.pick));
  });
}

export function say(text: string, error = false): void {
  el.message.textContent = text;
  el.message.classList.toggle("error", error);
}

export const buttons = { rotate: el.rotate, cancel: el.cancel, skip: el.skip, commit: el.commit };

const escape = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
