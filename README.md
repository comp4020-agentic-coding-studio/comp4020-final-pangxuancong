# Chain Reaction

<!-- Draft: everything outside "What good means here" was rewritten on
     2026-10-13 to describe the platformer as it is. It states what the game
     does; the arguments for why are yours to put in your own words. -->

**Build the level together. Survive what you built.**

Chain Reaction is a small real-time multiplayer platformer for up to four
people. Everyone shares one obstacle course. In each round, every player adds
one piece to it (or removes one), and then everyone runs it at the same time,
trying to reach the flag. The level keeps every piece from round to round, so
it becomes whatever the group made of it.

The idea came from playing *Ultimate Chicken Horse* online with my roommates. In
that game everyone adds a piece to a shared level, and every piece can help or
sabotage everyone else. What stayed with me was the moment before a run, when
we were all watching to see whether our pieces would fit together.

## What good means here

A good shared machine gives each person responsibility for something small
while making everyone dependent on the whole.

Co-presence should be part of the mechanism, not an extra social feature.
Other people should be visible through what the machine is
doing: a ramp changing angle, a spring being tuned, a name beside the part
someone controls. Collaboration happens through the shared object.

That only works if the machine answers quickly and is worth looking at. A change
one person makes should reach everyone else within about a second, and the
visuals and animation have to be crafted and smooth, because motion is how
players read cause and effect.

## How a game works

1. **Choose a level.** Everyone picks one of three courses: The Gaps, The
   Tower or The Swing. Most picks wins.
2. **Build.** Each player gets one action: place a piece (Platform, Spring,
   Spike, Fan, Moving Platform or Launcher), use the Demolition Bomb on any
   piece already placed, or skip. Other players see what you are considering
   while you decide. Once placed, a piece belongs to the level.
3. **Run.** After a short countdown everyone runs at once. A run ends when
   every player has reached the flag, died, or left.
4. **Round end.** Points are shown, and the next build starts on the same
   level.

A game ends at the end of the round in which someone reaches 4 points, or after
six rounds. Then everyone votes: keep building on this level in the next game,
or choose a new one.

## Help or sabotage

The game permits cooperation and sabotage without deciding which is correct. A
piece can open a route for everyone or close one, and the same Spring can do
both.

Scoring rewards both sides:

- **+1** for reaching the flag;
- **+0.2** to the player whose Spike or Launcher kills someone else;
- **Too simple:** if everyone who ran (two or more) reached the flag, nobody
  scores that round.

The level may become impossible. There is no check that a path still exists.
The Demolition Bomb is how players get out of a dead end, and it is an
ordinary build action.

## The level outlives the round

Pieces stay from round to round. A game can be archived: the next game then
starts on a copy of the level with every piece still in place. Scores belong to
one game only, and nothing carries into the next.

During each build, small marks show where players died in the last run.

## Seeing each other

Shared changes reach every open session within about a second, without a
reload: placements, demolitions, the round's phase, who has built and who is
still running. During a run, other players move on your screen as they move on
theirs.

The level is larger than the screen. While you run, the camera follows you, and
players outside the view show as badges on the edge of the screen. After you
die or finish, the camera follows someone still running.

## What is enforced and what is judged

Checked automatically (`pnpm check`):

- placements are rejected only when technically invalid;
- one build action per player per round;
- rounds move on when players are done, with no gameplay timer;
- scoring, "too simple" and the 4-point end;
- each base course can be finished before anyone builds;
- a placed piece reaches another client within a second and persists.

Judged by playing and crit feedback: whether a piece feels like a real choice,
whether failure changes what people build next, and whether the movement feels
fair.

## What I chose not to build

- No chat, accounts, profiles, all-time leaderboards, rooms or matchmaking.
- No pathfinding and no "there must always be a path" rule.
- No collisions between players.
- No general physics engine. Platformer physics (Phaser Arcade) only.

## Where it is now

The game has three courses, six pieces plus the Demolition Bomb, four
characters (Chicken, Big Dog, Pot Horse and Dabai), scores, and the
archive-or-restart vote. It is deployed and playable by up to four people at
once. Any extra visitors watch and take a free seat at the next build.

## Sources

- *Ultimate Chicken Horse* (Clever Endeavour Games, 2016), played online with
  friends.

<!-- TODO(human): the brief asks for reading on what "good" means at this scale
     (the small web, games for a handful of friends, tools for one workshop).
     Add only what you have actually read, and what you took from it. -->
