/**
 * The audiobook that is playing, one tap from anywhere: a bar above the tab
 * bar with play/pause, and the full player behind a tap.
 *
 * Shown on the tabs and on a book's page — not over forms, where it would sit
 * on top of a Save button. Swipe it sideways or down (or tap ×) to stop
 * listening and put it away; the position is kept.
 */
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useRef } from "react";
import { ActivityIndicator, Animated, Image, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAudiobookPlayer, useAudiobookPosition } from "../audio/AudiobookPlayerContext";
import { chapterIndexAt, formatClock } from "../audio/audiobookModel";
import { useBookliz } from "../data/BooklizContext";
import { useReadingTimer } from "../data/ReadingTimerContext";
import { useI18n } from "../i18n/LocalizationContext";
import { RootStackParamList } from "../navigation/types";
import { AppColors, fonts, radii, spacing } from "../theme/theme";
import { useColors } from "../theme/ThemeContext";
import { hapticLight } from "../utils/haptics";

const TAB_ROUTES = new Set(["Home", "Library", "Audio", "Profile"]);
const SHOWN_ON = new Set([...TAB_ROUTES, "BookDetail"]);
const TAB_BAR_HEIGHT = 88;
/** Height of the reading-timer bar plus a gap, so the two stack instead of overlapping. */
const TIMER_BAR_SPACE = 60;
/** How far (px) or how fast (px/ms) a swipe has to go before it puts the bar away. */
const DISMISS_DISTANCE = 90;
const DISMISS_VELOCITY = 0.6;

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

  // Swipe to put away: sideways or down. Taps still reach the buttons —
  // the pan only takes over once the finger has clearly moved.
  const drag = useRef(new Animated.ValueXY()).current;
  const closeRef = useRef(() => player.engine.close());
  closeRef.current = () => player.engine.close();
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 || g.dy > 8,
        onPanResponderMove: (_, g) => drag.setValue({ x: g.dx, y: Math.max(0, g.dy) }),
        onPanResponderRelease: (_, g) => {
          const sideways = Math.abs(g.dx) >= Math.abs(g.dy);
          const gone = sideways
            ? Math.abs(g.dx) > DISMISS_DISTANCE || Math.abs(g.vx) > DISMISS_VELOCITY
            : g.dy > DISMISS_DISTANCE * 0.6 || g.vy > DISMISS_VELOCITY;
          if (!gone) {
            Animated.spring(drag, { toValue: { x: 0, y: 0 }, useNativeDriver: true, friction: 7 }).start();
            return;
          }
          hapticLight();
          const to = sideways ? { x: Math.sign(g.dx || 1) * 500, y: 0 } : { x: g.dx, y: 160 };
          Animated.timing(drag, { toValue: to, duration: 180, useNativeDriver: true }).start(() => closeRef.current());
        },
        onPanResponderTerminate: () =>
          Animated.spring(drag, { toValue: { x: 0, y: 0 }, useNativeDriver: true, friction: 7 }).start(),
      }),
    [drag]
  );
  // A book starting (again) brings the bar back in place.
  useEffect(() => {
    drag.setValue({ x: 0, y: 0 });
  }, [bookId, drag]);

  if (!player.ready || !book || !audiobook || !routeName || !SHOWN_ON.has(routeName)) return null;

  const onTabs = TAB_ROUTES.has(routeName);
  const bottom = (onTabs ? TAB_BAR_HEIGHT : spacing.sm) + insets.bottom + (onTabs && timerRunning ? TIMER_BAR_SPACE : 0);
  const chapterIndex = chapterIndexAt(audiobook.chapters, position);
  const chapter = chapterIndex >= 0 ? audiobook.chapters[chapterIndex] : null;
  const subtitle = chapter
    ? chapter.title || t("player.chapterN", { n: chapterIndex + 1 })
    : `${formatClock(position)} / ${formatClock(audiobook.totalSec)}`;
  const progress = Math.min(1, Math.max(0, position / Math.max(1, audiobook.totalSec)));

  const opacity = Animated.add(drag.x.interpolate({ inputRange: [-240, 0, 240], outputRange: [-1, 0, -1], extrapolate: "clamp" }), 1);
  const fade = Animated.add(opacity, drag.y.interpolate({ inputRange: [0, 140], outputRange: [0, -1], extrapolate: "clamp" }));

  return (
    <Animated.View
      {...pan.panHandlers}
      style={[styles.bar, { bottom, opacity: fade, transform: [{ translateX: drag.x }, { translateY: drag.y }] }]}
    >
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
        style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}
        onPress={() => {
          hapticLight();
          player.engine.toggle();
        }}
      >
        {player.isLoading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Ionicons name={player.isPlaying ? "pause" : "play"} size={18} color="#fff" style={player.isPlaying ? undefined : { marginLeft: 2 }} />
        )}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("player.stop")}
        hitSlop={10}
        style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
        onPress={() => player.engine.close()}
      >
        <Ionicons name="close" size={18} color={c.muted} />
      </Pressable>
      {/* Progress along the bottom edge, inside the rounded corners */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
    </Animated.View>
  );
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    bar: {
      alignItems: "center",
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      elevation: 10,
      flexDirection: "row",
      gap: 10,
      left: spacing.md,
      overflow: "hidden",
      paddingBottom: 9,
      paddingLeft: 8,
      paddingRight: 6,
      paddingTop: 8,
      position: "absolute",
      right: spacing.md,
      shadowColor: c.shadow,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.22,
      shadowRadius: 16,
      zIndex: 998,
    },
    body: { alignItems: "center", flex: 1, flexDirection: "row", gap: 12 },
    art: { borderRadius: 8, height: 44, width: 44 },
    artFallback: { alignItems: "center", backgroundColor: c.teal, justifyContent: "center" },
    text: { flex: 1, gap: 1 },
    title: { color: c.ink, fontFamily: fonts.body, fontSize: 15, fontWeight: "800" },
    subtitle: { color: c.muted, fontFamily: fonts.body, fontSize: 12, fontWeight: "600" },
    playButton: { alignItems: "center", backgroundColor: c.teal, borderRadius: 20, height: 40, justifyContent: "center", width: 40 },
    closeButton: { alignItems: "center", height: 36, justifyContent: "center", width: 30 },
    pressed: { opacity: 0.7 },
    progressTrack: { backgroundColor: c.border, bottom: 0, height: 3, left: 0, position: "absolute", right: 0 },
    progressFill: { backgroundColor: c.teal, height: 3 },
  });
}
