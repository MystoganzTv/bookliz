/**
 * GenreBrowseScreen
 *
 * Audible-style genre catalog browse:
 *   • "In your library" section (books already added)
 *   • Catalog results from Google Books — paginated, infinite scroll
 *
 * Books already in the user's library are highlighted with a badge.
 * Tapping a catalog book navigates to BookIntake with the ISBN pre-filled.
 */
import { Ionicons } from "@expo/vector-icons";
import { RouteProp, useRoute, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { Skeleton } from "../components/Skeleton";
import { useBookliz } from "../data/BooklizContext";
import { RootStackParamList } from "../navigation/types";
import { fetchByGenre, fetchByKeyword, GenreBookResult } from "../services/googleBooksProvider";
import { isHighSignalCatalogBook } from "../services/recommendationEngine";
import { AppColors, fonts, radii, spacing } from "../theme/theme";
import { useColors } from "../theme/ThemeContext";
import { useI18n } from "../i18n/LocalizationContext";
import { Book } from "../types/models";

// ─── Types ────────────────────────────────────────────────────────────────────

type RouteProps = RouteProp<RootStackParamList, "GenreBrowse">;
type NavProps = NativeStackNavigationProp<RootStackParamList>;

const PAGE_SIZE = 40;
const CURRENT_EDITORIAL_YEAR = 2026;
// COLLECTION_PATTERN kept for scoreCatalogBook bonus/penalty scoring (not for hard filtering)
const COLLECTION_PATTERN = /\b(box\s*set|boxed\s*set|collection|omnibus|complete\s*works?|complete\s*series|books?\s*set|bundle|anthology|collected\s*works?|volumes?\s*\d|komplett|gesammelte|year'?s?\s+best|best american)\b/i;
const LOW_SIGNAL_PATTERN = /\b(workbook|summary|study guide|companion|analysis)\b/i;

function normalizeTitle(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function selectBestCuratedMatch(
  books: GenreBookResult[],
  seed: { title: string; author?: string }
): GenreBookResult | null {
  const wantedTitle = normalizeTitle(seed.title);
  const wantedAuthor = seed.author ? normalizeTitle(seed.author) : "";

  const ranked = [...books].sort((a, b) => {
    const aTitle = normalizeTitle(a.title);
    const bTitle = normalizeTitle(b.title);
    const aAuthor = normalizeTitle(a.authors[0] ?? "");
    const bAuthor = normalizeTitle(b.authors[0] ?? "");

    const aExact = aTitle === wantedTitle ? 2 : aTitle.includes(wantedTitle) ? 1 : 0;
    const bExact = bTitle === wantedTitle ? 2 : bTitle.includes(wantedTitle) ? 1 : 0;
    if (bExact !== aExact) return bExact - aExact;

    const aAuthorMatch = wantedAuthor && (aAuthor === wantedAuthor || aAuthor.includes(wantedAuthor)) ? 1 : 0;
    const bAuthorMatch = wantedAuthor && (bAuthor === wantedAuthor || bAuthor.includes(wantedAuthor)) ? 1 : 0;
    if (bAuthorMatch !== aAuthorMatch) return bAuthorMatch - aAuthorMatch;

    return (b.ratingsCount ?? 0) - (a.ratingsCount ?? 0) || (b.averageRating ?? 0) - (a.averageRating ?? 0);
  });

  return ranked.find((book) => normalizeTitle(book.title).includes(wantedTitle) && !!book.coverUrl) ?? ranked[0] ?? null;
}

function scoreCatalogBook(
  book: GenreBookResult,
  genre: string,
  curatedTitleSet?: Set<string>
): number {
  let score = 0;

  if (book.coverUrl) score += 44;
  else score -= 48;

  const year = book.publishedYear ?? 0;
  if (year >= CURRENT_EDITORIAL_YEAR - 1) score += 14;
  else if (year >= 2021) score += 12;
  else if (year >= 2017) score += 10;
  else if (year >= 2010) score += 7;
  else if (year >= 2000) score += 6;
  else if (year > 0) score -= 8;

  const ratingsCount = book.ratingsCount ?? 0;
  if (ratingsCount >= 100000) score += 60;
  else if (ratingsCount >= 25000) score += 48;
  else if (ratingsCount >= 5000) score += 36;
  else if (ratingsCount >= 1000) score += 24;
  else if (ratingsCount >= 100) score += 12;
  else if ((book.averageRating ?? 0) === 0) score -= 16;

  score += Math.round((book.averageRating ?? 0) * 6);

  const searchableText = `${book.title} ${book.description ?? ""} ${book.genres.join(" ")}`.toLowerCase();
  const normalizedTitle = normalizeTitle(book.title);

  if (COLLECTION_PATTERN.test(book.title)) score -= 90;
  if (LOW_SIGNAL_PATTERN.test(book.title)) score -= 40;
  if (curatedTitleSet?.has(normalizedTitle)) score += 110;

  if (genre === "Fantasy") {
    if (/\b(fantasy|romantasy|dragon|magic|magical|witch|fae|court|kingdom|sword|epic)\b/.test(searchableText)) {
      score += 16;
    }
    if (/\b(science fiction|anthology|short stories)\b/.test(searchableText)) {
      score -= 14;
    }
  }

  return score;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function GenreBrowseScreen() {
  const { params } = useRoute<RouteProps>();
  const navigation = useNavigation<NavProps>();
  const c = useColors();
  const { t } = useI18n();
  const { books } = useBookliz();
  const styles = useMemo(() => createStyles(c), [c]);

  const [catalogBooks, setCatalogBooks] = useState<GenreBookResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [networkError, setNetworkError] = useState(false);
  const [totalItems, setTotalItems] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  /** Raw items fetched so far (NOT the filtered list) — drives pagination. */
  const startIndexRef = useRef(0);
  /** Ids already rendered, so overlapping Google Books pages never duplicate. */
  const seenIdsRef = useRef<Set<string>>(new Set());
  const currentGenreRef = useRef<string>("");

  const isKeywordMode = !!params.catalogQuery;
  const currentGenre = params.genre;
  const displayTitle = params.title ?? params.genre;
  const curatedTitleSet = useMemo(
    () => new Set((params.curatedTitles ?? []).map((entry) => normalizeTitle(entry.title))),
    [params.curatedTitles]
  );

  // Set nav title
  useLayoutEffect(() => {
    navigation.setOptions({ title: displayTitle });
  }, [navigation, displayTitle]);

  // Build a set of ISBNs already in library for quick lookup
  const libraryIsbnSet = useMemo(
    () => new Set(books.map((b) => b.isbn).filter(Boolean) as string[]),
    [books]
  );

  // Books from library matching current genre
  const libraryBooks = useMemo(
    () => books.filter((b) => b.genre.includes(currentGenre)),
    [books, currentGenre]
  );

  const loadGenre = useCallback(async (genre: string, reset = true) => {
    if (reset) {
      setLoading(true);
      setNetworkError(false);
      setCatalogBooks([]);
      setHasMore(false);
      startIndexRef.current = 0;
      seenIdsRef.current = new Set();
      currentGenreRef.current = genre;
    } else {
      setLoadingMore(true);
    }

    try {
      const fetcher = params.catalogQuery
        ? fetchByKeyword(params.catalogQuery, reset ? 0 : startIndexRef.current, PAGE_SIZE)
        : fetchByGenre(genre, reset ? 0 : startIndexRef.current, PAGE_SIZE);
      const [{ books: fetched, totalItems: total }, curatedBooks] = await Promise.all([
        fetcher,
        reset && params.curatedTitles?.length
          ? Promise.all(
              params.curatedTitles.map(async (seed) => {
                // Structured operators: find the exact book, not anything that mentions
                // the title words in a description or editorial field.
                const query = seed.author
                  ? `intitle:"${seed.title}" inauthor:"${seed.author}"`
                  : `intitle:"${seed.title}"`;
                const { books } = await fetchByKeyword(query, 0, 8);
                return selectBestCuratedMatch(books, seed);
              })
            ).then((books) => books.filter((book): book is GenreBookResult => Boolean(book)))
          : Promise.resolve([] as GenreBookResult[]),
      ]);
      const merged = [...curatedBooks, ...fetched].filter((book, index, all) => (
        all.findIndex((candidate) => candidate.id === book.id) === index
      ));

      // Hard filter: reuse the same quality gate as the recommendation engine —
      // blocks magazines, text-scan covers, pre-1950 ephemera, generic authors, etc.
      // Falls back to cover-only filter if the strict filter leaves fewer than 6 books
      // (prevents empty pages on very niche genre searches).
      const highSignal = merged.filter((b) => isHighSignalCatalogBook(b));
      const withCover = merged.filter((b) => !!b.coverUrl && !COLLECTION_PATTERN.test(b.title));
      const filtered = highSignal.length >= 6 ? highSignal : withCover.length > 0 ? withCover : merged;
      const ranked = [...filtered].sort((a, b) => {
        const scoreDiff = scoreCatalogBook(b, genre, curatedTitleSet) - scoreCatalogBook(a, genre, curatedTitleSet);
        if (scoreDiff !== 0) return scoreDiff;
        return (b.publishedYear ?? 0) - (a.publishedYear ?? 0);
      });

      // Google Books overlaps results between startIndex values — keep the
      // first occurrence of each id so the list never renders duplicate keys.
      const seen = reset ? new Set<string>() : seenIdsRef.current;
      const deduped = ranked.filter((b) => {
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
      setCatalogBooks((prev) => reset ? deduped : [...prev, ...deduped]);
    } catch {
      if (reset) setNetworkError(true);
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [curatedTitleSet, params.catalogQuery, params.curatedTitles]);

  useEffect(() => {
    loadGenre(currentGenre, true);
  }, [currentGenre, loadGenre]);

  function handleLoadMore() {
    if (loadingMore || loading || !hasMore) return;
    if (currentGenreRef.current !== currentGenre) return;
    loadGenre(currentGenre, false);
  }

  function isInLibrary(book: GenreBookResult): boolean {
    return !!book.isbn13 && libraryIsbnSet.has(book.isbn13);
  }

  function getLibraryBook(catalogBook: GenreBookResult): Book | undefined {
    if (!catalogBook.isbn13) return undefined;
    return books.find((b) => b.isbn === catalogBook.isbn13);
  }

  function handleBookPress(book: GenreBookResult) {
    const libBook = getLibraryBook(book);
    if (libBook) {
      navigation.navigate("BookDetail", { bookId: libBook.id });
    } else {
      navigation.navigate("BookPreview", { book });
    }
  }

  // ── Book card ──────────────────────────────────────────────────────────────
  function renderCatalogCard({ item }: { item: GenreBookResult }) {
    const inLibrary = isInLibrary(item);
    const fullStars = item.averageRating ? Math.round(item.averageRating) : 0;
    const ratingCount = item.ratingsCount
      ? item.ratingsCount >= 1000
        ? `${(item.ratingsCount / 1000).toFixed(1)}k`
        : String(item.ratingsCount)
      : null;

    return (
      <Pressable accessibilityRole="button"
        style={[styles.bookCard, inLibrary && { opacity: 0.85 }]}
        onPress={() => handleBookPress(item)}
      >
        {/* Cover */}
        <View style={styles.coverWrap}>
          {item.coverUrl ? (
            <Image
              source={{ uri: item.coverUrl }}
              style={styles.cover}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.cover, styles.coverPlaceholder, { backgroundColor: c.surfaceAlt }]}>
              <Ionicons name="book-outline" size={28} color={c.border} />
            </View>
          )}
          {inLibrary && (
            <View style={[styles.libraryBadge, { backgroundColor: c.teal }]}>
              <Ionicons name="checkmark" size={10} color="#fff" />
            </View>
          )}
        </View>

        {/* Meta */}
        <Text numberOfLines={2} style={[styles.bookTitle, { color: c.ink }]}>
          {item.title}
        </Text>
        {item.authors[0] && (
          <Text numberOfLines={1} style={[styles.bookAuthor, { color: c.muted }]}>
            By {item.authors[0]}
          </Text>
        )}
        {/* Ratings row */}
        {fullStars > 0 ? (
          <View style={styles.ratingRow}>
            {[1,2,3,4,5].map((i) => (
              <Ionicons
                key={i}
                name={i <= fullStars ? "star" : "star-outline"}
                size={10}
                color={i <= fullStars ? "#F5A623" : c.muted}
              />
            ))}
            {ratingCount ? (
              <Text style={[styles.ratingCount, { color: c.muted }]}>{ratingCount}</Text>
            ) : null}
          </View>
        ) : item.publishedYear ? (
          <Text style={[styles.bookYear, { color: c.muted }]}>
            {item.publishedYear}
          </Text>
        ) : null}
      </Pressable>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      {/* Main catalog list */}
      {loading ? (
        // Skeleton grid matching the real 2-col catalog layout
        <View style={styles.skeletonGrid}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <View key={i} style={styles.skeletonCard}>
              <Skeleton style={styles.skeletonCover} />
              <Skeleton style={{ height: 13, marginTop: 8, width: "85%" }} />
              <Skeleton style={{ height: 11, marginTop: 5, width: "55%" }} />
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={catalogBooks}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          renderItem={renderCatalogCard}
          ListHeaderComponent={
            <>
              {/* Library section — only in genre mode, not keyword/mood mode */}
              {!isKeywordMode && libraryBooks.length > 0 && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: c.ink }]}>
                    {t("catalog.inYourLibrary")}
                  </Text>
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
                            <Image
                              source={{ uri: book.coverImageUri }}
                              style={styles.libraryCover}
                              resizeMode="cover"
                            />
                          ) : (
                            <View style={[styles.libraryCover, { backgroundColor: c.surfaceAlt, alignItems: "center", justifyContent: "center" }]}>
                              <Ionicons name="book-outline" size={22} color={c.border} />
                            </View>
                          )}
                          <View style={[styles.libraryBadgeLarge, { backgroundColor: c.teal }]}>
                            <Ionicons name="checkmark" size={11} color="#fff" />
                          </View>
                        </View>
                        <Text numberOfLines={2} style={[styles.libraryTitle, { color: c.ink }]}>
                          {book.title}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Catalog header */}
              <View style={styles.catalogHeader}>
                <Text style={[styles.sectionTitle, { color: c.ink }]}>
                  {t("catalog.allTitles")}
                </Text>
                {totalItems > 0 && (
                  <Text style={[styles.totalCount, { color: c.muted }]}>
                    {t("catalog.booksCount", { count: totalItems > 500 ? "500+" : totalItems.toLocaleString() })}
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
            !loading ? (
              networkError ? (
                <View style={styles.emptyState}>
                  <Ionicons name="wifi-outline" size={40} color={c.border} />
                  <Text style={[styles.emptyTitle, { color: c.ink }]}>{t("catalog.connectionLost")}</Text>
                  <Text style={[styles.emptySub, { color: c.muted }]}>
                    {t("catalog.connectionLostBody")}
                  </Text>
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons name="search-outline" size={40} color={c.border} />
                  <Text style={[styles.emptyTitle, { color: c.ink }]}>{t("catalog.noResults")}</Text>
                  <Text style={[styles.emptySub, { color: c.muted }]}>
                    {t("catalog.noResultsGenre")}
                  </Text>
                </View>
              )
            ) : null
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

    // ── Loading (skeleton grid) ────────────────────────────────────────────
    skeletonGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      paddingTop: spacing.lg,
    },
    skeletonCard: {
      paddingBottom: spacing.md,
      paddingLeft: spacing.md,
      paddingRight: spacing.sm,
      width: "50%",
    },
    skeletonCover: {
      aspectRatio: 0.67,
      borderRadius: radii.sm,
      width: "100%",
    },

    // ── List ───────────────────────────────────────────────────────────────
    listContent: { paddingBottom: 40 },
    row: { gap: 0 },

    // ── Section headers ────────────────────────────────────────────────────
    section: { paddingTop: spacing.lg, marginBottom: spacing.sm },
    catalogHeader: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: 8,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.lg,
      paddingBottom: spacing.sm,
    },
    sectionTitle: {
      fontFamily: fonts.display,
      fontSize: 20,
      fontWeight: "900",
      paddingHorizontal: spacing.md,
      marginBottom: spacing.sm,
    },
    totalCount: { fontFamily: fonts.body, fontSize: 13, fontWeight: "700" },

    // ── Library horizontal strip ───────────────────────────────────────────
    libraryRow: { gap: 12, paddingHorizontal: spacing.md },
    libraryCard: { width: 96 },
    libraryCoverWrap: { position: "relative", marginBottom: 6 },
    libraryCover: { width: 96, height: 140, borderRadius: radii.sm },
    libraryBadgeLarge: {
      position: "absolute", bottom: 6, right: 6,
      borderRadius: 10, width: 20, height: 20,
      alignItems: "center", justifyContent: "center",
    },
    libraryTitle: {
      fontFamily: fonts.body, fontSize: 11, fontWeight: "800", lineHeight: 15,
    },

    // ── Catalog 2-col grid ─────────────────────────────────────────────────
    bookCard: {
      width: "50%",
      paddingLeft: spacing.md,
      paddingRight: spacing.sm,
      paddingBottom: spacing.md,
    },
    coverWrap: { position: "relative", marginBottom: 7 },
    cover: {
      width: "100%",
      aspectRatio: 0.67,
      borderRadius: radii.sm,
    },
    coverPlaceholder: {
      alignItems: "center",
      justifyContent: "center",
    },
    libraryBadge: {
      position: "absolute", top: 6, right: 6,
      borderRadius: 8, width: 16, height: 16,
      alignItems: "center", justifyContent: "center",
    },
    bookTitle: {
      fontFamily: fonts.body, fontSize: 13, fontWeight: "800",
      lineHeight: 18, paddingHorizontal: 2,
    },
    bookAuthor: {
      fontFamily: fonts.body, fontSize: 11, fontWeight: "700",
      marginTop: 2, paddingHorizontal: 2,
    },
    bookYear: {
      fontFamily: fonts.body, fontSize: 10, fontWeight: "700",
      marginTop: 2, paddingHorizontal: 2, opacity: 0.6,
    },
    ratingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      marginTop: 3,
      paddingHorizontal: 2,
    },
    ratingCount: {
      fontFamily: fonts.body,
      fontSize: 10,
      fontWeight: "700",
      marginLeft: 2,
    },

    // ── Footer ────────────────────────────────────────────────────────────
    footer: { paddingVertical: 20, alignItems: "center" },
    loadMoreBtn: {
      alignSelf: "center", borderWidth: 1, borderRadius: radii.pill,
      paddingHorizontal: 24, paddingVertical: 10, marginVertical: 16,
    },
    loadMoreText: { fontFamily: fonts.body, fontSize: 14, fontWeight: "800" },

    // ── Empty ──────────────────────────────────────────────────────────────
    emptyState: {
      alignItems: "center", gap: 10, paddingHorizontal: spacing.xl, paddingVertical: 60,
    },
    emptyTitle: { fontFamily: fonts.display, fontSize: 18, fontWeight: "900" },
    emptySub: {
      fontFamily: fonts.body, fontSize: 13, fontWeight: "700",
      lineHeight: 19, textAlign: "center",
    },
  });
}
