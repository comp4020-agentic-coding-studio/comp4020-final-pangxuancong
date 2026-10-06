# Player movement

Expressive but forgiving. Difficulty should come from the evolving level,
player-made obstacles and route choice, not from precise inputs
(`docs/PRODUCT.md`, P6).

## MVP

Move left/right, jump, fall, land on solids, bounce on Springs, be pushed by
Fans, die on hazards, ride Moving Platforms, and wall-assisted movement.

Players pass through each other (no player-player collision): less network
and latency sensitivity, less accidental griefing, focus stays on the level.
Remote players stay visible.

## Constants

One config object, tuned by playtesting; no magic numbers scattered in code.

```ts
type MovementConfig = {
  moveSpeed: number;
  groundAcceleration: number;
  airAcceleration: number;
  jumpVelocity: number;
  gravity: number;
  wallSlideSpeed: number;
  wallJumpHorizontalVelocity: number;
  wallJumpVerticalVelocity: number;
  wallJumpGraceMs: number; // start at 250, tune within ~200–300
};
```

## Wall movement

- **Contact:** touching a valid wall records `lastWallTouchTime` and
  `lastWallSide`.
- **Slide:** airborne, touching a wall and pressing into it caps the fall:
  `velocityY = min(velocityY, wallSlideSpeed)`. Slowed, never a hard stop.
- **Jump:** allowed while touching a wall, or while
  `now - lastWallTouchTime <= wallJumpGraceMs`. It gives upward velocity plus
  horizontal velocity away from `lastWallSide` (right wall → up and left).
- **Climb:** repeated wall jumps gain height. This is a recovery route when
  player-made geometry blocks normal jumps. No stamina system, and no
  frame-perfect alternating inputs required.

Only after playtesting, if needed: ground coyote time, jump buffering,
variable jump height.

## Networking

The local client owns moment-to-moment feel; never wait for the server to move
the local player. During RUN it publishes about 10–15 snapshots per second:

```ts
{ playerId, x, y, vx, vy, facing, animation, timestamp }
```

Other clients interpolate remote characters and never collide with them.

## Death and finish

The local client detects hazard/bounds contact and the goal trigger, and
reports RUNNING → DEAD or RUNNING → FINISHED. The server records and
broadcasts it. No anti-cheat validation.
