# Process overview

This is rewritten at each crit so it describes the project as it stands. This
version is for crit 9 (all at once).

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

## The decision for this crit

`docs/decisions/0001-nobody-holds-the-round.md` records what happens when one
player disconnects or goes idle: they are left behind, so the people who are
present never wait long
([`268ac0c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-pangxuancong/commit/268ac0c)).
I picked it because BUILD and RUN wait for everyone, which is exactly the
interdependence the README asks for, and also exactly how one closed laptop
could stop a crit pod.

I expect the pod to argue for waiting, or for pausing until the missing
player comes back, because leaving someone behind takes their turn away. My
answer is that at a crit, or with friends on their phones, someone dropping
out is normal, and a game that stops for one person stops for everyone. The
absent player's pieces still stay in the level, so they still shape the
round even when they are not there.

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

Playtesting with the pod: whether the idle limits in the ADR are right,
whether the Launcher and "too simple" make people build differently, and how
the game feels with four people on their own devices.
