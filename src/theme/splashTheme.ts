/**
 * Which theme the next launch opens with. The splash runs before the theme
 * providers have read storage, so ThemeContext leaves this note behind (the
 * preference, hemisphere and whether Pro was on) and the splash resolves it
 * for today — an Automatic theme that turned into Christmas overnight opens
 * as Christmas. A theme changed now shows on the next launch.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { EditionId, EditionPreference, Hemisphere, isEditionPreference, isHemisphere, resolveEdition } from "../pro/editions";

export const SPLASH_THEME_KEY = "@bookliz/splash-theme";

export type SplashThemeNote = { preference: EditionPreference; hemisphere: Hemisphere; pro: boolean };

export function editionFromNote(raw: string | null, now: Date): EditionId {
  if (!raw) return "classic";
  try {
    const note = JSON.parse(raw) as Partial<SplashThemeNote>;
    if (!isEditionPreference(note.preference)) return "classic";
    return resolveEdition(note.preference, note.pro === true, now, isHemisphere(note.hemisphere) ? note.hemisphere : "north");
  } catch {
    return "classic";
  }
}

export async function readSplashEdition(now = new Date()): Promise<EditionId> {
  try {
    return editionFromNote(await AsyncStorage.getItem(SPLASH_THEME_KEY), now);
  } catch {
    return "classic";
  }
}

export function writeSplashTheme(note: SplashThemeNote) {
  AsyncStorage.setItem(SPLASH_THEME_KEY, JSON.stringify(note)).catch(() => {});
}
