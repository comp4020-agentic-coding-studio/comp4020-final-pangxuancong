// The machine's rules. Deterministic on purpose (docs/ARCHITECTURE.md): the
// same settings always give the same run, so the server can decide what
// happened once and every viewer can be shown the same thing.

// Fixed layout, in SVG user units. The layout is composed, not editable:
// visitors tune parameters, they never move parts.
export const LAYOUT = {
  width: 760,
  height: 440,
  // the ramp pivots about its lower end, where the ball leaves it
  pivot: { x: 360, y: 220 },
  rampLength: 200,
  floorY: 380,
  cup: { x: 613, halfWidth: 16 },
  ballRadius: 9,
} as const;

export const RAMP = { min: 5, max: 60, initial: 15 } as const;

// below this the ball never starts rolling
const STALL_ANGLE = 12;
// units/s²: chosen so a run takes two or three seconds, not for realism
const G = 600;

export type RunResult = "success" | "failure";
export type FailReason = "stalled" | "short" | "long";

export interface RunPlan {
  runId: string;
  angle: number;
  result: RunResult;
  failedAt: "ramp" | "goal" | null;
  reason: FailReason | null;
  // how far from the cup's centre the ball came down (negative = short)
  missBy: number | null;
  rollMs: number;
  flightMs: number;
  launchSpeed: number;
  landX: number;
  totalMs: number;
}

export function isValidAngle(angle: unknown): angle is number {
  return typeof angle === "number" && Number.isFinite(angle) && angle >= RAMP.min && angle <= RAMP.max;
}

export function simulate(angle: number, runId: string): RunPlan {
  const { pivot, rampLength, floorY, cup } = LAYOUT;
  const sin = Math.sin((angle * Math.PI) / 180);

  if (angle < STALL_ANGLE) {
    return {
      runId, angle, result: "failure", failedAt: "ramp", reason: "stalled", missBy: null,
      rollMs: 0, flightMs: 0, launchSpeed: 0, landX: pivot.x, totalMs: 900,
    };
  }

  // roll down a frictionless ramp, leave the lip horizontally, fall to the floor
  const rollS = Math.sqrt((2 * rampLength) / (G * sin));
  const launchSpeed = Math.sqrt(2 * G * rampLength * sin);
  const flightS = Math.sqrt((2 * (floorY - pivot.y)) / G);
  const landX = pivot.x + launchSpeed * flightS;
  const missBy = landX - cup.x;
  const inCup = Math.abs(missBy) <= cup.halfWidth;

  const rollMs = Math.round(rollS * 1000);
  const flightMs = Math.round(flightS * 1000);
  return {
    runId,
    angle,
    result: inCup ? "success" : "failure",
    failedAt: inCup ? null : "goal",
    reason: inCup ? null : missBy < 0 ? "short" : "long",
    missBy: Math.round(missBy),
    rollMs,
    flightMs,
    launchSpeed: Math.round(launchSpeed),
    landX: Math.round(landX),
    // allow time for the ball to settle after it lands
    totalMs: rollMs + flightMs + 700,
  };
}
