/**
 * Who owns the iPhone's audio session right now.
 *
 * Two kinds of sound live in Bookliz:
 *  - the audiobook player: plays with the silent switch on, keeps going in
 *    the background, and pauses whatever else was playing (like any player);
 *  - little UI sounds (the opening chime): obey the silent switch, never play
 *    in the background, and mix with your music instead of stopping it.
 *
 * The session is switched only right before something plays, so opening the
 * app never interrupts a podcast or a song already playing.
 */
import { setAudioModeAsync } from "expo-audio";

let current: "playback" | "ambient" | null = null;

/** Before an audiobook plays. */
export async function claimPlaybackSession(): Promise<void> {
  if (current === "playback") return;
  current = "playback";
  try {
    await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: "doNotMix" });
  } catch {
    // Playback still works in the foreground.
  }
}

/** Before a short UI sound. */
export async function claimAmbientSession(): Promise<void> {
  if (current === "ambient") return;
  current = "ambient";
  try {
    await setAudioModeAsync({ playsInSilentMode: false, shouldPlayInBackground: false, interruptionMode: "mixWithOthers" });
  } catch {
    // The sound is decoration; failing to set the mode is not worth surfacing.
  }
}
