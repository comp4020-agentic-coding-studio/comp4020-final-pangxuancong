# Migration from the crit 8 machine

## Context

Crit 8 shipped a deterministic Rube Goldberg machine: one ramp tuned by
angle, a server-computed run plan, a cup. The planned full chain was Ramp →
Dominoes → Spring → Fan → Gate with fixed mechanisms and one operator each.
The product is now a persistent multiplayer build-and-run platformer. Old
rules do not survive just because they exist in code.

## Keep

- the Express server and its `/readme/` route (server-rendered);
- SQLite via `node:sqlite` on the `/data` volume, and the Fly deploy;
- course checks (`spec/invariants.test.ts`, CI) and the Dockerfile shape;
- Git history;
- the warm cream palette and toy-like visual language;
- drag/tray ideas, if they turn out reusable.

## Deprecated

No longer product rules: fixed machine slots and the Ramp → Gate sequence;
server-side deterministic machine simulation and shared run-plan animation;
one operator per mechanism and mechanism claiming; the machine parameter
puzzle. Remove or refactor them incrementally, together with
`spec/machine.test.ts`.

## Before the first big refactor

Make sure the crit 8 state is preserved in Git (the crit cutoff tag, or a tag
such as `crit-8-proof-of-life`), using the project's real workflow. Never
claim a tag exists without checking `git tag`.

## Order

Keep the app runnable and deployable at every step.

1. Keep the deploy and `/readme/` working.
2. Add Vite + Phaser with a test scene, built into what Express serves.
3. Player movement, platforms, goal.
4. Wall slide, wall jump, grace window.
5. Replace the machine board with the shared level.
6. BUILD / RUN state machine, locally.
7. Platform, Spring, Spike.
8. Persist placed items.
9. Socket.IO shared placement.
10. Remote players.
11. Round-status networking.
12. Fan, Moving Platform.
13. Demolition Bomb.
14. Art, sound and multiplayer feedback polish.
