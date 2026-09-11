/**
 * googleBooksProvider — volume normalisation (pure, no network).
 *
 * Pins the "no fabricated visible metadata" mandate:
 *  - an opaque Google seriesId never becomes a visible series name
 *  - a volume without `language` stays language-less (no "English" default)
 */
import { volumeToWork } from "../services/googleBooksProvider";

type Volume = Parameters<typeof volumeToWork>[0];

const volume = (info: Volume["volumeInfo"]): Volume => ({ id: "abc123", volumeInfo: info });

describe("volumeToWork", () => {
  it("never fabricates a series name from Google's opaque seriesId", () => {
    const { work } = volumeToWork(
      volume({
        title: "Alas de sangre",
        language: "es",
        seriesInfo: { volumeSeries: [{ seriesId: "kQ3fXwAAQBAJ", orderNumber: 1 }] },
      }),
      { title: "Alas de sangre" }
    );
    expect(work.seriesName).toBeUndefined();
    expect(work.seriesOrder).toBe(1); // structural order is still kept
  });

  it("leaves language undefined when the volume has none", () => {
    const { work, edition } = volumeToWork(volume({ title: "Untagged" }), { title: "Untagged" });
    expect(edition.language).toBeUndefined();
    expect(edition.languageCode).toBeUndefined();
    expect(work.canonicalLanguage).toBeUndefined();
    expect(work.canonicalLanguageCode).toBeUndefined();
  });

  it("maps a known language label", () => {
    const { edition } = volumeToWork(volume({ title: "Alas de sangre", language: "es" }), { title: "Alas de sangre" });
    expect(edition.language).toBe("Spanish");
    expect(edition.languageCode).toBe("es");
  });
});
