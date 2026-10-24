/**
 * Keeps Bookliz on Apple Watch in step with the player on the phone, and runs
 * what the watch asks for. Mounted once, inside the audiobook provider.
 *
 * When to send: on every change of the player's main state or of the player
 * preferences, on a jump in position (seek, skip, chapter), and every 30 s
 * while playing — the watch runs its own clock in between.
 */
import { useEffect, useRef } from "react";
import { getPlayerPrefs, subscribePlayerPrefs } from "../audio/playerPrefs";
import type { AudiobookEngine } from "../audio/audiobookEngine";
import type { Book } from "../types/models";
import { isWatchBridgeAvailable, onWatchCommand, onWatchStatus, pushWatchState } from "../../modules/watch-bridge";
import { runWatchCommand } from "./watchCommands";
import { buildWatchState, type WatchReading } from "./watchState";
import type { WatchCommand } from "../../modules/watch-bridge";

const RESYNC_EVERY_MS = 30_000;
/** A position this far from where the watch's clock would be is a jump: tell it now. */
const JUMP_SEC = 2;

export function useWatchSync(
  engine: AudiobookEngine,
  deps: {
    locale: "en" | "es";
    getBook: (id: string) => Book | undefined;
    authorName: (book: Book) => string;
    /** Today, the reading timer and the books being read — absent until the bridge mounts it. */
    reading?: WatchReading | null;
    /** Reading-timer commands need navigation, so the caller runs them. Returns true if handled. */
    onReadingCommand?: (cmd: WatchCommand) => boolean;
  }
) {
  // Callbacks fire from native events long after this render; they read today's data.
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const sendRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!isWatchBridgeAvailable) return;

    let last = { at: 0, pos: 0, playing: false, speed: 1 };

    const send = () => {
      const main = engine.getMain();
      if (!main.ready) return;
      const { locale, getBook, authorName, reading } = depsRef.current;
      const now = Date.now();
      const state = buildWatchState({
        locale,
        now,
        library: main.library,
        activeBookId: main.activeBookId,
        isPlaying: main.isPlaying,
        isLoading: main.isLoading,
        positionSec: engine.getPosition(),
        sleepTimer: main.sleepTimer,
        prefs: getPlayerPrefs(),
        speedFor: (a) => engine.speedFor(a),
        getBook,
        authorName,
        reading,
      });
      last = { at: now, pos: state.now?.positionSec ?? 0, playing: state.now?.isPlaying ?? false, speed: state.now?.speed ?? 1 };
      pushWatchState(JSON.stringify(state));
    };

    sendRef.current = send;

    const onPosition = () => {
      const now = Date.now();
      const expected = last.playing ? last.pos + ((now - last.at) / 1000) * last.speed : last.pos;
      if (Math.abs(engine.getPosition() - expected) > JUMP_SEC || now - last.at > RESYNC_EVERY_MS) send();
    };

    const subs = [
      engine.subscribe("main", send),
      engine.subscribe("position", onPosition),
      subscribePlayerPrefs(send),
    ];
    const commandSub = onWatchCommand((cmd) => {
      if (!depsRef.current.onReadingCommand?.(cmd)) runWatchCommand(engine, cmd, getPlayerPrefs());
      // Most commands change main state and re-send on their own; this covers the rest (sync, bookmark).
      setTimeout(send, 250);
    });
    const statusSub = onWatchStatus((status) => {
      if (status.reachable) send();
    });
    send();

    return () => {
      sendRef.current = () => {};
      subs.forEach((off) => off());
      commandSub.remove();
      statusSub.remove();
    };
  }, [engine]);

  // The watch speaks the app's language, not the watch's: re-send when it changes.
  useEffect(() => {
    sendRef.current();
  }, [deps.locale, deps.reading]);
}
