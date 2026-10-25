/**
 * Atmospheres (Bookliz Pro) — what an in-app edition actually paints.
 *
 * An atmosphere is a whole colour set, not a decoration: it replaces the
 * background, surfaces, borders, text tints and accent the rest of the app
 * already reads through `useColors()`, in light AND dark — `navy` included,
 * since it is the dark button colour ("Read", "Save"…). On top of that the
 * shared `<Screen>` draws `AtmosphereBackdrop` (a soft wash and three motifs
 * in the top-right corner) and `AtmosphereFill` (the edition's objects
 * scattered through the empty space below the content; on a really empty
 * screen, its landscape — assets/atmospheres/<id>.png — along the bottom).
 * Classic has no entry: it is the stock Bookliz palette, untouched.
 *
 * Every value is a solid hex so `atmospheres.test.ts` can check contrast:
 * ink/muted on bg and surface, white on the accent (buttons put white text on
 * `teal`), and the accent on bg (links, icons, progress).
 */
import type { MaterialCommunityIcons } from "@expo/vector-icons";
import type { EditionId } from "../pro/editions";
import type { AppColors } from "./theme";

/** The tokens an atmosphere owns. Everything else (danger, green, navy2…) stays fixed. */
export type AtmosphereTokens = Pick<
  AppColors,
  "bg" | "surface" | "surfaceAlt" | "ink" | "muted" | "border" | "navBg" | "navText" | "teal" | "tealDark" | "coral" | "gold" | "navy"
> & {
  /** Colour of the soft wash behind the top of every screen. */
  wash: string;
};

export type MotifName = keyof typeof MaterialCommunityIcons.glyphMap;

export type Atmosphere = {
  /**
   * The edition's objects (MaterialCommunityIcons). The first two sit in the
   * top-right corner of every screen; all of them are scattered, at random
   * but stable per screen, through the empty space below the content
   * (`AtmosphereFill`). Never behind text.
   */
  motifs: MotifName[];
  light: AtmosphereTokens;
  dark: AtmosphereTokens;
};

export type ThemedEditionId = Exclude<EditionId, "classic">;

