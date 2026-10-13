# Progress

## Current milestone

Crit 09: all at once. Cutoff Wed 2026-10-14 12:00. Shipped and deployed
2026-10-13 (`eb0bb85`). Work after that (rooms, below) is committed locally
and not pushed, by the human's instruction.

## Product direction

Pivot decided 2026-10-06: from a shared deterministic Rube Goldberg machine to
a persistent multiplayer build-and-run platformer.

> Build the level together. Survive what you built.

Definition of good (harness wording, for the human to argue in the README): a
good shared level lets every player meaningfully change the possibilities
available to everyone else.

Design rules, detailed in `docs/`:

- players may cooperate or sabotage; the game does not choose;
- the level may become impossible; the Demolition Bomb lets players repair a
  deadlock by removing one player-placed object;
- one build action per active player per BUILD (place, Bomb or skip);
- BUILD ends when all active players placed or skipped; RUN ends when nobody
  is still RUNNING; no gameplay timers; disconnects never block;
- no player-player collision;
- AFK timeout in BUILD (required); a level lasts six rounds, at most one item
  per player per round (decided 2026-10-06);
- forgiving wall movement: wall slide, wall-jump grace window, wall climbing;
- the level persists across rounds, restarts and redeploys.

## Current state

Playable build-and-run platformer, pushed and deployed to Fly on 2026-10-13
(the crit 8 machine stays in Git history under tag `crit-8`).

- Rooms (local, not yet deployed; 2026-10-13): the lobby at `/` lists rooms,
  makes one, or opens a code; a room is `/r/CODE`, with its own level, game
  and four seats. Seats are the four characters, chosen on entry. Before a
  game seated players walk a lobby room and stand under a map sign to vote;
  a split vote spins a wheel (slices sized by votes, voters' heads on the
  rim, ticks and a chime; Sound on/off in the header). A dropped connection
  holds the round 8 s and keeps seat, character and points 2 minutes
  (`docs/decisions/0002-rooms-and-seats.md`).

- Layout after the human's reference sheet: Parts Tray (left), the level in a
  wooden display box (middle), round panel with players, status and scores
  (right), a four-step strip below with the current step lit. Crates with
  metal brackets, a steel tower, a red flag, jointed figures that stand, run,
  jump, fall and wall-slide.
- Three courses (The Gaps, The Tower, The Swing), chosen by vote before
  each game; The Tower and The Swing carry their own fan and swing. Each is
  a 48×27 world: the original table along the bottom, a second half that
  climbs to the flag. The camera follows your runner in RUN; in BUILD it
  pans (right drag, arrow keys) and zooms (wheel, out to the whole level).
  Runners off screen show as edge badges (red cross when they die there);
  once out of the run you watch the others (E for the next, click a badge).
- Four characters by seat: Chicken, Big Dog, Pot Horse, Dabai. Dust and
  spark particles for running, jumping, landing, wall kicks and springs.
- Up to four players; more watch and take free seats at the next BUILD.
- BUILD: Platform (R: post), Spring, Spike, Fan (R: four directions, 4-cell
  wind), Moving Platform (R: sideways or up-down track, 6 s cycle), the Bomb
  on any piece, or skip. AFK: auto-skip after 40 s idle, 120 s at most.
- RUN: wall slide, 250 ms wall-jump grace, climb by jumping into a wall;
  spikes and falls kill; the flag finishes. Idle 30 s drops out.
- Scores: +1 for the flag, +0.2 to a spike's or launcher's placer for each
  other player it kills. If everyone who ran made it (two or more), nobody
  scores that round ("Too simple" stamp); alone, the flag still scores. First to 4 points ends the game at that
  round's end. The round card animates each player's bar toward 4.
- Launcher (key 6): one shot a second in one of four directions; a hit
  knocks the runner out of the level.
- After six rounds: final scores and a vote. Archive (majority, tie or
  timeout) starts the next game on a copy of the level; restart returns to
  level choice. The final table reveals from last place up.
  Scores reset per game.
- Persistent: levels (games), items (demolished kept as history), score
  events. Ephemeral: players, positions, statuses, previews, traces, votes.

Not built yet: sound, most motion polish, activity logging.

## Still to do (human)

