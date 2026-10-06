// What travels over Socket.IO (docs/MULTIPLAYER.md). Shared state goes out as
// a whole snapshot whenever it changes: it is small, and a client never has to
// reconcile partial updates. Movement goes out separately, often and lossy.
import type { BuildChoice, Item, Proposal } from "./level.ts";
import type { BuildState, Phase, RunState } from "./rounds.ts";

export interface PlayerView {
  id: string;
  name: string;
  colour: string;
  connected: boolean;
  active: boolean;
  build: BuildState;
  run: RunState | null;
}

export interface Snapshot {
  levelId: number;
  round: number;
  maxRounds: number;
  phase: Phase;
  // ms left in COUNTDOWN / RESULTS, and in BUILD the auto-skip deadline per
  // player once it is near; measured on the server, so clocks need not agree
  phaseRemainingMs: number | null;
  buildDeadlineMs: number | null; // for the receiving player only
  levelDone: boolean; // RESULTS after the last round
  players: PlayerView[];
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
  "run:result": (p: { result: "DEAD" | "FINISHED"; x: number; y: number }) => void;
}

export interface ServerToClient {
  snapshot: (s: Snapshot) => void;
  "build:preview": (p: PreviewView | { playerId: string; cleared: true }) => void;
  "run:pose": (p: Pose & { playerId: string }) => void;
}

export interface Handshake {
  playerId: string;
  name: string;
}
