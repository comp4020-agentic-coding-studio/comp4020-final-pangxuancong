// The browser draws the machine and animates whatever run plan the server
// sends. It never decides an outcome itself (docs/ARCHITECTURE.md).

const $ = (id) => document.getElementById(id);
const svg = { plank: $("plank"), lip: $("lip"), pivot: $("pivot"), post: $("post"), ball: $("ball"), cup: $("cup"), ramp: $("ramp") };
const angleInput = $("angle");
const angleOut = $("angle-out");
const runButton = $("run");
const statusEl = $("status");
const traceEl = $("trace");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const LIP = 28;

let layout;
let machine;
let running = false;

const rad = (deg) => (deg * Math.PI) / 180;

function rampGeometry(angle) {
  const { pivot, rampLength, ballRadius } = layout;
  const c = Math.cos(rad(angle));
  const s = Math.sin(rad(angle));
  const top = { x: pivot.x - rampLength * c, y: pivot.y - rampLength * s };
  // where the ball's centre sits at distance d down the plank
  const ballAt = (d) => ({ x: top.x + d * c + ballRadius * s, y: top.y + d * s - ballRadius * c });
  return { top, ballAt };
}

function drawMachine(angle) {
  const { pivot, floorY, cup } = layout;
  const { top, ballAt } = rampGeometry(angle);
  setLine(svg.plank, top, pivot);
  setLine(svg.lip, pivot, { x: pivot.x + LIP, y: pivot.y });
  setLine(svg.post, { x: pivot.x, y: pivot.y }, { x: pivot.x, y: floorY });
  svg.pivot.setAttribute("cx", pivot.x);
  svg.pivot.setAttribute("cy", pivot.y);
  if (!svg.cup.firstChild) {
    const w = cup.halfWidth + 6;
    svg.cup.innerHTML = `<path class="cup-body" d="M ${cup.x - w} ${floorY - 30} L ${cup.x - w + 4} ${floorY} L ${cup.x + w - 4} ${floorY} L ${cup.x + w} ${floorY - 30}" />`;
  }
  if (!running) placeBall(ballAt(0));
}

function setLine(el, a, b) {
  el.setAttribute("x1", a.x);
  el.setAttribute("y1", a.y);
  el.setAttribute("x2", b.x);
  el.setAttribute("y2", b.y);
}

function placeBall(p) {
  svg.ball.setAttribute("cx", p.x);
  svg.ball.setAttribute("cy", p.y);
}

const ago = (iso) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
};

function describe(run) {
  if (run.result === "success") return "Chain complete. The ball landed in the cup.";
  if (run.reason === "stalled") return "The ball never got rolling — the ramp is too shallow.";
  // distances are in drawing units, which mean nothing to a visitor
  const near = Math.abs(run.missBy) < 30;
  if (run.reason === "short") return `The ball landed ${near ? "just" : "well"} short of the cup. A steeper ramp throws it further.`;
  return `The ball flew ${near ? "just" : "well"} past the cup. A gentler ramp would land it sooner.`;
}

// what earlier visitors left behind
function renderTrace() {
  const parts = [`Ramp last set to ${machine.ramp.angle}° ${ago(machine.ramp.updatedAt)}.`];
  if (machine.lastRun) {
    const outcome = machine.lastRun.result === "success" ? "reached the cup" : "broke";
    parts.push(`Attempt ${machine.attempts} ${outcome} ${ago(machine.lastRun.at)}.`);
  } else {
    parts.push("Nobody has run this machine yet.");
  }
  traceEl.textContent = parts.join(" ");
}

function setControlsEnabled(on) {
  angleInput.disabled = !on;
  runButton.disabled = !on;
}

function clearMarks() {
  svg.ramp.classList.remove("broke");
  svg.cup.classList.remove("broke", "hit");
}

async function load() {
  const res = await fetch("/api/machine");
  const data = await res.json();
  layout = data.layout;
  machine = data;
  angleInput.min = data.bounds.ramp.min;
  angleInput.max = data.bounds.ramp.max;
  angleInput.value = data.ramp.angle;
  angleOut.textContent = `${data.ramp.angle}°`;
  drawMachine(data.ramp.angle);
  renderTrace();
  statusEl.textContent = machine.lastRun ? describe(machine.lastRun) : "Set the ramp, then run the machine.";
  setControlsEnabled(true);
}

let saveTimer;
angleInput.addEventListener("input", () => {
  const angle = Number(angleInput.value);
  angleOut.textContent = `${angle}°`;
  clearMarks();
  drawMachine(angle);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save(angle), 200);
});

async function save(angle) {
  const res = await fetch("/api/mechanisms/ramp", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ angle }),
  });
  if (res.ok) {
    machine = { ...machine, ...(await res.json()) };
    renderTrace();
  } else {
    statusEl.textContent = "The ramp setting wasn't saved. Try again in a moment.";
  }
}

runButton.addEventListener("click", async () => {
  clearTimeout(saveTimer);
  await save(Number(angleInput.value));
  setControlsEnabled(false);
  clearMarks();
  statusEl.textContent = "";
  const res = await fetch("/api/runs", { method: "POST" });
  if (!res.ok) {
    statusEl.textContent = "The machine is busy. Try again in a moment.";
    setControlsEnabled(true);
    return;
  }
  const plan = await res.json();
  running = true;
  await animate(plan);
  running = false;
  if (plan.result === "success") svg.cup.classList.add("hit");
  else if (plan.failedAt === "ramp") svg.ramp.classList.add("broke");
  else svg.cup.classList.add("broke");
  statusEl.textContent = describe(plan);
  const fresh = await (await fetch("/api/machine")).json();
  machine = fresh;
  renderTrace();
  setControlsEnabled(true);
});

// Motion first, words after (docs/PRODUCT_RULES.md, G5).
function animate(plan) {
  const { pivot, floorY, ballRadius, cup, rampLength } = layout;
  const { ballAt } = rampGeometry(plan.angle);
  const restY = floorY - ballRadius;
  const settleMs = plan.totalMs - plan.rollMs - plan.flightMs;

  const at = (t) => {
    if (plan.reason === "stalled") {
      // a reluctant wobble at the top
      return ballAt(Math.sin((t / plan.totalMs) * Math.PI * 3) * 3);
    }
    if (t < plan.rollMs) {
      const k = t / plan.rollMs;
      return ballAt(rampLength * k * k);
    }
    t -= plan.rollMs;
    const launchY = pivot.y - ballRadius;
    if (t < plan.flightMs) {
      const k = t / plan.flightMs;
      return { x: pivot.x + (plan.landX - pivot.x) * k, y: launchY + (restY - launchY) * k * k };
    }
    t -= plan.flightMs;
    const k = Math.min(1, t / settleMs);
    if (plan.result === "success") {
      // drop into the cup and come to rest at its centre
      return { x: plan.landX + (cup.x - plan.landX) * k, y: restY };
    }
    // a small bounce, then roll on a little and stop
    const bounce = Math.abs(Math.sin(k * Math.PI)) * 14 * (1 - k);
    const drift = 26 * (1 - (1 - k) * (1 - k));
    return { x: plan.landX + drift, y: restY - bounce };
  };

  if (reducedMotion.matches) {
    placeBall(at(plan.totalMs));
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const start = performance.now();
    const frame = (now) => {
      const t = now - start;
      placeBall(at(Math.min(t, plan.totalMs)));
      if (t < plan.totalMs) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });
}

load().catch(() => {
  statusEl.textContent = "The machine couldn't be reached. Reload to try again.";
});
