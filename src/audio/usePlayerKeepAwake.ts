/**
 * Settings > Playback > Auto-lock, applied while the player screen is open:
 * "off" leaves iOS alone, "always" keeps the screen on, "charging" keeps it
 * on only while plugged in (bedside, car). Checked every 30 s — a charger
 * plugged in mid-chapter takes effect within half a minute.
 */
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useEffect, useState } from "react";
import { isDeviceCharging } from "../../modules/now-playing";
import type { KeepAwake } from "./playerPrefs";

const TAG = "bookliz-audio-player";

export function usePlayerKeepAwake(mode: KeepAwake) {
  const [charging, setCharging] = useState(false);

  useEffect(() => {
    if (mode !== "charging") return;
    let alive = true;
    const check = () => void isDeviceCharging().then((value) => alive && setCharging(value));
    check();
    const id = setInterval(check, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [mode]);

  const on = mode === "always" || (mode === "charging" && charging);

  useEffect(() => {
    if (!on) return;
    activateKeepAwakeAsync(TAG).catch(() => {});
    return () => {
      Promise.resolve(deactivateKeepAwake(TAG)).catch(() => {});
    };
  }, [on]);
}
