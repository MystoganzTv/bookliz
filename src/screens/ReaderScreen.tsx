/**
 * Bookliz's ebook reader — EPUB, PDF, comics (CBZ, and CBR when it is a ZIP)
 * and plain text, one screen.
 *
 * Swipe or tap the edges to turn pages; tap the middle to show or hide the
 * controls (they hide by themselves once you start reading). The controls
 * have the table of contents (EPUB), previous / next, and a scrubber to jump
 * anywhere in the book. "Aa" sets the theme (light / sepia / dark) and text
 * size; Pro adds fonts.
 *
 * The page always sits inside fixed margins, clear of the notch and the home
 * indicator, so nothing is ever drawn under the bars or cut off.
 *
 * Reading here logs itself, like listening does: the time the reader is open
 * (idle stretches capped) and how far it moved become a reading session when
 * the screen closes or the app goes to the background. A book with no page
 * count gets its progress updated instead, and a PDF or comic gives the book
 * its page count the first time it opens.
 */
import { Ionicons } from "@expo/vector-icons";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { File, Directory, Paths } from "expo-file-system";
import JSZip from "jszip";
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import {
  ActivityIndicator,
  AppState,
  Dimensions,
  FlatList,
  Image,
  Modal,
  PanResponder,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Pdf, { type PdfRef } from "react-native-pdf";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import WebView, { type WebViewMessageEvent } from "react-native-webview";
import { useBookliz } from "../data/BooklizContext";
import { useEbooks } from "../ebook/EbookContext";
import { ebookUri } from "../ebook/ebookFiles";
import { comicPageNames, FONT_SIZES, progressOfPage, READER_THEMES, type Ebook } from "../ebook/ebookModel";
import type { ReaderPrefs } from "../ebook/ebookStore";
import { EPUB_READER_HTML } from "../ebook/epubReaderHtml.generated";
import { bookProgressPercent, sessionFromStint, startStint, touchStint, type ReadingStint } from "../ebook/readingProgress";
import { useI18n } from "../i18n/LocalizationContext";
import { RootStackParamList } from "../navigation/types";
import { usePro } from "../pro/ProContext";
import { fonts, radii, spacing } from "../theme/theme";
import { useColors } from "../theme/ThemeContext";
import { hapticLight } from "../utils/haptics";

type Position = Partial<Pick<Ebook, "progress" | "cfi" | "page" | "pages">>;

/** What the controls can ask the open reader to do. Each reader fills in what it supports. */
type ReaderControls = {
  next?: () => void;
  prev?: () => void;
  seek?: (fraction: number) => void;
  goTo?: (href: string) => void;
};
type TocItem = { label: string; href: string; depth: number };
/** Extra things a reader knows about where you are (EPUB only today). */
type ReaderMeta = { toc?: TocItem[]; chapter?: string; leftInChapter?: number | null };

/** Room kept for the page above and below the safe area — the bars sit over this. */
const PAGE_MARGIN_TOP = 44;
const PAGE_MARGIN_BOTTOM = 36;

const PRO_FONTS: { key: ReaderPrefs["font"]; label: string; family: string }[] = [
  { key: "default", label: "Original", family: "" },
  { key: "serif", label: "Georgia", family: "Georgia" },
  { key: "sans", label: "Avenir", family: "Avenir Next" },
  { key: "dyslexic", label: "Palatino", family: "Palatino" },
];
const fontFamilyOf = (key: ReaderPrefs["font"]) => PRO_FONTS.find((f) => f.key === key)?.family ?? "";

export function ReaderScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "Reader">>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { library, savePosition, prefs, setPrefs } = useEbooks();
  const { getBook, addReadingSession, setBookProgress, updateBookPages } = useBookliz();
  const { isPro } = usePro();
  const ebook = library[route.params.ebookId];
  const book = ebook?.bookId ? getBook(ebook.bookId) : undefined;
  const look = READER_THEMES[prefs.theme];
  const accent = useColors().teal;
  const [chrome, setChrome] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [progress, setProgress] = useState(ebook?.progress ?? 0);
  const [pageLabel, setPageLabel] = useState("");
  const [toc, setToc] = useState<TocItem[]>([]);
  const [chapter, setChapter] = useState("");
  const [leftInChapter, setLeftInChapter] = useState<number | null>(null);
  const controls = useRef<ReaderControls>({});

  const onMeta = useCallback((meta: ReaderMeta) => {
    if (meta.toc) setToc(meta.toc);
    if (meta.chapter !== undefined) setChapter(meta.chapter);
    if (meta.leftInChapter !== undefined) setLeftInChapter(meta.leftInChapter);
  }, []);

  // Turning a page means you are reading: the controls step aside.
  const next = () => {
    hapticLight();
    controls.current.next?.();
    setChrome(false);
  };
  const prev = () => {
    hapticLight();
    controls.current.prev?.();
    setChrome(false);
  };

  // ── Reading stint → session ─────────────────────────────────────────────
  const stintRef = useRef<ReadingStint | null>(null);
  const docPagesRef = useRef<number>(0);
  const bookRef = useRef(book);
  bookRef.current = book;

  const begin = useCallback(() => {
    const current = bookRef.current;
    if (current && ebook) stintRef.current = startStint(current.id, Date.now(), ebook.progress);
  }, [ebook]);

  const finish = useCallback(() => {
    const stint = stintRef.current;
    const current = bookRef.current;
    stintRef.current = null;
    if (!stint || !current) return;
    let pages = current.pages;
    if (!(pages > 0) && docPagesRef.current > 0) {
      // A PDF / comic knows its length: the book gets it, and sessions can count pages.
      pages = docPagesRef.current;
      updateBookPages(current.id, pages);
    }
    const session = sessionFromStint(touchStint(stint, Date.now(), stint.endProgress), pages);
    if (session) addReadingSession(session);
    else if (!(pages > 0) && stint.endProgress > stint.startProgress) {
      setBookProgress(current.id, bookProgressPercent(current.userStatus.progressPercent, stint.endProgress));
    }
  }, [addReadingSession, setBookProgress, updateBookPages]);

  useEffect(() => {
    begin();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") begin();
      else finish();
    });
    return () => {
      sub.remove();
      finish();
    };
    // once per opened file
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ebook?.id]);

  const onPosition = useCallback(
    (position: Position, label?: string) => {
      if (!ebook) return;
      if (position.pages) docPagesRef.current = position.pages;
      if (typeof position.progress === "number") {
        setProgress(position.progress);
        if (stintRef.current) stintRef.current = touchStint(stintRef.current, Date.now(), position.progress);
      }
      if (label !== undefined) setPageLabel(label);
      savePosition(ebook.id, position);
    },
    [ebook, savePosition]
  );

  if (!ebook) {
    return (
      <View style={[styles.fill, { backgroundColor: look.bg, alignItems: "center", justifyContent: "center" }]}>
        <Text style={{ color: look.muted, fontFamily: fonts.body }}>{t("reader.missing")}</Text>
      </View>
    );
  }

  const title = book?.title ?? ebook.title;
  const uri = ebookUri(ebook);
  const toggleChrome = () => setChrome((v) => !v);
  const percent = `${Math.round(progress * 100)} %`;
  const where =
    pageLabel ||
    (leftInChapter === 0
      ? t("reader.lastInChapter")
      : leftInChapter
        ? t(leftInChapter === 1 ? "reader.leftInChapterOne" : "reader.leftInChapter", { n: leftInChapter })
        : "");
  const readerProps = { ebook, uri, prefs, onPosition, onMeta, controls, onToggleChrome: toggleChrome, onNext: next, onPrev: prev };
  const iconBtn = (name: keyof typeof Ionicons.glyphMap, label: string, onPress: () => void, disabled = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.ctrlBtn, { backgroundColor: pressed ? look.muted + "22" : "transparent", opacity: disabled ? 0.35 : 1 }]}
    >
      <Ionicons name={name} size={22} color={look.text} />
    </Pressable>
  );

  return (
    <View style={[styles.fill, { backgroundColor: look.bg }]}>
      <StatusBar hidden={!chrome} barStyle={prefs.theme === "dark" ? "light-content" : "dark-content"} />
      {ebook.format === "epub" ? (
        <EpubReader {...readerProps} />
      ) : ebook.format === "pdf" ? (
        <PdfReader {...readerProps} />
      ) : ebook.format === "comic" ? (
        <ComicReader {...readerProps} />
      ) : (
        <TxtReader {...readerProps} />
      )}

      {/* Quiet footer while reading — where you are, without the controls. */}
      {!chrome && ebook.format !== "pdf" && ebook.format !== "comic" ? (
        <View pointerEvents="none" style={[styles.quietFooter, { bottom: insets.bottom + 8 }]}>
          <Text style={[styles.quietText, { color: look.muted }]} numberOfLines={1}>
            {[where, percent].filter(Boolean).join("  ·  ")}
          </Text>
        </View>
      ) : null}

      {chrome ? (
        <>
          <View style={[styles.topBar, { paddingTop: insets.top + 6, backgroundColor: look.bg, borderBottomColor: look.muted + "22" }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={t("reader.close")} hitSlop={10} onPress={() => navigation.goBack()} style={styles.barBtn}>
              <Ionicons name="close" size={24} color={look.text} />
            </Pressable>
            <View style={styles.barCenter}>
              <Text style={[styles.barTitle, { color: look.text }]} numberOfLines={1}>{title}</Text>
              {chapter ? <Text style={[styles.barChapter, { color: look.muted }]} numberOfLines={1}>{chapter}</Text> : null}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={t("reader.appearance")} hitSlop={10} onPress={() => setSettingsOpen(true)} style={styles.barBtn}>
              <Text style={[styles.aa, { color: look.text }]}>Aa</Text>
            </Pressable>
          </View>
          <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 6, backgroundColor: look.bg, borderTopColor: look.muted + "22" }]}>
            <View style={styles.ctrlRow}>
              {ebook.format === "epub"
                ? iconBtn("list", t("reader.contents"), () => setTocOpen(true), toc.length === 0)
                : <View style={styles.ctrlBtn} />}
              {iconBtn("chevron-back", t("reader.previous"), prev)}
              <Scrubber
                value={progress}
                color={look.text}
                track={look.muted}
                bg={look.bg}
                onSeek={(fraction) => controls.current.seek?.(fraction)}
              />
              {iconBtn("chevron-forward", t("reader.next"), next)}
              <View style={styles.ctrlBtn} />
            </View>
            <Text style={[styles.bottomText, { color: look.muted }]} numberOfLines={1}>
              {[where, percent].filter(Boolean).join("  ·  ")}
            </Text>
          </View>
        </>
      ) : null}

      {/* Table of contents */}
      <Modal visible={tocOpen} transparent animationType="slide" onRequestClose={() => setTocOpen(false)}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("reader.close")} style={styles.sheetOverlay} onPress={() => setTocOpen(false)}>
          <Pressable
            accessibilityRole="none"
            style={[styles.sheet, styles.tocSheet, { backgroundColor: look.bg, paddingBottom: insets.bottom + spacing.sm }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.sheetLabel, { color: look.muted }]}>{t("reader.contents")}</Text>
            <FlatList
              data={toc}
              keyExtractor={(item, i) => `${i}:${item.href}`}
              renderItem={({ item }) => {
                const current = item.label === chapter;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: current }}
                    onPress={() => {
                      setTocOpen(false);
                      setChrome(false);
                      controls.current.goTo?.(item.href);
                    }}
                    style={({ pressed }) => [
                      styles.tocRow,
                      { paddingLeft: spacing.sm + item.depth * 16, backgroundColor: pressed ? look.muted + "22" : "transparent" },
                    ]}
                  >
                    <Text
                      style={[styles.tocText, { color: current ? accent : look.text, fontWeight: current ? "800" : "600" }]}
                      numberOfLines={2}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={settingsOpen} transparent animationType="slide" onRequestClose={() => setSettingsOpen(false)}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("reader.close")} style={styles.sheetOverlay} onPress={() => setSettingsOpen(false)}>
          <Pressable accessibilityRole="none" style={[styles.sheet, { backgroundColor: look.bg, paddingBottom: insets.bottom + spacing.md }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.sheetLabel, { color: look.muted }]}>{t("reader.theme")}</Text>
            <View style={styles.row}>
              {(["light", "sepia", "dark"] as const).map((key) => (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: prefs.theme === key }}
                  onPress={() => setPrefs({ theme: key })}
                  style={[styles.swatch, { backgroundColor: READER_THEMES[key].bg, borderColor: prefs.theme === key ? accent : READER_THEMES[key].muted + "55" }]}
                >
                  <Text style={{ color: READER_THEMES[key].text, fontFamily: fonts.body, fontWeight: "800" }}>{t(`reader.theme_${key}`)}</Text>
                </Pressable>
              ))}
            </View>
            {ebook.format === "epub" || ebook.format === "txt" ? (
              <>
                <Text style={[styles.sheetLabel, { color: look.muted }]}>{t("reader.textSize")}</Text>
                <View style={styles.row}>
                  <Pressable accessibilityRole="button" accessibilityLabel={t("reader.smaller")} style={[styles.sizeBtn, { borderColor: look.muted + "55" }]} onPress={() => {
                    const i = FONT_SIZES.findIndex((s) => s >= prefs.fontSize);
                    setPrefs({ fontSize: FONT_SIZES[Math.max(0, i - 1)] });
                  }}>
                    <Text style={{ color: look.text, fontSize: 15, fontWeight: "800" }}>A</Text>
                  </Pressable>
                  <Text style={[styles.sizeValue, { color: look.text }]}>{prefs.fontSize}</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel={t("reader.larger")} style={[styles.sizeBtn, { borderColor: look.muted + "55" }]} onPress={() => {
                    const i = FONT_SIZES.findIndex((s) => s >= prefs.fontSize);
                    setPrefs({ fontSize: FONT_SIZES[Math.min(FONT_SIZES.length - 1, (i < 0 ? FONT_SIZES.length - 1 : i) + 1)] });
                  }}>
                    <Text style={{ color: look.text, fontSize: 22, fontWeight: "800" }}>A</Text>
                  </Pressable>
                </View>
                <Text style={[styles.sheetLabel, { color: look.muted }]}>{t("reader.font")}{isPro ? "" : ` · ${t("pro.requiresPro")}`}</Text>
                <View style={styles.rowWrap}>
                  {PRO_FONTS.map((f) => {
                    const locked = !isPro && f.key !== "default";
                    const active = prefs.font === f.key;
                    return (
                      <Pressable
                        key={f.key}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        onPress={() => {
                          if (locked) {
                            setSettingsOpen(false);
                            navigation.navigate("Paywall", { feature: "readerFonts" });
                            return;
                          }
                          setPrefs({ font: f.key });
                        }}
                        style={[styles.fontChip, { borderColor: active ? accent : look.muted + "55", opacity: locked ? 0.55 : 1 }]}
                      >
                        <Text style={{ color: look.text, fontFamily: f.family || fonts.body, fontSize: 15 }}>{f.label}</Text>
                        {locked ? <Ionicons name="lock-closed" size={12} color={look.muted} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const VIEWABILITY = { itemVisiblePercentThreshold: 60 };

type ReaderProps = {
  ebook: Ebook;
  uri: string;
  prefs: ReaderPrefs;
  onPosition: (position: Position, label?: string) => void;
  onMeta: (meta: ReaderMeta) => void;
  controls: MutableRefObject<ReaderControls>;
  onToggleChrome: () => void;
  onNext: () => void;
  onPrev: () => void;
};

/**
 * Turns pages over a reader that cannot do it itself (EPUB): swipe left or
 * right, or tap the outer edges; a tap in the middle shows the controls.
 */
function PageGestures({ onPrev, onNext, onMiddle }: { onPrev: () => void; onNext: () => void; onMiddle: () => void }) {
  const handlers = useRef({ onPrev, onNext, onMiddle });
  handlers.current = { onPrev, onNext, onMiddle };
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8,
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_, g) => {
        const h = handlers.current;
        if (Math.abs(g.dx) > 40 && Math.abs(g.dx) > Math.abs(g.dy)) {
          if (g.dx < 0) h.onNext();
          else h.onPrev();
          return;
        }
        if (Math.abs(g.dx) > 12 || Math.abs(g.dy) > 12) return;
        const width = Dimensions.get("window").width;
        if (g.x0 < width * 0.25) h.onPrev();
        else if (g.x0 > width * 0.75) h.onNext();
        else h.onMiddle();
      },
    })
  ).current;
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }, { name: "activate" }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === "increment") onNext();
        else if (e.nativeEvent.actionName === "decrement") onPrev();
        else onMiddle();
      }}
      style={StyleSheet.absoluteFill}
      {...responder.panHandlers}
    />
  );
}

