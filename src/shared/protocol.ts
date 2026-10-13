// What travels over Socket.IO (docs/MULTIPLAYER.md). Shared state goes out as
// a whole snapshot whenever it changes: it is small, and a client never has to
// reconcile partial updates. Movement goes out separately, often and lossy.
import type { BuildChoice, Item, Proposal } from "./level.ts";
import type { BuildState, Draw, Phase, RunState, Vote } from "./rounds.ts";

export interface PlayerView {
  id: string;
  name: string;
  colour: string;
  connected: boolean;
  active: boolean;
  build: BuildState;
  run: RunState | null;
  points: number; // this game
  gained: number; // this round, shown in RESULTS
  vote: Vote | null;
  pick: number | null; // SELECT: the map they stand under
  character: number | null; // their seat: index into CHARACTERS; null watches
}

// everyone who scored this game, including people who have since left
export interface ScoreRow { playerId: string; name: string; colour: string; character: number | null; points: number; finishes: number; kills: number }

export interface Snapshot {
  room: string; // its code, as in /r/ABCD
  draw: Draw | null; // DRAW: the maps in the draw, their votes, and the result
  levelId: number; // 0 while choosing the first level
  layout: number; // which course (src/shared/levels.ts)
  round: number;
  maxRounds: number;
  phase: Phase;
  // ms left in COUNTDOWN / RESULTS, and in BUILD the auto-skip deadline per
  // player once it is near; measured on the server, so clocks need not agree
  phaseRemainingMs: number | null;
  phaseElapsedMs: number; // moving platforms keep time from the start of RUN
  buildDeadlineMs: number | null; // for the receiving player only
  levelDone: boolean; // RESULTS after the last round, or once someone has WIN_POINTS
  tooSimple: boolean; // RESULTS: everyone reached the flag, so nobody scored
  winPoints: number;
  maxPlayers: number;
  players: PlayerView[];
  scores: ScoreRow[];
  archivedFrom: number | null; // the level this game continues, if archived
  items: Item[];
  // where players died in the last run, shown during the next BUILD
  traces: { x: number; y: number }[];
}

export interface Pose {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: -1 | 1;
}

// someone's uncommitted choice, so others can see what they are considering
export interface PreviewView {
  playerId: string;
  choice: BuildChoice;
  proposal?: Proposal;
  targetId?: string;
}

export type Ack = (result: { ok: true } | { ok: false; error: string }) => void;

export interface ClientToServer {
  "build:preview": (p: { choice: BuildChoice; proposal?: Proposal; targetId?: string } | null) => void;
  "build:commit": (p: Proposal, ack: Ack) => void;
  "build:bomb": (targetId: string, ack: Ack) => void;
  "build:skip": (ack: Ack) => void;
  "run:pose": (p: Pose) => void;
  // `by`: the spike or launcher that killed this player, if one did
  "run:result": (p: { result: "DEAD" | "FINISHED"; x: number; y: number; by?: string }) => void;
  "level:vote": (v: Vote) => void;
  "level:pick": (level: number | null) => void; // standing under a map's sign, or not
  "seat:claim": (character: number) => void;
  "seat:leave": () => void;
}

export interface ServerToClient {
  snapshot: (s: Snapshot) => void;
  "build:preview": (p: PreviewView | { playerId: string; cleared: true }) => void;
  "run:pose": (p: Pose & { playerId: string }) => void;
  "room:missing": () => void; // no such room: the socket is closed
}

export interface Handshake {
  playerId: string;
  name: string;
  room: string;
}
