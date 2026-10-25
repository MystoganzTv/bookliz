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
import { AppState, Appearance, useColorScheme } from "react-native";
import { AppColors, darkColors, lightColors } from "./theme";
import { Atmosphere, atmosphereFor, paintAtmosphere } from "./atmospheres";
import { usePro } from "../pro/ProContext";
import { EditionId, EditionPreference, Hemisphere, isEditionPreference, isHemisphere, resolveEdition } from "../pro/editions";
import { ClassicIconId, isClassicIconId } from "../pro/appIcons";
import { writeSplashTheme } from "./splashTheme";

const STORAGE_KEY = "@bookliz/theme";
const ICON_FOLLOWS_KEY = "@bookliz/icon-follows-theme";
const CLASSIC_ICON_KEY = "@bookliz/classic-icon";
const EDITION_KEY = "@bookliz/edition";
const HEMISPHERE_KEY = "@bookliz/hemisphere";

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
  /**
   * A theme is a package: picking one also sets the matching home-screen icon
   * (ThemeIconSync does it) unless the reader turns this off.
   */
  iconFollowsTheme: boolean;
  setIconFollowsTheme: (follows: boolean) => void;
  /** Classic has six icon colourways; this is the one that goes with it. */
  classicIcon: ClassicIconId;
  setClassicIcon: (icon: ClassicIconId) => void;
  /**
   * The edition in force (Pro + chosen or automatic). It repaints `colors`
   * through `paintAtmosphere`; `atmosphere` carries what isn't a colour token
   * (motifs, the wash) for `<Screen>`. Null for Classic.
   */
  edition: EditionId;
  atmosphere: Atmosphere | null;
  editionPreference: EditionPreference;
  setEditionPreference: (edition: EditionPreference) => void;
  hemisphere: Hemisphere;
  setHemisphere: (hemisphere: Hemisphere) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  mode:          "light",
  isDark:        false,
  colors:        lightColors,
  preference:    "system",
  setPreference: () => {},
  toggleTheme:   () => {},
  iconFollowsTheme: true,
  setIconFollowsTheme: () => {},
  classicIcon: "default",
  setClassicIcon: () => {},
  edition: "classic",
  atmosphere: null,
  editionPreference: "classic",
  setEditionPreference: () => {},
  hemisphere: "north",
  setHemisphere: () => {},
});

export function ThemeProvider({ children }: PropsWithChildren) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [iconFollowsTheme, setIconFollowsState] = useState(true);
  const [classicIcon, setClassicIconState] = useState<ClassicIconId>("default");
  const [editionPreference, setEditionState] = useState<EditionPreference>("classic");
  const [hemisphere, setHemisphereState] = useState<Hemisphere>("north");
  const [calendarDate, setCalendarDate] = useState(() => new Date());
  const [hydrated, setHydrated] = useState(false);
  const calendarDay = calendarDate.toDateString();
  const { isPro } = usePro();
  const systemScheme = useColorScheme();

  // Hydrate persisted preference
  useEffect(() => {
    const reads = [
      AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
        if (isThemePreference(saved)) setPreferenceState(saved);
      }).catch(() => {}),
      AsyncStorage.getItem(ICON_FOLLOWS_KEY).then((saved) => {
        if (saved === "false") setIconFollowsState(false);
      }).catch(() => {}),
      AsyncStorage.getItem(CLASSIC_ICON_KEY).then((saved) => {
        if (isClassicIconId(saved)) setClassicIconState(saved);
      }).catch(() => {}),
      AsyncStorage.getItem(EDITION_KEY).then((saved) => {
        if (isEditionPreference(saved)) setEditionState(saved);
      }).catch(() => {}),
      AsyncStorage.getItem(HEMISPHERE_KEY).then((saved) => {
        if (isHemisphere(saved)) setHemisphereState(saved);
      }).catch(() => {}),
    ];
    void Promise.all(reads).then(() => setHydrated(true));
  }, []);

  // Refresh after returning to the app and across midnight while it stays open.
  useEffect(() => {
    if (editionPreference !== "seasonal") return;
    const refresh = () => setCalendarDate(new Date());
    refresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    const tomorrow = new Date();
    tomorrow.setHours(24, 0, 0, 50);
    const timer = setTimeout(refresh, tomorrow.getTime() - Date.now());
    return () => { subscription.remove(); clearTimeout(timer); };
  }, [editionPreference, calendarDay]);

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

  const setIconFollowsTheme = useCallback((next: boolean) => {
    setIconFollowsState(next);
    AsyncStorage.setItem(ICON_FOLLOWS_KEY, String(next)).catch(() => {});
  }, []);

  const setClassicIcon = useCallback((next: ClassicIconId) => {
    setClassicIconState(next);
    AsyncStorage.setItem(CLASSIC_ICON_KEY, next).catch(() => {});
  }, []);

  const setEditionPreference = useCallback((next: EditionPreference) => {
    setEditionState(next);
    AsyncStorage.setItem(EDITION_KEY, next).catch(() => {});
  }, []);

  const setHemisphere = useCallback((next: Hemisphere) => {
    setHemisphereState(next);
    AsyncStorage.setItem(HEMISPHERE_KEY, next).catch(() => {});
  }, []);

  // Leave a note for the next launch's splash. Debounced so the brief
  // not-yet-Pro moment of a cold start is overwritten before it is saved.
  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => writeSplashTheme({ preference: editionPreference, hemisphere, pro: isPro }), 1500);
    return () => clearTimeout(timer);
  }, [hydrated, editionPreference, hemisphere, isPro]);

  const mode: ThemeMode = preference === "system" ? (systemScheme === "dark" ? "dark" : "light") : preference;

  const toggleTheme = useCallback(() => {
    setPreference(mode === "dark" ? "light" : "dark");
  }, [mode, setPreference]);

  const value = useMemo<ThemeContextValue>(() => {
    const isDark = mode === "dark";
    const edition = resolveEdition(editionPreference, isPro, calendarDate, hemisphere);
    const colors = paintAtmosphere(isDark ? darkColors : lightColors, edition, isDark);
    return { mode, isDark, colors, preference, setPreference, toggleTheme,
      iconFollowsTheme, setIconFollowsTheme, classicIcon, setClassicIcon,
      edition, atmosphere: atmosphereFor(edition), editionPreference, setEditionPreference, hemisphere, setHemisphere };
  }, [isPro, mode, preference, setPreference, toggleTheme, iconFollowsTheme, setIconFollowsTheme, classicIcon, setClassicIcon,
    editionPreference, calendarDate, setEditionPreference, hemisphere, setHemisphere]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

/** Shorthand — returns just the color set */
export function useColors() {
  return useContext(ThemeContext).colors;
}
