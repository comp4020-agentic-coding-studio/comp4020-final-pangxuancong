import { randomUUID } from "node:crypto";
import type { Server, Socket } from "socket.io";
import { CHARACTERS, SPECTATOR } from "../shared/characters.ts";
import { type Item, demolitionError, placementError } from "../shared/level.ts";
import { levelById } from "../shared/levels.ts";
import { type ClientToServer, type Handshake, PROTOCOL, type PlayerView, type ServerToClient, type Snapshot } from "../shared/protocol.ts";
import {
  BUILD_IDLE_MS, BUILD_MAX_MS, MAX_PLAYERS, MAX_ROUNDS, type Player, type RoundState, SEAT_HOLD_MS, WIN_POINTS,
  act, canBuild, claim, join, leave, moved, newRoundState, pick, report, runComplete, tick, tooSimple, touchBuild, unclaim,
} from "../shared/rounds.ts";
import { type ScoreEvent, killCredit, tally } from "../shared/score.ts";
import { tagOf } from "./identity.ts";
import { logEvent } from "./log.ts";
import {
  type LevelRow, type LogEvent, currentLevel, readEvents, roomExists, roomsInPlay, destroyItem, finishLevel, insertItem, insertScoreEvent, readItems, readScoreEvents, setRound, startLevel, voidRoundScores,
} from "./db.ts";

// The server's half of the game: rooms, each with the round state machine on
// a clock, its level in SQLite, and its sockets. A room owns its phase,
// roster, seats, build actions, statuses, items and scores. Nothing here
// simulates anyone's movement (docs/ARCHITECTURE.md).

type GameSocket = Socket<ClientToServer, ServerToClient>;
type IO = Server<ClientToServer, ServerToClient>;

// Rooms are named by a short code: /r/ABCD. No vowels, so codes never spell
// words; no 0/O or 1/I to misread.
const CODE_CHARS = "BCDFGHJKLMNPQRSTVWXZ23456789";
export const isRoomCode = (v: unknown): v is string => typeof v === "string" && /^[A-Z0-9]{4,8}$/.test(v);
// An empty room leaves the lobby list after this: as long as a dropped
// player's seat is held, so they can still find their way back. Its link
// keeps working and its level stays (docs/MULTIPLAYER.md).
// (ROOM_LISTED_MS shortens both, for checking it without waiting.)
const short = Number(process.env.ROOM_LISTED_MS) || 0;
export const LISTED_MS = short || SEAT_HOLD_MS;
// a room made but never entered, after this
export const UNVISITED_MS = short ? short / 2 : 60_000;
// and is dropped from memory after this, once empty
const FORGET_MS = 60 * 60_000;

export interface RoomSummary { code: string; layout: number | null; phase: string; round: number; seated: number; here: number; maxPlayers: number; characters: number[] }

export function createRooms(io: IO): {
  list: () => RoomSummary[];
  create: () => string;
  exists: (code: string) => boolean;
  levelState: (code: string) => { levelId: number; layout: number; round: number; items: Item[] } | null;
  log: (code: string, limit: number) => LogEvent[] | null;
} {
  const rooms = new Map<string, Room>();
  const open = (code: string): Room => {
    let r = rooms.get(code);
    if (!r) rooms.set(code, (r = createRoom(code)));
    return r;
  };
  const exists = (code: string): boolean => rooms.has(code) || roomExists(code);
  // Rooms with a game in play before a restart are opened again, level as it
  // was, but not listed until someone comes back: a restart must not fill
  // the lobby with rooms nobody is in.
  for (const code of roomsInPlay()) if (isRoomCode(code)) open(code).unlist();

  // forget rooms long empty, so a long-running server does not hold them all
  setInterval(() => {
    const now = Date.now();
    for (const [code, r] of rooms) if (r.sockets.size === 0 && now - r.lastSeenAt() > FORGET_MS) {
      r.stop();
      rooms.delete(code);
    }
  }, 60_000);

  io.on("connection", (socket: GameSocket) => {
    const { room } = (socket.handshake.auth ?? {}) as Partial<Handshake>;
    // a link to a room that never existed, or a malformed one, gets nothing
    if (!isRoomCode(room) || !exists(room)) {
      socket.emit("room:missing");
      socket.disconnect(true);
      return;
    }
    open(room).connect(socket);
  });

  return {
    list: () => {
      const now = Date.now();
      return [...rooms.values()]
        .filter((r) => r.listed(now))
        .map((r) => r.summary())
        .sort((a, b) => b.here - a.here || a.code.localeCompare(b.code));
    },
    create: () => {
      let code: string;
      do code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
      while (exists(code));
      open(code);
      return code;
    },
    exists,
    levelState: (code) => (exists(code) ? open(code).levelState() : null),
    // the activity log: names are public tags, so it is safe to show. It
    // outlives the room: a room made but never played is gone after a restart,
    // but what happened in it can still be read
    log: (code, limit) => {
      const events = readEvents(code, limit);
      return events.length || exists(code) ? events : null;
    },
  };
}

