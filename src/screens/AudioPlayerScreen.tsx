/**
 * The audiobook player, full screen.
 *
 * Shows the CHAPTER on the scrubber (a ten-hour book on one slider makes every
 * drag a five-minute jump) and the whole book underneath as a line of text.
 * Opening it on a book plays that book; closing it with the chevron keeps the
 * sound going — the mini-player takes over.
 */
import { Ionicons } from "@expo/vector-icons";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useReducer, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BookCover } from "../components/BookCover";
import { useDialog } from "../components/DialogProvider";
import { PlayerSheet, SheetRow } from "../components/PlayerSheet";
import { ValueSlider } from "../components/ValueSlider";
import { useAudiobookPlayer, useAudiobookPosition } from "../audio/AudiobookPlayerContext";
import {
  chapterIndexAt,
  formatClock,
  formatSpeed,
  PLAYBACK_SPEEDS,
  SKIP_BACK_SEC,
  SKIP_FORWARD_SEC,
} from "../audio/audiobookModel";
import { useAttachAudio } from "../audio/useAttachAudio";
import { useBookliz } from "../data/BooklizContext";
import { useI18n } from "../i18n/LocalizationContext";
import { RootStackParamList } from "../navigation/types";
import { AppColors, fonts, radii, spacing } from "../theme/theme";
import { useTheme } from "../theme/ThemeContext";
import { formatMinutes } from "../utils/duration";
import { hapticLight } from "../utils/haptics";

const SLEEP_MINUTES = [5, 10, 15, 30, 45, 60] as const;

/** "#abc" / "#aabbcc" plus an alpha byte; anything else falls back so a gradient never gets an invalid colour. */
function withAlpha(color: string | undefined, alphaHex: string, fallback: string): string {
  if (!color) return fallback;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(color);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}${alphaHex}`;
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color}${alphaHex}` : fallback;
}
type SheetName = "chapters" | "speed" | "sleep" | "more" | null;

