# Motion and audio

Motion makes the level feel physical; sound reinforces interaction. Neither
may hurt multiplayer readability.

## Motion

- **Dragging:** lift → follow pointer → valid preview → commit → small settle.
  An invalid release returns smoothly, with no dramatic error animation.
- **Bomb:** the target gets a clear, restrained highlight. On demolition:
  brief anticipation → small pop → the piece breaks or fades → the level
  settles. No big explosion.
- **Player:** fast, responsive takeoff; a tiny compression or dust on landing;
  a subtle cue on wall contact; a quick directional kick on wall jump. Never
  so large it hides hazards.
- **Traces:** previous-round death marks fade quietly.
- Reduced motion: drop embellishment, keep state changes clear. It follows
  the system setting until the room header's "Motion" switch says otherwise
  (`src/client/motion.ts`). Never drop an animation that carries the
  outcome: the "Too simple" stamp still shows (no bounce), and the map wheel
  still turns (once, gently), because the turning is the draw.

  Lesson (2026-10-13): Windows with "Show animations" off reports
  reduce-motion to the browser; the wheel used to jump straight to the
  result there, so the human saw no draw at all. Test with
  `reducedMotion: "reduce"` as well as without.

## Sound

Starts only after a user gesture; always has a mute control; never clips or
gets loud when many events overlap. No background music required: the level,
movement and objects are the texture. If music is added later, keep it subtle.

| Event | Sound |
|---|---|
| Platform landing | small wooden tap |
| Spring | short, restrained boing |
| Spike death | soft impact, no gore |
| Fan | low airflow, only when near or relevant |
| Moving Platform | subtle mechanism, no constant motor |
| Bomb | mechanical click → muffled pop → light wooden clatter ("remove this piece", not combat) |
| Goal | short bell or chime, no score fanfare |
| Map wheel | a soft drop as each voter lands, a wooden click per peg, a two-note chime on the result |
| Jump, wall kick | a light hop; a scrape and kick |
| Countdown | a low beep per number, a higher one at the start |
| Placing a piece | a small settle |
| Launcher hit | a thump and a falling whistle |

(As built, all of the table: `sfx` in `src/client/sound.ts`, a burst of the
same sound inside 40 ms plays once.)

Sounds are synthesised with Web Audio (`src/client/sound.ts`): no audio
files. Nothing plays before a click or a key, and the room header has a
"Sound on/off" button, remembered per browser.

Any external audio asset needs a licence, recorded here.
