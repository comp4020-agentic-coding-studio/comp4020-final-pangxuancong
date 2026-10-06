# Art direction

> A tiny impossible machine on a designer's desk.

Keywords:

```text
warm
tactile
crafted
small
mechanical
quiet
legible
playful but not childish
```

Rejected:

```text
cyberpunk
dashboard
neon
casino
arcade explosion
glassmorphism
social feed
generic SaaS
realistic factory
```

Every major visual addition is checked against: **does this still look like a
tiny designed machine on a desk?** If not, simplify it.

## References

Conceptual references, never assets to copy: *Assemble with Care* (tactile
objects), *Monument Valley* (restraint, generous space), *The Incredible
Machine* (readable mechanical objects), Rube Goldberg machines (visible
causality).

## Palette

Tokens live in `public/styles.css`: warm paper background, charcoal ink, wood
and brass for the machine, muted red for a break, muted green for success,
soft blue for the ball. No gradients, glows or neon.

## Composition

The machine takes most of the viewport. Controls sit below it, small and
contextual. No sidebars, stat cards or player lists.

## Mechanisms

Objects stay recognisable: a ramp is a plank, dominoes are upright blocks, a
spring is a coil, a fan has blades, a gate has two posts. Stylise, never
abstract.

## Motion

- Parameter changes: short tactile responses (150–300 ms). Motion belongs to
  mechanisms, not to interface chrome.
- A run is a sequence: causality travels left to right and the eye follows it.
- Failure: the motion shows the break first (the ball falls short, bounces,
  rests). Words come only after it settles. Never a modal over the machine.
- Success: restrained. A small pulse or chime, "Chain complete".
- `prefers-reduced-motion`: jump to the final state.

## Sound (planned)

Material vocabulary: release click, rolling texture, wood taps, restrained
boing, soft air, mechanical clack, small bell. No background music. Starts
only after a user gesture; always has a mute control. Any external audio
asset needs a licence, recorded here.