- Crit 8, before the cutoff: `README.md`, `PROCESS.md`,
  `reflections/crit-8.md`, deploy and ship, as planned.
- After the cutoff: rewrite `README.md` for the platformer (the current one
  argues for the fixed machine). `PROCESS.md` still points to
  `docs/PRODUCT_RULES.md`, which this pivot removed (it remains in Git
  history); how to describe the pivot there is yours to decide.

## Next milestones

1. ~~Platformer slice, round loop, multiplayer, Bomb (F01–F14, F17)~~ first
   playable version, 2026-10-06.
2. ~~Fan, Moving Platform, scores, archive/restart, four seats, new layout
   (F15, F16, F20–F23)~~ 2026-10-06.
3. ~~Three courses with level choice, four characters, particles, final
   score reveal, slower Moving Platform (F24–F27)~~ 2026-10-06.
   ~~Bigger world with a following camera (F28), Moving Platform fixed on
   high refresh rate screens~~ 2026-10-07.
   ~~Edge badges for off-screen runners, watching after you are out (F29)~~
   2026-10-07.
   ~~"Too simple" rule, first to 4 points with round bars, Launcher (F30–F32)~~
   2026-10-13.
4. Human playtest; tune movement, fan strength, the base course and whether
   +0.2 per kill crowds out helping.
5. Motion and sound (F18), reconnect robustness.
6. Server-side activity logging (F19).
7. Before deploying: run the Docker build (CI or locally).

## Known constraints

- `fly.toml`, the `/data` volume and `spec/invariants.test.ts` are fixed;
- the Dockerfile builds the client with Vite in a first stage (unverified);
- Phaser Arcade Physics only;
- keep README / CLAUDE / spec aligned.

## Open questions

Decide through playtesting, not by default:

- item distribution and tray presentation; whether every item type is always
  selectable;
- the exact wall-jump grace duration;
- whether scoring kills (+0.2) makes sabotage dominate (docs/GAME_LOOP.md);
- whether an archived level fills up over several games, and if the Bomb is
  enough to clear it;
- whether previous-round death markers help or clutter.

## Blockers

None recorded.

## Last verified

2026-10-06, local: `pnpm check` (4 tests, typecheck) green against
`pnpm dev`; browser flow driven with Playwright (set 30°, run, ball lands in
the cup; a fresh browser context sees 30° and the attempt; slider responds to
arrow keys).

2026-10-06, Fly: deployed; `/`, `/readme/` answer and `spec/invariants.test.ts`
passes against the live URL; a ramp angle set on the live site survived a
machine restart (the /data volume).

2026-10-06, local: first playable platformer. `pnpm typecheck` and
`pnpm check` (19 tests: invariants, rounds, level, realtime) green against a
restarted `pnpm dev`; the same 19 green against `pnpm build` + production mode
on a throwaway DATA_DIR. Browser (Playwright, Chromium 1360×900): one player
ran the base course to the flag with a scripted route (three jumps, a
six-jump wall climb); two players: A's preview shown to B, A's platform
reached B in 214 ms, B demolished it, countdown, both fell, results, next
BUILD with two death traces; spring launches ~250 px; spike kills and leaves a
trace; standing on a placed plank; sliding at 110 px/s and climb-jumping on a
placed post; A sees B interpolated ~38 px behind while moving; six rounds
rolled over to a fresh level; level, round and items survived a server
restart; no console errors. Not checked: Docker build, Fly deploy, touch
input, screen readers, real people.

2026-10-06, local: scores, archive/restart vote, four seats, Fan, Moving
Platform, new layout. `pnpm typecheck` and `pnpm check` (25 tests) green
against a separate server (port 8092, throwaway DATA_DIR). Browser
(Playwright, 1440×900, two players, six full rounds on that server): spike
kill +0.2 and flag +1 shown as +1.2 in the round card; an up-fan catches a
falling player and lifts them; a moving platform carries a rider 100 px and
back; final table lists everyone including zero scores; a 1–1 vote archived
and the next game started at round 1 with the three items copied and scores
at zero; the base course still finishes with the scripted route; no console
errors. Found and fixed: overlay cards were rebuilt every 200 ms (compared
against browser-rewritten innerHTML), which detached the vote buttons.
Not checked: Docker build, deploy, touch, screen readers, real people.

