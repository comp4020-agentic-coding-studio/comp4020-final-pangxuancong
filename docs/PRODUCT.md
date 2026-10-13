# Product

The implementation translation of the claims in `README.md`. A feature that
supports none of these probably doesn't belong.

## What it is

A persistent multiplayer obstacle course. Players alternate between BUILD
(each active player gets one change to the shared level) and RUN (everyone
attempts the level at once). The level never resets: what players add, remove
and discover is the starting point of the next round.

> Build the level together. Survive what you built.

## Definition of good

> A good shared level lets every player meaningfully change the possibilities
> available to everyone else.

A placement is meaningful when it changes where players can stand or jump,
which routes are safe, how movement must be timed, how hard a route is, or
whether an earlier obstruction can be removed. A few objects with clear
consequences beat a large inventory of weak ones.

## Principles

- **P1 Every player changes the level.** One build action per player per
  round; it always matters to everyone's next run.
- **P2 No helpful or harmful items.** The same object helps or hurts depending
  on placement: a spring makes a shortcut or launches someone into spikes; a
  fan carries someone across a gap or pushes them off a ledge; a platform
  makes a bridge or blocks a jump arc. The game never sorts items into the
  two, and never decides whether cooperation or sabotage is correct.
- **P3 Impossible levels are allowed.** An impossible round is the next
  BUILD's problem, not a design failure. Players may add a route, add
  movement help, destroy an obstruction, or make it worse. No path-validity
  checks.
- **P4 Deadlock recovery is a player decision.** The Demolition Bomb lets a
  player remove any destructible player-placed object, including someone
  else's. The system never removes an obstruction on its own.
- **P5 Failure changes the next round.** A run where everyone dies still shows
  where people fall, what route worked, what is too strong, where a platform
  would help, what should go. Previous-round traces (optional) put this on
  the level itself.
- **P6 The challenge is the level, not the controls.** Movement is forgiving
  (`docs/MOVEMENT.md`) so difficulty comes from what players built.
- **P7 Persistence belongs to the level.** Placed objects, their transforms
  and parameters, the round number and relevant history survive refresh,
  restart and redeploy. Player motion, presence and round status do not.
- **P8 Presence through the level.** Other people are felt by seeing them run
  and seeing their placements land. No chat box.
- **P9 Tactile, restrained presentation** (`docs/ART_DIRECTION.md`).
- **P10 Small rooms.** A room seats four, one per character; more watch and
  take a seat when one is released. Four keeps the level readable and every
  piece attributable. Many rooms can play at once, each on its own level
  (`docs/decisions/0002-rooms-and-seats.md`).

## Traceability

| Claim | Product rule | Automated? | Human judgement? |
|---|---|---:|---:|
| Everyone changes the level | one build action per player per round | yes (S3) | yes |
| The level outlives players | placed items persist | yes (S1) | no |
| Changes are shared | committed placement reaches other clients within ~1 s | yes (S2) | yes |
| Rounds always progress | BUILD/RUN end on player states, not timers; disconnects never block | yes (S3, S4) | no |
| Deadlock is recoverable | Bomb removes destructible items, never protected ones | yes (S5) | yes |
| Only technical validity is enforced | START/GOAL protected; no path checks | yes (S6) | no |
| Items are neither good nor bad | same object can help or hurt | no | yes |
| Challenge is the level | forgiving wall movement | rule only (unit test) | yes |
| Scores stay inside one game | +1 finish, +0.2 per other player killed by your spike or launcher; a round everyone finishes scores nobody; first to 4 ends the game; reset every game; no all-time board | yes (S7) | yes |
| A finished level can live on | archive (continue on a copy) or restart, by vote | yes (S8) | yes |

## Priority order

When goals conflict:

1. every player meaningfully changes the shared level;
2. rounds always progress (nobody can stall the loop);
3. reliable shared state;
4. persistence;
5. movement feel;
6. tactile polish;
7. extra items or features.

## Out of scope

Unless the human explicitly changes the product: chat, direct messages,
accounts, profiles, likes, all-time leaderboards, XP, achievements,
matchmaking, room settings (names, passwords, owners), stores, cosmetics, AI features, unlimited level-editor
tools, hundreds of object types, realistic physics simulation, ranked play,
player-player collision.

The level must stay small enough that a newcomer understands it at a glance.