interface Room {
  sockets: Set<GameSocket>;
  connect: (socket: GameSocket) => void;
  summary: () => RoomSummary;
  levelState: () => { levelId: number; layout: number; round: number; items: Item[] };
  lastSeenAt: () => number;
  listed: (now: number) => boolean;
  unlist: () => void;
  stop: () => void;
}

const TICK_MS = 200;
// only show the auto-skip deadline once it is this close
const SHOW_DEADLINE_MS = 15_000;

const nameOf = (p: Player): string => (p.character === null ? SPECTATOR.name : CHARACTERS[p.character].name);
// how a player appears in the logs: their character (or Visitor) and tag
const whoOf = (p: Player | undefined, id: string): string => `${p ? nameOf(p) : SPECTATOR.name}#${tagOf(id)}`;
const colourOf = (p: Player | undefined): string => (p?.character == null ? SPECTATOR.colour : CHARACTERS[p.character].colour);

function createRoom(code: string): Room {
  const sockets = new Set<GameSocket>();
  let lastSeen = Date.now();
  let visited = false; // anyone has connected since it was made (or reopened)
  let hidden = false; // reopened after a restart, nobody back yet
  // a game in progress resumes in BUILD; with none, players choose a level
  let level: LevelRow | null = currentLevel(code);
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

  // Everything sent out names people by their public tag, never their
  // playerId (src/server/identity.ts): a snapshot, a preview or a pose.
  const pub = tagOf;
  const publicItem = (i: Item): Item => (i.createdById ? { ...i, createdById: pub(i.createdById) } : i);

  const snapshotFor = (playerId: string | null, now: number): Snapshot => {
    const me = state.players.find((p) => p.id === playerId);
    const totals = tally(scoreEvents);
    const thisRound = tally(scoreEvents, state.round);
    const characterOf = (id: string): number | null => state.players.find((p) => p.id === id)?.character ?? pastCharacters.get(id) ?? null;
    return {
      protocol: PROTOCOL,
      room: code,
      you: playerId ? pub(playerId) : "",
      draw: state.phase === "DRAW" ? state.draw : null,
      keepable: state.keepable,
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
          id: pub(p.id), name: nameOf(p), colour: colourOf(p), connected: p.connected, active: p.active, build: p.build, run: p.run,
          points: totals.get(p.id)?.points ?? 0, gained: thisRound.get(p.id)?.points ?? 0, pick: p.pick, character: p.character,
        }),
      ),
      // everyone who scored, plus everyone playing now, even on zero
      scores: [
        ...totals.values(),
        ...state.players.filter((p) => p.active && !totals.has(p.id)).map((p) => ({ playerId: p.id, name: nameOf(p), points: 0, finishes: 0, kills: 0 })),
      ]
        .map((t) => {
          const character = characterOf(t.playerId);
          return { ...t, playerId: pub(t.playerId), character, colour: character === null ? SPECTATOR.colour : CHARACTERS[character].colour };
        })
        .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name)),
      archivedFrom: level?.parentId ?? null,
      items: level ? items.map(publicItem) : [],
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

  // One line of the activity log, with where the room is now.
  const log = (who: string | null, action: string, ok: boolean, detail: Record<string, unknown> = {}): void =>
    logEvent({ room: code, levelId: level?.id ?? null, round: level ? state.round : null, phase: state.phase, who, action, ok, detail });
  // what a piece is, for the log: "spike by Big Dog#81c2 at 12,20"
  const describe = (i: Item | undefined): string | undefined =>
    i && `${i.type} by ${i.createdBy}${i.createdById ? `#${tagOf(i.createdById)}` : ""} at ${i.col},${i.row}`;

  // Everyone gets a fresh snapshot after any change; a quiet tick sends nothing.
  const broadcast = (): void => {
    const now = Date.now();
    for (const socket of sockets) socket.emit("snapshot", snapshotFor(socket.data.playerId ?? null, now));
  };
  // to everyone else in this room
  const others = (from: GameSocket): GameSocket[] => [...sockets].filter((s) => s !== from);

  // Timeouts can change build or run states inside tick() without a phase
  // transition, so compare what a snapshot would show before and after.
  const signature = (): string => JSON.stringify(state.players.map((p) => [p.id, p.build, p.run, p.connected, p.active, p.pick, p.character]));
  let lastDeadlineBroadcast = 0;
  // what the server decided on its own this tick: auto-skips, run timeouts,
  // seats released, phase changes
  const logChanges = (prev: Map<string, { build: string; run: string | null; character: number | null }>, t: ReturnType<typeof tick>): void => {
    for (const [id, was] of prev) {
      const p = state.players.find((q) => q.id === id);
      const who = `${was.character === null ? SPECTATOR.name : CHARACTERS[was.character].name}#${tagOf(id)}`;
      if (!p) {
        if (was.character !== null) log(who, "seat:released", true, { reason: "not back within the seat hold" });
        continue;
      }
      if (was.build === "WAITING" && p.build === "SKIPPED" && !t) log(who, "build:auto-skip", true, { reason: "idle" });
      if (was.build === "WAITING" && p.build === "DISCONNECTED") log(who, "build:dropped", true, { reason: "connection lost past the grace" });
      if (was.run === "RUNNING" && p.run === "DEAD") log(who, "run:timeout", true, { reason: "did not move" });
      if (was.run === "RUNNING" && p.run === "DISCONNECTED") log(who, "run:dropped", true, { reason: "connection lost past the grace" });
    }
  };

  const timer = setInterval(() => {
    const now = Date.now();
    const before = signature();
    const prev = new Map(state.players.map((p) => [p.id, { build: p.build, run: p.run, character: p.character }]));
    voidIfTooSimple();
    const best = Math.max(0, ...[...tally(scoreEvents).values()].map((r) => r.points));
    const t = tick(state, now, best);
    logChanges(prev, t);
    if (t?.to === "RESULTS") {
      levelDone = t.levelDone;
      simple = t.tooSimple;
      traces = nextTraces;
      nextTraces = [];
    }
    if (t?.to === "BUILD") {
      if (t.newLevel) {
        // keep: build on a copy of the level just played; otherwise the chosen course, bare
        if (t.archive && level) {
          finishLevel(level.id, "archived");
          level = startLevel(code, level, level.layout);
        } else {
          if (level) finishLevel(level.id, "restarted");
          level = startLevel(code, null, t.archive ? 1 : t.layout);
        }
        items = readItems(level.id);
        scoreEvents = [];
        traces = [];
      } else if (level) {
        setRound(level.id, state.round);
      }
      levelDone = false;
    }
    if (t) {
      const detail: Record<string, unknown> = { level: level?.layout };
      if (t.to === "RESULTS") Object.assign(detail, { tooSimple: t.tooSimple, gameOver: t.levelDone });
      if (t.to === "DRAW") Object.assign(detail, { options: state.draw!.options.map((o) => `${o.layout === 0 ? "keep" : `map ${o.layout}`}:${o.votes}`).join(" "), drawn: state.draw!.result === 0 ? "keep" : `map ${state.draw!.result}`, at: state.draw!.land });
      if (t.to === "BUILD" && t.newLevel) Object.assign(detail, { newGame: level?.id, kept: t.archive });
      log(null, `phase:${t.to}`, true, detail);
    }
    // the near-deadline warning, and the select countdown, refresh once a second
    const counting = (state.phase === "SELECT" || state.phase === "DRAW") && state.phaseEndsAt !== null;
    const nearDeadline = now - lastDeadlineBroadcast >= 1000 && (counting || state.players.some((p) => snapshotDeadline(p, now) !== null));
    if (t || nearDeadline || signature() !== before) {
      if (nearDeadline) lastDeadlineBroadcast = now;
      broadcast();
    }
  }, TICK_MS);

  const connect = (socket: GameSocket): void => {
    const { playerId } = (socket.handshake.auth ?? {}) as Partial<Handshake>;
    const id = typeof playerId === "string" && playerId.length >= 8 && playerId.length <= 64 ? playerId : randomUUID();
    // one live socket per player: a second connection with the same id takes over
    socket.data.playerId = id;
    for (const other of sockets) if (other.data.playerId === id) {
      sockets.delete(other);
      other.disconnect(true);
    }
    sockets.add(socket);
    lastSeen = Date.now();
    visited = true;
    hidden = false;
    const returning = state.players.find((p) => p.id === id);
    join(state, id, SPECTATOR.name, Date.now());
    const me = (): Player | undefined => state.players.find((p) => p.id === id);
    const who = (): string => whoOf(me(), id);
    log(who(), returning ? "reconnect" : "join", true, returning?.character != null ? { seat: "kept" } : {});
    broadcast();
    const course = () => levelById(level?.layout);
    // refuse, tell the browser, and log it
    const refuse = (ack: ((r: { ok: false; error: string }) => void) | null, action: string, reason: string, detail: Record<string, unknown> = {}): void => {
      log(who(), action, false, { reason, ...detail });
      ack?.({ ok: false, error: reason });
    };

    socket.on("level:pick", (n) => {
      const before = me()?.pick;
      if (!pick(state, id, n, Date.now())) return refuse(null, "pick", me()?.character == null ? "no seat" : "not choosing now", { sign: n });
      if (before !== n) log(who(), "pick", true, { sign: n === null ? "none" : n === 0 ? "keep" : `map ${n}` });
      broadcast();
    });

    socket.on("seat:claim", (character) => {
      const before = me()?.character;
      if (!claim(state, id, character, Date.now())) {
        const holder = state.players.find((p) => p.character === character);
        return refuse(null, "seat:claim", holder ? `taken by ${whoOf(holder, holder.id)}` : "cannot change seat during a game", { character: CHARACTERS[character]?.name });
      }
      if (before !== character) log(who(), "seat:claim", true, { was: before == null ? "Visitor" : CHARACTERS[before].name });
      broadcast();
    });

    socket.on("seat:leave", () => {
      const was = who();
      if (!unclaim(state, id)) return refuse(null, "seat:leave", "only while choosing a map");
      log(was, "seat:leave", true);
      broadcast();
    });

    socket.on("build:preview", (p) => {
      if (!canBuild(state, id)) return;
      touchBuild(state, id, Date.now());
      for (const o of others(socket)) o.emit("build:preview", p === null ? { playerId: pub(id), cleared: true } : { playerId: pub(id), choice: p.choice, proposal: p.proposal, targetId: p.targetId });
    });

    socket.on("build:commit", (proposal, ack) => {
      if (typeof ack !== "function") return;
      const spot = proposal && typeof proposal === "object" ? { piece: proposal.type, at: `${proposal.col},${proposal.row}` } : {};
      if (!canBuild(state, id) || !level) return refuse(ack, "build:place", buildRefusal(), spot);
      const error = placementError(course(), items, proposal);
      if (error) return refuse(ack, "build:place", error, spot);
      const item: Item = {
        id: randomUUID(), type: proposal.type, col: proposal.col, row: proposal.row, rot: proposal.rot,
        createdBy: nameOf(me()!), createdById: id, createdRound: state.round,
      };
      insertItem(level.id, item);
      items = [...items, item];
      act(state, id, "PLACED");
      log(who(), "build:place", true, spot);
      for (const o of others(socket)) o.emit("build:preview", { playerId: pub(id), cleared: true });
      ack({ ok: true });
      broadcast();
    });

    socket.on("build:bomb", (targetId, ack) => {
      if (typeof ack !== "function") return;
      const target = items.find((i) => i.id === targetId);
      const named = { target: describe(target) ?? String(targetId) };
      if (!canBuild(state, id)) return refuse(ack, "build:bomb", buildRefusal(), named);
      const error = demolitionError(items, targetId);
      if (error) return refuse(ack, "build:bomb", error, named);
      destroyItem(targetId, nameOf(me()!), state.round);
      items = items.filter((i) => i.id !== targetId);
      act(state, id, "PLACED");
      // whose piece it was: the Bomb may remove anyone's (ADR 0003)
      log(who(), "build:bomb", true, { ...named, own: target!.createdById === id });
      for (const o of others(socket)) o.emit("build:preview", { playerId: pub(id), cleared: true });
      ack({ ok: true });
      broadcast();
    });

    socket.on("build:skip", (ack) => {
      if (typeof ack !== "function") return;
      if (!act(state, id, "SKIPPED")) return refuse(ack, "build:skip", buildRefusal());
      log(who(), "build:skip", true);
      for (const o of others(socket)) o.emit("build:preview", { playerId: pub(id), cleared: true });
      ack({ ok: true });
      broadcast();
    });

    let last = { x: NaN, y: NaN };
    // poses travel in RUN, and while seated players walk the lobby choosing a map
    socket.on("run:pose", (p) => {
      const lobby = (state.phase === "SELECT" || state.phase === "DRAW") && me()?.character != null;
      if ((state.phase !== "RUN" && !lobby) || !isPose(p)) return;
      if (Math.abs(p.x - last.x) > 2 || Math.abs(p.y - last.y) > 2) {
        moved(state, id, Date.now());
        last = { x: p.x, y: p.y };
      }
      for (const o of others(socket)) o.volatile.emit("run:pose", { playerId: pub(id), x: p.x, y: p.y, vx: p.vx, vy: p.vy, facing: p.facing });
    });

    socket.on("run:result", (p) => {
      if (!p || (p.result !== "DEAD" && p.result !== "FINISHED") || !level) return;
      if (!report(state, id, p.result)) return refuse(null, `run:${p.result === "DEAD" ? "died" : "finished"}`, "not running now");
      if (p.result === "DEAD" && Number.isFinite(p.x) && Number.isFinite(p.y)) nextTraces.push({ x: Math.round(p.x), y: Math.round(p.y) });
      // +1 for the flag; +0.2 to whoever placed the spike or launcher that killed
      // someone else (the level's own pieces are not in `items`: they credit nobody)
      const trap = items.find((i) => i.id === p.by) ?? levelById(level.layout).fixtures.find((f) => f.id === p.by);
      const scorer = p.result === "FINISHED" ? id : killCredit(id, items.find((i) => i.id === p.by));
      // a browser reports its own run; the server checks only that it was
      // still running (ADR 0003, "What is not checked")
      log(who(), p.result === "FINISHED" ? "run:finished" : "run:died", true, p.result === "FINISHED" ? {} : { by: describe(trap) ?? "a fall", at: `${Math.round(p.x)},${Math.round(p.y)}` });
      if (scorer) {
        const who = state.players.find((q) => q.id === scorer);
        const name = who ? nameOf(who) : (items.find((i) => i.createdById === scorer)?.createdBy ?? "someone");
        const e: ScoreEvent = { round: state.round, playerId: scorer, name, kind: p.result === "FINISHED" ? "finish" : "kill" };
        scoreEvents.push(e);
        insertScoreEvent(level.id, e);
        log(whoOf(state.players.find((q) => q.id === scorer), scorer), `score:${e.kind}`, true, { points: e.kind === "finish" ? 1 : 0.2 });
      }
      voidIfTooSimple();
      broadcast();
    });

    socket.on("disconnect", () => {
      // a takeover by another tab already belongs to the new socket
      if (!sockets.delete(socket)) return;
      lastSeen = Date.now();
      log(who(), "disconnect", true, me()?.character != null ? { seat: "held" } : {});
      const character = me()?.character;
      if (character != null) pastCharacters.set(id, character);
      leave(state, id, Date.now());
      for (const o of others(socket)) o.emit("build:preview", { playerId: pub(id), cleared: true });
      broadcast();
    });

    // why this player cannot build now, in words for them and the log
    const buildRefusal = (): string => {
      const p = me();
      if (state.phase !== "BUILD") return "not the build phase";
      if (!p || p.character === null) return "no seat: you are watching";
      if (!p.active) return "your seat starts at the next build";
      return "you have already built this round";
    };
  };

  return {
    sockets,
    connect,
    summary: () => ({
      code, layout: level?.layout ?? null, phase: state.phase, round: state.round,
      seated: state.players.filter((p) => p.character !== null).length, here: sockets.size, maxPlayers: MAX_PLAYERS,
      characters: state.players.flatMap((p) => (p.character === null ? [] : [p.character])),
    }),
    levelState: () => ({ levelId: level?.id ?? 0, layout: level?.layout ?? 1, round: state.round, items: items.map(publicItem) }),
    lastSeenAt: () => (sockets.size > 0 ? Date.now() : lastSeen),
    // in the lobby while someone is in it, and for a short while after
    listed: (now) => sockets.size > 0 || (!hidden && now - lastSeen < (visited ? LISTED_MS : UNVISITED_MS)),
    unlist: () => {
      hidden = true;
    },
    stop: () => clearInterval(timer),
  };
}

const isPose = (p: unknown): p is { x: number; y: number; vx: number; vy: number; facing: -1 | 1 } => {
  if (typeof p !== "object" || p === null) return false;
  const { x, y, vx, vy, facing } = p as Record<string, unknown>;
  return [x, y, vx, vy].every((n) => typeof n === "number" && Number.isFinite(n)) && (facing === -1 || facing === 1);
};
