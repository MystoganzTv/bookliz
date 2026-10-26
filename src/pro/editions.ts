/**
 * In-app editions ("atmospheres"), independent of the home-screen icon.
 * What each one paints lives in src/theme/atmospheres.ts.
 */
export const EDITION_IDS = [
  "classic", "spring", "summer", "autumn", "winter", "valentines", "walpurgis", "workers",
  "halloween", "christmas", "moonlight", "botanical", "library", "audio",
  "mushroom", "dragon", "arcane", "moonGarden",
] as const;
export type EditionId = typeof EDITION_IDS[number];
export type EditionPreference = EditionId | "seasonal";
export type Hemisphere = "north" | "south";

export const isHemisphere = (value: unknown): value is Hemisphere => value === "north" || value === "south";

export function isEditionPreference(value: unknown): value is EditionPreference {
  return value === "seasonal" || EDITION_IDS.some((id) => id === value);
}

/** Local calendar; celebrations override month-based seasons. All editions can be chosen manually. */
export function seasonalEdition(date: Date, hemisphere: Hemisphere = "north"): EditionId {
  const month = date.getMonth();
  const day = date.getDate();
  if (month === 1 && day === 14) return "valentines";
  if (month === 3 && day === 30) return "walpurgis";
  if (month === 4 && day === 1) return "workers";
  if (month === 9) return "halloween";
  if (month === 11) return "christmas";

  // Meteorological seasons: March–May, June–August, September–November, December–February.
  // The summer illustration celebrates the solstice; it does not predict its astronomical instant.
  const season = Math.floor(((month + 10) % 12) / 3);
  const seasons: EditionId[] = hemisphere === "north"
    ? ["spring", "summer", "autumn", "winter"]
    : ["autumn", "winter", "spring", "summer"];
  return seasons[season];
}

export function resolveEdition(preference: EditionPreference, isPro: boolean, date: Date, hemisphere: Hemisphere = "north"): EditionId {
  if (!isPro) return "classic";
  return preference === "seasonal" ? seasonalEdition(date, hemisphere) : preference;
}
