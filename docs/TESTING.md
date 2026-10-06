# Testing

Lightweight on purpose. A check exists because it protects a claim in
`README.md`; coverage percentage is not a goal. Everything in `spec/` runs
against the running app with `pnpm check` (start it first with `pnpm dev`).

## Checks

| Id | Check | Protects | Status |
|---|---|---|---|
| S1 | `/` answers; `/readme/` has every README heading | course invariants | `spec/invariants.test.ts` (shipped, keep) |
| S5 | a later request sees the ramp setting and the attempt an earlier one left | shared object outlives participants | `spec/machine.test.ts` |
| S6 | out-of-bounds or malformed ramp angles are refused, state unchanged | constrained, not chaotic | `spec/machine.test.ts` |
| S2 | client A changes a mechanism; client B sees it without reload, within ~1 s | collaboration through the machine | planned (crit 9) |
| S3 | client B cannot mutate a mechanism client A has claimed | each operator owns something small | planned (crit 9) |
| S4 | two clients watching one run receive the same `runId` and result | success belongs to the room | planned (crit 9) |

Persistence across a real Fly redeploy is a manual check: set a value, deploy,
reload the live site.

The spec mutates machine state, so run it against a local or CI app, never
against the live site.

## Manual judgement checklist

Before a milestone is called polished:

- Can a new person identify the chain direction?
- Can they identify which part they control?
- Can they see somebody else changing a part?
- Does a failed run visibly communicate where the chain broke?
- Does success feel collective rather than personal?
- Is the machine visually more prominent than interface chrome?
- Does sound reinforce action rather than become constant noise?
- Is keyboard interaction possible?
- Does resizing preserve usability?

These are judgements, not metrics.
