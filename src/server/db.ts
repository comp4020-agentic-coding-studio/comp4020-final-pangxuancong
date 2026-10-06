import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Item } from "../shared/level.ts";

// Only the level persists: its round and its placed items. Who is here, where
// they are and how their run went are in memory and die with the process
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
`);

const now = (): string => new Date().toISOString();

export interface LevelRow { id: number; round: number }

// the level in play, or a fresh one
export function currentLevel(): LevelRow {
  const row = db.prepare("SELECT id, round FROM level WHERE finished_at IS NULL ORDER BY id DESC LIMIT 1").get() as LevelRow | undefined;
  return row ?? startLevel();
}

export function startLevel(): LevelRow {
  const t = now();
  const { lastInsertRowid } = db.prepare("INSERT INTO level (round, created_at, updated_at) VALUES (1, ?, ?)").run(t, t);
  return { id: Number(lastInsertRowid), round: 1 };
}

export function finishLevel(id: number): void {
  db.prepare("UPDATE level SET finished_at = ?, updated_at = ? WHERE id = ?").run(now(), now(), id);
}

export function setRound(id: number, round: number): void {
  db.prepare("UPDATE level SET round = ?, updated_at = ? WHERE id = ?").run(round, now(), id);
}

interface ItemRow { id: string; type: Item["type"]; col: number; row: number; rot: number; created_by: string; created_round: number }

export function readItems(levelId: number): Item[] {
  const rows = db
    .prepare("SELECT id, type, col, row, rot, created_by, created_round FROM placed_item WHERE level_id = ? AND destroyed_at IS NULL ORDER BY created_at, rowid")
    .all(levelId) as unknown as ItemRow[];
  return rows.map((r) => ({ id: r.id, type: r.type, col: r.col, row: r.row, rot: r.rot ? 1 : 0, createdBy: r.created_by, createdRound: r.created_round }));
}

export function insertItem(levelId: number, item: Item): void {
  db.prepare(
    "INSERT INTO placed_item (id, level_id, type, col, row, rot, created_by, created_round, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(item.id, levelId, item.type, item.col, item.row, item.rot, item.createdBy, item.createdRound, now());
}

export function destroyItem(id: string, by: string, round: number): void {
  db.prepare("UPDATE placed_item SET destroyed_by = ?, destroyed_round = ?, destroyed_at = ? WHERE id = ?").run(by, round, now(), id);
}
