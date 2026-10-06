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

const now = (): string => new Date().toISOString();

export interface LevelRow { id: number; round: number; parentId: number | null }

// the level in play, or a fresh one
export function currentLevel(): LevelRow {
  const row = db.prepare("SELECT id, round, parent_id AS parentId FROM level WHERE finished_at IS NULL ORDER BY id DESC LIMIT 1").get() as LevelRow | undefined;
  return row ?? startLevel(null);
}

// A new game. Built on an archived level, it starts with a copy of that
// level's surviving items; the archived level keeps its own.
export function startLevel(parentId: number | null): LevelRow {
  const t = now();
  const { lastInsertRowid } = db.prepare("INSERT INTO level (round, parent_id, created_at, updated_at) VALUES (1, ?, ?, ?)").run(parentId, t, t);
  const id = Number(lastInsertRowid);
  if (parentId !== null) for (const item of readItems(parentId)) insertItem(id, { ...item, id: randomUUID() });
  return { id, round: 1, parentId };
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

export function destroyItem(id: string, by: string, round: number): void {
  db.prepare("UPDATE placed_item SET destroyed_by = ?, destroyed_round = ?, destroyed_at = ? WHERE id = ?").run(by, round, now(), id);
}
