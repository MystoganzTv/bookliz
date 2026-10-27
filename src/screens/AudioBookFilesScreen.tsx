/**
 * One audiobook opened like a folder: its files in order, the one playing
 * marked, each one a place to start from. The book is still one timeline —
 * starting "Part 07" means seeking to where Part 07 begins.
 */
import { Ionicons } from "@expo/vector-icons";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAudiobookPlayer, useAudiobookPosition } from "../audio/AudiobookPlayerContext";
import { formatClock } from "../audio/audiobookModel";
import { useDialog } from "../components/DialogProvider";
import { MiniCover } from "../components/MiniCover";
import { Screen } from "../components/Screen";
import { useBookliz } from "../data/BooklizContext";
import { useI18n } from "../i18n/LocalizationContext";
import { RootStackParamList } from "../navigation/types";
import { useColors } from "../theme/ThemeContext";
import { AppColors, fonts, radii, spacing } from "../theme/theme";
import { hapticLight, hapticSuccess } from "../utils/haptics";
import { formatListenLength } from "./ManageAudioScreen";

export function AudioBookFilesScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "AudioBookFiles">>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { bookId } = route.params;
  const { t } = useI18n();
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const { getBook, getAuthor } = useBookliz();
  const player = useAudiobookPlayer();
  const { engine } = player;
  const livePosition = useAudiobookPosition();
  const dialog = useDialog();
  const book = getBook(bookId);
  const audiobook = player.library[bookId];
  const active = player.activeBookId === bookId;
  const position = active ? livePosition : audiobook?.positionSec ?? 0;

  useEffect(() => {
    navigation.setOptions({ title: "" });
  }, [navigation]);

  /** Where each file starts on the book's timeline. */
  const starts = useMemo(() => {
    let at = 0;
    return (audiobook?.tracks ?? []).map((track) => {
      const start = at;
      at += track.durationSec;
      return start;
    });
  }, [audiobook?.tracks]);

  if (!book || !audiobook) {
    return (
      <Screen>
        <Text style={styles.missing}>{t("audioLib.noAudio")}</Text>
      </Screen>
    );
  }

  const currentIndex = (() => {
    for (let i = starts.length - 1; i >= 0; i -= 1) if (position >= starts[i]) return i;
    return 0;
  })();
  const pct = audiobook.totalSec > 0 ? Math.min(100, Math.round((position / audiobook.totalSec) * 100)) : 0;

  const playFrom = async (index: number) => {
    hapticLight();
    await engine.open(bookId, false);
    await engine.seekTo(starts[index]);
    engine.play();
  };

  const playOrPause = () => {
    hapticLight();
    if (active && player.isPlaying) engine.pause();
    else void engine.open(bookId, true);
  };

  return (
    <Screen>
      <View style={styles.head}>
        <MiniCover book={book} width={92} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.title} numberOfLines={3}>{book.title}</Text>
          <Text style={styles.sub} numberOfLines={1}>{getAuthor(book.authorId)?.name ?? ""}</Text>
          <Text style={styles.sub}>
            {[formatListenLength(audiobook.totalSec, t), pct > 0 ? t("audioLib.percent", { pct }) : null].filter(Boolean).join(" · ")}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable accessibilityRole="button" style={styles.primary} onPress={playOrPause}>
          <Ionicons name={active && player.isPlaying ? "pause" : "play"} size={18} color="#FFFFFF" />
          <Text style={styles.primaryText}>
            {active && player.isPlaying ? t("audioLib.pause") : pct > 0 && pct < 99 ? t("audioLib.continue") : t("audioLib.play")}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("audioLib.openBook")}
          style={styles.secondary}
          onPress={() => navigation.navigate("BookDetail", { bookId })}
        >
          <Ionicons name="book-outline" size={20} color={c.tealDark} />
        </Pressable>
      </View>

      <Text style={styles.sectionLabel}>
        {audiobook.tracks.length === 1 ? t("audioLib.oneFile") : t("manageAudio.files", { count: audiobook.tracks.length })}
      </Text>
      {audiobook.tracks.map((track, i) => {
        const isCurrent = i === currentIndex && (active || position > 0);
        const done = position >= starts[i] + track.durationSec - 1;
        return (
          <Pressable
            key={`${i}:${track.file}`}
            accessibilityRole="button"
            disabled={track.removed}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
            onPress={() => void playFrom(i)}
          >
            <View style={[styles.index, isCurrent && styles.indexCurrent]}>
              {isCurrent && active && player.isPlaying ? (
                <Ionicons name="volume-high" size={14} color="#FFFFFF" />
              ) : (
                <Text style={[styles.indexText, isCurrent && { color: "#FFFFFF" }]}>{i + 1}</Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={[styles.rowTitle, isCurrent && { color: c.tealDark }, (track.removed || (done && !isCurrent)) && { color: c.muted }]}
                numberOfLines={2}
              >
                {track.title || track.file}
              </Text>
              <Text style={styles.rowSub}>
                {track.removed ? t("bookDetail.audioFileDeleted") : formatClock(track.durationSec)}
              </Text>
            </View>
            {done && !isCurrent && !track.removed ? <Ionicons name="checkmark-circle" size={18} color={c.green} /> : null}
          </Pressable>
        );
      })}

      {/* Wrong book, or done with it: the way out lives here too, not only behind a long-press. */}
      <View style={styles.manage}>
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.manageRow, pressed && { opacity: 0.6 }]}
          onPress={() =>
            dialog.confirm({
              title: t("fileManager.detachTitle"),
              body: t("fileManager.detachBody"),
              confirmLabel: t("fileManager.detachConfirm"),
              onConfirm: () => {
                if (engine.detachToInbox(bookId)) hapticSuccess();
                navigation.goBack();
              },
            })
          }
        >
          <Ionicons name="return-down-back-outline" size={18} color={c.ink} />
          <View style={{ flex: 1 }}>
            <Text style={styles.manageText}>{t("fileManager.detach")}</Text>
            <Text style={styles.rowSub}>{t("fileManager.detachHint")}</Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.manageRow, pressed && { opacity: 0.6 }]}
          onPress={() =>
            dialog.confirm({
              title: t("player.removeConfirmTitle"),
              body: t("player.removeConfirmBody"),
              confirmLabel: t("player.removeConfirm"),
              destructive: true,
              onConfirm: () => {
                engine.removeAudio(bookId);
                hapticSuccess();
                navigation.goBack();
              },
            })
          }
        >
          <Ionicons name="trash-outline" size={18} color={c.danger} />
          <Text style={[styles.manageText, { color: c.danger }]}>{t("player.removeAudio")}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    missing: { color: c.muted, fontFamily: fonts.body, fontSize: 15, marginTop: spacing.lg, textAlign: "center" },
    head: { alignItems: "center", flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },
    title: { color: c.ink, fontFamily: fonts.display, fontSize: 22, fontWeight: "900", lineHeight: 27 },
    sub: { color: c.muted, fontFamily: fonts.body, fontSize: 14, fontWeight: "600" },
    actions: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
    primary: {
      alignItems: "center", backgroundColor: c.teal, borderRadius: radii.pill, flex: 1,
      flexDirection: "row", gap: 8, justifyContent: "center", minHeight: 48,
    },
    primaryText: { color: "#FFFFFF", fontFamily: fonts.body, fontSize: 16, fontWeight: "900" },
    secondary: {
      alignItems: "center", backgroundColor: c.surface, borderColor: c.border, borderRadius: 24,
      borderWidth: 1, height: 48, justifyContent: "center", width: 48,
    },
    sectionLabel: {
      color: c.muted, fontFamily: fonts.body, fontSize: 12, fontWeight: "900", letterSpacing: 0.8,
      marginBottom: spacing.xs, textTransform: "uppercase",
    },
    row: {
      alignItems: "center", borderBottomColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row", gap: spacing.md, paddingVertical: 12,
    },
    index: {
      alignItems: "center", backgroundColor: c.surfaceAlt, borderRadius: 15, height: 30,
      justifyContent: "center", width: 30,
    },
    indexCurrent: { backgroundColor: c.teal },
    indexText: { color: c.muted, fontFamily: fonts.body, fontSize: 12, fontWeight: "900" },
    rowTitle: { color: c.ink, fontFamily: fonts.body, fontSize: 15, fontWeight: "800" },
    rowSub: { color: c.muted, fontFamily: fonts.body, fontSize: 12, fontWeight: "600", marginTop: 2 },
    manage: { gap: spacing.xs, marginTop: spacing.xl },
    manageRow: {
      alignItems: "center", backgroundColor: c.surface, borderColor: c.border, borderRadius: radii.md,
      borderWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: spacing.md, minHeight: 52,
      paddingHorizontal: spacing.md, paddingVertical: 10,
    },
    manageText: { color: c.ink, fontFamily: fonts.body, fontSize: 15, fontWeight: "800" },
  });
}
