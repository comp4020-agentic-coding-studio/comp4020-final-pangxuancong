# 1. Nobody holds the round: disconnected and idle players are left behind

<!-- Draft for crit 9, 2026-10-13. The facts (what the game does, the numbers,
     the options) are checked against the code. The reasoning in "Decision"
     and "Consequences" is a starting point: rewrite it in your own words,
     because the pod will argue for an option you did not pick. -->

- Status: accepted (in the code since the first playable build, 2026-10-06);
  refined by [0002](0002-rooms-and-seats.md): a dropped player now holds the
  round for an 8 s grace and keeps their seat for 2 minutes
- Applies to: `src/shared/rounds.ts`, `src/server/game.ts`

## Context

Every round waits for people. BUILD ends when every active player has placed a
piece, used the Bomb, or skipped. RUN ends when nobody is still running. There
is no gameplay timer in either phase, because "everyone builds, then everyone
runs" is the game (`docs/GAME_LOOP.md`).

Waiting on everyone is also a weakness. With up to four people on their own
devices, someone will close a laptop, lose wifi, switch tabs, or walk away.
If the round waits for them, it stops for everyone.

`README.md` says a good shared machine "gives each person responsibility for
something small while making everyone dependent on the whole". That cuts both
ways here. Each player's one piece matters, so the round should wait for it.
But if everyone depends on everyone, one absent player can stop the other
three, and depending on the whole becomes being held hostage by it.

The question: **when one player is gone or idle, what happens to everyone
else's round?**

## Options considered

1. **Wait for them.** The round stays open until the player returns and acts.
   Nobody's turn is ever taken away, but one closed laptop stops the game for
   everyone, possibly forever.
2. **A fixed timer per phase** (for example 30 s to build, 60 s to run).
   Predictable and simple, but it pushes everyone, including people who are
   present and thinking. That makes building a race against a clock, and the
   brief and our rules say BUILD and RUN end on what players do, not on time.
3. **Pause the game** until the missing player returns or is removed by a
   vote. Fair to the absent player, but the people who are here have to
   manage the absence: wait, notice, vote.
4. **Leave them behind (chosen).** A player who disconnects stops counting at
   once. A player who is still connected but idle is skipped after a limit. The
   people who are present never wait long for someone who is not.

## Decision

Option 4, with limits generous enough that nobody present feels rushed:

- **Disconnect:** an active player who disconnects becomes `DISCONNECTED` in
  BUILD or RUN. They no longer count towards the round ending. Pieces they
  already placed stay in the level.
- **Idle in BUILD:** no build activity (choosing, moving a preview, targeting)
  for **40 s** auto-skips the player. Nobody is still waiting **120 s** after
  BUILD began, even someone fidgeting. The remaining time appears only in the
  last 15 s, so it does not feel like a clock.
- **Idle in RUN:** a runner whose character has not moved for **30 s** is out
  for that run (`DEAD`, no points), so a hidden tab cannot hold RUN open.
- **Coming back:** a returning player gets the whole current state in one
  snapshot. Mid-round they watch, and they take a free seat at the next
  BUILD. Identity lives in the tab (`sessionStorage`): a reload keeps who you
  were, but closing the tab and opening the site again makes you a new
  player, possibly with a different character.
- **An empty round never completes:** BUILD only ends with at least one active
  player, and if everyone on the roster left without acting, BUILD restarts
  with whoever is here.

These limits are resilience, not the rule. Normally BUILD ends the moment the
last present player acts, well before 40 s.

## Consequences

Gains:

- The people who are present always get to play. One player can stop
  everyone for at most 40 s in BUILD (120 s in total if they keep fidgeting)
  and 30 s in RUN.
- Leaving is free for the group: the absent player's pieces stay, so their
  part of the level still shapes everyone else's run.
- It suits a crit pod on phones and laptops, where someone dropping out is
  likely.

Costs, and who pays them:

- **The absent player loses their turn.** Someone who steps away for a minute
  comes back to a round that went on without them, and they cannot add a piece
  that round. In a game where "everyone changes the level" is the point, this
  is a real loss.
- **A slow thinker can be skipped.** 40 s of no activity counts as idle, even
  if the player is staring at the level and thinking. Moving the preview
  resets the limit, but a player who does not know that can lose their turn.
- **Idle in RUN costs the run.** Standing still for 30 s (waiting for a moving
  platform, watching a launcher's rhythm) counts as idle.
- **Closing the tab is a fresh start.** Someone who closes and reopens the
  site comes back as a new player with no link to their earlier points in
  that game. Their pieces keep their name; their score stays with the old
  player.
- **"Too simple" shifts:** a player who left is not counted, so if everyone
  still running reaches the flag, the round scores nobody (if that was at
  least two people).

## How it is checked

`spec/rounds.test.ts`: a disconnected player does not hold BUILD (S3) or RUN
(S4); the 40 s idle skip and the 120 s limit; the 30 s run idle limit; an
empty BUILD never completes and restarts when everyone left. Checked in the
browser (2026-10-13, two sessions): with A skipped and B still deciding,
BUILD waited; when B closed the tab, BUILD ended 179 ms later and the run
started with B as `DISCONNECTED`; B reopening the site during the run
watched as a new visitor and had a seat at the next BUILD.

## Open questions for playtesting

- Is 40 s right for building, or does it skip people who are thinking?
- Should RUN idle be longer, so standing still to time a jump never counts?
- Would people rather see a quiet "waiting for X" earlier, so the group can
  call to them across the room?
