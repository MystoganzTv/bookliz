/**
 * The audiobook player, full screen.
 *
 * Always dark, whatever the app theme: the cover is the light source here, the
 * way a dimmed room is for a book read in bed. Layout, top to bottom: the
 * cover on its own blurred backdrop; the CHAPTER, with « » to step between
 * chapters; a scrubber over that chapter (a ten-hour book on one slider makes
 * every drag a five-minute jump) with the book's percentage in the middle;
 * −30 / play / +30; and a row of round controls.
 *
 * Opening it on a book plays that book; dismissing it keeps the sound going —
 * the mini-player takes over.
 */
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AirPlayButton, isAirPlayAvailable } from "../../modules/airplay-button";
import { BookCover } from "../components/BookCover";
import { useDialog } from "../components/DialogProvider";
import { PlayerSheet, SheetRow } from "../components/PlayerSheet";
import { ValueSlider } from "../components/ValueSlider";
import { useAudiobookPlayer, useAudiobookPosition } from "../audio/AudiobookPlayerContext";
import {
  chapterIndexAt,
  formatClock,
  isRemovedAt,
  formatSpeed,
  PLAYBACK_SPEEDS,
  formatBytes,
  SKIP_BACK_SEC,
  SKIP_FORWARD_SEC,
} from "../audio/audiobookModel";
import { useAttachAudio } from "../audio/useAttachAudio";
import { useBookliz } from "../data/BooklizContext";
import { useI18n } from "../i18n/LocalizationContext";
import { RootStackParamList } from "../navigation/types";
import { AppColors, darkColors, fonts, radii, spacing } from "../theme/theme";
import { hapticLight, hapticSuccess } from "../utils/haptics";

const SLEEP_MINUTES = [5, 10, 15, 30, 45, 60] as const;
type SheetName = "list" | "speed" | "sleep" | "more" | null;

/** The player's own palette: the app's dark theme, a shade deeper behind the cover. */
const P: AppColors = { ...darkColors, bg: "#1C1D22", surface: "#2A2B31", surfaceAlt: "#33343B" };

