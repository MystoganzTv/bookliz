import { hashSeed, MIN_FILL_HEIGHT, scatterMotifs } from "../scatter";

describe("scatterMotifs", () => {
  it("draws nothing where there is no real empty space", () => {
    expect(scatterMotifs(1, 390, MIN_FILL_HEIGHT - 1, 6)).toEqual([]);
    expect(scatterMotifs(1, 390, 400, 0)).toEqual([]);
  });

  it("is stable for a screen and differs between screens", () => {
    const a = scatterMotifs(hashSeed("Library"), 390, 500, 7);
    expect(scatterMotifs(hashSeed("Library"), 390, 500, 7)).toEqual(a);
    expect(scatterMotifs(hashSeed("Add"), 390, 500, 7)).not.toEqual(a);
  });

  it("keeps objects inside the space, apart from each other, and scales with area", () => {
    for (const name of ["Home", "Library", "Add", "Files", "Profile", "Settings"]) {
      const small = scatterMotifs(hashSeed(name), 390, 120, 7);
      const big = scatterMotifs(hashSeed(name), 390, 640, 7);
      expect(big.length).toBeGreaterThan(small.length);
      expect(big.length).toBeLessThanOrEqual(16);
      for (const s of big) {
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.y).toBeGreaterThanOrEqual(0);
        expect(s.x + s.size).toBeLessThanOrEqual(390);
        expect(s.y + s.size).toBeLessThanOrEqual(640);
        expect(s.motif).toBeLessThan(7);
      }
      for (let i = 0; i < big.length; i++) for (let j = i + 1; j < big.length; j++) {
        const [p, q] = [big[i], big[j]];
        const d = Math.hypot(p.x + p.size / 2 - (q.x + q.size / 2), p.y + p.size / 2 - (q.y + q.size / 2));
        expect(d).toBeGreaterThanOrEqual((p.size + q.size) / 2);
      }
    }
  });
});
