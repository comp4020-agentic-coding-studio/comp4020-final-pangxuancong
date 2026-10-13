# Multiplayer

Co-presence comes from the level: seeing others run, seeing placements land,
feeling help or sabotage at once, sharing one persistent course. No chat.

## Identity

No authentication. A `playerId` per room (a random UUID kept in
sessionStorage and localStorage under the room's code), so a refresh, or
closing the tab and opening the room again, is the same player; a second tab
open in the same room at the same time is someone new (a heartbeat in
localStorage tells them apart). A player's name is their character; without
one they are a Visitor. Collect nothing personal.

## Rooms

A room is a code and a URL, `/r/CODE`. The lobby at `/` lists rooms with
someone in them in the last 30 minutes (`GET /api/rooms`), makes one
(`POST /api/rooms`), or opens a code typed in. A room's level persists in
SQLite (`level.room`); a link to a room that once existed still opens it. A
socket names its room in the handshake and only ever hears that room.

## Round roster

Seats are the four characters; open during BUILD, closed from COUNTDOWN
(`docs/GAME_LOOP.md`).

## BUILD

Players build simultaneously. Event names may change; keep the set small:

```text
round:snapshot   phase:changed   player:presence
build:preview    build:commit    build:committed   build:skip
item:destroy     item:destroyed   level:vote
```

(As built: one `snapshot` event carries all shared state; `build:preview`,
`build:commit`, `build:bomb`, `build:skip`, `run:pose`, `run:result` and
`level:vote` go to the server; see `src/shared/protocol.ts`.)

Previews may be broadcast as lightweight, throttled hints; they are never
persisted. Only a committed placement becomes shared state.

**Placement authority.** The client previews, drags, rotates and proposes. The
server validates (`docs/ITEMS.md`), assigns an id, persists and broadcasts the
canonical item. On a spatial conflict the first valid commit wins; the other
is rejected and returns to preview. No distributed locking.

**Demolition authority.** The client proposes `destroy(targetItemId)`. The
server checks the player still has an unused build action, the target exists,
is destructible and is not protected; then deletes it, broadcasts the deletion
and marks the action used.

## RUN

Local movement is simulated on the client; snapshots at ~10–15 Hz, never every
physics frame. Remote players interpolate and take no part in local collision.

The server is authoritative for status (`RUNNING | DEAD | FINISHED |
DISCONNECTED`): clients report death/finish, the server broadcasts it, and the
run ends only when nobody is RUNNING.

## Disconnects

An active player who disconnects becomes DISCONNECTED in either phase and no
longer blocks completion. Their placed items stay in the level.

## Reconnect

A reconnect receives a canonical snapshot (phase, round, level items, active
players, statuses, build states) and discards stale local state. Socket.IO
reconnects by itself; the server keeps a dropped seated player for the
reconnect grace (8 s, the round waits) and the seat hold (2 min, the seat
waits), so a wifi blip costs nothing and a closed laptop costs one round at
most. A runner who drops mid-run loses that run (the local simulation cannot
be resumed); in BUILD they can still place. Prefer simple, reliable
behaviour.
