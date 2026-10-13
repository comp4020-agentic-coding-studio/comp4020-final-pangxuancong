import { randomUUID } from "node:crypto";
import type { Server, Socket } from "socket.io";
import { CHARACTERS, SPECTATOR } from "../shared/characters.ts";
import { type Item, demolitionError, placementError } from "../shared/level.ts";
import { levelById } from "../shared/levels.ts";
import type { ClientToServer, Handshake, PlayerView, ServerToClient, Snapshot } from "../shared/protocol.ts";
import {
  BUILD_IDLE_MS, BUILD_MAX_MS, MAX_PLAYERS, MAX_ROUNDS, type Player, type RoundState, WIN_POINTS,
  act, canBuild, join, leave, moved, newRoundState, pick, report, runComplete, tick, tooSimple, touchBuild, vote,
} from "../shared/rounds.ts";
import { type ScoreEvent, killCredit, tally } from "../shared/score.ts";
import {
  type LevelRow, currentLevel, destroyItem, finishLevel, insertItem, insertScoreEvent, readItems, readScoreEvents, setRound, startLevel, voidRoundScores,
} from "./db.ts";

// The server's half of the game: the round state machine on a clock, the level
// in SQLite, and the sockets. It owns phase, roster, characters, build
// actions, statuses, items and scores. It does not simulate anyone's movement
// (docs/ARCHITECTURE.md).

type GameSocket = Socket<ClientToServer, ServerToClient>;

const TICK_MS = 200;
// only show the auto-skip deadline once it is this close
const SHOW_DEADLINE_MS = 15_000;

const nameOf = (p: Player): string => (p.character === null ? SPECTATOR.name : CHARACTERS[p.character].name);
const colourOf = (p: Player | undefined): string => (p?.character == null ? SPECTATOR.colour : CHARACTERS[p.character].colour);

