// What this browser knows: the last server snapshot (the truth), this
// player's uncommitted build choice, and what others are previewing. The
// scene and the HTML shell both read it; main.ts wires the network to it.
import type { BuildChoice, Proposal } from "../shared/level.ts";
import type { Pose, PreviewView, Snapshot } from "../shared/protocol.ts";

export interface Selection {
  choice: BuildChoice | null;
  rot: number;
  hover: Proposal | null; // under the pointer
  pinned: Proposal | null; // clicked, waiting for Place
  hoverTarget: string | null; // bomb: item under the pointer
  target: string | null; // bomb: clicked item
}

export const emptySelection = (): Selection => ({ choice: null, rot: 0, hover: null, pinned: null, hoverTarget: null, target: null });

export const store = {
  me: "",
  snap: null as Snapshot | null,
  sel: emptySelection(),
  previews: new Map<string, PreviewView>(),
};

// On-screen controls for touch screens (ui.ts sets them, the scene reads them
// alongside the keyboard). `jumps` counts presses, so a tap between two
// frames is never lost.
export const touch = { left: false, right: false, jumps: 0 };

// Set by main.ts; the scene calls them.
export const bus = {
  selectionChanged: (): void => {},
  pose: (_p: Pose): void => {},
  pick: (_layout: number | null): void => {}, // the map sign I stand under, choosing a level
  result: (_r: { result: "DEAD" | "FINISHED"; x: number; y: number; by?: string }): void => {},
  say: (_text: string, _error?: boolean): void => {},
};

export const myPlayer = () => store.snap?.players.find((p) => p.id === store.me);
export const iCanBuild = (): boolean => {
  const me = myPlayer();
  return store.snap?.phase === "BUILD" && !!me?.active && me.build === "WAITING";
};