/** Drag (or tap) anywhere on the line to jump through the book. */
function Scrubber({ value, color, track, bg, onSeek }: { value: number; color: string; track: string; bg: string; onSeek: (fraction: number) => void }) {
  const [drag, setDrag] = useState<number | null>(null);
  const box = useRef({ x: 0, width: 1 });
  const viewRef = useRef<View>(null);
  const seek = useRef(onSeek);
  seek.current = onSeek;
  const fractionAt = (pageX: number) => Math.min(1, Math.max(0, (pageX - box.current.x) / box.current.width));
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => setDrag(fractionAt(e.nativeEvent.pageX)),
      onPanResponderMove: (e) => setDrag(fractionAt(e.nativeEvent.pageX)),
      onPanResponderRelease: (e) => {
        const fraction = fractionAt(e.nativeEvent.pageX);
        setDrag(null);
        seek.current(fraction);
      },
      onPanResponderTerminate: () => setDrag(null),
    })
  ).current;
  const shown = drag ?? value;
  return (
    <View
      ref={viewRef}
      onLayout={() => viewRef.current?.measureInWindow((x, _y, width) => (box.current = { x, width: Math.max(1, width) }))}
      style={styles.scrubber}
      accessibilityRole="adjustable"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      {...responder.panHandlers}
    >
      <View style={[styles.scrubTrack, { backgroundColor: track + "44" }]}>
        <View style={[styles.scrubFill, { width: `${shown * 100}%`, backgroundColor: color }]} />
      </View>
      <View
        pointerEvents="none"
        style={[styles.scrubThumb, { left: `${shown * 100}%`, backgroundColor: color, transform: [{ scale: drag === null ? 1 : 1.35 }] }]}
      />
      {drag !== null ? (
        <View pointerEvents="none" style={[styles.scrubBubble, { left: `${shown * 100}%`, backgroundColor: color }]}>
          <Text style={[styles.scrubBubbleText, { color: bg }]}>{Math.round(shown * 100)} %</Text>
        </View>
      ) : null}
    </View>
  );
}