export function AudioPlayerScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "AudioPlayer">>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { bookId, autoplay = true } = route.params;
  const { colors: c } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const styles = useMemo(() => createStyles(c), [c]);
  const dialog = useDialog();
  const attach = useAttachAudio();
  const { getBook, getAuthor } = useBookliz();
  const player = useAudiobookPlayer();
  const { engine } = player;
  const livePosition = useAudiobookPosition();
  const [scrub, setScrub] = useState<number | null>(null);
  const [sheet, setSheet] = useState<SheetName>(null);
  const [coverAspect, setCoverAspect] = useState<number | null>(null);
  const [, tickSleepLabel] = useReducer((n: number) => n + 1, 0);

  const book = getBook(bookId);
  const audiobook = player.library[bookId];
  const hasAudio = Boolean(audiobook);
  const isActive = player.activeBookId === bookId;

  // Opening the player on a book is asking to hear it.
  useEffect(() => {
    // The active book after a relaunch is remembered but not loaded yet — open() covers both.
    if (player.ready && hasAudio && (player.activeBookId !== bookId || !engine.isLoaded(bookId))) void engine.open(bookId, autoplay);
    // Only on arrival — closing the player from here must not reopen it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.ready, hasAudio, bookId]);

  // The sleep countdown moves even while paused, so it needs its own clock.
  const sleepMinutesActive = player.sleepTimer?.kind === "minutes";
  useEffect(() => {
    if (!sleepMinutesActive) return;
    const id = setInterval(tickSleepLabel, 1000);
    return () => clearInterval(id);
  }, [sleepMinutesActive]);

  if (!book || !audiobook) {
    return (
      <View style={[styles.gone, { paddingTop: insets.top + spacing.xl }]}>
        <Ionicons name="headset-outline" size={40} color={c.muted} />
        <Text style={styles.goneText}>{t("player.gone")}</Text>
        <Pressable accessibilityRole="button" style={styles.goneButton} onPress={() => navigation.goBack()}>
          <Text style={styles.goneButtonText}>{t("common.okay")}</Text>
        </Pressable>
      </View>
    );
  }

  const author = getAuthor(book.authorId)?.name ?? "";
  const total = audiobook.totalSec;
  const sec = scrub ?? (isActive ? livePosition : audiobook.positionSec);
  const chapters = audiobook.chapters;
  const chapterIndex = chapterIndexAt(chapters, sec);
  const chapter = chapterIndex >= 0 ? chapters[chapterIndex] : null;
  const rangeStart = chapter ? chapter.startSec : 0;
  const rangeEnd = chapter ? chapter.endSec : total;
  const chapterLabel = chapter
    ? chapter.title || t("player.chapterN", { n: chapterIndex + 1 })
    : null;
  const finished = sec >= total - 2;
  const pct = Math.min(100, Math.floor((sec / Math.max(1, total)) * 100));
  const leftLabel = formatMinutes((total - sec) / 60 / audiobook.speed);
  const bookLine = finished
    ? t("player.finished")
    : `${t("player.percentDone", { pct })} · ${
        audiobook.speed === 1
          ? t("player.bookLeft", { left: leftLabel })
          : t("player.bookLeftAtSpeed", { left: leftLabel, speed: formatSpeed(audiobook.speed) })
      }`;
  const playing = isActive && player.isPlaying;
  const loading = isActive && player.isLoading;

  const sleepLabel = (() => {
    const timer = player.sleepTimer;
    if (!isActive || !timer) return t("player.sleep");
    if (timer.kind === "chapter") return t("player.sleepChapterEnd");
    return formatClock(Math.max(0, timer.endsAt - Date.now()) / 1000);
  })();

  // Artwork: real proportions once the image tells us, square for audiobook art until then.
  const artMax = Math.min(width - spacing.xl * 2, 320);
  const aspect = coverAspect ?? (book.format === "audiobook" ? 1 : 2 / 3);
  const artWidth = aspect >= 1 ? artMax : artMax * aspect;
  const artHeight = aspect >= 1 ? artMax / aspect : artMax;

  const togglePlay = () => {
    hapticLight();
    if (!isActive) void engine.open(bookId, true);
    else engine.toggle();
  };

  const replaceAudio = async () => {
    setSheet(null);
    const attached = await attach(bookId);
    if (attached) void engine.open(bookId, false);
  };

  const removeAudio = () => {
    setSheet(null);
    dialog.confirm({
      title: t("player.removeConfirmTitle"),
      body: t("player.removeConfirmBody"),
      confirmLabel: t("player.removeConfirm"),
      destructive: true,
      onConfirm: () => {
        engine.removeAudio(bookId);
        navigation.goBack();
      },
    });
  };

  const tint = withAlpha(book.coverGradient?.[0], "55", c.surfaceAlt);

  return (
    <LinearGradient colors={[tint, c.bg, c.bg]} locations={[0, 0.55, 1]} style={styles.root}>
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.xs }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("player.dismiss")}
          hitSlop={10}
          style={styles.headerButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="chevron-down" size={26} color={c.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>{t("player.nowPlaying")}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("player.more")}
          hitSlop={10}
          style={styles.headerButton}
          onPress={() => setSheet("more")}
        >
          <Ionicons name="ellipsis-horizontal" size={22} color={c.ink} />
        </Pressable>
      </View>

      {/* ── Artwork ──────────────────────────────────────────────────────── */}
      <View style={styles.artArea}>
        {book.coverImageUri ? (
          <Image
            source={{ uri: book.coverImageUri }}
            style={[styles.art, { width: artWidth, height: artHeight }]}
            resizeMode="cover"
            onLoad={(event) => {
              const { width: w, height: h } = event.nativeEvent.source;
              if (w > 0 && h > 0) setCoverAspect(w / h);
            }}
          />
        ) : (
          <BookCover book={book} size="lg" hideProgress />
        )}
      </View>

      {/* ── Title + chapter ──────────────────────────────────────────────── */}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {book.title}
        </Text>
        {author ? (
          <Text style={styles.author} numberOfLines={1}>
            {author}
          </Text>
        ) : null}
        {chapterLabel ? (
          <Pressable accessibilityRole="button" style={styles.chapterPill} onPress={() => setSheet("chapters")}>
            <Ionicons name="list" size={14} color={c.tealDark} />
            <Text style={styles.chapterText} numberOfLines={1}>
              {chapterLabel}
            </Text>
            <Text style={styles.chapterCount}>
              {chapterIndex + 1}/{chapters.length}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* ── Scrubber ─────────────────────────────────────────────────────── */}
      <View style={styles.scrubber}>
        <ValueSlider
          value={Math.round(sec)}
          min={Math.floor(rangeStart)}
          max={Math.max(Math.floor(rangeStart) + 1, Math.ceil(rangeEnd))}
          onChange={setScrub}
          onSettle={(value) => {
            void engine.seekTo(value).finally(() => setScrub(null));
          }}
          accessibilityLabel={chapterLabel ?? book.title}
        />
        <View style={styles.times}>
          <Text style={styles.time}>{formatClock(sec - rangeStart)}</Text>
          <Text style={styles.time}>-{formatClock(rangeEnd - sec)}</Text>
        </View>
      </View>

      {/* ── Transport ────────────────────────────────────────────────────── */}
      <View style={styles.controls}>
        <ControlButton
          icon="play-skip-back"
          label={t("player.previousChapter")}
          hidden={!chapters.length}
          onPress={() => engine.previousChapter()}
          c={c}
        />
        <SkipButton seconds={SKIP_BACK_SEC} back label={t("player.skipBack", { n: SKIP_BACK_SEC })} onPress={() => void engine.skip(-SKIP_BACK_SEC)} c={c} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={playing ? t("player.pause") : t("player.play")}
          style={({ pressed }) => [styles.playButton, pressed && { transform: [{ scale: 0.96 }] }]}
          onPress={togglePlay}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Ionicons name={playing ? "pause" : "play"} size={36} color="#fff" style={playing ? undefined : styles.playIconNudge} />
          )}
        </Pressable>
        <SkipButton seconds={SKIP_FORWARD_SEC} label={t("player.skipForward", { n: SKIP_FORWARD_SEC })} onPress={() => void engine.skip(SKIP_FORWARD_SEC)} c={c} />
        <ControlButton
          icon="play-skip-forward"
          label={t("player.nextChapter")}
          hidden={!chapters.length || chapterIndex >= chapters.length - 1}
          onPress={() => engine.nextChapter()}
          c={c}
        />
      </View>

      <Text style={styles.bookLine}>{bookLine}</Text>

      {isActive && player.loadError ? (
        <Pressable accessibilityRole="button" style={styles.errorBanner} onPress={() => void replaceAudio()}>
          <Ionicons name="alert-circle" size={18} color={c.danger} />
          <View style={{ flex: 1 }}>
            <Text style={styles.errorTitle}>{t("player.loadErrorTitle")}</Text>
            <Text style={styles.errorBody}>{t("player.loadErrorBody")}</Text>
          </View>
          <Text style={styles.errorAction}>{t("player.chooseAgain")}</Text>
        </Pressable>
      ) : null}

      {/* ── Chips ────────────────────────────────────────────────────────── */}
      <View style={[styles.chips, { paddingBottom: insets.bottom + spacing.md }]}>
        <Chip icon="speedometer-outline" label={formatSpeed(audiobook.speed)} onPress={() => setSheet("speed")} c={c} accessibilityLabel={t("player.speed")} />
        <Chip
          icon={player.sleepTimer && isActive ? "moon" : "moon-outline"}
          label={sleepLabel}
          active={Boolean(player.sleepTimer && isActive)}
          onPress={() => setSheet("sleep")}
          c={c}
          accessibilityLabel={t("player.sleep")}
        />
        {chapters.length ? (
          <Chip icon="list-outline" label={t("player.chapters")} onPress={() => setSheet("chapters")} c={c} />
        ) : null}
      </View>

      {/* ── Sheets ───────────────────────────────────────────────────────── */}
      <PlayerSheet open={sheet === "chapters"} title={t("player.chapters")} onClose={() => setSheet(null)}>
        {chapters.map((ch, i) => (
          <SheetRow
            key={`${i}-${ch.startSec}`}
            label={ch.title || t("player.chapterN", { n: i + 1 })}
            detail={formatClock(ch.endSec - ch.startSec)}
            selected={i === chapterIndex}
            onPress={() => {
              setSheet(null);
              engine.jumpToChapter(i);
            }}
          />
        ))}
      </PlayerSheet>

      <PlayerSheet open={sheet === "speed"} title={t("player.speed")} onClose={() => setSheet(null)}>
        {PLAYBACK_SPEEDS.map((speed) => (
          <SheetRow
            key={speed}
            label={formatSpeed(speed)}
            selected={Math.abs(speed - audiobook.speed) < 0.01}
            onPress={() => {
              setSheet(null);
              engine.setSpeed(speed);
            }}
          />
        ))}
      </PlayerSheet>

      <PlayerSheet open={sheet === "sleep"} title={t("player.sleep")} onClose={() => setSheet(null)}>
        <SheetRow
          label={t("player.sleepOff")}
          selected={!player.sleepTimer}
          onPress={() => {
            setSheet(null);
            engine.setSleepTimer(null);
          }}
        />
        {SLEEP_MINUTES.map((minutes) => (
          <SheetRow
            key={minutes}
            label={t("player.sleepMinutes", { n: minutes })}
            selected={player.sleepTimer?.kind === "minutes" && player.sleepTimer.minutes === minutes}
            onPress={() => {
              setSheet(null);
              engine.setSleepTimer({ kind: "minutes", minutes });
            }}
          />
        ))}
        {chapters.length ? (
          <SheetRow
            label={t("player.sleepChapterEnd")}
            selected={player.sleepTimer?.kind === "chapter"}
            onPress={() => {
              setSheet(null);
              engine.setSleepTimer({ kind: "chapter" });
            }}
          />
        ) : null}
      </PlayerSheet>

      <PlayerSheet open={sheet === "more"} onClose={() => setSheet(null)}>
        <Text style={styles.sheetHint}>{t("player.autoLogged")}</Text>
        <SheetRow
          icon="create-outline"
          label={t("player.logManually")}
          onPress={() => {
            setSheet(null);
            navigation.navigate("AddReadingSession", { bookId });
          }}
        />
        <SheetRow icon="swap-horizontal" label={t("player.replaceAudio")} onPress={() => void replaceAudio()} />
        <SheetRow
          icon="stop-circle-outline"
          label={t("player.stop")}
          onPress={() => {
            setSheet(null);
            engine.close();
            navigation.goBack();
          }}
        />
        <SheetRow icon="trash-outline" destructive label={t("player.removeAudio")} onPress={removeAudio} />
      </PlayerSheet>
    </LinearGradient>
  );
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

