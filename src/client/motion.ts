// Whether to play the full motion (docs/MOTION_AUDIO.md). It follows the
// system's "reduce motion" setting unless this browser has chosen; the room
// header has a switch. Reduced keeps state changes clear and drops
// embellishment; the map wheel still turns, gently, because the turning is
// the draw.
const KEY = "chain-reaction-motion";
const system = window.matchMedia("(prefers-reduced-motion: reduce)");
const chosen = (): string | null => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

export const reducedMotion = {
  get matches(): boolean {
    const c = chosen();
    return c === null ? system.matches : c === "reduced";
  },
};

const apply = (): void => {
  document.documentElement.classList.toggle("reduce-motion", reducedMotion.matches);
};
apply();
system.addEventListener("change", apply);

export function setReducedMotion(reduced: boolean): void {
  try {
    localStorage.setItem(KEY, reduced ? "reduced" : "full");
  } catch {}
  apply();
}
