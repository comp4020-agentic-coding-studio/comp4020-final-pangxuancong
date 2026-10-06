import { randomUUID } from "node:crypto";
import type { Server, Socket } from "socket.io";
import { type Item, demolitionError, placementError } from "../shared/level.ts";
import type { ClientToServer, Handshake, PlayerView, ServerToClient, Snapshot } from "../shared/protocol.ts";
import {
  BUILD_IDLE_MS, BUILD_MAX_MS, MAX_PLAYERS, MAX_ROUNDS, type RoundState,
  act, canBuild, join, leave, moved, newRoundState, report, tick, touchBuild, vote,
} from "../shared/rounds.ts";
import { type ScoreEvent, killCredit, tally } from "../shared/score.ts";
import {
  currentLevel, destroyItem, finishLevel, insertItem, insertScoreEvent, readItems, readScoreEvents, setRound, startLevel,
} from "./db.ts";

// The server's half of the game: the round state machine on a clock, the level
// in SQLite, and the sockets. It owns phase, roster, build actions, statuses
// and items. It does not simulate anyone's movement (docs/ARCHITECTURE.md).

type GameSocket = Socket<ClientToServer, ServerToClient>;

const TICK_MS = 200;
// only show the auto-skip deadline once it is this close
const SHOW_DEADLINE_MS = 15_000;
const COLOURS = ["#c0654f", "#5f87b0", "#d1a13f", "#6f9461", "#9a6fa8", "#4f9a99", "#c27a9a", "#8a7a52"];
const ANIMALS = ["Fox", "Moth", "Crow", "Hare", "Wren", "Newt", "Otter", "Finch", "Mole", "Heron"];
const ADJECTIVES = ["Quiet", "Blue", "Paper", "Small", "Brave", "Amber", "Swift", "Mossy", "Sleepy", "Bright"];

