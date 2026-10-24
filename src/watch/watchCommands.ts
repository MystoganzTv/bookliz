/**
 * What a tap on the watch does on the phone. Kept apart from the bridge so
 * it can be tested without a watch: the engine is anything with these methods.
 */
import type { SleepChoice } from "../audio/audiobookEngine";
import { PLAYBACK_SPEEDS } from "../audio/audiobookModel";
import type { PlayerPrefs } from "../audio/playerPrefs";
import type { WatchCommand } from "../../modules/watch-bridge";

export interface WatchControllable {
  toggle(): void;
  play(): void;
  pause(): void;
  skip(deltaSec: number): unknown;
  previousChapter(): void;
  nextChapter(): void;
  jumpToChapter(index: number): void;
  setSpeed(speed: number): void;
  setSleepTimer(choice: SleepChoice | null): void;
  addBookmark(): number | null;
  open(bookId: string, autoplay?: boolean): unknown;
  readonly library: Record<string, unknown>;
}

/** Returns false for a command it does not know (an older phone app talking to a newer watch). */
export function runWatchCommand(engine: WatchControllable, cmd: WatchCommand, prefs: PlayerPrefs): boolean {
  switch (cmd.command) {
    case "toggle":
      engine.toggle();
      return true;
    case "play":
      engine.play();
      return true;
    case "pause":
      engine.pause();
      return true;
    case "skipBack":
      void engine.skip(-prefs.skipBackSec);
      return true;
    case "skipForward":
      void engine.skip(prefs.skipForwardSec);
      return true;
    case "previousChapter":
      engine.previousChapter();
      return true;
    case "nextChapter":
      engine.nextChapter();
      return true;
    case "chapter":
      if (typeof cmd.index !== "number" || !Number.isInteger(cmd.index) || cmd.index < 0) return false;
      engine.jumpToChapter(cmd.index);
      return true;
    case "speed":
      if (!(PLAYBACK_SPEEDS as readonly number[]).includes(cmd.speed as number)) return false;
      engine.setSpeed(cmd.speed as number);
      return true;
    case "sleep":
      if (cmd.kind === "off") engine.setSleepTimer(null);
      else if (cmd.kind === "chapter") engine.setSleepTimer({ kind: "chapter" });
      else if (cmd.kind === "minutes" && typeof cmd.minutes === "number" && cmd.minutes > 0 && cmd.minutes <= 240) {
        engine.setSleepTimer({ kind: "minutes", minutes: cmd.minutes });
      } else return false;
      return true;
    case "bookmark":
      engine.addBookmark();
      return true;
    case "open":
      if (!cmd.bookId || !(cmd.bookId in engine.library)) return false;
      void engine.open(cmd.bookId, true);
      return true;
    case "sync":
      // Nothing to do: the caller re-sends the state after every command.
      return true;
    default:
      return false;
  }
}
