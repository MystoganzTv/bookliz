/**
 * DiscoverScreen — Premium redesign
 *
 * Visual-first discover experience inspired by Audible / Apple Books / Netflix.
 * No generic icon squares. Images are the protagonists.
 *
 * Sections:
 *   - Sticky search bar
 *   - Browse by mood   → cinematic image cards, 2-col grid
 *   - Browse by genre  → image cards, horizontal scroll
 *   - Trending now     → real data from Google Books, horizontal scroll
 *   - Popular searches → quick chips
 */
import { NavigationProp, useNavigation } from "@react-navigation/native";
import { useEffect, useMemo, useState } from "react";
import {
  Image,
  ImageSourcePropType,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  ImageStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CatalogBookCard } from "../components/CatalogBookCard";
import { ScalePressable } from "../components/ScalePressable";
import { Screen } from "../components/Screen";
import { Skeleton } from "../components/Skeleton";
import { useBookliz } from "../data/BooklizContext";
import { RootStackParamList, MainTabParamList } from "../navigation/types";
import { fetchByKeyword, GenreBookResult } from "../services/googleBooksProvider";
import { buildLibraryIndex } from "../services/recommendationEngine";
import {
  buildIdentitySectionSpecs,
  fetchIdentitySections,
  IdentitySection,
} from "../services/identityRecommendations";
import { HOURS, readCache, writeCache } from "../utils/discoverCache";
import { AppColors, fonts, radii, shadows, spacing } from "../theme/theme";
import { useColors } from "../theme/ThemeContext";
import { useI18n } from "../i18n/LocalizationContext";

// ─── Moods ────────────────────────────────────────────────────────────────────

type Mood = {
  id: string;
  label: string;
  imageSource: ImageSourcePropType;
  tint: string;
  catalogQuery: string;
};

const MOODS: Mood[] = [
  {
    id: "scary",
    label: "Scary",
    imageSource: require("../../assets/discover/mood-scary.png"),
    tint: "rgba(10, 20, 30, 0.22)",
    catalogQuery: "horror scary supernatural dark thriller",
  },
  {
    id: "exciting",
    label: "Exciting",
    imageSource: require("../../assets/discover/mood-exciting.png"),
    tint: "rgba(96, 52, 14, 0.16)",
    catalogQuery: "thrilling adventure action packed suspense",
  },
  {
    id: "epic",
    label: "Epic",
    imageSource: require("../../assets/discover/mood-epic.png"),
    tint: "rgba(70, 58, 94, 0.16)",
    catalogQuery: "epic fantasy adventure saga series quest",
  },
  {
    id: "fastpaced",
    label: "Fast-paced",
    imageSource: require("../../assets/discover/mood-fast-paced.png"),
    tint: "rgba(8, 56, 76, 0.18)",
    catalogQuery: "fast paced action thriller page turner suspense",
  },
  {
    id: "heartfelt",
    label: "Heartfelt",
    imageSource: require("../../assets/discover/mood-heartfelt.png"),
    tint: "rgba(92, 42, 54, 0.16)",
    catalogQuery: "emotional heartfelt love story family drama",
  },
  {
    id: "inspiring",
    label: "Inspiring",
    imageSource: require("../../assets/discover/mood-inspiring.png"),
    tint: "rgba(118, 82, 20, 0.14)",
    catalogQuery: "inspiring uplifting motivational memoir biography",
  },
  {
    id: "cozy",
    label: "Cozy",
    imageSource: require("../../assets/discover/mood-cozy.png"),
    tint: "rgba(88, 58, 32, 0.18)",
    catalogQuery: "cozy mystery cozy fantasy comfort read warm",
  },
  {
    id: "thought",
    label: "Thought-provoking",
    imageSource: require("../../assets/discover/mood-thought-provoking.png"),
    tint: "rgba(34, 62, 86, 0.15)",
    catalogQuery: "thought provoking philosophical literary fiction",
  },
];

// ─── Genres ───────────────────────────────────────────────────────────────────

