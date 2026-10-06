# Architecture

## Now

```text
Browser (src/client, built by Vite)
├── index.html + styles.css: header, roster, phase line, Parts Tray, overlays
├── main.ts: identity (sessionStorage), socket, keyboard, build actions
├── ui.ts: renders the HTML shell from the snapshot
├── scene.ts: Phaser scene: level, items, previews, local player (Arcade
│   Physics), remote players (interpolated), traces
└── draw.ts: how every piece looks
        │ Socket.IO: snapshot (whole shared state on every change),
        │ build:preview/commit/bomb/skip, run:pose (~12/s, volatile), run:result
Server (src/server, TypeScript run directly by Node)
├── main.ts: Express, /readme/, /api/level, Vite middleware in dev,
│   dist/client in production
├── game.ts: round clock (200 ms tick), roster, item validation, sockets
└── db.ts: the only code that touches SQLite
Shared (src/shared, imported by both and by spec/)
├── level.ts: grid, base course, START/GOAL zones, placement + demolition rules
├── rounds.ts: the round state machine, pure
├── movement.ts: movement constants and the wall-jump rule
└── protocol.ts: socket event types
SQLite (node:sqlite) at $DATA_DIR/chain-reaction.db
  DATA_DIR=/data on Fly (the course volume), ./data locally
```

The world is a fixed 1280×720 grid of 40 px cells, scaled to fit, so the whole
level is visible at once. Phaser and socket.io-client are devDependencies:
they are bundled into `dist/client` at build time, and the production image
installs only what the server needs. The Dockerfile builds the client in a
first stage. The crit 8 machine code is gone; the tag `crit-8` keeps it.

## Target

```text
Browser
├── HTML/CSS shell: header, Parts Tray / build UI, round status, overlays
├── Phaser 3 game
│   ├── level scene, placed-item renderer
│   ├── local player controller (Arcade Physics)
│   └── remote player renderer (interpolated)
└── Socket.IO client
        │
Node / Express
├── HTTP routes, /readme/ (server-rendered)
├── Socket.IO
├── round manager (phase, roster, build/run states)
├── placement validator
├── level state + persistence service
└── presence
        │
SQLite on the /data volume
```

Stack: TypeScript, Vite, Phaser 3 with Arcade Physics, Express, Socket.IO,
SQLite, Fly.io. Plain HTML/CSS for the shell; React is not needed for this UI.

**Why Phaser Arcade Physics.** Gravity, jumping, solid collisions, hazards,
moving platforms, bounce surfaces, wall contact and trigger zones are the core
of the game. A platformer-oriented system is justified; a general rigid-body
engine (Matter.js) is not, unless Arcade proves insufficient and the human
approves.

**Build step.** Vite adds one. The Dockerfile must then build the client and
serve the built files from Express; keep the server running TypeScript
directly. `fly.toml` and `/data` stay untouched.

## Authority

Server: level layout, item create/delete, round number, phase, build actions,
active roster, DEAD/FINISHED records.

Client: local character movement, camera, drag preview, animation, audio. The
server does not simulate player physics.

## State boundary

Persistent (SQLite):

```sql
level(id, round, finished_at, created_at, updated_at)
placed_item(id, level_id, type, col, row, rot, created_by, created_round,
            created_at, destroyed_by, destroyed_round, destroyed_at)
```

A demolished item keeps its row with `destroyed_*` set: history, not state.
A finished level keeps its items. Old crit 8 tables (`mechanism`, `attempt`)
may remain in an old database; nothing reads them.

Ephemeral (process memory, never SQLite): player position and velocity,
alive/dead state, build previews, socket ids, the current roster, selections,
interpolation state, last-run death traces. After a server restart the level
reloads and the session safely returns to BUILD.

## Build validation

On commit the server checks: known item type, inside build bounds, outside the
START volume, off the GOAL trigger, no technically invalid overlap, and an
unused build action. No pathfinding; never reject a placement for looking
unfair.

## `/readme/`

The full README in the HTML the server sends; never fetched and rendered by
client JavaScript.
