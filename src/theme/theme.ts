import { Platform } from "react-native";

// ─── Fixed palette (never changes between themes) ────────────────────────────
export const palette = {
  navy:     "#0F172A",
  navy2:    "#071123",
  teal:     "#14B8A6",
  tealDark: "#0E9E93",
  gold:     "#FFC857",
  coral:    "#FF7A59",
  green:    "#7FB069",
  gray:     "#9EA7A0",
  danger:   "#D95D47",
  white:    "#FFFFFF",
  cream:    "#FFFBF4",
};

// ─── Semantic tokens ──────────────────────────────────────────────────────────
export type AppColors = {
  // Fixed
  navy:     string;
  navy2:    string;
  teal:     string;
  tealDark: string;
  gold:     string;
  coral:    string;
  green:    string;
  gray:     string;
  danger:   string;
  shadow:   string;
  // Semantic (changes per theme)
  bg:       string;   // app background
  surface:  string;   // card / elevated surface
  surfaceAlt: string; // slightly different surface (stats strips, etc.)
  ink:      string;   // primary text
  muted:    string;   // secondary / hint text
  border:   string;   // dividers & borders
  navBg:    string;   // navigation bar background
  navText:  string;   // navigation bar text & icons
  // Legacy aliases — keep so untouched screens don't break
  cream:    string;
  card:     string;
};

export const lightColors: AppColors = {
  ...palette,
  shadow:     "#0F172A",
  bg:         "#FCF8F1",
  surface:    "#FFFDFC",
  surfaceAlt: "#F6EFE4",
  ink:        "#182033",
  muted:      "#6B726F",
  border:     "#E9DEC9",
  navBg:      "#FFFDFC",
  navText:    "#182033",
  // aliases
  cream:      "#FCF8F1",
  card:       "#FFFDFC",
};

export const darkColors: AppColors = {
  ...palette,
  shadow:     "#000000",
  bg:         "#111827",
  surface:    "#182235",
  surfaceAlt: "#22314A",
  ink:        "#F7F1E7",
  muted:      "rgba(247,241,231,0.68)",
  border:     "rgba(255,244,232,0.08)",
  navBg:      "#101827",
  navText:    "#F7F1E7",
  // aliases
  cream:      "#111827",
  card:       "#182235",
};

// Default export = light theme (used in any file that hasn't migrated to useColors yet)
export const colors = lightColors;

export const fonts = {
  display:     Platform.select({ ios: "Lora_700Bold",      android: "Lora_700Bold",      default: "Lora_700Bold" }),
  body:        Platform.select({ ios: "Nunito_700Bold",    android: "Nunito_700Bold",    default: "Nunito_700Bold" }),
  bodyRegular: Platform.select({ ios: "Nunito_400Regular", android: "Nunito_400Regular", default: "Nunito_400Regular" }),
  mono:        Platform.select({ ios: "Menlo",             android: "monospace",         default: "monospace" }),
};

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 22,
  xl: 32,
};

export const radii = {
  sm:   12,
  md:   18,
  lg:   26,
  pill: 999,
};

export const shadows = {
  card: {
    shadowColor:   palette.navy,
    shadowOpacity: 0.12,
    shadowRadius:  16,
    shadowOffset:  { width: 0, height: 10 },
    elevation:     4,
  },
};

/**
 * A colour at some opacity — for tints of the accent (`withAlpha(c.teal, 0.16)`),
 * so they follow the accent a Pro reader picks instead of staying teal.
 * Accepts #RGB / #RRGGBB; anything else is returned unchanged.
 */
export function withAlpha(color: string, alpha: number): string {
  const hex = color.trim().replace(/^#/, "");
  const full = hex.length === 3 ? hex.split("").map((ch) => ch + ch).join("") : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return color;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
