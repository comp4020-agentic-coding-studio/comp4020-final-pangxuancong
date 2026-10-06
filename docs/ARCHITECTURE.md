# Architecture

## Now (crit 8 machine prototype, the migration source)

```text
Browser (public/): plain JS, SVG machine, animates server run plans
Server (src/server/main.ts, Express): bounded ramp angle, run lock,
  deterministic simulation (src/shared/simulation.ts), /readme/ via marked
SQLite (node:sqlite) at $DATA_DIR/chain-reaction.db
  DATA_DIR=/data on Fly (the course volume), ./data locally
```

Node runs the TypeScript server directly (type stripping): no build step, and
the Dockerfile relies on that. The machine gameplay is deprecated
(`docs/MIGRATION.md`); the server, SQLite, `/readme/` and deploy carry over.

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

Persistent (SQLite), conceptual only; don't over-normalise:

```sql
levels(id, round_number, created_at, updated_at)
placed_items(id, level_id, type, x, y, rotation, params_json,
             created_by, created_round, created_at)
round_summaries(level_id, round_number, summary_json)  -- optional
```

Optional later: last-round death markers.

Ephemeral (process memory, never SQLite): player position and velocity,
alive/dead state, build previews, socket ids, the current roster, selections,
interpolation state. After a server restart the level reloads and the session
safely returns to BUILD.

## Build validation

On commit the server checks: known item type, inside build bounds, outside the
START volume, off the GOAL trigger, no technically invalid overlap, and an
unused build action. No pathfinding; never reject a placement for looking
unfair.

## `/readme/`

The full README in the HTML the server sends; never fetched and rendered by
client JavaScript.
