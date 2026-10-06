# Chain Reaction

A real-time multiplayer platformer for ANU COMP4020: **build the level
together, survive what you built.** Players change one persistent obstacle
course during BUILD, then all attempt to reach the flag during RUN. They may
help, sabotage, repair earlier sabotage or find unintended routes; the game
never decides which of those is the right way to play.

## Product invariant

A good shared level lets every player meaningfully change the possibilities
available to everyone else.

- The game permits cooperation and sabotage without deciding which is correct.
- Failure should change what players build next.
- Every placeable gameplay object must create a meaningful movement decision.

Never weaken these in order to add features.

## Read before editing

- Product intent: `README.md`, `docs/PRODUCT.md`
- Round rules: `docs/GAME_LOOP.md`
- Placeable objects and the Demolition Bomb: `docs/ITEMS.md`
- Player movement: `docs/MOVEMENT.md`
- Realtime behaviour: `docs/MULTIPLAYER.md`
- Architecture and persistence: `docs/ARCHITECTURE.md`
- Visual language: `docs/ART_DIRECTION.md`
- Animation and sound: `docs/MOTION_AUDIO.md`
- Tests and completion: `docs/TESTING.md`
- Moving off the crit 8 machine prototype: `docs/MIGRATION.md`
- Current status: `PROGRESS.md`, `feature_list.json`

## Hard rules

Loop and rounds:

- The shared level is the primary persistent object.
- The loop is BUILD → RUN → BUILD → RUN. The level never resets between rounds.
- BUILD has no gameplay timer: it ends when every active player has PLACED,
  SKIPPED or DISCONNECTED. An AFK timeout auto-SKIPs idle players
  (`docs/GAME_LOOP.md`); it is required, but it is resilience, not the rule.
- RUN has no gameplay timer: it ends when no active player is still RUNNING
  (each is DEAD, FINISHED or DISCONNECTED).
- Each active player gets at most one build action per BUILD phase, so adds
  at most one item per round.
- A level lasts six rounds; then a fresh level starts.
- A committed placement belongs to the level and cannot be dragged again.

Level validity:

- Players may make the level harder or impossible. Never add "there must
  always be a path" validation or pathfinding.
- Reject only technically invalid placements: outside build bounds, inside the
  protected START volume, over the GOAL trigger, or collider overlap that
  breaks physics.
- The Demolition Bomb is a normal build action: it removes one destructible
  player-placed object, whoever placed it. It can never remove base geometry,
  START, GOAL or world boundaries.

Movement and authority:

- Player-player collision is off unless the human approves it.
- The server is authoritative for shared state: level items, phase, round,
  roster, build actions and player status.
- Local player movement may be client-authoritative for responsiveness;
  remote players are drawn from interpolated snapshots. No anti-cheat.
- Movement must be forgiving: touching a wall, or having just touched one,
  gives a short wall-jump window.
- Platformer physics only (Phaser Arcade Physics). No general rigid-body
  engine (Matter.js and the like) without human approval.
- Persistent level state and ephemeral presence/motion stay separate.
- Other clients should see shared state changes within about one second.

Scope and course:

- No chat, accounts, profiles, XP, leaderboards, matchmaking, stores, rooms or
  AI features.
- `/readme/` must publish the README in full, rendered on the server.
- Leave the course-fixed settings in `fly.toml`, the `/data` volume and the
  shipped `spec/invariants.test.ts` as they are.
- `README.md`, `PROCESS.md` and `reflections/` are drafted only from the
  human's own ideas and experience, for them to rewrite. Never fabricate
  process evidence, crit feedback, test results, sources read or citations.

## Feature rule

Before adding a placeable object, ask: does it meaningfully change how players
move through the level? If not, it does not belong.

## Completion

A task is not complete because the code looks correct. Before declaring
completion:

1. `pnpm typecheck` passes;
2. restart the app (`pnpm dev`) and `pnpm check` passes against it;
3. the flow was exercised in a running browser;
4. realtime features were inspected with two browser sessions;
5. `PROGRESS.md` and `feature_list.json` are updated when project state
   changes. Never mark a feature `verified` without having verified it.

If something could not be verified, say so; never report it as done.

Do not perform unrelated refactors before the requested behaviour is working.
When a mistake reveals a reusable lesson, put the fix in this harness (a rule
in `docs/`, a check in `spec/`), not just in the code.
