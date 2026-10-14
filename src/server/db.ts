import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Item } from "../shared/level.ts";
import type { ScoreEvent } from "../shared/score.ts";

// Only the level persists: its round, its placed items and the game's score
// events. Who is here, where they are and how their run went are in memory
// and die with the process
// (docs/ARCHITECTURE.md, "State boundary"). The crit 8 tables (mechanism,
// attempt) may still exist in an old database; nothing reads them.
const dataDir = process.env.DATA_DIR ?? "data";
mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(join(dataDir, "chain-reaction.db"));
// readers (a check, `sqlite3` over ssh) never wait for the game's writes
db.exec("PRAGMA journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS level (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    round INTEGER NOT NULL,
    finished_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS placed_item (
    id TEXT PRIMARY KEY,
    level_id INTEGER NOT NULL REFERENCES level(id),
    type TEXT NOT NULL,
    col INTEGER NOT NULL,
    row INTEGER NOT NULL,
    rot INTEGER NOT NULL,
    created_by TEXT NOT NULL,
    created_round INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    -- demolished items are kept as history, not deleted
    destroyed_by TEXT,
    destroyed_round INTEGER,
    destroyed_at TEXT
  );
  -- who did what: every action a player asked for, allowed or refused, and
  -- what the server did on its own (phases, timeouts). Append only; read with
  -- the activity log tools (docs/ARCHITECTURE.md, "Activity log")
  CREATE TABLE IF NOT EXISTS event_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    room TEXT NOT NULL,
    level_id INTEGER,
    round INTEGER,
    phase TEXT,
    who TEXT, -- "Chicken#3fa9", "Visitor#81c2", or null for the server
    action TEXT NOT NULL,
    ok INTEGER NOT NULL, -- 1 done, 0 refused
    detail TEXT -- JSON: target, reason, position...
  );
  CREATE INDEX IF NOT EXISTS event_log_room ON event_log(room, id);
  CREATE TABLE IF NOT EXISTS score_event (
    level_id INTEGER NOT NULL REFERENCES level(id),
    round INTEGER NOT NULL,
    player_id TEXT NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL, -- finish | kill
    created_at TEXT NOT NULL
  );