// ── EPUB ────────────────────────────────────────────────────────────────────

/** Base64 characters per injected chunk (~384 KB of book). */
const EPUB_CHUNK = 512 * 1024;

function EpubReader({ ebook, uri, prefs, onPosition, onMeta, controls, onToggleChrome, onNext, onPrev }: ReaderProps) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const theme = READER_THEMES[prefs.theme];
  const look = useMemo(
    () => ({ bg: theme.bg, text: theme.text, fontSize: prefs.fontSize, font: fontFamilyOf(prefs.font) }),
    [prefs.font, prefs.fontSize, theme.bg, theme.text]
  );
  // Guarded: a look change can arrive before the page has defined readerCommand.
  const send = (cmd: object) =>
    webRef.current?.injectJavaScript(`window.readerCommand && window.readerCommand(${JSON.stringify(JSON.stringify(cmd))});true;`);

  useEffect(() => {
    send({ type: "look", look });
  }, [look]);

  useEffect(() => {
    controls.current = {
      next: () => send({ type: "next" }),
      prev: () => send({ type: "prev" }),
      seek: (progress) => send({ type: "goto", progress }),
      goTo: (href) => send({ type: "href", href }),
    };
    return () => {
      controls.current = {};
    };
  }, [controls]);

  const onMessage = async (event: WebViewMessageEvent) => {
    let msg: {
      type: string;
      cfi?: string;
      progress?: number | null;
      message?: string;
      items?: TocItem[];
      chapter?: string;
      chapterPage?: number | null;
      chapterPages?: number | null;
    };
    try {
      msg = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === "loaded") {
      try {
        const base64 = await new File(uri).base64();
        // Send big books in pieces — one huge injected script is slow and can crash the WebView.
        for (let at = 0; at < base64.length; at += EPUB_CHUNK) {
          send({ type: "chunk", data: base64.slice(at, at + EPUB_CHUNK) });
        }
        send({ type: "open", cfi: ebook.cfi ?? null, look });
      } catch (error) {
        setFailed(error instanceof Error ? error.message : String(error));
      }
    } else if (msg.type === "ready") {
      setLoading(false);
    } else if (msg.type === "toc") {
      onMeta({ toc: (msg.items ?? []).filter((item) => item.label && item.href) });
    } else if (msg.type === "relocated") {
      onPosition(typeof msg.progress === "number" ? { cfi: msg.cfi, progress: msg.progress } : { cfi: msg.cfi });
      const left = msg.chapterPage && msg.chapterPages ? Math.max(0, msg.chapterPages - msg.chapterPage) : null;
      onMeta({ chapter: msg.chapter ?? "", leftInChapter: left });
    } else if (msg.type === "error") {
      setLoading(false);
      setFailed(msg.message ?? "");
    }
  };

  if (failed) return <ReaderError message={t("reader.openFailed")} detail={failed} prefs={prefs} />;
  return (
    <View style={[styles.fill, { backgroundColor: theme.bg }]}>
      {/* The page lives inside fixed margins: clear of the notch, the home bar and the controls' edges. */}
      <View
        style={[
          styles.fill,
          { marginTop: insets.top + PAGE_MARGIN_TOP, marginBottom: insets.bottom + PAGE_MARGIN_BOTTOM, marginHorizontal: 18 },
        ]}
      >
        <WebView
          ref={webRef}
          originWhitelist={["*"]}
          source={{ html: EPUB_READER_HTML }}
          onMessage={(e) => void onMessage(e)}
          style={[styles.fill, { backgroundColor: theme.bg }]}
          scrollEnabled={false}
          bounces={false}
          javaScriptEnabled
        />
      </View>
      <PageGestures onPrev={onPrev} onNext={onNext} onMiddle={onToggleChrome} />
      {loading ? <ActivityIndicator style={StyleSheet.absoluteFill} color={theme.muted} /> : null}
    </View>
  );
}

