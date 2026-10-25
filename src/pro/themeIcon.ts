/**
 * Setting the home-screen icon that goes with a theme. iOS shows its own
 * "You have changed the icon" alert on every change, so this never sets the
 * icon it already has, and never runs two changes at once.
 */
import { currentIcon, setIcon, supportsAlternateIcons } from "../../modules/app-icon";
import { APP_ICONS, AppIconId, iconIdForNativeName } from "./appIcons";

export type IconResult = "changed" | "same" | "unsupported" | "failed";

let inFlight: Promise<IconResult> = Promise.resolve("same");

export function applyAppIcon(target: AppIconId): Promise<IconResult> {
  inFlight = inFlight.catch(() => "failed" as const).then(async () => {
    if (!(await supportsAlternateIcons())) return "unsupported";
    if (iconIdForNativeName(await currentIcon()) === target) return "same";
    const icon = APP_ICONS.find((row) => row.id === target);
    if (!icon) return "failed";
    try {
      await setIcon(icon.nativeName);
      return "changed";
    } catch {
      return "failed";
    }
  });
  return inFlight;
}
