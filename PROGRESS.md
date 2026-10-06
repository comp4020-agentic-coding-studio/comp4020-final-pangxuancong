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

The code is still the crit 8 machine (Ball → Ramp → Cup, SVG, deterministic
server run plan, SQLite). It is the migration source, not the target
(`docs/MIGRATION.md`). Harness rewritten for the platformer; no platformer
code exists yet.

## Still to do (human)

- Crit 8, before the cutoff: `README.md`, `PROCESS.md`,
  `reflections/crit-8.md`, deploy and ship, as planned.
- After the cutoff: rewrite `README.md` for the platformer (the current one
  argues for the fixed machine). `PROCESS.md` still points to
  `docs/PRODUCT_RULES.md`, which this pivot removed (it remains in Git
  history); how to describe the pivot there is yours to decide.

## Next milestones

1. Platformer vertical slice (F01–F04): Phaser scene, START, GOAL, run, jump,
   wall slide and wall-jump grace, death bounds, finish trigger. Single
   player, no placement.
2. Local round loop (F05–F09): BUILD → RUN → BUILD with Platform, Spring,
   Spike, one build action, placed items persisted.
3. Multiplayer (F10–F13): Socket.IO snapshot, realtime committed placement,
   remote players, statuses, server phase, simultaneous BUILD.
4. Recovery (F14): Demolition Bomb, protected START/GOAL.
5. Later: Fan, Moving Platform, death traces, animation, sound, responsive
   layout, reconnect robustness, activity logging.

## Known constraints

- `fly.toml`, the `/data` volume and `spec/invariants.test.ts` are fixed;
- Vite adds a build step the current Dockerfile does not have;
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