// ── PDF ─────────────────────────────────────────────────────────────────────

function PdfReader({ ebook, uri, prefs, onPosition, controls, onToggleChrome }: ReaderProps) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [failed, setFailed] = useState<string | null>(null);
  const theme = READER_THEMES[prefs.theme];
  const pdfRef = useRef<PdfRef>(null);
  const at = useRef({ page: ebook.page ?? 1, pages: ebook.pages ?? 0 });

  useEffect(() => {
    const go = (page: number) => {
      const { pages } = at.current;
      if (pages > 0) pdfRef.current?.setPage(Math.min(pages, Math.max(1, page)));
    };
    controls.current = {
      next: () => go(at.current.page + 1),
      prev: () => go(at.current.page - 1),
      seek: (fraction) => go(Math.round(fraction * (at.current.pages - 1)) + 1),
    };
    return () => {
      controls.current = {};
    };
  }, [controls]);

  if (failed) return <ReaderError message={t("reader.openFailed")} detail={failed} prefs={prefs} />;
  return (
    <Pdf
      ref={pdfRef}
      source={{ uri }}
      page={ebook.page ?? 1}
      enablePaging
      horizontal
      fitPolicy={2}
      style={[
        styles.fill,
        { backgroundColor: theme.bg, marginTop: insets.top + PAGE_MARGIN_TOP, marginBottom: insets.bottom + PAGE_MARGIN_BOTTOM },
      ]}
      onLoadComplete={(pages) => {
        at.current.pages = pages;
        onPosition({ pages });
      }}
      onPageChanged={(page, pages) => {
        at.current = { page, pages };
        onPosition({ page, pages, progress: progressOfPage(page, pages) }, t("reader.pageOf", { page, pages }));
      }}
      onPageSingleTap={onToggleChrome}
      onError={(error) => setFailed(String(error))}
      trustAllCerts={false}
    />
  );
}

