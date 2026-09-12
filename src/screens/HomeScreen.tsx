import { Ionicons } from "@expo/vector-icons";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BookCover } from "../components/BookCover";
import { CatalogBookCard } from "../components/CatalogBookCard";

import { RecommendationCard } from "../components/RecommendationCard";
import { Screen } from "../components/Screen";
import { SectionHeader } from "../components/SectionHeader";
import { SessionRow } from "../components/SessionRow";
import { useBookliz } from "../data/BooklizContext";
import { formatElapsed, useReadingTimer } from "../data/ReadingTimerContext";
import { useI18n } from "../i18n/LocalizationContext";
import { useIsWide } from "../utils/layout";
import { MainTabParamList, RootStackParamList } from "../navigation/types";
import { fetchByGenre, GenreBookResult } from "../services/googleBooksProvider";
import {
  buildLibraryIndex,
  buildPersonalizedRecommendationSections,
  buildRecommendationSectionSpecs,
  isHighSignalCatalogBook,
  PersonalizedRecommendationSection,
} from "../services/recommendationEngine";
import { buildUserTasteProfile } from "../services/userTasteProfile";
import { AppColors, fonts, radii, shadows, spacing } from "../theme/theme";
import { HOURS, readCache, writeCache } from "../utils/discoverCache";
import { useColors, useTheme } from "../theme/ThemeContext";

const booklizLogoLight = require("../../assets/brand/bookliz-logo.png");
const booklizLogoDark = require("../../assets/brand/bookliz-logo-dark.png");

function getGreeting(t: (key: string) => string) {
  const hour = new Date().getHours();
  if (hour < 12) return t("home.morning");
  if (hour < 19) return t("home.afternoon");
  return t("home.evening");
}

function getStreakMessage(streak: number, c: AppColors, t: (key: string, vars?: Record<string, string | number>) => string): { headline: string; sub: string; accent: string } {
  if (streak === 0) return { headline: t("home.streak0Title"), sub: t("home.streak0Body"), accent: c.muted };
  if (streak === 1) return { headline: t("home.streak1Title"), sub: t("home.streak1Body"), accent: c.teal };
  if (streak < 4) return { headline: t("home.streakSmallTitle", { count: streak }), sub: t("home.streakSmallBody"), accent: c.teal };
  if (streak < 7) return { headline: t("home.streakMidTitle", { count: streak }), sub: t("home.streakMidBody"), accent: c.coral };
  if (streak < 14) return { headline: t("home.streakWeekTitle", { count: streak }), sub: t("home.streakWeekBody"), accent: c.coral };
  if (streak < 30) return { headline: t("home.streakLongTitle", { count: streak }), sub: t("home.streakLongBody"), accent: c.gold };
  return { headline: t("home.streakLegendTitle", { count: streak }), sub: t("home.streakLegendBody"), accent: c.gold };
}

/**
 * Fetch a small set of suggested books based on the user's favorite genres.
 * Only fires when the user has fewer than 8 books (new-user experience).
 * Results are cached in a ref so they don't re-fetch on every render.
 */
function useGenreSuggestions(
  favoriteGenres: string[],
  ownedTitleKeys: Set<string>
): GenreBookResult[] {
  const [suggestions, setSuggestions] = useState<GenreBookResult[]>([]);
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current || favoriteGenres.length === 0) return;
    fetched.current = true;

    // Pick up to 2 genres, fetch 12 books each, then merge + filter
    const genresToFetch = favoriteGenres.slice(0, 2);
    Promise.all(genresToFetch.map((g) => fetchByGenre(g, 0, 12))).then((results) => {
      const seen = new Set<string>();
      const merged: GenreBookResult[] = [];
      for (const { books } of results) {
        for (const book of books) {
          const key = book.googleBooksId;
          if (seen.has(key)) continue;
          if (!isHighSignalCatalogBook(book)) continue;
          if (!["English", "Spanish"].includes(book.language ?? "")) continue; // en/es only
          if (ownedTitleKeys.has(book.title.trim().toLowerCase())) continue;   // not in library
          seen.add(key);
          merged.push(book);
          if (merged.length >= 10) break;
        }
        if (merged.length >= 10) break;
      }
      setSuggestions(merged);
    }).catch(() => {/* silent fail */});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);                                                            // run once on mount

  return suggestions;
}

