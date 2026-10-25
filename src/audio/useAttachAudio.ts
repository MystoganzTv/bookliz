/** Pick files for a book and attach them, turning import failures into a dialog that says what to do. */
import { useCallback } from "react";
import { useDialog } from "../components/DialogProvider";
import { useI18n } from "../i18n/LocalizationContext";
import { AudioImportError, type AudioImportProblem } from "./audioFiles";
import { useAudiobookPlayer } from "./AudiobookPlayerContext";

export function useAttachAudio() {
  const { engine } = useAudiobookPlayer();
  const dialog = useDialog();
  const { t } = useI18n();

  return useCallback(
    async (bookId: string): Promise<boolean> => {
      try {
        return await engine.attach(bookId);
      } catch (error) {
        const problem: AudioImportProblem = error instanceof AudioImportError ? error.problem : "unreadable";
        const fileName = error instanceof AudioImportError ? error.fileName : undefined;
        const copy: Record<AudioImportProblem, [string, string]> = {
          locked: [t("player.errors.lockedTitle"), t("player.errors.lockedBody")],
          unsupported: [t("player.errors.unsupportedTitle"), t("player.errors.unsupportedBody")],
          unreadable: [
            fileName ? t("player.errors.unreadableNamed", { name: fileName }) : t("player.errors.unreadableTitle"),
            t("player.errors.unreadableBody"),
          ],
          space: [t("player.errors.spaceTitle"), t("player.errors.spaceBody")],
        };
        const detail = error instanceof AudioImportError ? error.detail : error instanceof Error ? error.message : undefined;
        dialog.alert(copy[problem][0], detail ? `${copy[problem][1]}\n\n${t("auth.errorDetail", { detail })}` : copy[problem][1]);
        return false;
      }
    },
    [engine, dialog, t]
  );
}
