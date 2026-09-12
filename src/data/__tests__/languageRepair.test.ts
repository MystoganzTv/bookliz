import { findContradictedLanguages } from "../languageRepair";

const book = (over: Partial<Parameters<typeof findContradictedLanguages>[0][number]> = {}) => ({
  id: "b1",
  title: "A book",
  isbn: "9788408123456", // 978-84 = Spain
  language: "Spanish",
  ...over,
});

describe("findContradictedLanguages", () => {
  it("flags a Spanish-group ISBN stored as English — the books the old default wrote", () => {
    const [suspect] = findContradictedLanguages([book({ language: "English", title: "Alas de Hierro" })]);
    expect(suspect).toMatchObject({
      bookId: "b1",
      title: "Alas de Hierro",
      storedLanguage: "English",
      impliedLanguage: "Spanish",
    });
  });

  it("leaves a book alone when the group agrees with what is stored", () => {
    expect(findContradictedLanguages([book()])).toEqual([]);
    expect(findContradictedLanguages([book({ isbn: "9780756404741", language: "English" })])).toEqual([]);
  });

  it("compares languages by identity, not by spelling", () => {
    // "es" and "Spanish" are the same language; a naive string compare would
    // report every one of these as a contradiction.
    expect(findContradictedLanguages([book({ language: "es" })])).toEqual([]);
  });

  it("says nothing about books it has no evidence for", () => {
    expect(findContradictedLanguages([book({ isbn: undefined })])).toEqual([]);
    expect(findContradictedLanguages([book({ isbn: "0756404746" })])).toEqual([]); // ISBN-10
    expect(findContradictedLanguages([book({ language: "" })])).toEqual([]);
    expect(findContradictedLanguages([book({ language: "   " })])).toEqual([]);
  });

  it("ignores an unknown registration group rather than guessing", () => {
    // 978-9999 is not an assigned group; no implication, so no accusation.
    expect(findContradictedLanguages([book({ isbn: "9789999123456" })])).toEqual([]);
  });

  it("reads ISBNs with the separators a cover prints", () => {
    const found = findContradictedLanguages([book({ isbn: "978-84-08-12345-6", language: "English" })]);
    expect(found).toHaveLength(1);
  });
});