/** Short, stable id for a cache key (djb2) — keeps AsyncStorage keys compact. */
function shortHash(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

export function HomeScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList & MainTabParamList>>();
  const c = useColors();
  const { isDark } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => createStyles(c), [c]);
  const isWide = useIsWide();
  const { authors, books, getAuthor, getBook, overallStats, readingSessions, recommendations, userProfile } = useBookliz();
  const logoSource = isDark ? booklizLogoDark : booklizLogoLight;
  const tasteProfile = useMemo(
    () => buildUserTasteProfile({ authors, books, readingSessions, userProfile }),
    [authors, books, readingSessions, userProfile]
  );
  const libraryIndex = useMemo(() => buildLibraryIndex(books), [books]);
  const recommendationSpecs = useMemo(
    () => buildRecommendationSectionSpecs(tasteProfile),
    [tasteProfile]
  );

  const { isRunning, bookId: timerBookId, elapsedMs, start: startTimer, stop: stopTimer } = useReadingTimer();
  const continueBook = books.find((b) => b.userStatus.status === "reading") ?? null;
  const timerIsForContinue = isRunning && continueBook && timerBookId === continueBook.id;
  const goalPct = Math.min(100, Math.round((overallStats.booksReadThisYear / userProfile.yearlyGoal) * 100));
  const remaining = userProfile.yearlyGoal - overallStats.booksReadThisYear;
  const streakMsg = getStreakMessage(overallStats.currentStreak, c, t);
  const homeRecommendations = recommendations
    .map((recommendation) => ({ recommendation, book: getBook(recommendation.bookId) }))
    .filter((item): item is { recommendation: typeof recommendations[number]; book: NonNullable<ReturnType<typeof getBook>> } => Boolean(item.book))
    .slice(0, 4);
  const topLocation = overallStats.locationCounts[0]?.label ?? "—";

  // Genre suggestions — for new users who haven't filled their library yet
  const isNewUser = books.length < 8;
  // Use normalized title keys to avoid suggesting books the user already owns
  const ownedTitleKeys = useMemo(
    () => new Set(books.map((b) => b.title.trim().toLowerCase())),
    [books]
  );
  const genreSuggestions = useGenreSuggestions(
    isNewUser ? userProfile.favoriteGenres : [],
    ownedTitleKeys
  );
  const showGenreSuggestions = isNewUser && genreSuggestions.length > 0;
  const shouldShowPersonalizedDiscovery = books.length >= 3 && recommendationSpecs.length > 0;
  const [personalizedSections, setPersonalizedSections] = useState<PersonalizedRecommendationSection[]>([]);
  const [loadingPersonalized, setLoadingPersonalized] = useState(false);
  const [personalizedNetworkError, setPersonalizedNetworkError] = useState(false);

  // Stable identity of what we would fetch. `tasteProfile` is a fresh object on
  // every library/session change (logging a session, toggling a status…), which
  // used to refetch remote recommendations each time. Only the taste signals
  // that drive the queries matter here.
  const personalizedKey = useMemo(() => {
    if (!shouldShowPersonalizedDiscovery) return "";
    return JSON.stringify({
      specs: recommendationSpecs.map((spec) => `${spec.id}:${spec.query}`).sort(),
      genres: tasteProfile.topGenres.slice(0, 5).map((g) => g.genre).sort(),
      authors: tasteProfile.topAuthors.slice(0, 5).map((a) => a.author).sort(),
      series: tasteProfile.topSeries.slice(0, 3).map((s) => s.series).sort(),
      languages: tasteProfile.preferredLanguages.slice(0, 2).map((l) => l.language).sort(),
    });
  }, [recommendationSpecs, shouldShowPersonalizedDiscovery, tasteProfile]);
  // Latest inputs for the fetch, read at fetch time without re-triggering it.
  const personalizedInputsRef = useRef({ tasteProfile, libraryIndex, recommendationSpecs });
  personalizedInputsRef.current = { tasteProfile, libraryIndex, recommendationSpecs };
  const hasPersonalizedSectionsRef = useRef(false);
  hasPersonalizedSectionsRef.current = personalizedSections.length > 0;

  useEffect(() => {
    let cancelled = false;
    setPersonalizedNetworkError(false);

    if (!personalizedKey) {
      setPersonalizedSections([]);
      setLoadingPersonalized(false);
      return;
    }

    const cacheKey = `home-recs-${shortHash(personalizedKey)}`;
    const { tasteProfile: profile, libraryIndex: index, recommendationSpecs: specs } = personalizedInputsRef.current;

    const load = async () => {
      const cached = await readCache<PersonalizedRecommendationSection[]>(cacheKey, 12 * HOURS);
      if (cancelled) return;
      if (cached?.length) {
        setPersonalizedSections(cached);
        setLoadingPersonalized(false);
        return;
      }

      // Keep whatever is already on screen while refreshing — only show the
      // spinner when there is nothing to show yet.
      if (!hasPersonalizedSectionsRef.current) setLoadingPersonalized(true);

      try {
        const sections = await buildPersonalizedRecommendationSections(profile, index, {
          specs,
          fetchLimit: 40,
          booksPerSection: 5,
          minBooksPerSection: 2,
        });
        if (cancelled) return;
        const top = sections.slice(0, 2);
        setPersonalizedSections(top);
        if (top.length) void writeCache(cacheKey, top);
      } catch {
        if (cancelled) return;
        setPersonalizedSections([]);
        setPersonalizedNetworkError(true);
      } finally {
        if (!cancelled) setLoadingPersonalized(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [personalizedKey]);

  function openCatalog(query: string, title: string, browseKey?: string) {
    navigation.navigate("GenreBrowse", {
      genre: browseKey ?? title,
      title,
      catalogQuery: query,
    });
  }

  function openSuggestedBook(book: GenreBookResult) {
    navigation.navigate("BookIntake", {
      initialBookSelection: {
        title: book.title,
        authorName: book.authors[0] ?? "Unknown Author",
        isbn: book.isbn13,
        pages: book.pageCount,
        genre: book.genres,
        publishedDate: book.publishedYear ? `${book.publishedYear}-01-01` : undefined,
        language: book.language,
        synopsis: book.description,
        coverImageUri: book.coverUrl,
      },
    });
  }

  return (
    <Screen wide>
      {/* Header */}
      <View style={styles.header}>
        <Image source={logoSource} style={styles.logo} resizeMode="contain" />
        <View>
          <Text style={styles.greeting}>{getGreeting(t)},</Text>
          <Text style={styles.name}>{userProfile.name}.</Text>
        </View>
      </View>

      {/* Stats strip */}
      <View style={styles.statsStrip}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{overallStats.booksReadThisYear}</Text>
          <Text style={styles.statLabel}>{t("home.booksThisYear")}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{overallStats.pagesRead.toLocaleString()}</Text>
          <Text style={styles.statLabel}>{t("home.pagesRead")}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: c.tealDark }]}>{overallStats.currentStreak}d</Text>
          <Text style={styles.statLabel}>{t("home.currentStreak")}</Text>
        </View>
      </View>

      {/*
        On a tablet these four cards become two columns: the three small
        status cards on the left, the one card you actually act on — what you
        are reading — on the right, where it is not buried below the fold of
        a 13" screen. On a phone the wrappers are inert and the order is
        exactly what it always was.
      */}
      <View style={isWide ? styles.columns : undefined}>
        <View style={isWide ? styles.column : undefined}>
      {/* Streak card */}
      <Pressable accessibilityRole="button" style={styles.streakCard} onPress={() => navigation.navigate("ReadingLog", {})}>
        <View style={[styles.streakIconWrap, { backgroundColor: streakMsg.accent + "22" }]}>
          <Ionicons name="flame" size={22} color={streakMsg.accent} />
        </View>
        <View style={styles.streakCopy}>
          <Text style={[styles.streakHeadline, { color: streakMsg.accent === c.muted ? c.ink : streakMsg.accent }]}>
            {streakMsg.headline}
          </Text>
          <Text style={styles.streakSub}>{streakMsg.sub}</Text>
        </View>
        <Text style={[styles.streakCount, { color: streakMsg.accent }]}>
          {overallStats.currentStreak}d
        </Text>
      </Pressable>

      {/* Goal card */}
      <View style={styles.goalCard}>
        <View style={styles.goalRow}>
          <View>
            <Text style={styles.goalLabel}>{t("home.annualGoal")}</Text>
            <Text style={styles.goalTitle}>{overallStats.booksReadThisYear} / {userProfile.yearlyGoal} books</Text>
          </View>
          <Text style={styles.goalPct}>{goalPct}%</Text>
        </View>
        <View style={styles.goalTrack}>
          <View style={[styles.goalFill, { width: `${goalPct}%` }]} />
        </View>
        <Text style={styles.goalSub}>
          {remaining > 0 ? t("home.goalRemaining", { count: remaining }) : t("home.goalReached")}
        </Text>
      </View>

      {/* Collector mini */}
      <View style={styles.collectorCard}>
        <View style={styles.collectorRow}>
          <CollectorMini label={t("home.owned")} value={overallStats.ownedCount.toString()} accent={c.tealDark} styles={styles} />
          <CollectorMini label={t("home.wishlist")} value={overallStats.wishlistCount.toString()} accent={c.gold} styles={styles} />
          <CollectorMini label={t("home.wantToBuy")} value={overallStats.wantToBuyCount.toString()} accent={c.coral} styles={styles} />
        </View>
        <View style={styles.collectorMetaRow}>
          <Text style={styles.collectorMetaText}>{t("home.sagasCompleted", { count: overallStats.completedSeriesCount })}</Text>
          <Text style={styles.collectorMetaDot}>•</Text>
          <Text style={styles.collectorMetaText}>{t("home.favoritePlace", { place: topLocation })}</Text>
        </View>
      </View>

        </View>
        <View style={isWide ? styles.column : undefined}>
      {/* Continue reading */}
      {continueBook ? (
        <View style={styles.continueCard}>
          <BookCover book={continueBook} size="sm" hideProgress style={styles.continueCover} />
          <View style={styles.continueCopy}>
            <Text style={styles.sectionEyebrow}>{t("home.continueReading")}</Text>
            <Text style={styles.continueTitle}>{continueBook.title}</Text>
            <Text style={styles.continueAuthor}>{getAuthor(continueBook.authorId)?.name}</Text>
            <View style={styles.progressMini}>
              <View style={styles.progressMiniTrack}>
                <View style={[styles.progressMiniFill, { width: `${continueBook.userStatus.progressPercent}%` }]} />
              </View>
              <Text style={styles.progressMiniPct}>{continueBook.userStatus.progressPercent}%</Text>
            </View>
            <View style={styles.continueActions}>
              <Pressable accessibilityRole="button"
                style={styles.primaryButton}
                onPress={() => navigation.navigate("AddReadingSession", { bookId: continueBook.id })}
              >
                <Ionicons name="pencil" size={13} color={c.navText} style={{ marginRight: 6 }} />
                <Text style={styles.primaryButtonText}>{t("home.logSession")}</Text>
              </Pressable>
              <Pressable accessibilityRole="button"
                style={[styles.timerButton, timerIsForContinue && { backgroundColor: c.coral + "22", borderColor: c.coral }]}
                onPress={() => {
                  if (timerIsForContinue) {
                    const mins = stopTimer();
                    navigation.navigate("AddReadingSession", { bookId: continueBook.id, prefillMinutes: mins });
                  } else {
                    startTimer(continueBook.id);
                  }
                }}
              >
                <Ionicons
                  name={timerIsForContinue ? "stop-circle" : "timer-outline"}
                  size={15}
                  color={timerIsForContinue ? c.coral : c.ink}
                />
                <Text style={[styles.timerButtonText, timerIsForContinue && { color: c.coral }]}>
                  {timerIsForContinue ? formatElapsed(elapsedMs) : "Timer"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : (
        <Pressable accessibilityRole="button" style={styles.emptyCard} onPress={() => navigation.navigate("Add")}>
          <Ionicons name="book-outline" size={28} color={c.teal} />
          <Text style={styles.emptyTitle}>{t("home.whatReading")}</Text>
          <Text style={styles.emptySubtitle}>{t("home.addFirstBook")}</Text>
        </Pressable>
      )}
        </View>
      </View>

      {loadingPersonalized ? (
        <View style={styles.personalizedLoading}>
          <ActivityIndicator size="small" color={c.teal} />
        </View>
      ) : personalizedNetworkError ? (
        <View style={styles.personalizedNetworkError}>
          <Ionicons name="wifi-outline" size={20} color={c.muted} />
          <Text style={styles.personalizedNetworkErrorText}>
            Connection lost. Please check your internet and try again.
          </Text>
        </View>
      ) : personalizedSections.length > 0 ? (
        <>
          <SectionHeader
            title="Picked for you"
            actionLabel="Open Discover"
            onAction={() => navigation.navigate("Discover")}
          />
          {personalizedSections.map((section) => (
            <View key={section.id} style={styles.personalizedBlock}>
              <View style={styles.personalizedHeaderRow}>
                <View style={styles.personalizedHeaderCopy}>
                  <Text style={styles.personalizedSectionTitle}>{section.title}</Text>
                  <Text style={styles.personalizedSectionSubtitle}>{section.subtitle}</Text>
                </View>
                <Pressable accessibilityRole="button"
                  onPress={() => openCatalog(
                    section.query,
                    section.title,
                    section.focusGenre ?? section.focusAuthor ?? section.focusSeries
                  )}
                >
                  <Text style={styles.personalizedSectionAction}>Browse</Text>
                </Pressable>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.personalizedRail}
                contentContainerStyle={styles.personalizedRailContent}
              >
                {[...new Map(section.books.map((b) => [b.id, b])).values()].map((book) => (
                  <CatalogBookCard
                    key={`${section.id}-${book.id}`}
                    book={book}
                    onPress={openSuggestedBook}
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
      ) : null}

      {/* Genre-based suggestions — shown for new users based on onboarding genres */}
      {showGenreSuggestions ? (
        <>
          <SectionHeader
            title="Based on your interests"
            actionLabel="Browse"
            onAction={() =>
              navigation.navigate("GenreBrowse", { genre: userProfile.favoriteGenres[0]! })
            }
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.genreRailContent}
            style={styles.genreRail}
          >
            {genreSuggestions.map((book) => (
              <CatalogBookCard
                key={book.googleBooksId}
                book={book}
                onPress={() =>
                  navigation.navigate("GenreBrowse", {
                    genre: userProfile.favoriteGenres[0]!,
                  })
                }
                cardStyle={styles.genreCard}
                coverStyle={styles.genreCover}
                titleStyle={styles.genreCardTitle}
                authorStyle={styles.genreCardAuthor}
              />
            ))}
          </ScrollView>
        </>
      ) : null}

      {/* Library-based recommendations */}
      {homeRecommendations.length > 0 ? (
        <>
          <SectionHeader title={t("home.recommended")} />
          <View style={styles.recommendationRail}>
            {homeRecommendations.map(({ recommendation, book }) => (
              <RecommendationCard
                key={recommendation.id}
                authorName={getAuthor(book.authorId)?.name ?? ""}
                book={book}
                compact
                recommendation={recommendation}
                onPress={() => navigation.navigate("BookDetail", { bookId: book.id })}
              />
            ))}
          </View>
        </>
      ) : null}

      {/* Recent sessions */}
      {readingSessions.length > 0 ? (
        <>
          <SectionHeader
            title={t("home.recentSessions")}
            actionLabel={t("home.viewAll")}
            onAction={() => navigation.navigate("ReadingLog", {})}
          />
          {readingSessions.slice(0, 3).map((session) => (
            <SessionRow
              key={session.id}
              bookTitle={getBook(session.bookId)?.title ?? "Unknown book"}
              session={session}
              onPress={() => navigation.navigate("AddReadingSession", { bookId: session.bookId, sessionId: session.id })}
            />
          ))}
        </>
      ) : null}
    </Screen>
  );
}

function CollectorMini({ label, value, accent, styles }: {
  label: string; value: string; accent: string;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.collectorMiniWrap}>
      <Text style={[styles.collectorMiniValue, { color: accent }]}>{value}</Text>
      <Text style={styles.collectorMiniLabel}>{label}</Text>
    </View>
  );
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    /** Side-by-side card columns, wide windows only. */
    columns: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: spacing.md,
    },
    column: {
      flex: 1,
    },
    header: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    logo: { height: 48, width: 48 },
    greeting: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 14,
      fontWeight: "800",
    },
    name: {
      color: c.ink,
      fontFamily: fonts.display,
      fontSize: 22,
      fontWeight: "900",
      lineHeight: 26,
    },
    statsStrip: {
      ...shadows.card,
      alignItems: "center",
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: radii.lg,
      borderWidth: 1,
      flexDirection: "row",
      marginBottom: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    statItem: { alignItems: "center", flex: 1 },
    statValue: {
      color: c.ink,
      fontFamily: fonts.display,
      fontSize: 22,
      fontWeight: "900",
    },
    statLabel: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 11,
      fontWeight: "800",
      marginTop: 2,
      textAlign: "center",
    },
    statDivider: { backgroundColor: c.border, height: 32, width: 1 },
    streakCard: {
      ...shadows.card,
      alignItems: "center",
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: radii.lg,
      borderWidth: 1,
      flexDirection: "row",
      gap: spacing.md,
      marginBottom: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    streakIconWrap: {
      alignItems: "center",
      borderRadius: 20,
      height: 40,
      justifyContent: "center",
      width: 40,
    },
    streakCopy: { flex: 1 },
    streakHeadline: { fontFamily: fonts.body, fontSize: 14, fontWeight: "900" },
    streakSub: { color: c.muted, fontFamily: fonts.body, fontSize: 12, marginTop: 2 },
    streakCount: { fontFamily: fonts.display, fontSize: 22, fontWeight: "900" },
    goalCard: {
      ...shadows.card,
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: radii.lg,
      borderWidth: 1,
      marginBottom: spacing.md,
      padding: spacing.md,
    },
    goalRow: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" },
    goalLabel: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1,
      textTransform: "uppercase",
    },
    goalTitle: { color: c.ink, fontFamily: fonts.display, fontSize: 20, fontWeight: "900", marginTop: 2 },
    goalPct: { color: c.green, fontFamily: fonts.display, fontSize: 22, fontWeight: "900" },
    goalTrack: {
      backgroundColor: c.border,
      borderRadius: radii.pill,
      height: 10,
      marginTop: spacing.sm,
      overflow: "hidden",
    },
    goalFill: { backgroundColor: c.green, borderRadius: radii.pill, height: "100%" },
    goalSub: { color: c.muted, fontFamily: fonts.body, fontSize: 12, marginTop: spacing.xs },
    collectorCard: {
      ...shadows.card,
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: radii.lg,
      borderWidth: 1,
      marginBottom: spacing.md,
      padding: spacing.md,
    },
    collectorRow: { flexDirection: "row", gap: spacing.sm },
    collectorMiniWrap: { flex: 1 },
    collectorMiniValue: { fontFamily: fonts.display, fontSize: 24, fontWeight: "900" },
    collectorMiniLabel: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 11,
      fontWeight: "800",
      marginTop: 2,
      textTransform: "uppercase",
    },
    collectorMetaRow: { alignItems: "center", flexDirection: "row", marginTop: spacing.sm },
    collectorMetaText: { color: c.muted, fontFamily: fonts.body, fontSize: 12, fontWeight: "800" },
    collectorMetaDot: { color: c.border, marginHorizontal: 8 },
    continueCard: {
      ...shadows.card,
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: radii.lg,
      borderWidth: 1,
      flexDirection: "row",
      gap: spacing.md,
      marginBottom: spacing.md,
      padding: spacing.md,
    },
    continueCopy: { flex: 1 },
    continueCover: { width: 96, height: 142, marginTop: 2 },
    sectionEyebrow: {
      color: c.gold,
      fontFamily: fonts.body,
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 1,
      textTransform: "uppercase",
    },
    continueTitle: {
      color: c.ink,
      fontFamily: fonts.display,
      fontSize: 20,
      fontWeight: "900",
      lineHeight: 24,
      marginTop: 4,
    },
    continueAuthor: { color: c.muted, fontFamily: fonts.body, fontSize: 13, fontWeight: "800", marginTop: 4 },
    progressMini: { alignItems: "center", flexDirection: "row", gap: spacing.xs, marginTop: spacing.sm },
    progressMiniTrack: {
      backgroundColor: c.border,
      borderRadius: radii.pill,
      flex: 1,
      height: 6,
      overflow: "hidden",
    },
    progressMiniFill: { backgroundColor: c.teal, borderRadius: radii.pill, height: "100%" },
    progressMiniPct: { color: c.muted, fontFamily: fonts.body, fontSize: 11, fontWeight: "800" },
    primaryButton: {
      alignItems: "center",
      backgroundColor: c.navy,
      borderRadius: radii.pill,
      flex: 1,
      flexDirection: "row",
      justifyContent: "center",
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
    },
    primaryButtonText: { color: "#FFFFFF", fontFamily: fonts.body, fontSize: 12, fontWeight: "900" },
    continueActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
    timerButton: {
      alignItems: "center",
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: radii.pill,
      borderWidth: 1,
      flexDirection: "row",
      gap: 5,
      paddingHorizontal: spacing.sm,
      paddingVertical: 10,
    },
    timerButtonText: { color: c.ink, fontFamily: fonts.body, fontSize: 12, fontWeight: "900" },
    emptyCard: {
      alignItems: "center",
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: radii.lg,
      borderStyle: "dashed",
      borderWidth: 1,
      gap: spacing.xs,
      marginBottom: spacing.md,
      padding: spacing.xl,
    },
    emptyTitle: { color: c.ink, fontFamily: fonts.display, fontSize: 18, fontWeight: "900", marginTop: spacing.xs },
    emptySubtitle: { color: c.muted, fontFamily: fonts.body, fontSize: 13, textAlign: "center" },
    personalizedLoading: {
      alignItems: "center",
      justifyContent: "center",
      marginBottom: spacing.md,
      minHeight: 72,
    },
    personalizedNetworkError: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm,
      marginBottom: spacing.lg,
      paddingHorizontal: spacing.xs,
    },
    personalizedNetworkErrorText: {
      color: c.muted,
      flex: 1,
      fontFamily: fonts.bodyRegular,
      fontSize: 13,
      lineHeight: 18,
    },
    personalizedBlock: { marginBottom: spacing.md },
    personalizedHeaderRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: spacing.sm,
    },
    personalizedHeaderCopy: {
      flex: 1,
      paddingRight: spacing.sm,
    },
    personalizedSectionTitle: {
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 15,
      fontWeight: "900",
    },
    personalizedSectionSubtitle: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 12,
      marginTop: 2,
    },
    personalizedSectionAction: {
      color: c.gold,
      fontFamily: fonts.body,
      fontSize: 12,
      fontWeight: "900",
    },
    personalizedRail: { marginBottom: spacing.xs },
    personalizedRailContent: { gap: spacing.sm, paddingRight: spacing.md },
    personalizedCard: { width: 118 },
    personalizedCover: {
      backgroundColor: c.border,
      borderRadius: radii.md,
      height: 172,
      marginBottom: spacing.xs,
      width: 118,
    },
    personalizedCardTitle: {
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 12,
      fontWeight: "800",
      lineHeight: 16,
    },
    personalizedCardAuthor: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 11,
      marginTop: 2,
    },
    personalizedCardMeta: {
      color: c.gold,
      fontFamily: fonts.body,
      fontSize: 11,
      fontWeight: "800",
      marginTop: 4,
    },
    recommendationRail: { marginBottom: spacing.md },
    genreRail: { marginBottom: spacing.md },
    genreRailContent: { gap: spacing.sm, paddingRight: spacing.md },
    genreCard: {
      width: 110,
    },
    genreCover: {
      borderRadius: radii.md,
      height: 160,
      width: 110,
      marginBottom: spacing.xs,
    },
    genreCardTitle: {
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 12,
      fontWeight: "800",
      lineHeight: 16,
    },
    genreCardAuthor: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 11,
      marginTop: 2,
    },
  });
}
