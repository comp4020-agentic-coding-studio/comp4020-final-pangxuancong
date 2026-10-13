# Art direction

> A tiny impossible obstacle course on a designer's desk.

A handcrafted tabletop toy world. Not a dashboard, not a neon multiplayer game.

Keywords: warm, crafted, tactile, toy-like, quiet, playful, legible,
editorial, small, physical.

Rejected: cyberpunk, neon, esports HUD, generic SaaS, glassmorphism, busy
inventory UI, casino reward visuals, gore.

Every major visual addition is checked against: **does this still look like a
tiny obstacle course on a desk?** If not, simplify it.

## References

Conceptual only, never assets to copy: *Assemble with Care* (tactile crafted
objects), *Monument Valley* (restraint, negative space), *Ultimate Chicken
Horse* (readable multiplayer obstacle placement), tabletop toys and wooden
construction sets (physical clarity).

## Palette

Warm cream / off-white background; base geometry as wooden shelves and
crates with grey metal brackets and bolts, the tall pieces as steel posts;
placed items in distinct muted colours with strong silhouettes:

| Item | Colour |
|---|---|
| Platform | warm wood |
| Spring | mustard / brass |
| Spike | muted dark red |
| Flag | red cloth, brass pole |
| Fan | soft blue |
| Moving Platform | muted green |
| Bomb | charcoal body, small warm accent |

Tokens live in `src/client/styles.css` and `src/client/draw.ts` (paper, ink, wood, brass, red,
green, blue). No gradients, glows or neon.

## Players

Four characters, one per seat, drawn as flat vector shapes with ink outlines
(`src/shared/characters.ts`, `drawCharacter` in `src/client/draw.ts`):
Chicken (white, red comb), Big Dog (tan, floppy ears), Pot Horse (a green
horse in a clay pot) and Dabai (white protective suit, blue stripes, blue
mask). Each has standing, running, jumping and falling poses and a name
label; the round panel uses a small matching head. A player keeps their
character between games. Spectators have none. No large avatars or profile cards. Readable when several share a spot;
overlap is fine since players pass through each other.

## Composition

Three columns on desktop, after the human's reference sheet: a narrow Parts
Tray on the left (pieces with names, the build actions under them), the
level in a wooden display box in the middle taking most of the width, and a
narrow round panel on the right (round, phase, the four players with status
and score, one line of guidance). Under the level, a four-step strip (build,
ready, run, round end) with the current step lit. Stacks into one column on
narrow screens.

The level is bigger than the box: the camera follows your runner during RUN
and is free to pan and zoom otherwise (`docs/ARCHITECTURE.md`). Zoomed fully
out, the whole level fits the box. Players outside the view appear as small
round badges on its edge, in their colour with their character's head and
an arrow toward them; a death off screen shows a red cross there for a
moment. Watching someone shows one quiet line at the top of the box.

## Build preview

The piece lifts slightly; a valid spot gets a subtle positive outline; an
invalid one restrained warning feedback; protected START/GOAL areas appear
only while relevant. No permanent editor grid.

## Death and goal

Movement particles: small paper-coloured dust kicked up while running, a
puff on take-off and a wider one on landing, sparks on a wall scrape or wall
kick and on a spring. Remote players get run and landing dust too. Particles
are decoration only and never carry information.

Round card: one wooden rail per player with a notch per point and a small
brass flag at 4; the bar grows from the total before the round to now and
the number counts up; reaching 4 turns the flag red and the row gold. When
everyone made it, a red rubber stamp "Too simple · no one wins" drops onto
the card (scale in, settle, lift away) while the card behind is dimmed.

Launcher: a riveted steel block with a black barrel ringed in brass and a
red centre; shots are small dark iron balls with a faint trail. Each shot
gives a puff and a small recoil; a hit throws the runner spinning out of
the level with a brief camera shake.

Final scores: rows reveal from last place to first, each bar growing and its
number counting up; the winner's row lights last, then the vote appears.

Death: a small dust puff, quick squash or fade, optionally a tiny trace mark.
Readable, light, no gore. The flag is obvious without dominating; reaching it
is satisfying but restrained.