// ── Comics (CBZ / ZIP-in-disguise CBR) ─────────────────────────────────────

function ComicReader({ ebook, uri, prefs, onPosition, controls, onToggleChrome }: ReaderProps) {
  const { t } = useI18n();
  const theme = READER_THEMES[prefs.theme];
  const [pages, setPages] = useState<string[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const zipRef = useRef<JSZip | null>(null);
  const [extracted, setExtracted] = useState<Record<number, string>>({});
  const listRef = useRef<FlatList<string>>(null);
  const width = Dimensions.get("window").width;
  const cacheDir = useMemo(() => new Directory(Paths.cache, "comics", ebook.id), [ebook.id]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const zip = await JSZip.loadAsync(await new File(uri).base64(), { base64: true });
        if (!alive) return;
        zipRef.current = zip;
        const names = comicPageNames(Object.keys(zip.files));
        if (!names.length) throw new Error("no images");
        if (!cacheDir.exists) cacheDir.create({ intermediates: true, idempotent: true });
        setPages(names);
        onPosition({ pages: names.length });
      } catch (error) {
        if (alive) setFailed(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);

  /** Pages are unpacked on demand, around the one on screen. */
  const ensure = useCallback(
    async (index: number) => {
      const zip = zipRef.current;
      if (!zip || !pages || index < 0 || index >= pages.length || extracted[index]) return;
      const name = pages[index];
      const ext = name.slice(name.lastIndexOf("."));
      const target = new File(cacheDir, `${index}${ext}`);
      if (!target.exists) {
        const bytes = await zip.files[name].async("uint8array");
        target.create({ overwrite: true });
        target.write(bytes);
      }
      setExtracted((current) => ({ ...current, [index]: target.uri }));
    },
    [cacheDir, extracted, pages]
  );

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!pages) return;
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    void ensure(index + 1);
    void ensure(index + 2);
  };

  const currentIndex = useRef(Math.max(0, (ebook.page ?? 1) - 1));
  const pageCount = pages?.length ?? 0;
  useEffect(() => {
    if (!pageCount) return;
    const go = (index: number) =>
      listRef.current?.scrollToIndex({ index: Math.min(pageCount - 1, Math.max(0, index)), animated: true });
    controls.current = {
      next: () => go(currentIndex.current + 1),
      prev: () => go(currentIndex.current - 1),
      seek: (fraction) => go(Math.round(fraction * (pageCount - 1))),
    };
    return () => {
      controls.current = {};
    };
  }, [controls, pageCount]);

  // FlatList refuses a viewability callback that changes between renders: one
  // stable function that reads the latest values through a ref.
  const latest = useRef({ ensure, onPosition, pages, t });
  latest.current = { ensure, onPosition, pages, t };
  const onViewable = useRef(({ viewableItems }: { viewableItems: { index: number | null }[] }) => {
    const { ensure: load, onPosition: report, pages: names, t: tr } = latest.current;
    const first = viewableItems[0]?.index;
    if (typeof first !== "number" || !names) return;
    currentIndex.current = first;
    void load(first);
    const page = first + 1;
    report({ page, pages: names.length, progress: progressOfPage(page, names.length) }, tr("reader.pageOf", { page, pages: names.length }));
  });

  if (failed) return <ReaderError message={t("reader.openFailed")} detail={failed} prefs={prefs} />;
  if (!pages) return <ActivityIndicator style={styles.fill} color={theme.muted} />;
  const start = Math.min(pages.length - 1, Math.max(0, (ebook.page ?? 1) - 1));
  return (
    <FlatList
      ref={listRef}
      data={pages}
      horizontal
      pagingEnabled
      initialScrollIndex={start}
      getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
      keyExtractor={(name) => name}
      onScroll={onScroll}
      scrollEventThrottle={64}
      onViewableItemsChanged={onViewable.current}
      viewabilityConfig={VIEWABILITY}
      renderItem={({ index }) => (
        <Pressable accessibilityRole="image" style={{ width, flex: 1, justifyContent: "center", backgroundColor: theme.bg }} onPress={onToggleChrome}>
          {extracted[index] ? (
            <Image source={{ uri: extracted[index] }} style={styles.fill} resizeMode="contain" />
          ) : (
            <ActivityIndicator color={theme.muted} onLayout={() => void ensure(index)} />
          )}
        </Pressable>
      )}
      style={{ backgroundColor: theme.bg }}
    />
  );
}

