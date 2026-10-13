import { io, type Socket } from "socket.io-client";
import { afterAll, expect, inject, it } from "vitest";
import { COLS, ROWS, type Proposal, placementError } from "../src/shared/level.ts";
import { levelById } from "../src/shared/levels.ts";
import type { ClientToServer, ServerToClient, Snapshot } from "../src/shared/protocol.ts";

// Two real clients in a fresh room of the running app: a committed piece
// reaches the other client without a reload (S2), is in the room's persistent
// level (S1), and can be demolished by someone else, which persists and uses
// their build (S5). Rooms keep the test away from anyone else playing.
const baseUrl = inject("baseUrl");
type Client = Socket<ServerToClient, ClientToServer> & { snap?: Snapshot; id_: string };

const clients: Client[] = [];
afterAll(() => clients.forEach((c) => c.disconnect()));

const newRoom = async (): Promise<string> => {
  const res = await fetch(new URL("/api/rooms", baseUrl), { method: "POST" });
  expect(res.status).toBe(201);
  return ((await res.json()) as { code: string }).code;
};

function connect(name: string, room: string, playerId = `spec-${name}-${crypto.randomUUID()}`): Client {
  const id_ = playerId;
  const c = io(baseUrl, { auth: { playerId: id_, name: `Spec ${name}`, room }, transports: ["websocket"], forceNew: true }) as Client;
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

// both take a seat and stand under the same map
async function startGame(a: Client, b: Client): Promise<void> {
  await until(() => a.snap?.phase === "SELECT" && !!b.snap, 5000, "snapshots");
  a.emit("seat:claim", 0);
  b.emit("seat:claim", 1);
  await until(() => me(a)?.character === 0 && me(b)?.character === 1, 2000, "seats");
  a.emit("level:pick", 1);
  b.emit("level:pick", 1);
  await until(() => me(a)?.build === "WAITING" && me(b)?.build === "WAITING" && a.snap?.phase === "BUILD", 6000, "a BUILD with both players");
}

it("S1, S2, S5: a placed piece reaches the other client, persists, and can be demolished", async () => {
  const room = await newRoom();
  const a = connect("A", room);
  const b = connect("B", room);
  await startGame(a, b);

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
  // each socket gets the broadcast on its own; over a real network A's copy
  // can land after B's
  await until(() => me(a)?.build === "PLACED", 1000, "A to see itself PLACED");

  // S1: it is in the persistent level, not just in a socket message
  const level = (await (await fetch(new URL(`/api/rooms/${room}/level`, baseUrl))).json()) as { items: { id: string }[] };
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
  const after = (await (await fetch(new URL(`/api/rooms/${room}/level`, baseUrl))).json()) as { items: { id: string }[] };
  expect(after.items.some((i) => i.id === id)).toBe(false);
  // both have now acted, so the round moves on
  await until(() => a.snap?.phase === "COUNTDOWN" || a.snap?.phase === "RUN", 2000, "the countdown");
}, 40_000);

it("keeps rooms apart, and caps each at four seats", async () => {
  const one = await newRoom();
  const two = await newRoom();
  expect(one).not.toBe(two);
  const a = connect("A", one);
  const b = connect("B", two);
  await until(() => !!a.snap && !!b.snap, 5000, "snapshots");
  a.emit("seat:claim", 0);
  b.emit("seat:claim", 0); // the same character in another room is fine
  await until(() => me(a)?.character === 0 && me(b)?.character === 0, 2000, "seats in both rooms");
  expect(a.snap!.players.map((p) => p.id)).toEqual([a.id_]);
  expect(b.snap!.room).toBe(two);

  // four seats in room one; a fifth person watches
  const others = ["B", "C", "D"].map((n) => connect(n, one));
  await until(() => others.every((c) => !!c.snap), 5000, "snapshots");
  others.forEach((c, i) => c.emit("seat:claim", i + 1));
  await until(() => others.every((c, i) => me(c)?.character === i + 1), 2000, "four seats");
  const e = connect("E", one);
  await until(() => !!me(e), 5000, "the fifth snapshot");
  for (let i = 0; i < 4; i++) e.emit("seat:claim", i);
  await new Promise((r) => setTimeout(r, 300));
  expect(me(e)?.character).toBeNull();

  const listed = ((await (await fetch(new URL("/api/rooms", baseUrl))).json()) as { rooms: { code: string; seated: number; here: number }[] }).rooms;
  expect(listed.find((r) => r.code === one)).toMatchObject({ seated: 4, here: 5 });
});

it("holds a dropped player's seat, and gives it back when they reconnect", async () => {
  const room = await newRoom();
  const a = connect("A", room);
  const bId = `spec-B-${crypto.randomUUID()}`;
  const b = connect("B", room, bId);
  await startGame(a, b);
  b.disconnect();
  await until(() => a.snap?.players.find((p) => p.id === bId)?.connected === false, 2000, "B shown as away");
  expect(a.snap!.players.find((p) => p.id === bId)?.character).toBe(1);
  expect(a.snap!.phase).toBe("BUILD"); // the round does not move on at once
  const back = connect("B again", room, bId);
  await until(() => me(back)?.connected === true, 3000, "B back");
  expect(me(back)).toMatchObject({ character: 1, active: true, build: "WAITING" });
});

it("refuses a room that does not exist", async () => {
  const c = io(baseUrl, { auth: { playerId: `spec-x-${crypto.randomUUID()}`, name: "x", room: "QQQQ" }, transports: ["websocket"], forceNew: true });
  clients.push(c as Client);
  const missing = await new Promise<boolean>((resolve) => {
    c.on("room:missing", () => resolve(true));
    setTimeout(() => resolve(false), 3000);
  });
  expect(missing).toBe(true);
  expect((await fetch(new URL("/api/rooms/QQQQ/level", baseUrl))).status).toBe(404);
});
