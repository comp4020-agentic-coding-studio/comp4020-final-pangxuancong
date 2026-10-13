// The lobby: rooms with someone in them recently, a new room, or a code from
// a friend. A room is just a link, /r/CODE, so sharing that works as well.
import { CHARACTERS } from "../shared/characters.ts";
import { levelById } from "../shared/levels.ts";

interface RoomSummary { code: string; layout: number | null; phase: string; round: number; seated: number; here: number; maxPlayers: number; characters: number[] }

const $ = (id: string): HTMLElement => document.getElementById(id)!;
const list = $("rooms");
const message = $("lobby-message");
const go = (code: string): void => location.assign(`/r/${code}`);

const PHASES: Record<string, string> = {
  SELECT: "choosing a map", DRAW: "drawing a map", BUILD: "building", COUNTDOWN: "about to run", RUN: "running", RESULTS: "round end", LEVEL_END: "game over",
};

async function refresh(): Promise<void> {
  try {
    const { rooms } = (await (await fetch("/api/rooms")).json()) as { rooms: RoomSummary[] };
    list.innerHTML = rooms.length
      ? rooms
          .map((r) => {
            const full = r.seated >= r.maxPlayers;
            const where = r.layout === null || r.phase === "SELECT" || r.phase === "DRAW" ? PHASES[r.phase] : `${levelById(r.layout).name}, round ${r.round} · ${PHASES[r.phase]}`;
            const seats = CHARACTERS.map((c, i) => `<i class="${r.characters.includes(i) ? "taken" : ""}" style="--c:${c.colour}" title="${c.name}${r.characters.includes(i) ? " (taken)" : ""}"></i>`).join("");
            return `<li><a href="/r/${r.code}"><b class="code">${r.code}</b><span class="seats" title="${r.seated} of ${r.maxPlayers} seats taken">${seats}</span>
              <span class="what">${r.seated}/${r.maxPlayers} playing${r.here > r.seated ? `, ${r.here - r.seated} watching` : ""} · ${where}</span>
              <span class="go">${full ? "Watch" : "Join"}</span></a></li>`;
          })
          .join("")
      : `<li class="empty">No rooms open right now. Start one and send a friend the link.</li>`;
  } catch {
    list.innerHTML = `<li class="empty">Could not reach the server.</li>`;
  }
}

$("new-room").addEventListener("click", async () => {
  try {
    const res = await fetch("/api/rooms", { method: "POST" });
    go(((await res.json()) as { code: string }).code);
  } catch {
    message.textContent = "Could not make a room. Try again.";
  }
});

$("join-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = ($("code") as HTMLInputElement).value.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,8}$/.test(code)) {
    message.textContent = "A room code is four letters and numbers.";
    return;
  }
  const res = await fetch(`/api/rooms/${code}/level`);
  if (res.ok) go(code);
  else message.textContent = `There is no room ${code}.`;
});

refresh();
setInterval(refresh, 3000);
