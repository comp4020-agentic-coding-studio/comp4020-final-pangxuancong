# Crit 9 reflection

## What was the breakthrough that moved the work forward?

The breakthrough came from reading Riot Games' engineering blog. Their
articles about how their online games deal with the network showed me that,
in a real-time game, the most important thing is not the features but how
quickly every player sees what is happening, and how well the game hides
network fluctuation from the player. A player does not care why a jump felt
late; they only feel that the game is unfair.

That changed how I looked at Chain Reaction. This crit asks for a change to
reach everyone within about a second, and for a level being built that is
enough. Running is different: your own character has to respond instantly,
whatever the network is doing. In my game each browser moves its own runner
straight away and draws the other players from smoothed snapshots, while the
server only owns the shared things: the level, the round and the scores.
Moving platforms and launchers are worked out from the run clock on every
device, so they stay in step without being sent over the network at all.

## What did this work change about who I want to be as a software developer?

It showed me how much I do not yet know about computer networks. I can
build a real-time app with Socket.IO, but most of the hard problems in
multiplayer games sit underneath it: latency, packet loss, jitter, how
client prediction and server authority fit together, and the trade-offs
between different network models. I want to be a developer who understands
those layers rather than treating the network as something that just works,
because in a real-time product the network is part of what the player
feels.
