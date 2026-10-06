# Multiplayer

Co-presence comes from the level: seeing others run, seeing placements land,
feeling help or sabotage at once, sharing one persistent course. No chat.

## Identity

No authentication. A `playerId` (random UUID in sessionStorage, so a refresh
keeps it but two tabs are two players) and a light pseudonym (Quiet Fox, Blue
Moth, Paper Crow). Players are visually distinguishable by a colour accent.
Collect nothing personal.

## Round roster

Open during BUILD, closed from COUNTDOWN; later joiners spectate until the
next BUILD (`docs/GAME_LOOP.md`).

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
players, statuses, build states) and discards stale local state. Mid-round it
joins as a spectator until the next BUILD unless the server explicitly
restores it. Prefer simple, reliable behaviour.
