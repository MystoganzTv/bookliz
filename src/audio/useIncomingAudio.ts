/**
 * Audio handed to Bookliz from outside — "Open in Bookliz" in Files, AirDrop,
 * the share sheet. iOS opens the app with a file:// URL per file (copied into
 * Documents/Inbox). Files that arrive close together are one audiobook in
 * parts, so they are gathered for a moment and imported as one inbox item.
 */
import type { NavigationContainerRefWithCurrent } from "@react-navigation/native";
import { File } from "expo-file-system";
import { useEffect } from "react";
import { Linking } from "react-native";
import { useDialog } from "../components/DialogProvider";
import { useI18n } from "../i18n/LocalizationContext";
import type { RootStackParamList } from "../navigation/types";
import { useAudiobookPlayer } from "./AudiobookPlayerContext";
import { AudioImportError } from "./audioFiles";
import { pickedFromFileUris } from "./audioFiles";

/** AirDrop of a folder of MP3s delivers them one by one, a few hundred ms apart. */
const GATHER_MS = 1500;

export const isIncomingFileUrl = (url: string | null | undefined): url is string =>
  Boolean(url && /^file:\/\//i.test(url));

export function useIncomingAudio(navigation: NavigationContainerRefWithCurrent<RootStackParamList>) {
  const { engine } = useAudiobookPlayer();
  const dialog = useDialog();
  const { t } = useI18n();

  useEffect(() => {
    let batch: string[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    let alive = true;

    const flush = async () => {
      timer = null;
      const uris = batch;
      batch = [];
      if (!uris.length || !alive) return;
      const picked = pickedFromFileUris(uris);
      if (!picked.length) return;
      try {
        await engine.importIntoInbox(picked);
        if (navigation.isReady()) navigation.navigate("ManageAudio");
      } catch (error) {
        // What iOS copied into Documents/Inbox must not pile up there.
        for (const p of picked) {
          try {
            const file = new File(p.uri);
            if (file.exists) file.delete();
          } catch {
            // already gone
          }
        }
        const problem = error instanceof AudioImportError ? error.problem : "unreadable";
        const key = problem === "locked" ? "locked" : problem === "space" ? "space" : problem === "unsupported" ? "unsupported" : "unreadable";
        dialog.alert(t(`player.errors.${key}Title`), t(`player.errors.${key}Body`));
      }
    };

    const receive = (url: string | null) => {
      if (!isIncomingFileUrl(url)) return;
      batch.push(url);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void flush(), GATHER_MS);
    };

    void Linking.getInitialURL().then(receive).catch(() => {});
    const sub = Linking.addEventListener("url", ({ url }) => receive(url));
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      sub.remove();
    };
  }, [dialog, engine, navigation, t]);
}
