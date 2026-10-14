# Crit 10 rehearsal

The crit: two people open the app from its URL alone, each in their own
Chrome profile (incognito counts), and use it side by side. You do not touch
the app. You narrate from the logs who did what. Rehearse until it is easy.

## Before

1. A terminal with the live log, made easier to read (the JSON is cut off):

   ```sh
   mise exec -- ~/.fly/bin/flyctl logs -a comp4020-final-pangxuancong \
     | sed -E 's/\x1b\[[0-9;]*m//g; s/ \{"ev".*//; s/^.*\[info\]//'
   ```

2. Give the two players only `https://comp4020-final-pangxuancong.fly.dev`.
   Nothing else: everything they need to get in has to be on the page.

## What they do (suggest, do not click for them)

1. One makes a room; the other joins from the lobby list or the copied link.
2. Each picks a character. Ask them to read out their `#tag` from the player
   list: that is how you match people to log lines.
3. Both walk to a map sign (or different signs, to see the wheel).
4. BUILD: one places a piece; the other bombs it. One tries to build twice.
5. RUN to the flag, or into a spike.
6. Optional: one closes the tab and reopens it (same tag, seat kept).

## What to point at in the log

| They did | Line | What it shows |
|---|---|---|
| opened the room | `Visitor#xxxx join` | a person, told apart before they have a name |
| picked a character | `Chicken#xxxx seat:claim (was=Visitor)` | same tag, now with a character |
| placed a piece | `build:place (type=spring, at=5,22)` | what and where |
| bombed it | `build:bomb (own=false)` with `target: spring by Chicken#xxxx` | who removed whose piece (ADR 0003 allows it) |
| tried a second build | `build:place REFUSED (reason=you have already built this round)` | the server, not the browser, decided |
| a watcher tried to build | `REFUSED (reason=no seat: you are watching)` | a visitor cannot change the level |
| died | `run:died (by=spike by Big Dog#xxxx ...)` | whose trap |
| scored | `score:kill (points=0.2)` | who got the point |
| left | `disconnect (seat=held)`, later `seat:released` | a dropped seat is kept for two minutes |
| the server moved on | `server phase:RUN`, `build:auto-skip` | what nobody asked for |

After the crit, the same events are still in SQLite:
`https://comp4020-final-pangxuancong.fly.dev/api/rooms/CODE/log`.

## If something goes wrong

Read the log first: the last lines before the problem usually say what the
server decided. That is the point of the week.