// ── Plain text ──────────────────────────────────────────────────────────────

function TxtReader({ ebook, uri, prefs, onPosition, controls, onToggleChrome }: ReaderProps) {
  const { t } = useI18n();
  const theme = READER_THEMES[prefs.theme];
  const [paragraphs, setParagraphs] = useState<string[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const listRef = useRef<FlatList<string>>(null);
  const restored = useRef(false);
  const lastSave = useRef(0);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    new File(uri)
      .text()
      .then((text) => setParagraphs(text.replace(/\r\n?/g, "\n").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)))
      .catch((error) => setFailed(error instanceof Error ? error.message : String(error)));
  }, [uri]);

  const scroll = useRef({ y: 0, content: 0, view: Dimensions.get("window").height });
  useEffect(() => {
    const to = (y: number) => {
      const max = Math.max(0, scroll.current.content - scroll.current.view);
      listRef.current?.scrollToOffset({ offset: Math.min(max, Math.max(0, y)), animated: true });
    };
    // A "page" of plain text is a screenful, minus a couple of lines so you keep your place.
    const page = () => scroll.current.view - 160;
    controls.current = {
      next: () => to(scroll.current.y + page()),
      prev: () => to(scroll.current.y - page()),
      seek: (fraction) => to(fraction * (scroll.current.content - scroll.current.view)),
    };
    return () => {
      controls.current = {};
    };
  }, [controls]);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    scroll.current = { y: contentOffset.y, content: contentSize.height, view: layoutMeasurement.height };
    const scrollable = contentSize.height - layoutMeasurement.height;
    if (scrollable <= 0) return;
    const now = Date.now();
    if (now - lastSave.current < 1000) return;
    lastSave.current = now;
    onPosition({ progress: contentOffset.y / scrollable });
  };

  if (failed) return <ReaderError message={t("reader.openFailed")} detail={failed} prefs={prefs} />;
  if (!paragraphs) return <ActivityIndicator style={styles.fill} color={theme.muted} />;
  return (
    <FlatList
      ref={listRef}
      data={paragraphs}
      keyExtractor={(_, i) => String(i)}
      onScroll={onScroll}
      scrollEventThrottle={250}
      onLayout={(e) => (scroll.current.view = e.nativeEvent.layout.height)}
      onContentSizeChange={(_, height) => {
        scroll.current.content = height;
        // Back to where the reader was, once the text has a height.
        if (restored.current || !(ebook.progress > 0)) return;
        restored.current = true;
        const windowHeight = Dimensions.get("window").height;
        listRef.current?.scrollToOffset({ offset: Math.max(0, (height - windowHeight) * ebook.progress), animated: false });
      }}
      contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: insets.top + 64, paddingBottom: insets.bottom + 80 }}
      renderItem={({ item }) => (
        <Pressable accessibilityRole="text" onPress={onToggleChrome}>
          <Text
            style={{
              color: theme.text,
              fontFamily: fontFamilyOf(prefs.font) || fonts.bodyRegular,
              fontSize: prefs.fontSize,
              lineHeight: Math.round(prefs.fontSize * 1.55),
              marginBottom: Math.round(prefs.fontSize * 0.9),
            }}
          >
            {item}
          </Text>
        </Pressable>
      )}
      style={{ backgroundColor: theme.bg }}
    />
  );
}

