import type { Book } from "../../types/models";
import { nextInSeries } from "../nextInSeries";

const b = (id: string, extra: Partial<Book>) => ({ id, title: id, ...extra } as Book);

const rr1 = b("rr1", { seriesName: "Red Rising", seriesNumber: 1 });
const rr2 = b("rr2", { seriesName: "red rising", seriesNumber: 2 });
const rr3 = b("rr3", { seriesName: "Red Rising", seriesNumber: 3 });
const other = b("x", { seriesName: "Dune", seriesNumber: 2 });

describe("nextInSeries", () => {
  it("picks the next number that has audio", () => {
    expect(nextInSeries(rr1, [rr1, rr2, rr3, other], () => true)?.id).toBe("rr2");
    expect(nextInSeries(rr1, [rr1, rr2, rr3], (id) => id !== "rr2")?.id).toBe("rr3");
  });

  it("stops at the last book, and never jumps to another saga", () => {
    expect(nextInSeries(rr3, [rr1, rr2, rr3, other], () => true)).toBeNull();
  });

  it("matches series names ignoring case and accents", () => {
    const a = b("a", { seriesName: "Canción de hielo y fuego", seriesNumber: 1 });
    const c = b("c", { seriesName: "cancion de HIELO y fuego", seriesNumber: 2 });
    expect(nextInSeries(a, [a, c], () => true)?.id).toBe("c");
  });

  it("prefers reading order (sagaOrder) over publication number", () => {
    const prequel = b("p", { seriesId: "s", seriesNumber: 5, sagaOrder: 1 });
    const first = b("f", { seriesId: "s", seriesNumber: 1, sagaOrder: 2 });
    expect(nextInSeries(prequel, [prequel, first], () => true)?.id).toBe("f");
  });

  it("does nothing for a book without an order", () => {
    const loose = b("l", { seriesName: "Red Rising" });
    expect(nextInSeries(loose, [loose, rr1, rr2], () => true)).toBeNull();
  });

  it("uses seriesId when both books have one", () => {
    const a = b("a", { seriesId: "s1", seriesName: "Same", seriesNumber: 1 });
    const c = b("c", { seriesId: "s2", seriesName: "Same", seriesNumber: 2 });
    expect(nextInSeries(a, [a, c], () => true)).toBeNull();
  });
});
