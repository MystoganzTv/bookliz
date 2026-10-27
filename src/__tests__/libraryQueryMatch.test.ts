import { libraryQueryWords, rankLibraryRows } from "../utils/libraryQueryMatch";

const rows = [
  { id: "1", title: "Dune", author: "Frank Herbert", format: "paperback" },
  { id: "2", title: "Dune Messiah", author: "Frank Herbert", format: "audiobook" },
  { id: "3", title: "Harry Potter y la piedra filosofal", author: "J. K. Rowling", seriesName: "Harry Potter" },
  { id: "4", title: "La sombra del viento", author: "Carlos Ruiz Zafón", hasAudio: true },
];

describe("libraryQueryMatch", () => {
  it("drops one-letter crumbs and accents", () => {
    expect(libraryQueryWords("Zafón - 01 y la")).toEqual(["zafon", "01", "la"]);
  });

  it("any-word mode keeps every row that shares a word (the picker's behavior)", () => {
    const ids = rankLibraryRows(rows, "Dune Messiah Part", { minShare: 0 }).map((r) => r.id);
    expect(ids).toEqual(["2", "1"]);
  });

  it("empty query returns everything, audio-less audiobook copies first", () => {
    const ids = rankLibraryRows(rows, "").map((r) => r.id);
    expect(ids[0]).toBe("2");
    expect(ids[ids.length - 1]).toBe("4");
  });

  it("half-the-words mode ignores rows that only share a filler word", () => {
    // "la" alone must not pull in La sombra del viento for a Harry Potter file.
    const ids = rankLibraryRows(rows, "Harry Potter y la piedra filosofal 01", { minShare: 0.5 }).map((r) => r.id);
    expect(ids).toEqual(["3"]);
  });

  it("matches by author and series too", () => {
    expect(rankLibraryRows(rows, "Ruiz Zafon", { minShare: 0.5 }).map((r) => r.id)).toEqual(["4"]);
  });
});