function ReaderError({ message, detail, prefs }: { message: string; detail: string; prefs: ReaderPrefs }) {
  const theme = READER_THEMES[prefs.theme];
  return (
    <View style={[styles.fill, { alignItems: "center", justifyContent: "center", padding: spacing.xl, backgroundColor: theme.bg }]}>
      <Ionicons name="alert-circle-outline" size={36} color={theme.muted} />
      <Text style={{ color: theme.text, fontFamily: fonts.body, fontSize: 16, fontWeight: "800", marginTop: spacing.sm, textAlign: "center" }}>{message}</Text>
      <Text style={{ color: theme.muted, fontFamily: fonts.body, fontSize: 12, marginTop: spacing.xs, textAlign: "center" }}>{detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topBar: {
    alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: spacing.sm, left: 0,
    paddingBottom: 8, paddingHorizontal: spacing.md, position: "absolute", right: 0, top: 0,
  },
  barBtn: { alignItems: "center", height: 40, justifyContent: "center", width: 40 },
  barCenter: { alignItems: "center", flex: 1 },
  barTitle: { fontFamily: fonts.body, fontSize: 15, fontWeight: "800", textAlign: "center" },
  barChapter: { fontFamily: fonts.body, fontSize: 12, fontWeight: "600", marginTop: 1, textAlign: "center" },
  aa: { fontFamily: fonts.display, fontSize: 19, fontWeight: "900" },
  bottomBar: {
    borderTopWidth: StyleSheet.hairlineWidth, bottom: 0, left: 0, paddingHorizontal: spacing.sm, paddingTop: 6,
    position: "absolute", right: 0,
  },
  ctrlRow: { alignItems: "center", flexDirection: "row", gap: 2 },
  ctrlBtn: { alignItems: "center", borderRadius: 20, height: 40, justifyContent: "center", width: 40 },
  bottomText: { fontFamily: fonts.body, fontSize: 12, fontWeight: "700", marginTop: 2, textAlign: "center" },
  quietFooter: { alignItems: "center", left: spacing.lg, position: "absolute", right: spacing.lg },
  quietText: { fontFamily: fonts.body, fontSize: 11, fontWeight: "700" },
  scrubber: { flex: 1, height: 40, justifyContent: "center", marginHorizontal: 6 },
  scrubTrack: { borderRadius: 2, height: 4, overflow: "hidden" },
  scrubFill: { height: 4 },
  scrubThumb: { borderRadius: 7, height: 14, marginLeft: -7, position: "absolute", top: 13, width: 14 },
  scrubBubble: { borderRadius: 10, bottom: 34, marginLeft: -26, paddingVertical: 3, position: "absolute", width: 52 },
  scrubBubbleText: { fontFamily: fonts.body, fontSize: 12, fontWeight: "800", textAlign: "center" },
  tocSheet: { maxHeight: "75%" },
  tocRow: { borderRadius: radii.md, paddingRight: spacing.sm, paddingVertical: 12 },
  tocText: { fontFamily: fonts.body, fontSize: 15 },
  sheetOverlay: { backgroundColor: "rgba(0,0,0,0.35)", flex: 1, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, gap: spacing.sm, padding: spacing.lg },
  sheetLabel: { fontFamily: fonts.body, fontSize: 12, fontWeight: "900", letterSpacing: 0.8, marginTop: spacing.xs, textTransform: "uppercase" },
  row: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  swatch: { alignItems: "center", borderRadius: radii.md, borderWidth: 2, flex: 1, paddingVertical: 14 },
  sizeBtn: { alignItems: "center", borderRadius: 22, borderWidth: 1, height: 44, justifyContent: "center", width: 64 },
  sizeValue: { flex: 1, fontFamily: fonts.body, fontSize: 16, fontWeight: "800", textAlign: "center" },
  fontChip: { alignItems: "center", borderRadius: radii.pill, borderWidth: 1.5, flexDirection: "row", gap: 6, paddingHorizontal: 14, paddingVertical: 9 },
});