export function createGame(io: Server<ClientToServer, ServerToClient>): { levelState: () => { levelId: number; layout: number; round: number; items: Item[] } } {
  // a game in progress resumes in BUILD; with none, players choose a level
  let level: LevelRow | null = currentLevel();
  let items = level ? readItems(level.id) : [];
  let scoreEvents: ScoreEvent[] = level ? readScoreEvents(level.id) : [];
  const state: RoundState = newRoundState(level?.round ?? 1, Date.now(), level ? "BUILD" : "SELECT");
  let levelDone = false;
  let simple = false;
  let traces: { x: number; y: number }[] = [];
  let nextTraces: { x: number; y: number }[] = [];
  // characters of people who have left, for the final table
  const pastCharacters = new Map<string, number>();

  // ms until this player is auto-skipped, once that is close enough to show
  const snapshotDeadline = (p: Player, now: number): number | null => {
    if (state.phase !== "BUILD" || !p.active || p.build !== "WAITING") return null;
    const left = Math.min(BUILD_IDLE_MS - (now - p.lastActivityAt), BUILD_MAX_MS - (now - state.phaseStartedAt));
    return left <= SHOW_DEADLINE_MS ? Math.max(0, left) : null;
  };

  const snapshotFor = (playerId: string | null, now: number): Snapshot => {
    const me = state.players.find((p) => p.id === playerId);
    const totals = tally(scoreEvents);
    const thisRound = tally(scoreEvents, state.round);
    const characterOf = (id: string): number | null => state.players.find((p) => p.id === id)?.character ?? pastCharacters.get(id) ?? null;
    return {
      levelId: level?.id ?? 0,
      layout: level?.layout ?? 1,
      round: state.round,
      maxRounds: MAX_ROUNDS,
      phase: state.phase,
      phaseRemainingMs: state.phaseEndsAt === null ? null : Math.max(0, state.phaseEndsAt - now),
      phaseElapsedMs: now - state.phaseStartedAt,
      buildDeadlineMs: me ? snapshotDeadline(me, now) : null,
      levelDone,
      tooSimple: state.phase === "RESULTS" && simple,
      winPoints: WIN_POINTS,
      maxPlayers: MAX_PLAYERS,
      players: state.players.map(
        (p): PlayerView => ({
          id: p.id, name: nameOf(p), colour: colourOf(p), connected: p.connected, active: p.active, build: p.build, run: p.run,
          points: totals.get(p.id)?.points ?? 0, gained: thisRound.get(p.id)?.points ?? 0, vote: p.vote, pick: p.pick, character: p.character,
        }),
      ),
      // everyone who scored, plus everyone playing now, even on zero
      scores: [
        ...totals.values(),
        ...state.players.filter((p) => p.active && !totals.has(p.id)).map((p) => ({ playerId: p.id, name: nameOf(p), points: 0, finishes: 0, kills: 0 })),
      ]
        .map((t) => {
          const character = characterOf(t.playerId);
          return { ...t, character, colour: character === null ? SPECTATOR.colour : CHARACTERS[character].colour };
        })
        .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name)),
      archivedFrom: level?.parentId ?? null,
      items: level ? items : [],
      traces: state.phase === "BUILD" ? traces : [],
    };
  };

  // Everyone made it: the round's points are void before anyone sees them
  // (nobody died, so they are all flags). Checked as the last runner reports,
  // and on the tick in case the run ended by someone leaving.
  const voidIfTooSimple = (): void => {
    if (state.phase !== "RUN" || !level || !runComplete(state) || !tooSimple(state)) return;
    if (!scoreEvents.some((e) => e.round === state.round)) return;
    scoreEvents = scoreEvents.filter((e) => e.round !== state.round);
    voidRoundScores(level.id, state.round);
  };

  // Everyone gets a fresh snapshot after any change; a quiet tick sends nothing.
  const broadcast = (): void => {
    const now = Date.now();
    for (const [, socket] of io.of("/").sockets) socket.emit("snapshot", snapshotFor(socket.data.playerId ?? null, now));
  };

  // Timeouts can change build or run states inside tick() without a phase
  // transition, so compare what a snapshot would show before and after.
  const signature = (): string => JSON.stringify(state.players.map((p) => [p.id, p.build, p.run, p.connected, p.active, p.vote, p.pick, p.character]));
  let lastDeadlineBroadcast = 0;
  setInterval(() => {
    const now = Date.now();
    const before = signature();
    voidIfTooSimple();
    const best = Math.max(0, ...[...tally(scoreEvents).values()].map((r) => r.points));
    const t = tick(state, now, best);
    if (t?.to === "RESULTS") {
      levelDone = t.levelDone;
      simple = t.tooSimple;
      traces = nextTraces;
      nextTraces = [];
    }
    if (t?.to === "SELECT" && level) {
      finishLevel(level.id, "restarted");
      level = null;
      items = [];
      scoreEvents = [];
      traces = [];
    }
    if (t?.to === "BUILD") {
      if (t.newLevel) {
        // archive: keep building on a copy of this level; otherwise the chosen course, bare
        if (t.archive && level) {
          finishLevel(level.id, "archived");
          level = startLevel(level, level.layout);
        } else {
          level = startLevel(null, t.archive ? 1 : t.layout);
        }
        items = readItems(level.id);
        scoreEvents = [];
        traces = [];
      } else if (level) {
        setRound(level.id, state.round);
      }
      levelDone = false;
    }
    // the near-deadline warning, and the select countdown, refresh once a second
    const counting = state.phase === "SELECT" && state.phaseEndsAt !== null;
    const nearDeadline = now - lastDeadlineBroadcast >= 1000 && (counting || state.players.some((p) => snapshotDeadline(p, now) !== null));
    if (t || nearDeadline || signature() !== before) {
      if (nearDeadline) lastDeadlineBroadcast = now;
      broadcast();
    }
  }, TICK_MS);

  io.on("connection", (socket: GameSocket) => {
    const { playerId } = (socket.handshake.auth ?? {}) as Partial<Handshake>;
    const id = typeof playerId === "string" && playerId.length >= 8 && playerId.length <= 64 ? playerId : randomUUID();
    // one live socket per player: a second connection with the same id takes over
    socket.data.playerId = id;
    for (const [, other] of io.of("/").sockets) if (other !== socket && other.data.playerId === id) other.disconnect(true);
    join(state, id, SPECTATOR.name, Date.now());
    broadcast();
    const me = (): Player | undefined => state.players.find((p) => p.id === id);
    const course = () => levelById(level?.layout);

    socket.on("level:pick", (n) => {
      if (pick(state, id, n, Date.now())) broadcast();
    });

    socket.on("build:preview", (p) => {
      if (!canBuild(state, id)) return;
      touchBuild(state, id, Date.now());
      if (p === null) socket.broadcast.emit("build:preview", { playerId: id, cleared: true });
      else socket.broadcast.emit("build:preview", { playerId: id, choice: p.choice, proposal: p.proposal, targetId: p.targetId });
    });

    socket.on("build:commit", (proposal, ack) => {
      if (typeof ack !== "function") return;
      if (!canBuild(state, id) || !level) return ack({ ok: false, error: "you have already built this round" });
      const error = placementError(course(), items, proposal);
      if (error) return ack({ ok: false, error });
      const item: Item = {
        id: randomUUID(), type: proposal.type, col: proposal.col, row: proposal.row, rot: proposal.rot,
        createdBy: nameOf(me()!), createdById: id, createdRound: state.round,
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
      destroyItem(targetId, nameOf(me()!), state.round);
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
      if (!p || (p.result !== "DEAD" && p.result !== "FINISHED") || !level) return;
      if (!report(state, id, p.result)) return;
      if (p.result === "DEAD" && Number.isFinite(p.x) && Number.isFinite(p.y)) nextTraces.push({ x: Math.round(p.x), y: Math.round(p.y) });
      // +1 for the flag; +0.2 to whoever placed the spike or launcher that killed
      // someone else (the level's own pieces are not in `items`: they credit nobody)
      const scorer = p.result === "FINISHED" ? id : killCredit(id, items.find((i) => i.id === p.by));
      if (scorer) {
        const who = state.players.find((q) => q.id === scorer);
        const name = who ? nameOf(who) : (items.find((i) => i.createdById === scorer)?.createdBy ?? "someone");
        const e: ScoreEvent = { round: state.round, playerId: scorer, name, kind: p.result === "FINISHED" ? "finish" : "kill" };
        scoreEvents.push(e);
        insertScoreEvent(level.id, e);
      }
      voidIfTooSimple();
      broadcast();
    });

    socket.on("level:vote", (v) => {
      if (vote(state, id, v)) broadcast();
    });

    socket.on("disconnect", () => {
      // a takeover by another tab already belongs to the new socket
      if ([...io.of("/").sockets.values()].some((s) => s.data.playerId === id)) return;
      const character = me()?.character;
      if (character != null) pastCharacters.set(id, character);
      leave(state, id);
      socket.broadcast.emit("build:preview", { playerId: id, cleared: true });
      broadcast();
    });
  });

  return { levelState: () => ({ levelId: level?.id ?? 0, layout: level?.layout ?? 1, round: state.round, items }) };
}

const isPose = (p: unknown): p is { x: number; y: number; vx: number; vy: number; facing: -1 | 1 } => {
  if (typeof p !== "object" || p === null) return false;
  const { x, y, vx, vy, facing } = p as Record<string, unknown>;
  return [x, y, vx, vy].every((n) => typeof n === "number" && Number.isFinite(n)) && (facing === -1 || facing === 1);
};
