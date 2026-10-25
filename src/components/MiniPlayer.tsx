/**
 * The audiobook that is playing, one tap from anywhere: a bar above the tab
 * bar with play/pause, and the full player behind a tap.
 *
 * Shown on the tabs and on a book's page — not over forms, where it would sit
 * on top of a Save button.
 */
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMemo } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAudiobookPlayer, useAudiobookPosition } from "../audio/AudiobookPlayerContext";
import { chapterIndexAt, formatClock } from "../audio/audiobookModel";
import { useBookliz } from "../data/BooklizContext";
import { useReadingTimer } from "../data/ReadingTimerContext";
import { useI18n } from "../i18n/LocalizationContext";
import { RootStackParamList } from "../navigation/types";
import { AppColors, fonts, spacing } from "../theme/theme";
import { useColors } from "../theme/ThemeContext";
import { hapticLight } from "../utils/haptics";

const TAB_ROUTES = new Set(["Home", "Library", "Audio", "Profile"]);
const SHOWN_ON = new Set([...TAB_ROUTES, "BookDetail"]);
const TAB_BAR_HEIGHT = 88;
/** Height of the reading-timer bar plus a gap, so the two stack instead of overlapping. */
const TIMER_BAR_SPACE = 60;

export function MiniPlayer({ routeName }: { routeName: string | undefined }) {
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { getBook } = useBookliz();
  const { isRunning: timerRunning } = useReadingTimer();
  const player = useAudiobookPlayer();
  const position = useAudiobookPosition();

  const bookId = player.activeBookId;
  const book = bookId ? getBook(bookId) : undefined;
  const audiobook = bookId ? player.library[bookId] : undefined;
  if (!player.ready || !book || !audiobook || !routeName || !SHOWN_ON.has(routeName)) return null;

  const onTabs = TAB_ROUTES.has(routeName);
  const bottom = (onTabs ? TAB_BAR_HEIGHT : spacing.sm) + insets.bottom + (onTabs && timerRunning ? TIMER_BAR_SPACE : 0);
  const chapterIndex = chapterIndexAt(audiobook.chapters, position);
  const chapter = chapterIndex >= 0 ? audiobook.chapters[chapterIndex] : null;
  const subtitle = chapter
    ? chapter.title || t("player.chapterN", { n: chapterIndex + 1 })
    : `${formatClock(position)} / ${formatClock(audiobook.totalSec)}`;
  const progress = Math.min(1, Math.max(0, position / Math.max(1, audiobook.totalSec)));

  return (
    <View style={[styles.bar, { bottom }]}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t("player.nowPlaying")}: ${book.title}`}
        style={styles.body}
        onPress={() => navigation.navigate("AudioPlayer", { bookId: book.id, autoplay: false })}
      >
        {book.coverImageUri ? (
          <Image source={{ uri: book.coverImageUri }} style={styles.art} />
        ) : (
          <View style={[styles.art, styles.artFallback]}>
            <Ionicons name="headset" size={18} color="#fff" />
          </View>
        )}
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>
            {book.title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={player.isPlaying ? t("player.pause") : t("player.play")}
        hitSlop={8}
        style={styles.playButton}
        onPress={() => {
          hapticLight();
          player.engine.toggle();
        }}
      >
        {player.isLoading ? (
          <ActivityIndicator color={c.navy} size="small" />
        ) : (
          <Ionicons name={player.isPlaying ? "pause" : "play"} size={20} color={c.navy} style={player.isPlaying ? undefined : { marginLeft: 2 }} />
        )}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("player.stop")}
        hitSlop={8}
        style={styles.closeButton}
        onPress={() => player.engine.close()}
      >
        <Ionicons name="close" size={18} color="rgba(255,255,255,0.6)" />
      </Pressable>
    </View>
  );
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    bar: {
      alignItems: "center",
      backgroundColor: c.navy,
      borderRadius: 14,
      elevation: 12,
      flexDirection: "row",
      gap: 8,
      left: spacing.md,
      overflow: "hidden",
      paddingHorizontal: 10,
      paddingVertical: 8,
      position: "absolute",
      right: spacing.md,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 12,
      zIndex: 998,
    },
    progressTrack: { backgroundColor: "rgba(255,255,255,0.12)", height: 2, left: 0, position: "absolute", right: 0, top: 0 },
    progressFill: { backgroundColor: c.teal, height: 2 },
    body: { alignItems: "center", flex: 1, flexDirection: "row", gap: 10 },
    art: { borderRadius: 6, height: 38, width: 38 },
    artFallback: { alignItems: "center", backgroundColor: c.teal, justifyContent: "center" },
    text: { flex: 1 },
    title: { color: "#fff", fontFamily: fonts.body, fontSize: 14, fontWeight: "900" },
    subtitle: { color: "rgba(255,255,255,0.6)", fontFamily: fonts.body, fontSize: 12, fontWeight: "700" },
    playButton: { alignItems: "center", backgroundColor: c.gold, borderRadius: 18, height: 36, justifyContent: "center", width: 36 },
    closeButton: { alignItems: "center", height: 32, justifyContent: "center", width: 28 },
  });
}
