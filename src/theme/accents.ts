/**
 * Accent colours (Bookliz Pro). An accent replaces `teal` / `tealDark` in the
 * colour set, which is what buttons, toggles, progress and links paint with.
 * Every accent keeps white text readable on it (buttons put white on `teal`).
 */
export type AccentId = "teal" | "ocean" | "indigo" | "violet" | "rose" | "amber" | "forest";

export const ACCENTS: Record<AccentId, { main: string; dark: string }> = {
  teal: { main: "#14B8A6", dark: "#0E9E93" },
  ocean: { main: "#3B82F6", dark: "#2563EB" },
  indigo: { main: "#6366F1", dark: "#4F46E5" },
  violet: { main: "#A855F7", dark: "#9333EA" },
  rose: { main: "#EC4899", dark: "#DB2777" },
  amber: { main: "#F59E0B", dark: "#D97706" },
  forest: { main: "#22C55E", dark: "#16A34A" },
};

export const ACCENT_IDS = Object.keys(ACCENTS) as AccentId[];

export const isAccentId = (value: unknown): value is AccentId =>
  typeof value === "string" && value in ACCENTS;
