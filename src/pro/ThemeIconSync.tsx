import { useEffect } from "react";
import { AppState } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { iconForEdition } from "./appIcons";
import { usePro } from "./ProContext";
import { applyAppIcon } from "./themeIcon";

/**
 * Keeps the home-screen icon on the season while the theme is Automatic: when
 * the calendar moves on (checked on launch and every return to the app), the
 * icon follows. Manual picks are applied by the Themes screen itself.
 *
 * It only ever acts with Pro confirmed and the preference loaded as
 * "seasonal" — never on the defaults a cold start shows before storage and
 * the store have answered, which would flip the icon (and fire iOS's alert)
 * for nothing. A lapsed Pro leaves the icon where it is.
 */
export function ThemeIconSync() {
  const { edition, editionPreference, iconFollowsTheme, classicIcon } = useTheme();
  const { isPro } = usePro();
  const active = isPro && iconFollowsTheme && editionPreference === "seasonal";
  const target = iconForEdition(edition, classicIcon);

  useEffect(() => {
    if (!active) return;
    const apply = () => {
      if (AppState.currentState === "active") void applyAppIcon(target);
    };
    apply();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") apply();
    });
    return () => subscription.remove();
  }, [active, target]);

  return null;
}
