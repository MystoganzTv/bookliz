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
import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { BookCover } from "../components/BookCover";
import { Screen } from "../components/Screen";
import { useBookliz } from "../data/BooklizContext";
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

const STATUS_OPTIONS: { value: CoreTrackingStatus; labelKey: string }[] = [
  { value: "reading",          labelKey: "editBook.statusReading" },
  { value: "read",             labelKey: "editBook.statusRead" },
  { value: "want-to-read",     labelKey: "editBook.statusWant" },
  { value: "wishlist",         labelKey: "editBook.statusWishlist" },
  { value: "want-to-buy",      labelKey: "editBook.statusBuy" },
  { value: "dnf",              labelKey: "editBook.statusDnf" },
  { value: "upcoming-release", labelKey: "editBook.statusUpcoming" },
];

const OWNERSHIP_OPTIONS: { value: OwnershipStatus; labelKey: string }[] = [
  { value: "owned",     labelKey: "editBook.ownershipOwned" },
  { value: "not-owned", labelKey: "editBook.ownershipNotOwned" },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export function EditBookScreen() {
  const c = useColors();
  const { t } = useI18n();
  const dialog = useDialog();
  const styles = useMemo(() => createStyles(c), [c]);
  const route = useRoute<RouteProp<RootStackParamList, "EditBook">>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { getAuthor, getBook, updateBook, deleteBook } = useBookliz();

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
  const [isbn13, setIsbn13] = useState(rawIsbn.replace(/\D/g, "").length === 13 ? rawIsbn : "");
  const [isbn10, setIsbn10] = useState(rawIsbn.replace(/\D/g, "").length === 10 ? rawIsbn : "");
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
    setIsbn10(patch.isbn10);
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
  const selectStatus = (next: CoreTrackingStatus) => {
    setStatus(next);
    if (next === "wishlist")     setWishlist(true);
    if (next === "want-to-buy")  setWantToBuy(true);
  };

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
      const clean = meta.isbn.replace(/\D/g, "");
      if (clean.length === 13) { setIsbn13(meta.isbn); } else { setIsbn10(meta.isbn); }
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

    dialog.alert(
      filled.length ? t("editBook.fetchUpdated") : t("editBook.fetchAllFilled"),
      filled.length ? `Updated: ${filled.join(", ")}.` : t("editBook.fetchAllFilledBody")
    );
  };

  if (!book) {
    return <Screen><Text style={{ color: c.muted, fontFamily: fonts.body, padding: spacing.lg }}>Book not found.</Text></Screen>;
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
      progressPercent: parseNum(progressPercent) ?? book.userStatus.progressPercent,
      notes,
      favoriteQuotes: favoriteQuotes.map((q) => q.trim()).filter(Boolean),
    });
    navigation.goBack();
  };

  const onDelete = () => {
    dialog.confirm({
      title: t("editBook.deleteTitle"),
      body: `Bookliz will remove ${title || book.title} and all its data from your library.`,
      confirmLabel: t("editBook.deleteConfirm"),
      destructive: true,
      onConfirm: () => {
        deleteBook(book.id);
        navigation.reset({ index: 0, routes: [{ name: "AppTabs" }] });
      },
    });
  };

  return (
    <Screen>
      {/* ── HERO HEADER ─────────────────────────────────────────────────── */}
      <View style={styles.hero}>
        <BookCover book={previewBook} size="md" />
        <View style={styles.heroCopy}>
          <Text style={styles.heroEyebrow}>Edit book</Text>
          <Text style={styles.heroTitle} numberOfLines={3}>{title || book.title}</Text>
          <Text style={styles.heroAuthor} numberOfLines={1}>{authorName || t("editBook.unknownAuthor")}</Text>
        </View>
      </View>

      {/* ── FETCH BUTTON ─────────────────────────────────────────────────── */}
      <Pressable accessibilityRole="button" style={[styles.fetchBtn, isFetching && styles.fetchBtnBusy]} onPress={fetchInfo} disabled={isFetching}>
        {isFetching
          ? <ActivityIndicator size="small" color={c.teal} />
          : <Ionicons name="cloud-download-outline" size={16} color={c.teal} />}
        <Text style={styles.fetchBtnText}>{isFetching ? t("editBook.fetchBtnSearching") : t("editBook.fetchBtn")}</Text>
      </Pressable>

      {/* ══ BOOK INFO ════════════════════════════════════════════════════════ */}
      <FieldCard icon="text-outline" label={t("editBook.labelTitle")} c={c} styles={styles}>
        <PlainInput value={title} onChangeText={setTitle} placeholder="Book title" styles={styles} c={c} />
      </FieldCard>

      <FieldCard icon="person-outline" label={t("editBook.labelAuthor")} c={c} styles={styles}>
        <PlainInput value={authorName} onChangeText={setAuthorName} placeholder="Author name" styles={styles} c={c} />
      </FieldCard>

      <FieldCard icon="layers-outline" label={t("editBook.labelSeries")} c={c} styles={styles}>
        <View style={styles.seriesRow}>
          <View style={{ flex: 1 }}>
            <PlainInput value={seriesName} onChangeText={setSeriesName} placeholder="Series name" styles={styles} c={c} />
          </View>
          <View style={styles.seriesNumWrap}>
            <PlainInput value={seriesNumber} onChangeText={setSeriesNumber} placeholder="#" keyboardType="number-pad" styles={styles} c={c} />
          </View>
        </View>
      </FieldCard>

      {/* ══ FORMAT ═══════════════════════════════════════════════════════════ */}
      <FieldCard icon="book-outline" label={t("editBook.labelFormat")} c={c} styles={styles}>
        {/* Trigger row */}
        <Pressable accessibilityRole="button" style={styles.dropdownTrigger} onPress={() => setFormatOpen((v) => !v)}>
          <Text style={styles.dropdownValue}>
            {(() => { const k = FORMAT_OPTIONS.find((o) => o.value === format)?.labelKey; return k ? t(k) : t("editBook.fmtSelect"); })()}
          </Text>
          <Ionicons
            name={formatOpen ? "chevron-up" : "chevron-down"}
            size={16}
            color={c.muted}
          />
        </Pressable>
        {/* Expanded list */}
        {formatOpen && (
          <View style={styles.dropdownList}>
            {FORMAT_OPTIONS.map((opt, i) => (
              <Pressable accessibilityRole="button"
                key={opt.value}
                style={[
                  styles.dropdownItem,
                  i < FORMAT_OPTIONS.length - 1 && styles.dropdownItemBorder,
                ]}
                onPress={() => { setFormat(opt.value); setFormatOpen(false); }}
              >
                <Ionicons name={opt.icon} size={15} color={format === opt.value ? c.teal : c.muted} />
                <Text style={[styles.dropdownItemText, format === opt.value && { color: c.teal, fontWeight: "900" }]}>
                  {t(opt.labelKey)}
                </Text>
                {format === opt.value && (
                  <Ionicons name="checkmark" size={16} color={c.teal} style={{ marginLeft: "auto" }} />
                )}
              </Pressable>
            ))}
          </View>
        )}
      </FieldCard>

      {/* ══ RATING ═══════════════════════════════════════════════════════════ */}
      <FieldCard icon="star-outline" label={t("editBook.labelRating")} c={c} styles={styles}>
        <StarRating value={rating} onChange={setRating} styles={styles} c={c} />
      </FieldCard>

      {/* ══ READING STATUS ═══════════════════════════════════════════════════ */}
      <FieldCard icon="bookmark-outline" label={t("editBook.labelStatus")} c={c} styles={styles}>
        <View style={styles.langChipRow}>
          {STATUS_OPTIONS.map((opt) => (
            <ToggleChip
              key={opt.value}
              label={t(opt.labelKey)}
              active={status === opt.value}
              onPress={() => selectStatus(opt.value)}
              styles={styles}
              c={c}
            />
          ))}
        </View>
      </FieldCard>

      {/* ══ OWNERSHIP ════════════════════════════════════════════════════════ */}
      <FieldCard icon="home-outline" label={t("editBook.labelOwnership")} c={c} styles={styles}>
        <View style={styles.toggleRow}>
          {OWNERSHIP_OPTIONS.map((opt) => (
            <ToggleChip
              key={opt.value}
              label={t(opt.labelKey)}
              active={ownership === opt.value}
              onPress={() => setOwnership(opt.value)}
              styles={styles}
              c={c}
            />
          ))}
        </View>
      </FieldCard>

      {/* ══ WISHLIST / WANT-TO-BUY FLAGS ═════════════════════════════════════ */}
      {/* Independent of `status` — see selectStatus() above. */}
      <FieldCard icon="heart-outline" label={t("editBook.labelWishlistFlags")} c={c} styles={styles}>
        <View style={styles.toggleRow}>
          <ToggleChip
            label={t("editBook.toggleWishlist")}
            active={wishlist}
            onPress={() => setWishlist((v) => !v)}
            styles={styles}
            c={c}
          />
          <ToggleChip
            label={t("editBook.toggleWantToBuy")}
            active={wantToBuy}
            onPress={() => setWantToBuy((v) => !v)}
            styles={styles}
            c={c}
          />
        </View>
        <Text style={styles.langHint}>{t("editBook.wishlistHint")}</Text>
      </FieldCard>

      {/* ══ DETAILS ══════════════════════════════════════════════════════════ */}
      <FieldCard icon="document-text-outline" label={t("editBook.labelPages")} c={c} styles={styles}>
        <PlainInput value={pages} onChangeText={setPages} placeholder={t("editBook.pagesPlaceholder")} keyboardType="number-pad" styles={styles} c={c} />
      </FieldCard>

      {/* Only for audiobooks — a printed book has no running time, and asking
          for one would invite a number that means nothing. */}
      {format === "audiobook" ? (
        <FieldCard icon="headset-outline" label={t("editBook.labelDuration")} c={c} styles={styles}>
          <View style={styles.isbnRow}>
            <View style={{ flex: 1 }}>
              <PlainInput
                value={durationHours}
                onChangeText={setDurationHours}
                placeholder={t("editBook.durationHours")}
                keyboardType="number-pad"
                styles={styles}
                c={c}
              />
            </View>
            <View style={{ flex: 1 }}>
              <PlainInput
                value={durationMins}
                onChangeText={setDurationMins}
                placeholder={t("editBook.durationMinutes")}
                keyboardType="number-pad"
                styles={styles}
                c={c}
              />
            </View>
          </View>
          <Text style={styles.langHint}>{t("editBook.durationHint")}</Text>
        </FieldCard>
      ) : null}

      <FieldCard icon="barcode-outline" label={t("editBook.labelIsbn")} c={c} styles={styles}>
        <View style={styles.isbnRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.isbnLabel}>ISBN-13</Text>
            <PlainInput value={isbn13} onChangeText={setIsbn13} placeholder="9780000000000" keyboardType="number-pad" styles={styles} c={c} />
          </View>
          <View style={[styles.isbnDivider, { backgroundColor: c.border }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.isbnLabel}>ISBN-10</Text>
            <PlainInput value={isbn10} onChangeText={setIsbn10} placeholder="0000000000" keyboardType="number-pad" styles={styles} c={c} />
          </View>
        </View>
      </FieldCard>

      <FieldCard icon="language-outline" label={t("editBook.labelLanguage")} c={c} styles={styles}>
        <View style={styles.langChipRow}>
          {["English", "Spanish", "French", "German", "Italian", "Portuguese"].map((lang) => {
            const active = language.trim().toLowerCase() === lang.toLowerCase();
            return (
              <Pressable accessibilityRole="button"
                key={lang}
                style={[styles.toggleChip, active && styles.toggleChipActive]}
                onPress={() => void handleLanguagePick(lang)}
              >
                <Text style={[styles.toggleChipText, active && styles.toggleChipTextActive]}>{lang}</Text>
              </Pressable>
            );
          })}
        </View>
        <PlainInput value={language} onChangeText={setLanguage} placeholder={t("editBook.labelLanguage")} styles={styles} c={c} />
        <Text style={styles.langHint}>{t("editBook.langHint")}</Text>
      </FieldCard>

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

      <FieldCard icon="image-outline" label={t("editBook.labelCover")} c={c} styles={styles}>
        <PlainInput value={coverImageUri} onChangeText={setCoverImageUri} placeholder="https://…" autoCapitalize="none" styles={styles} c={c} />
      </FieldCard>

      {/* ══ GENRES & TAGS ════════════════════════════════════════════════════ */}
      <FieldCard icon="pricetags-outline" label={t("editBook.labelGenres")} c={c} styles={styles}>
        <ChipEditor
          chips={genres}
          onChipsChange={setGenres}
          placeholder={t("editBook.genrePlaceholder")}
          styles={styles}
          c={c}
        />
        <Text style={styles.langHint}>{t("editBook.genreHint")}</Text>
      </FieldCard>

      <FieldCard icon="bookmarks-outline" label={t("editBook.labelTags")} c={c} styles={styles}>
        <ChipEditor
          chips={tags}
          onChipsChange={setTags}
          placeholder={t("editBook.tagPlaceholder")}
          styles={styles}
          c={c}
        />
      </FieldCard>

      {/* ══ NOTES & QUOTES ═══════════════════════════════════════════════════ */}
      <FieldCard icon="create-outline" label={t("editBook.labelNotes")} c={c} styles={styles}>
        <PlainInput
          value={notes}
          onChangeText={setNotes}
          placeholder={t("editBook.notesPlaceholder")}
          multiline
          styles={styles}
          c={c}
        />
      </FieldCard>

      <FieldCard icon="chatbubble-ellipses-outline" label={t("editBook.labelQuotes")} c={c} styles={styles}>
        <ChipEditor
          chips={favoriteQuotes}
          onChipsChange={setFavoriteQuotes}
          placeholder={t("editBook.quotePlaceholder")}
          styles={styles}
          c={c}
        />
      </FieldCard>

      {/* ══ SAVE ═════════════════════════════════════════════════════════════ */}
      <Pressable accessibilityRole="button" style={styles.saveBtn} onPress={onSave}>
        <Ionicons name="checkmark" size={18} color="#fff" />
        <Text style={styles.saveBtnText}>{t("editBook.saveBtn")}</Text>
      </Pressable>

      {/* ══ DANGER ZONE ══════════════════════════════════════════════════════ */}
      <View style={styles.dangerZone}>
        <Text style={styles.dangerEyebrow}>{t("settings.dangerEyebrow")}</Text>
        <Text style={styles.dangerTitle}>{t("editBook.deleteTitle")}</Text>
        <Text style={styles.dangerBody}>{t("editBook.deleteBody")}</Text>
        <Pressable accessibilityRole="button" style={styles.deleteBtn} onPress={onDelete}>
          <Ionicons name="trash-outline" size={16} color={c.coral} />
          <Text style={styles.deleteBtnText}>{t("editBook.deleteConfirm")}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Section card: icon + teal bold label + children */
function FieldCard({
  icon, label, children, c, styles,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  children: React.ReactNode;
  c: AppColors;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.fieldCard}>
      <View style={styles.fieldCardHeader}>
        <Ionicons name={icon} size={17} color={c.teal} />
        <Text style={styles.fieldCardLabel}>{label}</Text>
      </View>
      {children}
    </View>
  );
}

/** Plain text input — no border of its own, sits inside the card */
function PlainInput({
  value, onChangeText, placeholder, keyboardType = "default",
  autoCapitalize = "sentences", multiline = false, styles, c,
}: {
  value: string; onChangeText: (v: string) => void; placeholder?: string;
  keyboardType?: "default" | "number-pad" | "numeric"; autoCapitalize?: "none" | "sentences" | "words";
  multiline?: boolean; styles: ReturnType<typeof createStyles>; c: AppColors;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={c.muted}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
      multiline={multiline}
      style={[styles.plainInput, multiline && styles.plainInputMulti]}
    />
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

/** Toggle chip (boolean) */
function ToggleChip({
  label, active, onPress, styles, c,
}: {
  label: string; active: boolean; onPress: () => void;
  styles: ReturnType<typeof createStyles>; c: AppColors;
}) {
  return (
    <Pressable accessibilityRole="button"
      style={[styles.toggleChip, active && styles.toggleChipActive]}
      onPress={onPress}
    >
      {active ? <Ionicons name="checkmark-circle" size={14} color={c.teal} style={{ marginRight: 4 }} /> : null}
      <Text style={[styles.toggleChipText, active && styles.toggleChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

/** Star rating — tap a star to set 1-5, tap same star to clear */
function StarRating({
  value, onChange, styles, c,
}: {
  value: number; onChange: (v: number) => void;
  styles: ReturnType<typeof createStyles>; c: AppColors;
}) {
  const { t } = useI18n();
  return (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          onPress={() => onChange(value === n ? 0 : n)}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={t("a11y.rateStars", { count: n })}
        >
          <Ionicons
            name={n <= value ? "star" : "star-outline"}
            size={32}
            color={n <= value ? c.gold : c.border}
          />
        </Pressable>
      ))}
      {value === 0 ? (
        <Text style={[styles.ratingLabel, { color: c.muted }]}>Tap to rate</Text>
      ) : null}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function createStyles(c: AppColors) {
  return StyleSheet.create({
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
      ...shadows.card,
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: radii.sm,
      borderWidth: 1,
      marginBottom: spacing.sm,
      padding: spacing.md,
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
