import { EDITION_IDS, isEditionPreference, isHemisphere, resolveEdition, seasonalEdition } from "../editions";

const localDate = (month: number, day = 1) => new Date(2026, month - 1, day, 12);

describe("reading atmospheres", () => {
  it.each([
    [1, "winter", "summer"], [2, "winter", "summer"],
    [3, "spring", "autumn"], [4, "spring", "autumn"], [5, "spring", "autumn"],
    [6, "summer", "winter"], [7, "summer", "winter"], [8, "summer", "winter"],
    [9, "autumn", "spring"], [10, "halloween", "halloween"],
    [11, "autumn", "spring"], [12, "christmas", "christmas"],
  ])("chooses the local season or celebration in month %i", (month, north, south) => {
    const date = localDate(Number(month), 15);
    expect(seasonalEdition(date, "north")).toBe(north);
    expect(seasonalEdition(date, "south")).toBe(south);
  });

  it("gives single-day celebrations priority and restores the season afterwards", () => {
    for (const hemisphere of ["north", "south"] as const) {
      expect(seasonalEdition(localDate(2, 14), hemisphere)).toBe("valentines");
      expect(seasonalEdition(localDate(4, 30), hemisphere)).toBe("walpurgis");
      expect(seasonalEdition(localDate(5, 1), hemisphere)).toBe("workers");
    }
    expect(seasonalEdition(localDate(2, 13))).toBe("winter");
    expect(seasonalEdition(localDate(2, 15))).toBe("winter");
    expect(seasonalEdition(localDate(4, 29))).toBe("spring");
    expect(seasonalEdition(localDate(5, 2))).toBe("spring");
    expect(seasonalEdition(localDate(5, 2), "south")).toBe("autumn");
  });

  it("crosses month and year boundaries using the local calendar", () => {
    expect(seasonalEdition(localDate(9, 30))).toBe("autumn");
    expect(seasonalEdition(localDate(10))).toBe("halloween");
    expect(seasonalEdition(localDate(10, 31))).toBe("halloween");
    expect(seasonalEdition(localDate(11))).toBe("autumn");
    expect(seasonalEdition(localDate(11, 30))).toBe("autumn");
    expect(seasonalEdition(localDate(12))).toBe("christmas");
    expect(seasonalEdition(new Date(2027, 0, 1))).toBe("winter");
    expect(seasonalEdition(new Date(2027, 0, 1), "south")).toBe("summer");
  });

  it("keeps manually chosen artwork available outside its season and hemisphere", () => {
    expect(resolveEdition("christmas", true, localDate(6))).toBe("christmas");
    expect(resolveEdition("valentines", true, localDate(12))).toBe("valentines");
    expect(resolveEdition("summer", true, localDate(7), "south")).toBe("summer");
    expect(resolveEdition("seasonal", true, localDate(7), "south")).toBe("winter");
  });

  it("returns to Classic when Pro lapses without changing the saved preference", () => {
    for (const preference of [...EDITION_IDS, "seasonal"] as const) {
      expect(resolveEdition(preference, false, localDate(12), "south")).toBe("classic");
      expect(isEditionPreference(preference)).toBe(true);
    }
    expect(resolveEdition("audio", true, localDate(12))).toBe("audio");
  });

  it.each([null, undefined, "", "default", "unknown", 1, {}])("rejects corrupt stored preferences: %p", (value) => {
    expect(isEditionPreference(value)).toBe(false);
    expect(isHemisphere(value)).toBe(false);
  });

  it("accepts only supported hemispheres", () => {
    expect(isHemisphere("north")).toBe(true);
    expect(isHemisphere("south")).toBe(true);
    expect(isHemisphere("auto")).toBe(false);
  });
});
