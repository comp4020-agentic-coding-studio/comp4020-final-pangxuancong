# Chain Reaction

<!-- Draft, 2026-10-14, in the shape of the example you shared (one object,
     then what good means, what was read, what was left out, what is
     checked). Facts about the game are checked against the code; the
     reasons are yours to rewrite. The one change to your definition of good
     is "machine" -> "level". Readings: only what you have told me you read;
     add the rest yourself. -->

**Build the level together. Survive what you built.**

Four people share one small obstacle course laid out on a wooden table. Each
round, each of them adds one piece to it (a platform, a spring, a spike, a
fan, a moving plank, a launcher) or takes one piece away with a bomb, and then
they all run it at once, trying to reach the flag. Nothing is cleared between
rounds. By the end of a game the course is a record of everyone who played on
it: the spring someone placed to help, the spike placed to stop them, the bomb
that undid both. When a game ends the group can choose to keep building on the
same level, so a course can outlive the game that started it.

## What good means here

The idea came from playing *Ultimate Chicken Horse* online with my roommates.
In that game everyone adds a piece to a shared level, and every piece can help
or sabotage everyone else. What stayed with me was the moment before a run,
when we were all watching to see whether our pieces would fit together.

A good shared level gives each person responsibility for something small while
making everyone dependent on the whole. Each player adds one piece a round, and
no piece decides anything alone: whether you reach the flag depends on what
three other people just did. The game permits help and sabotage without
deciding which is correct, and scores a round where everyone made it as "too
simple", so an easy level is not the same as a good one.

Co-presence should be part of the mechanism, not an extra social feature.
Other people are visible through what the level is doing: a piece landing as
someone places it, the faint outline of what someone else is still
considering, small crosses where people fell in the last run, the name of
whoever placed a piece when you point at it. That is the shape of multi-user, real-time and persistent I
wanted: not a game with a chat window beside it, but one object everyone
changes, which keeps every change.

That only works if the level answers quickly and is worth looking at. A change
one person makes reaches everyone else within about a second, your own
character moves the instant you press a key, and the motion has to be smooth,
because motion is how players read cause and effect.

Things that shaped this:

- *Ultimate Chicken Horse* (Clever Endeavour Games, 2016), played online with
  friends: the shared level, one piece each, help and sabotage from the same
  parts.
- Riot Games' engineering blog, on how their online games handle the network:
  in a real-time game what matters most is how quickly every player sees what
  is happening, and how well the game hides network trouble from them. That is
  why each browser runs its own character and only the shared level goes
  through the server.

<!-- TODO(human): name the Riot article(s) you read, with links, and add any
     other reading on what "good" means at this scale. Only what you have
     actually read, and what you took from it. -->

## What I chose not to build

No chat, accounts, avatars or profiles: in a room you are only the character
you chose (Chicken, Big Dog, Pot Horse or Dabai) for as long as you stay. No
all-time leaderboards or matchmaking: scores live inside one game and nothing
carries into the next. Rooms exist only to seat four people at a time, with no
names, passwords or owners; four keeps every piece readable and attributable.
Anyone else in a room watches and takes a seat when one frees up.

No check that a path to the flag still exists. Players may make the level
harder or impossible; the Demolition Bomb is how they get out of a dead end,
and it is an ordinary build action, not an admin tool. No collisions between
players, and no general physics engine: platformer physics only, so a jump
does the same thing every time.

Playing at the same time raises the question of who the round waits for.
[`docs/decisions/0001-nobody-holds-the-round.md`](docs/decisions/0001-nobody-holds-the-round.md)
weighs that: someone who leaves or goes idle never holds up the people who are
still there.
[`docs/decisions/0002-rooms-and-seats.md`](docs/decisions/0002-rooms-and-seats.md)
covers rooms, why a character is a seat, and why a dropped connection keeps
its seat for two minutes.

## What's enforced, what's judged

`spec/` checks that a placement is refused only when it is technically invalid
(outside the level, over the start or the flag, on top of another piece), that
each player gets one build action a round, that rounds move on when players are
done rather than on a timer, the scoring with "too simple" and the 4-point end,
that each base course can be finished before anyone builds on it, that a placed
piece reaches every other open page within a second and is still there on the
next request, that rooms stay apart, and that a dropped player gets their seat
back. Whether a piece feels like a real choice, whether failing a run changes
what people build next, and whether the movement feels fair are not things a
test can check; that is for the people playing to judge.
