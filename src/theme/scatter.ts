/**
 * Where an atmosphere's objects go in a patch of empty space. Pure and
 * seeded: the same screen at the same size always gets the same layout (no
 * reshuffle on every render), while different screens get different ones.
 */
export type Sprinkle = {
  x: number;
  y: number;
  size: number;
  rotate: number;
  /** Index into the atmosphere's motif list. */
  motif: number;
  /** 0..1 — the component maps it to an opacity band per light/dark. */
  weight: number;
  /** Painted in the secondary colour instead of the accent. */
  secondary: boolean;
};

/** Below this height there is no real empty space — just the end of a list. */
export const MIN_FILL_HEIGHT = 72;
/** One object per this many pt² of empty space… */
const AREA_PER_SPRINKLE = 10_500;
/** …up to this many, however empty the screen. */
const MAX_SPRINKLES = 16;
const EDGE = 10;
const GAP = 18;

/** djb2 → 32-bit, for turning a screen name into a seed. */
export function hashSeed(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  return hash >>> 0;
}

/** mulberry32 — tiny, good enough for placing icons. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function scatterMotifs(seed: number, width: number, height: number, motifCount: number): Sprinkle[] {
  if (motifCount <= 0 || width < 120 || height < MIN_FILL_HEIGHT) return [];
  const next = random(seed);
  const target = Math.min(MAX_SPRINKLES, Math.max(1, Math.round((width * height) / AREA_PER_SPRINKLE)));
  const placed: Sprinkle[] = [];
  let lastMotif = -1;
  for (let attempt = 0; attempt < target * 30 && placed.length < target; attempt++) {
    const size = Math.round(20 + next() * 22);
    if (size + EDGE * 2 > Math.min(width, height)) continue;
    const x = EDGE + next() * (width - size - EDGE * 2);
    const y = EDGE + next() * (height - size - EDGE * 2);
    const clear = placed.every((p) => {
      const dx = p.x + p.size / 2 - (x + size / 2);
      const dy = p.y + p.size / 2 - (y + size / 2);
      return Math.hypot(dx, dy) >= (p.size + size) / 2 + GAP;
    });
    if (!clear) continue;
    // Walk the motif list from a random start so neighbours rarely repeat.
    let motif = Math.floor(next() * motifCount);
    if (motif === lastMotif && motifCount > 1) motif = (motif + 1) % motifCount;
    lastMotif = motif;
    placed.push({
      x: Math.round(x),
      y: Math.round(y),
      size,
      rotate: Math.round(next() * 50 - 25),
      motif,
      weight: next(),
      secondary: next() < 0.3,
    });
  }
  return placed;
}
