# Process overview

This is rewritten at each crit so it describes the project as it stands. This
version is for crit 8 (proof of life).

## From the brief to Chain Reaction

The brief asks for a multi-user, real-time website that is good, and leaves
everything else open. I considered several directions. One was a co-operative
city builder in the spirit of LEGO-style city skyline games, and another was a
shared music room where several people play one instrument together. Both
seemed likely to grow faster than I could finish them well, so I set them
aside.

The direction I chose came from playing *Ultimate Chicken Horse* with my
roommates (see `reflections/crit-8.md`). The thing I wanted to keep was
interdependence: each person contributes one small piece, and the result only
works if the pieces fit together. Chain Reaction keeps that and cuts the most
expensive part. In the original game players choose and place their own
objects. Here the layout is fixed and players only tune bounded parameters.
That was the hardest scope cut, and `README.md` explains why I made it.

## Building the harness

I developed the harness by iterating with ChatGPT before any code existed. We
worked through gameplay, comparable games, art direction, animation and sound,
and ended with a long project brief for Claude Code: the definition of good,
product principles, an explicit list of things not to build, a state model, a
stack, and milestones.

Claude Code turned that into a short `CLAUDE.md` that routes to detailed rules
in `docs/`, instead of one ever-growing file
([`b88d300`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-pangxuancong/commit/b88d300)).
`docs/PRODUCT_RULES.md` maps each claim in the README to a product rule and
says whether it is checked automatically or judged by a person.

The list of things not to build (chat, accounts, profiles, likes, leaderboards,
XP, achievements, AI features, a physics sandbox, a level editor, multiple
rooms, matchmaking, inventories, cosmetics) is there to stop the agent adding
features because multi-user apps usually have them. A feature has to support a
claim in the README to belong.

## Stack

The stack in my harness is React, TypeScript and Vite on the frontend; an SVG
machine animated with CSS, the Web Animations API and `requestAnimationFrame`;
Node.js and Express on the server; Socket.IO for real time; SQLite for
persistence; the Web Audio API for sound; and Fly.io for deployment.

The main architectural decision is a deterministic simulation instead of a
physics engine. The server decides what happens in a run and the browser only
animates it. Real physics would make results harder to keep identical across
several browsers and harder to read. The cost is less emergent behaviour, which
suits a machine that is meant to be tuned, not explored. SQLite fits because
the shared state is small and structured, and the course gives each app a
single volume rather than a database server.

For crit 8 the agent proposed building only part of that stack, and I agreed.
The proof of life
([`58e97f7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-pangxuancong/commit/58e97f7))
is an Express server with SQLite through Node's built-in `node:sqlite` (no
native module to compile in Docker) and a plain JavaScript SVG page. React and
Socket.IO arrive when the real-time layer needs them in week 10. The server
renders `README.md` itself, because the course check reads `/readme/` without
running any script.

## Directing and correcting the work

When the agent first reviewed the idea, it raised two problems I had not
resolved. A deterministic machine with persistent settings stays solved
forever, and five mechanisms cannot seat a room full of people at the showcase.
I took both seriously and wrote down where I am leaning, without building
either yet: archive a finished machine and start a new one; operator seats with
observers and rotation between runs.

I also turned a risk into a rule. The worst version of this game is five
people guessing a PIN, where each mechanism has one correct number. I made "no
mechanism may have one hidden correct value" a hard rule in the harness, so
later work has to keep mechanisms dependent on each other
([`7fa6139`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-pangxuancong/commit/7fa6139)).

Smaller corrections happened while the agent verified its own work in a real
browser: a redirect loop on `/readme`, and failure messages that quoted
distances in drawing units ("44 short"), which meant nothing to a player.

## What comes next

Week 10 makes the machine real-time and multi-user: anonymous identities,
claiming a mechanism, live updates, and a shared run every viewer sees. It also
needs the decision about how the machine behaves with more people than seats.