type GenreCard = {
  genre: string;
  label: string;
  imageSource: ImageSourcePropType;
  catalogQuery?: string;
  curatedTitles?: Array<{ title: string; author?: string }>;
};

const CATALOG_GENRES: GenreCard[] = [
  { genre: "Fantasy", label: "Fantasy", imageSource: require("../../assets/discover/genre-fantasy.png"), catalogQuery: "booktok fantasy romantasy bestselling epic fantasy 2024 2025" },
  { genre: "Science Fiction", label: "Science Fiction", imageSource: require("../../assets/discover/genre-science-fiction.png"), catalogQuery: "popular science fiction novels bestselling" },
  { genre: "Mystery", label: "Mystery & Thriller", imageSource: require("../../assets/discover/genre-mystery-thriller.png"), catalogQuery: "bestselling mystery thriller novels popular" },
  { genre: "Romance", label: "Romance", imageSource: require("../../assets/discover/genre-romance.png"), catalogQuery: "popular romance novels bestselling" },
  { genre: "Historical Fiction", label: "Historical Fiction", imageSource: require("../../assets/discover/genre-historical-fiction.png"), catalogQuery: "historical fiction bestselling novels popular" },
  { genre: "Horror", label: "Horror", imageSource: require("../../assets/discover/genre-horror.png"), catalogQuery: "popular horror novels bestselling supernatural thriller" },
  { genre: "Biography", label: "Biography", imageSource: require("../../assets/discover/genre-biography.png"), catalogQuery: "bestselling biography memoir notable people" },
  {
    genre: "Personal Growth",
    label: "Self Help",
    imageSource: require("../../assets/discover/genre-self-help.png"),
    catalogQuery: "self help personal growth bestselling mindset habits",
    curatedTitles: [
      { title: "Atomic Habits", author: "James Clear" },
      { title: "The Mountain Is You", author: "Brianna Wiest" },
      { title: "The Psychology of Money", author: "Morgan Housel" },
      { title: "The Subtle Art of Not Giving a F*ck", author: "Mark Manson" },
      { title: "Deep Work", author: "Cal Newport" },
      { title: "The 7 Habits of Highly Effective People", author: "Stephen R. Covey" },
    ],
  },
];

// ─── Popular searches ─────────────────────────────────────────────────────────

const POPULAR_SEARCHES = [
  { label: "Award winners 2024", query: "award winning fiction 2024 literary prize" },
  { label: "Book club picks", query: "book club fiction contemporary popular" },
  { label: "Dark academia", query: "dark academia novels gothic campus mystery" },
  { label: "Cozy mysteries", query: "cozy mystery novels charming amateur sleuth" },
  { label: "Enemies to lovers", query: "enemies to lovers romance bestselling" },
  { label: "Sci-fi classics", query: "classic science fiction novels essential" },
  { label: "Historical thrillers", query: "historical thriller novels bestselling" },
  { label: "True crime", query: "true crime bestselling nonfiction" },
  { label: "Coming of age", query: "coming of age novels literary fiction" },
  { label: "Magical realism", query: "magical realism novels acclaimed" },
];

