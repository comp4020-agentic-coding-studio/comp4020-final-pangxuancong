import { io, type Socket } from "socket.io-client";
import { afterAll, expect, inject, it } from "vitest";
import { COLS, ROWS, type Proposal, placementError } from "../src/shared/level.ts";
import { levelById } from "../src/shared/levels.ts";
import type { ClientToServer, ServerToClient, Snapshot } from "../src/shared/protocol.ts";

// Two real clients against the running app: a committed piece reaches the
// other client without a reload (S2), is in the persistent level (S1), and can
// be demolished by someone else, which persists and uses their build (S5).
// Run against a local or CI app with nobody else mid-round.
const baseUrl = inject("baseUrl");
type Client = Socket<ServerToClient, ClientToServer> & { snap?: Snapshot; id_: string };

const clients: Client[] = [];
afterAll(() => clients.forEach((c) => c.disconnect()));

function connect(name: string): Client {
  const id_ = `spec-${name}-${crypto.randomUUID()}`;
  const c = io(baseUrl, { auth: { playerId: id_, name: `Spec ${name}` }, transports: ["websocket"], forceNew: true }) as Client;
  c.id_ = id_;
  c.on("snapshot", (s) => (c.snap = s));
  clients.push(c);
  return c;
}

const until = async (cond: () => boolean, ms: number, what: string): Promise<void> => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
};

const me = (c: Client) => c.snap?.players.find((p) => p.id === c.id_);
const emitAck = <T>(fn: (ack: (r: T) => void) => void): Promise<T> => new Promise((resolve) => fn(resolve));

it("S1, S2, S5: a placed piece reaches the other client, persists, and can be demolished", async () => {
  const a = connect("A");
  const b = connect("B");
  // a fresh server starts by choosing a level: both pick one
  await until(() => !!a.snap && !!b.snap, 5000, "snapshots");
  if (a.snap!.phase === "SELECT") {
    a.emit("level:pick", 1);
    b.emit("level:pick", 1);
  }
  // both on the roster of a BUILD (a previous run may still be finishing)
  await until(() => me(a)?.build === "WAITING" && me(b)?.build === "WAITING" && a.snap?.phase === "BUILD", 30_000, "a BUILD with both players");

  // somewhere legal and free, high up where it bothers nobody
  let spot: Proposal | null = null;
  for (let row = 1; row < ROWS && !spot; row++)
    for (let col = 0; col < COLS - 3 && !spot; col++) {
      const p: Proposal = { type: "platform", col, row, rot: 0 };
      if (placementError(levelById(a.snap!.layout), a.snap!.items, p) === null) spot = p;
    }
  expect(spot).not.toBeNull();

  const sent = Date.now();
  const placed = await emitAck<{ ok: boolean }>((ack) => a.emit("build:commit", spot!, ack));
  expect(placed.ok).toBe(true);
  const find = (c: Client) => c.snap?.items.find((i) => i.col === spot!.col && i.row === spot!.row && i.type === "platform");
  await until(() => !!find(b), 1000, "B to see A's piece within a second");
  expect(Date.now() - sent).toBeLessThan(1000);
  expect(me(a)?.build).toBe("PLACED");

  // S1: it is in the persistent level, not just in a socket message
  const level = (await (await fetch(new URL("/api/level", baseUrl))).json()) as { items: { id: string }[] };
  const id = find(b)!.id;
  expect(level.items.some((i) => i.id === id)).toBe(true);

  // A cannot build twice
  const again = await emitAck<{ ok: boolean }>((ack) => a.emit("build:skip", ack));
  expect(again.ok).toBe(false);

  // S5: B demolishes A's piece; protected things cannot be named
  for (const target of ["start", "goal", "base-0"]) {
    const r = await emitAck<{ ok: boolean }>((ack) => b.emit("build:bomb", target, ack));
    expect(r.ok).toBe(false);
  }
  const bombed = await emitAck<{ ok: boolean }>((ack) => b.emit("build:bomb", id, ack));
  expect(bombed.ok).toBe(true);
  await until(() => !find(a), 1000, "A to see the piece gone");
  const after = (await (await fetch(new URL("/api/level", baseUrl))).json()) as { items: { id: string }[] };
  expect(after.items.some((i) => i.id === id)).toBe(false);
  // both have now acted, so the round moves on
  await until(() => a.snap?.phase === "COUNTDOWN" || a.snap?.phase === "RUN", 2000, "the countdown");
}, 40_000);
