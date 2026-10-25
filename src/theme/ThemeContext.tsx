import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Appearance, useColorScheme } from "react-native";
import { AppColors, darkColors, lightColors } from "./theme";
import { ACCENTS, AccentId, isAccentId } from "./accents";
import { usePro } from "../pro/ProContext";

const STORAGE_KEY = "@bookliz/theme";
const ACCENT_KEY = "@bookliz/accent";

/** What the screen is painted in right now. */
type ThemeMode = "light" | "dark";
/**
 * What the reader chose. "system" follows the iPhone (Control Center, the
 * sunset schedule); it is the default for new installs. Installs that saved
 * "light" or "dark" before this option existed keep their choice.
 */
export type ThemePreference = "system" | "light" | "dark";

export const isThemePreference = (value: unknown): value is ThemePreference =>
  value === "system" || value === "light" || value === "dark";

type ThemeContextValue = {
  mode:          ThemeMode;
  isDark:        boolean;
  colors:        AppColors;
  preference:    ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  /** Flips between explicit light and dark (leaves "system"). */
  toggleTheme:   () => void;
  /** Chosen accent (Pro). Painted only while Pro is active; kept if it lapses. */
  accent:        AccentId;
  setAccent:     (accent: AccentId) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  mode:          "light",
  isDark:        false,
  colors:        lightColors,
  preference:    "system",
  setPreference: () => {},
  toggleTheme:   () => {},
  accent:        "teal",
  setAccent:     () => {},
});

export function ThemeProvider({ children }: PropsWithChildren) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [accent, setAccentState] = useState<AccentId>("teal");
  const { isPro } = usePro();
  const systemScheme = useColorScheme();

  // Hydrate persisted preference
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (isThemePreference(saved)) setPreferenceState(saved);
    }).catch(() => {});
    AsyncStorage.getItem(ACCENT_KEY).then((saved) => {
      if (isAccentId(saved)) setAccentState(saved);
    }).catch(() => {});
  }, []);

  // Native UI (keyboard, alerts, date pickers, Switch) follows the same choice:
  // an explicit light/dark overrides the window's style; "system" hands it back.
  // After an override useColorScheme() reports the overridden scheme, which is
  // why `mode` below can simply read it.
  useEffect(() => {
    try {
      Appearance.setColorScheme(preference === "system" ? null : preference);
    } catch {
      // Web / platforms without the native module: `mode` still resolves below.
    }
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const setAccent = useCallback((next: AccentId) => {
    setAccentState(next);
    AsyncStorage.setItem(ACCENT_KEY, next).catch(() => {});
  }, []);

  const mode: ThemeMode = preference === "system" ? (systemScheme === "dark" ? "dark" : "light") : preference;

  const toggleTheme = useCallback(() => {
    setPreference(mode === "dark" ? "light" : "dark");
  }, [mode, setPreference]);

  const value = useMemo<ThemeContextValue>(() => {
    const isDark = mode === "dark";
    const base = isDark ? darkColors : lightColors;
    const painted = isPro && accent !== "teal" ? ACCENTS[accent] : null;
    const colors = painted ? { ...base, teal: painted.main, tealDark: painted.dark } : base;
    return { mode, isDark, colors, preference, setPreference, toggleTheme, accent, setAccent };
  }, [accent, isPro, mode, preference, setAccent, setPreference, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

/** Shorthand — returns just the color set */
export function useColors() {
  return useContext(ThemeContext).colors;
}
