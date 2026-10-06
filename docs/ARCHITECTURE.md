# Architecture

## Now (crit 8: proof of life)

```text
Browser (public/)
 ├── index.html + styles.css
 └── app.js: draws the SVG machine, animates run plans
          │  fetch: GET /api/machine, PUT /api/mechanisms/ramp, POST /api/runs
          ▼
Server (src/server/main.ts, Express)
 ├── validates and bounds parameters
 ├── run lock: no edits while a run plays
 ├── deterministic simulation (src/shared/simulation.ts)
 └── /readme/: README.md rendered with marked, on the server
          │
          ▼
SQLite (node:sqlite) at $DATA_DIR/chain-reaction.db
  DATA_DIR=/data on Fly (the course volume), ./data locally
```

Node runs the TypeScript server directly (type stripping), so there is no
build step. The browser code is plain JavaScript in `public/` for now.

## Intended (by the final submission)

```text
Browser
 ├── React UI
 ├── SVG machine
 ├── animation renderer
 ├── Web Audio
 └── Socket.IO client
          │
          ▼
Server
 ├── Express
 ├── Socket.IO authoritative state
 ├── role/claim manager
 ├── deterministic simulation engine
 └── persistence service
          │
          ▼
SQLite on persistent Fly volume
```

React and Socket.IO arrive when the interface and the real-time layer need
them (crit 9), not before.

## State boundary

Persistent (SQLite):

```text
mechanism   one row per mechanism: id, value, updated_at
attempt     one row per run: run_id, angle, result, reason, miss_by, created_at
```

Ephemeral (process memory):

```text
run lock (runningUntil)
later: socket connections, presence, mechanism claims, current animation
```

Claims and presence must never be written to SQLite: a disconnected visitor
must not lock a mechanism for whoever comes next.

## Run model

1. Server reads the persisted settings (the snapshot).
2. Server creates a `runId` and computes the result with `simulate()`.
3. Server records the attempt and locks edits for the run's duration.
4. Server returns the run plan; the client animates it.

From crit 9 the same plan is broadcast to every client instead of returned
to one.

## Boundaries

- `src/shared/simulation.ts` decides what happened. It has no I/O and no
  randomness.
- `public/app.js` decides how to show what happened. It never computes a
  result.
- `src/server/db.ts` is the only code that touches SQLite.
