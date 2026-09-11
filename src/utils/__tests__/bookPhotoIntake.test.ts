/**
 * bookPhotoIntake — ISBN-from-photo path.
 *
 * Pins:
 *  1. Two-step, language-locked resolution: learn the scanned edition's
 *     language first, then re-resolve STRICTLY in that language and use that.
 *  2. No fabricated metadata in fallback drafts (no "English", no placeholder
 *     synopsis) — empty means unknown.
 */
jest.mock("expo-camera", () => ({
  Camera: { scanFromURLAsync: jest.fn() },
}));

jest.mock("../bookMetadata", () => {
  const actual = jest.requireActual("../bookMetadata");
  return { ...actual, resolveBookMetadata: jest.fn() };
});

import { Camera } from "expo-camera";
import * as meta from "../bookMetadata";
import { analyzeBookPhoto } from "../bookPhotoIntake";

const scan = Camera.scanFromURLAsync as jest.Mock;
const resolve = meta.resolveBookMetadata as jest.Mock;

const ISBN = "9788408281153"; // Alas de sangre (ES)

beforeEach(() => {
  jest.clearAllMocks();
});

describe("analyzeBookPhoto — barcode path", () => {
  it("re-resolves strictly in the scanned edition's language and uses that result", async () => {
    scan.mockResolvedValue([{ data: ISBN }]);
    resolve
      // 1st call: discovery (no language) — mixed-language composition is possible here
      .mockResolvedValueOnce({ title: "Fourth Wing", language: "Spanish", synopsis: "English text leaked..." })
      // 2nd call: strict in Spanish
      .mockResolvedValueOnce({ title: "Alas de sangre", language: "Spanish", synopsis: "Violet Sorrengail tiene veinte años..." });

    const result = await analyzeBookPhoto({ uri: "file://photo.jpg" });

    expect(resolve).toHaveBeenCalledTimes(2);
    expect(resolve).toHaveBeenNthCalledWith(1, { isbn: ISBN });
    expect(resolve).toHaveBeenNthCalledWith(2, { isbn: ISBN, language: "Spanish" });
    expect(result.matched).toBe(true);
    expect(result.draft.title).toBe("Alas de sangre");
    expect(result.draft.language).toBe("Spanish");
    expect(result.draft.synopsis).toBe("Violet Sorrengail tiene veinte años...");
  });

  it("keeps the discovery result when no edition language could be learned", async () => {
    scan.mockResolvedValue([{ data: ISBN }]);
    resolve.mockResolvedValueOnce({ title: "Some Book", language: undefined });

    const result = await analyzeBookPhoto({ uri: "file://photo.jpg" });

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(result.draft.title).toBe("Some Book");
    expect(result.draft.language).toBeUndefined(); // never fabricated
    expect(result.draft.synopsis).toBeUndefined(); // no placeholder
  });

  it("uses the strict result even when it is empty (never falls back to mixed data)", async () => {
    scan.mockResolvedValue([{ data: ISBN }]);
    resolve
      .mockResolvedValueOnce({ title: "Fourth Wing", language: "Spanish", synopsis: "English leak" })
      .mockResolvedValueOnce(undefined);

    const result = await analyzeBookPhoto({ uri: "file://photo.jpg" });

    expect(result.matched).toBe(false);
    expect(result.draft.isbn).toBe(ISBN);
    expect(result.draft.language).toBeUndefined();
    expect(result.draft.synopsis).toBeUndefined();
  });
});

describe("analyzeBookPhoto — no ISBN in photo", () => {
  it("manual-review draft carries no fabricated language", async () => {
    scan.mockResolvedValue([]);

    const result = await analyzeBookPhoto({ uri: "file://photo.jpg" });

    expect(result.strategy).toBe("manual-review");
    expect(result.draft.language).toBeUndefined();
    expect(resolve).not.toHaveBeenCalled();
  });
});