function ControlButton({ icon, label, hidden, onPress, c }: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  hidden?: boolean;
  onPress: () => void;
  c: AppColors;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={hidden}
      hitSlop={8}
      style={[controlStyles.small, hidden && { opacity: 0 }]}
      onPress={() => {
        hapticLight();
        onPress();
      }}
    >
      <Ionicons name={icon} size={24} color={c.ink} />
    </Pressable>
  );
}

function SkipButton({ seconds, back, label, onPress, c }: { seconds: number; back?: boolean; label: string; onPress: () => void; c: AppColors }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={controlStyles.skip}
      onPress={() => {
        hapticLight();
        onPress();
      }}
    >
      <Ionicons name="refresh-outline" size={42} color={c.ink} style={back ? { transform: [{ scaleX: -1 }] } : undefined} />
      <Text style={[controlStyles.skipText, { color: c.ink }]}>{seconds}</Text>
    </Pressable>
  );
}

function Chip({ icon, label, active, onPress, c, accessibilityLabel }: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  active?: boolean;
  onPress: () => void;
  c: AppColors;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        controlStyles.chip,
        { backgroundColor: active ? c.teal + "22" : c.surface, borderColor: active ? c.teal : c.border },
        pressed && { opacity: 0.7 },
      ]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={16} color={active ? c.tealDark : c.ink} />
      <Text style={[controlStyles.chipText, { color: active ? c.tealDark : c.ink }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const controlStyles = StyleSheet.create({
  small: { alignItems: "center", height: 48, justifyContent: "center", width: 44 },
  skip: { alignItems: "center", height: 56, justifyContent: "center", width: 56 },
  skipText: { fontFamily: fonts.body, fontSize: 12, fontWeight: "900", position: "absolute", top: 21 },
  chip: {
    alignItems: "center",
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    maxWidth: 170,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  chipText: { fontFamily: fonts.body, fontSize: 13, fontVariant: ["tabular-nums"], fontWeight: "900" },
});

function createStyles(c: AppColors) {
  return StyleSheet.create({
    root: { flex: 1 },
    header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: spacing.md },
    headerButton: { alignItems: "center", height: 40, justifyContent: "center", width: 40 },
    headerTitle: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 0.8,
      textTransform: "uppercase",
    },
    artArea: { alignItems: "center", flex: 1, justifyContent: "center", minHeight: 180, paddingVertical: spacing.md },
    art: {
      borderRadius: radii.md,
      backgroundColor: c.surfaceAlt,
    },
    info: { alignItems: "center", gap: 4, paddingHorizontal: spacing.lg },
    title: { color: c.ink, fontFamily: fonts.display, fontSize: 22, fontWeight: "800", textAlign: "center" },
    author: { color: c.muted, fontFamily: fonts.body, fontSize: 15, fontWeight: "700" },
    chapterPill: {
      alignItems: "center",
      backgroundColor: c.teal + "18",
      borderRadius: radii.pill,
      flexDirection: "row",
      gap: 6,
      marginTop: spacing.sm,
      maxWidth: "100%",
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    chapterText: { color: c.tealDark, flexShrink: 1, fontFamily: fonts.body, fontSize: 13, fontWeight: "900" },
    chapterCount: { color: c.muted, fontFamily: fonts.body, fontSize: 12, fontVariant: ["tabular-nums"], fontWeight: "800" },
    scrubber: { marginTop: spacing.md, paddingHorizontal: spacing.lg },
    times: { flexDirection: "row", justifyContent: "space-between", marginTop: -4 },
    time: { color: c.muted, fontFamily: fonts.body, fontSize: 12, fontVariant: ["tabular-nums"], fontWeight: "800" },
    controls: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-evenly",
      marginTop: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    playButton: {
      alignItems: "center",
      backgroundColor: c.teal,
      borderRadius: 40,
      height: 80,
      justifyContent: "center",
      shadowColor: c.teal,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.35,
      shadowRadius: 16,
      width: 80,
    },
    playIconNudge: { marginLeft: 4 },
    bookLine: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: "700",
      marginTop: spacing.sm,
      textAlign: "center",
    },
    errorBanner: {
      alignItems: "center",
      backgroundColor: c.danger + "14",
      borderColor: c.danger + "55",
      borderRadius: radii.sm,
      borderWidth: 1,
      flexDirection: "row",
      gap: spacing.sm,
      marginHorizontal: spacing.md,
      marginTop: spacing.sm,
      padding: spacing.sm,
    },
    errorTitle: { color: c.ink, fontFamily: fonts.body, fontSize: 13, fontWeight: "900" },
    errorBody: { color: c.muted, fontFamily: fonts.bodyRegular, fontSize: 12 },
    errorAction: { color: c.danger, fontFamily: fonts.body, fontSize: 12, fontWeight: "900", maxWidth: 110, textAlign: "right" },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, justifyContent: "center", marginTop: spacing.md, paddingHorizontal: spacing.md },
    sheetHint: { color: c.muted, fontFamily: fonts.bodyRegular, fontSize: 13, paddingBottom: spacing.sm, paddingHorizontal: spacing.sm },
    gone: { alignItems: "center", backgroundColor: c.bg, flex: 1, gap: spacing.md, paddingHorizontal: spacing.lg },
    goneText: { color: c.ink, fontFamily: fonts.body, fontSize: 15, fontWeight: "800", textAlign: "center" },
    goneButton: { backgroundColor: c.teal, borderRadius: radii.pill, paddingHorizontal: spacing.lg, paddingVertical: 10 },
    goneButtonText: { color: "#fff", fontFamily: fonts.body, fontSize: 14, fontWeight: "900" },
  });
}
