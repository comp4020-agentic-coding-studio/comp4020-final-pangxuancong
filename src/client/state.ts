// What this browser knows: the last server snapshot (the truth), this
// player's uncommitted build choice, and what others are previewing. The
// scene and the HTML shell both read it; main.ts wires the network to it.
import type { BuildChoice, Proposal } from "../shared/level.ts";
import type { Pose, PreviewView, Snapshot } from "../shared/protocol.ts";

export interface Selection {
  choice: BuildChoice | null;
  rot: 0 | 1;
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

// Set by main.ts; the scene calls them.
export const bus = {
  selectionChanged: (): void => {},
  pose: (_p: Pose): void => {},
  result: (_r: { result: "DEAD" | "FINISHED"; x: number; y: number }): void => {},
  say: (_text: string, _error?: boolean): void => {},
};

export const myPlayer = () => store.snap?.players.find((p) => p.id === store.me);
export const iCanBuild = (): boolean => {
  const me = myPlayer();
  return store.snap?.phase === "BUILD" && !!me?.active && me.build === "WAITING";
};
