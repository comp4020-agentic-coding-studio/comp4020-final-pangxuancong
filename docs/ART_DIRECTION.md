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

Warm cream / off-white background; wood or muted neutral base geometry;
placed items in distinct muted colours with strong silhouettes:

| Item | Colour |
|---|---|
| Platform | warm wood |
| Spring | mustard / brass |
| Spike | muted dark red |
| Fan | soft blue |
| Moving Platform | muted green |
| Bomb | charcoal body, small warm accent |

Existing tokens live in `public/styles.css` (paper, ink, wood, brass, red,
green, blue). No gradients, glows or neon.

## Players

Small, simple wooden or paper-like figures, told apart by a colour accent. No
large avatars or profile cards. Readable when several share a spot; overlap is
fine since players pass through each other.

## Composition

The level takes most of the viewport. The Parts Tray is secondary: a small box
of physical pieces that look draggable, with a small hover lift. No large app
cards, sidebars of stats or player lists.

## Build preview

The piece lifts slightly; a valid spot gets a subtle positive outline; an
invalid one restrained warning feedback; protected START/GOAL areas appear
only while relevant. No permanent editor grid.

## Death and goal

Death: a small dust puff, quick squash or fade, optionally a tiny trace mark.
Readable, light, no gore. The flag is obvious without dominating; reaching it
is satisfying but restrained.
