/**
 * BookDetailScreen — Premium redesign
 * Design: full-bleed cover hero + floating actions + immersive dark gradient
 */
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  ImageBackground,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BookCover } from "../components/BookCover";
import { ScalePressable } from "../components/ScalePressable";
import { RecommendationCard } from "../components/RecommendationCard";
import { wantsToAcquire } from "../data/shelfRules";
import { BookStatusSheet } from "../components/BookStatusSheet";
import { BookListSheet } from "../components/BookListSheet";
import { SessionRow } from "../components/SessionRow";
import { useDialog } from "../components/DialogProvider";
import { useBookliz } from "../data/BooklizContext";
import { BarChart } from "../components/BarChart";
import {
  addWeeks,
  isCurrentWeek,
  latestWeekWithReading,
  pagesPerDay,
  weekRangeLabel,
} from "../utils/readingWeek";
import { useReadingTimer } from "../data/ReadingTimerContext";
import { RootStackParamList } from "../navigation/types";
import { AppColors, fonts, radii, shadows, spacing } from "../theme/theme";
import { useTheme } from "../theme/ThemeContext";
import { useI18n } from "../i18n/LocalizationContext";
import { hapticLight, hapticMedium } from "../utils/haptics";
import { isPlaceholderText, resolveBookMetadata } from "../utils/bookMetadata";
import { isSameLanguage } from "../utils/languageUtils";
import { statusLabelKey } from "../utils/statusLabels";

function cleanGenres(raw: string[]): string[] {
  return raw
    .filter((g) => !/^nyt:/i.test(g))
    .filter((g) => !/new york times/i.test(g))
    .map((g) => g.replace(/\b\w/g, (ch) => ch.toUpperCase()).trim())
    .filter((g, i, arr) => arr.indexOf(g) === i)
    .slice(0, 4);
}