export function AudioPlayerScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "AudioPlayer">>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { bookId, autoplay = true } = route.params;
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const styles = useMemo(() => createStyles(P), []);
  const dialog = useDialog();
  const attach = useAttachAudio();
  const { getBook, getAuthor } = useBookliz();
  const player = useAudiobookPlayer();
  const { engine } = player;
  const livePosition = useAudiobookPosition();
  const [scrub, setScrub] = useState<number | null>(null);
  const [sheet, setSheet] = useState<SheetName>(null);
  const [listTab, setListTab] = useState<"chapters" | "bookmarks">("chapters");
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, tickSleepLabel] = useReducer((n: number) => n + 1, 0);

  const book = getBook(bookId);
  const audiobook = player.library[bookId];
  const hasAudio = Boolean(audiobook);
  const isActive = player.activeBookId === bookId;

  // Opening the player on a book is asking to hear it. The active book after a
  // relaunch is remembered but not loaded yet — open() covers both.
  useEffect(() => {
    if (player.ready && hasAudio && (player.activeBookId !== bookId || !engine.isLoaded(bookId))) {
      void engine.open(bookId, autoplay);
    }
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

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  if (!book || !audiobook) {
    return (
      <View style={[styles.gone, { paddingTop: insets.top + spacing.xl }]}>
        <Ionicons name="headset-outline" size={40} color={P.muted} />
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
  const bookmarks = audiobook.bookmarks ?? [];
  const chapterIndex = chapterIndexAt(chapters, sec);
  const chapter = chapterIndex >= 0 ? chapters[chapterIndex] : null;
  const rangeStart = chapter ? chapter.startSec : 0;
  const rangeEnd = chapter ? chapter.endSec : total;
  const heading = chapter ? chapter.title || t("player.chapterN", { n: chapterIndex + 1 }) : book.title;
  const subheading = chapter ? [book.title, author].filter(Boolean).join(" · ") : author;
  const pct = Math.min(100, Math.floor((sec / Math.max(1, total)) * 100));
  const playing = isActive && player.isPlaying;
  const loading = isActive && player.isLoading;
  const canPrev = chapters.length > 0;
  const canNext = chapters.length > 0 && chapterIndex < chapters.length - 1;
  const timer = isActive ? player.sleepTimer : null;
  const sleepCountdown = timer?.kind === "minutes" ? formatClock(Math.max(0, timer.endsAt - Date.now()) / 1000) : null;
  const returnSec = isActive ? audiobook.returnSec : undefined;
  const returnLabel = (() => {
    if (returnSec === undefined) return null;
    const at = chapterIndexAt(chapters, returnSec);
    const where = at >= 0 ? chapters[at].title || t("player.chapterN", { n: at + 1 }) : formatClock(returnSec);
    return t("player.returnTo", { where });
  })();
  const listened = sheet === "more" ? engine.listenedFiles(bookId) : { count: 0, bytes: 0 };

  // The cover gets what is left after the controls, square, never wider than the screen.
  const artSize = Math.max(160, Math.min(width - spacing.lg * 2, height - 520));

  const flash = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  };

  const togglePlay = () => {
    hapticLight();
    if (!isActive) void engine.open(bookId, true);
    else engine.toggle();
  };

  const bookmarkHere = () => {
    const at = engine.addBookmark();
    if (at === null) return;
    hapticSuccess();
    flash(t("player.bookmarkAdded", { time: formatClock(at) }));
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

  const deleteListened = () => {
    setSheet(null);
    const { count, bytes } = engine.listenedFiles(bookId);
    if (!count) return;
    dialog.confirm({
      title: t("player.deleteListenedTitle"),
      body: t("player.deleteListenedBody", { count, size: formatBytes(bytes) }),
      confirmLabel: t("player.deleteListenedConfirm"),
      destructive: true,
      onConfirm: () => {
        engine.removeListenedFiles(bookId);
        hapticSuccess();
      },
    });
  };

  const openList = (tab: "chapters" | "bookmarks") => {
    setListTab(tab);
    setSheet("list");
  };

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom + spacing.md }]}>
      <View style={styles.grabber} />

      {/* ── Cover on its own blurred backdrop ────────────────────────────── */}
      <View style={styles.artArea}>
        <View style={[styles.artFrame, { width: artSize, height: artSize }]}>
          {book.coverImageUri ? (
            <ImageBackground source={{ uri: book.coverImageUri }} blurRadius={40} style={StyleSheet.absoluteFill}>
              <View style={styles.artShade} />
              <Image source={{ uri: book.coverImageUri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
            </ImageBackground>
          ) : (
            <LinearGradient colors={book.coverGradient} style={[StyleSheet.absoluteFill, styles.artFallback]}>
              <BookCover book={book} size="lg" hideProgress />
            </LinearGradient>
          )}
          {isAirPlayAvailable ? (
            <View style={styles.airplay} accessibilityLabel={t("player.airplay")}>
              <AirPlayButton style={styles.airplayButton} tintColor="#FFFFFF" activeTintColor={P.teal} />
            </View>
          ) : null}
        </View>
      </View>

      {/* ── « Chapter » ──────────────────────────────────────────────────── */}
      <View style={styles.chapterRow}>
        <IconButton
          label={t("player.previousChapter")}
          disabled={!canPrev}
          onPress={() => engine.previousChapter()}
        >
          <MaterialCommunityIcons name="chevron-double-left" size={34} color={canPrev ? P.ink : "transparent"} />
        </IconButton>
        <Pressable
          accessibilityRole="button"
          disabled={!chapters.length}
          style={styles.chapterText}
          onPress={() => openList("chapters")}
        >
          <Text style={styles.heading} numberOfLines={2}>
            {heading}
          </Text>
          {subheading ? (
            <Text style={styles.subheading} numberOfLines={1}>
              {subheading}
            </Text>
          ) : null}
        </Pressable>
        <IconButton label={t("player.nextChapter")} disabled={!canNext} onPress={() => engine.nextChapter()}>
          <MaterialCommunityIcons name="chevron-double-right" size={34} color={canNext ? P.ink : "transparent"} />
        </IconButton>
      </View>

      {/* ── Scrubber: chapter time · book % · chapter left ───────────────── */}
      <View style={styles.scrubber}>
        <ValueSlider
          value={Math.round(sec)}
          min={Math.floor(rangeStart)}
          max={Math.max(Math.floor(rangeStart) + 1, Math.ceil(rangeEnd))}
          onChange={setScrub}
          onSettle={(value) => {
            void engine.seekTo(value).finally(() => setScrub(null));
          }}
          accessibilityLabel={heading}
          trackColor="rgba(255,255,255,0.18)"
          fillColor={P.teal}
          knobColor={P.teal}
          knobSize={22}
        />
        <View style={styles.times}>
          <Text style={[styles.time, styles.timeLeft]}>{formatClock(sec - rangeStart)}</Text>
          <Text style={[styles.time, styles.timeMid]}>{t("player.percent", { pct })}</Text>
          <Text style={[styles.time, styles.timeRight]}>-{formatClock(rangeEnd - sec)}</Text>
        </View>
      </View>

      {/* ── −30 · play · +30 ─────────────────────────────────────────────── */}
      <View style={styles.transport}>
        <SkipButton label={t("player.skipBack", { n: SKIP_BACK_SEC })} text={`-${SKIP_BACK_SEC}`} back onPress={() => void engine.skip(-SKIP_BACK_SEC)} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={playing ? t("player.pause") : t("player.play")}
          hitSlop={12}
          style={({ pressed }) => [styles.play, pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] }]}
          onPress={togglePlay}
        >
          {loading ? (
            <ActivityIndicator color={P.teal} size="large" />
          ) : (
            <Ionicons name={playing ? "pause" : "play"} size={88} color={P.teal} style={playing ? undefined : styles.playNudge} />
          )}
        </Pressable>
        <SkipButton label={t("player.skipForward", { n: SKIP_FORWARD_SEC })} text={`+${SKIP_FORWARD_SEC}`} onPress={() => void engine.skip(SKIP_FORWARD_SEC)} />
      </View>

      {isActive && player.loadError ? (
        <Pressable accessibilityRole="button" style={styles.errorBanner} onPress={() => void replaceAudio()}>
          <Ionicons name="alert-circle" size={18} color={P.danger} />
          <View style={{ flex: 1 }}>
            <Text style={styles.errorTitle}>{t("player.loadErrorTitle")}</Text>
            <Text style={styles.errorBody}>{t("player.loadErrorBody")}</Text>
          </View>
          <Text style={styles.errorAction}>{t("player.chooseAgain")}</Text>
        </Pressable>
      ) : toast ? (
        <Text style={styles.toast}>{toast}</Text>
      ) : returnLabel ? (
        <View style={styles.returnPill}>
          <Pressable
            accessibilityRole="button"
            style={styles.returnMain}
            onPress={() => {
              hapticLight();
              engine.returnToLastSpot();
            }}
          >
            <Ionicons name="arrow-undo" size={15} color={P.teal} />
            <Text style={styles.returnText} numberOfLines={1}>
              {returnLabel}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("player.returnDismiss")}
            hitSlop={10}
            onPress={() => engine.dismissReturnPoint()}
          >
            <Ionicons name="close" size={16} color={P.muted} />
          </Pressable>
        </View>
      ) : (
        <Text style={styles.toast}> </Text>
      )}

      {/* ── Round controls ───────────────────────────────────────────────── */}
      <View style={styles.dock}>
        <RoundButton label={t("player.speed")} onPress={() => setSheet("speed")}>
          <Text style={styles.speedText}>{formatSpeed(audiobook.speed)}</Text>
        </RoundButton>
        <RoundButton label={t("player.sleep")} active={Boolean(timer)} onPress={() => setSheet("sleep")}>
          {sleepCountdown ? (
            <Text style={styles.countdown}>{sleepCountdown}</Text>
          ) : (
            <Ionicons name={timer ? "moon" : "moon-outline"} size={24} color={timer ? P.teal : P.ink} />
          )}
        </RoundButton>
        <RoundButton label={t("player.addBookmark")} onPress={bookmarkHere}>
          <MaterialCommunityIcons name="bookmark-plus-outline" size={26} color={P.ink} />
        </RoundButton>
        <RoundButton label={t("player.chaptersAndBookmarks")} onPress={() => openList(chapters.length ? "chapters" : "bookmarks")}>
          <Ionicons name="list" size={26} color={P.ink} />
        </RoundButton>
        <RoundButton label={t("player.more")} onPress={() => setSheet("more")}>
          <Ionicons name="ellipsis-horizontal" size={24} color={P.ink} />
        </RoundButton>
      </View>

      {/* ── Sheets ───────────────────────────────────────────────────────── */}
      <PlayerSheet open={sheet === "list"} onClose={() => setSheet(null)} colors={P}>
        <View style={styles.segment}>
          {(["chapters", "bookmarks"] as const).map((tab) => (
            <Pressable
              key={tab}
              accessibilityRole="tab"
              accessibilityState={{ selected: listTab === tab }}
              style={[styles.segmentItem, listTab === tab && styles.segmentItemActive]}
              onPress={() => setListTab(tab)}
            >
              <Text style={[styles.segmentText, listTab === tab && styles.segmentTextActive]}>
                {tab === "chapters" ? t("player.chapters") : t("player.bookmarks")}
              </Text>
            </Pressable>
          ))}
        </View>
        {listTab === "chapters" ? (
          chapters.length ? (
            chapters.map((ch, i) => (
              <SheetRow
                key={`${i}-${ch.startSec}`}
                label={ch.title || t("player.chapterN", { n: i + 1 })}
                detail={isRemovedAt(audiobook.tracks, ch.startSec) ? t("player.chapterDeleted") : formatClock(ch.endSec - ch.startSec)}
                disabled={isRemovedAt(audiobook.tracks, ch.startSec)}
                selected={i === chapterIndex}
                onPress={() => {
                  setSheet(null);
                  engine.jumpToChapter(i);
                }}
              />
            ))
          ) : (
            <Text style={styles.sheetEmpty}>{t("player.noChapters")}</Text>
          )
        ) : bookmarks.length ? (
          bookmarks.map((bm) => {
            const at = chapterIndexAt(chapters, bm.sec);
            const where = at >= 0 ? chapters[at].title || t("player.chapterN", { n: at + 1 }) : book.title;
            return (
              <View key={bm.id} style={styles.bookmarkRow}>
                <Pressable
                  accessibilityRole="button"
                  style={styles.bookmarkMain}
                  onPress={() => {
                    setSheet(null);
                    void engine.seekTo(bm.sec);
                  }}
                >
                  <MaterialCommunityIcons name="bookmark" size={18} color={P.teal} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.bookmarkTime}>{formatClock(bm.sec)}</Text>
                    <Text style={styles.bookmarkWhere} numberOfLines={1}>
                      {where}
                    </Text>
                  </View>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("player.deleteBookmark")}
                  hitSlop={10}
                  onPress={() => engine.removeBookmark(bookId, bm.id)}
                >
                  <Ionicons name="trash-outline" size={18} color={P.muted} />
                </Pressable>
              </View>
            );
          })
        ) : (
          <Text style={styles.sheetEmpty}>{t("player.noBookmarks")}</Text>
        )}
      </PlayerSheet>

      <PlayerSheet open={sheet === "speed"} title={t("player.speed")} onClose={() => setSheet(null)} colors={P}>
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

      <PlayerSheet open={sheet === "sleep"} title={t("player.sleep")} onClose={() => setSheet(null)} colors={P}>
        <SheetRow
          label={t("player.sleepOff")}
          selected={!timer}
          onPress={() => {
            setSheet(null);
            engine.setSleepTimer(null);
          }}
        />
        {SLEEP_MINUTES.map((minutes) => (
          <SheetRow
            key={minutes}
            label={t("player.sleepMinutes", { n: minutes })}
            selected={timer?.kind === "minutes" && timer.minutes === minutes}
            onPress={() => {
              setSheet(null);
              engine.setSleepTimer({ kind: "minutes", minutes });
            }}
          />
        ))}
        {chapters.length ? (
          <SheetRow
            label={t("player.sleepChapterEnd")}
            selected={timer?.kind === "chapter"}
            onPress={() => {
              setSheet(null);
              engine.setSleepTimer({ kind: "chapter" });
            }}
          />
        ) : null}
      </PlayerSheet>

      <PlayerSheet open={sheet === "more"} onClose={() => setSheet(null)} colors={P}>
        <Text style={styles.sheetHint}>{t("player.autoLogged")}</Text>
        <SheetRow
          icon="create-outline"
          label={t("player.logManually")}
          onPress={() => {
            setSheet(null);
            navigation.navigate("AddReadingSession", { bookId });
          }}
        />
        {listened.count ? (
          <SheetRow
            icon="cut-outline"
            label={t("player.deleteListened")}
            detail={t("player.deleteListenedDetail", { count: listened.count, size: formatBytes(listened.bytes) })}
            onPress={deleteListened}
          />
        ) : null}
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
    </View>
  );
}

