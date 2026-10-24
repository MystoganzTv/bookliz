/**
 * Log / edit a reading session.
 *
 * Built around the one thing that matters — the page you stopped on — with
 * time and day on one line beneath it and everything else behind "More
 * details". Nothing is pre-filled that the reader did not tell us: no default
 * 45 minutes, no default place. The arithmetic lives in data/sessionProgress.
 *
 * Start time: the one exception, and only because it is not a guess. A session
 * logged for today began `minutes` ago (utils/sessionTime.defaultStartTime);
 * one from the timer began when the timer did. A past day gets no time unless
 * the reader types one.
 */
import { Ionicons } from "@expo/vector-icons";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { BookCover } from "../components/BookCover";
import { useDialog } from "../components/DialogProvider";
import { Screen } from "../components/Screen";
import { ValueSlider } from "../components/ValueSlider";
import { useBookliz } from "../data/BooklizContext";
import {
  audioRange,
  defaultSessionFormat,
  pageRange,
  percentOf,
  progressBase,
  resumeUnits,
  sessionPlace
} from "../data/sessionProgress";
import { useI18n } from "../i18n/LocalizationContext";
import { RootStackParamList } from "../navigation/types";
import { AppColors, fonts, radii, shadows, spacing } from "../theme/theme";
import { useColors, useTheme } from "../theme/ThemeContext";
import { Book, NewReadingSessionInput, ReadingFormat, ReadingSession } from "../types/models";
import { localDateKey, parseDateKey, shiftDateKey } from "../utils/dateUtils";
import { formatMinutes } from "../utils/duration";
import { defaultStartTime, parseTimeKey, parseTypedTime, timeKey, timeKeyOf } from "../utils/sessionTime";
import { hapticSuccess } from "../utils/haptics";

const QUICK_MINUTES = [15, 30, 45, 60, 90, 120];
const MAX_PLACE_CHIPS = 5;
const MAX_PICKER_RESULTS = 8;
/** iOS number pads have no return key; this bar gives them a "Done". */
const KEYBOARD_DONE_ID = "logSessionKeyboardDone";

const parsePositive = (text: string): number | null => {
  const value = parseInt(text.trim(), 10);
  return Number.isFinite(value) && value > 0 ? value : null;
};

export function AddReadingSessionScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "AddReadingSession">>();
  const { books, getBook, getReadingSession } = useBookliz();
  const { t } = useI18n();
  const c = useColors();

  const editingSession = route.params?.sessionId ? getReadingSession(route.params.sessionId) : undefined;
  const prefillMinutes =
    typeof route.params?.prefillMinutes === "number" && Number.isFinite(route.params.prefillMinutes)
      ? Math.max(1, Math.round(route.params.prefillMinutes))
      : undefined;
  const prefillStartedAt =
    typeof route.params?.prefillStartedAt === "number" && Number.isFinite(route.params.prefillStartedAt)
      ? route.params.prefillStartedAt
      : undefined;

  const [bookId, setBookId] = useState(
    editingSession?.bookId ??
      route.params?.bookId ??
      books.find((b) => b.userStatus.status === "reading")?.id ??
      books[0]?.id
  );
  const book = bookId ? getBook(bookId) : undefined;

  if (!book) {
    return (
      <Screen>
        <Text style={{ color: c.muted, fontFamily: fonts.body, fontSize: 15, marginTop: spacing.lg, textAlign: "center" }}>
          {t("logSession.noBooks")}
        </Text>
      </Screen>
    );
  }

  // Keyed by book (and its page count) so switching books, or giving one its
  // page count, starts the form clean — no page, start page or format left
  // over from the previous book.
  return (
    <SessionForm
      key={`${book.id}:${book.pages}`}
      book={book}
      editingSession={editingSession}
      prefillMinutes={prefillMinutes}
      prefillStartedAt={prefillStartedAt}
      onChangeBook={setBookId}
    />
  );
}

type SessionFormProps = {
  book: Book;
  editingSession?: ReadingSession;
  prefillMinutes?: number;
  /** Date.now() when the reading timer started — the real start of this session. */
  prefillStartedAt?: number;
  onChangeBook: (bookId: string) => void;
};

