# 2. Rooms of four, seats are characters, a dropped seat is held

<!-- Draft, 2026-10-13. The decision and its parts are mine (rooms instead of
     one shared server, character choice as the seat, walking to a map sign,
     a weighted draw for a split vote); the numbers and wording are a starting
     point to rewrite. -->

- Status: accepted (2026-10-13)
- Applies to: `src/server/game.ts`, `src/shared/rounds.ts`, `src/client/main.ts`,
  `src/client/lobby.ts`
- Refines: [0001](0001-nobody-holds-the-round.md), which still decides that
  nobody holds a round

## Context

Until now the whole server was one game. Everyone who opened the site was in
it, and "at most four players" was a limit on the whole server: a fifth
visitor watched, and so did everyone after them. Sharing the URL meant
sharing the one game.

Two things were wrong with that.

- **Four for the whole server.** At a crit, or with two groups of friends,
  more than four people want to play. They should not have to queue for one
  level; they should get their own.
- **Dropping out was leaving.** Under 0001 a disconnect counted as leaving
  at once, and identity lived in the tab, so a wifi blip mid-build lost your
  turn, and closing the laptop lost your character and points for good.
  0001 protected the people who stayed; it did nothing for the person who
  dropped.

## Options considered

1. **Keep one game, raise the limit.** Simple, but more than four players
   make the level unreadable and every piece harder to attribute, which is
   what the four-player limit protects (P10).
2. **Rooms, joined only by a shared link.** Private and simple, but someone
   arriving alone sees nothing to join.
3. **Rooms with a lobby list and a share link (chosen).** The front page lists
   rooms with someone in them recently and can make a new one; every room is
   also a link, `/r/CODE`, for sending to friends.

For dropped connections:

1. **Leave at once (0001 as it was).** The round never waits; the dropped
   player loses everything.
2. **Recognise the person when they come back, nothing else.** Points come
   back, but the turn is already lost.
3. **Hold the seat (chosen).** A short grace in which the round waits, then a
   longer hold in which only the seat waits.

## Decision

- **Rooms.** Each room has its own level chain in SQLite (`level.room`), its
  own round clock, roster and seats. A socket names its room in the
  handshake and only hears that room. No room names, passwords or owners.
- **Seats are the four characters.** Choosing a free character takes a seat;
  nobody is seated automatically. A full room can still be entered to watch.
- **Choosing a map is walking.** Seated players walk their characters in a
  small lobby room and stand under the sign of the course they want. When
  everyone has chosen (held for 2 s), or 30 s after the first, voting closes.
  All under one sign: that course. Split: a draw weighted by the votes (three
  to one is 75% to 25%), animated, decided by the server.
- **A dropped seat is held.** For 8 s the round treats the player as still
  there. After that BUILD and RUN go on without them, as in 0001. For 2
  minutes the seat, character and points stay theirs; back in time, they
  carry on, and still build if BUILD is open. After that the seat is
  released.
- **Identity per room survives closing the tab** (localStorage, keyed by the
  room). A second tab open in the same room at the same time is still
  someone new.

## Consequences

Gains:

- Any number of groups can play at once, four players each, each on its own
  persistent level.
- A wifi blip costs nothing. A closed laptop costs at most the round in
  progress, not the seat or the points.
- Choosing a map is already playing: people try the controls in the lobby
  while they decide, and they can see who wants what.

Costs, and who pays them:

- **One more step before playing.** A room, then a character, then a map,
  where before the site dropped you straight into a game.
- **A held seat blocks a watcher.** For 2 minutes after someone drops, a
  person watching cannot take that character, even if the first player never
  comes back.
- **The round waits up to 8 s** for every dropped player, where before it
  moved on at once.
- **A runner who drops loses that run.** Their character was simulated in
  their own browser; the server cannot resume it.
- **Rooms are public.** Anyone can open any listed room; there is no lock.
  That is deliberate (no owners or settings), but a group cannot keep
  strangers out except by filling the seats.
- **A server restart forgets seats.** Levels come back; players have to
  choose their characters again.

## How it is checked

`spec/rounds.test.ts`: seats only by claiming a free character; four seats
and a watcher; the 8 s grace in BUILD and RUN; the 2 min hold and the seat
coming back; walking votes, the lock and the clock; the weighted draw (3:1
gives 750 of 1000 to the first map). `spec/realtime.test.ts`: two rooms apart,
four seats and a fifth watcher over real sockets, a dropped player's seat
held and returned, an unknown room refused. In the browser (2026-10-13, two
sessions on a local server): new room from the lobby; the second browser saw
it listed with the first player's seat, saw Pot Horse taken, chose the
Chicken; both walked under different signs; the draw played on both screens
and landed on the same map; BUILD started; B closed the tab and showed as
"reconnecting…", then reopened the room and was the Chicken again, still
able to build.

## Open questions for playtesting

- Is 2 s long enough to step off a sign by mistake and back, or too long to
  wait once everyone has chosen?
- Is 8 s of grace noticeable as a stall at the end of BUILD?
- Should the lobby list hide full rooms, or is "Watch" useful?
