# Game loop

## State machine

```text
BUILD ──(no active player WAITING)──▶ COUNTDOWN ──▶ RUN
  ▲                                                  │
  └──── RESULTS ◀──────(no active player RUNNING)────┘
```

The level persists across every transition. The server owns the phase.

A level lasts **six rounds**. After round 6's RESULTS the level is finished:
it stays in the database as history, and a fresh level (base geometry only)
starts at round 1. Each player adds at most one item per round, so a level
never holds more than six items per player.

## Active round players

The roster is open during BUILD: everyone connected when BUILD starts, plus
anyone who joins before it ends, is an active player for the round. It closes
at COUNTDOWN; anyone joining during COUNTDOWN, RUN or RESULTS spectates until
the next BUILD. The AFK timeout below means a late joiner can never hold BUILD
open for long. (An empty roster would otherwise complete BUILD and RUN
instantly, forever; BUILD only completes with at least one active player.)

## BUILD

Each active player gets exactly one build action, taken simultaneously, in
no order:

- place one normal item,
- use one Demolition Bomb,
- or SKIP.

Before committing a player may move, rotate (where supported) and adjust the
item's allowed parameters. Committing consumes the action and makes the item
shared level state; it can never be repositioned.

Build state per active player: `WAITING | PLACED | SKIPPED | DISCONNECTED`.

```ts
buildComplete = activePlayers.every((p) => p.buildState !== "WAITING");
```

**AFK timeout (required).** A player with no build activity (choosing,
moving a preview, targeting) for 40 s is auto-SKIPPED, and nobody is left
WAITING 120 s after BUILD started. These are resilience limits, not the round
rule: BUILD normally ends as soon as everyone has acted. The remaining time is
shown only when it is short.

## COUNTDOWN

Placements lock, characters move to START, every active player becomes
RUNNING, and a short 3 · 2 · 1 · GO plays.

## RUN

Everyone attempts the level at once. Run state per active player:
`RUNNING | DEAD | FINISHED | DISCONNECTED`.

```ts
runComplete = activePlayers.every((p) => p.runState !== "RUNNING");
```

No gameplay timer: the run lasts while anyone is still RUNNING. One
resilience limit: a RUNNING player whose character has not moved for 30 s
(an idle or hidden tab stops sending snapshots too) becomes DEAD, so a
walked-away player cannot hold RUN forever.

- **Death:** touching a lethal hazard or leaving world bounds. No respawn in
  the same run; the player spectates. Quick and readable, not punishing.
- **Finish:** reaching the flag trigger. The player stops participating
  physically and may watch. Nobody is required to finish.

When the run completes: RESULTS shows who finished and who fell for about
3 s (longer after round 6, when the level is finished), every level object is
kept, characters reset, the round increments, and the next BUILD starts.

## No winners

No scoreboard. FINISHED is never converted into points or rankings. What a
round produces is who found a route, where people failed, and how the level
changed.

## Previous-round traces (optional)

During BUILD, subtle markers where players died in the last run. Informational
only, replaced after the next run, never level objects. They tie failure to the
next build decision (`docs/PRODUCT.md`, P5).
