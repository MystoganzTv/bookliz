/**
 * AuthorBooksScreen
 *
 * Shows all books by an author:
 *   • "In your library" horizontal strip (books already added)
 *   • Full catalog from Google Books via inauthor: query — paginated
 *   • Grid / list toggle
 *
 * Tapping a catalog book → BookIntake (initialBookSelection pre-fills review).
 * Tapping a library book → BookDetail.
 */
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBookliz } from "../data/BooklizContext";
import { RootStackParamList } from "../navigation/types";
import { fetchByKeyword, GenreBookResult } from "../services/googleBooksProvider";
import { isHighSignalCatalogBook } from "../services/recommendationEngine";
import { Book } from "../types/models";
import { AppColors, fonts, radii, spacing } from "../theme/theme";
import { useColors } from "../theme/ThemeContext";
import { useI18n } from "../i18n/LocalizationContext";

const PAGE_SIZE = 40;
const COLLECTION_PATTERN = /\b(box\s*set|boxed\s*set|collection|omnibus|complete\s*works?|complete\s*series|books?\s*set|bundle|anthology|collected\s*works?)\b/i;
const LOW_SIGNAL_PATTERN  = /\b(workbook|summary|study guide|companion|analysis|unauthorized)\b/i;

type ViewMode = "grid" | "list";

