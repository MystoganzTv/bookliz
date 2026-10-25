/** In-app artwork is independent of the home-screen icon and accent colour. */
export const EDITION_IDS = [
  "classic", "spring", "summer", "autumn", "winter", "valentines", "walpurgis", "workers",
  "halloween", "christmas", "moonlight", "botanical", "library", "audio",
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

export const EDITIONS: Record<EditionId, { background: string; glow: string; detail: string }> = {
  classic: { background: "#102D3A", glow: "#164D55", detail: "#FFC857" },
  halloween: { background: "#291536", glow: "#51304F", detail: "#FFBB72" },
  christmas: { background: "#123C35", glow: "#24594C", detail: "#FFD88A" },
  moonlight: { background: "#171D44", glow: "#323A66", detail: "#D7CDFF" },
  botanical: { background: "#193E35", glow: "#345B43", detail: "#C8E3AE" },
  library: { background: "#4B2C24", glow: "#704A35", detail: "#FFD4A1" },
  audio: { background: "#26214D", glow: "#453D72", detail: "#C6BDFF" },
  spring: { background: "#244B3D", glow: "#3B6850", detail: "#FFD5DF" },
  summer: { background: "#064B69", glow: "#126F83", detail: "#FFE099" },
  autumn: { background: "#4C2C22", glow: "#75432C", detail: "#FFD29A" },
  winter: { background: "#17364F", glow: "#31576E", detail: "#CCEFFF" },
  valentines: { background: "#541F38", glow: "#78354F", detail: "#FFD2DF" },
  walpurgis: { background: "#2D1D48", glow: "#503167", detail: "#FFDB94" },
  workers: { background: "#153E49", glow: "#2F5B60", detail: "#FFE0A6" },
};
