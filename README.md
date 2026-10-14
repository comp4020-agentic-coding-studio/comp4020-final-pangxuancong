# Chain Reaction

**Build the level together. Survive what you built.**

Four people share one small obstacle course on a wooden table. Each round,
each of them adds one piece to it (a platform, a spring, a spike, a fan, a
moving plank or a launcher) or removes one with a bomb. Then they all run it
at the same time and try to reach the flag. Nothing is cleared between rounds.
By the end of a game the course is a record of everyone who played on it: the
spring someone placed to help, the spike someone placed to stop them, and the
bomb that removed one of them. When a game ends, the group can keep building
on the same level, so a course can outlive the game that started it.

## What good means here

The idea came from playing *Ultimate Chicken Horse* online with my roommates.
In that game everyone adds a piece to a shared level, and every piece can help
or sabotage everyone else. What stayed with me was the moment before a run,
when we were all watching to see whether our pieces would fit together.

A good shared level gives each person responsibility for something small while
making everyone dependent on the whole. Each player adds one piece a round,
and no piece decides anything on its own: whether you reach the flag depends
on what the other three just did. The game allows both help and sabotage and
does not decide which one is right. If everyone who ran reaches the flag, the
round is "too simple" and nobody scores, because an easy level is not the same
as a good one.

Co-presence should be part of the mechanism, not an extra social feature. You
see other people through what the level is doing: a piece landing as someone
places it, the outline of a piece someone is still deciding on, small crosses
where people fell in the last run, and the name of whoever placed a piece when
you point at it. That is the kind of multi-user, real-time and persistent I
wanted. It is not a game with a chat window beside it, but one object that
everyone changes and that keeps every change.

That only works if the level responds quickly and is worth looking at. A
change one person makes reaches everyone else within about a second, your own
character moves the moment you press a key, and the motion has to be smooth,
because motion is how players understand cause and effect.

Two things shaped this:

- *Ultimate Chicken Horse* (Clever Endeavour Games, 2016), played online with
  friends. It gave me the shared level, one piece each, and help and sabotage
  from the same parts.
- Riot Games' engineering blog, on how their online games deal with the
  network. In a real-time game, what matters most is how quickly every player
  sees what is happening, and how well the game hides network problems from
  them. That is why each browser runs its own character and only the shared
  level goes through the server.

## What I chose not to build

No chat, accounts, avatars or profiles. In a room you are only the character
you chose (Chicken, Big Dog, Pot Horse or Dabai), for as long as you stay. No
all-time leaderboards or matchmaking: scores belong to one game, and nothing
carries into the next. Rooms only exist to seat four people at a time. They
have no names, passwords or owners. Four keeps every piece easy to read and
easy to trace back to who placed it. Anyone else in a room watches and takes a
seat when one frees up.

No check that a path to the flag still exists. Players can make the level
harder or even impossible. The Demolition Bomb is how they get out of a dead
end, and it is a normal build action, not an admin tool. No collisions between
players, and no general physics engine. It uses platformer physics only, so a
jump does the same thing every time.

Playing at the same time raises the question of who the round waits for.
[`docs/decisions/0001-nobody-holds-the-round.md`](docs/decisions/0001-nobody-holds-the-round.md)
explains my answer: someone who leaves or goes idle never holds up the people
who are still playing.
[`docs/decisions/0002-rooms-and-seats.md`](docs/decisions/0002-rooms-and-seats.md)
covers rooms, why a character is a seat, and why a dropped connection keeps its
seat for two minutes.

## What's enforced, what's judged

`spec/` checks that:

- a placement is refused only when it is technically invalid (outside the
  level, over the start or the flag, or on top of another piece);
- each player gets one build action a round;
- rounds move on when players are done, not on a timer;
- scoring works, including "too simple" and the 4-point end;
- each base course can be finished before anyone builds on it;
- a placed piece reaches every other open page within a second and is still
  there on the next request;
- rooms stay apart, and a dropped player gets their seat back.

A test cannot tell whether a piece feels like a real choice, whether failing a
run changes what people build next, or whether the movement feels fair. That
is for the people playing to judge.
