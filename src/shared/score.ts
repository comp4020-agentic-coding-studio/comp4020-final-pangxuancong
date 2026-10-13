// Scores inside one game (docs/GAME_LOOP.md): +1 for reaching the flag, +0.2
// to the placer for each other player killed by their spike or launcher. A
// round where everyone made it scores nobody. Kept as events so a round's
// gains and the final table come from the same record.

export interface ScoreEvent {
  round: number;
  playerId: string; // who scores
  name: string;
  kind: "finish" | "kill";
}

export const FINISH_POINTS = 1;
export const KILL_POINTS = 0.2;

// tenths, so 0.2 + 0.2 + 0.2 is 0.6 and not 0.6000000000000001
const points = (finishes: number, kills: number): number => (finishes * FINISH_POINTS * 10 + kills * KILL_POINTS * 10) / 10;

export interface Tally { playerId: string; name: string; points: number; finishes: number; kills: number }

export function tally(events: readonly ScoreEvent[], round?: number): Map<string, Tally> {
  const out = new Map<string, Tally>();
  for (const e of events) {
    if (round !== undefined && e.round !== round) continue;
    const t = out.get(e.playerId) ?? { playerId: e.playerId, name: e.name, points: 0, finishes: 0, kills: 0 };
    if (e.kind === "finish") t.finishes++;
    else t.kills++;
    t.name = e.name;
    t.points = points(t.finishes, t.kills);
    out.set(e.playerId, t);
  }
  return out;
}

// Who, if anyone, scores for a death: the placer of the spike or launcher,
// unless it was their own.
export function killCredit(victimId: string, trap: { type: string; createdById: string } | undefined): string | null {
  if (!trap || (trap.type !== "spike" && trap.type !== "launcher") || !trap.createdById || trap.createdById === victimId) return null;
  return trap.createdById;
}
