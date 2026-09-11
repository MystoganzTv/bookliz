import { Ionicons } from "@expo/vector-icons";
import { CameraView, BarcodeScanningResult, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { RouteProp, useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { NewBookInput, ReadingFormat } from "../types/models";
import { analyzeBookPhoto, getBookPhotoSupportSummary } from "../utils/bookPhotoIntake";
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
  splitList,
} from "./bookIntake/components";
import { createStyles } from "./bookIntake/styles";
import { findEditionsInLanguage } from "../utils/metadataResolver";
import { buildEditionSwitchPatch } from "../utils/editionSwitch";
import { groupEditionCandidates } from "../utils/editionMatchValidation";
import { hapticLight, hapticSuccess } from "../utils/haptics";

type IntakeMode = "menu" | "isbn" | "manual" | "search" | "matches" | "review";
type DiscoverSearchIntent = "auto" | "author" | "series";
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











export function BookIntakeScreen() {
  const c = useColors();
  const { isDark } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => createStyles(c, isDark), [c, isDark]);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<BookIntakeRouteProp>();
  const { addBook, findDuplicateBook, authors, books, readingSessions, userProfile } = useBookliz();
  const tasteProfile = useMemo(
    () => buildUserTasteProfile({ authors, books, readingSessions, userProfile }),
    [authors, books, readingSessions, userProfile]
  );
  const libraryIndex = useMemo(() => buildLibraryIndex(books), [books]);
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<IntakeMode>("menu");
  const [scanned, setScanned] = useState(false);
  const [coverUri, setCoverUri] = useState<string | undefined>();
  const [isBusy, setIsBusy] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [reviewBook, setReviewBook] = useState<NewBookInput | null>(null);
  const [reviewInsight, setReviewInsight] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ title: string; body: string } | null>(null);
  const [isRefreshingMetadata, setIsRefreshingMetadata] = useState(false);
  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false);
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
  // Book lookup / match confirmation
  const [matches, setMatches] = useState<BookMatch[]>([]);
  const [matchLookupLabel, setMatchLookupLabel] = useState("");
  const [matchReturnMode, setMatchReturnMode] = useState<"menu" | "isbn" | "search">("menu");
  // Sort order for search results
  const [sortOrder, setSortOrder] = useState<MatchSortOrder>("popular");
  const [showSortSheet, setShowSortSheet] = useState(false);
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
        searchSeqRef.current += 1; // invalidate any in-flight lookup
        initialSearchRequestRef.current = null;
        setMode("menu");
        setScanned(false);
        setCoverUri(undefined);
        setIsBusy(false);
        setIsLoadingMore(false);
        setSearchQuery("");
        setReviewBook(null);
        setReviewInsight(null);
        setIsAnalyzingPhoto(false);
        setIsSubmittingReview(false);
        setTorchOn(false);
        setScanZoom(0);
        setIsbnInputMode("camera");
        setScanFeedback(null);
        setMatches([]);
        setMatchLookupLabel("");
        setMatchViewMode("list");
        setIsLoadingEditions(false);
        setManual({ title: "", authorName: "", isbn: "", pages: "", genre: "", publisher: "" });
      };
    }, [])
  );

  const photoSupport = getBookPhotoSupportSummary();
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
      language: "English",
      ...input,
      synopsis: sanitizeSynopsis(input.synopsis),
    };
    setReviewBook(draft);
    setReviewInsight(insight ?? null);
    setMode("review");
  };

  const confirmAndOpen = (input: NewBookInput) => {
    const book = addBook(input);
    hapticSuccess(); // book landed in the library
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
        { name: "BookDetail", params: { bookId: book.id } }
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
      void stageBook(
        {
          ...request.initialBookSelection,
          source: "search",
        },
        "Picked from Discover."
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

  const takeCoverPhoto = async () => {
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [3, 4],
      base64: true,
      quality: 0.85
    });
    if (result.canceled) return;
    await processPhotoAsset(result.assets[0]);
  };

  const pickCoverPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [3, 4],
      base64: true,
      quality: 0.85
    });
    if (result.canceled) return;
    await processPhotoAsset(result.assets[0]);
  };

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
    silent = false
  ) => {
    if (liveSearchTimerRef.current) clearTimeout(liveSearchTimerRef.current);
    const seq = ++searchSeqRef.current;
    const isAuthorSearch =
      type === "query" &&
      (forcedIntent === "author" || (forcedIntent === "auto" && detectQueryIntent(query) === "author"));
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
              forcedIntent === "author" ? "author" : forcedIntent === "series" ? "title" : "auto"
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
          const best = work.bestEdition ?? work.editions[0];
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
            language: best?.language,
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
        });

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
    // Spanish/translated editions often ship without a description — try the
    // metadata enricher (other editions, work record) before staging.
    if (!input.synopsis || input.synopsis.trim().length < 40) {
      setIsBusy(true);
      try { input = await enrichBookInput(input); } catch { /* keep original */ }
      finally { setIsBusy(false); }
    }
    void stageBook(input, insight);
  };

  /**
   * ISBN barcode handler — debounced (2 s), validates before lookup.
   */
  const handleBarcode = ({ data }: BarcodeScanningResult) => {
    const now = Date.now();
    if (now - lastScanRef.current < 2000) return; // debounce — camera keeps scanning

    const parsed = parseIsbn(data);
    if (!parsed) {
      // Not a book ISBN (QR, retail UPC…): say so briefly and keep the camera
      // live instead of locking the scanner forever.
      lastScanRef.current = now;
      setScanFeedback(t("scan.notIsbn"));
      if (notIsbnTimerRef.current) clearTimeout(notIsbnTimerRef.current);
      notIsbnTimerRef.current = setTimeout(() => {
        notIsbnTimerRef.current = null;
        setScanFeedback((current) => (current === t("scan.notIsbn") ? null : current));
      }, 1500);
      return;
    }

    lastScanRef.current = now;
    setScanned(true); // lock only once we have a real ISBN — prevents re-fire while lookup runs
    hapticLight(); // barcode caught
    setScanFeedback(t("scan.searching"));
    void lookupAndShowMatches(parsed.isbn13, "isbn", "isbn");
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
    if (normalizeSearchText(language) === normalizeSearchText(reviewBook.language ?? "English")) {
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

  const processPhotoAsset = async (asset?: ImagePicker.ImagePickerAsset) => {
    const uri = asset?.uri;
    if (!uri) return;

    setCoverUri(uri);

    // On iOS without a configured vision provider, static-image barcode detection
    // doesn't work (Apple OS limitation) and AI cover recognition is unavailable.
    // Skip the misleading spinner and go directly to the review screen with the
    // photo saved as the cover art.
    if (!photoSupport.imageBarcodeIsbnSupported && !photoSupport.visionProviderConfigured) {
      await stageBook({
        title: "",
        authorName: "",
        genre: ["Uncategorized"],
        language: "English",
        coverImageUri: uri,
        source: "photo",
        ownership: "owned"
      }, "Photo saved as cover art. Type the title (and ISBN if you have it) then tap “Refresh metadata” to fill in the rest automatically.");
      return;
    }

    setIsAnalyzingPhoto(true);

    try {
      const result = await analyzeBookPhoto({
        uri,
        base64: asset?.base64,
        fileName: asset?.fileName
      });
      await stageBook(result.draft, result.notes.join(" "));
    } catch {
      await stageBook({
        title: "Book from photo",
        authorName: "Needs identification",
        genre: ["Uncategorized"],
        language: "English",
        synopsis: "Bookliz saved your photo, but detection failed this time. Review the draft and refresh metadata once you add a title or ISBN.",
        coverImageUri: uri,
        source: "photo",
        ownership: "owned"
      }, "Bookliz could not inspect that image right now, but your photo is attached and ready for review.");
    } finally {
      setIsAnalyzingPhoto(false);
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
          <Text style={styles.metadataLabel}>Pages</Text>
          <Text style={styles.metadataValue}>{reviewBook.pages ?? "—"}</Text>
        </View>
        <View style={styles.metadataDivider} />
        <View style={styles.metadataItem}>
          <Text style={styles.metadataLabel}>ISBN</Text>
          <Text style={styles.metadataValue} numberOfLines={1}>{reviewBook.isbn ?? "Pending"}</Text>
        </View>
        <View style={styles.metadataDivider} />
        <View style={styles.metadataItem}>
          <Text style={styles.metadataLabel}>Publisher</Text>
          <Text style={styles.metadataValue} numberOfLines={1}>{reviewBook.publisher ?? "Pending"}</Text>
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
            <Field label="Title" value={reviewBook.title} onChangeText={(title) => updateReviewBook({ title })} />
            <Field label="Author" value={reviewBook.authorName} onChangeText={(authorName) => updateReviewBook({ authorName })} />
            <Field
              label="Genres"
              value={reviewBook.genre?.join(", ") ?? ""}
              onChangeText={(value) => updateReviewBook({ genre: splitList(value) })}
              hint="Separate genres with commas"
            />
            <Field
              label="Pages"
              keyboardType="number-pad"
              value={reviewBook.pages ? String(reviewBook.pages) : ""}
              onChangeText={(value) => updateReviewBook({ pages: Number(value) || undefined })}
            />
            <Field label="Synopsis" value={reviewBook.synopsis ?? ""} onChangeText={(synopsis) => updateReviewBook({ synopsis })} multiline />
          </>
        ) : null}

        {/* ── Language & Edition — compact selectors ───────────────────── */}
        <View style={styles.compactSelectorRow}>
          <Pressable accessibilityRole="button" style={[styles.languageCompactBtn, styles.compactSelectorFlex]} onPress={() => setShowLanguageModal(true)}>
            <Ionicons name="language-outline" size={15} color={c.muted} />
            <Text style={styles.languageCompactText} numberOfLines={1}>{reviewBook.language ?? "English"}</Text>
            <Ionicons name="chevron-down-outline" size={13} color={c.muted} />
          </Pressable>

          {reviewBook.workKey ? (
            <Pressable accessibilityRole="button" style={[styles.languageCompactBtn, styles.compactSelectorFlex]} onPress={openEditionPicker}>
              <Ionicons name="layers-outline" size={15} color={c.muted} />
              <Text style={styles.languageCompactText} numberOfLines={1}>
                {[reviewBook.publisher, reviewBook.publishedDate?.slice(0, 4)].filter(Boolean).join(" · ") || "Choose edition"}
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
          selected={reviewBook.language ?? "English"}
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
              <Text style={styles.sortSheetTitle}>Sort by</Text>
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
              <Text style={styles.backButtonText}>Scanner</Text>
            </Pressable>
            <View style={styles.pageHeader}>
              <Text style={styles.pageEyebrow}>Enter ISBN</Text>
              <Text style={styles.pageTitle}>Type or paste ISBN</Text>
            </View>
            <Text style={[styles.cardCopy, { marginBottom: spacing.md }]}>
              Find it on the back cover, above the barcode — 13 digits starting with 978 or 979.
            </Text>
            <TextInput
              autoFocus
              keyboardType="number-pad"
              placeholder="9780756404741"
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
                : <Text style={styles.primaryButtonText}>Search by ISBN</Text>
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
          onPress={() => { setScanned(false); setMode("menu"); }}
        >
          <Ionicons name="chevron-back" size={22} color="#fff" />
          <Text style={styles.scannerBackText}>Back</Text>
        </Pressable>

        {!permission?.granted ? (
          <View style={[styles.permissionCard, { margin: spacing.md, marginTop: 80 }]}>
            <Text style={styles.cardTitle}>Camera access needed</Text>
            <Text style={styles.cardCopy}>Allow camera access to scan ISBN barcodes.</Text>
            <Pressable accessibilityRole="button" style={styles.primaryButton} onPress={requestPermission}>
              <Text style={styles.primaryButtonText}>Allow camera</Text>
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

        {/* Feedback label */}
        {scanFeedback ? (
          <View style={styles.scanFeedbackBadge}>
            <ActivityIndicator size="small" color={c.teal} />
            <Text style={styles.scanFeedbackText}>{scanFeedback}</Text>
          </View>
        ) : (
          <View style={styles.scanHintBadge}>
            <Text style={styles.scanHintText}>Point at the barcode on the back cover</Text>
          </View>
        )}

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
          <Text style={styles.backButtonText}>Add book</Text>
        </Pressable>
        <View style={styles.pageHeader}>
          <Text style={styles.pageEyebrow}>{t("addBook.manual")}</Text>
          <Text style={styles.pageTitle}>{t("addBook.manual")}</Text>
        </View>

        <Field label="Title" value={manual.title} onChangeText={(v) => setManual((c) => ({ ...c, title: v }))} />
        <Field label="Author" value={manual.authorName} onChangeText={(v) => setManual((c) => ({ ...c, authorName: v }))} />
        <Field label="Pages" keyboardType="number-pad" value={manual.pages} onChangeText={(v) => setManual((c) => ({ ...c, pages: v }))} />
        <Field label="Genre(s), comma separated" value={manual.genre} onChangeText={(v) => setManual((c) => ({ ...c, genre: v }))} />
        <Field label="Publisher" value={manual.publisher} onChangeText={(v) => setManual((c) => ({ ...c, publisher: v }))} />
        <Field label="ISBN (optional)" value={manual.isbn} onChangeText={(v) => setManual((c) => ({ ...c, isbn: v }))} />

        <Pressable accessibilityRole="button" style={styles.saveButton} onPress={saveManual}>
          <Text style={styles.saveButtonText}>Review book</Text>
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
            <Text style={styles.backButtonText}>Add book</Text>
          </Pressable>
        ) : null}

        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>{t("search.title")}</Text>
          <Text style={styles.pageSubtitle}>{t("search.subtitle")}</Text>
        </View>

        <View style={styles.searchRow}>
          <TextInput
            autoFocus
            placeholder="Fourth Wing, Rebecca Yarros, Red Rising..."
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
                {t("search.helperTry")} <Text style={styles.searchHelperExamplesStrong}>Fourth Wing</Text>, <Text style={styles.searchHelperExamplesStrong}>Rebecca Yarros</Text>, <Text style={styles.searchHelperExamplesStrong}>Red Rising</Text>
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
    <Screen>
      {dialogNode}
      <View style={styles.pageHeader}>
        <Text style={styles.pageEyebrow}>{t("addBook.eyebrow")}</Text>
        <Text style={styles.pageTitle}>{t("addBook.title")}</Text>
      </View>

      <View style={styles.pathGrid}>
        <IntakePath
          accent={c.teal}
          icon="camera"
          title={t("addBook.takePhoto")}
          description={t("addBook.takePhotoBody")}
          onPress={takeCoverPhoto}
        />
        <IntakePath
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
          accent={isDark ? c.surface : c.navy}
          icon="image"
          title={t("addBook.importPhoto")}
          description={t("addBook.importPhotoBody")}
          onPress={pickCoverPhoto}
        />
        <IntakePath
          accent={c.green}
          icon="create"
          title={t("addBook.manual")}
          description={t("addBook.manualBody")}
          onPress={() => setMode("manual")}
        />
      </View>

      {isAnalyzingPhoto ? (
        <View style={styles.photoBusyCard}>
          <ActivityIndicator size="small" color={c.tealDark} />
          <Text style={styles.photoBusyText}>Inspecting photo for ISBN and book clues…</Text>
        </View>
      ) : null}

      {!photoSupport.imageBarcodeIsbnSupported || !photoSupport.visionProviderConfigured ? (
        <View style={styles.photoHintCard}>
          <Text style={styles.photoHintTitle}>{t("addBook.photoTips")}</Text>
          <Text style={styles.photoHintCopy}>
            {photoSupport.imageBarcodeIsbnSupported
              ? t("addBook.photoTipsGeneral")
              : t("addBook.photoTipsIos")}
          </Text>
          {!photoSupport.visionProviderConfigured ? (
            <Text style={styles.photoHintCopy}>
              {t("addBook.coverOcrHint")}
            </Text>
          ) : null}
        </View>
      ) : null}

      {coverUri ? <Image source={{ uri: coverUri }} style={styles.preview} /> : null}
    </Screen>
  );
}









