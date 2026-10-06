# Game loop

## State machine

```text
SELECT (choose one of three levels) ──▶ BUILD
BUILD ──(no active player WAITING)──▶ COUNTDOWN ──▶ RUN
  ▲                                                  │
  ├──── RESULTS ◀──────(no active player RUNNING)────┘
  │        │ after round 6
  └── LEVEL_END (final scores, vote: archive or restart)
                    restart ──▶ SELECT
```

The level persists across every transition. The server owns the phase.

Before a game, everyone connected picks one of three fixed courses
(`src/shared/levels.ts`: The Gaps, The Tower, The Swing). The first pick
starts a 20 s count; it closes early once everyone has picked. Most picks
wins, a tie goes to the lower level number. Picks are ephemeral.

A game lasts **six rounds** on one level. After round 6 comes LEVEL_END: the
final scores, and a vote on what happens to the level (below). Each player
adds at most one item per round.

**At most four players** are on a round. Anyone beyond that spectates, and
takes a free seat at the next BUILD, in order of arrival.

## Active round players

The roster is open during BUILD, up to four players: everyone connected when
BUILD starts, plus anyone who joins before it ends while a seat is free, is
an active player for the round. It closes
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

When the run completes: RESULTS shows who finished, who fell and the points
just earned for about 3.5 s, every level object is kept, characters reset,
the round increments, and the next BUILD starts (LEVEL_END after round 6).

## Scores (decided by the human, 2026-10-06)

Within one game of six rounds:

- reaching the flag: **+1** point;
- each other player killed by a Spike you placed: **+0.2** points. Dying on
  your own spike scores nothing; falls and fan pushes score nobody.

Scores are shown on the roster during the game and as a final table at
LEVEL_END. They belong to that one game: no all-time leaderboard, nothing
carried into the next game, no XP. This rewards sabotage as well as
finishing, so the game no longer stays neutral between the two; that is a
deliberate choice, and playtesting should show whether it crowds out
helping.

## LEVEL_END: archive or restart

After round 6's results everyone connected votes:

- **Archive:** this level is archived with its scores, and the next game
  starts at round 1 on a copy of it, every surviving item still in place, to
  keep building on.
- **Restart:** players choose a course again (SELECT), and the next game
  starts on it bare.

Majority wins once everyone connected has voted, or after 30 s. A tie or
no votes means archive, so nobody's work is thrown away by default. Scores
start from zero either way.

## Previous-round traces (optional)

During BUILD, subtle markers where players died in the last run. Informational
only, replaced after the next run, never level objects. They tie failure to the
next build decision (`docs/PRODUCT.md`, P5).
