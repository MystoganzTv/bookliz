/**
 * EditBookScreen — Section-card redesign
 *
 * Visual pattern from reference:
 *   Each field = card with [icon] [BOLD TEAL LABEL] / [content]
 *
 * New UX:
 *   - Genres and Tags as tappable chips (add/remove)
 *   - Star rating (tap to set, half-star via double-tap)
 *   - Format picker with expanded options
 *   - Date fields with year-only toggle
 *   - All logic/state unchanged from previous version
 */
import { Ionicons } from "@expo/vector-icons";
import { useDialog } from "../components/DialogProvider";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { BookCover } from "../components/BookCover";
import { Screen } from "../components/Screen";
import { formatGroupOf, useBookliz } from "../data/BooklizContext";
import { useI18n } from "../i18n/LocalizationContext";
import { RootStackParamList } from "../navigation/types";
import { CoreTrackingStatus, OwnershipStatus, ReadingFormat } from "../types/models";
import { useColors } from "../theme/ThemeContext";
import {
  canFetchMetadata,
  isPlaceholderGenreList,
  isPlaceholderText,
  resolveBookMetadata,
} from "../utils/bookMetadata";
import { AppColors, fonts, radii, shadows, spacing } from "../theme/theme";
import { findEditionsInLanguage } from "../utils/metadataResolver";
import { buildEditionSwitchPatch } from "../utils/editionSwitch";
import {
  EditionCandidate,
  groupEditionCandidates,
  GroupedEditionCandidates,
} from "../utils/editionMatchValidation";
import { isbn10ToIsbn13, isbn13ToIsbn10 } from "../utils/isbnUtils";
import { isSameLanguage } from "../utils/languageUtils";
import { normalizeBookGenres } from "../utils/genres";
import { GenreBookResult } from "../services/googleBooksProvider";

// ─── helpers ─────────────────────────────────────────────────────────────────

const splitList = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);
const parseNum  = (v: string) => { const n = Number(v); return Number.isFinite(n) ? n : undefined; };

const FORMAT_OPTIONS: { value: ReadingFormat; labelKey: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "paperback",            labelKey: "editBook.fmtPaperback",   icon: "book-outline" },
  { value: "hardcover",            labelKey: "editBook.fmtHardcover",   icon: "book-outline" },
  { value: "ebook",                labelKey: "editBook.fmtEbook",       icon: "tablet-portrait-outline" },
  { value: "audiobook",            labelKey: "editBook.fmtAudiobook",   icon: "headset-outline" },
  { value: "mass-market-paperback",labelKey: "editBook.fmtMassMarket",  icon: "book-outline" },
  { value: "spiral-bound",         labelKey: "editBook.fmtSpiral",      icon: "document-text-outline" },
  { value: "leather-bound",        labelKey: "editBook.fmtLeather",     icon: "book-outline" },
  { value: "magazine",             labelKey: "editBook.fmtMagazine",    icon: "newspaper-outline" },
  { value: "comic-book",           labelKey: "editBook.fmtComic",       icon: "color-wand-outline" },
  { value: "graphic-novel",        labelKey: "editBook.fmtGraphicNovel",icon: "image-outline" },
  { value: "manga",                labelKey: "editBook.fmtManga",       icon: "language-outline" },
];



const LANGUAGE_CHOICES = ["English", "Spanish", "French", "German", "Italian", "Portuguese"];

// ─── Screen ───────────────────────────────────────────────────────────────────

