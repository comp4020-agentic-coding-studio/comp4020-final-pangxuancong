# Product rules

The implementation translation of the claims in `README.md`. A feature that
supports none of these claims probably doesn't belong.

## Principles

- **G1 Small individual responsibility.** Each operator controls one
  mechanism, never the whole machine.
- **G2 Interdependence without chaos.** Fixed composition; visitors tune bounded
  parameters and never place, delete, resize or create parts.
- **G3 The machine is the communication medium.** Presence shows on the
  mechanisms themselves. No chat box.
- **G4 Persistence belongs to the shared object.** Mechanism settings and
  attempts survive refresh, return, restart and redeploy. Presence and
  ownership do not.
- **G5 Failure should be informative.** Motion shows where the chain broke
  first; a short explanation follows after it settles. No failure modals.
- **G6 Success belongs to the room.** No personal score, XP, streaks,
  achievements or leaderboards.
- **G7 Tactile, restrained presentation.** The machine dominates the page
  (`docs/ART_DIRECTION.md`).

## Traceability

| Good claim | Product rule | Automated? | Human judgement? |
|---|---|---:|---:|
| Each operator owns something small | one active operator per mechanism | yes (planned, S3) | no |
| People depend on the whole | no user can control every mechanism simultaneously | simple check | yes |
| Collaboration happens through machine | real-time mechanism updates + presence attached to mechanism | partial (planned, S2) | yes |
| Avoid chaos | fixed layout and bounded controls | yes (`spec/machine.test.ts`) | yes |
| Failure should be legible | run identifies the break point | partial | yes |
| Success belongs to room | no personal scoring/leaderboard | no | yes |
| Shared object outlives participants | mechanism state is persistent | yes (`spec/machine.test.ts`) | no |
| Presence is temporary | role ownership is not persisted as machine state | yes (planned) | no |
| Machine feels tactile | motion/audio rules | no | yes |

## Priority order

When product goals conflict:

1. shared causality;
2. clarity;
3. reliable multiplayer state;
4. persistence;
5. tactile polish;
6. extra features.

Never sacrifice the first four for visual novelty.

## Out of scope

Unless the human explicitly changes the product definition: chat, direct
messages, accounts, profiles, following, likes, leaderboards, XP,
achievements, multiple rooms, matchmaking, level editors, free drag-and-drop
construction, physics sandboxes, uploads, AI-generated content, inventories,
cosmetics, settings dashboards.

## Open questions

Recorded so they are decided, not defaulted:

- **A solved machine.** The simulation is deterministic and settings persist,
  so once a run succeeds the next visitor inherits a solved machine. What
  happens after success?
- **More people than mechanisms.** Five mechanisms; the showcase is a room
  full of people. What does the sixth person do?
