# Process overview

This is rewritten at each crit so it describes the project as it stands. This
version is for crit 10 (fly by instruments).

## From a machine to a platformer

At crit 8 Chain Reaction was a fixed Rube Goldberg machine: one shared layout,
five mechanisms, and players tuned bounded parameters. The idea came from
playing *Ultimate Chicken Horse* with my roommates (`reflections/crit-8.md`),
but I had cut away the part that made that game work: players putting their
own pieces into one level and then having to run through it.

Right after crit 8 I tried a middle step, a "constrained builder" where
players place parts from a tray into a machine. The agent built a first
version. I looked at it running and rejected it: it was too rough, and it was
still a machine to watch rather than a level to play. I had it rolled back and
decided to change the project goal instead of patching it.

The new goal is *build the level together, survive what you built*: a
real-time multiplayer platformer where everyone adds one piece to a shared
level during BUILD, then everyone runs it at the same time
([`0855d21`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-pangxuancong/commit/0855d21)).
The definition of good in `README.md` survived the change, because it was
about interdependence, not about machines.

Throwing away the crit 8 work was worth it because patching it would only
have given me a better machine to watch. What I wanted from the start was the
feeling of four people changing one level and then living with it, and the
only way to get that was to let players place pieces and run.

## Rebuilding the harness first

As before, I worked out the new direction in a separate conversation before
writing any code: the loop, the items, the Demolition Bomb as a way out of a level that has been
blocked off, and wall-jump assistance so the game is about what players build
rather than about precise jumping. I gave that brief to Claude Code, which
retired the old harness and wrote a new one in one commit, before any game
code ([`0855d21`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-pangxuancong/commit/0855d21)):

- `CLAUDE.md`: the product invariant, hard rules and a routing table;
- `docs/`: one file per topic (game loop, items, movement, multiplayer,
  architecture, art, motion and audio, testing, migration);
- `spec/`: the promises that can be checked mechanically (round transitions,
  placement rules, two-client realtime sync);
- `PROGRESS.md` and `feature_list.json`: the current state, with the rule that
  nothing is marked `verified` until it has been checked in a browser.

Before development started I made four decisions the harness had left open:
BUILD needs an AFK timeout, each player adds at most one item per round, a game
is six rounds, and commits were fine but nothing was pushed until crit 8 was
over.

## Stack

The stack changed with the product. A platformer needs real collisions and
jumps, so the SVG and CSS animation of crit 8 became Phaser 3 with Arcade
Physics, built by Vite. The server is still Express with `node:sqlite` on the
`/data` volume, now with Socket.IO for real time. Node runs the TypeScript
directly, and the app is deployed to Fly.io; CI runs the spec against the
Docker image and deploys on every push to `main`.

The server owns everything shared (the level, the phase, the roster, build
actions, scores) and sends a whole snapshot whenever it changes. Each browser
simulates its own runner, so movement feels immediate, and draws the others
from interpolated positions. Moving platforms and launchers are computed from
the run clock, so every client sees them in the same place without the server
sending them.

## How it grew

- First playable build and run, with specs for rounds, placement and
  two-client sync ([`a52d15f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-pangxuancong/commit/a52d15f)).
- My scoring idea: +1 for reaching the flag, +0.2 when your trap kills
  someone, and after six rounds a vote to keep the level or start bare
  ([`3b42f47`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-pangxuancong/commit/3b42f47)).
- Three courses laid out from reference images I supplied, a level vote, and
  four characters drawn from my references
  ([`8b5ad77`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-pangxuancong/commit/8b5ad77)).
- A bigger world with a following camera
  ([`5836de4`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-pangxuancong/commit/5836de4)),
  then edge badges and watching
  ([`9ce316c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-pangxuancong/commit/9ce316c)).
