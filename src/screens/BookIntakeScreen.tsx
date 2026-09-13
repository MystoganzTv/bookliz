import { Ionicons } from "@expo/vector-icons";
import { CameraView, BarcodeScanningResult, useCameraPermissions } from "expo-camera";
import { RouteProp, useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ActivityIndicator, Animated, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { BooklizDialog } from "../components/BooklizDialog";
import { ScalePressable } from "../components/ScalePressable";
import { Screen } from "../components/Screen";
import { useBookliz } from "../data/BooklizContext";
import { useI18n } from "../i18n/LocalizationContext";
import { RootStackParamList } from "../navigation/types";
import { buildLibraryIndex } from "../services/recommendationEngine";
import { AppColors, colors, fonts, radii, shadows, spacing } from "../theme/theme";
import { useColors, useTheme } from "../theme/ThemeContext";
import { CoreTrackingStatus, NewBookInput, ReadingFormat } from "../types/models";
import { isSameLanguage, languageDisplayName, PRIORITY_LANGUAGE_CODES } from "../utils/languageUtils";
import { shelfFieldsFor } from "../data/shelfRules";
import {
  applyEditionOptionToBookInput,
  BookEditionOption,
  canFetchMetadata,
  enrichBookInput,
  fetchBookMetadataByEditionKey,
  fetchBookMetadataByIsbn,
  fetchEditionOptionsByWorkKey,
  summarizeMetadataChanges
} from "../utils/bookMetadata";
import {
  BookMatch,
  bookMatchToNewBookInput,
} from "../services/bookLookupService";
import {
  lookupByIsbn as aggregatorLookupByIsbn,
  lookupByQuery as aggregatorLookupByQuery,
  detectQueryIntent,
  workEditionToNewBookInput,
} from "../services/bookMetadataAggregator";
import { buildUserTasteProfile, UserTasteProfile } from "../services/userTasteProfile";
import { parseIsbn, formatIsbn13 } from "../utils/isbnUtils";
import {
  compareMatches,
  MatchSortOrder,
  queryTokensOf,
  authorMatchesQuery,
  normalizeSearchText,
  sanitizeSynopsis,
  scoreMatchByTaste,
  isSupplementaryMaterial,
} from "./bookIntake/matchLogic";
import {
  Choice,
  CompactLanguageModal,
  EditionPickerModal,
  Field,
  IconName,
  IntakePath,
  MatchCard,
  MatchGridCard,
  ScanLine,
  ScanQueueCard,
  splitList,
} from "./bookIntake/components";
import {
  ScanQueueEntry,
  ScanShelfChoice,
  entriesAwaitingCommit,
  expiredEntries,
  QUESTION_TIMEOUT_MS,
  scanQueueReducer,
  timedOutQuestions,
  unansweredEntries,
} from "./bookIntake/scanQueue";
import { createStyles } from "./bookIntake/styles";
import { findEditionsInLanguage } from "../utils/metadataResolver";
import { buildEditionSwitchPatch } from "../utils/editionSwitch";
import { groupEditionCandidates } from "../utils/editionMatchValidation";
import { hapticLight, hapticSuccess } from "../utils/haptics";

type IntakeMode = "menu" | "isbn" | "manual" | "search" | "matches" | "review";
type DiscoverSearchIntent = "auto" | "author" | "series" | "title";

/**
 * What the query is meant to be. Until now this was guessed from the text
 * (detectQueryIntent) and the guess was invisible: "Miller" is an author,
 * "Circe" is a title, and "Pilar" is both — and when the guess went the wrong
 * way the user had no way to say so. The guess survives as the INITIAL value;
 * the toggle is what decides.
 */
type SearchScope = "title" | "author";
type BookIntakeRouteProp = RouteProp<RootStackParamList, "BookIntake">;

const booklizLogo = require("../../assets/brand/bookliz-logo.png");

const COMMON_LANGUAGES = [
  "English", "Spanish", "French", "German", "Italian",
  "Portuguese", "Russian", "Japanese", "Chinese", "Korean",
  "Arabic", "Dutch", "Swedish", "Polish", "Turkish"
];

const REVIEW_FORMATS: { value: ReadingFormat; label: string; icon: IconName }[] = [
  { value: "physical", label: "Physical", icon: "book-outline" },
  { value: "kindle", label: "Kindle", icon: "tablet-portrait-outline" },
  { value: "audiobook", label: "Audiobook", icon: "headset-outline" }
];


const sourceLabel: Record<NewBookInput["source"], string> = {
  photo: "Cover photo",
  isbn: "ISBN scan",
  manual: "Manual entry",
  search: "Book search"
};











/**
 * How long leaving the scanner waits for in-flight scans to commit before it
 * gives up and closes anyway. The back button must always work.
 */
const EXIT_FLUSH_GRACE_MS = 4000;

export function BookIntakeScreen() {
  const c = useColors();
  const { isDark } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => createStyles(c, isDark), [c, isDark]);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<BookIntakeRouteProp>();
  const {
    addBook,
    deleteBook,
    findDuplicateBook,
    updateBookStatus,
    authors,
    books,
    readingSessions,
    userProfile,
  } = useBookliz();
  const tasteProfile = useMemo(
    () => buildUserTasteProfile({ authors, books, readingSessions, userProfile }),
    [authors, books, readingSessions, userProfile]
  );
  const libraryIndex = useMemo(() => buildLibraryIndex(books), [books]);
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<IntakeMode>("menu");
  const [scanned, setScanned] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [reviewBook, setReviewBook] = useState<NewBookInput | null>(null);
  const [reviewInsight, setReviewInsight] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ title: string; body: string } | null>(null);
  const [isRefreshingMetadata, setIsRefreshingMetadata] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  // "Edit details" section collapsed by default — user expands only if needed
  const [showEditDetails, setShowEditDetails] = useState(false);
  // Language modal
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  // Duplicate detection
  const [duplicateDialog, setDuplicateDialog] = useState<{ existingBookId: string; title: string } | null>(null);
  const [scanZoom, setScanZoom] = useState<0 | 0.05 | 0.12>(0);
  // "camera" = show viewfinder; "manual" = hide camera, show keyboard-friendly input
  const [isbnInputMode, setIsbnInputMode] = useState<"camera" | "manual">("camera");
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const [scanFeedback, setScanFeedback] = useState<string | null>(null);
  // ── Continuous scanner queue ───────────────────────────────────────────────
  // Scanning a barcode never navigates away: each ISBN becomes an entry that
  // resolves underneath the user while the camera keeps reading.
  const [scanQueue, dispatchScanQueue] = useReducer(scanQueueReducer, [] as ScanQueueEntry[]);
  /** Mode to switch to once the scans still in flight have been committed. */
  const [exitAfterFlush, setExitAfterFlush] = useState<IntakeMode | null>(null);
  // Read inside camera callbacks, which close over a stale render otherwise.
  const scanQueueRef = useRef<ScanQueueEntry[]>(scanQueue);
  // Latest duplicate predicate — the library changes while scans are in flight.
  const findDuplicateRef = useRef(findDuplicateBook);
  // ISBNs already handed to addBook. Belt-and-braces against a second commit
  // (re-entrant effect, StrictMode double-invoke): adding a book twice is the
  // one mistake this flow must never make.
  const committedScansRef = useRef<Set<string>>(new Set());
  // Book lookup / match confirmation
  const [matches, setMatches] = useState<BookMatch[]>([]);
  const [matchLookupLabel, setMatchLookupLabel] = useState("");
  const [matchReturnMode, setMatchReturnMode] = useState<"menu" | "isbn" | "search">("menu");
  // Sort order for search results
  const [sortOrder, setSortOrder] = useState<MatchSortOrder>("popular");
  const [searchScope, setSearchScope] = useState<SearchScope>("title");
  /**
   * ISO 639-1 code, or undefined for "any language". Steers the query and the
   * choice of edition; never decides what language a result is said to be.
   */
  const [languageFilter, setLanguageFilter] = useState<string | undefined>(undefined);
  const [showSortSheet, setShowSortSheet] = useState(false);
  const [showLanguageSheet, setShowLanguageSheet] = useState(false);
  /** Where the reader wanted to go, held while unanswered scans are settled. */
  /** The book that just landed, while the rating prompt is up. */
  const [justAdded, setJustAdded] = useState<{ id: string; title: string; status: CoreTrackingStatus } | null>(null);
  // Grid / list toggle for results
  const [matchViewMode, setMatchViewMode] = useState<"list" | "grid">("list");
  const isAuthorQuery = useMemo(
    () => detectQueryIntent(matchLookupLabel) === "author",
    [matchLookupLabel]
  );
  const [isLoadingEditions, setIsLoadingEditions] = useState(false);
  // Review-screen edition picker (paperback / hardcover / translations…)
  const [showEditionModal, setShowEditionModal] = useState(false);
  const [editionOptions, setEditionOptions] = useState<BookEditionOption[]>([]);
  const [editionsWorkKey, setEditionsWorkKey] = useState<string | undefined>();
  // Debounce: prevents re-processing the same barcode within 2 s
  const lastScanRef = useRef<number>(0);
  const notIsbnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialSearchRequestRef = useRef<string | null>(null);
  // Live search: debounce timer + sequence guard so a stale (slower) response
  // can never overwrite the results of a newer query.
  const liveSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeqRef = useRef(0);
  const [manual, setManual] = useState({
    title: "",
    authorName: "",
    isbn: "",
    pages: "",
    genre: "",
    publisher: ""
  });
  const launchedFromDiscover = Boolean(route.params?.initialMode || route.params?.initialBookSelection);

  // Reset everything when the user navigates away mid-flow (taps another tab, etc.)
  // so that returning to the Add tab always shows the main menu, never a stuck mode.
  useFocusEffect(
    useCallback(() => {
      return () => {
        if (liveSearchTimerRef.current) clearTimeout(liveSearchTimerRef.current);
        if (notIsbnTimerRef.current) clearTimeout(notIsbnTimerRef.current);
        notIsbnTimerRef.current = null;
        searchSeqRef.current += 1; // invalidate any in-flight lookup
        initialSearchRequestRef.current = null;
        setMode("menu");
        setScanned(false);
        setIsBusy(false);
        setIsLoadingMore(false);
        setSearchQuery("");
        setReviewBook(null);
        setReviewInsight(null);
        setIsSubmittingReview(false);
        setTorchOn(false);
        setScanZoom(0);
        setIsbnInputMode("camera");
        setScanFeedback(null);
        dispatchScanQueue({ type: "clear" });
        committedScansRef.current.clear();
        setMatches([]);
        setMatchLookupLabel("");
        setMatchViewMode("list");
        setIsLoadingEditions(false);
        setManual({ title: "", authorName: "", isbn: "", pages: "", genre: "", publisher: "" });
      };
    }, [])
  );

  const dialogNode = (
    <BooklizDialog
      open={Boolean(dialog)}
      title={dialog?.title ?? ""}
      body={dialog?.body ?? ""}
      onConfirm={() => setDialog(null)}
    />
  );

  const openDialog = (title: string, body: string) => {
    setDialog({ title, body });
  };

  const stageBook = async (input: NewBookInput, insight?: string | null) => {
    const draft: NewBookInput = {
      ownership: "owned",
      wishlist: false,
      wantToBuy: false,
      format: "physical",
      ...input,
      synopsis: sanitizeSynopsis(input.synopsis),
    };
    if (__DEV__ && draft.wishlist) console.log("[INTAKE] staged onto the wishlist");
    setReviewBook(draft);
    setReviewInsight(insight ?? null);
    setMode("review");
  };

  const confirmAndOpen = (input: NewBookInput) => {
    const book = addBook(input);
    hapticSuccess(); // book landed in the library
    // Offer a rating before leaving. Skippable on purpose: a book added to be
    // read later has nothing to rate yet, and a prompt that cannot be waved
    // away would collect stars that are not about having read anything.
    setJustAdded({ id: book.id, title: book.title, status: book.userStatus.status });
  };

  const openAddedBook = (bookId: string) => {
    setJustAdded(null);
    // Reset so back-press from BookDetail lands on Library, not the Add tab
    navigation.reset({
      index: 1,
      routes: [
        {
          name: "AppTabs",
          state: {
            index: 1, // Library tab (0=Home, 1=Library, 2=Add, 3=Discover, 4=Profile)
            routes: [
              { name: "Home" },
              { name: "Library" },
              { name: "Add" },
              { name: "Discover" },
              { name: "Profile" }
            ]
          }
        },
        { name: "BookDetail", params: { bookId } }
      ]
    });
  };

  const runSearch = async () => {
    if (!searchQuery.trim()) return;
    await lookupAndShowMatches(searchQuery.trim(), "search", "query");
  };

  useEffect(() => {
    const request = route.params;
    if (!request?.initialMode && !request?.initialBookSelection) return;

    const requestKey = JSON.stringify(request);
    if (initialSearchRequestRef.current === requestKey) return;
    initialSearchRequestRef.current = requestKey;

    if (request.initialBookSelection) {
      const { shelf, ...selection } = request.initialBookSelection;
      // shelfRules owns the three flags; the screen only says which shelf.
      const shelfFields = shelf === "wishlist"
        ? shelfFieldsFor("wishlist")
        : shelfFieldsFor("want-to-read", true);
      void stageBook(
        {
          ...selection,
          ...shelfFields,
          source: "search",
        },
        t(shelf === "wishlist" ? "search.stagedWishlist" : "search.stagedLibrary")
      );
      return;
    }

    const initialQuery = request.initialQuery?.trim() ?? "";

    setMode(request.initialMode ?? "search");
    setSearchQuery(initialQuery);

    if (request.initialMode === "search" && request.autoRun && initialQuery) {
      void lookupAndShowMatches(initialQuery, "search", "query", request.initialSearchIntent ?? "auto");
    }
  }, [route.params]);

  /**
   * Fetch matches via the Book Intelligence Engine and navigate to the "matches" mode.
   * Stores the full WorkLookupResult in `lookupResult` and also populates the legacy
   * `matches` array (BookMatch[]) so the existing MatchCard UI keeps working.
   */
  const lookupAndShowMatches = async (
    query: string,
    returnMode: "menu" | "isbn" | "search",
    type: "isbn" | "query" = "query",
    forcedIntent: DiscoverSearchIntent = "auto",
    /** Live (as-you-type) searches fail quietly — no modal dialogs mid-typing. */
    silent = false,
    /** Explicit language for this run; falls back to whatever the chip holds. */
    languageOverride?: string | null
  ) => {
    const language = languageOverride === null ? undefined : languageOverride ?? languageFilter;
    if (liveSearchTimerRef.current) clearTimeout(liveSearchTimerRef.current);
    const seq = ++searchSeqRef.current;
    const isAuthorSearch =
      type === "query" &&
      (forcedIntent === "author" || (forcedIntent === "auto" && detectQueryIntent(query) === "author"));
    // Keep the toggle honest about what this search actually did, including
    // when the guess picked for us.
    if (type === "query") setSearchScope(isAuthorSearch ? "author" : "title");
    const initialSortOrder: MatchSortOrder =
      type === "isbn" ? "relevance" : isAuthorSearch ? "year_desc" : "relevance";

    setSortOrder(initialSortOrder);
    setMatches([]);
    // Silent (live) searches keep whatever the user is typing in the input.
    if (!silent) setMatchLookupLabel(query);
    else setMatchLookupLabel((current) => (current.trim() ? current : query));
    setMatchReturnMode(returnMode);
    setMode("matches");
    setScanFeedback(null); // clear scanner badge when moving to results
    setIsBusy(true);

    // "Angels and Demons by Dan Brown" → title + author. Only applied when the
    // author side looks like a real name (2-4 words) to avoid titles like
    // "Stand by Me" being split incorrectly.
    let queryTitle = query;
    let queryAuthor: string | undefined;
    if (type === "query") {
      const byMatch = query.match(/^(.{2,}?)\s+by\s+(.{4,})$/i);
      const authorTokens = byMatch?.[2].trim().split(/\s+/) ?? [];
      if (byMatch && authorTokens.length >= 2 && authorTokens.length <= 4) {
        queryTitle = byMatch[1].trim();
        queryAuthor = byMatch[2].trim();
      }
    }

    try {
      const result = await (
        type === "isbn"
          ? aggregatorLookupByIsbn(query)
          : aggregatorLookupByQuery(
              queryTitle,
              queryAuthor,
              queryAuthor ? "title" :
              forcedIntent === "author" ? "author" :
              forcedIntent === "series" || forcedIntent === "title" ? "title" : "auto",
              { language }
            )
      );
      if (seq !== searchSeqRef.current) return; // a newer search superseded this one
      // One match card per unique BookWork (different books), using each
      // work's own author, title, and best edition — not flatEditions which
      // mixes all editions from all books with the wrong author.
      const isAuthor = isAuthorSearch;
      const works = result.works.length ? result.works : result.work ? [result.work] : [];
      // For author queries show ALL results (full catalog); for title queries cap at 8.
      const sliced = works; // no cap — show all results
      const legacyMatches: BookMatch[] = sliced
        .map((work) => {
          // With a language filter on, the row must be the edition IN that
          // language — not the work's default edition with a language chip
          // bolted on. A work with no edition that says so is dropped rather
          // than shown unlabelled, because an unlabelled row inside a filtered
          // list reads as "we checked", and we did not.
          const inLanguage = language
            ? work.editions.find((edition) => isSameLanguage(edition.language, language))
            : undefined;
          const best = language ? inLanguage : (work.bestEdition ?? work.editions[0]);
          if (language && !best) return null;
          const match: BookMatch = {
            id: work.workKey ?? best?.id ?? work.title,
            title: work.title,
            subtitle: work.subtitle,
            authors: work.authors,                    // ← correct per-work author
            isbn13: best?.isbn13,
            isbn10: best?.isbn10,
            coverUrl: best?.coverUrl,
            description: work.description,
            genres: work.genres ?? [],
            pageCount: best?.pageCount,
            publisher: best?.publisher,
            publishedDate: best?.publishedDate,
            // Work-level facts. These are what a search row can honestly show
            // when no specific edition has been resolved yet.
            publishedYear: best?.publishedYear,
            editionCount: work.editionCount,
            language: best?.language,
            format: best?.format,
            source: best?.source ?? "google-books",
            sourceId: best?.editionKey ?? best?.googleBooksId,
            workKey: work.workKey,
            editionKey: best?.editionKey,
            seriesName: work.seriesName,
            seriesOrder: work.seriesOrder,
            averageRating: work.averageRating,
            ratingsCount: work.ratingsCount,
            score: work.score,
            confidence: work.score >= 90 ? "high" : work.score >= 70 ? "medium" : "low",
          };

          if (type === "query" && !isAuthor) {
            match.tasteScore = scoreMatchByTaste(match, tasteProfile, libraryIndex);
          }

          return match;
        })
        .filter((match): match is BookMatch => match !== null);

      // For author queries, sort by publication year descending (most recent first).
      // The aggregator's relevance ranking already surfaced the right books;
      // within that set, readers expect newer releases at the top.
      if (isAuthor) {
        legacyMatches.sort((a, b) => {
          const ya = a.publishedDate ? parseInt(a.publishedDate.slice(0, 4), 10) : 0;
          const yb = b.publishedDate ? parseInt(b.publishedDate.slice(0, 4), 10) : 0;
          return yb - ya;
        });
      }

      // For text/author searches, hide results with no real cover: these are
      // catalog-only merch, study guides, and knockoffs that Google serves with
      // an "image not available" placeholder (the provider already nulls those
      // covers). ISBN scans are kept as-is — a scan should always resolve to its
      // single book even if that edition happens to lack cover art.
      const visibleMatches = type === "isbn"
        ? legacyMatches
        : legacyMatches.filter((match) => match.coverUrl && !isSupplementaryMaterial(match));

      const dedupedMatches = visibleMatches.filter((match, index, all) => (
        all.findIndex((candidate) => candidate.id === match.id) === index
      ));
      const queryTokens = queryTokensOf(query);
      const rankedMatches = [...dedupedMatches].sort((a, b) =>
        compareMatches(a, b, initialSortOrder, queryTokens)
      );
      setMatches(rankedMatches);
    } catch (err) {
      if (seq !== searchSeqRef.current) return;
      if (silent) return; // live search: fail quietly, the empty state covers it
      const isTimeout = err instanceof Error && err.message === "timeout";
      openDialog(
        isTimeout ? t("search.timeoutTitle") : t("search.offlineTitle"),
        isTimeout
          ? t("search.timeoutBody")
          : Platform.OS === "web"
          ? "Couldn't reach book databases. In the web demo, start `npm run metadata-proxy` or try again."
          : t("search.offlineBody")
      );
    } finally {
      if (seq === searchSeqRef.current) {
        setIsBusy(false);
        setScanFeedback(null); // always clear on finish
      }
    }
  };

  /**
   * Live search: schedule a lookup ~600 ms after the user stops typing.
   * Minimum 3 characters; superseded automatically by any manual search.
   */
  const scheduleLiveSearch = (raw: string, returnMode: "menu" | "isbn" | "search") => {
    if (liveSearchTimerRef.current) clearTimeout(liveSearchTimerRef.current);
    const query = raw.trim();
    if (query.length < 3) return;
    liveSearchTimerRef.current = setTimeout(() => {
      void lookupAndShowMatches(query, returnMode, "query", "auto", true);
    }, 600);
  };

  /**
   * Stage the chosen BookMatch for review.
   */
  const selectMatch = async (match: BookMatch) => {
    // When the user manually picks a result from the match list they have already
    // made an informed choice — a scary "low-confidence" warning is misleading.
    const insight = "Verify details before adding.";
    const source: NewBookInput["source"] = matchReturnMode === "isbn" ? "isbn" : "search";
    let input = bookMatchToNewBookInput(match, source);
    // Search rows carry work-level facts, not a resolved edition: Open Library
    // results legitimately arrive with no ISBN, publisher or page count, and
    // translated editions often ship without a description. Resolve the real
    // edition before staging rather than showing the user a review screen full
    // of blanks — this is the step that replaces the metadata we stopped
    // fabricating.
    const missingEditionFacts = !input.isbn || !input.publisher || !input.pages;
    if (missingEditionFacts || !input.synopsis || input.synopsis.trim().length < 40) {
      setIsBusy(true);
      try { input = await enrichBookInput(input); } catch { /* keep original */ }
      finally { setIsBusy(false); }
    }
    void stageBook(input, insight);
  };

  // ── Continuous scanner ─────────────────────────────────────────────────────

  // Keep the refs the async scan pipeline reads in step with each render.
  useEffect(() => { scanQueueRef.current = scanQueue; }, [scanQueue]);

  /**
   * The reader asked to leave while scans were still being committed. Hold the
   * exit until every one of them has landed in the library, so walking out of
   * the camera never costs a scan.
   *
   * Bounded, deliberately. The wait depends on a network lookup finishing, and
   * a back button that stays dead because a request hung is a worse failure
   * than losing one unresolvable scan — so after EXIT_FLUSH_GRACE_MS the
   * scanner closes regardless.
   */
  useEffect(() => {
    if (!exitAfterFlush) return;
    const stillWorking =
      unansweredEntries(scanQueue).length > 0 ||
      scanQueue.some((entry) => entry.status === "adding" || entry.status === "resolving");
    if (!stillWorking) {
      closeScanner(exitAfterFlush);
      return;
    }
    const escape = setTimeout(() => closeScanner(exitAfterFlush), EXIT_FLUSH_GRACE_MS);
    return () => clearTimeout(escape);
  }, [exitAfterFlush, scanQueue]);

  /**
   * Clear confirmations off the camera once they have been read.
   *
   * "Added to your books" is a receipt, and a stack of receipts is what was
   * covering the barcode frame — three scans in and there was nowhere left to
   * point the phone. Questions are untouched: they wait for an answer for as
   * long as it takes.
   */
  useEffect(() => {
    if (mode !== "isbn") return;
    if (!scanQueue.some((entry) => entry.settledAt !== undefined)) return;
    const timer = setInterval(() => {
      for (const entry of expiredEntries(scanQueueRef.current, Date.now())) {
        dispatchScanQueue({ type: "dismiss", isbn13: entry.isbn13 });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [mode, scanQueue]);

  /**
   * The ownership question answers itself after QUESTION_TIMEOUT_MS.
   *
   * A card that waits forever is a card parked on the barcode frame, and a
   * reader working through a shelf will not stop to answer every book. The
   * scan is not lost: it commits as "undecided" and the Library asks again,
   * where there is room to answer properly.
   */
  useEffect(() => {
    if (mode !== "isbn") return;
    if (!unansweredEntries(scanQueue).length) return;
    const timer = setInterval(() => {
      for (const entry of timedOutQuestions(scanQueueRef.current, Date.now())) {
        dispatchScanQueue({ type: "timedOut", isbn13: entry.isbn13 });
      }
    }, 500);
    return () => clearInterval(timer);
  }, [mode, scanQueue]);
  useEffect(() => { findDuplicateRef.current = findDuplicateBook; }, [findDuplicateBook]);

  /** Transient badge over the camera (not-an-ISBN, already-scanned…). */
  const flashScanFeedback = (message: string) => {
    setScanFeedback(message);
    if (notIsbnTimerRef.current) clearTimeout(notIsbnTimerRef.current);
    notIsbnTimerRef.current = setTimeout(() => {
      notIsbnTimerRef.current = null;
      setScanFeedback(null);
    }, 1800);
  };

  /**
   * Resolve one scanned ISBN in the background. The user is never blocked by
   * this: they can answer "owned / wishlist" while it runs.
   *
   * Nothing is fabricated — when the aggregator has no work for the barcode the
   * entry fails instead of inventing a title.
   */
  const resolveScannedIsbn = async (isbn13: string) => {
    try {
      const result = await aggregatorLookupByIsbn(isbn13);
      const work = result.work ?? result.works[0] ?? null;
      // Same edition choice as the match list makes for an ISBN lookup.
      const edition = work?.bestEdition ?? work?.editions[0];
      if (!work || !edition) {
        dispatchScanQueue({ type: "failed", isbn13 });
        return;
      }

      const input: NewBookInput = {
        ...workEditionToNewBookInput(work, edition, "isbn"),
        seriesName: work.seriesName,
        seriesNumber: work.seriesOrder,
        languageCode: edition.languageCode,
        // The barcode was on a physical object — no format question needed.
        format: "physical",
        // The scanned code is ground truth when the edition record has none.
        isbn: edition.isbn13 ?? edition.isbn10 ?? isbn13,
        synopsis: sanitizeSynopsis(work.description),
      };

      const dupe = findDuplicateRef.current(input);
      if (dupe) {
        dispatchScanQueue({ type: "duplicate", isbn13, existingTitle: dupe.title, at: Date.now() });
        return;
      }

      dispatchScanQueue({
        type: "resolved",
        isbn13,
        book: input,
        // `isbnMatch === false` means the aggregator fell back to a title
        // search: plausible, but not confirmed to be the barcode in hand.
        unverified: !result.isbnMatch,
        // Restarts the countdown: the reader gets the full window with the
        // title on screen, not whatever was left after the network.
        at: Date.now(),
      });
    } catch {
      dispatchScanQueue({ type: "failed", isbn13 });
    }
  };

  /**
   * Commit answered + resolved entries. This is the ONLY place a scanned book
   * reaches the library, which is why it re-checks for duplicates first: the
   * library may have changed between resolution and the user's answer.
   */
  useEffect(() => {
    // ONE per run, deliberately: committing two books in the same pass would
    // run the second duplicate check against a stale library snapshot. The
    // effect re-fires with fresh data as soon as this book lands.
    const entry = entriesAwaitingCommit(scanQueue).find(
      (candidate) => !committedScansRef.current.has(candidate.isbn13)
    );
    if (!entry?.book || !entry.choice) return;

    // Three answers, not two. "undecided" is the clock speaking for a reader
    // who said nothing: it must not assert either shelf, so the book goes in
    // as a plain tracked book carrying the unanswered question.
    const wantsOwned = entry.choice === "owned";
    const wantsWishlist = entry.choice === "wishlist";
    const input: NewBookInput = {
      ...entry.book,
      ownership: wantsOwned ? "owned" : wantsWishlist ? "not-owned" : "undecided",
      wishlist: wantsWishlist,
      wantToBuy: false,
    };

    const dupe = findDuplicateRef.current(input);
    if (dupe) {
      dispatchScanQueue({ type: "duplicate", isbn13: entry.isbn13, existingTitle: dupe.title, at: Date.now() });
      return;
    }

    committedScansRef.current.add(entry.isbn13);
    const book = addBook(input);
    // addBook always lands on "want-to-read"; wishlist is its own status and
    // updateBookStatus owns the (status + flag + ownership) triple. An
    // undecided book stays on "want-to-read" — moving it to the wishlist would
    // be answering the very question that is still open.
    if (wantsWishlist) updateBookStatus(book.id, "wishlist");
    hapticSuccess();
    dispatchScanQueue({ type: "added", isbn13: entry.isbn13, bookId: book.id, at: Date.now() });
  }, [scanQueue, addBook, updateBookStatus]);

  const chooseScanShelf = (entry: ScanQueueEntry, choice: ScanShelfChoice) => {
    hapticLight();
    dispatchScanQueue({ type: "choose", isbn13: entry.isbn13, choice });
  };

  const undoScanEntry = (entry: ScanQueueEntry) => {
    if (entry.bookId) deleteBook(entry.bookId);
    committedScansRef.current.delete(entry.isbn13);
    dispatchScanQueue({ type: "undone", isbn13: entry.isbn13 });
  };

  const dismissScanEntry = (entry: ScanQueueEntry) => {
    committedScansRef.current.delete(entry.isbn13);
    dispatchScanQueue({ type: "dismiss", isbn13: entry.isbn13 });
  };

  const retryScanEntry = (entry: ScanQueueEntry) => {
    dispatchScanQueue({ type: "retry", isbn13: entry.isbn13 });
    void resolveScannedIsbn(entry.isbn13);
  };

  /** Leave the scanner for another mode, dropping the on-screen queue. */
  const closeScanner = (next: IntakeMode) => {
    dispatchScanQueue({ type: "clear" });
    committedScansRef.current.clear();
    setScanFeedback(null);
    setScanned(false);
    setExitAfterFlush(null);
    setMode(next);
  };

  /**
   * Leaving with scans still inside their answering window.
   *
   * This used to stop the reader with a sheet repeating every unanswered
   * question, which is the same interruption the countdown exists to remove —
   * and asking twice is how you train someone to tap at random. The scans are
   * simply timed out on the spot: they commit as undecided, exactly as if the
   * clock had reached them, and the Library asks once, later, in one place.
   *
   * `closeScanner` is not called here: it clears the queue, and these entries
   * still have to be committed. The commit effect drains them and the "every
   * question settled" effect below closes the scanner when it is done.
   */
  const leaveScanner = (next: IntakeMode) => {
    const pending = unansweredEntries(scanQueue);
    if (!pending.length) {
      closeScanner(next);
      return;
    }
    for (const entry of pending) dispatchScanQueue({ type: "timedOut", isbn13: entry.isbn13 });
    setExitAfterFlush(next);
  };

  /** Failed lookup → the existing manual path, prefilled with the ISBN. */
  const editScanManually = (entry: ScanQueueEntry) => {
    setManual({
      title: "",
      authorName: "",
      isbn: entry.isbn13,
      pages: "",
      genre: "",
      publisher: "",
    });
    leaveScanner("manual");
  };

  /**
   * ISBN barcode handler — debounced (2 s), validates before lookup.
   * The camera is never stopped: a valid ISBN joins the queue and resolves in
   * the background while the user keeps scanning.
   */
  const handleBarcode = ({ data }: BarcodeScanningResult) => {
    const now = Date.now();
    if (now - lastScanRef.current < 2000) return; // debounce — camera keeps scanning

    const parsed = parseIsbn(data);
    if (!parsed) {
      // Not a book ISBN (QR, retail UPC…): say so briefly and keep the camera
      // live instead of locking the scanner forever.
      lastScanRef.current = now;
      flashScanFeedback(t("scan.notIsbn"));
      return;
    }

    lastScanRef.current = now;

    // Same barcode twice in a row → one entry only (the reducer enforces it
    // too; this branch exists to explain the no-op to the user).
    if (scanQueueRef.current.some((entry) => entry.isbn13 === parsed.isbn13)) {
      flashScanFeedback(t("scanQueue.alreadyScanned"));
      return;
    }

    hapticLight(); // barcode caught
    dispatchScanQueue({ type: "scanned", isbn13: parsed.isbn13, isbn10: parsed.isbn10, at: now });
    void resolveScannedIsbn(parsed.isbn13);
  };

  const saveManual = () => {
    void stageBook({
      title: manual.title || "New book",
      authorName: manual.authorName || "Author to identify",
      isbn: manual.isbn || undefined,
      pages: manual.pages ? Number(manual.pages) : undefined,
      genre: manual.genre ? manual.genre.split(",").map((item) => item.trim()).filter(Boolean) : ["Uncategorized"],
      publisher: manual.publisher || undefined,
      source: "manual"
    }, "This draft started from manual entry. You can still refresh metadata before saving.");
  };

  const updateReviewBook = (patch: Partial<NewBookInput>) => {
    setReviewBook((current) => (current ? { ...current, ...patch } : current));
  };

  const refreshReviewMetadata = async () => {
    if (!reviewBook || !canFetchMetadata(reviewBook)) {
      openDialog("Need a clue first", "Add an ISBN or at least a title before refreshing metadata.");
      return;
    }

    setIsRefreshingMetadata(true);
    try {
      const enriched = await enrichBookInput(reviewBook);
      const changes = summarizeMetadataChanges(reviewBook, enriched);
      setReviewBook(enriched);
      if (changes.length) {
        openDialog("Metadata refreshed", `Updated: ${changes.join(", ")}.`);
      } else {
        openDialog("No changes found", "Bookliz couldn't find any additional details for this draft.");
      }
    } catch {
      openDialog(
        "Connection issue",
        Platform.OS === "web"
          ? "Couldn't reach metadata search. In the web demo, start `npm run metadata-proxy` and try again."
          : "Couldn't reach Open Library right now. Try again in a moment."
      );
    } finally {
      setIsRefreshingMetadata(false);
    }
  };

  const selectReviewLanguage = async (language: string) => {
    if (!reviewBook) return;

    // No-op when the language didn't actually change.
    if (normalizeSearchText(language) === normalizeSearchText(reviewBook.language ?? "")) {
      return;
    }

    // STRICT LANGUAGE POLICY — SAME pipeline as the EditBook language chips:
    // findEditionsInLanguage (GB → OL-workKey fallback → translated-title
    // re-query, evidence-based language verdicts) + buildEditionSwitchPatch
    // (locked fields switch together; absent = EMPTY, never inherited).
    setIsRefreshingMetadata(true);
    try {
      const candidates = await findEditionsInLanguage(
        reviewBook.title,
        reviewBook.authorName,
        language,
        { workKey: reviewBook.workKey, isbn: reviewBook.isbn }
      );

      // SAME-BOOK GATE: only exact translations of THIS book are applicable —
      // another volume of the same series must never be auto-applied.
      const groups = groupEditionCandidates(
        {
          title: reviewBook.title,
          authorName: reviewBook.authorName,
          seriesName: reviewBook.seriesName,
          seriesNumber: reviewBook.seriesNumber,
        },
        candidates
      );

      const best = groups.exact[0];
      if (best) {
        const patch = buildEditionSwitchPatch(best, language);
        if (__DEV__) {
          console.log(
            `[EDITION_SWITCH_APPLY] flow=add-review selectedLanguage=${language} ` +
            `selectedTitle="${best.title}" selectedISBN=${best.isbn13 ?? "-"} ` +
            `selectedEditionKey=${best.id} patch.language=${patch.language} ` +
            `patch.languageCode=${patch.languageCode ?? "-"}`
          );
        }
        setReviewBook((current) => current ? {
          ...current,
          language: patch.language,
          languageCode: patch.languageCode,
          title: patch.title,
          // Locked fields switch with the edition — empty stays empty rather
          // than keeping a value from the previous language.
          isbn: patch.isbn13 || undefined,
          pages: patch.pages ? Number(patch.pages) : undefined,
          publisher: patch.publisher || undefined,
          publishedDate: patch.publishedDate || undefined,
          synopsis: patch.synopsis || undefined,
          coverImageUri: patch.coverImageUri || undefined,
          editionKey: patch.editionKey, // stale pointer cleared
          // Structural fields (workKey, author, genres) persist untouched.
        } : current);
        setReviewInsight(`Switched to the ${language} edition.`);
      } else if (groups.seriesSiblings.length > 0) {
        setReviewInsight(
          `The ${language} results look like other books in the same series, not a translation of this one — current details were kept.`
        );
      } else {
        setReviewInsight(`No ${language} edition found in the catalogs — current details were kept.`);
      }
    } catch {
      setReviewInsight(`Couldn't check ${language} editions right now. Current details were kept.`);
    } finally {
      setIsRefreshingMetadata(false);
    }
  };

  // ── Edition picker (paperback / hardcover / translations…) ─────────────────
  const openEditionPicker = async () => {
    if (!reviewBook?.workKey) return;
    setShowEditionModal(true);
    // Cache by workKey: only refetch when reviewing a different book.
    if (editionsWorkKey === reviewBook.workKey && editionOptions.length > 0) return;
    setIsLoadingEditions(true);
    try {
      const options = await fetchEditionOptionsByWorkKey(reviewBook.workKey, 30);
      setEditionOptions(options);
      setEditionsWorkKey(reviewBook.workKey);
    } catch {
      setEditionOptions([]);
    } finally {
      setIsLoadingEditions(false);
    }
  };

  const selectReviewEdition = (option: BookEditionOption) => {
    setShowEditionModal(false);
    // applyEditionOptionToBookInput patches ISBN/pages/publisher/cover/format/
    // language while preserving the work-level title, author, shelf, and source.
    setReviewBook((current) => (current ? applyEditionOptionToBookInput(current, option) : current));
    setReviewInsight(`Edition selected: ${option.label}.`);
  };

  const confirmReviewBook = () => {
    if (!reviewBook || isSubmittingReview) return;

    // Duplicate check — same ISBN + same language, or same title+author+language
    const dupe = findDuplicateBook(reviewBook);
    if (dupe) {
      setDuplicateDialog({ existingBookId: dupe.id, title: dupe.title });
      return;
    }

    setIsSubmittingReview(true);
    try {
      confirmAndOpen({
        ...reviewBook,
        title: reviewBook.title.trim() || "Untitled Book",
        authorName: reviewBook.authorName.trim() || "Author to identify",
        genre: reviewBook.genre?.length ? reviewBook.genre : ["Uncategorized"],
        // Unknown page count stays unknown — never invent a number.
        pages: reviewBook.pages && reviewBook.pages > 0 ? reviewBook.pages : undefined
      });
    } finally {
      setTimeout(() => setIsSubmittingReview(false), 500);
    }
  };

  if (mode === "review" && reviewBook) {
    return (
      <Screen>
      {dialogNode}
      {/* Back to results */}
      <Pressable accessibilityRole="button"
        style={styles.reviewBackBtn}
        onPress={() => setMode("matches")}
        hitSlop={8}
      >
        <Ionicons name="chevron-back" size={18} color={c.tealDark} />
        <Text style={styles.reviewBackText}>{t("review.backToResults")}</Text>
      </Pressable>
      <View style={styles.reviewHeader}>
          {reviewBook.coverImageUri ? (
            <Image
              source={{ uri: reviewBook.coverImageUri.replace(/zoom=1(?=&|$)/, "zoom=0") }}
              style={styles.reviewCover}
              resizeMode={reviewBook.format === "audiobook" ? "contain" : "cover"}
            />
          ) : (
            <View style={styles.reviewCoverFallback}>
              <Ionicons name="book-outline" size={28} color={c.gold} />
            </View>
          )}
        <View style={styles.reviewHeaderCopy}>
          <Text style={styles.pageEyebrow}>{t("review.eyebrow")}</Text>
          <Text style={styles.reviewTitle} numberOfLines={3}>{reviewBook.title}</Text>
          <Text style={styles.reviewAuthor} numberOfLines={1}>{reviewBook.authorName}</Text>
          <View style={styles.reviewSourcePill}>
            <Ionicons name="sparkles-outline" size={14} color={c.gold} />
            <Text style={styles.reviewSourceText}>{sourceLabel[reviewBook.source]}</Text>
          </View>
        </View>
      </View>

      <View style={styles.metadataStrip}>
        <View style={styles.metadataItemNarrow}>
          <Text style={styles.metadataLabel}>{t("review.pages")}</Text>
          <Text style={styles.metadataValue}>{reviewBook.pages || "—"}</Text>
        </View>
        <View style={styles.metadataDivider} />
        <View style={styles.metadataItem}>
          <Text style={styles.metadataLabel}>{t("review.isbn")}</Text>
          <Text style={styles.metadataValue} numberOfLines={1}>{reviewBook.isbn || "—"}</Text>
        </View>
        <View style={styles.metadataDivider} />
        <View style={styles.metadataItem}>
          <Text style={styles.metadataLabel}>{t("review.publisher")}</Text>
          <Text style={styles.metadataValue} numberOfLines={1}>{reviewBook.publisher || "—"}</Text>
        </View>
      </View>

        <Pressable accessibilityRole="button"
          style={[styles.fetchMetaButton, isRefreshingMetadata && styles.fetchMetaButtonBusy]}
          onPress={refreshReviewMetadata}
          disabled={isRefreshingMetadata}
        >
          {isRefreshingMetadata
            ? <ActivityIndicator size="small" color={c.tealDark} />
            : <Ionicons name="sparkles-outline" size={16} color={c.tealDark} />
          }
          <Text style={styles.fetchMetaButtonText}>
            {isRefreshingMetadata ? t("review.refreshing") : t("review.refreshMetadata")}
          </Text>
        </Pressable>

        {/* ── Edit details (collapsed by default) ─────────────────────── */}
        <Pressable accessibilityRole="button" style={styles.editDetailsToggle} onPress={() => setShowEditDetails((v) => !v)}>
          <Ionicons name={showEditDetails ? "chevron-up-outline" : "create-outline"} size={15} color={c.teal} />
          <Text style={styles.editDetailsToggleText}>{showEditDetails ? t("review.hideDetails") : t("review.editDetails")}</Text>
        </Pressable>

        {showEditDetails ? (
          <>
            <Field label={t("addBook.fieldTitle")} value={reviewBook.title} onChangeText={(title) => updateReviewBook({ title })} />
            <Field label={t("addBook.fieldAuthor")} value={reviewBook.authorName} onChangeText={(authorName) => updateReviewBook({ authorName })} />
            <Field
              label={t("addBook.fieldGenres")}
              value={reviewBook.genre?.join(", ") ?? ""}
              onChangeText={(value) => updateReviewBook({ genre: splitList(value) })}
              hint={t("addBook.fieldGenresHint")}
            />
            <Field
              label={t("addBook.fieldPages")}
              keyboardType="number-pad"
              value={reviewBook.pages ? String(reviewBook.pages) : ""}
              onChangeText={(value) => updateReviewBook({ pages: Number(value) || undefined })}
            />
            <Field label={t("addBook.fieldSynopsis")} value={reviewBook.synopsis ?? ""} onChangeText={(synopsis) => updateReviewBook({ synopsis })} multiline />
          </>
        ) : null}

        {/* ── Language & Edition — compact selectors ───────────────────── */}
        <View style={styles.compactSelectorRow}>
          <Pressable accessibilityRole="button" style={[styles.languageCompactBtn, styles.compactSelectorFlex]} onPress={() => setShowLanguageModal(true)}>
            <Ionicons name="language-outline" size={15} color={c.muted} />
            <Text style={styles.languageCompactText} numberOfLines={1}>{reviewBook.language?.trim() || t("addBook.chooseLanguage")}</Text>
            <Ionicons name="chevron-down-outline" size={13} color={c.muted} />
          </Pressable>

          {reviewBook.workKey ? (
            <Pressable accessibilityRole="button" style={[styles.languageCompactBtn, styles.compactSelectorFlex]} onPress={openEditionPicker}>
              <Ionicons name="layers-outline" size={15} color={c.muted} />
              <Text style={styles.languageCompactText} numberOfLines={1}>
                {[reviewBook.publisher, reviewBook.publishedDate?.slice(0, 4)].filter(Boolean).join(" · ") || t("addBook.chooseEdition")}
              </Text>
              <Ionicons name="chevron-down-outline" size={13} color={c.muted} />
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.reviewSectionTitle}>{t("review.format")}</Text>
        <View style={styles.reviewChoiceGrid}>
          {REVIEW_FORMATS.map((option) => (
            <Choice
              key={option.value}
              active={reviewBook.format === option.value}
              icon={option.icon}
              label={option.label}
              onPress={() => updateReviewBook({ format: option.value })}
            />
          ))}
        </View>

        <Text style={styles.reviewSectionTitle}>{t("review.shelf")}</Text>
        <View style={styles.reviewChoiceGrid}>
          <Choice
            active={reviewBook.ownership === "owned"}
            icon="checkmark-circle-outline"
            label={t("review.owned")}
            onPress={() => updateReviewBook({ ownership: "owned", wishlist: false, wantToBuy: false })}
          />
          <Choice
            active={Boolean(reviewBook.wishlist)}
            icon="bookmark-outline"
            label={t("review.wishlist")}
            onPress={() => updateReviewBook({ ownership: "not-owned", wishlist: true, wantToBuy: false })}
          />
          <Choice
            active={Boolean(reviewBook.wantToBuy)}
            icon="cart-outline"
            label={t("review.wantToBuy")}
            onPress={() => updateReviewBook({ ownership: "not-owned", wishlist: false, wantToBuy: true })}
          />
        </View>

        <View style={styles.reviewActions}>
          <Pressable accessibilityRole="button"
            style={[styles.primaryReviewButton, isSubmittingReview && styles.primaryReviewButtonBusy]}
            onPress={confirmReviewBook}
            disabled={isSubmittingReview}
          >
            {isSubmittingReview ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="library-outline" size={18} color="#FFFFFF" />
            )}
            <Text style={styles.primaryReviewButtonText}>{isSubmittingReview ? t("review.saving") : t("review.addToLibrary")}</Text>
          </Pressable>
          {/* Discard — clear outlined button */}
          <Pressable accessibilityRole="button" style={styles.discardBtn} onPress={() => setMode("menu")}>
            <Ionicons name="trash-outline" size={15} color={c.danger} />
            <Text style={styles.discardBtnText}>{t("review.discard")}</Text>
          </Pressable>

          {/* Scan again — small text link, ISBN source only */}
          {reviewBook?.source === "isbn" ? (
            <Pressable accessibilityRole="button" style={styles.reviewSecondaryLink} onPress={() => { setScanned(false); setMode("isbn"); }}>
              <Ionicons name="barcode-outline" size={13} color={c.muted} />
              <Text style={styles.reviewSecondaryLinkText}>{t("review.scanDifferent")}</Text>
            </Pressable>
          ) : null}
        </View>

        {/* ── Duplicate book dialog ────────────────────────────────────── */}
        <BooklizDialog
          open={Boolean(duplicateDialog)}
          title={t("review.duplicateTitle")}
          body={t("review.duplicateBody", { title: duplicateDialog?.title ?? "" })}
          confirmLabel={t("review.gotIt")}
          cancelLabel={t("review.addAnyway")}
          onConfirm={() => setDuplicateDialog(null)}
          onCancel={() => {
            // User insists — add without duplicate check
            if (reviewBook) {
              setDuplicateDialog(null);
              setIsSubmittingReview(true);
              try {
                confirmAndOpen({
                  ...reviewBook,
                  title: reviewBook.title.trim() || "Untitled Book",
                  authorName: reviewBook.authorName.trim() || "Author to identify",
                  genre: reviewBook.genre?.length ? reviewBook.genre : ["Uncategorized"],
                  pages: reviewBook.pages && reviewBook.pages > 0 ? reviewBook.pages : undefined,
                });
              } finally {
                setTimeout(() => setIsSubmittingReview(false), 500);
              }
            }
          }}
        />

        {/* ── Language modal ───────────────────────────────────────────── */}
        <CompactLanguageModal
          visible={showLanguageModal}
          selected={reviewBook.language ?? ""}
          preferredLanguages={tasteProfile.preferredLanguages.map((l: { language: string }) => l.language)}
          onSelect={(lang) => { setShowLanguageModal(false); selectReviewLanguage(lang); }}
          onClose={() => setShowLanguageModal(false)}
        />

        {/* ── Edition picker modal ─────────────────────────────────────── */}
        <EditionPickerModal
          visible={showEditionModal}
          loading={isLoadingEditions}
          options={editionOptions}
          selectedIsbn={reviewBook.isbn}
          selectedEditionKey={reviewBook.editionKey}
          onSelect={selectReviewEdition}
          onClose={() => setShowEditionModal(false)}
        />
      </Screen>
    );
  }

  if (mode === "matches") {
    const queryTokens = queryTokensOf(matchLookupLabel);
    const sortedMatches = [...matches].sort((a, b) => compareMatches(a, b, sortOrder, queryTokens));

    const primaryMatch = sortedMatches[0];
    // For author queries show every result; for title/ISBN queries cap at 6 secondary cards.
    const otherMatches = sortedMatches.slice(1); // no cap
    // Only treat this as an author search when the top result's author actually
    // matches the query — prevents "Books by Hope Rises" on title searches.
    const confirmedAuthorName =
      isAuthorQuery && primaryMatch && authorMatchesQuery(primaryMatch, queryTokens)
        ? primaryMatch.authors[0]
        : null;
    const backLabel =
      matchReturnMode === "isbn" ? "Scanner" :
      matchReturnMode === "search" ? "Search" : "Add book";

    return (
      <Screen>
        {dialogNode}
        {!launchedFromDiscover ? (
          <Pressable accessibilityRole="button" style={styles.backButton} onPress={() => {
            if (matchReturnMode === "isbn") setScanned(false);
            setMode(matchReturnMode);
          }}>
            <Ionicons name="chevron-back" size={20} color={c.tealDark} />
            <Text style={styles.backButtonText}>{backLabel}</Text>
          </Pressable>
        ) : null}

        <View style={styles.pageHeader}>
          {/* Editable query — tap to refine and re-search without going back */}
          <View style={styles.inlineSearchRow}>
            <TextInput
              style={styles.inlineSearchInput}
              value={matchLookupLabel}
              onChangeText={(value) => {
                setMatchLookupLabel(value);
                scheduleLiveSearch(value, matchReturnMode);
              }}
              returnKeyType="search"
              onSubmitEditing={() => {
                if (matchLookupLabel.trim()) {
                  void lookupAndShowMatches(matchLookupLabel.trim(), matchReturnMode, "query");
                }
              }}
              placeholderTextColor={c.muted}
              placeholder={t("search.searchAgainPlaceholder")}
              selectTextOnFocus
            />
            {isBusy ? (
              <ActivityIndicator size="small" color={c.teal} style={{ marginRight: 4 }} />
            ) : (
              <Pressable
                onPress={() => {
                  if (matchLookupLabel.trim()) {
                    void lookupAndShowMatches(matchLookupLabel.trim(), matchReturnMode, "query");
                  }
                }}
                style={styles.inlineSearchBtn}
                accessibilityRole="button"
                accessibilityLabel={t("a11y.search")}
              >
                <Ionicons name="search" size={16} color="#fff" />
              </Pressable>
            )}
          </View>

          {/* Title | Author — the guess made visible, and correctable — plus
              the language the results should be in */}
          <View style={styles.scopeRow}>
          <View style={styles.scopeToggle}>
            {(["title", "author"] as const).map((scope) => {
              const active = searchScope === scope;
              return (
                <Pressable
                  key={scope}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[styles.scopeOption, active && styles.scopeOptionActive]}
                  onPress={() => {
                    if (active) return;
                    setSearchScope(scope);
                    const query = matchLookupLabel.trim();
                    if (query) void lookupAndShowMatches(query, matchReturnMode, "query", scope);
                  }}
                >
                  <Text style={[styles.scopeOptionText, active && styles.scopeOptionTextActive]}>
                    {scope === "title" ? t("search.scopeTitle") : t("search.scopeAuthor")}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            accessibilityRole="button"
            style={[styles.filterLanguageChip, languageFilter && styles.filterLanguageChipActive]}
            onPress={() => setShowLanguageSheet(true)}
          >
            <Ionicons
              name="language-outline"
              size={13}
              color={languageFilter ? "#fff" : c.tealDark}
            />
            <Text style={[styles.filterLanguageChipText, languageFilter && styles.filterLanguageChipTextActive]}>
              {languageFilter ? languageDisplayName(languageFilter) : t("search.anyLanguage")}
            </Text>
          </Pressable>
          </View>
        </View>

        {/* Scan again shortcut — only when result came from ISBN scanner */}
        {matchReturnMode === "isbn" && !isBusy && matches.length > 0 ? (
          <Pressable accessibilityRole="button"
            style={styles.scanAgainBtn}
            onPress={() => { setScanned(false); setMode("isbn"); }}
          >
            <Ionicons name="barcode-outline" size={16} color={c.tealDark} />
            <Text style={styles.scanAgainText}>{t("search.wrongBookScanAgain")}</Text>
          </Pressable>
        ) : null}

        {isBusy ? (
          <View style={styles.busyRow}>
            <ActivityIndicator size="small" color={c.tealDark} />
            <Text style={styles.busyText}>{t("search.searching")}</Text>
          </View>
        ) : matches.length === 0 ? (
          <View style={styles.noMatchCard}>
            {/* Decorative rings + icon — badge anchored to this container */}
            <View style={styles.noMatchIconWrap}>
              <View style={styles.noMatchRingOuter}>
                <View style={styles.noMatchRingInner}>
                  <Image
                    source={require("../../assets/brand/bookliz-icon.png")}
                    style={styles.noMatchIcon}
                    resizeMode="contain"
                  />
                </View>
              </View>
              <View style={styles.noMatchBadge}>
                <Ionicons name="search-outline" size={13} color="#fff" />
              </View>
            </View>

            <Text style={styles.noMatchTitle}>{t("search.noResultsTitle")}</Text>
            <Text style={styles.noMatchSub}>
              {matchLookupLabel
                ? t("search.noResultsFor", { query: matchLookupLabel })
                : t("search.noResultsHint")}
            </Text>
            <Pressable accessibilityRole="button"
              style={[styles.primaryButton, { alignSelf: "stretch", marginTop: spacing.sm }]}
              onPress={() => {
                setMatches([]);
                setMatchLookupLabel("");
                if (matchReturnMode === "isbn") {
                  setIsbnInputMode("camera");
                  setScanned(false);
                  setMode("isbn");
                } else {
                  setMode("search");
                }
              }}
            >
              <Text style={styles.primaryButtonText}>{t("search.searchAgain")}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" style={[styles.ghostButton, { alignSelf: "stretch" }]} onPress={() => setMode("manual")}>
              <Text style={styles.ghostButtonText}>{t("search.addManually")}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Results header: count + sort button */}
            <View style={styles.resultsHeader}>
              <Text style={styles.resultsHeaderTitle} numberOfLines={1}>
                {confirmedAuthorName
                  ? t("search.booksBy", { query: confirmedAuthorName })
                  : matches.length === 1 ? t("search.resultsOne") : t("search.resultsMany", { count: matches.length })}
              </Text>
              <View style={styles.resultsHeaderActions}>
                <Pressable
                  style={styles.viewToggleBtn}
                  onPress={() => setMatchViewMode((v) => (v === "list" ? "grid" : "list"))}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={t("a11y.toggleView")}
                >
                  <Ionicons
                    name={matchViewMode === "list" ? "grid-outline" : "reorder-three-outline"}
                    size={15}
                    color={c.tealDark}
                  />
                </Pressable>
                <Pressable accessibilityRole="button" style={styles.sortButton} onPress={() => setShowSortSheet(true)}>
                  <Ionicons name="funnel-outline" size={14} color={c.tealDark} />
                  <Text style={styles.sortButtonText}>
                    {sortOrder === "relevance" ? t("search.sortBestMatch") :
                     sortOrder === "popular" ? t("search.sortPopular") :
                     sortOrder === "year_desc" ? t("search.sortNewest") :
                     sortOrder === "year_asc" ? t("search.sortOldest") : t("search.sortTopRated")}
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Author page shortcut — only when the query truly matches the author */}
            {confirmedAuthorName ? (
              <Pressable accessibilityRole="button"
                style={styles.authorPageCard}
                onPress={() => navigation.navigate("AuthorBooks", { authorName: confirmedAuthorName })}
              >
                <View style={styles.authorPageAvatar}>
                  <Ionicons name="person" size={20} color={c.tealDark} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.authorPageName} numberOfLines={1}>{confirmedAuthorName}</Text>
                  <Text style={styles.authorPageSub} numberOfLines={1}>{t("search.viewAuthorPage")}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={c.muted} />
              </Pressable>
            ) : null}

            {matchViewMode === "grid" ? (
              /* ── Grid view: 2-col covers, + to add ─────────────────────── */
              <View style={styles.matchGrid}>
                {sortedMatches.map((match, index) => (
                  <MatchGridCard
                    key={`${match.id}-${index}`}
                    match={match}
                    onSelect={() => void selectMatch(match)}
                  />
                ))}
              </View>
            ) : (
              <>
                {/* Primary (top) result */}
                {primaryMatch ? (
                  <MatchCard
                    match={primaryMatch}
                    isPrimary
                    hideConfidence
                    onSelect={() => void selectMatch(primaryMatch)}
                  />
                ) : null}

                {/* Secondary results */}
                {otherMatches.map((match, index) => (
                  <MatchCard
                    key={`${match.id}-${index}`}
                    match={match}
                    hideConfidence
                    onSelect={() => void selectMatch(match)}
                  />
                ))}
              </>
            )}

            <Pressable accessibilityRole="button" style={styles.editManuallyBtn} onPress={() => setMode("manual")}>
              <Ionicons name="create-outline" size={15} color={c.muted} />
              <Text style={styles.editManuallyText}>{t("search.editManually")}</Text>
            </Pressable>
          </>
        )}

        {/* Sort bottom sheet — uses Modal so it overlays correctly over ScrollView */}
        <Modal
          visible={showSortSheet}
          transparent
          animationType="slide"
          onRequestClose={() => setShowSortSheet(false)}
        >
          <Pressable accessibilityRole="button" style={styles.sortSheetOverlay} onPress={() => setShowSortSheet(false)}>
            <Pressable accessibilityRole="button" style={styles.sortSheet} onPress={(e) => e.stopPropagation()}>
              <View style={styles.sortSheetHandle} />
              <Text style={styles.sortSheetTitle}>{t("search.sortBy")}</Text>
              {(["relevance", "popular", "rating", "year_desc", "year_asc"] as const).map((option) => (
                <Pressable accessibilityRole="button"
                  key={option}
                  style={[styles.sortOption, sortOrder === option && styles.sortOptionActive]}
                  onPress={() => { setSortOrder(option); setShowSortSheet(false); }}
                >
                  <Text style={[styles.sortOptionText, sortOrder === option && styles.sortOptionTextActive]}>
                    {option === "relevance" ? t("search.sortBestMatch") :
                     option === "popular" ? t("search.sortPopular") :
                     option === "year_desc" ? t("search.sortNewestLong") :
                     option === "year_asc" ? t("search.sortOldestLong") :
                     t("search.sortTopRated")}
                  </Text>
                  {sortOrder === option ? (
                    <Ionicons name="checkmark" size={16} color={c.tealDark} />
                  ) : null}
                </Pressable>
              ))}
            </Pressable>
          </Pressable>
        </Modal>

        {/* Rating prompt — the book is already saved; this only adds stars */}
        <Modal
          visible={Boolean(justAdded)}
          transparent
          animationType="fade"
          onRequestClose={() => justAdded && openAddedBook(justAdded.id)}
        >
          <View style={styles.ratePromptOverlay}>
            <View style={styles.ratePrompt}>
              <Ionicons name="checkmark-circle" size={32} color={c.teal} />
              <Text style={styles.ratePromptTitle}>{t("search.ratePromptTitle")}</Text>
              <Text style={styles.ratePromptBody} numberOfLines={2}>{justAdded?.title}</Text>
              <View style={styles.ratePromptStars}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Pressable
                    key={star}
                    accessibilityRole="button"
                    accessibilityLabel={t("search.rateStars", { count: star })}
                    hitSlop={6}
                    onPress={() => {
                      if (!justAdded) return;
                      updateBookStatus(justAdded.id, justAdded.status, star);
                      openAddedBook(justAdded.id);
                    }}
                  >
                    <Ionicons name="star-outline" size={32} color={c.gold} />
                  </Pressable>
                ))}
              </View>
              <Pressable
                accessibilityRole="button"
                style={styles.ratePromptSkip}
                onPress={() => justAdded && openAddedBook(justAdded.id)}
              >
                <Text style={styles.ratePromptSkipText}>{t("search.rateNotNow")}</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        {/* Language bottom sheet */}
        <Modal
          visible={showLanguageSheet}
          transparent
          animationType="slide"
          onRequestClose={() => setShowLanguageSheet(false)}
        >
          <Pressable accessibilityRole="button" style={styles.sortSheetOverlay} onPress={() => setShowLanguageSheet(false)}>
            <Pressable accessibilityRole="button" style={styles.sortSheet} onPress={(e) => e.stopPropagation()}>
              <View style={styles.sortSheetHandle} />
              <Text style={styles.sortSheetTitle}>{t("search.languageSheetTitle")}</Text>
              <Text style={styles.sortSheetNote}>{t("search.languageSheetNote")}</Text>
              {[undefined, ...PRIORITY_LANGUAGE_CODES].map((code) => {
                const active = languageFilter === code;
                return (
                  <Pressable
                    accessibilityRole="button"
                    key={code ?? "any"}
                    style={[styles.sortOption, active && styles.sortOptionActive]}
                    onPress={() => {
                      setShowLanguageSheet(false);
                      if (active) return;
                      setLanguageFilter(code);
                      const query = matchLookupLabel.trim();
                      if (query) {
                        void lookupAndShowMatches(query, matchReturnMode, "query", searchScope, false, code ?? null);
                      }
                    }}
                  >
                    <Text style={[styles.sortOptionText, active && styles.sortOptionTextActive]}>
                      {code ? languageDisplayName(code) : t("search.anyLanguage")}
                    </Text>
                    {active ? <Ionicons name="checkmark" size={16} color={c.tealDark} /> : null}
                  </Pressable>
                );
              })}
            </Pressable>
          </Pressable>
        </Modal>

      </Screen>
    );
  }

  if (mode === "isbn") {
    // ── Manual ISBN input (no camera) ──────────────────────────────────────
    if (isbnInputMode === "manual") {
      return (
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: c.bg }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Screen>
            {dialogNode}
            <Pressable accessibilityRole="button" style={styles.backButton} onPress={() => setIsbnInputMode("camera")}>
              <Ionicons name="chevron-back" size={20} color={c.tealDark} />
              <Text style={styles.backButtonText}>{t("scan.backToScanner")}</Text>
            </Pressable>
            <View style={styles.pageHeader}>
              <Text style={styles.pageEyebrow}>{t("scan.enterIsbnEyebrow")}</Text>
              <Text style={styles.pageTitle}>{t("scan.enterIsbnTitle")}</Text>
            </View>
            <Text style={[styles.cardCopy, { marginBottom: spacing.md }]}>
              {t("scan.enterIsbnHelp")}
            </Text>
            <TextInput
              autoFocus
              keyboardType="number-pad"
              placeholder={t("scan.isbnPlaceholder")}
              placeholderTextColor={c.gray}
              style={[styles.input, { fontSize: 20, letterSpacing: 2, textAlign: "center", paddingVertical: 18 }]}
              value={manual.isbn}
              maxLength={13}
              onChangeText={(raw) => {
                // Strip everything except digits (and X for ISBN-10 check digit)
                const clean = raw.replace(/[^0-9X]/gi, "").slice(0, 13);
                setManual((current) => ({ ...current, isbn: clean }));
              }}
              returnKeyType="done"
            />
            {/* Live validation hint */}
            {manual.isbn.length > 0 && manual.isbn.length !== 10 && manual.isbn.length !== 13 ? (
              <Text style={styles.isbnHint}>
                {manual.isbn.length}/13 — ISBN must be 10 or 13 digits
              </Text>
            ) : manual.isbn.length === 10 || manual.isbn.length === 13 ? (
              <Text style={[styles.isbnHint, { color: c.tealDark }]}>
                ✓ Valid ISBN length
              </Text>
            ) : null}
            <Pressable accessibilityRole="button"
              style={[styles.primaryButton, { marginTop: spacing.sm }]}
              onPress={() => { if (manual.isbn.length === 10 || manual.isbn.length === 13) void lookupAndShowMatches(manual.isbn, "isbn", "isbn"); }}
              disabled={isBusy || (manual.isbn.length !== 10 && manual.isbn.length !== 13)}
            >
              {isBusy
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.primaryButtonText}>{t("scan.searchByIsbn")}</Text>
              }
            </Pressable>
          </Screen>
        </KeyboardAvoidingView>
      );
    }

    // ── Camera scanner ─────────────────────────────────────────────────────
    return (
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        {dialogNode}

        {/* Back button overlay */}
        <Pressable accessibilityRole="button"
          style={styles.scannerBackBtn}
          onPress={() => leaveScanner("menu")}
        >
          <Ionicons name="chevron-back" size={22} color="#fff" />
          <Text style={styles.scannerBackText}>{t("scan.back")}</Text>
        </Pressable>

        {!permission?.granted ? (
          <View style={[styles.permissionCard, { margin: spacing.md, marginTop: 80 }]}>
            <Text style={styles.cardTitle}>{t("scan.cameraNeededTitle")}</Text>
            <Text style={styles.cardCopy}>{t("scan.cameraNeededBody")}</Text>
            <Pressable accessibilityRole="button" style={styles.primaryButton} onPress={requestPermission}>
              <Text style={styles.primaryButtonText}>{t("scan.allowCamera")}</Text>
            </Pressable>
          </View>
        ) : (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            autofocus="on"
            enableTorch={torchOn}
            zoom={scanZoom}
            onBarcodeScanned={scanned ? undefined : handleBarcode}
            barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "qr"] }}
          />
        )}

        {/* Scan frame */}
        {permission?.granted && (
          <View style={styles.scanOverlay}>
            {/* Top darken */}
            <View style={styles.scanDim} />
            {/* Middle row: dim | frame | dim */}
            <View style={styles.scanMiddleRow}>
              <View style={styles.scanDim} />
              <View style={styles.scanFrameBox}>
                {/* Corner marks */}
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
                {/* Animated scan line */}
                <ScanLine />
              </View>
              <View style={styles.scanDim} />
            </View>
            {/* Bottom darken */}
            <View style={styles.scanDim} />
          </View>
        )}

        {/* Feedback label — moves above the queue once scans are stacked up */}
        {scanFeedback ? (
          <View style={scanQueue.length ? styles.scanFeedbackBadgeTop : styles.scanFeedbackBadge}>
            <Text style={styles.scanFeedbackText}>{scanFeedback}</Text>
          </View>
        ) : scanQueue.length === 0 ? (
          <View style={styles.scanHintBadge}>
            <Text style={styles.scanHintText}>{t("scan.pointAtBarcode")}</Text>
          </View>
        ) : null}

        {/* ── Scanned queue — one question per book, camera stays live ─────── */}
        {scanQueue.length ? (
          <View style={styles.scanQueueWrap}>
            <View style={styles.scanQueueHeader}>
              <Text style={styles.scanQueueHeaderCount}>
                {scanQueue.length === 1
                  ? t("scanQueue.countOne")
                  : t("scanQueue.count", { count: scanQueue.length })}
              </Text>
              <Text style={styles.scanQueueHeaderHint} numberOfLines={1}>
                {t("scanQueue.hint")}
              </Text>
            </View>
            <ScrollView
              contentContainerStyle={styles.scanQueueListContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {scanQueue.map((entry) => (
                <ScanQueueCard
                  key={entry.id}
                  entry={entry}
                  onChoose={(choice) => chooseScanShelf(entry, choice)}
                  onUndo={() => undoScanEntry(entry)}
                  onDismiss={() => dismissScanEntry(entry)}
                  onRetry={() => retryScanEntry(entry)}
                  onEditManually={() => editScanManually(entry)}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* Controls: torch + zoom + manual */}
        {permission?.granted && (
          <View style={styles.scanControls}>
            <Pressable
              style={styles.scanControlBtn}
              onPress={() => setTorchOn((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={torchOn ? t("a11y.torchOff") : t("a11y.torchOn")}
            >
              <Ionicons
                name={torchOn ? "flashlight" : "flashlight-outline"}
                size={22}
                color={torchOn ? c.gold : "#FFFFFF"}
              />
            </Pressable>
            <View style={styles.zoomRow}>
              {([0, 0.05, 0.12] as const).map((z, i) => (
                <Pressable accessibilityRole="button"
                  key={z}
                  style={[styles.zoomBtn, scanZoom === z && styles.zoomBtnActive]}
                  onPress={() => setScanZoom(z)}
                >
                  <Text style={[styles.zoomBtnText, scanZoom === z && styles.zoomBtnTextActive]}>
                    {i + 1}×
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={styles.scanControlBtn}
              onPress={() => setIsbnInputMode("manual")}
              accessibilityRole="button"
              accessibilityLabel={t("a11y.enterIsbnManually")}
            >
              <Ionicons name="keypad-outline" size={22} color="#FFFFFF" />
            </Pressable>
          </View>
        )}
      </View>
    );
  }

  if (mode === "manual") {
    return (
      <Screen>
        {dialogNode}
        <Pressable accessibilityRole="button" style={styles.backButton} onPress={() => setMode("menu")}>
          <Ionicons name="chevron-back" size={20} color={c.tealDark} />
          <Text style={styles.backButtonText}>{t("addBook.eyebrow")}</Text>
        </Pressable>
        <View style={styles.pageHeader}>
          <Text style={styles.pageEyebrow}>{t("addBook.manual")}</Text>
          <Text style={styles.pageTitle}>{t("addBook.manual")}</Text>
        </View>

        <Field label={t("addBook.fieldTitle")} value={manual.title} onChangeText={(v) => setManual((c) => ({ ...c, title: v }))} />
        <Field label={t("addBook.fieldAuthor")} value={manual.authorName} onChangeText={(v) => setManual((c) => ({ ...c, authorName: v }))} />
        <Field label={t("addBook.fieldPages")} keyboardType="number-pad" value={manual.pages} onChangeText={(v) => setManual((c) => ({ ...c, pages: v }))} />
        <Field label={t("addBook.fieldGenresList")} value={manual.genre} onChangeText={(v) => setManual((c) => ({ ...c, genre: v }))} />
        <Field label={t("addBook.fieldPublisher")} value={manual.publisher} onChangeText={(v) => setManual((c) => ({ ...c, publisher: v }))} />
        <Field label={t("addBook.fieldIsbnOptional")} value={manual.isbn} onChangeText={(v) => setManual((c) => ({ ...c, isbn: v }))} />

        <Pressable accessibilityRole="button" style={styles.saveButton} onPress={saveManual}>
          <Text style={styles.saveButtonText}>{t("addBook.reviewBook")}</Text>
        </Pressable>
      </Screen>
    );
  }

  if (mode === "search") {
    const hasQuery = searchQuery.trim().length > 0;
    return (
      <Screen>
        {dialogNode}
        {!launchedFromDiscover ? (
          <Pressable accessibilityRole="button" style={styles.backButton} onPress={() => setMode("menu")}>
            <Ionicons name="chevron-back" size={20} color={c.tealDark} />
            <Text style={styles.backButtonText}>{t("addBook.eyebrow")}</Text>
          </Pressable>
        ) : null}

        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>{t("search.title")}</Text>
          <Text style={styles.pageSubtitle}>{t("search.subtitle")}</Text>
        </View>

        <View style={styles.searchRow}>
          <TextInput
            autoFocus
            placeholder={t("search.searchPlaceholder")}
            placeholderTextColor={c.gray}
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={(value) => {
              setSearchQuery(value);
              scheduleLiveSearch(value, "search");
            }}
            onSubmitEditing={runSearch}
            returnKeyType="search"
          />
          <Pressable
            style={[styles.searchBtn, isBusy && { opacity: 0.6 }]}
            onPress={runSearch}
            disabled={isBusy}
            accessibilityRole="button"
            accessibilityLabel={isBusy ? t("a11y.searching") : t("a11y.search")}
          >
            <Ionicons name={isBusy ? "hourglass-outline" : "search"} size={18} color="#FFFFFF" />
          </Pressable>
        </View>

        {!hasQuery ? (
          <View style={styles.searchHelperCard}>
            <Ionicons name="search-outline" size={18} color={c.tealDark} />
            <View style={styles.searchHelperCopy}>
              <Text style={styles.searchHelperTitle}>{t("search.helperTitle")}</Text>
              <Text style={styles.searchHelperText}>{t("search.helperBody")}</Text>
              <Text style={styles.searchHelperExamples}>
                {t("search.helperTry")} <Text style={styles.searchHelperExamplesStrong}>{t("search.helperExamples")}</Text>
              </Text>
            </View>
          </View>
        ) : (
          <Text style={styles.resultsHint}>{t("search.detectHint")}</Text>
        )}
      </Screen>
    );
  }

  return (
    <Screen wide>
      {dialogNode}
      <View style={styles.pageHeader}>
        <Text style={styles.pageEyebrow}>{t("addBook.eyebrow")}</Text>
        <Text style={styles.pageTitle}>{t("addBook.title")}</Text>
      </View>

      <View style={styles.pathGrid}>
        <IntakePath
          featured
          accent={c.gold}
          icon="barcode"
          title={t("addBook.scanIsbn")}
          description={t("addBook.scanIsbnBody")}
          onPress={() => setMode("isbn")}
        />
        <IntakePath
          accent={c.coral}
          icon="search"
          title={t("addBook.search")}
          description={t("addBook.searchBody")}
          onPress={() => setMode("search")}
        />
        <IntakePath
          accent={c.green}
          icon="create"
          title={t("addBook.manual")}
          description={t("addBook.manualBody")}
          onPress={() => setMode("manual")}
        />
      </View>
    </Screen>
  );
}









