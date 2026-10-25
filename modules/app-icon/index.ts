/**
 * Alternate home-screen icons. No-ops (and "unsupported") where the native
 * module is not in the build.
 */
import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

type AppIconNative = {
  supportsAlternateIcons(): boolean;
  currentIcon(): string | null;
  setIcon(name: string | null): Promise<string | null>;
};

const native: AppIconNative | null =
  Platform.OS === "ios" ? requireOptionalNativeModule<AppIconNative>("AppIcon") : null;

export function supportsAlternateIcons(): boolean {
  try {
    return native?.supportsAlternateIcons() ?? false;
  } catch {
    return false;
  }
}

/** The alternate set's name, or null for the primary icon. */
export function currentIcon(): string | null {
  try {
    return native?.currentIcon() ?? null;
  } catch {
    return null;
  }
}

export async function setIcon(name: string | null): Promise<string | null> {
  if (!native) throw new Error("Alternate icons are not available in this build");
  return native.setIcon(name);
}
