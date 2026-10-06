# Chain Reaction

A small real-time multiplayer shared machine for ANU COMP4020.

## Product invariant

A good shared machine gives each person responsibility for something small
while making everyone dependent on the whole.

Never weaken this invariant in order to add features.

## Read before editing

Product/interaction:
- `README.md`
- `docs/PRODUCT_RULES.md`

Architecture/state:
- `docs/ARCHITECTURE.md`

Visual/audio work:
- `docs/ART_DIRECTION.md`

Tests/completion:
- `docs/TESTING.md`

Current status:
- `PROGRESS.md`
- `feature_list.json`

## Hard rules

- Keep one shared fixed machine.
- Do not add chat, profiles, leaderboards, rooms or free-form construction.
- Server is authoritative for shared state; the browser animates what the
  server decided and never computes an outcome itself.
- Persistent machine state and ephemeral presence must remain separate.
- One active operator per mechanism.
- Run results must be deterministic and shared across clients.
- Do not add a full physics engine.
- Other clients should see shared state changes within about one second.
- `/readme/` must publish the README in full, rendered on the server.
- Leave the course-fixed settings in `fly.toml`, the `/data` volume and the
  shipped `spec/invariants.test.ts` as they are.
- No mechanism may have one hidden correct value; success depends on how
  adjacent mechanisms relate (`docs/PRODUCT_RULES.md`, G2a).
- `README.md`, `PROCESS.md` and `reflections/` are drafted only from the
  human's own ideas and experience, for them to rewrite. Never fabricate
  process evidence, crit feedback, sources read or citations.

## Completion

A task is not complete because the code looks correct.

Before declaring completion:

1. `pnpm typecheck` must pass;
2. start the app (`pnpm dev`) and `pnpm check` must pass against it;
3. for cross-component behaviour, verify the user flow in a running browser;
4. update `PROGRESS.md` and `feature_list.json` when project state changes.

If something could not be verified, say so; never report it as done.

Do not perform unrelated refactors before the requested behaviour is working.
When a mistake reveals a reusable lesson, put the fix in this harness (a rule
in `docs/`, a check in `spec/`), not just in the code.
