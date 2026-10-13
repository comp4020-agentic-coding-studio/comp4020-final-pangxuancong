# Game loop

## State machine

```text
SELECT (walk to a map sign) ──(all agree)──▶ BUILD
   └──(split vote)──▶ DRAW (weighted lot) ──▶ BUILD
BUILD ──(no active player WAITING)──▶ COUNTDOWN ──▶ RUN
  ▲                                                  │
  ├──── RESULTS ◀──────(no active player RUNNING)────┘
  │        │ after round 6
  └── LEVEL_END (final scores, vote: archive or restart)
                    restart ──▶ SELECT
```

The level persists across every transition. The server owns the phase.

Everything below happens inside one room (`/r/CODE`); rooms do not affect
each other (`docs/decisions/0002-rooms-and-seats.md`).

**Seats are characters.** A room has four characters (Chicken, Big Dog, Pot
Horse, Dabai). Choosing a free one takes a seat; nobody is seated
automatically. While choosing a map a seated player may swap to another free
character or give the seat up; during a game they keep it. Everyone without
a character watches.

**Choosing a map is walking.** Before a game the room shows the lobby: a
floor with three signs, one per course (`src/shared/levels.ts`: The Gaps,
The Tower, The Swing). Seated players run around it with the normal
controls; standing in the space under a sign is a vote for that course
(decided by the human, 2026-10-13). When every seated player who is
connected stands under a sign for 2 s, or 30 s after the first one did,
voting closes:

- all under one sign: that course;
- split: DRAW, a lot weighted by the votes (three for map 1 and one for map 2
  is 75% and 25%), shown as a marker sweeping a strip of the maps, each as
  wide as its votes. The server draws; every client animates to the same
  result. Then BUILD.

Picks and the draw are ephemeral.

A game on one level ends at the end of the round in which someone reaches
**4 points**, or after **six rounds**, whichever comes first (decided by the
human, 2026-10-13). Then comes LEVEL_END: the final scores, and a vote on
what happens to the level (below). Each player
adds at most one item per round.

**At most four players** are on a round: the seated ones. A seat taken
while BUILD is open plays at once; one taken later plays from the next
BUILD.

**Dropped connections.** A seated player whose connection drops is held,
not removed. For 8 s (the reconnect grace) the round treats them as still
there; after that BUILD and RUN go on without them (DISCONNECTED), as in
`docs/decisions/0001-nobody-holds-the-round.md`. Their seat, character and
points are kept for 2 minutes; back in time, they carry on (still able to
build if BUILD is open). After that the seat is released.

## Active round players

The roster is open during BUILD: everyone holding a seat when BUILD starts
(including a held seat whose player is reconnecting), plus anyone who takes
a free seat before it ends, is an active player for the round. It closes at
COUNTDOWN; a seat taken during COUNTDOWN, RUN or RESULTS waits for the next
BUILD. The AFK timeout below means a late joiner can never hold BUILD
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
the round increments, and the next BUILD starts (LEVEL_END after round 6, or once someone has 4 points).

## Scores (decided by the human, 2026-10-06; amended 2026-10-13)

Within one game:

- reaching the flag: **+1** point;
- each other player killed by a Spike or Launcher you placed: **+0.2**
  points. Dying on your own trap scores nothing; falls, fan pushes and the
  course's own pieces score nobody;
- **too simple:** if everyone who ran this round reached the flag, and
  that was at least two people (players who disconnected do not count
  either way), nobody scores that round. A
  red "Too simple · no one wins" stamp lands on the round card, which stays
  up 1.5 s longer. A level everyone can finish rewards nobody, so the
  incentive is to build something that catches at least one person;
- **4 points wins:** the game ends at the end of the round in which anyone
  reaches 4, rather than playing out six rounds. The round card shows each
  player's bar toward 4, growing from their total before the round.

A player alone is never "too simple": the flag still scores +1, so a solo
game is played to 4 points or six rounds like any other (decided by the
human, 2026-10-13).

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
- **Restart:** players choose a course again (SELECT, keeping their seats), and the next game
  starts on it bare.

Majority wins once everyone connected has voted, or after 30 s. A tie or
no votes means archive, so nobody's work is thrown away by default. Scores
start from zero either way.

## Previous-round traces (optional)

During BUILD, subtle markers where players died in the last run. Informational
only, replaced after the next run, never level objects. They tie failure to the
next build decision (`docs/PRODUCT.md`, P5).
