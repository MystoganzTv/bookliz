/**
 * Alternate home-screen icons. No-ops (and "unsupported") where the native
 * module is not in the build.
 */
import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

type AppIconNative = {
  supportsAlternateIcons(): Promise<boolean>;
  currentIcon(): Promise<string | null>;
  setIcon(name: string | null): Promise<string | null>;
};

const native: AppIconNative | null =
  Platform.OS === "ios" ? requireOptionalNativeModule<AppIconNative>("AppIcon") : null;

export async function supportsAlternateIcons(): Promise<boolean> {
  try {
    return (await native?.supportsAlternateIcons()) ?? false;
  } catch {
    return false;
  }
}

/** The alternate set's name, or null for the primary icon. */
export async function currentIcon(): Promise<string | null> {
  try {
    return (await native?.currentIcon()) ?? null;
  } catch {
    return null;
  }
}

export async function setIcon(name: string | null): Promise<string | null> {
  if (!native) throw new Error("Alternate icons are not available in this build");
  return native.setIcon(name);
}