2026-10-06, local: three courses, level choice, characters, particles, final
reveal, Moving Platform 6 s. `pnpm typecheck` and `pnpm check` (36 tests)
green against a separate server (port 8092, throwaway DATA_DIR). Browser
(Playwright, 1440×900): four players all picked level 2 and BUILD opened on
The Tower as Chicken, Big Dog, Pot Horse, Dabai; three players played six
rounds on The Swing: a player spike's kill credited +0.2, a course spike
credited nobody, the final table revealed bottom-up with the winner lit,
and a 2–1 vote for a new level returned to SELECT with no items; no console
errors. Screenshots looked right (layout, swing rope, reveal). Not checked:
whether each new course is fun or fair to finish by hand (the solver is
coarse), particle feel at speed, Docker build, deploy, touch, real people.

2026-10-07, local: Moving Platform speed and a bigger world. The platform
"shuttling too fast" was a frame-rate bug: its velocity was the position gap
divided by the frame time, but Arcade steps at a fixed rate, so it overshot
whenever frames ran faster than physics steps. Reproduced in Playwright by
slowing physics to 15 steps/s (the plank ranged 102–778 px instead of
320–440); after the fix the plank stays on 320–440 at 15, 60 and 120
steps/s and still carries a rider. World now 48×27 cells. `pnpm typecheck`
and `pnpm check` (37 tests, including all three courses passable) green
against a separate server (port 8092). Browser, two sessions, each level:
wheel zoom out to the whole level and back, arrow-key and right-drag pan,
a spike placed by clicking on a panned and zoomed view landed on the
intended cell and reached the other session; RUN camera follows within the
world bounds; a player dropped into the goal finished, one below the world
died; no console errors. Not checked: a real 120/144 Hz screen, a full hand
run of each new second half (the solver is coarse), touch (no pinch or
drag-to-pan yet), real people.

2026-10-07, local: edge badges and watching. `pnpm typecheck` and
`pnpm check` (37 tests) green against a separate server (port 8092).
Browser, three sessions on The Swing: while running, Big Dog saw badges for
the two players off to the left; Chicken fell and the camera moved to Big
Dog with the "Watching" line; E switched to Pot Horse and back; clicking
Pot Horse's edge badge switched to them; Pot Horse dying off screen showed
the red-cross badge, which faded; arrow keys switched to free look and
Big Dog's badge appeared at the right edge; no console errors. Not checked:
watching after finishing (same code path as after dying) or as a visitor,
touch (badges need a click), real people.

2026-10-13, local: "too simple", first to 4, round bars, Launcher.
`pnpm typecheck` and `pnpm check` (40 tests) green against a separate server
(port 8092). Browser, two sessions: both reached the flag, Chicken's +1 was
taken back and the stamp played over the round card; next round Chicken's
launcher shot Big Dog out of the level ("Shot out of the level by Chicken's
launcher"), Chicken finished: +1.2 with the bar growing from 0; on The
Tower, Chicken finishing four rounds while Big Dog fell ended the game after
round 4 ("Chicken reached 4 points in round 4"); no console errors. Not
checked: a shot fired at someone else's runner seen from a third client in
real network lag, a hit while riding a moving plank, real people.

2026-10-13, local: solo scoring and no "What is this?" link. "Too simple"
now needs two or more runners. `pnpm typecheck` and `pnpm check` (41 tests)
green against a separate server (port 8092). Browser, one session: four
solo rounds on The Gaps scored +1 each with no stamp, and the game ended
after round 4 ("Chicken reached 4 points in round 4"); the header has no
README link (`/readme/` itself is still served, as the course requires); no
console errors.

2026-10-13, Fly: the platformer deployed. Locally, the image's two stages
reproduced by hand (production install in a clean directory, built client,
server TypeScript) served `/`, `/api/level` and `/readme/`, and `pnpm check`
(41) passed against it. Pushed; CI built and checked the real image, then
deployed. Against https://comp4020-final-pangxuancong.fly.dev: `pnpm check`
(41, including invariants and the two-client realtime test) passed; two
browser sessions chose a level, and A's placed spring showed on B's level
and roster after 446 ms; no console errors. The test left a game in
progress on the live site (Level 1, round 2). Not checked: real phones, a
pod of four at once.
