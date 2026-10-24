/**
 * Runs bookliz://audio/… links (see shortcutLinks.ts) — on cold start
 * (getInitialURL) and while the app is open ("url" events). Waits for the
 * audiobook engine to finish loading its library before acting.
 */
import type { NavigationContainerRefWithCurrent } from "@react-navigation/native";
import { useEffect } from "react";
import { Linking } from "react-native";
import { useAudiobookPlayer } from "../audio/AudiobookPlayerContext";
import type { AudiobookEngine } from "../audio/audiobookEngine";
import { getPlayerPrefs } from "../audio/playerPrefs";
import type { RootStackParamList } from "../navigation/types";
import { parseShortcutUrl, type ShortcutAction } from "./shortcutLinks";

type NavRef = NavigationContainerRefWithCurrent<RootStackParamList>;

/** The book a "resume" means: the active one, else the one played most recently. */
function bookToResume(engine: AudiobookEngine): string | null {
  const main = engine.getMain();
  if (main.activeBookId && main.library[main.activeBookId]) return main.activeBookId;
  const latest = Object.values(main.library).sort(
    (a, b) => (Date.parse(b.lastPlayedAt ?? b.addedAt) || 0) - (Date.parse(a.lastPlayedAt ?? a.addedAt) || 0)
  )[0];
  return latest?.bookId ?? null;
}

function perform(engine: AudiobookEngine, action: ShortcutAction, navigation: NavRef) {
  const prefs = getPlayerPrefs();
  switch (action.kind) {
    case "resume": {
      const id = bookToResume(engine);
      if (id) void engine.open(id, true);
      return;
    }
    case "toggle":
      if (engine.getMain().activeBookId) engine.toggle();
      else perform(engine, { kind: "resume" }, navigation);
      return;
    case "pause":
      engine.pause();
      return;
    case "back":
      void engine.skip(-prefs.skipBackSec);
      return;
    case "forward":
      void engine.skip(prefs.skipForwardSec);
      return;
    case "sleep":
      if (action.minutes === "off") engine.setSleepTimer(null);
      else if (action.minutes === "chapter") engine.setSleepTimer({ kind: "chapter" });
      else engine.setSleepTimer({ kind: "minutes", minutes: action.minutes });
      return;
    case "player": {
      const id = bookToResume(engine);
      if (!id) return;
      const go = () => navigation.navigate("AudioPlayer", { bookId: id });
      if (navigation.isReady()) go();
      else setTimeout(() => navigation.isReady() && go(), 800);
      return;
    }
  }
}

/** Runs once the engine has loaded; returns a cancel for unmount. */
function whenReady(engine: AudiobookEngine, run: () => void): () => void {
  if (engine.getMain().ready) {
    run();
    return () => {};
  }
  const off = engine.subscribe("main", () => {
    if (!engine.getMain().ready) return;
    off();
    run();
  });
  return () => {
    off();
  };
}

export function useShortcutLinks(navigation: NavRef) {
  const { engine } = useAudiobookPlayer();
  useEffect(() => {
    let alive = true;
    const cancels: Array<() => void> = [];
    const handle = (url: string | null) => {
      const action = parseShortcutUrl(url);
      if (action && alive) cancels.push(whenReady(engine, () => perform(engine, action, navigation)));
    };
    void Linking.getInitialURL().then(handle).catch(() => {});
    const sub = Linking.addEventListener("url", ({ url }) => handle(url));
    return () => {
      alive = false;
      cancels.forEach((cancel) => cancel());
      sub.remove();
    };
  }, [engine, navigation]);
}