`);

// columns added after the first platformer build
const columns = (table: string): string[] => (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
if (!columns("placed_item").includes("created_by_id")) db.exec("ALTER TABLE placed_item ADD COLUMN created_by_id TEXT NOT NULL DEFAULT ''");
if (!columns("level").includes("parent_id")) db.exec("ALTER TABLE level ADD COLUMN parent_id INTEGER REFERENCES level(id)");
// how a finished game ended: archived (built on next game) or restarted
if (!columns("level").includes("outcome")) db.exec("ALTER TABLE level ADD COLUMN outcome TEXT");
// which base course (src/shared/levels.ts)
if (!columns("level").includes("layout")) db.exec("ALTER TABLE level ADD COLUMN layout INTEGER NOT NULL DEFAULT 1");
// which room plays it; games from before rooms belong to the room MAIN
if (!columns("level").includes("room")) db.exec("ALTER TABLE level ADD COLUMN room TEXT NOT NULL DEFAULT 'MAIN'");

const now = (): string => new Date().toISOString();

export interface LevelRow { id: number; round: number; parentId: number | null; layout: number }

// a room's game in play, if any (with none, players choose a level first)
export function currentLevel(room: string): LevelRow | null {
  const row = db.prepare("SELECT id, round, parent_id AS parentId, layout FROM level WHERE room = ? AND finished_at IS NULL ORDER BY id DESC LIMIT 1").get(room) as LevelRow | undefined;
  return row ?? null;
}

// rooms with a game still in play, to reopen when the server starts
export function roomsInPlay(): string[] {
  return (db.prepare("SELECT DISTINCT room FROM level WHERE finished_at IS NULL").all() as { room: string }[]).map((r) => r.room);
}

// whether a room has ever had a game (a share link to it still works)
export function roomExists(room: string): boolean {
  return db.prepare("SELECT 1 FROM level WHERE room = ? LIMIT 1").get(room) !== undefined;
}

// A new game. Archived, it continues on the parent's course with a copy of
// its surviving items (the archived level keeps its own); otherwise it starts
// bare on the chosen course.
export function startLevel(room: string, parent: LevelRow | null, layout: number): LevelRow {
  const t = now();
  const course = parent?.layout ?? layout;
  const { lastInsertRowid } = db.prepare("INSERT INTO level (room, round, parent_id, layout, created_at, updated_at) VALUES (?, 1, ?, ?, ?, ?)").run(room, parent?.id ?? null, course, t, t);
  const id = Number(lastInsertRowid);
  if (parent) for (const item of readItems(parent.id)) insertItem(id, { ...item, id: randomUUID() });
  return { id, round: 1, parentId: parent?.id ?? null, layout: course };
}

export function finishLevel(id: number, outcome: "archived" | "restarted"): void {
  db.prepare("UPDATE level SET finished_at = ?, outcome = ?, updated_at = ? WHERE id = ?").run(now(), outcome, now(), id);
}

export function setRound(id: number, round: number): void {
  db.prepare("UPDATE level SET round = ?, updated_at = ? WHERE id = ?").run(round, now(), id);
}

interface ItemRow { id: string; type: Item["type"]; col: number; row: number; rot: number; created_by: string; created_by_id: string; created_round: number }

export function readItems(levelId: number): Item[] {
  const rows = db
    .prepare("SELECT id, type, col, row, rot, created_by, created_by_id, created_round FROM placed_item WHERE level_id = ? AND destroyed_at IS NULL ORDER BY created_at, rowid")
    .all(levelId) as unknown as ItemRow[];
  return rows.map((r) => ({
    id: r.id, type: r.type, col: r.col, row: r.row, rot: r.rot,
    createdBy: r.created_by, createdById: r.created_by_id, createdRound: r.created_round,
  }));
}

export function insertItem(levelId: number, item: Item): void {
  db.prepare(
    "INSERT INTO placed_item (id, level_id, type, col, row, rot, created_by, created_by_id, created_round, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(item.id, levelId, item.type, item.col, item.row, item.rot, item.createdBy, item.createdById, item.createdRound, now());
}

export function readScoreEvents(levelId: number): ScoreEvent[] {
  return db.prepare("SELECT round, player_id AS playerId, name, kind FROM score_event WHERE level_id = ? ORDER BY rowid").all(levelId) as unknown as ScoreEvent[];
}

export function insertScoreEvent(levelId: number, e: ScoreEvent): void {
  db.prepare("INSERT INTO score_event (level_id, round, player_id, name, kind, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(levelId, e.round, e.playerId, e.name, e.kind, now());
}

// A round where everyone made it scores nobody: its points are taken back.
export function voidRoundScores(levelId: number, round: number): void {
  db.prepare("DELETE FROM score_event WHERE level_id = ? AND round = ?").run(levelId, round);
}

export function destroyItem(id: string, by: string, round: number): void {
  db.prepare("UPDATE placed_item SET destroyed_by = ?, destroyed_round = ?, destroyed_at = ? WHERE id = ?").run(by, round, now(), id);
}

export interface LogEvent { at: string; room: string; levelId: number | null; round: number | null; phase: string | null; who: string | null; action: string; ok: boolean; detail: Record<string, unknown> }

export function insertEvent(e: LogEvent): void {
  db.prepare("INSERT INTO event_log (at, room, level_id, round, phase, who, action, ok, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    e.at, e.room, e.levelId, e.round, e.phase, e.who, e.action, e.ok ? 1 : 0, JSON.stringify(e.detail),
  );
}

// the latest events, newest last, for /api/rooms/:code/log and checks
export function readEvents(room: string, limit = 200): LogEvent[] {
  const rows = db
    .prepare("SELECT at, room, level_id AS levelId, round, phase, who, action, ok, detail FROM event_log WHERE room = ? ORDER BY id DESC LIMIT ?")
    .all(room, limit) as unknown as (Omit<LogEvent, "ok" | "detail"> & { ok: number; detail: string })[];
  return rows.reverse().map((r) => ({ ...r, ok: r.ok === 1, detail: JSON.parse(r.detail) as Record<string, unknown> }));
}
