# Testing

Lightweight on purpose. A check exists because it protects a claim in
`README.md` / `docs/PRODUCT.md`; coverage percentage is not a goal, and
frame-perfect physics tests are not wanted. Everything in `spec/` runs with
`pnpm check` against the running app (start it with `pnpm dev`).

Restart `pnpm dev` before checking a change. `node --watch` can lose track of
a file that was replaced rather than written in place (`sed -i`, some editors)
and keep serving old code without saying so.

Stopping a background `pnpm dev` means stopping the watcher, not just the
server: killing the process that holds port 8080 leaves `node --watch`
alive, and it starts another server on the next file change. Start it in its
own process group (`setsid pnpm dev &`) and kill the group. `pnpm dev`
watches only `src/server` and `src/shared`; Vite reloads the client itself.

Browser or spec runs that play rounds change the level and the round. Run
them against a second server with its own data, never against a `pnpm dev`
someone is looking at: `DATA_DIR=/tmp/x PORT=8092 node src/server/main.ts`,
then `APP_URL=http://localhost:8092 pnpm check`. A real person's open tab is
also a player, and holds BUILD until they act or the AFK limit passes.

## Checks

| Id | Check | Protects | Status |
|---|---|---|---|
| S0 | `/` answers; `/readme/` has every README heading | course invariants | `spec/invariants.test.ts` (shipped, keep) |
| S1 | a committed Platform is in the level state (`/api/level`), not just a socket message | the level outlives sessions (P7) | `spec/realtime.test.ts` |
| S2 | client A commits an item; client B receives it without reload, within ~1 s. Committed state only, not drag previews | changes are shared (P8) | `spec/realtime.test.ts` |
| S3 | two active players: A places, B skips → BUILD ends. A WAITING player holds BUILD; a DISCONNECTED one does not | everyone changes the level; rounds progress (P1) | `spec/rounds.test.ts` (+ one build action, AFK timeouts, empty roster, late joiners) |
| S4 | A FINISHED + B DEAD → next BUILD; A FINISHED + B RUNNING → still RUN | rounds progress without timers | `spec/rounds.test.ts` (+ run idle limit, six rounds then a fresh level) |
| S5 | Bomb on a placed item: removed, removal persists, action consumed. Bomb on START, GOAL, base geometry: rejected | deadlock is recoverable (P4) | rules: `spec/level.test.ts`; server: `spec/realtime.test.ts` |
| S6 | placement inside START or over GOAL rejected; a legal one accepted. Never test completability | only technical validity (P3) | `spec/level.test.ts` |
| S7 | +1 for finishing, +0.2 to the placer for each other player killed on their spike or launcher, nothing for your own; scores reset per game | scores stay inside one game | `spec/rounds.test.ts` |
| S7a | everyone who ran finished → `tooSimple`, RESULTS held `STAMP_MS` longer (server voids the round's events); a disconnect does not count; reaching `WIN_POINTS` at round end goes to LEVEL_END | too simple; first to 4 | `spec/rounds.test.ts`; void and early end checked in the browser (2026-10-13) |
| — | a launcher fires once a second, same shots at the same moment, range ends at the first solid in line or the world's edge; four directions | the Launcher is deterministic | `spec/level.test.ts` |
| S8 | after round 6: majority vote, tie or timeout archives; archive copies the items into the next game, restart starts bare | a finished level can live on | `spec/rounds.test.ts` (vote); copy checked in the browser (2026-10-06) |
| — | a moving platform's velocity is the derivative of its offset, and its top speed stays under 2 cells a second | readable, frame-rate independent motion | `spec/level.test.ts` |
| S10 | every course: zones clear of blocks and fixtures, and a coarse grid search reaches GOAL from START on the bare course; a wall course fails | each course starts finishable | `spec/levels.test.ts` |
| S11 | SELECT: most picks wins, tie goes lower, everyone picked closes early; seated players keep their character | choosing a level | `spec/rounds.test.ts` |
| S9 | a fifth player spectates and takes a free seat at the next BUILD | small rooms (P10) | `spec/rounds.test.ts` |
| — | wall jump allowed while touching and within the grace window; kicks away, mostly up when pressing in | forgiving movement (P6) | `spec/level.test.ts` |

S3, S4, S7–S9 test the pure round state machine and scoring with explicit times.
`spec/realtime.test.ts` connects two real clients and needs the server to
reach a BUILD within 30 s: run it with nobody else mid-round. Persistence
across a server restart was checked by hand (2026-10-06).

Persistence across a real Fly redeploy is a manual check: place, deploy,
reload the live site. The spec mutates state, so run it against a local or CI
app, never the live site.

## Wall movement

Feel is a manual judgement. If the wall-jump rule is a pure function, a small
unit test is fine; otherwise verify by hand: touching a wall enables a wall
jump; just after leaving it still does; after the grace window it does not;
repeated wall jumps climb.

## Human judgement checklist

Ask real testers; these are judgements, not metrics:

- Are START and GOAL obvious?
- Does every placed object visibly affect movement?
- Can sabotage happen without confusing the interface?
- Can players recover from a blocked level with the Bomb?
- Does wall movement feel forgiving?
- Is it obvious when somebody else places something?
- Does BUILD → RUN make sense without explanation?
- Is the level still readable after several rounds?
- Are other players visible without getting in the way of your own control?
- Does a failed round suggest what to build next?
- Is keyboard interaction possible, and does resizing stay usable?
