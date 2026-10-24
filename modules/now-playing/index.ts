/** Lock-screen skip intervals. A no-op where the native module is not in the build. */
import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

type NowPlayingNative = { setSkipIntervals(backward: number, forward: number): void; isCharging(): Promise<boolean> };

const native: NowPlayingNative | null =
  Platform.OS === "ios" ? requireOptionalNativeModule<NowPlayingNative>("NowPlaying") : null;

export function setLockScreenSkipIntervals(backward: number, forward: number) {
  try {
    native?.setSkipIntervals(backward, forward);
  } catch {
    // Cosmetic: the in-app buttons work regardless.
  }
}

/** Plugged in (charging or full). False where unknown. */
export async function isDeviceCharging(): Promise<boolean> {
  try {
    return (await native?.isCharging()) ?? false;
  } catch {
    return false;
  }
}
