// Small synthesised sounds (docs/MOTION_AUDIO.md): no audio files. Nothing
// plays before the page has had a click or a key, and the mute choice is
// remembered per browser.
let ctx: AudioContext | null = null;
let muted = (() => {
  try {
    return localStorage.getItem("chain-reaction-muted") === "1";
  } catch {
    return false;
  }
})();
let heard = false; // a user gesture has happened
for (const e of ["pointerdown", "keydown"]) addEventListener(e, () => (heard = true), { once: true, capture: true });

const audio = (): AudioContext | null => {
  if (muted || !heard) return null;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
};

export const isMuted = (): boolean => muted;
export function setMuted(m: boolean): void {
  muted = m;
  try {
    localStorage.setItem("chain-reaction-muted", m ? "1" : "0");
  } catch {}
}

// a short wooden click: the wheel's pointer passing a peg
export function tick(pitch = 1): void {
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  const o = a.createOscillator(), g = a.createGain();
  o.type = "triangle";
  o.frequency.setValueAtTime(1300 * pitch, t);
  o.frequency.exponentialRampToValueAtTime(500 * pitch, t + 0.035);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.08, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + 0.06);
}

// a soft drop: a voter's head landing in a slice
export function plop(): void {
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  const o = a.createOscillator(), g = a.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(520, t);
  o.frequency.exponentialRampToValueAtTime(260, t + 0.12);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.09, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + 0.18);
}

// a small two-note chime: the result
export function chime(): void {
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  [784, 1175].forEach((f, i) => {
    const o = a.createOscillator(), g = a.createGain();
    o.type = "sine";
    o.frequency.value = f;
    const s = t + i * 0.11;
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(0.1, s + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, s + 0.7);
    o.connect(g).connect(a.destination);
    o.start(s);
    o.stop(s + 0.75);
  });
}

// ---------- the level (docs/MOTION_AUDIO.md, "Sound") ----------
// Each is short and quiet; a burst of the same sound inside 40 ms plays once,
// so several things at once never get loud.

const last = new Map<string, number>();
const once = (key: string): AudioContext | null => {
  const a = audio();
  if (!a) return null;
  const t = performance.now();
  if (t - (last.get(key) ?? 0) < 40) return null;
  last.set(key, t);
  return a;
};

// a pitched blip: frequency from → to over `len` seconds
function blip(a: AudioContext, type: OscillatorType, from: number, to: number, len: number, vol: number, at = 0): void {
  const t = a.currentTime + at;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(to, t + len);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + len + 0.02);
}

// a short burst of filtered noise: dust, puffs, pops
function noise(a: AudioContext, len: number, freq: number, vol: number, at = 0): void {
  const t = a.currentTime + at;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * len), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = buf;
  f.type = "bandpass";
  f.frequency.value = freq;
  f.Q.value = 0.9;
  g.gain.value = vol;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

export const sfx = {
  // a light hop
  jump(): void {
    const a = once("jump");
    if (a) blip(a, "triangle", 330, 620, 0.09, 0.05);
  },
  // a small wooden tap, louder after a longer fall
  land(fallSpeed: number): void {
    const a = once("land");
    if (!a) return;
    const v = Math.min(1, fallSpeed / 900);
    blip(a, "sine", 190, 90, 0.07, 0.04 + 0.06 * v);
    noise(a, 0.05, 900, 0.05 + 0.08 * v);
  },
  // a quick scrape and kick off a wall
  wallKick(): void {
    const a = once("wall");
    if (!a) return;
    noise(a, 0.06, 2200, 0.07);
    blip(a, "triangle", 420, 700, 0.07, 0.04);
  },
  // a short, restrained boing
  spring(): void {
    const a = once("spring");
    if (!a) return;
    const t = a.currentTime;
    const o = a.createOscillator(), g = a.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(520, t + 0.08);
    o.frequency.exponentialRampToValueAtTime(300, t + 0.22);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + 0.3);
  },
  // a soft impact, nothing gory
  die(): void {
    const a = once("die");
    if (!a) return;
    blip(a, "sine", 240, 70, 0.22, 0.09);
    noise(a, 0.12, 500, 0.08);
  },
  // shot out of the level: a thump and a falling whistle
  flung(): void {
    const a = once("flung");
    if (!a) return;
    noise(a, 0.08, 700, 0.1);
    blip(a, "triangle", 900, 180, 0.5, 0.05, 0.03);
  },
  // a short bell at the flag, no fanfare
  goal(): void {
    const a = once("goal");
    if (!a) return;
    blip(a, "sine", 1046, 1040, 0.9, 0.08);
    blip(a, "sine", 1568, 1560, 0.7, 0.04, 0.02);
  },
  // a piece settling into the level
  place(): void {
    const a = once("place");
    if (!a) return;
    blip(a, "triangle", 260, 150, 0.08, 0.06);
    noise(a, 0.05, 1200, 0.05, 0.01);
  },
  // the Bomb: click, muffled pop, a light clatter
  demolish(): void {
    const a = once("bomb");
    if (!a) return;
    blip(a, "square", 1800, 1700, 0.02, 0.02);
    noise(a, 0.18, 300, 0.14, 0.08);
    for (let i = 0; i < 3; i++) blip(a, "triangle", 700 - i * 120, 400 - i * 60, 0.05, 0.03, 0.2 + i * 0.06);
  },
  // the countdown's beeps, and the start
  count(final: boolean): void {
    const a = once("count");
    if (a) blip(a, "sine", final ? 880 : 520, final ? 880 : 520, final ? 0.3 : 0.12, 0.06);
  },
};