export function BookDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "BookDetail">>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors: c, isDark } = useTheme();
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(c, isDark), [c, isDark]);

  const {
    deleteBook, getAuthor, getBook, getBookStats,
    getRecommendationsForBook, updateBookStatus, updateBookSynopsis, getReviewForBook,
    getSessionsForBook,
  } = useBookliz();
  const dialog = useDialog();

  const { isRunning, bookId: timerBookId, start: startTimer, stop: stopTimer } = useReadingTimer();
  const book = getBook(route.params.bookId);
  const [synopsisExpanded, setSynopsisExpanded] = useState(false);
  const [statusSheetOpen, setStatusSheetOpen] = useState(false);
  const [listSheetOpen, setListSheetOpen] = useState(false);
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  const [isFetchingSynopsis, setIsFetchingSynopsis] = useState(false);
  const [synopsisFetchFailed, setSynopsisFetchFailed] = useState(false);
  // Parallax: hero drifts at ~45% scroll speed and zooms slightly on pull-down
  const scrollY = useState(() => new Animated.Value(0))[0];

  if (!book) {
    return (
      <View style={[styles.notFound, { paddingTop: insets.top + 16 }]}>
        <Ionicons name="book-outline" size={40} color={c.muted} />
        <Text style={styles.notFoundText}>{t("bookDetail.notFound")}</Text>
      </View>
    );
  }

  const author = getAuthor(book.authorId);
  const stats = getBookStats(book.id);
  const review = getReviewForBook(route.params.bookId);
  const hasOpinion = Boolean(review) || typeof book?.userStatus.rating === "number";
  const genres = cleanGenres(book.genre);
  const isReading = book.userStatus.status === "reading";
  const isDone = book.userStatus.status === "read";
  const isDnf = book.userStatus.status === "dnf";
  // "Still to acquire" is an ownership question, not a reading-status one.
  // This used to be `!isReading && !isDone && !isDnf`, which made every owned
  // book the reader had not started yet look unacquired — the "Get on Amazon"
  // action showed for a book already on their shelf.
  const needsAcquiring = wantsToAcquire(book.userStatus);
  const isOwned = book.userStatus.ownership === "owned";
  const hasSessions = stats.totalSessions > 0;

  // Pages per day for this book, one week at a time. Opens on the week of the
  // last session rather than on today's: a book you finished in March has
  // nothing to show in the current week, and an empty chart looks like a bug.
  const bookSessions = useMemo(() => getSessionsForBook(route.params.bookId), [getSessionsForBook, route.params.bookId]);
  const [weekStart, setWeekStart] = useState(() => latestWeekWithReading(bookSessions, new Date()));
  const atCurrentWeek = isCurrentWeek(weekStart);
  const weekChartData = useMemo(
    () => pagesPerDay(bookSessions, weekStart).map((bucket) => ({
      label: bucket.date.toLocaleDateString(locale, { weekday: "short", day: "numeric" }),
      value: bucket.pages,
    })),
    [bookSessions, weekStart, locale]
  );
  const statusLabel = t(statusLabelKey(book.userStatus.status));

  const primaryAction = (() => {
    if (isReading) return { label: t("bookDetail.logSession"), icon: "pencil" as const, onPress: () => navigation.navigate("AddReadingSession", { bookId: book.id }) };
    if (isDone)    return { label: t("bookDetail.reRead"), icon: "refresh-outline" as const, onPress: () => setStatusSheetOpen(true) };
    if (isDnf)     return { label: t("bookDetail.tryAgain"), icon: "refresh-outline" as const, onPress: () => setStatusSheetOpen(true) };
    return { label: t("bookDetail.startReading"), icon: "book-outline" as const, onPress: () => updateBookStatus(book.id, "reading", book.userStatus.rating) };
  })();

  const handleBuy = () => {
    const raw = book.isbn?.replace(/[^0-9X]/gi, "") ?? "";
    let asin: string | null = null;
    if (raw.length === 10) {
      asin = raw;
    } else if (raw.length === 13 && raw.startsWith("978")) {
      const nine = raw.slice(3, 12);
      let sum = 0;
      for (let i = 0; i < 9; i++) sum += parseInt(nine[i]) * (10 - i);
      const check = (11 - (sum % 11)) % 11;
      asin = nine + (check === 10 ? "X" : String(check));
    }
    const authorName = author?.name ?? "";
    const url = asin
      ? `https://www.amazon.com/dp/${asin}?tag=bookliz-20`
      : raw.length > 0
        ? `https://www.amazon.com/s?k=${raw}&tag=bookliz-20`
        : `https://www.amazon.com/s?k=${encodeURIComponent(`${book.title} ${authorName}`)}&tag=bookliz-20`;
    void Linking.openURL(url);
  };

  const relatedRecs = getRecommendationsForBook(book.id, 4)
    .map((rec) => ({ rec, recBook: getBook(rec.bookId) }))
    .filter((item): item is { rec: (typeof item)["rec"]; recBook: NonNullable<ReturnType<typeof getBook>> } =>
      Boolean(item.recBook)
    );

  const [gradTop, gradBot] = book.coverGradient;

  const HeroInner = (
    <LinearGradient
      colors={
        isDark
          ? ["rgba(17,24,39,0.10)", "rgba(17,24,39,0.62)", c.bg]
          : ["rgba(252,248,241,0.10)", "rgba(252,248,241,0.62)", c.bg]
      }
      style={styles.heroGradient}
    >
      <BookCover book={book} size="lg" style={styles.heroCoverFloat} hideProgress />
      <Text numberOfLines={3} style={styles.heroTitle}>{book.title}</Text>
      <Text numberOfLines={2} style={styles.heroAuthor}>
        {[
          author?.name,
          ...(book.coAuthorIds?.length
            ? book.coAuthorIds.map((id) => getAuthor(id)?.name)
            : book.coAuthorNames ?? []),
        ].filter(Boolean).join(" & ")}
      </Text>
      {book.seriesName ? (
        <Pressable accessibilityRole="button"
          onPress={() => book.seriesId && navigation.navigate("SeriesTracker", { seriesId: book.seriesId! })}
          style={styles.heroSeriesBtn}
        >
          <Ionicons name="layers-outline" size={12} color={c.tealDark} style={{ marginRight: 4 }} />
          <Text style={styles.heroSeries}>
            {book.seriesName}{book.seriesNumber ? ` · ${t("bookDetail.seriesBookN", { number: book.seriesNumber })}` : ""}
          </Text>
        </Pressable>
      ) : null}
      <Pressable accessibilityRole="button" style={styles.heroStatusPill} onPress={() => setStatusSheetOpen(true)}>
        <View style={[styles.heroStatusDot, {
          backgroundColor:
            book.userStatus.status === "read" ? "#7FB069"
            : book.userStatus.status === "reading" ? "#14B8A6"
            : book.userStatus.status === "dnf" ? "#D95D47"
            : "#FFC857",
        }]} />
        <Text style={styles.heroStatusText}>{statusLabel}</Text>
        {book.userStatus.rating ? (
          <>
            <Text style={styles.heroStatusSep}>·</Text>
            <Ionicons name="star" size={11} color={c.gold} />
            <Text style={styles.heroRating}>{book.userStatus.rating}</Text>
          </>
        ) : null}
        <Ionicons name="chevron-down" size={12} color={c.muted} style={{ marginLeft: 4 }} />
      </Pressable>
    </LinearGradient>
  );

  return (
    <View style={styles.root}>
      <Animated.ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
      >
        {/* ── HERO ─────────────────────────────────────────────────────────── */}
        <Animated.View
          style={{
            transform: [
              {
                translateY: scrollY.interpolate({
                  inputRange: [-1, 0, 1],
                  outputRange: [-0.55, 0, 0.45], // pull-down stretch, scroll-up drift
                }),
              },
              {
                scale: scrollY.interpolate({
                  inputRange: [-300, 0],
                  outputRange: [1.25, 1],
                  extrapolateRight: "clamp",
                }),
              },
            ],
          }}
        >
        {book.coverImageUri ? (
          <ImageBackground
            source={{ uri: book.coverImageUri.replace(/zoom=1(?=&|$)/, "zoom=0") }}
            style={[styles.hero, { paddingTop: insets.top + 52 }]}
            imageStyle={styles.heroImageStyle}
            blurRadius={26}
          >
            {HeroInner}
          </ImageBackground>
        ) : (
          <LinearGradient
            colors={[gradTop, gradBot, c.bg]}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={[styles.hero, { paddingTop: insets.top + 52 }]}
          >
            {HeroInner}
          </LinearGradient>
        )}
        </Animated.View>

        {/* ── ACTION ROW ───────────────────────────────────────────────────── */}
        <View style={[styles.actionRow, { zIndex: 2 }]}>
          <ScalePressable accessibilityRole="button"
            pressScale={0.97}
            style={[styles.primaryBtn, { backgroundColor: c.teal }]}
            onPress={() => { hapticMedium(); primaryAction.onPress(); }}
          >
            <Ionicons name={primaryAction.icon} size={16} color="#fff" />
            <Text style={styles.primaryBtnText}>{primaryAction.label}</Text>
          </ScalePressable>
          <Pressable
            style={styles.iconBtn}
            onPress={() => navigation.navigate("WriteReview", { bookId: book.id })}
            accessibilityRole="button"
            accessibilityLabel={review ? t("a11y.editReview") : t("a11y.writeReview")}
          >
            {/* Filled when the reader has said anything about the book — a
                rating counts, not only a written review. */}
            <Ionicons
              name={hasOpinion ? "star" : "star-outline"}
              size={20}
              color={hasOpinion ? c.gold : c.ink}
            />
          </Pressable>
          {/* Timer button */}
          <Pressable
            style={[styles.iconBtn, isRunning && timerBookId === book.id && { backgroundColor: c.coral + "22", borderColor: c.coral }]}
            accessibilityRole="button"
            accessibilityLabel={isRunning && timerBookId === book.id ? t("a11y.stopTimer") : t("a11y.startTimer")}
            onPress={() => {
              hapticLight();
              if (isRunning && timerBookId === book.id) {
                const minutes = stopTimer();
                navigation.navigate("AddReadingSession", { bookId: book.id, prefillMinutes: minutes });
              } else {
                startTimer(book.id);
              }
            }}
          >
            <Ionicons
              name={isRunning && timerBookId === book.id ? "stop-circle" : "timer-outline"}
              size={20}
              color={isRunning && timerBookId === book.id ? c.coral : c.ink}
            />
          </Pressable>
          {/* Everything else lives in the "more" sheet — keeps the row breathable */}
          <Pressable
            style={styles.iconBtn}
            onPress={() => setMoreSheetOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t("a11y.more")}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={c.ink} />
          </Pressable>
        </View>

        {/* ── PROGRESS ─────────────────────────────────────────────────────── */}
        {(isReading || isDone) ? (
          <View style={[styles.card, { marginTop: spacing.md }]}>
            <View style={styles.progressTopRow}>
              <Text style={styles.eyebrow}>{isReading ? t("bookDetail.readingNow") : t("bookDetail.completed")}</Text>
              <Text style={[styles.progressPct, { color: isReading ? c.teal : c.green }]}>
                {book.userStatus.progressPercent}%
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, {
                width: `${book.userStatus.progressPercent}%`,
                backgroundColor: isReading ? c.teal : c.green,
              }]} />
            </View>
            <View style={styles.progressDates}>
              {book.userStatus.startDate ? <Text style={styles.mutedSm}>{t("bookDetail.started")} {book.userStatus.startDate}</Text> : null}
              {book.userStatus.finishDate ? <Text style={styles.mutedSm}>{t("bookDetail.finished")} {book.userStatus.finishDate}</Text> : null}
            </View>
          </View>
        ) : null}

        {/* ── STATS ────────────────────────────────────────────────────────── */}
        {hasSessions ? (
          <View style={[styles.statsStrip, { marginTop: spacing.sm }]}>
            <StatBox label={t("bookDetail.statSessions")} value={String(stats.totalSessions)} accent={c.teal} styles={styles} />
            <View style={styles.statDivider} />
            <StatBox label={t("bookDetail.statPagesLogged")} value={String(stats.totalPages)} accent={c.gold} styles={styles} />
            <View style={styles.statDivider} />
            <StatBox label={t("bookDetail.statPpH")} value={String(stats.averageSpeed)} accent={c.coral} styles={styles} />
            <View style={styles.statDivider} />
            <StatBox label={t("bookDetail.timesRead")} value={String(book.userStatus.readCount ?? 0)} accent={c.green} styles={styles} />
          </View>
        ) : null}

        {/* ── COLLECTOR ROW ────────────────────────────────────────────────── */}
        <View style={[styles.collectorRow, { marginTop: spacing.sm }]}>
          <CollectorChip icon="trophy-outline" label={t("bookDetail.rank")} value={book.userStatus.personalRanking ? `#${book.userStatus.personalRanking}` : "—"} styles={styles} c={c} />
          <CollectorChip icon="chatbubble-ellipses-outline" label={t("bookDetail.quotes")} value={String(book.userStatus.favoriteQuotes.length)} styles={styles} c={c} />
          {/* Ownership had no indicator anywhere on this screen: the only way
              to see it was to open the status sheet. */}
          <CollectorChip icon={isOwned ? "checkmark-circle-outline" : "ellipse-outline"} label={t("bookDetail.chipOwnership")} value={isOwned ? t("bookDetail.chipOwned") : t("bookDetail.chipNotOwned")} styles={styles} c={c} />
          <CollectorChip icon="pricetag-outline" label={t("bookDetail.labelFormat")} value={book.format.charAt(0).toUpperCase() + book.format.slice(1).replace(/-/g, " ")} styles={styles} c={c} />
          {book.pages ? <CollectorChip icon="document-text-outline" label={t("bookDetail.labelPages")} value={String(book.pages)} styles={styles} c={c} /> : null}
        </View>

        {/* ── SYNOPSIS ─────────────────────────────────────────────────────── */}
        {book.synopsis && !isPlaceholderText(book.synopsis) ? (
          <View style={[styles.card, { marginTop: spacing.md }]}>
            <Text style={styles.eyebrow}>{t("bookDetail.synopsis")}</Text>
            <Pressable accessibilityRole="button" onPress={() => setSynopsisExpanded((v) => !v)}>
              <Text style={styles.synopsisText} numberOfLines={synopsisExpanded ? undefined : 4}>
                {book.synopsis}
              </Text>
              <Text style={styles.synopsisToggle}>{synopsisExpanded ? t("bookDetail.showLess") : t("bookDetail.readMore")}</Text>
            </Pressable>
          </View>
        ) : (
          /* No synopsis on this edition — offer a one-tap metadata lookup */
          <View style={[styles.card, { marginTop: spacing.md }]}>
            <Text style={styles.eyebrow}>{t("bookDetail.synopsis")}</Text>
            <Text style={styles.synopsisMissing}>
              {synopsisFetchFailed ? t("bookDetail.synopsisNotFound") : t("bookDetail.noSynopsis")}
            </Text>
            {!synopsisFetchFailed ? (
              <Pressable accessibilityRole="button"
                style={styles.findSynopsisBtn}
                disabled={isFetchingSynopsis}
                onPress={async () => {
                  setIsFetchingSynopsis(true);
                  try {
                    const meta = await resolveBookMetadata({
                      isbn: book.isbn || undefined,
                      title: book.title,
                      authorName: author?.name,
                      language: book.language || undefined, // synopsis in the book's language
                    });
                    // STRICT: only accept a synopsis in the book's own language.
                    const langOk = !book.language ||
                      Boolean(meta?.language && isSameLanguage(meta.language, book.language));
                    if (meta?.synopsis && !isPlaceholderText(meta.synopsis) && langOk) {
                      updateBookSynopsis(book.id, meta.synopsis);
                    } else {
                      setSynopsisFetchFailed(true);
                    }
                  } catch {
                    setSynopsisFetchFailed(true);
                  } finally {
                    setIsFetchingSynopsis(false);
                  }
                }}
              >
                {isFetchingSynopsis ? (
                  <ActivityIndicator size="small" color={c.tealDark} />
                ) : (
                  <Ionicons name="sparkles-outline" size={14} color={c.tealDark} />
                )}
                <Text style={styles.findSynopsisText}>
                  {isFetchingSynopsis ? t("bookDetail.findingSynopsis") : t("bookDetail.findSynopsis")}
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}

        {/* ── GENRE / META CHIPS ───────────────────────────────────────────── */}
        <View style={[styles.metaChipRow, { marginTop: spacing.sm }]}>
          {genres.map((g) => (
            <View key={g} style={[styles.metaChip, { backgroundColor: c.teal + "22", borderColor: c.teal + "44" }]}>
              <Text style={[styles.metaChipText, { color: c.teal }]}>{g}</Text>
            </View>
          ))}
          {book.publishedDate ? (
            <View style={styles.metaChip}><Text style={styles.metaChipText}>{book.publishedDate.slice(0, 4)}</Text></View>
          ) : null}
          {book.isBestseller ? (
            <View style={[styles.metaChip, { backgroundColor: c.gold + "22", borderColor: c.gold + "55" }]}>
              <Ionicons name="star" size={10} color={c.gold} style={{ marginRight: 3 }} />
              <Text style={[styles.metaChipText, { color: c.gold }]}>{t("bookDetail.bestseller")}</Text>
            </View>
          ) : null}
          {book.tags?.map((tag) => (
            <View key={tag} style={styles.metaChip}><Text style={styles.metaChipText}>{tag}</Text></View>
          ))}
        </View>

        {/* ── D: AUTHOR CARD ───────────────────────────────────────────────── */}
        {author ? (
          <View style={[styles.sectionBlock, { marginTop: spacing.lg }]}>
            <Text style={styles.sectionTitle}>{t("bookDetail.author")}</Text>
            <Pressable accessibilityRole="button"
              style={[styles.authorCard, { marginTop: spacing.sm }]}
              onPress={() => navigation.navigate("AuthorBooks", { authorId: book.authorId, authorName: author.name })}
            >
              <View style={styles.authorAvatar}>
                <Ionicons name="person" size={22} color={c.muted} />
              </View>
              <View style={styles.authorInfo}>
                <Text style={styles.authorName}>{author.name}</Text>
                <Text style={styles.authorSub}>{t("bookDetail.viewAllByAuthor")}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={c.muted} />
            </Pressable>
          </View>
        ) : null}

        {/* ── REVIEW ───────────────────────────────────────────────────────── */}
        <View style={[styles.sectionBlock, { marginTop: spacing.lg }]}>
          <View style={styles.sectionBlockHeader}>
            <Text style={styles.sectionTitle}>{t("bookDetail.yourReview")}</Text>
            <Pressable accessibilityRole="button" onPress={() => navigation.navigate("WriteReview", { bookId: book.id })}>
              <Text style={styles.sectionAction}>{review ? t("bookDetail.edit") : t("bookDetail.write")}</Text>
            </Pressable>
          </View>
          {review ? (
            <Pressable accessibilityRole="button" style={styles.card} onPress={() => navigation.navigate("WriteReview", { bookId: book.id })}>
              <View style={styles.reviewStars}>
                {[1,2,3,4,5].map((n) => (
                  <Ionicons key={n} name={n <= review.rating ? "star" : "star-outline"} size={16} color={n <= review.rating ? c.gold : c.border} />
                ))}
                <Text style={[styles.mutedSm, { marginLeft: spacing.sm }]}>{review.createdAt}</Text>
              </View>
              {review.title ? <Text style={styles.reviewTitle}>{review.title}</Text> : null}
              {review.body ? <Text style={styles.reviewBody} numberOfLines={4}>{review.body}</Text> : null}
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" style={styles.reviewEmpty} onPress={() => navigation.navigate("WriteReview", { bookId: book.id })}>
              <Ionicons name="create-outline" size={22} color={c.muted} />
              <Text style={styles.reviewEmptyText}>{t("bookDetail.noReviewYet")}</Text>
            </Pressable>
          )}
        </View>

        {/* ── PAGES PER DAY ────────────────────────────────────────────────
            The library-wide charts never answered "how did THIS book go?",
            which is the question you have while looking at it. Horizontal
            bars rather than the vertical ones a phone usually shows: it is
            the chart the rest of the app already uses, and one chart the
            reader has learned beats two they have to learn. */}
        {hasSessions ? (
          <View style={[styles.sectionBlock, { marginTop: spacing.lg }]}>
            <View style={styles.sectionBlockHeader}>
              <Text style={styles.sectionTitle}>{t("bookDetail.pagesPerDay")}</Text>
              <View style={styles.weekNav}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("bookDetail.previousWeek")}
                  hitSlop={8}
                  onPress={() => setWeekStart((current) => addWeeks(current, -1))}
                >
                  <Ionicons name="chevron-back" size={18} color={c.tealDark} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("bookDetail.nextWeek")}
                  hitSlop={8}
                  disabled={atCurrentWeek}
                  onPress={() => setWeekStart((current) => addWeeks(current, 1))}
                >
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={atCurrentWeek ? c.border : c.tealDark}
                  />
                </Pressable>
              </View>
            </View>
            <Text style={styles.weekRange}>{weekRangeLabel(weekStart, locale)}</Text>
            <BarChart data={weekChartData} />
          </View>
        ) : null}

        {/* ── SESSIONS ─────────────────────────────────────────────────────── */}
        {hasSessions ? (
          <View style={[styles.sectionBlock, { marginTop: spacing.lg }]}>
            <View style={styles.sectionBlockHeader}>
              <Text style={styles.sectionTitle}>{t("bookDetail.readingSessions")}</Text>
              <Pressable accessibilityRole="button" onPress={() => navigation.navigate("ReadingLog", { bookId: book.id })}>
                <Text style={styles.sectionAction}>{t("bookDetail.all")}</Text>
              </Pressable>
            </View>
            {stats.latestSessions.slice(0, 3).map((session) => (
              <SessionRow
                key={session.id}
                bookTitle={book.title}
                session={session}
                onPress={() => navigation.navigate("AddReadingSession", { bookId: book.id, sessionId: session.id })}
              />
            ))}
          </View>
        ) : null}

        {/* ── NOTES ────────────────────────────────────────────────────────── */}
        {book.userStatus.notes && !/^Added through the .* flow\.$/.test(book.userStatus.notes.trim()) ? (
          <View style={[styles.sectionBlock, { marginTop: spacing.lg }]}>
            <View style={styles.sectionBlockHeader}>
              <Text style={styles.sectionTitle}>{t("bookDetail.yourNotes")}</Text>
              <Pressable accessibilityRole="button" onPress={() => navigation.navigate("EditBook", { bookId: book.id })}>
                <Text style={styles.sectionAction}>{t("bookDetail.edit")}</Text>
              </Pressable>
            </View>
            <View style={styles.card}>
              <Text style={styles.notesText}>{book.userStatus.notes}</Text>
            </View>
          </View>
        ) : null}

        {/* ── QUOTES ───────────────────────────────────────────────────────── */}
        {book.userStatus.favoriteQuotes.length > 0 ? (
          <View style={[styles.sectionBlock, { marginTop: spacing.lg }]}>
            <View style={styles.sectionBlockHeader}>
              <Text style={styles.sectionTitle}>{t("bookDetail.favouriteQuotes")}</Text>
              <Pressable accessibilityRole="button" onPress={() => navigation.navigate("EditBook", { bookId: book.id })}>
                <Text style={styles.sectionAction}>{t("bookDetail.edit")}</Text>
              </Pressable>
            </View>
            <View style={{ gap: spacing.sm }}>
              {book.userStatus.favoriteQuotes.map((quote, i) => (
                <View key={i} style={styles.quoteCard}>
                  <Ionicons name="chatbubble-ellipses-outline" size={18} color={c.gold} style={styles.quoteIcon} />
                  <Text style={styles.quoteText}>{quote}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* ── B: ABOUT THIS EDITION ────────────────────────────────────────── */}
        {(() => {
          const rows = [
            { label: t("bookDetail.labelPublisher"), value: book.publisher || null },
            { label: t("bookDetail.labelPublished"), value: book.publishedDate ? book.publishedDate.slice(0, 4) : null },
            { label: t("bookDetail.labelLanguage"),  value: book.language || null },
            { label: t("bookDetail.labelFormat"),    value: book.format ? book.format.charAt(0).toUpperCase() + book.format.slice(1).replace(/-/g, " ") : null },
            { label: t("bookDetail.labelPages"),     value: book.pages ? String(book.pages) : null },
            { label: t("bookDetail.labelIsbn"),      value: book.isbn || null },
          ].filter((r): r is { label: string; value: string } => Boolean(r.value));
          if (rows.length === 0) return null;
          return (
            <View style={[styles.sectionBlock, { marginTop: spacing.lg }]}>
              <Text style={styles.sectionTitle}>{t("bookDetail.aboutEdition")}</Text>
              <View style={[styles.card, { marginTop: spacing.sm, paddingHorizontal: 0, paddingVertical: 0 }]}>
                {rows.map((row, i) => (
                  <View key={row.label} style={[styles.editionRow, i < rows.length - 1 && styles.editionRowDivider]}>
                    <Text style={styles.editionLabel}>{row.label}</Text>
                    <Text style={styles.editionValue} numberOfLines={1}>{row.value}</Text>
                  </View>
                ))}
              </View>
            </View>
          );
        })()}

        {/* ── SIMILAR BOOKS ────────────────────────────────────────────────── */}
        {relatedRecs.length > 0 ? (
          <View style={[styles.sectionBlock, { marginTop: spacing.lg }]}>
            <View style={{ gap: spacing.sm }}>
              {relatedRecs.map(({ rec, recBook }) => (
                <RecommendationCard
                  key={rec.id}
                  authorName={getAuthor(recBook.authorId)?.name ?? ""}
                  book={recBook}
                  compact
                  recommendation={rec}
                  onPress={() => navigation.navigate("BookDetail", { bookId: recBook.id })}
                />
              ))}
            </View>
          </View>
        ) : null}
      </Animated.ScrollView>

      <BookStatusSheet
        open={statusSheetOpen}
        currentStatus={book.userStatus.status}
        currentRating={book.userStatus.rating}
        currentOwned={book.userStatus.ownership === "owned"}
        onSave={(status, rating, owned) => updateBookStatus(book.id, status, rating, owned)}
        onClose={() => setStatusSheetOpen(false)}
      />
      <BookListSheet open={listSheetOpen} bookId={book.id} onClose={() => setListSheetOpen(false)} />

      {/* ── More actions sheet ─────────────────────────────────────────────── */}
      <Modal
        visible={moreSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setMoreSheetOpen(false)}
      >
        <Pressable accessibilityRole="button" style={styles.moreOverlay} onPress={() => setMoreSheetOpen(false)}>
          <Pressable accessibilityRole="button" style={styles.moreSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.moreHandle} />
            {hasSessions ? (
              <MoreAction icon="time-outline" label={t("bookDetail.moreReadingLog")} styles={styles} c={c}
                onPress={() => { setMoreSheetOpen(false); navigation.navigate("ReadingLog", { bookId: book.id }); }} />
            ) : null}
            {book.seriesId ? (
              <MoreAction icon="layers-outline" label={t("bookDetail.moreSeriesTracker")} styles={styles} c={c}
                onPress={() => { setMoreSheetOpen(false); navigation.navigate("SeriesTracker", { seriesId: book.seriesId! }); }} />
            ) : null}
            <MoreAction icon="bookmarks-outline" label={t("bookDetail.moreAddToList")} styles={styles} c={c}
              onPress={() => { setMoreSheetOpen(false); setListSheetOpen(true); }} />
            {needsAcquiring ? (
              <MoreAction icon="cart-outline" label={t("bookDetail.moreGetOnAmazon")} styles={styles} c={c}
                onPress={() => { setMoreSheetOpen(false); handleBuy(); }} />
            ) : null}
            <MoreAction icon="create-outline" label={t("bookDetail.moreEditBook")} styles={styles} c={c}
              onPress={() => { setMoreSheetOpen(false); navigation.navigate("EditBook", { bookId: book.id }); }} />
            <View style={styles.moreDivider} />
            <Pressable accessibilityRole="button"
              style={styles.moreRow}
              onPress={() => {
                setMoreSheetOpen(false);
                dialog.confirm({
                  title: book.title,
                  body: t("bookDetail.removeConfirmBody"),
                  confirmLabel: t("common.delete"),
                  destructive: true,
                  onConfirm: () => {
                    deleteBook(book.id);
                    navigation.goBack();
                  },
                });
              }}
            >
              <Ionicons name="trash-outline" size={20} color={c.danger} />
              <Text style={[styles.moreRowText, { color: c.danger }]}>{t("bookDetail.moreRemove")}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function MoreAction({ icon, label, onPress, styles, c }: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  c: AppColors;
}) {
  return (
    <Pressable accessibilityRole="button" style={styles.moreRow} onPress={onPress}>
      <Ionicons name={icon} size={20} color={c.ink} />
      <Text style={styles.moreRowText}>{label}</Text>
      <Ionicons name="chevron-forward" size={15} color={c.muted} />
    </Pressable>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatBox({ label, value, accent, styles }: { label: string; value: string; accent: string; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statVal, { color: accent }]}>{value}</Text>
      <Text style={styles.statLbl}>{label}</Text>
    </View>
  );
}

function CollectorChip({ icon, label, value, styles, c }: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string; value: string;
  styles: ReturnType<typeof createStyles>; c: AppColors;
}) {
  return (
    <View style={styles.collectorChip}>
      <Ionicons name={icon} size={18} color={c.muted} />
      <Text style={styles.collectorChipValue}>{value}</Text>
      <Text style={styles.collectorChipLabel}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function createStyles(c: AppColors, isDark: boolean) {
  return StyleSheet.create({
    root: { backgroundColor: c.bg, flex: 1 },
    scroll: { flex: 1 },
    notFound: { alignItems: "center", flex: 1, gap: 12, justifyContent: "center" },
    notFoundText: { color: c.muted, fontFamily: fonts.body, fontSize: 16 },

    // Hero — blurred cover backdrop, sharp floating cover, theme-aware scrim
    hero: { justifyContent: "flex-end", minHeight: 420 },
    heroImageStyle: { resizeMode: "cover" },
    heroGradient: { alignItems: "center", paddingBottom: spacing.lg, paddingHorizontal: spacing.md, paddingTop: spacing.lg },
    heroCoverFloat: {
      alignSelf: "center", marginBottom: spacing.lg,
      ...shadows.card, shadowOpacity: 0.35, shadowRadius: 22,
    },
    heroTitle: {
      color: c.ink, fontFamily: fonts.display, fontSize: 28, fontWeight: "900", lineHeight: 33,
      textAlign: "center",
      ...(isDark ? {
        textShadowColor: "rgba(7,17,35,0.5)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 12,
      } : null),
    },
    heroAuthor: { color: c.muted, fontFamily: fonts.body, fontSize: 15, fontWeight: "700", marginTop: 5, textAlign: "center" },
    heroSeriesBtn: { alignItems: "center", alignSelf: "center", flexDirection: "row", marginTop: 8 },
    heroSeries: { color: c.tealDark, fontFamily: fonts.body, fontSize: 13, fontWeight: "800" },
    heroStatusPill: {
      alignItems: "center", alignSelf: "center",
      backgroundColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.06)",
      borderColor: isDark ? "rgba(255,255,255,0.20)" : "rgba(15,23,42,0.14)",
      borderRadius: radii.pill, borderWidth: 1, flexDirection: "row",
      gap: 5, marginTop: spacing.md, paddingHorizontal: 12, paddingVertical: 7,
    },
    heroStatusDot: { borderRadius: 4, height: 8, width: 8 },
    heroStatusText: { color: c.ink, fontFamily: fonts.body, fontSize: 12, fontWeight: "900" },
    heroStatusSep: { color: c.muted, fontFamily: fonts.body, fontSize: 12 },
    heroRating: { color: isDark ? c.gold : "#B8860B", fontFamily: fonts.body, fontSize: 12, fontWeight: "900" },

    // Action row
    actionRow: {
      alignItems: "center", backgroundColor: c.surface, borderBottomColor: c.border,
      borderBottomWidth: 1, flexDirection: "row", gap: spacing.sm,
      paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    },
    primaryBtn: {
      alignItems: "center", borderRadius: radii.pill, flex: 1,
      flexDirection: "row", gap: 7, justifyContent: "center", paddingVertical: 10,
    },
    primaryBtnText: { color: "#FFFFFF", fontFamily: fonts.body, fontSize: 14, fontWeight: "900" },
    iconBtn: {
      ...shadows.card, alignItems: "center", backgroundColor: c.surface,
      borderColor: c.border, borderRadius: radii.sm, borderWidth: 1,
      height: 40, justifyContent: "center", width: 40,
    },

    // Shared card
    card: {
      ...shadows.card, backgroundColor: c.surface, borderColor: c.border,
      borderRadius: radii.sm, borderWidth: 1, marginHorizontal: spacing.md, padding: spacing.md,
    },
    eyebrow: {
      color: c.muted, fontFamily: fonts.body, fontSize: 11, fontWeight: "900",
      letterSpacing: 0.8, marginBottom: spacing.sm, textTransform: "uppercase",
    },

    // Progress
    progressTopRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
    progressPct: { fontFamily: fonts.display, fontSize: 20, fontWeight: "900" },
    progressTrack: { backgroundColor: c.border, borderRadius: radii.pill, height: 8, marginTop: spacing.sm, overflow: "hidden" },
    progressFill: { borderRadius: radii.pill, height: "100%" },
    progressDates: { flexDirection: "row", gap: spacing.md, marginTop: 8 },

    // Stats
    statsStrip: {
      ...shadows.card, alignItems: "center", backgroundColor: c.surface, borderColor: c.border,
      borderRadius: radii.sm, borderWidth: 1, flexDirection: "row",
      marginHorizontal: spacing.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
    },
    statItem: { alignItems: "center", flex: 1, gap: 2 },
    statVal: { fontFamily: fonts.display, fontSize: 20, fontWeight: "900" },
    statLbl: { color: c.muted, fontFamily: fonts.body, fontSize: 10, fontWeight: "800", textAlign: "center" },
    statDivider: { backgroundColor: c.border, height: 28, width: 1 },

    // Collector
    collectorRow: { flexDirection: "row", gap: spacing.sm, marginHorizontal: spacing.md },
    collectorChip: {
      alignItems: "center", backgroundColor: c.surface, borderColor: c.border,
      borderRadius: radii.sm, borderWidth: 1, flex: 1, gap: 3, paddingVertical: 10,
    },
    collectorChipValue: { color: c.ink, fontFamily: fonts.display, fontSize: 14, fontWeight: "900" },
    collectorChipLabel: { color: c.muted, fontFamily: fonts.body, fontSize: 9, fontWeight: "800", textTransform: "uppercase" },

    // Synopsis
    synopsisText: { color: c.ink, fontFamily: fonts.bodyRegular, fontSize: 14, lineHeight: 22 },
    synopsisToggle: { color: c.teal, fontFamily: fonts.body, fontSize: 12, fontWeight: "800", marginTop: 8 },
    synopsisMissing: { color: c.muted, fontFamily: fonts.bodyRegular, fontSize: 13, lineHeight: 19 },
    findSynopsisBtn: {
      alignItems: "center",
      alignSelf: "flex-start",
      backgroundColor: c.teal + "14",
      borderColor: c.teal + "33",
      borderRadius: radii.pill,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      marginTop: spacing.sm,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    findSynopsisText: { color: c.tealDark, fontFamily: fonts.body, fontSize: 12, fontWeight: "800" },

    // Meta chips
    metaChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginHorizontal: spacing.md },
    metaChip: {
      alignItems: "center", backgroundColor: c.surfaceAlt, borderColor: c.border,
      borderRadius: radii.pill, borderWidth: 1, flexDirection: "row",
      paddingHorizontal: 12, paddingVertical: 5,
    },
    metaChipText: { color: c.muted, fontFamily: fonts.body, fontSize: 12, fontWeight: "800" },

    // Section
    sectionBlock: { marginHorizontal: spacing.md },
    sectionBlockHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm },
    sectionTitle: { color: c.ink, fontFamily: fonts.display, fontSize: 20, fontWeight: "900" },
    sectionAction: { color: c.gold, fontFamily: fonts.body, fontSize: 13, fontWeight: "800" },

    // Pages per day
    weekNav: { alignItems: "center", flexDirection: "row", gap: spacing.md },
    weekRange: { color: c.muted, fontFamily: fonts.body, fontSize: 12, fontWeight: "800", marginBottom: spacing.sm },

    // Review
    reviewStars: { alignItems: "center", flexDirection: "row", gap: 3, marginBottom: spacing.sm },
    reviewTitle: { color: c.ink, fontFamily: fonts.display, fontSize: 16, fontWeight: "800", lineHeight: 21 },
    reviewBody: { color: c.muted, fontFamily: fonts.bodyRegular, fontSize: 13, lineHeight: 20, marginTop: 6 },
    reviewEmpty: {
      alignItems: "center", backgroundColor: c.surface, borderColor: c.border,
      borderRadius: radii.sm, borderStyle: "dashed", borderWidth: 1,
      flexDirection: "row", gap: spacing.sm, padding: spacing.md,
    },
    reviewEmptyText: { color: c.muted, fontFamily: fonts.body, fontSize: 13, fontWeight: "800" },

    // Shared small text
    mutedSm: { color: c.muted, fontFamily: fonts.body, fontSize: 11, fontWeight: "700" },
    notesText: { color: c.ink, fontFamily: fonts.bodyRegular, fontSize: 14, lineHeight: 22 },
    quoteCard: {
      ...shadows.card,
      backgroundColor: c.surface,
      borderColor: c.gold + "44",
      borderLeftColor: c.gold,
      borderLeftWidth: 3,
      borderRadius: radii.sm,
      borderWidth: 1,
      flexDirection: "row",
      gap: spacing.sm,
      padding: spacing.md,
    },
    quoteIcon: { marginTop: 2 },
    quoteText: { color: c.ink, flex: 1, fontFamily: fonts.bodyRegular, fontSize: 14, fontStyle: "italic", lineHeight: 22 },

    // D — Author card
    authorCard: {
      ...shadows.card,
      alignItems: "center",
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: radii.sm,
      borderWidth: 1,
      flexDirection: "row",
      gap: spacing.md,
      padding: spacing.md,
    },
    authorAvatar: {
      alignItems: "center",
      backgroundColor: c.surfaceAlt,
      borderColor: c.border,
      borderRadius: 999,
      borderWidth: 1,
      height: 44,
      justifyContent: "center",
      width: 44,
    },
    authorInfo: { flex: 1, gap: 2 },
    authorName: { color: c.ink, fontFamily: fonts.body, fontSize: 15, fontWeight: "800" },
    authorSub: { color: c.muted, fontFamily: fonts.bodyRegular, fontSize: 12 },

    // B — About this edition
    editionRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: spacing.md,
      paddingVertical: 13,
    },
    editionRowDivider: {
      borderBottomColor: c.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    editionLabel: { color: c.muted, fontFamily: fonts.body, fontSize: 13, fontWeight: "700" },
    editionValue: { color: c.ink, flex: 1, fontFamily: fonts.body, fontSize: 13, fontWeight: "800", textAlign: "right" },

    // More actions sheet
    moreOverlay: { backgroundColor: "rgba(0,0,0,0.45)", flex: 1, justifyContent: "flex-end" },
    moreSheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingBottom: 36,
      paddingHorizontal: spacing.md,
      paddingTop: 10,
    },
    moreHandle: {
      alignSelf: "center", backgroundColor: c.border, borderRadius: 2,
      height: 4, marginBottom: spacing.sm, width: 40,
    },
    moreRow: {
      alignItems: "center", flexDirection: "row", gap: spacing.md,
      paddingHorizontal: spacing.xs, paddingVertical: 14,
    },
    moreRowText: { color: c.ink, flex: 1, fontFamily: fonts.body, fontSize: 15, fontWeight: "800" },
    moreDivider: { backgroundColor: c.border, height: StyleSheet.hairlineWidth, marginVertical: 4 },
  });
}