// Pool of curated books grouped by genre — one entry per genre slot.
// Each genre contributes exactly 1 book to the final 6-book trending section,
// ensuring genre diversity regardless of which rotation is active.
// Rotation changes daily (based on day-of-year) so the section feels fresh.
const TRENDING_POOL: Array<{ title: string; author: string; genre: string }> = [
  // Literary Fiction
  { title: "Yellowface", author: "R. F. Kuang", genre: "literary" },
  { title: "Tomorrow, and Tomorrow, and Tomorrow", author: "Gabrielle Zevin", genre: "literary" },
  { title: "My Year of Rest and Relaxation", author: "Ottessa Moshfegh", genre: "literary" },
  { title: "A Little Life", author: "Hanya Yanagihara", genre: "literary" },
  // Romance
  { title: "Book Lovers", author: "Emily Henry", genre: "romance" },
  { title: "The Unhoneymooners", author: "Christina Lauren", genre: "romance" },
  { title: "Beach Read", author: "Emily Henry", genre: "romance" },
  { title: "People We Meet on Vacation", author: "Emily Henry", genre: "romance" },
  // Science Fiction
  { title: "Project Hail Mary", author: "Andy Weir", genre: "scifi" },
  { title: "The Martian", author: "Andy Weir", genre: "scifi" },
  { title: "Recursion", author: "Blake Crouch", genre: "scifi" },
  { title: "Dark Matter", author: "Blake Crouch", genre: "scifi" },
  // Fantasy
  { title: "Fourth Wing", author: "Rebecca Yarros", genre: "fantasy" },
  { title: "The Way of Kings", author: "Brandon Sanderson", genre: "fantasy" },
  { title: "The Name of the Wind", author: "Patrick Rothfuss", genre: "fantasy" },
  { title: "A Court of Thorns and Roses", author: "Sarah J. Maas", genre: "fantasy" },
  // Thriller / Mystery
  { title: "The Silent Patient", author: "Alex Michaelides", genre: "thriller" },
  { title: "Gone Girl", author: "Gillian Flynn", genre: "thriller" },
  { title: "The Girl with the Dragon Tattoo", author: "Stieg Larsson", genre: "thriller" },
  { title: "In the Woods", author: "Tana French", genre: "thriller" },
  // Historical Fiction
  { title: "All the Light We Cannot See", author: "Anthony Doerr", genre: "historical" },
  { title: "The Pillars of the Earth", author: "Ken Follett", genre: "historical" },
  { title: "The Shadow of the Wind", author: "Carlos Ruiz Zafon", genre: "historical" },
  { title: "Pachinko", author: "Min Jin Lee", genre: "historical" },
  // Horror
  { title: "The Haunting of Hill House", author: "Shirley Jackson", genre: "horror" },
  { title: "It", author: "Stephen King", genre: "horror" },
  { title: "Mexican Gothic", author: "Silvia Moreno-Garcia", genre: "horror" },
  // Personal Growth / Nonfiction
  { title: "Atomic Habits", author: "James Clear", genre: "nonfiction" },
  { title: "Educated", author: "Tara Westover", genre: "nonfiction" },
  { title: "Sapiens", author: "Yuval Noah Harari", genre: "nonfiction" },
];

const TRENDING_GENRES = ["literary", "romance", "scifi", "fantasy", "thriller", "historical"] as const;

/** Pick one book per genre, rotating daily so the section feels fresh without being random. */
function pickTrendingTitles(): Array<{ title: string; author: string }> {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000);
  return TRENDING_GENRES.map((genre, i) => {
    const pool = TRENDING_POOL.filter((book) => book.genre === genre);
    return pool[(dayOfYear + i) % pool.length];
  });
}

