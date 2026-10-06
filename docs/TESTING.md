# Testing

Lightweight on purpose. A check exists because it protects a claim in
`README.md` / `docs/PRODUCT.md`; coverage percentage is not a goal, and
frame-perfect physics tests are not wanted. Everything in `spec/` runs with
`pnpm check` against the running app (start it with `pnpm dev`).

Restart `pnpm dev` before checking a change. `node --watch` can lose track of
a file that was replaced rather than written in place (`sed -i`, some editors)
and keep serving old code without saying so.

## Checks

| Id | Check | Protects | Status |
|---|---|---|---|
| S0 | `/` answers; `/readme/` has every README heading | course invariants | `spec/invariants.test.ts` (shipped, keep) |
| S1 | a committed Platform is in the level state, and still there after reload/reconnect | the level outlives sessions (P7) | planned |
| S2 | client A commits an item; client B receives it without reload, within ~1 s. Committed state only, not drag previews | changes are shared (P8) | planned |
| S3 | two active players: A places, B skips → BUILD ends. A WAITING player holds BUILD; a DISCONNECTED one does not | everyone changes the level; rounds progress (P1) | planned |
| S4 | A FINISHED + B DEAD → next BUILD; A FINISHED + B RUNNING → still RUN | rounds progress without timers | planned |
| S5 | Bomb on a placed item: removed, removal persists, action consumed. Bomb on START, GOAL, base geometry: rejected | deadlock is recoverable (P4) | planned |
| S6 | placement inside START or over GOAL rejected; a legal one accepted. Never test completability | only technical validity (P3) | planned |
| — | ramp setting and attempt persist; out-of-bounds angles refused | crit 8 machine | `spec/machine.test.ts` (deprecated; remove with the machine code, `docs/MIGRATION.md`) |

S3 and S4 are cheapest as unit tests of a pure round-state function, plus one
two-client check once Socket.IO exists.

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
