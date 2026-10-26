/**
 * Setting the home-screen icon that goes with a theme. iOS shows its own
 * "You have changed the icon" alert on every change, so this never sets the
 * icon it already has, and never runs two changes at once.
 */
import { availableIcons, currentIcon, setIcon, supportsAlternateIcons } from "../../modules/app-icon";
import { APP_ICONS, AppIconId } from "./appIcons";

export type IconResult = "changed" | "same" | "unsupported" | "unavailable" | "failed";

let inFlight: Promise<IconResult> = Promise.resolve("same");

export function applyAppIcon(target: AppIconId): Promise<IconResult> {
  inFlight = inFlight.catch(() => "failed" as const).then(async () => {
    try {
      if (!(await supportsAlternateIcons())) return "unsupported";
      const icon = APP_ICONS.find((row) => row.id === target);
      if (!icon) return "failed";
      if (icon.nativeName !== null) {
        const bundled = await availableIcons();
        if (!bundled?.includes(icon.nativeName)) return "unavailable";
      }
      if ((await currentIcon()) === icon.nativeName) return "same";
      await setIcon(icon.nativeName);
      return (await currentIcon()) === icon.nativeName ? "changed" : "failed";
    } catch {
      return "failed";
    }
  });
  return inFlight;
}
