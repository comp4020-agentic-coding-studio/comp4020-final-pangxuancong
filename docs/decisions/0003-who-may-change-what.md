# 3. Who may change what: the Bomb removes anyone's piece, and the server decides

<!-- Reasons from the human's own answers (2026-10-14); the table, tags and
     tests are checked against the code. -->

- Status: accepted (the rule since the first playable build, 2026-10-06;
  written down and logged 2026-10-14)
- Applies to: `src/server/game.ts`, `src/shared/level.ts`, `src/shared/rounds.ts`,
  `src/server/identity.ts`, `src/server/log.ts`

## Context

Up to four people share one level. Each round each of them takes one build
action: place a piece, use the Demolition Bomb on a piece, or skip. Pieces
stay from round to round, so a level fills up with pieces that belong to
different people.

The question is what one person may do to another person's work. The
sharpest case is the Bomb: whose pieces may it remove?

`README.md` says a good shared level gives each person responsibility for
something small while making everyone dependent on the whole, and that the
game allows help and sabotage without deciding which is right. A rule about
the Bomb is a rule about that.

## Options considered

1. **The Bomb removes only your own pieces.** Nobody can undo your work. But
   then the Bomb is only an undo button, and if someone blocks the path, only
   they can open it again.
2. **A new piece is protected for one round.** You see your piece used at
   least once before anyone can remove it. But if someone places a piece that
   blocks the path, we lose two rounds: one where nobody can remove it, and
   one spent removing it.
3. **The Bomb removes anyone's piece (chosen).** Any seated player, with their
   build action unused this round, may remove any piece a player placed,
   whoever placed it. It can never remove the course itself: its blocks and
   fixed pieces, the start, the flag, or the edges of the world.

## Decision

Option 3. Chain Reaction is a party game played with friends, and letting
anyone remove anyone's piece makes it more flexible and gives friends more
ways to play with and against each other. If my piece gets bombed, that is
fine: my friend gave up placing something of their own to do it. The Bomb
costs the whole build action for the round.

What each person may see: everything, the same for everyone. Every player and
watcher sees the whole level, every piece and who placed it, the pieces others
are still deciding on, and everyone's runs. There is nothing hidden; the
README says why: you see other people through what the level is doing.

What the server checks, for every action (the browser's view is never
trusted):

| Who | May | May not |
|---|---|---|
| A visitor (no character) | watch everything; choose a free character | place, bomb, skip or vote |
| A seated player, waiting for the next build | watch; vote for a map | build until their seat starts |
| A seated player in BUILD, action unused | one of: place a piece where it is technically valid, bomb any player-placed piece, skip | a second action that round; bomb the course, the start, the flag or the world's edge |
| Anyone | report their own run (finished or died) while it is running | report anyone else's run, or report twice |

Every one of these, allowed or refused, is written to the activity log with
who asked and why it was refused (`src/server/log.ts`): one line on stdout
for `flyctl logs`, one row in `event_log` on the `/data` volume.

### How people are told apart

A browser keeps a random `playerId` per room. It is a secret: whoever
presents it is that player, and can take their seat. So it never leaves the
server. Everyone else, and every log line, sees a short public tag made from a
hash of it, written like a Riot ID: `Chicken#3fa9`. The character says what
they play; the tag tells apart two people who were the Chicken at different
times. The tag is shown in the room's player list, so people can find
themselves in a log being read out.

## Consequences

Gains:

- A blocked level can always be opened again by someone who is still here.
- Help and sabotage stay symmetrical: the same Bomb clears a trap or removes
  a ramp someone needed.
- The log shows exactly whose piece went and who removed it
  (`build:bomb target=spike by Chicken#b1ad … own=false`), so "who undid my
  work" has an answer.

Costs, and who pays them:

- **Your work can be removed the round after you place it.** The person who
  placed it pays. I think that is fine between friends, because whoever
  bombed it paid too: they did not get to add a piece that round.
- **Removing is as strong as adding.** One Bomb undoes one piece, so a player
  who only ever bombs can keep a level from growing. Whether that happens is
  for playtesting.
- **The tag is not a name.** `Chicken#3fa9` tells people apart in a log; it
  does not tell you who they are. That is deliberate (no accounts), but at the
  crit I have to match tags to people by asking them to read theirs out.

### What is not checked

A browser reports its own run: the server checks only that the player was
still running and reports once. It does not simulate the run, so a modified
browser could report reaching the flag without doing it. I don't think that
needs fixing: this is a party game between friends, not a competitive game
with strangers. The log still records each report, so a suspicious finish is
visible (`run:finished` with no time in between).

## How it is checked

`spec/rounds.test.ts`: one build action per round; a visitor and a seat
waiting for the next build cannot build; seats only by a free character.
`spec/level.test.ts`: the Bomb refuses the start, the flag, the course and its
fixed pieces. `spec/realtime.test.ts`: over real sockets, a second build is
refused, the Bomb refuses protected targets and removes another player's
piece, a watcher cannot place, and the refusals are in the room's log with
who and why; no `playerId` appears in any snapshot or in `/api/rooms/:code/level`
or `/log`.

## Open questions for playtesting

- Does anyone bomb more than they build, and does that stall a level?
- Would people rather see whose piece it was before they bomb it (the name
  already shows on hover), or after (in the log only)?
