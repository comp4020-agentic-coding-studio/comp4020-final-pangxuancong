# Progress

## Current milestone

Crit 08: proof of life. Cutoff Wed 2026-10-07 12:00. The deployed app is the
crit 8 machine and stays that way until the cutoff state is preserved.

## Product direction

Pivot decided 2026-10-06: from a shared deterministic Rube Goldberg machine to
a persistent multiplayer build-and-run platformer.

> Build the level together. Survive what you built.

Definition of good (harness wording, for the human to argue in the README): a
good shared level lets every player meaningfully change the possibilities
available to everyone else.

Design rules, detailed in `docs/`:

- players may cooperate or sabotage; the game does not choose;
- the level may become impossible; the Demolition Bomb lets players repair a
  deadlock by removing one player-placed object;
- one build action per active player per BUILD (place, Bomb or skip);
- BUILD ends when all active players placed or skipped; RUN ends when nobody
  is still RUNNING; no gameplay timers; disconnects never block;
- no player-player collision;
- AFK timeout in BUILD (required); a level lasts six rounds, at most one item
  per player per round (decided 2026-10-06);
- forgiving wall movement: wall slide, wall-jump grace window, wall climbing;
- the level persists across rounds, restarts and redeploys.

## Current state

First playable build-and-run platformer, local only. Not deployed and not
pushed: the live site and the pushed repo are still the crit 8 machine
(tag `crit-8`).

- One shared level: a fixed course (START ledge, two islands, a tower that
  needs a wall climb, GOAL ledge) on a 32×18 grid, all visible at once.
- BUILD: each player places a Platform (R turns it into a post), Spring or
  Spike, uses the Bomb on any placed piece, or skips. Click a piece, click the
  level to pin it (green valid, red with the reason), Enter or Place to
  commit. Others see your preview in your colour while you decide. AFK:
  auto-skip after 40 s idle, nobody waits past 120 s.
- COUNTDOWN 3 s, then RUN: everyone at once, arrows/WASD and jump; wall slide,
  250 ms wall-jump grace, pressing into a wall climbs it. Spikes and falling
  kill; the flag finishes. No player collision; others are interpolated.
  A runner who does not move for 30 s drops out.
- RESULTS for 3.5 s, then the next BUILD shows where people died. After round
  6 the level is finished (kept in SQLite) and a fresh one starts.
- Persistent: level, round, items (demolished items kept as history).
  Ephemeral: players, positions, statuses, previews, traces.

Not built yet: Fan, Moving Platform, sound, most motion polish, activity
logging. The Dockerfile's new two-stage build has not been run (no Docker
here); CI will run it when the repo is public.

## Still to do (human)

- Crit 8, before the cutoff: `README.md`, `PROCESS.md`,
  `reflections/crit-8.md`, deploy and ship, as planned.
- After the cutoff: rewrite `README.md` for the platformer (the current one
  argues for the fixed machine). `PROCESS.md` still points to
  `docs/PRODUCT_RULES.md`, which this pivot removed (it remains in Git
  history); how to describe the pivot there is yours to decide.

## Next milestones

1. ~~Platformer slice, round loop, multiplayer, Bomb (F01–F14, F17)~~ first
   playable version, 2026-10-06.
2. Human playtest of the first version; tune movement and the base course.
3. Fan, Moving Platform (F15, F16).
4. Motion and sound (F18), responsive layout, reconnect robustness.
5. Server-side activity logging (F19).
6. Before deploying: run the Docker build (CI or locally).

## Known constraints

- `fly.toml`, the `/data` volume and `spec/invariants.test.ts` are fixed;
- the Dockerfile builds the client with Vite in a first stage (unverified);
- Phaser Arcade Physics only;
- keep README / CLAUDE / spec aligned.

## Open questions

Decide through playtesting, not by default:

- item distribution and tray presentation; whether every item type is always
  selectable;
- the exact wall-jump grace duration;
- whether previous-round death markers help or clutter.

## Blockers

None recorded.

## Last verified

2026-10-06, local: `pnpm check` (4 tests, typecheck) green against
`pnpm dev`; browser flow driven with Playwright (set 30°, run, ball lands in
the cup; a fresh browser context sees 30° and the attempt; slider responds to
arrow keys).

2026-10-06, Fly: deployed; `/`, `/readme/` answer and `spec/invariants.test.ts`
passes against the live URL; a ramp angle set on the live site survived a
machine restart (the /data volume).

2026-10-06, local: first playable platformer. `pnpm typecheck` and
`pnpm check` (19 tests: invariants, rounds, level, realtime) green against a
restarted `pnpm dev`; the same 19 green against `pnpm build` + production mode
on a throwaway DATA_DIR. Browser (Playwright, Chromium 1360×900): one player
ran the base course to the flag with a scripted route (three jumps, a
six-jump wall climb); two players: A's preview shown to B, A's platform
reached B in 214 ms, B demolished it, countdown, both fell, results, next
BUILD with two death traces; spring launches ~250 px; spike kills and leaves a
trace; standing on a placed plank; sliding at 110 px/s and climb-jumping on a
placed post; A sees B interpolated ~38 px behind while moving; six rounds
rolled over to a fresh level; level, round and items survived a server
restart; no console errors. Not checked: Docker build, Fly deploy, touch
input, screen readers, real people.