- Rule changes I asked for: if everyone makes it, nobody scores ("too
  simple"); first to 4 points wins, with a progress bar on the round card; and
  the Launcher
  ([`0d1a484`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-pangxuancong/commit/0d1a484)).
- Deployed and checked live with two browsers
  ([`e707048`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-pangxuancong/commit/e707048)).
- After crit 9 I decided the first problem was playing together and dropping
  out. Sharing one URL could not limit a game to four or handle a dropped
  connection, so the limit became four per room, not four per server: a lobby
  of rooms, each with its own level, the four characters as seats, and a
  dropped player keeping their seat and points
  ([`c72f570`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-pangxuancong/commit/c72f570)).
- My idea for choosing a map: pick a character and you are already playing;
  walk under a map sign to vote; if the room splits, a draw weighted by votes
  (3 to 1 is 75% to 25%). Then I asked for a spinning wheel, so the draw feels
  like something everyone takes part in ([`4095012`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-pangxuancong/commit/4095012)).
- Touch controls and level sounds ([`4996d3b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-pangxuancong/commit/4996d3b)), and the same walk-and-wheel
  vote for keeping the level after a game ([`98002ff`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-pangxuancong/commit/98002ff)).
- The README in the shape of a reference I liked, then in my own voice
  ([`fbe25b0`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-pangxuancong/commit/fbe25b0)).

## The decision for this crit

This crit asks that the app tell people apart, that the server decide what
each person may change, and that the logs say who did what. Before deciding
I asked the agent what game companies like Riot do and whether I needed
something like Redis. I chose the simplest thing that works for one server:
each event is a line on stdout, which `flyctl logs` shows live, and a row in
SQLite on the `/data` volume, which outlives the crit ([`f87008f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-pangxuancong/commit/f87008f)).

How people are named was my choice too. Out of the options I picked
`Character#tag`, like a Riot ID: the character is what you play, the tag is a
short hash of a secret id that never leaves the server, and the tag is shown
in the player list so people can find themselves in the log.

`docs/decisions/0003-who-may-change-what.md` records who may change what
([`3ba894c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-pangxuancong/commit/3ba894c)). The Demolition Bomb may remove anyone's piece. Chain Reaction
is a party game between friends, and that gives friends more ways to play
with and against each other. If my piece is bombed, that is fine, because my
friend gave up placing their own piece to do it. I expect the pod to argue
for protecting a new piece for a round, but if someone places a piece that
blocks the path, we would lose two rounds getting rid of it. A run's result
is reported by the browser and not checked; between friends that is not
worth the cost.

The earlier decisions still stand:
`docs/decisions/0001-nobody-holds-the-round.md` (a player who drops or idles
is left behind, so the others never wait long) and
`docs/decisions/0002-rooms-and-seats.md` (rooms of four, a character is a
seat, a dropped seat is held for two minutes).

## Directing, grounding and correcting the work

**Directing.** The product decisions were mine: rejecting the constrained
builder, the scoring, the level and character references, "too simple", first
to 4, the Launcher, and keeping the README's definition of good when the rest
of the README was rewritten
([`d0f97cf`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-pangxuancong/commit/d0f97cf)).

**Grounding.** The agent reads `CLAUDE.md` and the relevant `docs/` file
before it changes anything, and a feature is not done until `pnpm typecheck`
and `pnpm check` pass and it has been tried in a browser (two browsers for
anything realtime). When a rule changes, the harness changes in the same
commit as the code, so the next session does not build against an old rule.

**Correcting.** The corrections that mattered came from playing the game:

- *The Moving Platform was too fast.* I reported it twice. The second time the
  cause turned out to be a frame-rate bug, not a speed setting: the platform's
  velocity came from the gap between frames, which overshot on fast screens.
  The fix uses the track's real velocity, a spec now checks it, and the lesson
  is written in `docs/ARCHITECTURE.md`
  ([`5836de4`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-pangxuancong/commit/5836de4)).
- *"What if one player is far left and another far right?"* My question showed
  that multiplayer had not been tested at the edges of a bigger world. It led
  to edge badges for off-screen runners and watching someone else once you are
  out ([`9ce316c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-pangxuancong/commit/9ce316c)).
- *Solo play could never score.* The first "too simple" rule voided a round
  whenever everyone finished, which included a player alone. It now needs two
  or more runners, and a spec covers solo scoring
  ([`6b5236c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-pangxuancong/commit/6b5236c)).
- *The wheel did not spin.* I reported it twice. The first time, my Windows
  setting for animations was off, which the browser reports as "reduce
  motion", and the code skipped straight to the result; there is now a
  Motion switch and the wheel still turns gently. The second time my own dev
  server was running old code, which made the angle NaN. Now the page warns
  when it and the server are on different versions, and the lesson is in
  `docs/TESTING.md` {c("14e9c4d")}.
- *Empty rooms stayed in the lobby.* I noticed it while testing; empty rooms
  now leave the list after two minutes {c("fbe25b0")}.
- *Tests must not touch the server I am playing on.* The agent runs its checks
  against a throwaway server on another port.
- *Claims must be checked.* A draft of the ADR said reconnecting from a second
  tab had been verified when it had not been. It was removed and replaced with
  a real two-browser test.

The Moving Platform taught me the most. I reported "too fast" once and the
agent slowed it down, but it was still too fast on my screen, because the
real problem was the frame rate, not the speed. Reporting what I saw, not
what I guessed the fix was, is what got to the cause.

## What comes next

Rehearsing the crit several times: two people open the URL in separate
browsers while I only read `flyctl logs` and say who did what. Then
playtesting with the pod: whether people bomb more than they build, and
whether the logs tell me enough when something goes wrong.
