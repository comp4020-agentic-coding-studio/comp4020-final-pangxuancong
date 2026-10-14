import { type LogEvent, insertEvent } from "./db.ts";

// The activity log: who did what (docs/ARCHITECTURE.md, "Activity log").
// Each event is one JSON line on stdout, which `flyctl logs` shows live, and a
// row in SQLite on the /data volume, which outlives the process and the crit.
// Refused actions are logged too: they are the evidence that the server, not
// the browser, decides what each person may change.
export function logEvent(e: Omit<LogEvent, "at">): void {
  const at = new Date().toISOString();
  const row = { at, ...e };
  // a readable line first, then the fields, so a tail can be narrated
  const where = `${e.room}${e.round ? ` r${e.round}` : ""}${e.phase ? ` ${e.phase}` : ""}`;
  console.log(`[${where}] ${e.who ?? "server"} ${e.action}${e.ok ? "" : " REFUSED"}${summary(e.detail)} ${JSON.stringify({ ev: row })}`);
  try {
    insertEvent(row);
  } catch (err) {
    // logging must never take the game down
    console.error("event_log write failed", err);
  }
}

const summary = (d: Record<string, unknown>): string => {
  const parts = Object.entries(d).filter(([, v]) => v !== undefined && v !== null && typeof v !== "object").map(([k, v]) => `${k}=${v}`);
  return parts.length ? ` (${parts.join(", ")})` : "";
};
