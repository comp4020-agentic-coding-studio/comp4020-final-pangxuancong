# Progress

## Current milestone

Crit 08: proof of life. Cutoff Wed 2026-10-07 12:00.

## Product direction

Chain Reaction: one persistent shared Rube Goldberg-style machine.

Definition of good: a good shared machine gives each person responsibility for
something small while making everyone dependent on the whole.

## Current state

Ball → Ramp → Cup works in one browser:

1. the machine is drawn (SVG, fixed layout);
2. the ramp angle is adjustable (5–60°, bounded on the server);
3. Run asks the server for a deterministic run plan, which the browser animates;
4. success or failure shows in the motion, then a one-line explanation;
5. the angle and every attempt persist in SQLite, and the page shows the trace
   the last visitor left.

Realtime multiplayer is intentionally not part of this milestone.

## Still to do for crit 8 (human)

- `README.md`: first version of what good means, with sources actually read.
- `PROCESS.md`: process overview, including the stack choice.
- `reflections/crit-8.md`.
- Deploy, then ship (repo public) before the cutoff.

## Next milestones

1. fixed full chain;
2. anonymous identities and claims;
3. realtime state;
4. authoritative shared runs;
5. animation/audio polish;
6. server-side logging and final robustness.

## Known constraints

- no full physics engine;
- one shared machine, fixed layout;
- SQLite persistence on the /data volume;
- keep README / CLAUDE / spec aligned.

## Open questions

See `docs/PRODUCT_RULES.md`: what happens after the machine is solved, and
what a sixth person does.

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