function SessionForm({ book, editingSession, prefillMinutes, prefillStartedAt, onChangeBook }: SessionFormProps) {
  const c = useColors();
  const { isDark } = useTheme();
  const { t, locale } = useI18n();
  const styles = useMemo(() => createStyles(c, isDark), [c, isDark]);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const dialog = useDialog();
  const {
    addReadingSession,
    books,
    deleteReadingSession,
    getAuthor,
    readingSessions,
    updateBookPages,
    updateReadingSession
  } = useBookliz();

  const isEditing = Boolean(editingSession);
  const today = localDateKey();
  const doneId = Platform.OS === "ios" ? KEYBOARD_DONE_ID : undefined;

  /** This book's other sessions — the one being edited never counts as "where you were". */
  const bookSessions = useMemo(
    () => readingSessions.filter((s) => s.bookId === book.id && s.id !== editingSession?.id),
    [readingSessions, book.id, editingSession?.id]
  );

  // ── Format ─────────────────────────────────────────────────────────────
  const [format, setFormat] = useState<ReadingFormat>(
    editingSession?.format ?? defaultSessionFormat(book.format, bookSessions)
  );
  const isAudiobook = format === "audiobook";
  const hasPageCount = book.pages > 0;
  const base = progressBase(book.pages, format);
  const canTrack = base > 0;
  const total = Math.max(1, book.pages);

  /** Last unit already read. Editing: the page before the session started. */
  const resume = editingSession
    ? Math.max(0, editingSession.startPage - 1)
    : resumeUnits(book.userStatus.progressPercent, base, bookSessions);
  const resumePct = percentOf(resume, base);

  // ── Pages (physical / Kindle) ──────────────────────────────────────────
  const [endText, setEndText] = useState(
    editingSession && editingSession.format !== "audiobook" ? String(editingSession.endPage) : ""
  );
  const [startText, setStartText] = useState("");
  const typedEnd = parsePositive(endText) ?? (endText.trim() === "0" ? 0 : null);
  const typedStart = parsePositive(startText);
  const pages = pageRange(resume, typedEnd, typedStart, total);

  const nudgePage = (delta: number) => {
    const from = typedEnd ?? resume;
    const next = Math.min(total, Math.max(Math.max(0, pages.startPage - 1), from + delta));
    setEndText(String(next));
  };

  // ── Audiobook ──────────────────────────────────────────────────────────
  const durationMinutes = book.durationMinutes ?? 0;
  const hasDuration = durationMinutes > 0;
  const [rawPct, setCurrentPct] = useState(
    editingSession && editingSession.format === "audiobook" ? percentOf(editingSession.endPage, base) : resumePct
  );
  // Never below where the book already was — matters when the format is switched mid-form.
  const currentPct = Math.max(rawPct, resumePct);
  const audio = audioRange(resume, currentPct, base);
  const listenedMinutes = Math.round((currentPct / 100) * durationMinutes);
  const [audioInputOpen, setAudioInputOpen] = useState(false);
  const [audioText, setAudioText] = useState("");

  const setPct = (pct: number) => setCurrentPct(Math.min(100, Math.max(resumePct, Math.round(pct))));
  const nudgeAudio = (delta: number) => {
    if (hasDuration) setPct(((listenedMinutes + delta) / durationMinutes) * 100);
    else setPct(currentPct + delta);
  };
  const commitAudioText = () => {
    const typed = parseInt(audioText, 10);
    if (Number.isFinite(typed)) setPct(hasDuration ? (typed / durationMinutes) * 100 : typed);
    setAudioInputOpen(false);
  };

  // ── Time ───────────────────────────────────────────────────────────────
  const initialMinutes = editingSession?.minutesRead ?? prefillMinutes ?? null;
  const [minutes, setMinutes] = useState<number | null>(initialMinutes);
  const [customMinutesOpen, setCustomMinutesOpen] = useState(false);
  const [customMinutesText, setCustomMinutesText] = useState(initialMinutes ? String(initialMinutes) : "");
  const minutesIsCustom = minutes !== null && !QUICK_MINUTES.includes(minutes);

  // ── Day ────────────────────────────────────────────────────────────────
  // A timer started before midnight belongs to the day it started on.
  const timerStart = prefillStartedAt !== undefined ? new Date(prefillStartedAt) : undefined;
  const [date, setDate] = useState(editingSession?.date ?? (timerStart ? localDateKey(timerStart) : today));
  const yesterday = shiftDateKey(today, -1);
  const dateLabel =
    date === today
      ? t("logSession.today")
      : date === yesterday
        ? t("logSession.yesterday")
        : (parseDateKey(date) ?? new Date()).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });

  // ── Start time ─────────────────────────────────────────────────────────
  // undefined = follow the default (which moves with the minutes and the day),
  // null = no time (cleared, or an old session that never had one),
  // "HH:MM" = set by the reader or by the timer.
  const [explicitTime, setExplicitTime] = useState<string | null | undefined>(
    editingSession ? editingSession.startTime ?? null : timerStart ? timeKeyOf(timerStart) : undefined
  );
  const startTime =
    explicitTime === undefined
      ? defaultStartTime({ date, today, minutesRead: minutes, now: new Date() })
      : explicitTime ?? undefined;
  const startMinutes = parseTimeKey(startTime);
  const [timeInputOpen, setTimeInputOpen] = useState(false);
  const [timeText, setTimeText] = useState("");
  const timeLabel = (() => {
    if (startMinutes === null) return "";
    const at = parseDateKey(date) ?? new Date();
    at.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
    return at.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  })();
  const nudgeTime = (delta: number) => {
    if (startMinutes !== null) setExplicitTime(timeKey(startMinutes + delta));
  };
  const openTimeInput = () => {
    setTimeText(startTime ? startTime.replace(":", "") : "");
    setTimeInputOpen(true);
  };
  const commitTimeText = () => {
    const typed = parseTypedTime(timeText);
    if (typed !== null) setExplicitTime(timeKey(typed));
    setTimeInputOpen(false);
  };

  // ── Details: place + note ──────────────────────────────────────────────
  const editingPlace = sessionPlace(editingSession?.location);
  const editingNote = editingSession?.notes ?? "";
  const [detailsOpen, setDetailsOpen] = useState(Boolean(editingPlace || editingNote.trim()));
  const placeOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    const push = (value: string) => {
      const place = sessionPlace(value);
      const k = place.toLowerCase();
      if (place && !seen.has(k)) {
        seen.add(k);
        out.push(place);
      }
    };
    readingSessions.forEach((s) => push(s.location));
    [t("logSession.locHome"), t("logSession.locCafe"), t("logSession.locLibrary")].forEach(push);
    return out.slice(0, MAX_PLACE_CHIPS);
  }, [readingSessions, t]);
  const [place, setPlace] = useState(editingPlace);
  const [customPlaceOpen, setCustomPlaceOpen] = useState(Boolean(editingPlace && !placeOptions.includes(editingPlace)));
  const [note, setNote] = useState(editingNote);

  // ── Book picker ────────────────────────────────────────────────────────
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const pickerResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = books.filter((b) => b.id !== book.id);
    if (!q) return pool.filter((b) => b.userStatus.status === "reading").slice(0, MAX_PICKER_RESULTS);
    return pool
      .filter((b) => b.title.toLowerCase().includes(q) || (getAuthor(b.authorId)?.name ?? "").toLowerCase().includes(q))
      .slice(0, MAX_PICKER_RESULTS);
  }, [books, book.id, query, getAuthor]);

  // ── Page count prompt ──────────────────────────────────────────────────
  const [pageCountText, setPageCountText] = useState("");

  // ── Derived summary ────────────────────────────────────────────────────
  const hasProgress = isAudiobook ? audio.gainedPct > 0 : pages.pagesRead > 0;
  const endPct = isAudiobook ? currentPct : hasProgress ? percentOf(pages.endPage, total) : resumePct;
  const speed = !isAudiobook && minutes && minutes > 0 ? Math.round((pages.pagesRead / minutes) * 60) : 0;
  const pagesLabel = (n: number) =>
    n === 1 ? t("logSession.pagesOne") : t("logSession.pagesMany", { count: n });
  const formatLabel = (value: ReadingFormat) =>
    value === "audiobook"
      ? t("logSession.formatAudiobook")
      : value === "kindle"
        ? t("logSession.formatKindle")
        : t("logSession.formatPhysical");
  const detailsSummary = [formatLabel(format), place || null, note.trim() ? t("logSession.hasNote") : null]
    .filter(Boolean)
    .join(" · ");
  const ready = canTrack && hasProgress && minutes !== null && minutes > 0;

  const handleSave = () => {
    if (!canTrack) {
      dialog.alert(t("session.checkTitle"), t("session.needsPageCount"));
      return;
    }
    if (isAudiobook ? audio.gainedPct === 0 : typedEnd === null) {
      dialog.alert(t("session.checkTitle"), isAudiobook ? t("logSession.noProgressBody") : t("logSession.missingEnd"));
      return;
    }
    if (!isAudiobook && pages.pagesRead === 0) {
      dialog.alert(t("session.checkTitle"), t("logSession.endBeforeStart", { start: pages.startPage }));
      return;
    }
    if (!(minutes && minutes > 0)) {
      dialog.alert(t("session.checkTitle"), t("session.invalidMinutes"));
      return;
    }
    if (!parseDateKey(date) || date > today) {
      dialog.alert(t("session.checkTitle"), t("session.invalidDate"));
      return;
    }
    if (startMinutes !== null && date === today) {
      const now = new Date();
      if (startMinutes > now.getHours() * 60 + now.getMinutes()) {
        dialog.alert(t("session.checkTitle"), t("logSession.futureTime"));
        return;
      }
    }

    const input: NewReadingSessionInput = {
      bookId: book.id,
      date,
      startTime,
      startPage: isAudiobook ? audio.startPage : pages.startPage,
      endPage: isAudiobook ? audio.endPage : pages.endPage,
      minutesRead: minutes,
      location: place.trim(),
      mood: "—",
      format,
      notes: note.trim()
    };
    if (editingSession) updateReadingSession(editingSession.id, input);
    else addReadingSession(input);
    hapticSuccess();
    navigation.goBack();
  };

  const deleteSession = () => {
    if (!editingSession) return;
    dialog.confirm({
      title: t("logSession.deleteTitle"),
      body: t("logSession.deleteBody"),
      confirmLabel: t("logSession.deleteConfirm"),
      destructive: true,
      onConfirm: () => {
        deleteReadingSession(editingSession.id);
        navigation.goBack();
      }
    });
  };

  const savePageCount = () => {
    const value = parsePositive(pageCountText);
    if (value) updateBookPages(book.id, value);
  };

  // ── Render ─────────────────────────────────────────────────────────────
  const resumeCaption = isAudiobook
    ? t("logSession.resumeAudio", { position: hasDuration ? formatMinutes((resumePct / 100) * durationMinutes) : `${resumePct}%` })
    : typedStart
      ? t("logSession.fromPage", { page: pages.startPage })
      : resume > 0
        ? t("logSession.resumeFrom", { page: resume })
        : t("logSession.resumeStart");

  return (
    <Screen>
      <Text style={styles.pageTitle}>{isEditing ? t("logSession.titleEdit") : t("logSession.titleNew")}</Text>

      {/* Book */}
      <View style={styles.bookCard}>
        <BookCover book={book} size="sm" hideProgress />
        <View style={styles.bookInfo}>
          <Text style={styles.bookTitle} numberOfLines={2}>{book.title}</Text>
          <Text style={styles.bookAuthor} numberOfLines={1}>{getAuthor(book.authorId)?.name}</Text>
          {canTrack ? (
            <>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${Math.min(resumePct, endPct)}%` }]} />
                {endPct > resumePct ? (
                  <View style={[styles.progressNew, { left: `${resumePct}%`, width: `${endPct - resumePct}%` }]} />
                ) : null}
              </View>
              <Text style={styles.progressLabel}>{t("logSession.percentComplete", { percent: endPct })}</Text>
            </>
          ) : null}
        </View>
        {!isEditing && books.length > 1 ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => setPickerOpen((v) => !v)}
            style={styles.changeBtn}
          >
            <Text style={styles.changeBtnText}>{pickerOpen ? t("common.cancel") : t("logSession.changeBook")}</Text>
          </Pressable>
        ) : null}
      </View>

      {pickerOpen ? (
        <View style={styles.card}>
          <TextInput
            autoCorrect={false}
            placeholder={t("logSession.searchBooks")}
            placeholderTextColor={c.gray}
            style={styles.input}
            value={query}
            onChangeText={setQuery}
          />
          {!query.trim() && pickerResults.length > 0 ? (
            <Text style={styles.sectionLabel}>{t("logSession.readingNow")}</Text>
          ) : null}
          {pickerResults.map((b) => (
            <Pressable accessibilityRole="button" key={b.id} onPress={() => onChangeBook(b.id)} style={styles.pickerRow}>
              <Text style={styles.pickerTitle} numberOfLines={1}>{b.title}</Text>
              <Text style={styles.pickerAuthor} numberOfLines={1}>{getAuthor(b.authorId)?.name}</Text>
            </Pressable>
          ))}
          {query.trim() && pickerResults.length === 0 ? (
            <Text style={styles.hint}>{t("logSession.noBookMatches")}</Text>
          ) : null}
        </View>
      ) : null}

      {/* Where you are now */}
      {!canTrack ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("logSession.pageCountTitle")}</Text>
          <Text style={styles.hint}>{t("logSession.pageCountBody")}</Text>
          <View style={styles.inlineRow}>
            <TextInput
              inputAccessoryViewID={doneId}
              keyboardType="number-pad"
              placeholder={t("logSession.pageCountPlaceholder")}
              placeholderTextColor={c.gray}
              style={[styles.input, styles.inlineInput]}
              value={pageCountText}
              onChangeText={setPageCountText}
            />
            <Pressable
              accessibilityRole="button"
              onPress={savePageCount}
              style={[styles.smallBtn, !parsePositive(pageCountText) && styles.smallBtnOff]}
            >
              <Text style={styles.smallBtnText}>{t("logSession.pageCountSave")}</Text>
            </Pressable>
          </View>
        </View>
      ) : isAudiobook ? (
        <View style={styles.mainCard}>
          <Text style={styles.sectionLabel}>{t("logSession.listenedTo")}</Text>
          <View style={styles.stepper}>
            <Pressable accessibilityRole="button" style={styles.stepBtn} onPress={() => nudgeAudio(hasDuration ? -15 : -5)}>
              <Text style={styles.stepBtnText}>{hasDuration ? "−15m" : "−5%"}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("a11y.decreasePercent")}
              style={styles.stepBtnSm}
              onPress={() => nudgeAudio(hasDuration ? -5 : -1)}
            >
              <Ionicons name="remove" size={18} color={c.ink} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={styles.bigValue}
              onPress={() => {
                setAudioText(String(hasDuration ? listenedMinutes : currentPct));
                setAudioInputOpen(true);
              }}
            >
              {audioInputOpen ? (
                <TextInput
                  autoFocus
                  inputAccessoryViewID={doneId}
                  keyboardType="number-pad"
                  selectTextOnFocus
                  style={styles.bigInput}
                  value={audioText}
                  onBlur={commitAudioText}
                  onChangeText={setAudioText}
                  onSubmitEditing={commitAudioText}
                />
              ) : (
                <Text style={styles.bigNumber}>{hasDuration ? formatMinutes(listenedMinutes) : `${currentPct}%`}</Text>
              )}
              <Text style={styles.bigOf}>
                {hasDuration
                  ? t("logSession.ofTotal", { total: formatMinutes(durationMinutes) })
                  : t("logSession.ofBook")}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("a11y.increasePercent")}
              style={styles.stepBtnSm}
              onPress={() => nudgeAudio(hasDuration ? 5 : 1)}
            >
              <Ionicons name="add" size={18} color={c.ink} />
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.stepBtn} onPress={() => nudgeAudio(hasDuration ? 15 : 5)}>
              <Text style={styles.stepBtnText}>{hasDuration ? "+15m" : "+5%"}</Text>
            </Pressable>
          </View>
          <ValueSlider
            accessibilityLabel={t("logSession.listenedTo")}
            max={100}
            min={resumePct}
            value={currentPct}
            onChange={setPct}
          />
          <Text style={styles.caption}>
            {audio.gainedPct > 0 ? t("logSession.gainedPct", { percent: audio.gainedPct }) : resumeCaption}
          </Text>
        </View>
      ) : (
        <View style={styles.mainCard}>
          <Text style={styles.sectionLabel}>{t("logSession.readUpTo")}</Text>
          <View style={styles.stepper}>
            <Pressable accessibilityRole="button" style={styles.stepBtn} onPress={() => nudgePage(-10)}>
              <Text style={styles.stepBtnText}>−10</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("a11y.decreasePage")}
              style={styles.stepBtnSm}
              onPress={() => nudgePage(-1)}
            >
              <Ionicons name="remove" size={18} color={c.ink} />
            </Pressable>
            <View style={styles.bigValue}>
              <TextInput
                accessibilityLabel={t("logSession.readUpTo")}
                autoFocus={!isEditing}
                inputAccessoryViewID={doneId}
                keyboardType="number-pad"
                maxLength={5}
                placeholder={String(resume)}
                placeholderTextColor={c.gray}
                selectTextOnFocus
                style={styles.bigInput}
                value={endText}
                onChangeText={(text) => setEndText(text.replace(/[^0-9]/g, ""))}
              />
              <Text style={styles.bigOf}>{t("logSession.ofTotal", { total })}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("a11y.increasePage")}
              style={styles.stepBtnSm}
              onPress={() => nudgePage(1)}
            >
              <Ionicons name="add" size={18} color={c.ink} />
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.stepBtn} onPress={() => nudgePage(10)}>
              <Text style={styles.stepBtnText}>+10</Text>
            </Pressable>
          </View>
          {pages.pagesRead > 0 ? (
            <Text style={styles.pill}>{pagesLabel(pages.pagesRead)}</Text>
          ) : (
            <Text style={styles.caption}>{resumeCaption}</Text>
          )}
        </View>
      )}

      {/* Time + day, one card */}
      <View style={styles.card}>
        <View style={styles.rowHeader}>
          <Text style={styles.sectionLabel}>{isAudiobook ? t("logSession.timeListened") : t("logSession.timeSpent")}</Text>
          {prefillMinutes !== undefined && minutes === prefillMinutes && !isEditing ? (
            <Text style={styles.helper}>{t("logSession.fromTimer")}</Text>
          ) : null}
        </View>
        <View style={styles.chipRow}>
          {QUICK_MINUTES.map((m) => {
            const active = !customMinutesOpen && minutes === m;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                key={m}
                onPress={() => {
                  setMinutes(m);
                  setCustomMinutesOpen(false);
                }}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{formatMinutes(m)}</Text>
              </Pressable>
            );
          })}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: customMinutesOpen || minutesIsCustom }}
            onPress={() => {
              setCustomMinutesText(minutes ? String(minutes) : "");
              setCustomMinutesOpen(true);
            }}
            style={[styles.chip, (customMinutesOpen || minutesIsCustom) && styles.chipActive]}
          >
            <Text style={[styles.chipText, (customMinutesOpen || minutesIsCustom) && styles.chipTextActive]}>
              {minutesIsCustom && minutes ? formatMinutes(minutes) : t("logSession.minutesCustom")}
            </Text>
          </Pressable>
        </View>
        {customMinutesOpen ? (
          <TextInput
            autoFocus
            inputAccessoryViewID={doneId}
            keyboardType="number-pad"
            placeholder={t("logSession.minutesPlaceholder")}
            placeholderTextColor={c.gray}
            style={styles.input}
            value={customMinutesText}
            onChangeText={(text) => {
              const clean = text.replace(/[^0-9]/g, "");
              setCustomMinutesText(clean);
              setMinutes(parsePositive(clean));
            }}
          />
        ) : null}

        <View style={styles.divider} />

        <View style={styles.dayRow}>
          <Text style={styles.sectionLabel}>{t("logSession.dateLabel")}</Text>
          <View style={styles.dayStepper}>
            <Pressable
              accessibilityLabel={t("logSession.prevDay")}
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setDate((d) => shiftDateKey(d, -1))}
              style={styles.dayBtn}
            >
              <Ionicons name="chevron-back" size={18} color={c.ink} />
            </Pressable>
            <Text style={styles.dayLabel}>{dateLabel}</Text>
            <Pressable
              accessibilityLabel={t("logSession.nextDay")}
              accessibilityRole="button"
              accessibilityState={{ disabled: date >= today }}
              disabled={date >= today}
              hitSlop={8}
              onPress={() => setDate((d) => (d >= today ? d : shiftDateKey(d, 1)))}
              style={[styles.dayBtn, date >= today && styles.dayBtnOff]}
            >
              <Ionicons name="chevron-forward" size={18} color={c.ink} />
            </Pressable>
          </View>
        </View>

        <View style={[styles.dayRow, styles.timeRow]}>
          <Text style={styles.sectionLabel}>{t("logSession.timeOfDayLabel")}</Text>
          {startTime ? (
            <View style={styles.dayStepper}>
              <Pressable
                accessibilityLabel={t("logSession.earlier")}
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => nudgeTime(-15)}
                style={styles.dayBtn}
              >
                <Ionicons name="remove" size={18} color={c.ink} />
              </Pressable>
              <Pressable accessibilityLabel={t("logSession.editTime")} accessibilityRole="button" hitSlop={8} onPress={openTimeInput}>
                <Text style={styles.dayLabel}>{timeLabel}</Text>
              </Pressable>
              <Pressable
                accessibilityLabel={t("logSession.later")}
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => nudgeTime(15)}
                style={styles.dayBtn}
              >
                <Ionicons name="add" size={18} color={c.ink} />
              </Pressable>
            </View>
          ) : (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={openTimeInput} style={styles.addTimeBtn}>
              <Ionicons name="time-outline" size={16} color={c.tealDark} />
              <Text style={styles.addTimeText}>{t("logSession.addTime")}</Text>
            </Pressable>
          )}
        </View>
        {timeInputOpen ? (
          <TextInput
            autoFocus
            inputAccessoryViewID={doneId}
            keyboardType="number-pad"
            maxLength={5}
            placeholder={t("logSession.timePlaceholder")}
            placeholderTextColor={c.gray}
            style={styles.input}
            value={timeText}
            onChangeText={(text) => setTimeText(text.replace(/[^0-9:]/g, ""))}
            onEndEditing={commitTimeText}
            onSubmitEditing={commitTimeText}
          />
        ) : null}
        <View style={styles.timeFooter}>
          <Text style={[styles.hint, styles.timeHint]}>{t("logSession.timeHint")}</Text>
          {startTime ? (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => { setExplicitTime(null); setTimeInputOpen(false); }}>
              <Text style={styles.clearTimeText}>{t("logSession.clearTime")}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* More details */}
      <Pressable accessibilityRole="button" onPress={() => setDetailsOpen((v) => !v)} style={styles.detailsToggle}>
        <Ionicons name={detailsOpen ? "chevron-up" : "chevron-down"} size={16} color={c.muted} />
        <Text style={styles.detailsToggleText}>
          {detailsOpen ? t("logSession.lessDetails") : t("logSession.moreDetails")}
        </Text>
        {!detailsOpen ? <Text style={styles.detailsSummary} numberOfLines={1}>{detailsSummary}</Text> : null}
      </Pressable>

      {detailsOpen ? (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>{t("logSession.formatLabel")}</Text>
          <View style={styles.chipRow}>
            {(["physical", "kindle", "audiobook"] as ReadingFormat[]).map((value) => {
              const active = format === value;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  key={value}
                  onPress={() => setFormat(value)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{formatLabel(value)}</Text>
                </Pressable>
              );
            })}
          </View>

          {!isAudiobook && canTrack ? (
            <>
              <View style={styles.divider} />
              <View style={styles.inlineRow}>
                <Text style={[styles.sectionLabel, styles.inlineLabel]}>{t("logSession.startPageLabel")}</Text>
                <TextInput
                  inputAccessoryViewID={doneId}
                  keyboardType="number-pad"
                  maxLength={5}
                  placeholder={String(resume + 1)}
                  placeholderTextColor={c.gray}
                  style={[styles.input, styles.startInput]}
                  value={startText}
                  onChangeText={(text) => setStartText(text.replace(/[^0-9]/g, ""))}
                />
              </View>
              <Text style={styles.hint}>{t("logSession.hintStartPage")}</Text>
            </>
          ) : null}

          <View style={styles.divider} />
          <Text style={styles.sectionLabel}>{t("logSession.locationLabel")}</Text>
          <View style={styles.chipRow}>
            {placeOptions.map((option) => {
              const active = !customPlaceOpen && place === option;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  key={option}
                  onPress={() => {
                    setCustomPlaceOpen(false);
                    setPlace(active ? "" : option);
                  }}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{option}</Text>
                </Pressable>
              );
            })}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: customPlaceOpen }}
              onPress={() => {
                if (!customPlaceOpen && placeOptions.includes(place)) setPlace("");
                setCustomPlaceOpen(true);
              }}
              style={[styles.chip, customPlaceOpen && styles.chipActive]}
            >
              <Text style={[styles.chipText, customPlaceOpen && styles.chipTextActive]}>{t("logSession.locationCustom")}</Text>
            </Pressable>
          </View>
          {customPlaceOpen ? (
            <TextInput
              autoFocus
              placeholder={t("logSession.locationPlaceholder")}
              placeholderTextColor={c.gray}
              style={styles.input}
              value={place}
              onChangeText={setPlace}
            />
          ) : null}
          <Text style={styles.hint}>{t("logSession.hintLocation")}</Text>

          <View style={styles.divider} />
          <Text style={styles.sectionLabel}>{t("logSession.noteLabel")}</Text>
          <TextInput
            multiline
            placeholder={t("logSession.notePlaceholder")}
            placeholderTextColor={c.gray}
            style={[styles.input, styles.noteInput]}
            value={note}
            onChangeText={setNote}
          />
        </View>
      ) : null}

      {/* Save */}
      {ready ? (
        <Text style={styles.summary}>
          {isAudiobook
            ? `${t("logSession.gainedPct", { percent: audio.gainedPct })} · ${formatMinutes(minutes ?? 0)}`
            : `${pagesLabel(pages.pagesRead)} · ${formatMinutes(minutes ?? 0)} · ${t("logSession.speed", { speed })}`}
        </Text>
      ) : null}
      <Pressable accessibilityRole="button" onPress={handleSave} style={[styles.saveButton, !ready && styles.saveButtonIdle]}>
        <Text style={styles.saveButtonText}>{isEditing ? t("logSession.updateSession") : t("logSession.saveSession")}</Text>
      </Pressable>
      {isEditing ? (
        <Pressable accessibilityRole="button" onPress={deleteSession} style={styles.deleteButton}>
          <Text style={styles.deleteButtonText}>{t("logSession.deleteSession")}</Text>
        </Pressable>
      ) : null}

      {doneId ? (
        <InputAccessoryView nativeID={doneId}>
          <View style={styles.accessory}>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => Keyboard.dismiss()}>
              <Text style={styles.accessoryText}>{t("logSession.keyboardDone")}</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      ) : null}
    </Screen>
  );
}

function createStyles(c: AppColors, isDark: boolean) {
  const accent = isDark ? c.teal : c.navy;
  return StyleSheet.create({
    pageTitle: {
      color: c.ink,
      fontFamily: fonts.display,
      fontSize: 24,
      fontWeight: "900",
      marginBottom: spacing.md
    },
    bookCard: {
      ...shadows.card,
      alignItems: "center",
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: radii.lg,
      borderWidth: 1,
      flexDirection: "row",
      gap: spacing.md,
      marginBottom: spacing.md,
      padding: spacing.md
    },
    bookInfo: {
      flex: 1
    },
    bookTitle: {
      color: c.ink,
      fontFamily: fonts.display,
      fontSize: 16,
      fontWeight: "900",
      lineHeight: 20
    },
    bookAuthor: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 13,
      marginTop: 2
    },
    progressBar: {
      backgroundColor: c.border,
      borderRadius: radii.pill,
      height: 6,
      marginTop: spacing.sm,
      overflow: "hidden",
      position: "relative"
    },
    progressFill: {
      backgroundColor: isDark ? "rgba(255,255,255,0.28)" : c.muted,
      height: "100%",
      position: "absolute"
    },
    progressNew: {
      backgroundColor: c.teal,
      height: "100%",
      position: "absolute"
    },
    progressLabel: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 11,
      fontWeight: "800",
      marginTop: 4
    },
    changeBtn: {
      alignSelf: "flex-start",
      paddingVertical: 4
    },
    changeBtnText: {
      color: c.tealDark,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: "900"
    },
    card: {
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: radii.lg,
      borderWidth: 1,
      marginBottom: spacing.md,
      padding: spacing.md
    },
    cardTitle: {
      color: c.ink,
      fontFamily: fonts.display,
      fontSize: 17,
      fontWeight: "900"
    },
    mainCard: {
      ...shadows.card,
      alignItems: "center",
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: radii.lg,
      borderWidth: 1,
      marginBottom: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.lg
    },
    sectionLabel: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 1,
      marginBottom: spacing.sm,
      textTransform: "uppercase"
    },
    rowHeader: {
      alignItems: "baseline",
      flexDirection: "row",
      justifyContent: "space-between"
    },
    helper: {
      color: c.tealDark,
      fontFamily: fonts.body,
      fontSize: 11,
      fontWeight: "800"
    },
    stepper: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm
    },
    stepBtn: {
      alignItems: "center",
      backgroundColor: c.surfaceAlt,
      borderColor: c.border,
      borderRadius: radii.md,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 40,
      paddingHorizontal: spacing.sm + 2
    },
    stepBtnText: {
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: "900"
    },
    stepBtnSm: {
      alignItems: "center",
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: radii.md,
      borderWidth: 1,
      height: 40,
      justifyContent: "center",
      width: 40
    },
    bigValue: {
      alignItems: "center",
      flex: 1,
      minWidth: 90
    },
    bigNumber: {
      color: c.ink,
      fontFamily: fonts.display,
      fontSize: 44,
      fontWeight: "900",
      lineHeight: 52
    },
    bigInput: {
      color: c.ink,
      fontFamily: fonts.display,
      fontSize: 44,
      fontWeight: "900",
      lineHeight: 52,
      minWidth: 90,
      padding: 0,
      textAlign: "center"
    },
    bigOf: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: "800"
    },
    caption: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: "700",
      marginTop: spacing.md,
      textAlign: "center"
    },
    pill: {
      backgroundColor: c.teal + "22",
      borderRadius: radii.pill,
      color: c.tealDark,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: "900",
      marginTop: spacing.md,
      overflow: "hidden",
      paddingHorizontal: spacing.md,
      paddingVertical: 6
    },
    hint: {
      color: c.muted,
      fontFamily: fonts.bodyRegular,
      fontSize: 12,
      lineHeight: 17,
      marginTop: spacing.sm
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.xs
    },
    chip: {
      alignItems: "center",
      borderColor: c.border,
      borderRadius: radii.pill,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 40,
      paddingHorizontal: spacing.md
    },
    chipActive: {
      backgroundColor: accent,
      borderColor: accent
    },
    chipText: {
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: "900"
    },
    chipTextActive: {
      color: "#fff"
    },
    input: {
      backgroundColor: c.surfaceAlt,
      borderColor: c.border,
      borderRadius: radii.md,
      borderWidth: 1,
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 16,
      fontWeight: "800",
      marginTop: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: 12
    },
    inlineRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm
    },
    inlineLabel: {
      flex: 1,
      marginBottom: 0
    },
    inlineInput: {
      flex: 1
    },
    startInput: {
      marginTop: 0,
      minWidth: 96,
      textAlign: "center"
    },
    noteInput: {
      fontSize: 14,
      fontWeight: "600",
      minHeight: 80,
      textAlignVertical: "top"
    },
    smallBtn: {
      backgroundColor: accent,
      borderRadius: radii.pill,
      marginTop: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: 12
    },
    smallBtnOff: {
      opacity: 0.4
    },
    smallBtnText: {
      color: "#fff",
      fontFamily: fonts.body,
      fontSize: 14,
      fontWeight: "900"
    },
    divider: {
      backgroundColor: c.border,
      height: StyleSheet.hairlineWidth,
      marginVertical: spacing.md
    },
    dayRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between"
    },
    dayStepper: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm
    },
    dayBtn: {
      alignItems: "center",
      borderColor: c.border,
      borderRadius: radii.pill,
      borderWidth: 1,
      height: 36,
      justifyContent: "center",
      width: 36
    },
    dayBtnOff: {
      opacity: 0.3
    },
    timeRow: {
      marginTop: spacing.md
    },
    addTimeBtn: {
      alignItems: "center",
      borderColor: c.border,
      borderRadius: radii.pill,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      height: 36,
      paddingHorizontal: spacing.md
    },
    addTimeText: {
      color: c.tealDark,
      fontFamily: fonts.body,
      fontSize: 14,
      fontWeight: "800"
    },
    timeFooter: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: spacing.md,
      justifyContent: "space-between"
    },
    timeHint: {
      flex: 1
    },
    clearTimeText: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 12,
      fontWeight: "800",
      marginTop: spacing.sm
    },
    dayLabel: {
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 15,
      fontWeight: "900",
      minWidth: 96,
      textAlign: "center"
    },
    detailsToggle: {
      alignItems: "center",
      flexDirection: "row",
      gap: 6,
      marginBottom: spacing.md,
      paddingVertical: 6
    },
    detailsToggleText: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: "900"
    },
    detailsSummary: {
      color: c.gray,
      flex: 1,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: "700"
    },
    pickerRow: {
      borderBottomColor: c.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      paddingVertical: 10
    },
    pickerTitle: {
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 14,
      fontWeight: "900"
    },
    pickerAuthor: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 12,
      marginTop: 1
    },
    summary: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: "800",
      marginBottom: spacing.sm,
      textAlign: "center"
    },
    saveButton: {
      backgroundColor: accent,
      borderRadius: radii.pill,
      paddingVertical: 16
    },
    saveButtonIdle: {
      opacity: 0.55
    },
    saveButtonText: {
      color: "#FFFFFF",
      fontFamily: fonts.body,
      fontSize: 15,
      fontWeight: "900",
      textAlign: "center"
    },
    deleteButton: {
      borderColor: c.danger,
      borderRadius: radii.pill,
      borderWidth: 1,
      marginTop: spacing.sm,
      paddingVertical: 15
    },
    deleteButtonText: {
      color: c.danger,
      fontFamily: fonts.body,
      fontSize: 14,
      fontWeight: "900",
      textAlign: "center"
    },
    accessory: {
      alignItems: "flex-end",
      backgroundColor: c.surfaceAlt,
      borderTopColor: c.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: spacing.md,
      paddingVertical: 10
    },
    accessoryText: {
      color: c.tealDark,
      fontFamily: fonts.body,
      fontSize: 16,
      fontWeight: "900"
    }
  });
}
