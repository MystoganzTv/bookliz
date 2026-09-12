/**
 * What the search box does with what the reader types.
 *
 * This suite exists because the classifier was wrong in a way no test caught:
 * it decided by the *shape* of the words, so "Fourth Wing" and "Rebecca
 * Yarros" were indistinguishable and both ran as author searches. Searching a
 * best-seller by its title returned an unrelated writer's books.
 *
 * The tables below are the contract. The titles group is the regression: every
 * entry in it was classified "author" before the fix.
 */
import { detectQueryIntent } from "../bookMetadataAggregator";

describe("detectQueryIntent", () => {
  describe("titles go to the general search", () => {
    const TITLES = [
      "Dune",                 // known series, and a single word besides
      "Fourth Wing",          // two capitalized words, no given name
      "Project Hail Mary",    // three; "Mary" is a name but not in first place
      "It",                   // one word, and a pronoun
      "Circe",
      "Eragon",
      "Normal People",
      "Klara and the Sun",
      "The Hobbit",           // article
      "1984",                 // digits
      "El nombre del viento", // article, and too long
      "Cien años de soledad",
      "Pride and Prejudice",
      "Shadow and Bone",      // "shadow" is a known non-name word
      "Babel",
      "Piranesi",
    ];
    it.each(TITLES)("%s", (q) => {
      expect(detectQueryIntent(q)).toBe("general");
    });
  });

  describe("author names go to the author search", () => {
    const AUTHORS = [
      "Rebecca Yarros",       // given name
      "Dan Brown",
      "Stephen King",
      "Brandon Sanderson",
      "dan brown",            // case must not matter
      "J.K. Rowling",         // initial
      "J. R. R. Tolkien",     // too long for the word rule; initials carry it
      "Sarah J Maas",         // bare initial in the middle
      "Gabriel García Márquez",
      "Ursula Le Guin",       // particle
      "Miguel de Cervantes",
      "Isabel Allende",
      "Agatha Christie",
      "Haruki Murakami",      // not a listed given name, but a known author
    ];
    it.each(AUTHORS)("%s", (q) => {
      expect(detectQueryIntent(q)).toBe("author");
    });
  });

  describe("the safe default", () => {
    it("falls to general when nothing indicates a person", () => {
      // Two name-shaped words, neither of them evidence. Guessing "author"
      // here is what broke title search; guessing "general" costs nothing,
      // because a free-text query still finds an author it got wrong.
      expect(detectQueryIntent("Kvothe Lackless")).toBe("general");
    });

    it("never guesses from a single word it does not recognize", () => {
      for (const q of ["Circe", "Pilar", "Kvothe", "Eragon"]) {
        expect(detectQueryIntent(q)).toBe("general");
      }
    });

    it("still answers a single word the catalog actually knows", () => {
      // Not a guess — the offline catalog lists these as author names, so the
      // author search is knowledge rather than inference. The one-word rule
      // only governs strings nothing recognizes.
      expect(detectQueryIntent("Sanderson")).toBe("author");
      expect(detectQueryIntent("Yarros")).toBe("author");
      expect(detectQueryIntent("Dune")).toBe("general"); // known series name
    });

    it("ignores leading and trailing whitespace", () => {
      expect(detectQueryIntent("  Dan Brown  ")).toBe("author");
    });

    it("handles an empty query without throwing", () => {
      expect(detectQueryIntent("   ")).toBe("general");
    });
  });
});