export function AuthorBooksScreen() {
  const route       = useRoute<RouteProp<RootStackParamList, "AuthorBooks">>();
  const navigation  = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const c           = useColors();
  const { t }       = useI18n();
  const insets      = useSafeAreaInsets();
  const styles      = useMemo(() => createStyles(c), [c]);
  const { books, getAuthor } = useBookliz();

  const { authorId, authorName } = route.params;

  // ── View mode ──────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  // ── Catalog state ──────────────────────────────────────────────────────────
  const [catalogBooks, setCatalogBooks]   = useState<GenreBookResult[]>([]);
  const [loading, setLoading]             = useState(true);
  const [loadingMore, setLoadingMore]     = useState(false);
  const [networkError, setNetworkError]   = useState(false);
  const [totalItems, setTotalItems]       = useState(0);
  const [hasMore, setHasMore]             = useState(false);
  /** Raw items fetched so far (NOT the filtered list) — drives pagination. */
  const startIndexRef                     = useRef(0);
  /** Ids already rendered, so overlapping Google Books pages never duplicate. */
  const seenIdsRef                        = useRef<Set<string>>(new Set());

  // ── Library section ────────────────────────────────────────────────────────
  // Match by id when we have one (library author), by name otherwise (catalog
  // author reached from search/discover).
  const libraryBooks = useMemo(() => {
    const wanted = authorName.trim().toLowerCase();
    return books.filter((b) =>
      (authorId && (b.authorId === authorId || b.coAuthorIds?.includes(authorId))) ||
      (getAuthor(b.authorId)?.name ?? "").trim().toLowerCase() === wanted ||
      (b.coAuthorNames ?? []).some((name) => name.trim().toLowerCase() === wanted)
    );
  }, [books, authorId, authorName, getAuthor]);
  const libraryIsbnSet = useMemo(
    () => new Set(books.map((b) => b.isbn).filter(Boolean) as string[]),
    [books]
  );
  // Read through a ref inside the fetch callback: adding a book must not
  // re-create loadAuthor (that reset the catalog and the scroll position).
  const libraryIsbnSetRef = useRef(libraryIsbnSet);
  libraryIsbnSetRef.current = libraryIsbnSet;

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const loadAuthor = useCallback(async (reset = true) => {
    if (reset) {
      setLoading(true);
      setNetworkError(false);
      setCatalogBooks([]);
      setHasMore(false);
      startIndexRef.current = 0;
      seenIdsRef.current = new Set();
    } else {
      setLoadingMore(true);
    }

    try {
      const query = `inauthor:"${authorName}"`;
      const { books: fetched, totalItems: total } = await fetchByKeyword(
        query,
        reset ? 0 : startIndexRef.current,
        PAGE_SIZE
      );

      const highSignal = fetched.filter((b) => isHighSignalCatalogBook(b));
      const withCover  = fetched.filter((b) => !!b.coverUrl && !COLLECTION_PATTERN.test(b.title));
      let filtered     = highSignal.length >= 4 ? highSignal : withCover.length > 0 ? withCover : fetched;
      filtered = filtered.filter((b) => !LOW_SIGNAL_PATTERN.test(b.title));

      const librarySet = libraryIsbnSetRef.current;
      filtered.sort((a, b) => {
        const aLib = a.isbn13 && librarySet.has(a.isbn13) ? 1 : 0;
        const bLib = b.isbn13 && librarySet.has(b.isbn13) ? 1 : 0;
        if (bLib !== aLib) return bLib - aLib;
        return (b.ratingsCount ?? 0) - (a.ratingsCount ?? 0);
      });

      // Google Books overlaps results between startIndex values — keep the
      // first occurrence of each id so the list never renders duplicate keys.
      const seen = reset ? new Set<string>() : seenIdsRef.current;
      const deduped = filtered.filter((b) => {
        if (seen.has(b.id)) return false;
        seen.add(b.id);
        return true;
      });
      seenIdsRef.current = seen;

      startIndexRef.current += fetched.length;
      setTotalItems(total);
      // Pagination is driven by RAW fetched-vs-total, never by the filtered
      // length, and stops dead when a page comes back empty.
      setHasMore(fetched.length > 0 && startIndexRef.current < total);
      setCatalogBooks((prev) => (reset ? deduped : [...prev, ...deduped]));
    } catch {
      if (reset) setNetworkError(true);
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [authorName]);

  useEffect(() => { loadAuthor(true); }, [loadAuthor]);

  function handleLoadMore() {
    if (loadingMore || loading || !hasMore) return;
    void loadAuthor(false);
  }

  function isInLibrary(book: GenreBookResult): boolean {
    return !!book.isbn13 && libraryIsbnSet.has(book.isbn13);
  }

  function getLibraryBook(catalogBook: GenreBookResult): Book | undefined {
    if (!catalogBook.isbn13) return undefined;
    return books.find((b) => b.isbn === catalogBook.isbn13);
  }

  function handleCatalogPress(book: GenreBookResult) {
    const libBook = getLibraryBook(book);
    if (libBook) {
      navigation.navigate("BookDetail", { bookId: libBook.id });
      return;
    }
    // Rich preview first — the user decides there whether to add it.
    navigation.navigate("BookPreview", { book });
  }

  // ── Grid card ──────────────────────────────────────────────────────────────
  function renderGridCard({ item }: { item: GenreBookResult }) {
    const inLibrary  = isInLibrary(item);
    const fullStars  = item.averageRating ? Math.round(item.averageRating) : 0;
    const ratingCount = item.ratingsCount
      ? item.ratingsCount >= 1000
        ? `${(item.ratingsCount / 1000).toFixed(1)}k`
        : String(item.ratingsCount)
      : null;

    return (
      <Pressable accessibilityRole="button" style={styles.gridCard} onPress={() => handleCatalogPress(item)}>
        <View style={styles.coverWrap}>
          {item.coverUrl ? (
            <Image source={{ uri: item.coverUrl }} style={styles.gridCover} resizeMode="cover" />
          ) : (
            <View style={[styles.gridCover, styles.coverPlaceholder]}>
              <Ionicons name="book-outline" size={28} color={c.border} />
            </View>
          )}
          {inLibrary && (
            <View style={[styles.libraryBadge, { backgroundColor: c.teal }]}>
              <Ionicons name="checkmark" size={10} color="#fff" />
            </View>
          )}
        </View>
        <Text numberOfLines={2} style={styles.gridTitle}>{item.title}</Text>
        {fullStars > 0 ? (
          <View style={styles.ratingRow}>
            {[1,2,3,4,5].map((i) => (
              <Ionicons key={i} name={i <= fullStars ? "star" : "star-outline"} size={10}
                color={i <= fullStars ? "#F5A623" : c.muted} />
            ))}
            {ratingCount ? <Text style={styles.ratingCount}>{ratingCount}</Text> : null}
          </View>
        ) : item.publishedYear ? (
          <Text style={styles.bookYear}>{item.publishedYear}</Text>
        ) : null}
      </Pressable>
    );
  }

  // ── List row ───────────────────────────────────────────────────────────────
  function renderListRow({ item }: { item: GenreBookResult }) {
    const inLibrary  = isInLibrary(item);
    const fullStars  = item.averageRating ? Math.round(item.averageRating) : 0;
    const ratingCount = item.ratingsCount
      ? item.ratingsCount >= 1000
        ? `${(item.ratingsCount / 1000).toFixed(1)}k`
        : String(item.ratingsCount)
      : null;

    return (
      <Pressable accessibilityRole="button" style={styles.listRow} onPress={() => handleCatalogPress(item)}>
        <View style={styles.listCoverWrap}>
          {item.coverUrl ? (
            <Image source={{ uri: item.coverUrl }} style={styles.listCover} resizeMode="cover" />
          ) : (
            <View style={[styles.listCover, styles.coverPlaceholder]}>
              <Ionicons name="book-outline" size={20} color={c.border} />
            </View>
          )}
          {inLibrary && (
            <View style={[styles.libraryBadge, { backgroundColor: c.teal }]}>
              <Ionicons name="checkmark" size={10} color="#fff" />
            </View>
          )}
        </View>
        <View style={styles.listInfo}>
          <Text numberOfLines={2} style={styles.listTitle}>{item.title}</Text>
          {item.authors[0] ? (
            <Text numberOfLines={1} style={styles.listAuthor}>{item.authors[0]}</Text>
          ) : null}
          {item.publishedYear ? (
            <Text style={styles.listYear}>{item.publishedYear}</Text>
          ) : null}
          {fullStars > 0 ? (
            <View style={[styles.ratingRow, { marginTop: 4 }]}>
              {[1,2,3,4,5].map((i) => (
                <Ionicons key={i} name={i <= fullStars ? "star" : "star-outline"} size={10}
                  color={i <= fullStars ? "#F5A623" : c.muted} />
              ))}
              {ratingCount ? <Text style={styles.ratingCount}>{ratingCount}</Text> : null}
            </View>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={16} color={c.muted} />
      </Pressable>
    );
  }

  const isGrid  = viewMode === "grid";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t("a11y.back")}
        >
          <Ionicons name="chevron-back" size={24} color={c.ink} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>{t("catalog.authorEyebrow")}</Text>
          <Text numberOfLines={1} style={styles.heading}>{authorName}</Text>
        </View>
        {/* Grid / list toggle */}
        <Pressable
          onPress={() => setViewMode(isGrid ? "list" : "grid")}
          hitSlop={12}
          style={styles.toggleBtn}
          accessibilityRole="button"
          accessibilityLabel={t("a11y.toggleView")}
        >
          <Ionicons
            name={isGrid ? "list-outline" : "grid-outline"}
            size={22}
            color={c.ink}
          />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={c.teal} />
          <Text style={styles.loadingText}>Finding books by {authorName}…</Text>
        </View>
      ) : (
        <FlatList
          key={viewMode}   // force re-mount when switching modes (numColumns change)
          data={catalogBooks}
          keyExtractor={(item) => item.id}
          numColumns={isGrid ? 2 : 1}
          columnWrapperStyle={isGrid ? styles.columnWrapper : undefined}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          renderItem={isGrid ? renderGridCard : renderListRow}
          ItemSeparatorComponent={isGrid ? undefined : () => <View style={styles.separator} />}
          ListHeaderComponent={
            <>
              {/* Library strip */}
              {libraryBooks.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>{t("catalog.inYourLibrary")}</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.libraryRow}
                  >
                    {libraryBooks.map((book) => (
                      <Pressable accessibilityRole="button"
                        key={book.id}
                        style={styles.libraryCard}
                        onPress={() => navigation.navigate("BookDetail", { bookId: book.id })}
                      >
                        <View style={styles.libraryCoverWrap}>
                          {book.coverImageUri ? (
                            <Image source={{ uri: book.coverImageUri }} style={styles.libraryCover} resizeMode="cover" />
                          ) : (
                            <View style={[styles.libraryCover, styles.coverPlaceholder]}>
                              <Ionicons name="book-outline" size={22} color={c.border} />
                            </View>
                          )}
                          <View style={[styles.libraryBadgeLarge, { backgroundColor: c.teal }]}>
                            <Ionicons name="checkmark" size={11} color="#fff" />
                          </View>
                        </View>
                        <Text numberOfLines={2} style={styles.libraryTitle}>{book.title}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Catalog header */}
              <View style={styles.catalogHeader}>
                <Text style={styles.sectionTitle}>{t("catalog.allBooks")}</Text>
                {totalItems > 0 && (
                  <Text style={styles.totalCount}>
                    {totalItems > 500 ? "500+" : totalItems.toLocaleString()}
                  </Text>
                )}
              </View>
            </>
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footer}>
                <ActivityIndicator size="small" color={c.teal} />
              </View>
            ) : hasMore ? (
              <Pressable accessibilityRole="button"
                style={[styles.loadMoreBtn, { borderColor: c.border }]}
                onPress={handleLoadMore}
              >
                <Text style={[styles.loadMoreText, { color: c.teal }]}>{t("catalog.loadMore")}</Text>
              </Pressable>
            ) : null
          }
          ListEmptyComponent={
            networkError ? (
              <View style={styles.emptyState}>
                <Ionicons name="wifi-outline" size={40} color={c.border} />
                <Text style={styles.emptyTitle}>{t("catalog.connectionLost")}</Text>
                <Text style={styles.emptySub}>{t("catalog.connectionLostBody")}</Text>
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="search-outline" size={40} color={c.border} />
                <Text style={styles.emptyTitle}>{t("catalog.noResults")}</Text>
                <Text style={styles.emptySub}>{t("catalog.noResultsAuthor")}</Text>
              </View>
            )
          }
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function createStyles(c: AppColors) {
  return StyleSheet.create({
    root: { flex: 1 },

    // Header
    header: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm,
      paddingBottom: spacing.md,
      paddingHorizontal: spacing.md,
    },
    backBtn: { padding: 4 },
    toggleBtn: { padding: 4 },
    headerText: { flex: 1 },
    eyebrow: {
      color: c.tealDark,
      fontFamily: fonts.body,
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 1.3,
      textTransform: "uppercase",
    },
    heading: {
      color: c.ink,
      fontFamily: fonts.display,
      fontSize: 22,
      fontWeight: "900",
      marginTop: 1,
    },

    // Loading
    loadingState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
    loadingText: { color: c.muted, fontFamily: fonts.body, fontSize: 14, fontWeight: "700" },

    // List
    listContent: { paddingBottom: 40 },
    columnWrapper: { gap: 0 },
    separator: { backgroundColor: c.border, height: StyleSheet.hairlineWidth },

    // Sections
    section: { paddingTop: spacing.md, marginBottom: spacing.sm },
    catalogHeader: {
      alignItems: "baseline",
      flexDirection: "row",
      gap: 8,
      paddingBottom: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.lg,
    },
    sectionTitle: {
      color: c.ink,
      fontFamily: fonts.display,
      fontSize: 20,
      fontWeight: "900",
      paddingHorizontal: spacing.md,
      marginBottom: spacing.sm,
    },
    totalCount: { color: c.muted, fontFamily: fonts.body, fontSize: 13, fontWeight: "700" },

    // Library strip
    libraryRow: { gap: 12, paddingHorizontal: spacing.md },
    libraryCard: { width: 96 },
    libraryCoverWrap: { position: "relative", marginBottom: 6 },
    libraryCover: { width: 96, height: 140, borderRadius: radii.sm },
    libraryBadgeLarge: {
      alignItems: "center", bottom: 6, borderRadius: 10, height: 20,
      justifyContent: "center", position: "absolute", right: 6, width: 20,
    },
    libraryTitle: { color: c.ink, fontFamily: fonts.body, fontSize: 11, fontWeight: "800", lineHeight: 15 },

    // Grid cards
    gridCard: { paddingBottom: spacing.md, paddingLeft: spacing.md, paddingRight: spacing.sm, width: "50%" },
    coverWrap: { marginBottom: 7, position: "relative" },
    gridCover: { aspectRatio: 0.67, borderRadius: radii.sm, width: "100%" },
    coverPlaceholder: { alignItems: "center", backgroundColor: c.surfaceAlt, justifyContent: "center" },
    libraryBadge: {
      alignItems: "center", borderRadius: 8, height: 16, justifyContent: "center",
      position: "absolute", right: 6, top: 6, width: 16,
    },
    gridTitle: { color: c.ink, fontFamily: fonts.body, fontSize: 13, fontWeight: "800", lineHeight: 18, paddingHorizontal: 2 },

    // List rows
    listRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
    },
    listCoverWrap: { position: "relative" },
    listCover: { borderRadius: radii.sm, height: 72, width: 48 },
    listInfo: { flex: 1, gap: 2 },
    listTitle: { color: c.ink, fontFamily: fonts.body, fontSize: 15, fontWeight: "700", lineHeight: 20 },
    listAuthor: { color: c.muted, fontFamily: fonts.body, fontSize: 12 },
    listYear: { color: c.muted, fontFamily: fonts.body, fontSize: 12 },

    // Shared
    ratingRow: { alignItems: "center", flexDirection: "row", gap: 2, marginTop: 3, paddingHorizontal: 2 },
    ratingCount: { color: c.muted, fontFamily: fonts.body, fontSize: 10, marginLeft: 2 },
    bookYear: { color: c.muted, fontFamily: fonts.body, fontSize: 11, marginTop: 3, paddingHorizontal: 2 },

    // Footer
    footer: { alignItems: "center", paddingVertical: 16 },
    loadMoreBtn: {
      alignItems: "center", borderRadius: radii.pill, borderWidth: 1,
      marginHorizontal: spacing.lg, marginVertical: spacing.md, paddingVertical: 10,
    },
    loadMoreText: { fontFamily: fonts.body, fontSize: 14, fontWeight: "700" },

    // Empty / error
    emptyState: { alignItems: "center", gap: 12, paddingTop: 60 },
    emptyTitle: { color: c.ink, fontFamily: fonts.display, fontSize: 18, fontWeight: "900" },
    emptySub: { color: c.muted, fontFamily: fonts.body, fontSize: 14, paddingHorizontal: 32, textAlign: "center" },
  });
}