const CURATED_TRENDING_TITLES = pickTrendingTitles();

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

    return (b.averageRating ?? 0) - (a.averageRating ?? 0);
  });

  return ranked.find((book) => normalizeTitle(book.title).includes(wantedTitle) && !!book.coverUrl) ?? ranked[0] ?? null;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function DiscoverScreen() {
  const c = useColors();
  const { t } = useI18n();
  const navigation = useNavigation<NavigationProp<RootStackParamList & MainTabParamList>>();
  const styles = useMemo(() => createStyles(c), [c]);
  const { books, readingIdentity } = useBookliz();
  const libraryIndex = useMemo(() => buildLibraryIndex(books), [books]);
  // Phase 2 S1: deterministic section specs straight from the ReadingIdentity.
  const recommendationSpecs = useMemo(
    () => (readingIdentity ? buildIdentitySectionSpecs(readingIdentity) : []),
    [readingIdentity]
  );

  // Trending — fetched once on mount
  const [trending, setTrending] = useState<GenreBookResult[]>([]);
  const [loadingTrending, setLoadingTrending] = useState(true);
  const [trendingNetworkError, setTrendingNetworkError] = useState(false);
  const [personalizedSections, setPersonalizedSections] = useState<IdentitySection[]>([]);
  const [loadingPersonalized, setLoadingPersonalized] = useState(true);
  const [personalizedNetworkError, setPersonalizedNetworkError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setTrendingNetworkError(false);

    // Rotation-aware cache key: a new day-of-year = new curated set = new key.
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000);
    const cacheKey = `trending-${dayOfYear}`;

    const load = async () => {
      const cached = await readCache<GenreBookResult[]>(cacheKey, 24 * HOURS);
      if (cached?.length && !cancelled) {
        setTrending(cached);
        setLoadingTrending(false);
        return;
      }

      try {
        const books = await Promise.all(
          CURATED_TRENDING_TITLES.map(async (seed) => {
            // Structured operators so Google Books finds the exact book.
            const query = seed.author
              ? `intitle:"${seed.title}" inauthor:"${seed.author}"`
              : `intitle:"${seed.title}"`;
            const { books: results } = await fetchByKeyword(query, 0, 8);
            return selectBestCuratedMatch(results, seed);
          })
        );
        if (cancelled) return;
        const found = books.filter((book): book is GenreBookResult => Boolean(book));
        setTrending(found);
        if (found.length) void writeCache(cacheKey, found);
      } catch {
        if (!cancelled) {
          setTrending([]);
          setTrendingNetworkError(true);
        }
      } finally {
        if (!cancelled) setLoadingTrending(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setPersonalizedNetworkError(false);

    // Identity not computed yet (first 5s after hydration) → keep skeleton.
    if (!readingIdentity) {
      setLoadingPersonalized(true);
      return;
    }
    if (recommendationSpecs.length === 0) {
      setPersonalizedSections([]);
      setLoadingPersonalized(false);
      return;
    }

    setLoadingPersonalized(true);

    // Cache keyed by the spec set: identity changes → new specs → new key.
    const cacheKey = `identity-recs-${recommendationSpecs.map((spec) => spec.id).join("_")}`;

    const load = async () => {
      const cached = await readCache<IdentitySection[]>(cacheKey, 12 * HOURS);
      if (cached?.length && !cancelled) {
        setPersonalizedSections(cached);
        setLoadingPersonalized(false);
        return;
      }

      try {
        const sections = await fetchIdentitySections(readingIdentity, libraryIndex);
        if (cancelled) return;
        setPersonalizedSections(sections);
        if (sections.length) void writeCache(cacheKey, sections);
      } catch {
        if (!cancelled) {
          setPersonalizedSections([]);
          setPersonalizedNetworkError(true);
        }
      } finally {
        if (!cancelled) setLoadingPersonalized(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [libraryIndex, recommendationSpecs, readingIdentity]);

  function goToCatalog(
    query: string,
    title?: string,
    browseKey?: string,
    sort?: "relevance" | "newest"
  ) {
    if (!query.trim()) return;
    navigation.navigate("GenreBrowse", {
      genre: browseKey ?? title ?? query,
      title: title ?? query,
      catalogQuery: query,
      sort,
    });
  }

  function openUnifiedSearch(initialQuery?: string) {
    navigation.navigate("BookIntake", {
      autoRun: Boolean(initialQuery?.trim()),
      initialMode: "search",
      initialQuery: initialQuery?.trim(),
    });
  }

  function goToGenre(card: GenreCard) {
    navigation.navigate("GenreBrowse", {
      genre: card.genre,
      title: card.label,
      catalogQuery: card.catalogQuery,
      curatedTitles: card.curatedTitles,
    });
  }

  function openTrendingBook(book: GenreBookResult) {
    // Rich preview first — the user decides there whether to add it.
    navigation.navigate("BookPreview", { book });
  }

  const trendingShowcase = trending.slice(0, 6);

  return (
    <Screen>
      {/* ── Unified search entry ───────────────────────────────────────────── */}
      <Pressable accessibilityRole="button" style={styles.searchRow} onPress={() => openUnifiedSearch()}>
        <Ionicons name="search-outline" size={18} color={c.muted} style={styles.searchIcon} />
        <Text style={[styles.searchPlaceholder, { color: c.muted }]}>
          {t("discover.searchPlaceholder")}
        </Text>
      </Pressable>

      {loadingPersonalized ? (
        // Shape-accurate skeleton: section header + row of book cards
        <View style={styles.personalizedBlock}>
          <Skeleton style={{ height: 22, marginBottom: 8, width: 170 }} />
          <Skeleton style={{ height: 14, marginBottom: spacing.md, width: 230 }} />
          <View style={{ flexDirection: "row", gap: 12 }}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={{ width: 118 }}>
                <Skeleton style={{ borderRadius: radii.lg, height: 172, marginBottom: 8, width: 118 }} />
                <Skeleton style={{ height: 13, marginBottom: 6, width: 102 }} />
                <Skeleton style={{ height: 11, width: 72 }} />
              </View>
            ))}
          </View>
        </View>
      ) : personalizedSections.length > 0 ? (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t("discover.pickedForYou")}</Text>
            <Text style={styles.sectionSubtitle}>{t("discover.pickedForYouSub")}</Text>
          </View>
          {personalizedSections.map((section) => (
            <View key={section.id} style={styles.personalizedBlock}>
              <View style={styles.personalizedHeaderRow}>
                <View style={styles.personalizedHeaderCopy}>
                  <Text style={styles.personalizedTitle}>{t(section.titleKey, section.params)}</Text>
                  <Text style={styles.personalizedSubtitle}>{t(section.subtitleKey, section.params)}</Text>
                </View>
                <Pressable accessibilityRole="button" onPress={() => goToCatalog(
                  section.query,
                  t(section.titleKey, section.params)
                )}>
                  <Text style={styles.personalizedAction}>{t("discover.seeMore")}</Text>
                </Pressable>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.personalizedScroll}
                contentContainerStyle={styles.personalizedContent}
              >
                {[...new Map(section.books.map((b) => [b.id, b])).values()].map((book) => (
                  <CatalogBookCard
                    key={`${section.id}-${book.id}`}
                    book={book}
                    onPress={openTrendingBook}
                    cardStyle={styles.personalizedCard}
                    coverStyle={styles.personalizedCover}
                    titleStyle={styles.personalizedCardTitle}
                    authorStyle={styles.personalizedCardAuthor}
                    metaStyle={styles.personalizedCardMeta}
                    showYear
                  />
                ))}
              </ScrollView>
            </View>
          ))}
        </>
      ) : personalizedNetworkError ? (
        <View style={styles.personalizedEmpty}>
          <Ionicons name="wifi-outline" size={24} color={c.muted} />
          <Text style={styles.personalizedEmptyTitle}>{t("discover.connectionLost")}</Text>
          <Text style={styles.personalizedEmptyBody}>
            {t("discover.connectionLostBody")}
          </Text>
        </View>
      ) : (
        // Empty state: not enough signal yet — show quietly, no CTA
        <View style={styles.personalizedEmpty}>
          <Ionicons name="book-outline" size={24} color={c.muted} />
          <Text style={styles.personalizedEmptyTitle}>{t("discover.picksEmptyTitle")}</Text>
          <Text style={styles.personalizedEmptyBody}>
            {t("discover.picksEmptyBody")}
          </Text>
        </View>
      )}

      {/* ── Browse by mood ─────────────────────────────────────────────────── */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t("discover.byMood")}</Text>
      </View>
      <View style={styles.moodGrid}>
        {MOODS.map((mood) => (
          <ScalePressable accessibilityRole="button"
            key={mood.id}
            style={styles.moodCard}
            // Moods are a "what should I read right now" question, so they lead
            // with what is actually out now. Genre browsing keeps relevance.
            onPress={() => goToCatalog(mood.catalogQuery, mood.label, undefined, "newest")}
          >
            <View style={styles.moodImageWrap}>
              <Image
                source={mood.imageSource}
                style={styles.moodImage}
                resizeMode="cover"
              />
              <View style={[styles.moodTintOverlay, { backgroundColor: mood.tint }]} />
            </View>
            <Text style={styles.moodCardLabel}>{mood.label}</Text>
          </ScalePressable>
        ))}
      </View>

      {/* ── Browse by genre ────────────────────────────────────────────────── */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t("discover.byGenre")}</Text>
      </View>
      <View style={styles.genreGrid}>
        {CATALOG_GENRES.map((g) => (
          <ScalePressable accessibilityRole="button"
            key={g.label}
            style={styles.genreCard}
            onPress={() => goToGenre(g)}
          >
            <Image
              source={g.imageSource}
              style={styles.genreImage}
              resizeMode="cover"
            />
            <Text style={styles.genreCardLabel}>{g.label}</Text>
          </ScalePressable>
        ))}
      </View>

      {/* ── Trending now ───────────────────────────────────────────────────── */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t("discover.trendingTitle")}</Text>
        <Text style={styles.sectionSubtitle}>{t("discover.trendingSub")}</Text>
      </View>
      {loadingTrending ? (
        // Skeleton mirrors the real mosaic layout — zero layout shift on load
        <View style={[styles.trendingMosaic, { marginBottom: spacing.xl }]}>
          <View style={styles.trendingColumn}>
            <Skeleton style={{ borderRadius: radii.lg, height: 160, width: 108 }} />
            <Skeleton style={{ borderRadius: radii.lg, height: 160, width: 108 }} />
          </View>
          <View style={styles.trendingColumn}>
            <Skeleton style={{ borderRadius: radii.lg, height: 210, width: 140 }} />
            <Skeleton style={{ borderRadius: radii.lg, height: 220, width: 140 }} />
          </View>
          <View style={styles.trendingColumn}>
            <Skeleton style={{ borderRadius: radii.lg, height: 160, width: 108 }} />
            <Skeleton style={{ borderRadius: radii.lg, height: 160, width: 108 }} />
          </View>
        </View>
      ) : trendingShowcase.length === 0 ? (
        <View style={styles.trendingEmpty}>
          <Ionicons name="wifi-outline" size={24} color={c.muted} />
          <Text style={styles.trendingEmptyText}>{t("discover.trendingError")}</Text>
        </View>
      ) : (
        <View style={styles.trendingSection}>
          <View style={[styles.trendingBackdrop, { backgroundColor: c.surface }]} />
          <View style={styles.trendingMosaic}>
            <View style={styles.trendingColumn}>
              {trendingShowcase[0] ? (
                <TrendingTile
                  book={trendingShowcase[0]}
                  style={styles.trendingTileSmall}
                  coverStyle={styles.trendingCoverSmall}
                  onPress={openTrendingBook}
                />
              ) : null}
              {trendingShowcase[3] ? (
                <TrendingTile
                  book={trendingShowcase[3]}
                  style={styles.trendingTileSmall}
                  coverStyle={styles.trendingCoverSmall}
                  onPress={openTrendingBook}
                />
              ) : null}
            </View>
            <View style={styles.trendingColumn}>
              {trendingShowcase[1] ? (
                <TrendingTile
                  book={trendingShowcase[1]}
                  style={styles.trendingTileLarge}
                  coverStyle={styles.trendingCoverLarge}
                  onPress={openTrendingBook}
                />
              ) : null}
              {trendingShowcase[4] ? (
                <TrendingTile
                  book={trendingShowcase[4]}
                  style={styles.trendingTileTall}
                  coverStyle={styles.trendingCoverTall}
                  onPress={openTrendingBook}
                />
              ) : null}
            </View>
            <View style={styles.trendingColumn}>
              {trendingShowcase[2] ? (
                <TrendingTile
                  book={trendingShowcase[2]}
                  style={styles.trendingTileSmall}
                  coverStyle={styles.trendingCoverSmall}
                  onPress={openTrendingBook}
                />
              ) : null}
              {trendingShowcase[5] ? (
                <TrendingTile
                  book={trendingShowcase[5]}
                  style={styles.trendingTileSmall}
                  coverStyle={styles.trendingCoverSmall}
                  onPress={openTrendingBook}
                />
              ) : null}
            </View>
          </View>
          <Text style={styles.trendingCaption}>{t("discover.trendingCaption")}</Text>
        </View>
      )}

      {/* ── Popular searches ───────────────────────────────────────────────── */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t("discover.popularSearches")}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chipsContent}
      >
        {POPULAR_SEARCHES.map((s) => (
          <Pressable accessibilityRole="button"
            key={s.label}
            style={[styles.chip, { borderColor: c.border, backgroundColor: c.surface }]}
            onPress={() => goToCatalog(s.query, s.label)}
          >
            <Text style={[styles.chipText, { color: c.ink }]}>{s.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
}

function TrendingTile({
  book,
  style,
  coverStyle,
  onPress,
}: {
  book: GenreBookResult;
  style: StyleProp<ViewStyle>;
  coverStyle: StyleProp<ImageStyle>;
  onPress: (book: GenreBookResult) => void;
}) {
  const { t } = useI18n();
  return (
    <ScalePressable
      style={style}
      onPress={() => onPress(book)}
      pressScale={0.94}
      accessibilityRole="button"
      accessibilityLabel={t("a11y.openBook", { title: book.title })}
    >
      {book.coverUrl ? (
        <Image
          source={{ uri: book.coverUrl }}
          style={coverStyle}
          resizeMode="cover"
        />
      ) : (
        <View style={[coverStyle as StyleProp<ViewStyle>, stylesFallback.trendingPlaceholder]}>
          <Ionicons name="book-outline" size={24} color="#91A0B8" />
        </View>
      )}
    </ScalePressable>
  );
}

const stylesFallback = StyleSheet.create({
  trendingPlaceholder: {
    alignItems: "center",
    backgroundColor: "#152235",
    justifyContent: "center",
  },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

function createStyles(c: AppColors) {
  return StyleSheet.create({
    // ── Search ──────────────────────────────────────────────────────────────
    searchRow: {
      alignItems: "center",
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: radii.pill,
      borderWidth: 1,
      flexDirection: "row",
      marginBottom: spacing.lg,
      paddingHorizontal: spacing.md,
      ...shadows.card,
    },
    searchIcon: { marginRight: 8 },
    searchPlaceholder: {
      flex: 1,
      fontFamily: fonts.body,
      fontSize: 15,
      fontWeight: "700",
      paddingVertical: 14,
    },

    // ── Section header ───────────────────────────────────────────────────────
    sectionHeader: {
      marginBottom: spacing.sm,
    },
    sectionTitle: {
      color: c.ink,
      fontFamily: fonts.display,
      fontSize: 22,
      fontWeight: "900",
    },
    sectionSubtitle: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: "700",
      marginTop: 4,
    },
    personalizedLoading: {
      alignItems: "center",
      justifyContent: "center",
      marginBottom: spacing.xl,
      minHeight: 56,
    },
    personalizedEmpty: {
      alignItems: "center",
      marginBottom: spacing.xl,
      marginHorizontal: spacing.lg,
      paddingVertical: spacing.xl,
    },
    personalizedEmptyTitle: {
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 15,
      fontWeight: "700",
      marginTop: spacing.sm,
      textAlign: "center",
    },
    personalizedEmptyBody: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 19,
      marginTop: spacing.xs,
      textAlign: "center",
    },
    personalizedEmptyButton: {
      backgroundColor: c.teal,
      borderRadius: radii.md,
      marginTop: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    personalizedEmptyButtonText: {
      color: "#fff",
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: "700",
    },
    trendingEmpty: {
      alignItems: "center",
      gap: spacing.xs,
      marginBottom: spacing.xl,
      paddingVertical: spacing.lg,
    },
    trendingEmptyText: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 13,
      textAlign: "center",
    },
    personalizedBlock: {
      marginBottom: spacing.xl,
    },
    personalizedHeaderRow: {
      alignItems: "flex-start",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: spacing.sm,
    },
    personalizedHeaderCopy: {
      flex: 1,
      paddingRight: spacing.sm,
    },
    personalizedTitle: {
      color: c.ink,
      fontFamily: fonts.display,
      fontSize: 20,
      fontWeight: "900",
    },
    personalizedSubtitle: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: "700",
      marginTop: 4,
    },
    personalizedAction: {
      color: c.tealDark,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: "900",
      paddingTop: 2,
    },
    personalizedScroll: {
      marginHorizontal: -spacing.md,
    },
    personalizedContent: {
      gap: 12,
      paddingHorizontal: spacing.md,
      paddingBottom: 2,
    },
    personalizedCard: {
      width: 118,
    },
    personalizedCover: {
      borderRadius: radii.lg,
      height: 172,
      marginBottom: 8,
      width: 118,
    },
    personalizedCardTitle: {
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 14,
      fontWeight: "800",
      lineHeight: 18,
    },
    personalizedCardAuthor: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 12,
      fontWeight: "700",
      marginTop: 4,
    },
    personalizedCardMeta: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 11,
      fontWeight: "700",
      marginTop: 3,
      opacity: 0.75,
    },

    // ── Mood grid (2-col, image cards) ───────────────────────────────────────
    moodGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginBottom: spacing.xl,
    },
    moodCard: {
      gap: 8,
      width: "48.5%",
    },
    moodImageWrap: {
      borderRadius: radii.lg,
      overflow: "hidden",
      position: "relative",
    },
    moodImage: {
      height: 150,
      width: "100%",
    },
    moodTintOverlay: {
      ...StyleSheet.absoluteFillObject,
    },
    moodCardLabel: {
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 16,
      fontWeight: "800",
      textAlign: "center",
    },

    // ── Genre grid (2-col, image cards) ──────────────────────────────────────
    genreGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginBottom: spacing.xl,
    },
    genreCard: {
      gap: 8,
      width: "48.5%",
    },
    genreImage: {
      borderRadius: radii.lg,
      height: 150,
      width: "100%",
    },
    genreCardLabel: {
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 16,
      fontWeight: "800",
      textAlign: "center",
    },

    // ── Trending now ─────────────────────────────────────────────────────────
    trendingLoader: {
      alignItems: "center",
      height: 240,
      justifyContent: "center",
      marginBottom: spacing.xl,
    },
    trendingSection: {
      alignItems: "center",
      marginBottom: spacing.xl,
    },
    trendingBackdrop: {
      borderRadius: 120,
      height: 260,
      opacity: 0.28,
      position: "absolute",
      top: 48,
      width: 260,
    },
    trendingMosaic: {
      flexDirection: "row",
      gap: 14,
      justifyContent: "center",
      width: "100%",
    },
    trendingColumn: {
      alignItems: "center",
      gap: 14,
    },
    trendingTileSmall: {
      borderRadius: radii.lg,
      overflow: "hidden",
    },
    trendingTileLarge: {
      borderRadius: radii.lg,
      overflow: "hidden",
    },
    trendingTileTall: {
      borderRadius: radii.lg,
      overflow: "hidden",
    },
    trendingCoverSmall: {
      borderRadius: radii.lg,
      height: 160,
      width: 108,
    },
    trendingCoverLarge: {
      borderRadius: radii.lg,
      height: 210,
      width: 140,
    },
    trendingCoverTall: {
      borderRadius: radii.lg,
      height: 220,
      width: 140,
    },
    trendingCaption: {
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 14,
      fontWeight: "800",
      marginTop: spacing.lg,
      textAlign: "center",
    },

    // ── Popular chips ────────────────────────────────────────────────────────
    chipsScroll: { marginHorizontal: -spacing.lg, marginBottom: spacing.xl },
    chipsContent: { gap: 8, paddingHorizontal: spacing.lg, paddingBottom: 4 },
    chip: {
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    chipText: {
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: "800",
    },
  });
}
