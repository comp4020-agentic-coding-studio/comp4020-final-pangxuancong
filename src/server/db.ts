import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { RAMP, type RunPlan } from "../shared/simulation.ts";

// Only the machine persists: its settings and its attempts. Who is here, and
// who holds which part, is in memory and dies with the process
// (docs/ARCHITECTURE.md, "State boundary").
const dataDir = process.env.DATA_DIR ?? "data";
mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(join(dataDir, "chain-reaction.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS mechanism (
    id TEXT PRIMARY KEY,
    value REAL NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS attempt (
    run_id TEXT PRIMARY KEY,
    angle REAL NOT NULL,
    result TEXT NOT NULL,
    reason TEXT,
    miss_by INTEGER,
    created_at TEXT NOT NULL
  );
`);
db.prepare("INSERT OR IGNORE INTO mechanism (id, value, updated_at) VALUES ('ramp', ?, ?)").run(
  RAMP.initial,
  new Date().toISOString(),
);

export interface MachineState {
  ramp: { angle: number; updatedAt: string };
  attempts: number;
  lastRun: { runId: string; result: string; reason: string | null; missBy: number | null; angle: number; at: string } | null;
}

export function readMachine(): MachineState {
  const ramp = db.prepare("SELECT value, updated_at FROM mechanism WHERE id = 'ramp'").get() as {
    value: number;
    updated_at: string;
  };
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM attempt").get() as { n: number };
  const last = db
    .prepare("SELECT run_id, result, reason, miss_by, angle, created_at FROM attempt ORDER BY created_at DESC, rowid DESC LIMIT 1")
    .get() as
    | { run_id: string; result: string; reason: string | null; miss_by: number | null; angle: number; created_at: string }
    | undefined;
  return {
    ramp: { angle: ramp.value, updatedAt: ramp.updated_at },
    attempts: n,
    lastRun: last
      ? { runId: last.run_id, result: last.result, reason: last.reason, missBy: last.miss_by, angle: last.angle, at: last.created_at }
      : null,
  };
}

export function setRampAngle(angle: number): void {
  db.prepare("UPDATE mechanism SET value = ?, updated_at = ? WHERE id = 'ramp'").run(angle, new Date().toISOString());
}

export function recordAttempt(plan: RunPlan): void {
  db.prepare("INSERT INTO attempt (run_id, angle, result, reason, miss_by, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    plan.runId,
    plan.angle,
    plan.result,
    plan.reason,
    plan.missBy,
    new Date().toISOString(),
  );
}
