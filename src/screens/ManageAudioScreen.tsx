/**
 * Settings > Storage > Manage files — what the imported audiobooks take up
 * on this iPhone, and the two ways to give space back: delete what has
 * already been listened to, or remove a book's audio altogether. Progress and
 * sessions stay either way (they live with the book, not with the file).
 */
import { Paths } from "expo-file-system";
import { useMemo, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { useAudiobookPlayer } from "../audio/AudiobookPlayerContext";
import { audioFolderSize } from "../audio/audioFiles";
import { formatBytes } from "../audio/audiobookModel";
import { useDialog } from "../components/DialogProvider";
import { Screen } from "../components/Screen";
import { SettingsGroup, SettingsRow } from "../components/settings/SettingsList";
import { useBookliz } from "../data/BooklizContext";
import { useI18n } from "../i18n/LocalizationContext";
import { useColors } from "../theme/ThemeContext";
import { fonts, spacing } from "../theme/theme";
import { hapticSuccess } from "../utils/haptics";

export function ManageAudioScreen() {
  const { t } = useI18n();
  const c = useColors();
  const dialog = useDialog();
  const { getBook } = useBookliz();
  const player = useAudiobookPlayer();
  const { engine } = player;
  // Sizes are read from disk; bump to re-read after a delete.
  const [version, setVersion] = useState(0);

  const rows = useMemo(() => {
    void version;
    return Object.values(player.library)
      .map((audiobook) => {
        const book = getBook(audiobook.bookId);
        const files = audiobook.tracks.filter((track) => !track.removed).length;
        return {
          bookId: audiobook.bookId,
          title: book?.title ?? "—",
          bytes: audioFolderSize(audiobook.folder),
          files,
          listened: engine.listenedFiles(audiobook.bookId),
        };
      })
      .sort((a, b) => b.bytes - a.bytes);
  }, [engine, getBook, player.library, version]);

  const total = rows.reduce((sum, row) => sum + row.bytes, 0);
  let free = 0;
  try {
    free = Paths.availableDiskSpace;
  } catch {
    free = 0;
  }

  const removeListened = (bookId: string, count: number, bytes: number) =>
    dialog.confirm({
      title: t("player.deleteListenedTitle"),
      body: t("player.deleteListenedBody", { count, size: formatBytes(bytes) }),
      confirmLabel: t("player.deleteListenedConfirm"),
      destructive: true,
      onConfirm: () => {
        engine.removeListenedFiles(bookId);
        hapticSuccess();
        setVersion((v) => v + 1);
      },
    });

  const removeAudio = (bookId: string) =>
    dialog.confirm({
      title: t("player.removeConfirmTitle"),
      body: t("player.removeConfirmBody"),
      confirmLabel: t("player.removeConfirm"),
      destructive: true,
      onConfirm: () => {
        engine.removeAudio(bookId);
        hapticSuccess();
        setVersion((v) => v + 1);
      },
    });

  return (
    <Screen>
      <SettingsGroup header={t("manageAudio.spaceHeader")}>
        <SettingsRow title={t("manageAudio.audiobooks")} value={rows.length ? formatBytes(total) : "—"} />
        {free > 0 ? <SettingsRow title={t("manageAudio.free")} value={formatBytes(free)} /> : null}
      </SettingsGroup>

      {rows.length === 0 ? (
        <Text style={[styles.empty, { color: c.muted }]}>{t("manageAudio.empty")}</Text>
      ) : (
        rows.map((row) => (
          <SettingsGroup key={row.bookId} header={row.title}>
            <SettingsRow
              title={t("manageAudio.size")}
              value={`${formatBytes(row.bytes)} · ${t("manageAudio.files", { count: row.files })}`}
            />
            {row.listened.count > 0 ? (
              <SettingsRow
                title={t("player.deleteListened")}
                subtitle={t("player.deleteListenedDetail", { count: row.listened.count, size: formatBytes(row.listened.bytes) })}
                chevron={false}
                onPress={() => removeListened(row.bookId, row.listened.count, row.listened.bytes)}
              />
            ) : null}
            <SettingsRow
              title={t("player.removeAudio")}
              destructive
              chevron={false}
              onPress={() => removeAudio(row.bookId)}
            />
          </SettingsGroup>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: {
    fontFamily: fonts.bodyRegular,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: spacing.md,
    textAlign: "center",
  },
});
