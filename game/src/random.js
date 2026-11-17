// Neon Void — a tiny seeded random number generator.
//
// Live play seeds this from the clock so every run differs. Screenshot scenes seed it
// with a fixed number instead, so the staged pictures are the same on every machine.
// The generator is mulberry32: fast, small and good enough for spawning and sparkle.

export function createRng(seed) {
  let state = seed >>> 0;
  if (state === 0) state = 0x9e3779b9;

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    /** Float in [0, 1). */
    next,
    /** Float in [min, max). */
    range(min, max) {
      return min + next() * (max - min);
    },
    /** Integer in [min, max], both ends included. */
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    /** True with the given probability. */
    chance(probability) {
      return next() < probability;
    },
    /** One element of the array. */
    pick(items) {
      return items[Math.floor(next() * items.length)];
    },
    /** A random point on the rim of a circle. */
    rimPoint(cx, cy, radius) {
      const angle = next() * Math.PI * 2;
      return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
    },
  };
}
