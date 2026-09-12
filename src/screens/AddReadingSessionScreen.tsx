import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { useDialog } from "../components/DialogProvider";
import { hapticSuccess } from "../utils/haptics";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, KeyboardAvoidingView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BookCover } from "../components/BookCover";
import { Screen } from "../components/Screen";
import { useBookliz } from "../data/BooklizContext";
import { useI18n } from "../i18n/LocalizationContext";
import { RootStackParamList } from "../navigation/types";
import { useColors, useTheme } from "../theme/ThemeContext";
import { NewReadingSessionInput, ReadingFormat } from "../types/models";
import { AppColors, fonts, radii, shadows, spacing } from "../theme/theme";
import { localDateKey, parseDateKey } from "../utils/dateUtils";
import { ValueSlider } from "../components/ValueSlider";

const QUICK_MINUTES = [15, 30, 45, 60, 90, 120];
const LOCATION_PRESETS = ["Home", "Cafe", "Library"];
const MAX_VISIBLE_LOCATION_CHIPS = 6;

export function AddReadingSessionScreen() {
  const c = useColors();
  const { isDark } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => createStyles(c, isDark), [c, isDark]);

  const FORMAT_OPTIONS: { value: ReadingFormat; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { value: "physical",  label: t("logSession.formatPhysical"),  icon: "book-outline" },
    { value: "kindle",    label: t("logSession.formatKindle"),    icon: "tablet-portrait-outline" },
    { value: "audiobook", label: t("logSession.formatAudiobook"), icon: "headset-outline" }
  ];
  const route = useRoute<RouteProp<RootStackParamList, "AddReadingSession">>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const dialog = useDialog();
  const { addReadingSession, books, deleteReadingSession, getBook, getAuthor, getReadingSession, readingSessions, updateBookFormat, updateReadingSession } = useBookliz();
  const editingSession = route.params?.sessionId ? getReadingSession(route.params.sessionId) : undefined;
  const isEditing = Boolean(editingSession);
  const today = localDateKey();

  const preferredBookId =
    editingSession?.bookId ??
    route.params?.bookId ??
    books.find((b) => b.userStatus.status === "reading")?.id ??
    books[0]?.id;

  const [bookId, setBookId] = useState(preferredBookId);
  const selectedBook = getBook(bookId);

  const hasPageCount = (selectedBook?.pages ?? 0) > 0;
  const totalPages = selectedBook?.pages || 1; // 0 = unknown page count
  // Audiobook progress is stored in pages when the book has a page count and as
  // a 0-100 percentage (endPage = percent) when it does not.
  const audioBase = selectedBook?.pages || 100;

  // ── Page mode (Physical / Kindle) ────────────────────────────────────
  const lastPage = editingSession
    ? Math.max(1, editingSession.startPage - 1)
    : selectedBook
      ? Math.max(1, Math.round((selectedBook.userStatus.progressPercent / 100) * (selectedBook.pages || 1)))
      : 1;
  // Start at the last tracked page — user adjusts with +/- or taps to type directly
  const [currentPage, setCurrentPage] = useState(
    editingSession?.endPage ?? lastPage
  );
  const [pageInputOpen, setPageInputOpen] = useState(false);
  const [pageInputText, setPageInputText] = useState(String(editingSession?.endPage ?? lastPage));
  const pagesRead = Math.max(0, currentPage - lastPage);
  const progressPct = Math.min(100, Math.round((currentPage / totalPages) * 100));

  const nudgePage = (delta: number) => {
    setCurrentPage((p) => Math.min(totalPages, Math.max(lastPage, p + delta)));
  };

  // ── Audiobook mode ────────────────────────────────────────────────────
  const lastPct = editingSession && selectedBook
    ? Math.round((Math.max(0, editingSession.startPage - 1) / audioBase) * 100)
    : selectedBook?.userStatus.progressPercent ?? 0;
  const [currentPct, setCurrentPct] = useState(
    editingSession && selectedBook
      ? Math.min(100, Math.round((editingSession.endPage / audioBase) * 100))
      : lastPct
  );
  const gainedPct = Math.max(0, currentPct - lastPct);

  const nudgePct = (delta: number) => {
    setCurrentPct((p) => Math.min(100, Math.max(lastPct, p + delta)));
  };
  const [pctInputOpen, setPctInputOpen] = useState(false);
  const [pctInputText, setPctInputText] = useState(String(
    editingSession && selectedBook
      ? Math.min(100, Math.round((editingSession.endPage / audioBase) * 100))
      : lastPct
  ));

  // ── Shared ────────────────────────────────────────────────────────────
  // Minutes handed over by the reading timer (stop → log session).
  const prefillMinutes =
    typeof route.params?.prefillMinutes === "number" && Number.isFinite(route.params.prefillMinutes)
      ? Math.max(1, Math.round(route.params.prefillMinutes))
      : undefined;
  const [minutes, setMinutes] = useState(45);
  const [customMinutes, setCustomMinutes] = useState(
    editingSession ? String(editingSession.minutesRead) : prefillMinutes !== undefined ? String(prefillMinutes) : ""
  );
  const [useCustom, setUseCustom] = useState(Boolean(editingSession) || prefillMinutes !== undefined);
  const [format, setFormat] = useState<ReadingFormat>(editingSession?.format ?? selectedBook?.format ?? "physical");
  const recentLocations = useMemo(
    () =>
      Array.from(
        new Set(
          readingSessions
            .map((session) => session.location.trim())
            .filter((location) => location && location !== "—")
        )
      ).slice(0, MAX_VISIBLE_LOCATION_CHIPS - 1),
    [readingSessions]
  );
  const locationOptions = useMemo(
    () => Array.from(new Set([...recentLocations, ...LOCATION_PRESETS])).slice(0, MAX_VISIBLE_LOCATION_CHIPS - 1),
    [recentLocations]
  );
  const editingLocation = editingSession?.location?.trim();
  const [selectedLocation, setSelectedLocation] = useState(
    editingLocation && locationOptions.includes(editingLocation) ? editingLocation : locationOptions[0] ?? "Home"
  );
  const [customLocation, setCustomLocation] = useState(
    editingLocation && !locationOptions.includes(editingLocation) ? editingLocation : ""
  );
  const [useCustomLocation, setUseCustomLocation] = useState(
    Boolean(editingLocation && !locationOptions.includes(editingLocation))
  );
  const [date, setDate] = useState(editingSession?.date ?? today);
  const [note, setNote] = useState(editingSession?.notes ?? "");
  const [noteOpen, setNoteOpen] = useState(false);

  const isAudiobook = format === "audiobook";
  const effectiveMinutes = useCustom ? Number(customMinutes) || 0 : minutes;
  const effectiveLocation = useCustomLocation ? customLocation.trim() : selectedLocation;
  const speed = !isAudiobook && effectiveMinutes > 0
    ? Math.round((pagesRead / effectiveMinutes) * 60)
    : 0;

  const switchBook = (book: typeof selectedBook) => {
    if (!book) return;
    setBookId(book.id);
    const lp = Math.max(1, Math.round((book.userStatus.progressPercent / 100) * (book.pages || 1)));
    setCurrentPage(Math.min(book.pages || lp + 30, lp + 30));
    setCurrentPct(book.userStatus.progressPercent);
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
      },
    });
  };

  const handleSave = () => {
    if (!selectedBook) return;
    if (!effectiveLocation) {
      dialog.alert(t("logSession.noLocation"), t("logSession.noLocationBody"));
      return;
    }
    const trimmedDate = date.trim();
    const parsedDate = parseDateKey(trimmedDate);
    if (!parsedDate || trimmedDate > today) {
      dialog.alert(t("session.checkTitle"), t("session.invalidDate"));
      return;
    }
    if (!(effectiveMinutes > 0)) {
      dialog.alert(t("session.checkTitle"), t("session.invalidMinutes"));
      return;
    }
    if (!isAudiobook && !hasPageCount) {
      dialog.alert(t("session.checkTitle"), t("session.needsPageCount"));
      return;
    }

    if (isAudiobook) {
      if (gainedPct === 0) {
        dialog.alert(t("logSession.noProgress"), t("logSession.noProgressBody"));
        return;
      }
      const startPage = Math.min(audioBase, Math.round((lastPct / 100) * audioBase) + 1);
      const endPage = Math.round((currentPct / 100) * audioBase);
      const sessionInput: NewReadingSessionInput = {
        bookId,
        date: trimmedDate,
        startPage,
        endPage,
        minutesRead: effectiveMinutes,
        location: effectiveLocation,
        mood: "—",
        format,
        notes: note.trim()
      };
      if (editingSession) {
        updateReadingSession(editingSession.id, sessionInput);
      } else {
        addReadingSession(sessionInput);
      }
      // Reading in a different format? The book itself just changed format.
      if (selectedBook.format !== format) updateBookFormat(selectedBook.id, format);
      hapticSuccess();
      dialog.alert(
        editingSession ? t("logSession.sessionUpdated") : t("logSession.sessionLogged"),
        `+${gainedPct}% ${t("logSession.progressLbl")} · ${effectiveMinutes}m ${t("logSession.listened")}`,
        () => navigation.goBack()
      );
      return;
    }

    // Physical / Kindle
    if (pagesRead === 0) {
      dialog.alert(t("logSession.noPages"), t("logSession.noPagesBody"));
      return;
    }
    const sessionInput: NewReadingSessionInput = {
      bookId,
      date: trimmedDate,
      startPage: lastPage + 1,
      endPage: currentPage,
      minutesRead: effectiveMinutes,
      location: effectiveLocation,
      mood: "—",
      format,
      notes: note.trim()
    };
    if (editingSession) {
      updateReadingSession(editingSession.id, sessionInput);
    } else {
      addReadingSession(sessionInput);
    }
    if (selectedBook.format !== format) updateBookFormat(selectedBook.id, format);
    hapticSuccess();
    dialog.alert(
      editingSession ? t("logSession.sessionUpdated") : t("logSession.sessionLogged"),
      `${pagesRead} ${t("readingLog.pages")} · ${speed} ${t("logSession.ppH")} · ${t("logSession.percentThrough", { percent: progressPct })}`,
      () => navigation.goBack()
    );
  };

  const readingBooks = books.filter((b) => b.userStatus.status === "reading");
  const otherBooks   = books.filter((b) => b.userStatus.status !== "reading");

  const hasProgress = isAudiobook ? gainedPct > 0 : pagesRead > 0;

  return (
    <Screen>
      {/* Cancel button */}


      <View style={styles.pageHeader}>
        <Text style={styles.pageEyebrow}>{isEditing ? t("logSession.eyebrowEdit") : t("logSession.eyebrowNew")}</Text>
        <Text style={styles.pageTitle}>{isEditing ? t("logSession.titleEdit") : t("logSession.titleNew")}</Text>
      </View>

      {!isEditing && readingBooks.length + otherBooks.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bookRail}>
          {[...readingBooks, ...otherBooks].map((book) => (
            <Pressable accessibilityRole="button"
              key={book.id}
              style={[styles.bookChip, bookId === book.id && styles.bookChipActive]}
              onPress={() => switchBook(book)}
            >
              <Text
                style={[styles.bookChipText, bookId === book.id && styles.bookChipTextActive]}
                numberOfLines={1}
              >
                {book.title}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Book hero */}
      {selectedBook ? (
        <View style={styles.bookHero}>
          <BookCover book={selectedBook} size="md" hideProgress />
          <View style={styles.bookInfo}>
            <Text style={styles.bookTitle} numberOfLines={2}>{selectedBook.title}</Text>
            <Text style={styles.bookAuthor}>{getAuthor(selectedBook.authorId)?.name}</Text>
            {!isAudiobook && (
              <Text style={styles.bookMeta}>{selectedBook.pages} {t("logSession.pagesTotal")}</Text>
            )}
            <View style={styles.progressBar}>
              {isAudiobook ? (
                <>
                  <View style={[styles.progressFill, { width: `${lastPct}%` }]} />
                  {gainedPct > 0 && (
                    <View style={[styles.progressNew, { left: `${lastPct}%`, width: `${gainedPct}%` }]} />
                  )}
                </>
              ) : (
                <>
                  <View style={[styles.progressFill, { width: `${Math.round((lastPage / totalPages) * 100)}%` }]} />
                  {pagesRead > 0 && (
                    <View style={[styles.progressNew, {
                      left: `${Math.round((lastPage / totalPages) * 100)}%`,
                      width: `${Math.round((pagesRead / totalPages) * 100)}%`
                    }]} />
                  )}
                </>
              )}
            </View>
            <Text style={styles.progressLabel}>
              {isAudiobook ? `${currentPct}% complete` : `${progressPct}% complete`}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Format chips — placed before the stepper so the stepper adapts */}
      <View style={styles.formatRow}>
        {FORMAT_OPTIONS.map((opt) => (
          <Pressable accessibilityRole="button"
            key={opt.value}
            style={[styles.formatChip, format === opt.value && styles.formatChipActive]}
            onPress={() => setFormat(opt.value)}
          >
            <Ionicons
              name={opt.icon}
              size={15}
              color={format === opt.value ? c.card : c.muted}
            />
            <Text style={[styles.formatChipText, format === opt.value && styles.formatChipTextActive]}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {isAudiobook ? (
        <View style={styles.stepperCard}>
          <Text style={styles.stepperLabel}>{t("logSession.listenedTo")}</Text>
          <View style={styles.stepper}>
            <Pressable accessibilityRole="button" style={styles.stepBtn} onPress={() => { nudgePct(-5); setPctInputText(String(Math.max(lastPct, currentPct - 5))); }}>
              <Text style={[styles.stepBtnText, { color: c.ink }]}>−5%</Text>
            </Pressable>
            <Pressable
              style={styles.stepBtnSm}
              onPress={() => { nudgePct(-1); setPctInputText(String(Math.max(lastPct, currentPct - 1))); }}
              accessibilityRole="button"
              accessibilityLabel={t("a11y.decreasePercent")}
            >
              <Ionicons name="remove" size={18} color={c.ink} />
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.pageDisplay} onPress={() => setPctInputOpen(true)}>
              {pctInputOpen ? (
                <TextInput
                  autoFocus
                  keyboardType="number-pad"
                  style={[styles.pageNumberInput, { color: c.ink }]}
                  value={pctInputText}
                  onChangeText={setPctInputText}
                  onBlur={() => {
                    const v = Math.min(100, Math.max(lastPct, parseInt(pctInputText, 10) || lastPct));
                    setCurrentPct(v);
                    setPctInputText(String(v));
                    setPctInputOpen(false);
                  }}
                  onSubmitEditing={() => {
                    const v = Math.min(100, Math.max(lastPct, parseInt(pctInputText, 10) || lastPct));
                    setCurrentPct(v);
                    setPctInputText(String(v));
                    setPctInputOpen(false);
                  }}
                  selectTextOnFocus
                />
              ) : (
                <Text style={[styles.pageNumber, { color: c.ink }]}>{currentPct}%</Text>
              )}
              <Text style={[styles.pageOf, { color: c.muted }]}>{pctInputOpen ? t("logSession.tapToConfirm") : `${t("logSession.ofBook")} · ${t("logSession.tapToEdit")}`}</Text>
            </Pressable>
            <Pressable
              style={styles.stepBtnSm}
              onPress={() => { nudgePct(1); setPctInputText(String(Math.min(100, currentPct + 1))); }}
              accessibilityRole="button"
              accessibilityLabel={t("a11y.increasePercent")}
            >
              <Ionicons name="add" size={18} color={c.ink} />
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.stepBtn} onPress={() => { nudgePct(5); setPctInputText(String(Math.min(100, currentPct + 5))); }}>
              <Text style={[styles.stepBtnText, { color: c.ink }]}>+5%</Text>
            </Pressable>
          </View>
          <ValueSlider
            value={currentPct}
            min={lastPct}
            max={100}
            accessibilityLabel={t("logSession.listenedTo")}
            onChange={(next) => { setCurrentPct(next); setPctInputText(String(next)); }}
          />
          <Text style={styles.fieldHint}>{t("logSession.hintPercent")}</Text>
          {gainedPct > 0 && (
            <Text style={styles.pagesReadPill}>+{gainedPct}{t("logSession.pctFrom")}</Text>
          )}
        </View>
      ) : (
        <View style={styles.stepperCard}>
          <Text style={styles.stepperLabel}>{t("logSession.readUpTo")}</Text>
          <View style={styles.stepper}>
            <Pressable accessibilityRole="button" style={styles.stepBtn} onPress={() => { nudgePage(-10); setPageInputText(String(Math.max(lastPage, currentPage - 10))); }}>
              <Text style={[styles.stepBtnText, { color: c.ink }]}>−10</Text>
            </Pressable>
            <Pressable
              style={styles.stepBtnSm}
              onPress={() => { nudgePage(-1); setPageInputText(String(Math.max(lastPage, currentPage - 1))); }}
              accessibilityRole="button"
              accessibilityLabel={t("a11y.decreasePage")}
            >
              <Ionicons name="remove" size={18} color={c.ink} />
            </Pressable>
            {/* Tap the big number to type directly */}
            <Pressable accessibilityRole="button" style={styles.pageDisplay} onPress={() => setPageInputOpen(true)}>
              {pageInputOpen ? (
                <TextInput
                  autoFocus
                  keyboardType="number-pad"
                  style={[styles.pageNumberInput, { color: c.ink }]}
                  value={pageInputText}
                  onChangeText={setPageInputText}
                  onBlur={() => {
                    const v = Math.min(totalPages, Math.max(lastPage, parseInt(pageInputText, 10) || lastPage));
                    setCurrentPage(v);
                    setPageInputText(String(v));
                    setPageInputOpen(false);
                  }}
                  onSubmitEditing={() => {
                    const v = Math.min(totalPages, Math.max(lastPage, parseInt(pageInputText, 10) || lastPage));
                    setCurrentPage(v);
                    setPageInputText(String(v));
                    setPageInputOpen(false);
                  }}
                  selectTextOnFocus
                />
              ) : (
                <Text style={[styles.pageNumber, { color: c.ink }]}>{currentPage}</Text>
              )}
              <Text style={[styles.pageOf, { color: c.muted }]}>
                {pageInputOpen ? t("logSession.tapToConfirm") : `/ ${totalPages} · ${t("logSession.tapToEdit")}`}
              </Text>
            </Pressable>
            <Pressable
              style={styles.stepBtnSm}
              onPress={() => { nudgePage(1); setPageInputText(String(Math.min(totalPages, currentPage + 1))); }}
              accessibilityRole="button"
              accessibilityLabel={t("a11y.increasePage")}
            >
              <Ionicons name="add" size={18} color={c.ink} />
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.stepBtn} onPress={() => { nudgePage(10); setPageInputText(String(Math.min(totalPages, currentPage + 10))); }}>
              <Text style={[styles.stepBtnText, { color: c.ink }]}>+10</Text>
            </Pressable>
          </View>
          {hasPageCount ? (
            <ValueSlider
              value={currentPage}
              min={lastPage}
              max={totalPages}
              accessibilityLabel={t("logSession.readUpTo")}
              onChange={(next) => { setCurrentPage(next); setPageInputText(String(next)); }}
            />
          ) : null}
          <Text style={styles.fieldHint}>{t("logSession.hintCurrentPage")}</Text>
          {pagesRead > 0 && (
            <Text style={styles.pagesReadPill}>+{pagesRead} {t("logSession.pagesFrom")}</Text>
          )}
          {!hasPageCount && (
            <Text style={styles.pageCountHint}>{t("session.needsPageCount")}</Text>
          )}
        </View>
      )}

      <View style={styles.minutesCard}>
        <Text style={styles.minutesLabel}>{t("logSession.dateLabel")}</Text>
        <TextInput
          autoCapitalize="none"
          placeholder="2026-05-25"
          placeholderTextColor={c.gray}
          style={[styles.customInput, styles.dateInput]}
          value={date}
          onChangeText={setDate}
        />
        <Text style={styles.fieldHint}>{t("logSession.hintDate")}</Text>
      </View>

      <View style={styles.minutesCard}>
        <Text style={styles.minutesLabel}>
          {isAudiobook ? t("logSession.timeListened") : t("logSession.timeSpent")}
        </Text>
        <View style={styles.minutesRow}>
          {QUICK_MINUTES.map((m) => (
            <Pressable accessibilityRole="button"
              key={m}
              style={[styles.minuteChip, !useCustom && minutes === m && styles.minuteChipActive]}
              onPress={() => { setMinutes(m); setUseCustom(false); }}
            >
              <Text style={[styles.minuteChipText, !useCustom && minutes === m && styles.minuteChipTextActive]}>
                {m < 60 ? `${m}m` : `${m / 60}h`}
              </Text>
            </Pressable>
          ))}
          <Pressable accessibilityRole="button"
            style={[styles.minuteChip, useCustom && styles.minuteChipActive]}
            onPress={() => setUseCustom(true)}
          >
            <Text style={[styles.minuteChipText, useCustom && styles.minuteChipTextActive]}>
              {useCustom && customMinutes ? `${customMinutes}m` : t("logSession.minutesCustom")}
            </Text>
          </Pressable>
        </View>
        {useCustom && (
          <TextInput
            autoFocus
            keyboardType="number-pad"
            placeholder={t("logSession.minutesPlaceholder")}
            placeholderTextColor={c.gray}
            style={styles.customInput}
            value={customMinutes}
            onChangeText={setCustomMinutes}
          />
        )}
        <Text style={styles.fieldHint}>{t("logSession.hintMinutes")}</Text>
      </View>

      <View style={styles.locationCard}>
        <View style={styles.sectionHeadingRow}>
          <Text style={styles.minutesLabel}>{t("logSession.locationLabel")}</Text>
          {recentLocations.length > 0 ? (
            <Text style={styles.helperLabel}>{t("logSession.locationRecent")}</Text>
          ) : null}
        </View>
        <View style={styles.locationRow}>
          {locationOptions.map((location) => {
            const active = !useCustomLocation && selectedLocation === location;
            return (
              <Pressable accessibilityRole="button"
                key={location}
                style={[styles.locationChip, active && styles.locationChipActive]}
                onPress={() => {
                  setSelectedLocation(location);
                  setUseCustomLocation(false);
                }}
              >
                <Ionicons
                  name="location-outline"
                  size={14}
                  color={active ? c.card : c.muted}
                />
                <Text style={[styles.locationChipText, active && styles.locationChipTextActive]}>
                  {location}
                </Text>
              </Pressable>
            );
          })}
          <Pressable accessibilityRole="button"
            style={[styles.locationChip, useCustomLocation && styles.locationChipActive]}
            onPress={() => setUseCustomLocation(true)}
          >
            <Ionicons
              name="add-circle-outline"
              size={14}
              color={useCustomLocation ? c.card : c.muted}
            />
            <Text style={[styles.locationChipText, useCustomLocation && styles.locationChipTextActive]}>
              {t("logSession.locationCustom")}
            </Text>
          </Pressable>
        </View>
        {useCustomLocation ? (
          <TextInput
            autoFocus
            placeholder={t("logSession.locationPlaceholder")}
            placeholderTextColor={c.gray}
            style={styles.customInput}
            value={customLocation}
            onChangeText={setCustomLocation}
          />
        ) : (
          <Text style={styles.locationSummary}>{t("logSession.loggingAt")} {effectiveLocation}.</Text>
        )}
        <Text style={styles.fieldHint}>{t("logSession.hintLocation")}</Text>
      </View>

      <Pressable accessibilityRole="button" style={styles.noteToggle} onPress={() => setNoteOpen((v) => !v)}>
        <Ionicons name={noteOpen ? "chatbubble" : "chatbubble-outline"} size={15} color={noteOpen ? c.teal : c.muted} />
        <Text style={[styles.noteToggleText, noteOpen && styles.noteToggleTextActive]}>
          {noteOpen ? t("logSession.noteLbl") : t("logSession.noteToggle")}
        </Text>
        {note.trim().length > 0 && !noteOpen && (
          <View style={styles.noteDot} />
        )}
      </Pressable>
      {noteOpen && (
        <TextInput
          autoFocus
          multiline
          placeholder={t("logSession.notePlaceholder")}
          placeholderTextColor={c.gray}
          style={styles.noteInput}
          value={note}
          onChangeText={setNote}
        />
      )}
      {noteOpen ? <Text style={styles.fieldHint}>{t("logSession.hintNote")}</Text> : null}

      {hasProgress && effectiveMinutes > 0 && (
        <View style={styles.statsRow}>
          {isAudiobook ? (
            <>
              <View style={styles.statItem}>
                <Text style={styles.statVal}>{effectiveMinutes}m</Text>
                <Text style={styles.statLbl}>{t("logSession.listened")}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statVal, { color: c.green }]}>{currentPct}%</Text>
                <Text style={styles.statLbl}>{t("logSession.progressLbl")}</Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.statItem}>
                <Text style={styles.statVal}>{pagesRead}</Text>
                <Text style={styles.statLbl}>{t("readingLog.pages")}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statVal}>{speed}</Text>
                <Text style={styles.statLbl}>{t("logSession.ppH")}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statVal, { color: c.green }]}>{progressPct}%</Text>
                <Text style={styles.statLbl}>{t("logSession.progressLbl")}</Text>
              </View>
            </>
          )}
        </View>
      )}

      <Pressable accessibilityRole="button" style={[styles.saveButton, !hasProgress && styles.saveButtonDisabled]} onPress={handleSave}>
        <Text style={styles.saveButtonText}>
          {hasProgress
            ? isEditing ? t("logSession.updateSession") : t("logSession.saveSession")
            : isAudiobook
              ? t("logSession.adjustProgress")
              : t("logSession.adjustPage")}
        </Text>
      </Pressable>
      {isEditing ? (
        <Pressable accessibilityRole="button" style={styles.deleteButton} onPress={deleteSession}>
          <Text style={styles.deleteButtonText}>{t("logSession.deleteSession")}</Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}

function createStyles(c: AppColors, isDark: boolean) {
  return StyleSheet.create({
  pageHeader: {
    marginBottom: spacing.md
  },
  pageEyebrow: {
    color: c.tealDark,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.3,
    textTransform: "uppercase"
  },
  pageTitle: {
    color: c.ink,
    fontFamily: fonts.display,
    fontSize: 26,
    fontWeight: "900",
    marginTop: 2
  },
  bookRail: {
    marginBottom: spacing.md
  },
  bookChip: {
    borderColor: c.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    marginRight: spacing.sm,
    maxWidth: 160,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  bookChipActive: {
    backgroundColor: isDark ? c.teal : c.navy,
    borderColor: isDark ? c.teal : c.navy
  },
  bookChipText: {
    color: c.ink,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: "800"
  },
  bookChipTextActive: {
    color: "#fff"
  },
  bookHero: {
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
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 21
  },
  bookAuthor: {
    color: c.muted,
    fontFamily: fonts.body,
    fontSize: 13,
    marginTop: 3
  },
  bookMeta: {
    color: c.muted,
    fontFamily: fonts.body,
    fontSize: 11,
    marginTop: 2
  },
  progressBar: {
    backgroundColor: c.border,
    borderRadius: radii.pill,
    height: 8,
    marginTop: spacing.sm,
    overflow: "hidden",
    position: "relative"
  },
  progressFill: {
    backgroundColor: isDark ? "rgba(255,255,255,0.18)" : c.surfaceAlt,
    borderRadius: radii.pill,
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
  stepperCard: {
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
  stepperLabel: {
    color: c.muted,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginBottom: spacing.md,
    textTransform: "uppercase"
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  stepBtnText: {
    color: c.navy,
    fontFamily: fonts.body,
    fontSize: 14,
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
  pageDisplay: {
    alignItems: "center",
    minWidth: 90
  },
  pageNumber: {
    color: c.ink,
    fontFamily: fonts.display,
    fontSize: 52,
    fontWeight: "900",
    lineHeight: 56
  },
  pageOf: {
    color: c.muted,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: "800"
  },
  pagesReadPill: {
    backgroundColor: c.teal + "22",
    borderRadius: radii.pill,
    color: c.teal,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: "900",
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 6
  },
  /** The one-line explanation under a field. Quiet by design: it should be
      there when you look for it and invisible when you are not. */
  fieldHint: {
    color: c.muted,
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    lineHeight: 17,
    marginTop: spacing.sm
  },
  pageCountHint: {
    color: c.coral,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: spacing.sm,
    textAlign: "center"
  },
  minutesCard: {
    backgroundColor: c.surface,
    borderColor: c.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
    padding: spacing.md
  },
  minutesLabel: {
    color: c.muted,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: spacing.sm,
    textTransform: "uppercase"
  },
  minutesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  minuteChip: {
    alignItems: "center",
    borderColor: c.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
  },
  minuteChipActive: {
    backgroundColor: isDark ? c.teal : c.navy,
    borderColor: isDark ? c.teal : c.navy
  },
  minuteChipText: {
    color: c.ink,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: "900"
  },
  minuteChipTextActive: {
    color: "#fff"
  },
  customInput: {
    backgroundColor: c.surfaceAlt,
    borderColor: c.border,
    borderRadius: radii.md,
    borderWidth: 1,
    color: c.ink,
    fontFamily: fonts.body,
    fontSize: 16,
    fontWeight: "800",
    marginTop: spacing.sm,
    padding: spacing.md
  },
  dateInput: {
    marginTop: 0
  },
  sectionHeadingRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  helperLabel: {
    color: c.muted,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: "800"
  },
  formatRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md
  },
  formatChip: {
    alignItems: "center",
    borderColor: c.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    minHeight: 44,
    paddingVertical: 10,
  },
  formatChipActive: {
    backgroundColor: isDark ? c.teal : c.navy,
    borderColor: isDark ? c.teal : c.navy
  },
  formatChipText: {
    color: c.muted,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: "900"
  },
  formatChipTextActive: {
    color: "#fff"
  },
  locationCard: {
    backgroundColor: c.surface,
    borderColor: c.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
    padding: spacing.md
  },
  locationRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  locationChip: {
    alignItems: "center",
    borderColor: c.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 9
  },
  locationChipActive: {
    backgroundColor: c.tealDark,
    borderColor: c.tealDark
  },
  locationChipText: {
    color: c.ink,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: "900"
  },
  locationChipTextActive: {
    color: "#fff"
  },
  locationSummary: {
    color: c.muted,
    fontFamily: fonts.body,
    fontSize: 12,
    marginTop: spacing.sm
  },
  noteToggle: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 6,
    marginBottom: spacing.sm,
    paddingVertical: 4
  },
  noteToggleText: {
    color: c.muted,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: "900"
  },
  noteToggleTextActive: {
    color: c.teal
  },
  noteDot: {
    backgroundColor: c.teal,
    borderRadius: 4,
    height: 6,
    width: 6
  },
  noteInput: {
    backgroundColor: c.surface,
    borderColor: c.border,
    borderRadius: radii.md,
    borderWidth: 1,
    color: c.ink,
    fontFamily: fonts.body,
    fontSize: 14,
    marginBottom: spacing.md,
    minHeight: 80,
    padding: spacing.md,
    textAlignVertical: "top"
  },
  statsRow: {
    ...shadows.card,
    alignItems: "center",
    backgroundColor: c.navy,
    borderRadius: radii.lg,
    flexDirection: "row",
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  statItem: {
    alignItems: "center",
    flex: 1
  },
  statVal: {
    color: c.card,
    fontFamily: fonts.display,
    fontSize: 26,
    fontWeight: "900"
  },
  statLbl: {
    color: "rgba(255,255,255,0.55)",
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2
  },
  statDivider: {
    backgroundColor: "rgba(255,255,255,0.15)",
    height: 36,
    width: 1
  },
  saveButton: {
    backgroundColor: isDark ? c.teal : c.navy,
    borderRadius: radii.pill,
    paddingVertical: 16
  },
  saveButtonDisabled: {
    backgroundColor: c.gray,
    opacity: 0.5
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
  cancelBtn: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 2,
    marginBottom: spacing.sm,
  },
  cancelBtnText: {
    color: c.tealDark,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: "900",
  },
  pageNumberInput: {
    fontFamily: fonts.display,
    fontSize: 52,
    fontWeight: "900",
    lineHeight: 56,
    minWidth: 90,
    textAlign: "center",
  },
  });
}