export function EditBookScreen() {
  const c = useColors();
  const { t } = useI18n();
  const dialog = useDialog();
  const styles = useMemo(() => createStyles(c), [c]);
  const route = useRoute<RouteProp<RootStackParamList, "EditBook">>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { getAuthor, getBook, updateBook, deleteBook, readingSessions, clearBookSessions } = useBookliz();

  const book = getBook(route.params.bookId);

  // ── state ──────────────────────────────────────────────────────────────────
  const [title,           setTitle]           = useState(book?.title ?? "");
  const [authorName,      setAuthorName]      = useState(book ? getAuthor(book.authorId)?.name ?? "" : "");
  const [seriesName,      setSeriesName]      = useState(book?.seriesName ?? "");
  const [seriesNumber,    setSeriesNumber]    = useState(book?.seriesNumber ? String(book.seriesNumber) : "");
  const [genres,          setGenres]          = useState<string[]>(book?.genre ?? []);
  // Unknown page count (0 / negative) shows as an empty field — never a literal "0".
  const [pages,           setPages]           = useState(book && book.pages > 0 ? String(book.pages) : "");
  // Audiobook length, asked as hours + minutes because that is how a listener
  // knows it. Stored as one number of minutes.
  const [durationHours,   setDurationHours]   = useState(
    book?.durationMinutes ? String(Math.floor(book.durationMinutes / 60)) : ""
  );
  const [durationMins,    setDurationMins]    = useState(
    book?.durationMinutes ? String(book.durationMinutes % 60) : ""
  );
  const [publishedDate,   setPublishedDate]   = useState(book?.publishedDate ?? "");
  const [publisher,       setPublisher]       = useState(book?.publisher ?? "");
  // "" = unknown, exactly like synopsis/publisher/pages. Pre-selecting English
  // here is how a Spanish book silently acquires an English language field.
  const [language,        setLanguage]        = useState(book?.language ?? "");
  const rawIsbn = book?.isbn ?? "";
  // A book stores one ISBN; the other form is the same number, derived
  // (ISBN-10 exists only for 978- ISBN-13s).
  const rawDigits = rawIsbn.replace(/[^0-9X]/gi, "");
  const [isbn13, setIsbn13] = useState(
    rawDigits.length === 13 ? rawIsbn : rawDigits.length === 10 ? isbn10ToIsbn13(rawDigits) ?? "" : ""
  );
  const [isbn10, setIsbn10] = useState(
    rawDigits.length === 10 ? rawIsbn : rawDigits.length === 13 ? isbn13ToIsbn10(rawDigits) ?? "" : ""
  );
  const isbn = isbn13.trim() || isbn10.trim();
  const [format,          setFormat]          = useState<ReadingFormat>(book?.format ?? "physical");
  const [coverImageUri,   setCoverImageUri]   = useState(book?.coverImageUri ?? "");
  const [synopsis,        setSynopsis]        = useState(book?.synopsis ?? "");
  const [tags,            setTags]            = useState<string[]>(book?.tags ?? []);
  const [isBestseller,    setIsBestseller]    = useState(Boolean(book?.isBestseller));
  const [isSequel,        setIsSequel]        = useState(book?.isSequel ?? (book?.seriesNumber !== undefined ? book.seriesNumber > 1 : false));
  const [status,          setStatus]          = useState<CoreTrackingStatus>(book?.userStatus.status ?? "want-to-read");
  const [ownership,       setOwnership]       = useState<OwnershipStatus>(book?.userStatus.ownership ?? "owned");
  const [wishlist,        setWishlist]        = useState(Boolean(book?.userStatus.wishlist));
  const [wantToBuy,       setWantToBuy]       = useState(Boolean(book?.userStatus.wantToBuy));
  const [rating,          setRating]          = useState(book?.userStatus.rating ?? 0);
  const [personalRanking, setPersonalRanking] = useState(book?.userStatus.personalRanking ? String(book.userStatus.personalRanking) : "");
  const [startDate,       setStartDate]       = useState(book?.userStatus.startDate ?? "");
  const [finishDate,      setFinishDate]      = useState(book?.userStatus.finishDate ?? "");
  const [progressPercent, setProgressPercent] = useState(book ? String(book.userStatus.progressPercent) : "0");
  const [notes,           setNotes]           = useState(book?.userStatus.notes ?? "");
  const [favoriteQuotes,  setFavoriteQuotes]  = useState<string[]>(book?.userStatus.favoriteQuotes ?? []);
  // Edition pointer — cleared on edition switch (stale pointers are bugs).
  const [editionKey,      setEditionKey]      = useState(book?.editionKey);
  const [isFetching,      setIsFetching]      = useState(false);
  const [formatOpen,      setFormatOpen]      = useState(false);
  // ISBN, cover, genres and tags: rarely touched, folded by default.
  const [detailsOpen,     setDetailsOpen]     = useState(false);
  const [otherLangOpen,   setOtherLangOpen]   = useState(false);
  const [coverSheetOpen,  setCoverSheetOpen]  = useState(false);
  const [coverDraft,      setCoverDraft]      = useState("");
  // Language → edition picker sheet (two groups: exact = applicable;
  // seriesSiblings = other volumes of the same series, shown but blocked).
  const EMPTY_GROUPS: GroupedEditionCandidates = { exact: [], seriesSiblings: [] };
  const [editionSheet, setEditionSheet] = useState<{ language: string; loading: boolean; groups: GroupedEditionCandidates } | null>(null);

  // ── language → edition picker ──────────────────────────────────────────────
  // Changing the language means changing EDITION (different ISBN, title,
  // cover, synopsis). Instead of a blind fetch against the old ISBN, we list
  // the catalog editions in that language and let the user pick one.
  // SAME-BOOK GATE: candidates are validated against the source book —
  // another volume of the same series is never applicable.
  const handleLanguagePick = async (lang: string) => {
    if (language.trim().toLowerCase() === lang.trim().toLowerCase()) {
      setLanguage(lang);
      return;
    }
    setEditionSheet({ language: lang, loading: true, groups: EMPTY_GROUPS });
    try {
      const candidates = await findEditionsInLanguage(title || book?.title || "", authorName, lang, {
        workKey: book?.workKey,
        isbn,
      });
      const groups = groupEditionCandidates(
        {
          title: title || book?.title || "",
          authorName,
          seriesName: seriesName || book?.seriesName,
          seriesNumber: parseNum(seriesNumber) ?? book?.seriesNumber,
        },
        candidates
      );
      setEditionSheet((current) =>
        current?.language === lang ? { language: lang, loading: false, groups } : current
      );
    } catch {
      setEditionSheet((current) =>
        current?.language === lang ? { language: lang, loading: false, groups: EMPTY_GROUPS } : current
      );
    }
  };

  /** Blocked tap on a series sibling — explain instead of applying. */
  const explainSiblingBlocked = () => {
    // The root dialog renders under a screen Modal — close the picker first,
    // then show the explanation once the sheet has animated out.
    setEditionSheet(null);
    setTimeout(() => {
      dialog.alert(
        t("editBook.editionSiblingBlockedTitle"),
        t("editBook.editionSiblingBlockedBody")
      );
    }, 350);
  };

  const applyEditionCandidate = (candidate: GenreBookResult, lang: string) => {
    setEditionSheet(null);
    // ALL edition-locked fields switch together — absent fields become EMPTY,
    // never inherited from the previous edition (that was the
    // "Spanish language with English cover" bug). Pure + unit-tested.
    const patch = buildEditionSwitchPatch(candidate, lang);
    if (__DEV__) {
      console.log(
        `[EDITION_SWITCH_APPLY] selectedLanguage=${lang} selectedTitle="${candidate.title}" ` +
        `selectedISBN=${candidate.isbn13 ?? "-"} selectedEditionKey=${candidate.id} ` +
        `patch.language=${patch.language} patch.languageCode=${patch.languageCode ?? "-"}`
      );
    }
    setLanguage(patch.language);
    setTitle(patch.title);
    setCoverImageUri(patch.coverImageUri);
    setIsbn13(patch.isbn13);
    setIsbn10(patch.isbn10 || (patch.isbn13 ? isbn13ToIsbn10(patch.isbn13) ?? "" : ""));
    setPages(patch.pages);
    setPublisher(patch.publisher);
    setPublishedDate(patch.publishedDate);
    setEditionKey(patch.editionKey); // stale pointer cleared
    setSynopsis(patch.synopsis);

    if (patch.needsSynopsisBackfill) {
      void resolveBookMetadata({
        isbn: candidate.isbn13,
        title: candidate.title,
        authorName,
        language: patch.language,
      }).then((meta) => {
        const found = meta?.synopsis?.trim();
        const langOk = isSameLanguage(meta?.language, patch.language);
        if (found && found.length > 40 && langOk) {
          // Only fill if the user hasn't typed something meanwhile.
          setSynopsis((current) => (current.trim() ? current : found));
        }
      }).catch(() => {});
    }
  };

  // ── status ↔ wishlist / wantToBuy flags ────────────────────────────────────
  // `status` is ONE of seven mutually exclusive tracking states, while
  // `wishlist` and `wantToBuy` are independent booleans that the rest of the app
  // reads directly (Library's "Wishlist" filter, the Home collector counters,
  // the taste profile scoring). Until now, picking the "Wishlist" status here
  // left both flags untouched, so a book could be wishlist-status with
  // `wishlist: false` and never show up in the wishlist filter.
  //
  // Decision: turn the MATCHING flag ON when that status is picked, and never
  // turn a flag OFF automatically.
  //   · Turning on is what the user just asked for, and it happens in front of
  //     them — the flag chips live directly under the status row, so they can
  //     see the change and undo it.
  //   · Turning off automatically would silently destroy user data: a book can
  //     legitimately be "reading" and still be on the want-to-buy list (a nicer
  //     edition), or "read" and still wished for as a gift copy.
  //   · We deliberately do NOT force `ownership` to "not-owned" the way
  //     BooklizContext's quick status sheet does — ownership is now an explicit
  //     control on this very screen, and overriding a choice the user just made
  //     two cards above would be the most surprising behaviour of all.

  // ── fetch metadata ─────────────────────────────────────────────────────────
  const fetchInfo = async () => {
    if (!canFetchMetadata({ isbn, title, authorName })) {
      dialog.alert(t("editBook.fetchNeedClue"), t("editBook.fetchNeedClueBody"));
      return;
    }
    setIsFetching(true);
    let meta;
    try { meta = await resolveBookMetadata({ isbn, title: title || book?.title, authorName, language }); }
    catch (err) { console.warn("[Fetch Info]", err); }
    setIsFetching(false);

    if (!meta) {
      dialog.alert(
        t("editBook.fetchNoResult"),
        t("editBook.fetchNoResultBody")
      );
      return;
    }

    const filled: string[] = [];
    const isBlank = (v: string) => isPlaceholderText(v) || v === "0" || v === "";
    // STRICT LANGUAGE LOCK: language-locked fields are only accepted when the
    // fetched metadata is in the book's selected language. The resolver already
    // enforces this; this gate is the second line of defense.
    // FILL-BLANKS ONLY: fetch never overwrites user-entered values — explicit
    // edition switches go through the language chips / edition picker instead.
    const langOk = !language.trim() ||
      Boolean(meta.language && isSameLanguage(meta.language, language));

    if (langOk && meta.title       && isBlank(title))                 { setTitle(meta.title);                  filled.push("title"); }
    if (langOk && meta.pages       && meta.pages > 0 && isBlank(pages)) { setPages(String(meta.pages));        filled.push("pages"); }
    if (langOk && meta.publisher   && isBlank(publisher))             { setPublisher(meta.publisher);          filled.push("publisher"); }
    if (langOk && meta.publishedDate && isBlank(publishedDate))       { setPublishedDate(meta.publishedDate);  filled.push("published date"); }
    if (langOk && meta.synopsis && meta.synopsis.length > 30 && isBlank(synopsis)) { setSynopsis(meta.synopsis); filled.push("synopsis"); }
    // Replace the cover when blank, or when the current one was auto-fetched
    // (e.g. an odd audiobook-edition cover) — user photos (file://) are kept.
    // Language-locked like every other edition field.
    const coverIsAuto = /books\.google|googleusercontent|openlibrary|archive\.org/i.test(coverImageUri);
    if (langOk && meta.coverImageUri && (isBlank(coverImageUri) || (coverIsAuto && meta.coverImageUri !== coverImageUri))) { setCoverImageUri(meta.coverImageUri); filled.push("cover"); }
    if (langOk && meta.isbn && isBlank(isbn)) {
      const clean = meta.isbn.replace(/[^0-9X]/gi, "");
      if (clean.length === 13) {
        setIsbn13(meta.isbn);
        if (isBlank(isbn10)) setIsbn10(isbn13ToIsbn10(clean) ?? "");
      } else {
        setIsbn10(meta.isbn);
        if (isBlank(isbn13)) setIsbn13(isbn10ToIsbn13(clean) ?? "");
      }
      filled.push("ISBN");
    }
    if (meta.authorName  && isBlank(authorName))                      { setAuthorName(meta.authorName);         filled.push("author"); }
    if (meta.genre?.length && isPlaceholderGenreList(genres))         { setGenres(meta.genre);                  filled.push("genres"); }
    if (meta.tags?.length && tags.length === 0)                       { setTags(meta.tags);                     filled.push("tags"); }
    if (meta.isBestseller && !isBestseller)                           { setIsBestseller(true);                  filled.push("bestseller"); }

    // The user asked for a language we couldn't find an edition for —
    // say so instead of the misleading "all fields filled".
    if (!filled.length && !langOk && language.trim()) {
      dialog.alert(
        t("editBook.langNotFoundTitle"),
        t("editBook.langNotFoundBody", { language })
      );
      return;
    }

    // Nothing new, but the edition facts are still missing: say that, not
    // "all fields already filled".
    if (!filled.length && (isBlank(isbn) || isBlank(pages))) {
      dialog.alert(t("editBook.fetchNoResult"), t("editBook.fetchNoResultBody"));
      return;
    }

    dialog.alert(
      filled.length ? t("editBook.fetchUpdated") : t("editBook.fetchAllFilled"),
      filled.length ? `Updated: ${filled.join(", ")}.` : t("editBook.fetchAllFilledBody")
    );
  };

  const saveRef = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable accessibilityRole="button" hitSlop={10} onPress={() => saveRef.current()} style={styles.headerSave}>
          <Text style={styles.headerSaveText}>{t("common.save")}</Text>
        </Pressable>
      ),
    });
  }, [navigation, styles, t]);

  if (!book) {
    return <Screen><Text style={{ color: c.muted, fontFamily: fonts.body, padding: spacing.lg }}>{t("bookDetail.notFound")}</Text></Screen>;
  }

  const previewBook = {
    ...book,
    title: title || book.title,
    coverImageUri: coverImageUri.trim() || undefined,
    format,
    userStatus: {
      ...book.userStatus,
      status,
      rating,
      progressPercent: Math.min(100, Math.max(0, parseNum(progressPercent) ?? book.userStatus.progressPercent)),
    },
  };

  const onSave = () => {
    // Switching between paper, digital and audio with sessions already logged:
    // ask whether the reader carries on from where they were (the % moves to
    // the new format, old sessions stay with their own format) or starts over.
    const formatFamilyChanged = formatGroupOf(book.format) !== formatGroupOf(format);
    const hasSessions = readingSessions.some((session) => session.bookId === book.id);
    if (formatFamilyChanged && hasSessions) {
      dialog.confirm({
        title: t("editBook.formatSwitchTitle"),
        body: t("editBook.formatSwitchBody", { percent: book.userStatus.progressPercent }),
        confirmLabel: t("editBook.formatSwitchStartOver"),
        cancelLabel: t("editBook.formatSwitchContinue"),
        destructive: true,
        onConfirm: () => saveBook(true),
        onCancel: () => saveBook(false),
      });
      return;
    }
    saveBook(false);
  };

  const saveBook = (startOver: boolean) => {
    updateBook(book.id, {
      title, authorName, synopsis,
      // Hand-typed genres go through exactly the same normalizer as imported
      // metadata, so the manual path can't inject labels the rest of the app
      // rejects (generic catch-alls like "Fiction" / "Ficción" / "General" /
      // "Novela" are dropped and never count as a real genre).
      genre: normalizeBookGenres(genres),
      // Empty form field = unknown (0). Falling back to book.pages here would
      // re-inherit the previous edition's page count after an edition switch.
      pages: parseNum(pages) ?? 0,
      durationMinutes: ((parseNum(durationHours) ?? 0) * 60 + (parseNum(durationMins) ?? 0)) || undefined,
      publishedDate, publisher, language, isbn, format, coverImageUri,
      editionKey,
      seriesName, seriesNumber: parseNum(seriesNumber),
      isBestseller, isSequel,
      // Tags are the user's own words: trimmed and de-blanked, never normalized
      // or filtered against a vocabulary the way genres are.
      tags: tags.map((tag) => tag.trim()).filter(Boolean),
      status, ownership, wishlist, wantToBuy,
      rating: rating > 0 ? rating : undefined,
      personalRanking: parseNum(personalRanking),
      startDate, finishDate,
      progressPercent: startOver ? 0 : parseNum(progressPercent) ?? book.userStatus.progressPercent,
      notes,
      favoriteQuotes: favoriteQuotes.map((q) => q.trim()).filter(Boolean),
    });
    if (startOver) clearBookSessions(book.id);
    navigation.goBack();
  };

  const onDelete = () => {
    dialog.confirm({
      title: t("editBook.deleteTitle"),
      body: t("editBook.deleteBodyNamed", { title: title || book.title }),
      confirmLabel: t("editBook.deleteConfirm"),
      destructive: true,
      onConfirm: () => {
        deleteBook(book.id);
        navigation.reset({ index: 0, routes: [{ name: "AppTabs" }] });
      },
    });
  };

  saveRef.current = onSave;
  const formatLabelKey = FORMAT_OPTIONS.find((o) => o.value === format)?.labelKey;

  return (
    <Screen>
      {/* ── HERO: tap the cover to change it; title / author edited in place ── */}
      <View style={styles.heroDeluxe}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("editBook.changeCover")}
          onPress={() => { setCoverDraft(coverImageUri); setCoverSheetOpen(true); }}
        >
          <BookCover book={previewBook} size="md" />
          <View style={styles.coverBadge}>
            <Ionicons name="camera-outline" size={14} color="#FFFFFF" />
          </View>
        </Pressable>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder={t("editBook.titlePlaceholder")}
          placeholderTextColor={c.muted}
          multiline
          scrollEnabled={false}
          style={styles.heroTitleInput}
        />
        <TextInput
          value={authorName}
          onChangeText={setAuthorName}
          placeholder={t("editBook.authorPlaceholder")}
          placeholderTextColor={c.muted}
          style={styles.heroAuthorInput}
        />
        <Pressable accessibilityRole="button" style={[styles.fetchPill, isFetching && styles.fetchBtnBusy]} onPress={fetchInfo} disabled={isFetching}>
          {isFetching
            ? <ActivityIndicator size="small" color={c.tealDark} />
            : <Ionicons name="sparkles-outline" size={15} color={c.tealDark} />}
          <Text style={styles.fetchPillText}>{isFetching ? t("editBook.fetchBtnSearching") : t("editBook.fetchShort")}</Text>
        </Pressable>
      </View>

      {/* ══ THE BOOK ═══════════════════════════════════════════════════════
          Reading status, rating and "I own it" live in the book's status
          sheet; this screen edits the book itself. */}
      <Text style={styles.groupHeader}>{t("editBook.sectionBook")}</Text>
      <View style={styles.group}>
        <View style={styles.groupRow}>
          <IconTile icon="layers" color={c.teal} styles={styles} />
          <Text style={styles.rowLabel}>{t("editBook.labelSeries")}</Text>
          <TextInput
            value={seriesName}
            onChangeText={setSeriesName}
            placeholder={t("editBook.seriesPlaceholder")}
            placeholderTextColor={c.muted}
            style={styles.rowInput}
          />
          <TextInput
            value={seriesNumber}
            onChangeText={setSeriesNumber}
            placeholder="#"
            placeholderTextColor={c.muted}
            keyboardType="number-pad"
            style={[styles.rowInput, styles.rowInputNarrow]}
          />
        </View>
        <Pressable accessibilityRole="button" style={[styles.groupRow, styles.groupDivider]} onPress={() => setFormatOpen((v) => !v)}>
          <IconTile icon={FORMAT_OPTIONS.find((o) => o.value === format)?.icon ?? "book"} color={c.coral} styles={styles} />
          <Text style={styles.rowLabel}>{t("editBook.labelFormat")}</Text>
          <Text style={styles.rowValue}>{formatLabelKey ? t(formatLabelKey) : t("editBook.fmtSelect")}</Text>
          <Ionicons name={formatOpen ? "chevron-up" : "chevron-forward"} size={16} color={c.muted} />
        </Pressable>
        {formatOpen ? (
          <View style={styles.optionList}>
            {FORMAT_OPTIONS.map((opt) => (
              <Pressable
                accessibilityRole="button"
                key={opt.value}
                style={styles.optionRow}
                onPress={() => { setFormat(opt.value); setFormatOpen(false); }}
              >
                <Text style={[styles.optionText, format === opt.value && { color: c.tealDark, fontWeight: "900" }]}>{t(opt.labelKey)}</Text>
                {format === opt.value ? <Ionicons name="checkmark" size={18} color={c.teal} /> : null}
              </Pressable>
            ))}
          </View>
        ) : null}
        {format === "audiobook" ? (
          <View style={[styles.groupRow, styles.groupDivider]}>
            <IconTile icon="time" color={c.gold} styles={styles} />
            <Text style={styles.rowLabel}>{t("editBook.labelDuration")}</Text>
            <TextInput
              value={durationHours}
              onChangeText={setDurationHours}
              placeholder="0"
              placeholderTextColor={c.muted}
              keyboardType="number-pad"
              style={[styles.rowInput, styles.rowInputNarrow]}
            />
            <Text style={styles.rowUnit}>h</Text>
            <TextInput
              value={durationMins}
              onChangeText={setDurationMins}
              placeholder="0"
              placeholderTextColor={c.muted}
              keyboardType="number-pad"
              style={[styles.rowInput, styles.rowInputNarrow]}
            />
            <Text style={styles.rowUnit}>min</Text>
          </View>
        ) : (
          <View style={[styles.groupRow, styles.groupDivider]}>
            <IconTile icon="document-text" color={c.gold} styles={styles} />
            <Text style={styles.rowLabel}>{t("editBook.labelPages")}</Text>
            <TextInput
              value={pages}
              onChangeText={setPages}
              placeholder={t("editBook.unknownShort")}
              placeholderTextColor={c.muted}
              keyboardType="number-pad"
              style={styles.rowInput}
            />
          </View>
        )}
        <View style={[styles.groupBlock, styles.groupDivider]}>
          <View style={styles.blockHead}>
            <IconTile icon="globe" color={c.navy} styles={styles} />
            <Text style={styles.rowLabel}>{t("editBook.labelLanguage")}</Text>
          </View>
          <View style={styles.chipFlow}>
            {[...LANGUAGE_CHOICES, ...(language.trim() && !LANGUAGE_CHOICES.some((l) => l.toLowerCase() === language.trim().toLowerCase()) ? [language.trim()] : [])].map((lang) => {
              const active = language.trim().toLowerCase() === lang.toLowerCase();
              return (
                <Pressable
                  key={lang}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[styles.segmentItem, active && styles.segmentItemActive]}
                  onPress={() => void handleLanguagePick(lang)}
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{lang}</Text>
                </Pressable>
              );
            })}
            <Pressable accessibilityRole="button" style={styles.segmentItem} onPress={() => setOtherLangOpen((v) => !v)}>
              <Text style={styles.segmentText}>{t("editBook.otherLanguage")}</Text>
            </Pressable>
          </View>
          {otherLangOpen ? (
            <TextInput
              autoFocus
              value={language}
              onChangeText={setLanguage}
              placeholder={t("editBook.labelLanguage")}
              placeholderTextColor={c.muted}
              style={styles.inlineField}
            />
          ) : null}
          <Text style={styles.groupHint}>{t("editBook.langHint")}</Text>
        </View>
      </View>

      {/* Only when the reader does not own it: the one shelf flag no other
          screen sets (the status sheet handles status, rating and owned). */}
      {ownership !== "owned" ? (
        <View style={[styles.group, { marginTop: spacing.md }]}>
          <View style={styles.groupRow}>
            <IconTile icon="cart" color={c.green} styles={styles} />
            <Text style={styles.rowLabel}>{t("editBook.toggleWantToBuy")}</Text>
            <View style={{ flex: 1 }} />
            <Switch value={wantToBuy} onValueChange={setWantToBuy} trackColor={{ true: c.teal, false: c.border }} />
          </View>
        </View>
      ) : null}

      {/* ── Edition picker: editions available in the chosen language ──────── */}
      <Modal
        visible={Boolean(editionSheet)}
        transparent
        animationType="slide"
        onRequestClose={() => setEditionSheet(null)}
      >
        <Pressable accessibilityRole="button" style={styles.editionOverlay} onPress={() => setEditionSheet(null)}>
          <Pressable accessibilityRole="button" style={styles.editionSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.editionHandle} />
            <Text style={styles.editionSheetTitle}>
              {t("editBook.editionSheetTitle", { language: editionSheet?.language ?? "" })}
            </Text>
            {editionSheet?.loading ? (
              <View style={styles.editionLoading}>
                <ActivityIndicator size="small" color={c.teal} />
                <Text style={styles.editionLoadingText}>
                  {t("editBook.editionSheetLoading", { language: editionSheet.language })}
                </Text>
              </View>
            ) : editionSheet && editionSheet.groups.exact.length === 0 && editionSheet.groups.seriesSiblings.length === 0 ? (
              <Text style={styles.editionEmpty}>
                {t("editBook.editionSheetEmpty", { language: editionSheet.language })}
              </Text>
            ) : editionSheet ? (
              <ScrollView style={styles.editionList} showsVerticalScrollIndicator={false}>
                {/* ── Group 1: exact translation / same book (applicable) ── */}
                <Text style={styles.editionGroupHeader}>{t("editBook.editionExactHeader")}</Text>
                {editionSheet.groups.exact.length === 0 ? (
                  <Text style={styles.editionEmpty}>
                    {t("editBook.editionSheetEmpty", { language: editionSheet.language })}
                  </Text>
                ) : (
                  editionSheet.groups.exact.map((candidate: EditionCandidate) => (
                    <Pressable accessibilityRole="button"
                      key={candidate.id}
                      style={styles.editionRow}
                      onPress={() => applyEditionCandidate(candidate, editionSheet.language)}
                    >
                      {candidate.coverUrl ? (
                        <Image source={{ uri: candidate.coverUrl }} style={styles.editionCover} resizeMode="cover" />
                      ) : (
                        <View style={[styles.editionCover, styles.editionCoverFallback]}>
                          <Ionicons name="book-outline" size={18} color={c.muted} />
                        </View>
                      )}
                      <View style={styles.editionInfo}>
                        <Text style={styles.editionTitle} numberOfLines={2}>{candidate.title}</Text>
                        <Text style={styles.editionSub} numberOfLines={1}>
                          {[candidate.publishedYear, candidate.publisher, candidate.isbn13].filter(Boolean).join(" · ")}
                        </Text>
                        {(candidate.description?.trim().length ?? 0) > 40 ? (
                          <Text style={styles.editionHasSynopsis}>{t("editBook.editionHasSynopsis")}</Text>
                        ) : null}
                      </View>
                      <Ionicons name="chevron-forward" size={15} color={c.muted} />
                    </Pressable>
                  ))
                )}

                {/* ── Group 2: other books in this series (visible, blocked) ── */}
                {editionSheet.groups.seriesSiblings.length > 0 ? (
                  <>
                    <Text style={styles.editionGroupHeader}>{t("editBook.editionSiblingsHeader")}</Text>
                    {editionSheet.groups.seriesSiblings.map((candidate: EditionCandidate) => (
                      <Pressable accessibilityRole="button"
                        key={candidate.id}
                        style={[styles.editionRow, styles.editionRowBlocked]}
                        onPress={explainSiblingBlocked}
                      >
                        {candidate.coverUrl ? (
                          <Image source={{ uri: candidate.coverUrl }} style={styles.editionCover} resizeMode="cover" />
                        ) : (
                          <View style={[styles.editionCover, styles.editionCoverFallback]}>
                            <Ionicons name="book-outline" size={18} color={c.muted} />
                          </View>
                        )}
                        <View style={styles.editionInfo}>
                          <Text style={styles.editionTitle} numberOfLines={2}>{candidate.title}</Text>
                          <Text style={styles.editionSub} numberOfLines={2}>
                            {t("editBook.editionSiblingBlockedBody")}
                          </Text>
                        </View>
                        <Ionicons name="lock-closed-outline" size={15} color={c.muted} />
                      </Pressable>
                    ))}
                  </>
                ) : null}
              </ScrollView>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>


      {/* ══ EDITION DETAILS (folded) ════════════════════════════════════════ */}
      <Pressable accessibilityRole="button" style={styles.foldToggle} onPress={() => setDetailsOpen((v) => !v)}>
        <Text style={styles.groupHeaderInline}>{t("editBook.sectionEdition")}</Text>
        <Ionicons name={detailsOpen ? "chevron-up" : "chevron-down"} size={16} color={c.muted} />
      </Pressable>
      {detailsOpen ? (
        <View style={styles.group}>
          <View style={styles.groupRow}>
            <IconTile icon="barcode" color={c.muted} styles={styles} />
            <Text style={styles.rowLabel}>ISBN-13</Text>
            <TextInput value={isbn13} onChangeText={setIsbn13} placeholder={t("editBook.unknownShort")} placeholderTextColor={c.muted} keyboardType="number-pad" style={styles.rowInput} />
          </View>
          <View style={[styles.groupRow, styles.groupDivider]}>
            <IconTile icon="barcode-outline" color={c.muted} styles={styles} />
            <Text style={styles.rowLabel}>ISBN-10</Text>
            <TextInput value={isbn10} onChangeText={setIsbn10} placeholder={t("editBook.unknownShort")} placeholderTextColor={c.muted} keyboardType="number-pad" style={styles.rowInput} />
          </View>
          <View style={[styles.groupBlock, styles.groupDivider]}>
            <View style={styles.blockHead}>
              <IconTile icon="pricetags" color={c.teal} styles={styles} />
              <Text style={styles.rowLabel}>{t("editBook.labelGenres")}</Text>
            </View>
            <ChipEditor chips={genres} onChipsChange={setGenres} placeholder={t("editBook.genrePlaceholder")} styles={styles} c={c} />
          </View>
          <View style={[styles.groupBlock, styles.groupDivider]}>
            <View style={styles.blockHead}>
              <IconTile icon="bookmarks" color={c.coral} styles={styles} />
              <Text style={styles.rowLabel}>{t("editBook.labelTags")}</Text>
            </View>
            <ChipEditor chips={tags} onChipsChange={setTags} placeholder={t("editBook.tagPlaceholder")} styles={styles} c={c} />
          </View>
        </View>
      ) : null}

      {/* ══ NOTES & QUOTES ══════════════════════════════════════════════════ */}
      <Text style={styles.groupHeader}>{t("editBook.sectionNotes")}</Text>
      <View style={styles.group}>
        <View style={styles.groupBlock}>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder={t("editBook.notesPlaceholder")}
            placeholderTextColor={c.muted}
            multiline
            style={styles.notesInput}
          />
        </View>
        <View style={[styles.groupBlock, styles.groupDivider]}>
          <Text style={styles.rowLabel}>{t("editBook.labelQuotes")}</Text>
          <ChipEditor chips={favoriteQuotes} onChipsChange={setFavoriteQuotes} placeholder={t("editBook.quotePlaceholder")} styles={styles} c={c} />
        </View>
      </View>

      {/* ── Change cover ── */}
      <Modal visible={coverSheetOpen} transparent animationType="fade" onRequestClose={() => setCoverSheetOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.coverOverlay}>
          <Pressable accessibilityRole="button" accessibilityLabel={t("common.cancel")} style={StyleSheet.absoluteFill} onPress={() => setCoverSheetOpen(false)} />
          <View style={styles.coverSheet}>
            <Text style={styles.coverSheetTitle}>{t("editBook.changeCover")}</Text>
            <Text style={styles.groupHint}>{t("editBook.coverHint")}</Text>
            <TextInput
              autoFocus
              value={coverDraft}
              onChangeText={setCoverDraft}
              placeholder="https://…"
              placeholderTextColor={c.muted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={styles.inlineField}
            />
            <View style={styles.coverActions}>
              {coverImageUri ? (
                <Pressable accessibilityRole="button" style={styles.coverGhost} onPress={() => { setCoverImageUri(""); setCoverSheetOpen(false); }}>
                  <Text style={[styles.coverGhostText, { color: c.danger }]}>{t("editBook.removeCover")}</Text>
                </Pressable>
              ) : null}
              <Pressable accessibilityRole="button" style={styles.coverPrimary} onPress={() => { setCoverImageUri(coverDraft.trim()); setCoverSheetOpen(false); }}>
                <Text style={styles.coverPrimaryText}>{t("common.save")}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ══ DELETE ══════════════════════════════════════════════════════════ */}
      <View style={[styles.group, { marginTop: spacing.xl }]}>
        <Pressable accessibilityRole="button" style={styles.deleteRow} onPress={onDelete}>
          <Text style={styles.deleteRowText}>{t("editBook.deleteRow")}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Settings-style rounded colour square with a white glyph. */
function IconTile({ icon, color, styles }: {
  icon: keyof typeof Ionicons.glyphMap; color: string; styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={[styles.iconTile, { backgroundColor: color }]}>
      <Ionicons name={icon} size={16} color="#FFFFFF" />
    </View>
  );
}

/** Chip list with add-new inline input */
function ChipEditor({
  chips, onChipsChange, placeholder, styles, c,
}: {
  chips: string[]; onChipsChange: (v: string[]) => void;
  placeholder: string; styles: ReturnType<typeof createStyles>; c: AppColors;
}) {
  const { t } = useI18n();
  const [adding, setAdding] = useState(false);
  const [draft,  setDraft]  = useState("");
  const inputRef = useRef<TextInput>(null);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && !chips.includes(trimmed)) {
      onChipsChange([...chips, trimmed]);
    }
    setDraft("");
    setAdding(false);
  };

  const remove = (chip: string) => onChipsChange(chips.filter((c) => c !== chip));

  return (
    <View style={styles.chipWrap}>
      {chips.map((chip) => (
        <Pressable accessibilityRole="button" key={chip} style={styles.chip} onPress={() => remove(chip)}>
          <Text style={styles.chipText}>{chip}</Text>
          <Ionicons name="close" size={12} color={c.muted} style={{ marginLeft: 4 }} />
        </Pressable>
      ))}

      {adding ? (
        <TextInput
          ref={inputRef}
          autoFocus
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={commit}
          onBlur={commit}
          placeholder={placeholder}
          placeholderTextColor={c.muted}
          style={styles.chipInput}
          returnKeyType="done"
        />
      ) : (
        <Pressable accessibilityRole="button" style={styles.chipAdd} onPress={() => { setAdding(true); }}>
          <Ionicons name="add" size={14} color={c.teal} />
          <Text style={styles.chipAddText}>{t("editBook.chipAdd")}</Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function createStyles(c: AppColors) {
  return StyleSheet.create({
    // ── Deluxe layout ─────────────────────────────────────────────────────
    headerSave: { paddingHorizontal: 4 },
    headerSaveText: { color: c.tealDark, fontFamily: fonts.body, fontSize: 17, fontWeight: "900" },
    heroDeluxe: { alignItems: "center", gap: spacing.sm, marginBottom: spacing.lg, paddingTop: spacing.sm },
    heroTitleInput: {
      color: c.ink, fontFamily: fonts.display, fontSize: 24, fontWeight: "900", lineHeight: 29,
      marginTop: spacing.sm, minWidth: 200, paddingVertical: 0, textAlign: "center",
    },
    heroAuthorInput: {
      color: c.muted, fontFamily: fonts.body, fontSize: 16, fontWeight: "700", minWidth: 160,
      paddingVertical: 0, textAlign: "center",
    },
    fetchPill: {
      alignItems: "center", backgroundColor: c.teal + "14", borderColor: c.teal + "33", borderRadius: radii.pill,
      borderWidth: 1, flexDirection: "row", gap: 6, marginTop: spacing.xs, paddingHorizontal: 14, paddingVertical: 8,
    },
    fetchPillText: { color: c.tealDark, fontFamily: fonts.body, fontSize: 13, fontWeight: "800" },
    groupHeader: {
      color: c.muted, fontFamily: fonts.body, fontSize: 12, fontWeight: "900", letterSpacing: 0.8,
      marginBottom: spacing.xs, marginTop: spacing.lg, textTransform: "uppercase",
    },
    groupHeaderInline: {
      color: c.muted, flex: 1, fontFamily: fonts.body, fontSize: 12, fontWeight: "900", letterSpacing: 0.8,
      textTransform: "uppercase",
    },
    foldToggle: {
      alignItems: "center", flexDirection: "row", marginBottom: spacing.xs, marginTop: spacing.lg,
      paddingVertical: 4,
    },
    group: {
      overflow: "hidden",
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    groupRow: { alignItems: "center", flexDirection: "row", gap: spacing.sm, minHeight: 52 },
    groupBlock: { gap: spacing.sm, paddingVertical: 12 },
    groupDivider: { borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth },
    groupHint: { color: c.muted, fontFamily: fonts.bodyRegular, fontSize: 12, lineHeight: 17 },
    rowLabel: { color: c.ink, fontFamily: fonts.body, fontSize: 16, fontWeight: "600" },
    iconTile: { alignItems: "center", borderRadius: 7, height: 28, justifyContent: "center", width: 28 },
    blockHead: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
    chipFlow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    inlineField: {
      backgroundColor: c.surfaceAlt,
      borderRadius: radii.sm,
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 15,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
    },
    coverBadge: {
      alignItems: "center", backgroundColor: c.tealDark, borderColor: c.bg, borderRadius: 14, borderWidth: 2,
      bottom: -6, height: 28, justifyContent: "center", position: "absolute", right: -6, width: 28,
    },
    coverOverlay: { backgroundColor: "rgba(0,0,0,0.4)", flex: 1, justifyContent: "flex-end", padding: spacing.md },
    coverSheet: { backgroundColor: c.surface, borderRadius: radii.lg, gap: spacing.sm, marginBottom: spacing.xl, padding: spacing.lg },
    coverSheetTitle: { color: c.ink, fontFamily: fonts.display, fontSize: 18, fontWeight: "900" },
    coverActions: { flexDirection: "row", gap: spacing.sm, justifyContent: "flex-end", marginTop: spacing.xs },
    coverGhost: { justifyContent: "center", paddingHorizontal: spacing.md, paddingVertical: 10 },
    coverGhostText: { fontFamily: fonts.body, fontSize: 15, fontWeight: "800" },
    coverPrimary: { backgroundColor: c.teal, borderRadius: radii.pill, paddingHorizontal: spacing.lg, paddingVertical: 10 },
    coverPrimaryText: { color: "#FFFFFF", fontFamily: fonts.body, fontSize: 15, fontWeight: "900" },
    rowValue: { color: c.muted, flex: 1, fontFamily: fonts.body, fontSize: 16, fontWeight: "600", textAlign: "right" },
    rowInput: { color: c.muted, flex: 1, fontFamily: fonts.body, fontSize: 16, fontWeight: "600", paddingVertical: 14, textAlign: "right" },
    rowInputNarrow: { flex: 0, minWidth: 44 },
    rowUnit: { color: c.muted, fontFamily: fonts.body, fontSize: 14, fontWeight: "700" },
    segment: { gap: 6 },
    segmentItem: {
      backgroundColor: c.surfaceAlt, borderColor: c.border, borderRadius: radii.pill, borderWidth: 1,
      paddingHorizontal: 14, paddingVertical: 8,
    },
    segmentItemActive: { backgroundColor: c.teal, borderColor: c.teal },
    segmentText: { color: c.ink, fontFamily: fonts.body, fontSize: 14, fontWeight: "800" },
    segmentTextActive: { color: "#FFFFFF" },
    optionList: { backgroundColor: c.surfaceAlt, borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth },
    optionRow: { alignItems: "center", flexDirection: "row", gap: spacing.sm, minHeight: 44, paddingLeft: 56, paddingRight: spacing.md },
    optionText: { color: c.ink, flex: 1, fontFamily: fonts.body, fontSize: 15 },
    notesInput: { color: c.ink, fontFamily: fonts.bodyRegular, fontSize: 15, lineHeight: 21, minHeight: 80, textAlignVertical: "top" },
    deleteRow: { alignItems: "center", minHeight: 52, justifyContent: "center" },
    deleteRowText: { color: c.danger, fontFamily: fonts.body, fontSize: 16, fontWeight: "800" },

    // Hero
    hero: {
      ...shadows.card,
      alignItems: "center",
      backgroundColor: c.navy,
      borderRadius: radii.lg,
      flexDirection: "row",
      gap: spacing.md,
      marginBottom: spacing.md,
      padding: spacing.md,
    },
    heroCopy: { flex: 1 },
    heroEyebrow: { color: c.gold, fontFamily: fonts.body, fontSize: 11, fontWeight: "900", letterSpacing: 1.2, textTransform: "uppercase" },
    heroTitle: { color: "#fff", fontFamily: fonts.display, fontSize: 22, fontWeight: "900", lineHeight: 27, marginTop: 4 },
    heroAuthor: { color: "rgba(255,255,255,0.60)", fontFamily: fonts.body, fontSize: 13, marginTop: 4 },

    // Fetch
    fetchBtn: {
      ...shadows.card,
      alignItems: "center",
      backgroundColor: c.surface,
      borderColor: c.teal + "55",
      borderRadius: radii.md,
      borderWidth: 1,
      flexDirection: "row",
      gap: spacing.sm,
      justifyContent: "center",
      marginBottom: spacing.md,
      paddingVertical: 12,
    },
    fetchBtnBusy: { opacity: 0.6 },
    fetchBtnText: { color: c.teal, fontFamily: fonts.body, fontSize: 13, fontWeight: "900" },

    // Field card
    fieldCard: {
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    fieldCardHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: 7,
      marginBottom: spacing.sm,
    },
    fieldCardLabel: {
      color: c.teal,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: "900",
      letterSpacing: 0.3,
      textTransform: "uppercase",
    },

    // Plain input (inside card — no extra border)
    plainInput: {
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 15,
      fontWeight: "700",
      minHeight: 36,
      paddingVertical: 2,
    },
    plainInputMulti: {
      minHeight: 88,
      textAlignVertical: "top",
    },

    // Pill row (format / status)
    pillRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    pill: {
      alignItems: "center",
      backgroundColor: c.surfaceAlt,
      borderColor: c.border,
      borderRadius: radii.pill,
      borderWidth: 1,
      flexDirection: "row",
      gap: 5,
      paddingHorizontal: 13,
      paddingVertical: 8,
    },
    pillActive: {
      backgroundColor: c.navy,
      borderColor: c.teal,
    },
    pillText: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 12,
      fontWeight: "900",
    },
    pillTextActive: {
      color: "#fff",
    },

    // Chip editor
    chipWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 7,
    },
    chip: {
      alignItems: "center",
      backgroundColor: c.teal + "18",
      borderColor: c.teal + "44",
      borderRadius: radii.pill,
      borderWidth: 1,
      flexDirection: "row",
      paddingHorizontal: 11,
      paddingVertical: 6,
    },
    chipText: {
      color: c.tealDark,
      fontFamily: fonts.body,
      fontSize: 12,
      fontWeight: "900",
    },
    chipInput: {
      borderBottomColor: c.teal,
      borderBottomWidth: 1.5,
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: "700",
      minWidth: 80,
      paddingVertical: 4,
    },
    chipAdd: {
      alignItems: "center",
      backgroundColor: c.surfaceAlt,
      borderColor: c.border,
      borderRadius: radii.pill,
      borderStyle: "dashed",
      borderWidth: 1,
      flexDirection: "row",
      gap: 4,
      paddingHorizontal: 11,
      paddingVertical: 6,
    },
    chipAddText: {
      color: c.teal,
      fontFamily: fonts.body,
      fontSize: 12,
      fontWeight: "900",
    },

    // Language picker
    langChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
    langHint: {
      color: c.muted,
      fontFamily: fonts.bodyRegular,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 8,
      opacity: 0.85,
    },

    // Edition picker sheet
    editionOverlay: { backgroundColor: "rgba(0,0,0,0.5)", flex: 1, justifyContent: "flex-end" },
    editionSheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      maxHeight: "75%",
      paddingBottom: 34,
      paddingHorizontal: spacing.lg,
      paddingTop: 10,
    },
    editionHandle: {
      alignSelf: "center", backgroundColor: c.border, borderRadius: 2,
      height: 4, marginBottom: spacing.md, width: 40,
    },
    editionSheetTitle: {
      color: c.ink, fontFamily: fonts.display, fontSize: 20,
      fontWeight: "900", marginBottom: spacing.md,
    },
    editionLoading: { alignItems: "center", flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.lg },
    editionLoadingText: { color: c.muted, fontFamily: fonts.body, fontSize: 13, fontWeight: "700" },
    editionEmpty: { color: c.muted, fontFamily: fonts.bodyRegular, fontSize: 14, lineHeight: 21, paddingVertical: spacing.md },
    editionList: { maxHeight: 440 },
    editionGroupHeader: {
      color: c.teal, fontFamily: fonts.body, fontSize: 11, fontWeight: "800",
      letterSpacing: 0.6, marginTop: spacing.sm, paddingVertical: 6, textTransform: "uppercase",
    },
    editionRow: {
      alignItems: "center", borderBottomColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row", gap: spacing.sm, paddingVertical: 10,
    },
    editionRowBlocked: { opacity: 0.55 },
    editionCover: { backgroundColor: c.surfaceAlt, borderRadius: 6, height: 66, width: 44 },
    editionCoverFallback: { alignItems: "center", borderColor: c.border, borderWidth: 1, justifyContent: "center" },
    editionInfo: { flex: 1 },
    editionTitle: { color: c.ink, fontFamily: fonts.body, fontSize: 14, fontWeight: "800", lineHeight: 18 },
    editionSub: { color: c.muted, fontFamily: fonts.body, fontSize: 11, fontWeight: "700", marginTop: 3 },
    editionHasSynopsis: { color: c.tealDark, fontFamily: fonts.body, fontSize: 10, fontWeight: "800", marginTop: 3 },

    // Toggle chip
    toggleRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    toggleChip: {
      alignItems: "center",
      backgroundColor: c.surfaceAlt,
      borderColor: c.border,
      borderRadius: radii.pill,
      borderWidth: 1,
      flexDirection: "row",
      paddingHorizontal: 13,
      paddingVertical: 8,
    },
    toggleChipActive: {
      backgroundColor: c.teal + "18",
      borderColor: c.teal + "55",
    },
    toggleChipText: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 12,
      fontWeight: "900",
    },
    toggleChipTextActive: {
      color: c.tealDark,
    },

    // Stars
    starsRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm,
    },
    ratingLabel: {
      color: c.gold,
      fontFamily: fonts.body,
      fontSize: 14,
      fontWeight: "900",
      marginLeft: 4,
    },

    // Save / delete
    saveBtn: {
      ...shadows.card,
      alignItems: "center",
      backgroundColor: c.teal,
      borderRadius: radii.pill,
      flexDirection: "row",
      gap: spacing.sm,
      justifyContent: "center",
      marginBottom: spacing.md,
      marginTop: spacing.md,
      paddingVertical: 15,
    },
    saveBtnText: { color: "#fff", fontFamily: fonts.body, fontSize: 15, fontWeight: "900" },
    dangerZone: {
      borderColor: c.coral + "44",
      borderRadius: radii.sm,
      borderWidth: 1,
      marginBottom: spacing.xl,
      padding: spacing.md,
    },
    dangerEyebrow: { color: c.coral, fontFamily: fonts.body, fontSize: 11, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" },
    dangerTitle: { color: c.ink, fontFamily: fonts.display, fontSize: 18, fontWeight: "900", marginTop: 4 },
    dangerBody: { color: c.muted, fontFamily: fonts.bodyRegular, fontSize: 13, lineHeight: 19, marginTop: 5 },
    deleteBtn: {
      alignItems: "center",
      borderColor: c.coral + "55",
      borderRadius: radii.pill,
      borderWidth: 1,
      flexDirection: "row",
      gap: spacing.sm,
      justifyContent: "center",
      marginTop: spacing.md,
      paddingVertical: 12,
    },
    deleteBtnText: { color: c.coral, fontFamily: fonts.body, fontSize: 14, fontWeight: "900" },

    // ISBN side-by-side
    isbnRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
    isbnDivider: { width: StyleSheet.hairlineWidth, alignSelf: "stretch", marginTop: 18 },
    isbnLabel: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.5,
      marginBottom: 2,
      textTransform: "uppercase",
    },

    // Series inline layout
    seriesRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
    seriesNumWrap: { width: 56 },

    // Dropdown
    dropdownTrigger: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 4,
    },
    dropdownValue: {
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 15,
      fontWeight: "700",
    },
    dropdownList: {
      borderColor: c.border,
      borderRadius: radii.sm,
      borderWidth: 1,
      marginTop: spacing.sm,
      overflow: "hidden",
    },
    dropdownItem: {
      alignItems: "center",
      backgroundColor: c.surfaceAlt,
      flexDirection: "row",
      gap: 10,
      paddingHorizontal: spacing.sm,
      paddingVertical: 13,
    },
    dropdownItemBorder: {
      borderBottomColor: c.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    dropdownItemText: {
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 14,
      fontWeight: "600",
    },

    // Unused but kept for t() calls that might reference them
    emptyText: { color: c.muted, fontFamily: fonts.body, padding: spacing.lg },
  });
}
