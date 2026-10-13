# Architecture

## Now

```text
Browser (src/client, built by Vite)
├── index.html + lobby.ts: the lobby at /: rooms, new room, join by code
├── room.html + styles.css: a room at /r/CODE: header, roster, phase line,
│   Parts Tray, overlays (character choice, map draw, round and final cards)
├── main.ts: room from the URL, identity per room (session + localStorage),
│   socket, keyboard, build actions
├── sound.ts, motion.ts: synthesised sounds with a mute; the reduced-motion
│   choice (system setting or the header switch)
├── ui.ts: renders the HTML shell from the snapshot
├── scene.ts: Phaser scene: the lobby room with its map signs (SELECT, DRAW)
│   or the level, items, previews, local player (Arcade Physics), remote
│   players (interpolated), traces
└── draw.ts: how every piece looks
        │ Socket.IO: snapshot (whole shared state on every change),
        │ build:preview/commit/bomb/skip, run:pose (~12/s, volatile),
        │ run:result (with the killing spike), level:vote, level:pick (the
        │ sign stood under), seat:claim/leave; the handshake names the room
Server (src/server, TypeScript run directly by Node)
├── main.ts: Express, /readme/, /api/rooms, /api/rooms/:code/level, the two
│   pages, Vite middleware in dev, dist/client in production
├── game.ts: rooms; per room a round clock (200 ms tick), roster, item
│   validation and its sockets
└── db.ts: the only code that touches SQLite
Shared (src/shared, imported by both and by spec/)
├── level.ts: grid, items, placement + demolition rules
├── levels.ts: the three fixed courses (blocks, fixtures, START/GOAL), and
│   the lobby room with its three signs
├── characters.ts: the four seat characters
├── rounds.ts: the round state machine (seats as characters, reconnect
│   grace and seat hold, walking vote, weighted draw, timeouts), pure
├── score.ts: points from score events, and who a spike death credits
├── movement.ts: movement constants and the wall-jump rule
└── protocol.ts: socket event types
SQLite (node:sqlite) at $DATA_DIR/chain-reaction.db
  DATA_DIR=/data on Fly (the course volume), ./data locally
```

The world is a fixed 48×27 grid of 40 px cells (1920×1080), larger than the
1280×720 view. During the countdown and RUN the camera follows your own
runner at full size; otherwise (BUILD, after you finish or die, spectating)
it is free: wheel to zoom, out to the whole level, right or middle drag or
the arrow keys to pan. The camera is per client and never shared.

Out of the run (dead, finished, or a visitor) the camera follows someone
still running: E moves to the next runner, clicking an edge badge picks one,
and any manual pan or zoom switches to free look until E. When the watched
runner dies or finishes it stays a second, then moves on. Runners outside
the view show as badges on its edge (their character, name and an arrow
toward them); one who dies off screen flashes a red cross there. All of this
is presentation of snapshots and poses already received; nothing new is
sent.

Moving platforms are driven by velocity, not by teleporting, so riders are
carried. Set that velocity from the track itself (`movingVelocity`, the
derivative of `movingOffset`) plus a small pull back onto the track. Never
divide a position gap by the frame time: Arcade steps at its own fixed rate,
so on a 120 or 144 Hz screen that overshoots and the platform flies about
(found 2026-10-07; `spec/level.test.ts` checks the derivative). Phaser and socket.io-client are devDependencies:
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
level(id, room, round, layout, parent_id, outcome, finished_at, created_at, updated_at)
placed_item(id, level_id, type, col, row, rot, created_by, created_by_id,
            created_round, created_at, destroyed_by, destroyed_round, destroyed_at)
score_event(level_id, round, player_id, name, kind, created_at)
```

Each room has its own chain of levels (`room` is its code; games from before
rooms are in `MAIN`). A room with a game in play is reopened when the server
starts. One level row is one game (up to six rounds, or until someone has 4 points). Archiving finishes it with
`outcome = 'archived'` and starts a new row with `parent_id` pointing at it
and a copy of its surviving items; restarting starts a bare row on the course chosen in SELECT. `layout` is
the course number (1–3); an archived copy keeps its parent's. Scores are
tallied from `score_event` (`src/shared/score.ts`), so they survive a restart
mid-game and belong to that game only.

A demolished item keeps its row with `destroyed_*` set: history, not state.
A finished level keeps its items. Old crit 8 tables (`mechanism`, `attempt`)
may remain in an old database; nothing reads them.

Ephemeral (process memory, never SQLite): player position and velocity,
alive/dead state, build previews, socket ids, the current roster and seats,
held seats, map picks and the draw, selections, interpolation state,
last-run death traces. After a server restart each room's level reloads and
the room returns to BUILD; players take their characters again.

## Build validation

On commit the server checks: known item type, inside build bounds, outside the
START volume, off the GOAL trigger, no technically invalid overlap, and an
unused build action. No pathfinding; never reject a placement for looking
unfair.

## `/readme/`

The full README in the HTML the server sends; never fetched and rendered by
client JavaScript.

## Decisions

Decisions about how the game behaves with several people in it are recorded
one per file in `docs/decisions/` (architecture decision records), with the
options considered and what the choice costs.
