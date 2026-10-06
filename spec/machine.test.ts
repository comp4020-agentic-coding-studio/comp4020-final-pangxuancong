import { expect, inject, it } from "vitest";

// Promises from README.md that the build can't see, checked against the
// running app. Which claim each protects is in docs/PRODUCT_RULES.md.
const baseUrl = inject("baseUrl");
const api = (path: string, init?: RequestInit): Promise<Response> =>
  fetch(new URL(path, baseUrl), { headers: { "content-type": "application/json" }, ...init });

interface Machine {
  ramp: { angle: number };
  attempts: number;
  lastRun: { runId: string } | null;
}
const machine = async (): Promise<Machine> => (await api("/api/machine")).json() as Promise<Machine>;

// "The shared object should outlive the participants": a later, separate
// request sees what an earlier visitor set and ran.
it("keeps the ramp setting and the attempt for whoever comes next", async () => {
  const angle = 20 + Math.floor(Math.random() * 30);
  expect((await api("/api/mechanisms/ramp", { method: "PUT", body: JSON.stringify({ angle }) })).status).toBe(200);
  const before = (await machine()).attempts;

  const res = await api("/api/runs", { method: "POST" });
  expect(res.status).toBe(201);
  const plan = (await res.json()) as { runId: string; result: string; angle: number };
  expect(plan.angle).toBe(angle);
  expect(["success", "failure"]).toContain(plan.result);

  const after = await machine();
  expect(after.ramp.angle).toBe(angle);
  expect(after.attempts).toBe(before + 1);
  expect(after.lastRun?.runId).toBe(plan.runId);
});

// "Constrained enough not to become chaotic": parameters are bounded, and the
// server, not the slider, is what enforces it.
it("refuses a ramp angle outside its bounds", async () => {
  const before = (await machine()).ramp.angle;
  for (const angle of [0, 90, "steep", null]) {
    const res = await api("/api/mechanisms/ramp", { method: "PUT", body: JSON.stringify({ angle }) });
    expect(res.status).toBe(400);
  }
  expect((await machine()).ramp.angle).toBe(before);
});