/** "210 MB", "1.4 GB". */
// ─── Pieces ───────────────────────────────────────────────────────────────────

function IconButton({ label, disabled, onPress, children }: React.PropsWithChildren<{ label: string; disabled?: boolean; onPress: () => void }>) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      hitSlop={10}
      style={({ pressed }) => [pieces.iconButton, pressed && { opacity: 0.5 }]}
      onPress={() => {
        hapticLight();
        onPress();
      }}
    >
      {children}
    </Pressable>
  );
}

/** A circular arrow with the seconds inside it. */
function SkipButton({ text, back, label, onPress }: { text: string; back?: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      style={({ pressed }) => [pieces.skip, pressed && { opacity: 0.6, transform: [{ scale: 0.94 }] }]}
      onPress={() => {
        hapticLight();
        onPress();
      }}
    >
      {/* "restore" turns counter-clockwise, "reload" clockwise — back and forward. */}
      <MaterialCommunityIcons name={back ? "restore" : "reload"} size={74} color={P.teal} />
      <Text style={pieces.skipText}>{text}</Text>
    </Pressable>
  );
}

function RoundButton({ label, active, onPress, children }: React.PropsWithChildren<{ label: string; active?: boolean; onPress: () => void }>) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        pieces.round,
        active && { backgroundColor: P.teal + "26", borderColor: P.teal },
        pressed && { opacity: 0.6 },
      ]}
      onPress={onPress}
    >
      {children}
    </Pressable>
  );
}

