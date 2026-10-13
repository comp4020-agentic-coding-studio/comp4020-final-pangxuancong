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