export const ATMOSPHERES: Record<ThemedEditionId, Atmosphere> = {
  spring: {
    motifs: ["flower-tulip", "butterfly", "bee", "sprout", "flower", "bird", "umbrella"],
    light: { bg: "#FCF6F4", surface: "#FFFCFB", surfaceAlt: "#F7E9E8", border: "#EFDADA", ink: "#2A1F24", muted: "#72636A", navBg: "#FFFCFB", navText: "#2A1F24", teal: "#C2486C", tealDark: "#A93D5D", coral: "#3F8A52", gold: "#E2A93A", navy: "#3A1F2C", wash: "#F6D3DC" },
    dark:  { bg: "#18141A", surface: "#231C25", surfaceAlt: "#2F2531", border: "#3A2E3C", ink: "#F8EEF1", muted: "#BFAFB5", navBg: "#151116", navText: "#F8EEF1", teal: "#D45F82", tealDark: "#BD5072", coral: "#7CC28B", gold: "#F2C15A", navy: "#4A2638", wash: "#4A2A3A" },
  },
  summer: {
    motifs: ["palm-tree", "white-balance-sunny", "ice-cream", "fruit-watermelon", "sunglasses", "sail-boat", "fruit-pineapple", "kite"],
    light: { bg: "#FDF8EC", surface: "#FFFDF6", surfaceAlt: "#F6EDD6", border: "#EADFC1", ink: "#15283A", muted: "#5D6970", navBg: "#FFFDF6", navText: "#15283A", teal: "#0A7C9E", tealDark: "#086985", coral: "#D9702A", gold: "#F0B02A", navy: "#0B2A3A", wash: "#FCE3A6" },
    dark:  { bg: "#0A1A24", surface: "#112634", surfaceAlt: "#183345", border: "#20405A", ink: "#F3F4EC", muted: "#A9B6BC", navBg: "#08151D", navText: "#F3F4EC", teal: "#1A8FB0", tealDark: "#157C99", coral: "#FF9A52", gold: "#FFCB55", navy: "#12405A", wash: "#0F4A63" },
  },
  autumn: {
    motifs: ["leaf-maple", "mushroom", "coffee", "umbrella", "leaf", "weather-windy"],
    light: { bg: "#FAF2E8", surface: "#FFFAF3", surfaceAlt: "#F2E3D1", border: "#E6D2BA", ink: "#2B1D15", muted: "#72625A", navBg: "#FFFAF3", navText: "#2B1D15", teal: "#B04C27", tealDark: "#953F20", coral: "#A8731A", gold: "#E0A43A", navy: "#3A1F14", wash: "#F2CFA6" },
    dark:  { bg: "#1A130E", surface: "#251B14", surfaceAlt: "#31241A", border: "#3D2D21", ink: "#F6EBDF", muted: "#BCAA99", navBg: "#150F0B", navText: "#F6EBDF", teal: "#C75E33", tealDark: "#AF522C", coral: "#E3A23C", gold: "#F0B95A", navy: "#4E2A1A", wash: "#4E2C1C" },
  },
  winter: {
    motifs: ["snowflake", "snowman", "ski", "coffee", "pine-tree", "star-four-points"],
    light: { bg: "#F3F7FA", surface: "#FBFDFE", surfaceAlt: "#E6EEF4", border: "#D5E1EA", ink: "#142538", muted: "#5A6976", navBg: "#FBFDFE", navText: "#142538", teal: "#2A72A8", tealDark: "#215F8F", coral: "#B85E3E", gold: "#E2B04A", navy: "#13253A", wash: "#D6E8F5" },
    dark:  { bg: "#0C1622", surface: "#142233", surfaceAlt: "#1C2E43", border: "#253A52", ink: "#EEF4F9", muted: "#A4B3C1", navBg: "#0A121C", navText: "#EEF4F9", teal: "#3D88BE", tealDark: "#3477A8", coral: "#E58A68", gold: "#F2C66A", navy: "#1E3A5C", wash: "#1D4466" },
  },
  valentines: {
    motifs: ["heart", "cards-heart", "ring", "email-heart-outline", "heart-outline", "cupcake", "flower"],
    light: { bg: "#FCF4F5", surface: "#FFFBFB", surfaceAlt: "#F7E6E9", border: "#EFD5DA", ink: "#2C1A20", muted: "#755E65", navBg: "#FFFBFB", navText: "#2C1A20", teal: "#C7365E", tealDark: "#AD2C51", coral: "#C9603F", gold: "#E2A07F", navy: "#3D1424", wash: "#F7CCD6" },
    dark:  { bg: "#1B1015", surface: "#271820", surfaceAlt: "#33202A", border: "#402835", ink: "#FAEDF1", muted: "#C4A9B2", navBg: "#160C11", navText: "#FAEDF1", teal: "#D64B73", tealDark: "#BE3F64", coral: "#FF8A6E", gold: "#F3BFA6", navy: "#55203A", wash: "#5A1F36" },
  },
  walpurgis: {
    motifs: ["wizard-hat", "crystal-ball", "broom", "fire", "moon-waning-crescent", "star-four-points", "owl", "magic-staff"],
    light: { bg: "#F6F2F8", surface: "#FCFAFD", surfaceAlt: "#EDE5F2", border: "#E0D4E8", ink: "#22182E", muted: "#6A5F74", navBg: "#FCFAFD", navText: "#22182E", teal: "#7D40B2", tealDark: "#6A359A", coral: "#C45A22", gold: "#E9A23B", navy: "#2A1846", wash: "#E3D0F0" },
    dark:  { bg: "#140E1D", surface: "#1E162A", surfaceAlt: "#2A1F39", border: "#362848", ink: "#F3EDF8", muted: "#B6A9C2", navBg: "#100B17", navText: "#F3EDF8", teal: "#9558CF", tealDark: "#8249BA", coral: "#F08040", gold: "#FFC15C", navy: "#3E2466", wash: "#3E2459" },
  },
  workers: {
    motifs: ["hammer", "wrench", "cog", "factory", "account-hard-hat", "tools", "hammer-wrench"],
    light: { bg: "#F4F5F7", surface: "#FCFCFD", surfaceAlt: "#E8EBEF", border: "#D7DCE2", ink: "#1A2230", muted: "#5B6370", navBg: "#FCFCFD", navText: "#1A2230", teal: "#2D5F8F", tealDark: "#244E77", coral: "#B5650A", gold: "#E9A920", navy: "#1B2A3D", wash: "#DCE5EF" },
    dark:  { bg: "#11161D", surface: "#1A212B", surfaceAlt: "#242D39", border: "#2F3946", ink: "#EEF1F5", muted: "#A6AEB9", navBg: "#0E1218", navText: "#EEF1F5", teal: "#3D74AA", tealDark: "#3A6FA3", coral: "#F0A030", gold: "#F5C04A", navy: "#2A3D57", wash: "#1E3550" },
  },
  halloween: {
    motifs: ["skull", "ghost", "pumpkin", "bat", "spider", "spider-web", "coffin", "candle"],
    light: { bg: "#FAF3EA", surface: "#FFFAF3", surfaceAlt: "#F3E5D3", border: "#E8D4BD", ink: "#23182C", muted: "#6C6072", navBg: "#FFFAF3", navText: "#23182C", teal: "#C25514", tealDark: "#A64811", coral: "#7B3FA0", gold: "#E9A53A", navy: "#2A1636", wash: "#F6D2AE" },
    dark:  { bg: "#16101E", surface: "#21182C", surfaceAlt: "#2C2039", border: "#392A49", ink: "#F7EEDF", muted: "#BBAEBF", navBg: "#120D19", navText: "#F7EEDF", teal: "#D2621F", tealDark: "#B9561B", coral: "#A86FD6", gold: "#FFB84D", navy: "#44265C", wash: "#4A2A3F" },
  },
  christmas: {
    motifs: ["pine-tree", "gift", "snowflake", "candycane", "snowman", "bell", "star", "ornament"],
    light: { bg: "#F7F5EF", surface: "#FDFCF8", surfaceAlt: "#ECE8DC", border: "#DCD6C5", ink: "#172620", muted: "#5D6862", navBg: "#FDFCF8", navText: "#172620", teal: "#1E7A4C", tealDark: "#17663F", coral: "#C2313C", gold: "#D9A532", navy: "#0F2A20", wash: "#D3E6D8" },
    dark:  { bg: "#0D1A16", surface: "#142520", surfaceAlt: "#1C322A", border: "#253F35", ink: "#F5F1E6", muted: "#A9B8AF", navBg: "#0A1511", navText: "#F5F1E6", teal: "#258C58", tealDark: "#238251", coral: "#E5505A", gold: "#F2C14E", navy: "#1A4433", wash: "#1D4A38" },
  },
  moonlight: {
    motifs: ["moon-waning-crescent", "star-four-points", "owl", "weather-night", "telescope", "star-shooting", "cloud"],
    light: { bg: "#F4F5FB", surface: "#FCFCFF", surfaceAlt: "#E8EAF5", border: "#D9DCEC", ink: "#181C35", muted: "#5D6176", navBg: "#FCFCFF", navText: "#181C35", teal: "#5059C2", tealDark: "#434BAA", coral: "#9A6A1C", gold: "#D8B64A", navy: "#161B45", wash: "#DCDFF4" },
    dark:  { bg: "#0C1029", surface: "#151A38", surfaceAlt: "#1E2447", border: "#2A3157", ink: "#EEF0FA", muted: "#A9AECB", navBg: "#090C21", navText: "#EEF0FA", teal: "#6370DE", tealDark: "#5662C8", coral: "#E9CF7A", gold: "#E9D98B", navy: "#25306E", wash: "#232C6B" },
  },
  botanical: {
    motifs: ["leaf", "sprout", "cactus", "flower", "watering-can", "mushroom", "flower-tulip"],
    light: { bg: "#F3F5EC", surface: "#FBFCF7", surfaceAlt: "#E7EBDB", border: "#D7DDC6", ink: "#1B2619", muted: "#5F695B", navBg: "#FBFCF7", navText: "#1B2619", teal: "#4A7629", tealDark: "#3E6322", coral: "#B05F49", gold: "#D6A93A", navy: "#1A2E1C", wash: "#D6E5C3" },
    dark:  { bg: "#0F1A12", surface: "#17261B", surfaceAlt: "#203325", border: "#2A4030", ink: "#F0F3E8", muted: "#A8B6A4", navBg: "#0B150E", navText: "#F0F3E8", teal: "#56873A", tealDark: "#4F7E36", coral: "#DA8770", gold: "#E9C35A", navy: "#28462B", wash: "#23452C" },
  },
  library: {
    motifs: ["bookshelf", "book-open-variant", "feather", "fountain-pen-tip", "glasses", "coffee", "bookmark", "lamp"],
    light: { bg: "#F6EFE3", surface: "#FCF8F0", surfaceAlt: "#EDE2CF", border: "#DFD0B7", ink: "#2A1E16", muted: "#6C5F53", navBg: "#FCF8F0", navText: "#2A1E16", teal: "#8A4C28", tealDark: "#74401F", coral: "#3D6E59", gold: "#C9963E", navy: "#3A2418", wash: "#EBD5B5" },
    dark:  { bg: "#18120E", surface: "#231A14", surfaceAlt: "#2F241B", border: "#3B2E23", ink: "#F4EADB", muted: "#B9A994", navBg: "#130E0B", navText: "#F4EADB", teal: "#A86E3C", tealDark: "#935F33", coral: "#6FA88E", gold: "#E2B262", navy: "#4E3222", wash: "#4A3020" },
  },
  audio: {
    motifs: ["headphones", "music-note", "microphone", "speaker", "cassette", "radio", "music-clef-treble", "guitar-acoustic"],
    light: { bg: "#F6F4FC", surface: "#FDFCFF", surfaceAlt: "#EAE6F7", border: "#DCD6F0", ink: "#1C1830", muted: "#625D76", navBg: "#FDFCFF", navText: "#1C1830", teal: "#6847D4", tealDark: "#5839BC", coral: "#C93C73", gold: "#E0A93C", navy: "#221A4A", wash: "#E0D8F7" },
    dark:  { bg: "#110E22", surface: "#1A1631", surfaceAlt: "#241F42", border: "#302A55", ink: "#F1EEFA", muted: "#ADA7C6", navBg: "#0D0A1B", navText: "#F1EEFA", teal: "#7B5AE6", tealDark: "#7152D8", coral: "#F2649B", gold: "#F5C35A", navy: "#352A72", wash: "#362A75" },
  },
};

export function atmosphereFor(edition: EditionId): Atmosphere | null {
  return edition === "classic" ? null : ATMOSPHERES[edition];
}

/** The colour set for an edition in one mode. Classic returns `base` unchanged. */
export function paintAtmosphere(base: AppColors, edition: EditionId, isDark: boolean): AppColors {
  const atmosphere = atmosphereFor(edition);
  if (!atmosphere) return base;
  const { wash: _wash, ...tokens } = isDark ? atmosphere.dark : atmosphere.light;
  return { ...base, ...tokens, cream: tokens.bg, card: tokens.surface };
}