const pieces = StyleSheet.create({
  iconButton: { alignItems: "center", height: 48, justifyContent: "center", width: 48 },
  skip: { alignItems: "center", height: 84, justifyContent: "center", width: 84 },
  skipText: {
    color: P.teal,
    fontFamily: fonts.body,
    fontSize: 17,
    fontVariant: ["tabular-nums"],
    fontWeight: "900",
    position: "absolute",
    top: 31,
  },
  round: {
    alignItems: "center",
    backgroundColor: P.surface,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 30,
    borderWidth: 1,
    height: 60,
    justifyContent: "center",
    width: 60,
  },
});

function createStyles(c: AppColors) {
  return StyleSheet.create({
    root: { backgroundColor: c.bg, flex: 1, paddingHorizontal: spacing.lg },
    grabber: {
      alignSelf: "center",
      backgroundColor: "rgba(255,255,255,0.28)",
      borderRadius: 3,
      height: 5,
      marginBottom: spacing.md,
      marginTop: spacing.sm,
      width: 40,
    },
    artArea: { alignItems: "center", flex: 1, justifyContent: "center", minHeight: 160 },
    artFrame: {
      backgroundColor: c.surface,
      borderRadius: radii.md,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.4,
      shadowRadius: 24,
    },
    airplay: {
      alignItems: "center",
      backgroundColor: "rgba(0,0,0,0.45)",
      borderRadius: 20,
      height: 40,
      justifyContent: "center",
      position: "absolute",
      right: 12,
      top: 12,
      width: 40,
    },
    airplayButton: { height: 30, width: 30 },
    artShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)" },
    artFallback: { alignItems: "center", justifyContent: "center" },

    chapterRow: { alignItems: "center", flexDirection: "row", gap: spacing.xs, marginTop: spacing.lg },
    chapterText: { alignItems: "center", flex: 1 },
    heading: { color: c.ink, fontFamily: fonts.body, fontSize: 20, fontWeight: "800", textAlign: "center" },
    subheading: { color: c.muted, fontFamily: fonts.body, fontSize: 13, fontWeight: "700", marginTop: 2, textAlign: "center" },

    scrubber: { marginTop: spacing.md },
    times: { flexDirection: "row", marginTop: -2 },
    time: { color: c.muted, flex: 1, fontFamily: fonts.body, fontSize: 14, fontVariant: ["tabular-nums"], fontWeight: "800" },
    timeLeft: { textAlign: "left" },
    timeMid: { textAlign: "center" },
    timeRight: { textAlign: "right" },

    transport: { alignItems: "center", flexDirection: "row", justifyContent: "space-around", marginTop: spacing.md },
    play: { alignItems: "center", height: 104, justifyContent: "center", width: 104 },
    playNudge: { marginLeft: 8 },

    returnPill: {
      alignItems: "center",
      alignSelf: "center",
      backgroundColor: c.teal + "1F",
      borderRadius: radii.pill,
      flexDirection: "row",
      gap: spacing.sm,
      marginTop: spacing.xs,
      maxWidth: "100%",
      paddingHorizontal: 14,
      paddingVertical: 7,
    },
    returnMain: { alignItems: "center", flexDirection: "row", flexShrink: 1, gap: 6 },
    returnText: { color: c.teal, flexShrink: 1, fontFamily: fonts.body, fontSize: 13, fontWeight: "900" },
    toast: { color: c.teal, fontFamily: fonts.body, fontSize: 13, fontWeight: "800", marginTop: spacing.xs, textAlign: "center" },
    errorBanner: {
      alignItems: "center",
      backgroundColor: c.danger + "1F",
      borderColor: c.danger + "66",
      borderRadius: radii.sm,
      borderWidth: 1,
      flexDirection: "row",
      gap: spacing.sm,
      marginTop: spacing.sm,
      padding: spacing.sm,
    },
    errorTitle: { color: c.ink, fontFamily: fonts.body, fontSize: 13, fontWeight: "900" },
    errorBody: { color: c.muted, fontFamily: fonts.bodyRegular, fontSize: 12 },
    errorAction: { color: c.danger, fontFamily: fonts.body, fontSize: 12, fontWeight: "900", maxWidth: 110, textAlign: "right" },

    dock: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.md },
    speedText: { color: c.ink, fontFamily: fonts.body, fontSize: 16, fontWeight: "900" },
    countdown: { color: c.teal, fontFamily: fonts.body, fontSize: 13, fontVariant: ["tabular-nums"], fontWeight: "900" },

    segment: {
      backgroundColor: c.surfaceAlt,
      borderRadius: radii.pill,
      flexDirection: "row",
      marginBottom: spacing.sm,
      padding: 3,
    },
    segmentItem: { alignItems: "center", borderRadius: radii.pill, flex: 1, paddingVertical: 8 },
    segmentItemActive: { backgroundColor: c.surface },
    segmentText: { color: c.muted, fontFamily: fonts.body, fontSize: 14, fontWeight: "800" },
    segmentTextActive: { color: c.ink },
    sheetEmpty: { color: c.muted, fontFamily: fonts.bodyRegular, fontSize: 14, lineHeight: 20, padding: spacing.md, textAlign: "center" },
    sheetHint: { color: c.muted, fontFamily: fonts.bodyRegular, fontSize: 13, paddingBottom: spacing.sm, paddingHorizontal: spacing.sm },
    bookmarkRow: { alignItems: "center", flexDirection: "row", gap: spacing.sm, minHeight: 52, paddingHorizontal: spacing.sm },
    bookmarkMain: { alignItems: "center", flex: 1, flexDirection: "row", gap: spacing.sm, paddingVertical: 8 },
    bookmarkTime: { color: c.ink, fontFamily: fonts.body, fontSize: 15, fontVariant: ["tabular-nums"], fontWeight: "900" },
    bookmarkWhere: { color: c.muted, fontFamily: fonts.body, fontSize: 12, fontWeight: "700" },

    gone: { alignItems: "center", backgroundColor: c.bg, flex: 1, gap: spacing.md, paddingHorizontal: spacing.lg },
    goneText: { color: c.ink, fontFamily: fonts.body, fontSize: 15, fontWeight: "800", textAlign: "center" },
    goneButton: { backgroundColor: c.teal, borderRadius: radii.pill, paddingHorizontal: spacing.lg, paddingVertical: 10 },
    goneButtonText: { color: "#fff", fontFamily: fonts.body, fontSize: 14, fontWeight: "900" },
  });
}
