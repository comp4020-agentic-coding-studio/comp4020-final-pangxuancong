// Movement constants and the wall-jump rule (docs/MOVEMENT.md). Forgiving on
// purpose: the challenge is the level players built, not the controls. Values
// are starting points for playtesting.

export const MOVEMENT = {
  moveSpeed: 260,
  groundAcceleration: 2400,
  airAcceleration: 1500,
  jumpVelocity: 560,
  gravity: 1400,
  maxFallSpeed: 820,
  wallSlideSpeed: 110,
  wallJumpHorizontalVelocity: 300,
  // jumping while still pressing into the wall: mostly up, so one wall can be
  // climbed without alternating inputs
  wallClimbHorizontalVelocity: 90,
  wallJumpVerticalVelocity: 540,
  wallJumpGraceMs: 250,
  springVelocity: 920,
  // fans: sideways wind shifts your running speed; up/down wind accelerates
  fanWindSpeed: 240,
  fanLift: 2300,
} as const;

export type Side = -1 | 1; // which side the wall is on: -1 left, 1 right

// A wall jump is allowed while touching a wall, or within the grace window
// after leaving one.
export const canWallJump = (now: number, touchingWall: boolean, lastWallTouchAt: number | null): boolean =>
  touchingWall || (lastWallTouchAt !== null && now - lastWallTouchAt <= MOVEMENT.wallJumpGraceMs);

// Away from the wall and up. Pressing into the wall gives the climbing kick.
export function wallJumpVelocity(wallSide: Side, pressingIntoWall: boolean): { vx: number; vy: number } {
  const kick = pressingIntoWall ? MOVEMENT.wallClimbHorizontalVelocity : MOVEMENT.wallJumpHorizontalVelocity;
  return { vx: -wallSide * kick, vy: -MOVEMENT.wallJumpVerticalVelocity };
}