export function createGame(io: Server<ClientToServer, ServerToClient>): { levelState: () => { levelId: number; round: number; items: Item[] } } {
  let level = currentLevel();
  let items = readItems(level.id);
  let scoreEvents: ScoreEvent[] = readScoreEvents(level.id);
  // after a restart the level reloads and the session safely returns to BUILD
  const state: RoundState = newRoundState(level.round, Date.now());
  let levelDone = false;
  let traces: { x: number; y: number }[] = [];
  let nextTraces: { x: number; y: number }[] = [];
  const colours = new Map<string, string>();

  const colourOf = (id: string): string => {
    let c = colours.get(id);
    if (!c) {
      const used = new Set(state.players.map((p) => colours.get(p.id)));
      c = COLOURS.find((x) => !used.has(x)) ?? COLOURS[colours.size % COLOURS.length];
      colours.set(id, c);
    }
    return c;
  };

  // ms until this player is auto-skipped, once that is close enough to show
  const snapshotDeadline = (p: RoundState["players"][number], now: number): number | null => {
    if (state.phase !== "BUILD" || !p.active || p.build !== "WAITING") return null;
    const left = Math.min(BUILD_IDLE_MS - (now - p.lastActivityAt), BUILD_MAX_MS - (now - state.phaseStartedAt));
    return left <= SHOW_DEADLINE_MS ? Math.max(0, left) : null;
  };

  const snapshotFor = (playerId: string | null, now: number): Snapshot => {
    const me = state.players.find((p) => p.id === playerId);
    const totals = tally(scoreEvents);
    const thisRound = tally(scoreEvents, state.round);
    return {
      levelId: level.id,
      round: state.round,
      maxRounds: MAX_ROUNDS,
      phase: state.phase,
      phaseRemainingMs: state.phaseEndsAt === null ? null : Math.max(0, state.phaseEndsAt - now),
      phaseElapsedMs: now - state.phaseStartedAt,
      buildDeadlineMs: me ? snapshotDeadline(me, now) : null,
      levelDone,
      maxPlayers: MAX_PLAYERS,
      players: state.players.map(
        (p): PlayerView => ({
          id: p.id, name: p.name, colour: colourOf(p.id), connected: p.connected, active: p.active, build: p.build, run: p.run,
          points: totals.get(p.id)?.points ?? 0, gained: thisRound.get(p.id)?.points ?? 0, vote: p.vote,
        }),
      ),
      // everyone who scored, plus everyone playing now, even on zero
      scores: [
        ...totals.values(),
        ...state.players.filter((p) => p.active && !totals.has(p.id)).map((p) => ({ playerId: p.id, name: p.name, points: 0, finishes: 0, kills: 0 })),
      ]
        .map((t) => ({ ...t, colour: colourOf(t.playerId) }))
        .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name)),
      archivedFrom: level.parentId,
      items,
      traces: state.phase === "BUILD" ? traces : [],
    };
  };

  // Everyone gets a fresh snapshot after any change; a quiet tick sends nothing.
  const broadcast = (): void => {
    const now = Date.now();
    for (const [, socket] of io.of("/").sockets) socket.emit("snapshot", snapshotFor(socket.data.playerId ?? null, now));
  };

  // Timeouts can change build or run states inside tick() without a phase
  // transition, so compare what a snapshot would show before and after.
  const signature = (): string => JSON.stringify(state.players.map((p) => [p.id, p.build, p.run, p.connected, p.active, p.vote]));
  let lastDeadlineBroadcast = 0;
  setInterval(() => {
    const now = Date.now();
    const before = signature();
    const t = tick(state, now);
    if (t?.to === "RESULTS") {
      levelDone = t.levelDone;
      traces = nextTraces;
      nextTraces = [];
    }
    if (t?.to === "BUILD") {
      if (t.newLevel) {
        // archive: keep building on a copy of this level; restart: bare
        finishLevel(level.id, t.archive ? "archived" : "restarted");
        level = startLevel(t.archive ? level.id : null);
        items = readItems(level.id);
        scoreEvents = [];
        traces = [];
      } else {
        setRound(level.id, state.round);
      }
      levelDone = false;
    }
    // the near-deadline warning is refreshed once a second
    const nearDeadline = now - lastDeadlineBroadcast >= 1000 && state.players.some((p) => snapshotDeadline(p, now) !== null);
    if (t || nearDeadline || signature() !== before) {
      if (nearDeadline) lastDeadlineBroadcast = now;
      broadcast();
    }
  }, TICK_MS);

  io.on("connection", (socket: GameSocket) => {
    const { playerId, name } = (socket.handshake.auth ?? {}) as Partial<Handshake>;
    const id = typeof playerId === "string" && playerId.length >= 8 && playerId.length <= 64 ? playerId : randomUUID();
    const display = typeof name === "string" && name.trim() ? name.trim().slice(0, 24) : `${pick(ADJECTIVES)} ${pick(ANIMALS)}`;
    // one live socket per player: a second connection with the same id takes over
    socket.data.playerId = id;
    for (const [, other] of io.of("/").sockets) if (other !== socket && other.data.playerId === id) other.disconnect(true);
    join(state, id, display, Date.now());
    broadcast();

    socket.on("build:preview", (p) => {
      if (!canBuild(state, id)) return;
      touchBuild(state, id, Date.now());
      if (p === null) socket.broadcast.emit("build:preview", { playerId: id, cleared: true });
      else socket.broadcast.emit("build:preview", { playerId: id, choice: p.choice, proposal: p.proposal, targetId: p.targetId });
    });

    socket.on("build:commit", (proposal, ack) => {
      if (typeof ack !== "function") return;
      if (!canBuild(state, id)) return ack({ ok: false, error: "you have already built this round" });
      const error = placementError(items, proposal);
      if (error) return ack({ ok: false, error });
      const item: Item = {
        id: randomUUID(), type: proposal.type, col: proposal.col, row: proposal.row, rot: proposal.rot,
        createdBy: display, createdById: id, createdRound: state.round,
      };
      insertItem(level.id, item);
      items = [...items, item];
      act(state, id, "PLACED");
      socket.broadcast.emit("build:preview", { playerId: id, cleared: true });
      ack({ ok: true });
      broadcast();
    });

    socket.on("build:bomb", (targetId, ack) => {
      if (typeof ack !== "function") return;
      if (!canBuild(state, id)) return ack({ ok: false, error: "you have already built this round" });
      const error = demolitionError(items, targetId);
      if (error) return ack({ ok: false, error });
      destroyItem(targetId, display, state.round);
      items = items.filter((i) => i.id !== targetId);
      act(state, id, "PLACED");
      socket.broadcast.emit("build:preview", { playerId: id, cleared: true });
      ack({ ok: true });
      broadcast();
    });

    socket.on("build:skip", (ack) => {
      if (typeof ack !== "function") return;
      if (!act(state, id, "SKIPPED")) return ack({ ok: false, error: "nothing to skip" });
      socket.broadcast.emit("build:preview", { playerId: id, cleared: true });
      ack({ ok: true });
      broadcast();
    });

    let last = { x: NaN, y: NaN };
    socket.on("run:pose", (p) => {
      if (state.phase !== "RUN" || !isPose(p)) return;
      if (Math.abs(p.x - last.x) > 2 || Math.abs(p.y - last.y) > 2) {
        moved(state, id, Date.now());
        last = { x: p.x, y: p.y };
      }
      socket.volatile.broadcast.emit("run:pose", { playerId: id, x: p.x, y: p.y, vx: p.vx, vy: p.vy, facing: p.facing });
    });

    socket.on("run:result", (p) => {
      if (!p || (p.result !== "DEAD" && p.result !== "FINISHED")) return;
      if (!report(state, id, p.result)) return;
      if (p.result === "DEAD" && Number.isFinite(p.x) && Number.isFinite(p.y)) nextTraces.push({ x: Math.round(p.x), y: Math.round(p.y) });
      // +1 for the flag; +0.2 to whoever placed the spike that killed someone else
      const scorer = p.result === "FINISHED" ? id : killCredit(id, items.find((i) => i.id === p.by));
      if (scorer) {
        const name = state.players.find((q) => q.id === scorer)?.name ?? items.find((i) => i.createdById === scorer)?.createdBy ?? "someone";
        const e: ScoreEvent = { round: state.round, playerId: scorer, name, kind: p.result === "FINISHED" ? "finish" : "kill" };
        scoreEvents.push(e);
        insertScoreEvent(level.id, e);
      }
      broadcast();
    });

    socket.on("level:vote", (v) => {
      if (vote(state, id, v)) broadcast();
    });

    socket.on("disconnect", () => {
      // a takeover by another tab already belongs to the new socket
      if ([...io.of("/").sockets.values()].some((s) => s.data.playerId === id)) return;
      leave(state, id);
      socket.broadcast.emit("build:preview", { playerId: id, cleared: true });
      broadcast();
    });
  });

  return { levelState: () => ({ levelId: level.id, round: state.round, items }) };
}

const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

const isPose = (p: unknown): p is { x: number; y: number; vx: number; vy: number; facing: -1 | 1 } => {
  if (typeof p !== "object" || p === null) return false;
  const { x, y, vx, vy, facing } = p as Record<string, unknown>;
  return [x, y, vx, vy].every((n) => typeof n === "number" && Number.isFinite(n)) && (facing === -1 || facing === 1);
};
