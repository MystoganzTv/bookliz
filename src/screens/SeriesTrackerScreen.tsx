import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Badge } from "../components/Badge";
import { BookCover } from "../components/BookCover";
import { FilterChip } from "../components/FilterChip";
import { Screen } from "../components/Screen";
import { useBookliz } from "../data/BooklizContext";
import { useI18n } from "../i18n/LocalizationContext";
import { RootStackParamList } from "../navigation/types";
import { useColors } from "../theme/ThemeContext";
import { Book } from "../types/models";
import { AppColors, fonts, radii, shadows, spacing } from "../theme/theme";
import { statusLabelKey } from "../utils/statusLabels";

type OrderMode = "reading" | "release";

export function SeriesTrackerScreen() {
  const c = useColors();
  const { t } = useI18n();
  const styles = useMemo(() => createStyles(c), [c]);
  const route = useRoute<RouteProp<RootStackParamList, "SeriesTracker">>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { books, getAuthor, series } = useBookliz();
  const [order, setOrder] = useState<OrderMode>("reading");
  const saga = series.find((item) => item.id === route.params.seriesId);

  const sagaBooks = useMemo(
    () =>
      books.filter((book) => book.seriesId === route.params.seriesId),
    [books, route.params.seriesId]
  );

  const orderedBooks = useMemo(
    () =>
      [...sagaBooks].sort((a, b) =>
        order === "reading"
          ? (a.sagaOrder ?? a.seriesNumber ?? 99) - (b.sagaOrder ?? b.seriesNumber ?? 99)
          : (a.releaseOrder ?? a.seriesNumber ?? 99) - (b.releaseOrder ?? b.seriesNumber ?? 99)
      ),
    [order, sagaBooks]
  );

  const completed = sagaBooks.filter((book) => book.userStatus.status === "read").length;
  const owned = sagaBooks.filter((book) => book.userStatus.ownership === "owned").length;
  const upcoming = sagaBooks.filter((book) => book.userStatus.status === "upcoming-release" || book.upcomingReleaseDate);
  const completion = sagaBooks.length ? Math.round((completed / sagaBooks.length) * 100) : 0;
  const activeBook = orderedBooks.find((book) => book.userStatus.status === "reading");
  const nextUnread = orderedBooks.find((book) => !["read", "dnf"].includes(book.userStatus.status));
  const queuedBooks = orderedBooks.filter((book) => book.id !== nextUnread?.id && book.userStatus.status !== "read").slice(0, 2);
  const orderLabel = order === "reading" ? t("series.readingOrder") : t("series.releaseOrder");

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>{t("series.eyebrow")}</Text>
        <Text style={styles.title}>{saga?.name ?? sagaBooks[0]?.seriesName ?? t("series.defaultTitle")}</Text>
        {saga?.description ? <Text style={styles.subtitle}>{saga.description}</Text> : null}

        <View style={styles.progressHeader}>
          <Text style={styles.progressTitle}>{completed}/{sagaBooks.length} {t("series.finished")}</Text>
          <Text style={styles.progressPct}>{completion}%</Text>
        </View>
        <View style={styles.completionTrack}>
          <View style={[styles.completionFill, { width: `${completion}%` }]} />
        </View>

        <View style={styles.statRow}>
          <StatChip label={t("series.owned")} value={String(owned)} accent={c.teal} styles={styles} />
          <StatChip label={t("series.unread")} value={String(Math.max(sagaBooks.length - completed, 0))} accent={c.gold} styles={styles} />
          <StatChip label={t("series.upcomingLabel")} value={String(upcoming.length)} accent={c.coral} styles={styles} />
        </View>
      </View>

      <View style={styles.shelfCard}>
        <View style={styles.sectionTopline}>
          <Text style={styles.sectionTitle}>{t("series.sagaShelf")}</Text>
          <Text style={styles.sectionMeta}>{orderLabel}</Text>
        </View>
        <View style={styles.coverRail}>
          {orderedBooks.map((book) => (
            <Pressable accessibilityRole="button" key={book.id} onPress={() => navigation.navigate("BookDetail", { bookId: book.id })}>
              <BookCover book={book} size="sm" style={styles.railCover} />
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.pathCard}>
        <View style={styles.sectionTopline}>
          <Text style={styles.sectionTitle}>{t("series.yourPath")}</Text>
          <Text style={styles.sectionMeta}>{order === "reading" ? t("series.bestFlow") : t("series.pubTimeline")}</Text>
        </View>

        {activeBook ? (
          <View style={styles.activeRow}>
            <View style={styles.activePill}>
              <Ionicons name="book-outline" size={14} color={c.card} />
              <Text style={styles.activePillText}>{t("series.currentlyReading")}</Text>
            </View>
            <Text style={styles.activeTitle}>{activeBook.title}</Text>
            <Text style={styles.activeMeta}>
              {getAuthor(activeBook.authorId)?.name} · {activeBook.userStatus.progressPercent}{t("series.percentComplete")}
            </Text>
            <View style={styles.activeTrack}>
              <View style={[styles.activeFill, { width: `${activeBook.userStatus.progressPercent}%` }]} />
            </View>
          </View>
        ) : nextUnread ? (
          <View style={styles.activeRow}>
            <View style={[styles.activePill, styles.activePillSoft]}>
              <Ionicons name="sparkles-outline" size={14} color={c.navy} />
              <Text style={[styles.activePillText, styles.activePillTextSoft]}>{t("series.bestNext")}</Text>
            </View>
            <Text style={styles.activeTitle}>{nextUnread.title}</Text>
            <Text style={styles.activeMeta}>
              {getAuthor(nextUnread.authorId)?.name} · {nextUnread.pages} {t("series.pagesLower")}
            </Text>
          </View>
        ) : (
          <View style={styles.activeRow}>
            <View style={[styles.activePill, { backgroundColor: c.green }]}>
              <Ionicons name="trophy-outline" size={14} color={c.card} />
              <Text style={styles.activePillText}>{t("series.sagaComplete")}</Text>
            </View>
            <Text style={styles.activeTitle}>{t("series.sagaCompleteTitle")}</Text>
            <Text style={styles.activeMeta}>{t("series.sagaCompleteBody")}</Text>
          </View>
        )}

        {queuedBooks.length > 0 ? (
          <View style={styles.queueWrap}>
            <Text style={styles.queueLabel}>{t("series.afterThat")}</Text>
            {queuedBooks.map((book, index) => (
              <Pressable accessibilityRole="button"
                key={book.id}
                style={styles.queueRow}
                onPress={() => navigation.navigate("BookDetail", { bookId: book.id })}
              >
                <Text style={styles.queueIndex}>#{index + 2}</Text>
                <View style={styles.queueCopy}>
                  <Text style={styles.queueTitle}>{book.title}</Text>
                  <Text style={styles.queueMeta}>
                    {order === "reading" ? `${t("series.readingOrder")} ${book.sagaOrder ?? book.seriesNumber ?? "—"}` : `${t("series.published")} ${book.publishedDate.slice(0, 4)}`}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={c.muted} />
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.orderRail}>
        <FilterChip label={t("series.readingOrder")} selected={order === "reading"} onPress={() => setOrder("reading")} />
        <FilterChip label={t("series.releaseOrder")} selected={order === "release"} onPress={() => setOrder("release")} />
      </View>

      <View style={styles.roadmapCard}>
        <View style={styles.sectionTopline}>
          <Text style={styles.sectionTitle}>{t("series.roadmap")}</Text>
          <Text style={styles.sectionMeta}>{t("series.roadmapMeta")}</Text>
        </View>

        {orderedBooks.map((book) => (
          <SagaRoadmapRow
            key={book.id}
            book={book}
            order={order}
            authorName={getAuthor(book.authorId)?.name ?? ""}
            onPress={() => navigation.navigate("BookDetail", { bookId: book.id })}
          />
        ))}
      </View>

      {upcoming.length > 0 ? (
        <View style={styles.upcomingCard}>
          <View style={styles.sectionTopline}>
            <Text style={styles.sectionTitle}>{t("series.upcoming")}</Text>
            <Text style={styles.sectionMeta}>{upcoming.length} {t("series.tracked")}</Text>
          </View>
          {upcoming.map((book) => (
            <Pressable accessibilityRole="button"
              key={book.id}
              style={styles.upcomingRow}
              onPress={() => navigation.navigate("BookDetail", { bookId: book.id })}
            >
              <View style={styles.upcomingDateChip}>
                <Text style={styles.upcomingDateText}>{(book.upcomingReleaseDate ?? book.publishedDate).slice(0, 4)}</Text>
              </View>
              <View style={styles.upcomingCopy}>
                <Text style={styles.upcomingTitle}>{book.title}</Text>
                <Text style={styles.upcomingMeta}>
                  {getAuthor(book.authorId)?.name} · {book.publisher}
                </Text>
              </View>
              <Ionicons name="calendar-outline" size={18} color={c.gold} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

function StatChip({
  label,
  value,
  accent,
  styles
}: {
  label: string;
  value: string;
  accent: string;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.statChip}>
      <Text style={[styles.statValue, { color: accent }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SagaRoadmapRow({
  book,
  order,
  authorName,
  onPress
}: {
  book: Book;
  order: OrderMode;
  authorName: string;
  onPress: () => void;
}) {
  const c = useColors();
  const { t } = useI18n();
  const styles = useMemo(() => createStyles(c), [c]);
  const orderValue = order === "reading" ? (book.sagaOrder ?? book.seriesNumber) : (book.releaseOrder ?? book.seriesNumber);

  return (
    <Pressable accessibilityRole="button" style={styles.roadmapRow} onPress={onPress}>
      <BookCover book={book} size="sm" style={styles.rowCover} />
      <View style={styles.roadmapCopy}>
        <View style={styles.orderBadgeRow}>
          <View style={styles.orderBadge}>
            <Text style={styles.orderBadgeText}>{t("series.readNum")}{book.sagaOrder ?? book.seriesNumber ?? "—"}</Text>
          </View>
          <View style={[styles.orderBadge, styles.orderBadgeAlt]}>
            <Text style={[styles.orderBadgeText, styles.orderBadgeTextAlt]}>{t("series.releaseNum")}{book.releaseOrder ?? book.seriesNumber ?? "—"}</Text>
          </View>
        </View>
        <Text style={styles.bookTitle}>{book.title}</Text>
        <Text style={styles.bookMeta}>
          {authorName} · {book.publishedDate.slice(0, 4)} · {book.pages} {t("series.pagesLower")}
        </Text>
        <View style={styles.badges}>
          <Badge label={`${order === "reading" ? t("series.currentLane") : t("series.currentRelease")} ${orderValue ?? "—"}`} tone="navy" />
          <Badge label={t(statusLabelKey(book.userStatus.status))} tone={book.userStatus.status === "read" ? "green" : "gray"} />
          {book.userStatus.ownership === "owned" ? <Badge label={t("series.owned")} tone="green" /> : null}
        </View>
        {book.userStatus.status === "reading" ? (
          <View style={styles.rowProgressTrack}>
            <View style={[styles.rowProgressFill, { width: `${book.userStatus.progressPercent}%` }]} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
  hero: {
    ...shadows.card,
    backgroundColor: c.navy,
    borderRadius: radii.lg,
    padding: spacing.lg
  },
  eyebrow: {
    color: c.gold,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.4,
    textTransform: "uppercase"
  },
  title: {
    color: c.card,
    fontFamily: fonts.display,
    fontSize: 34,
    fontWeight: "900",
    lineHeight: 38,
    marginTop: spacing.sm
  },
  subtitle: {
    color: c.muted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
    marginTop: spacing.sm
  },
  progressHeader: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.lg
  },
  progressTitle: {
    color: c.card,
    fontFamily: fonts.display,
    fontSize: 20,
    fontWeight: "900"
  },
  progressPct: {
    color: c.gold,
    fontFamily: fonts.display,
    fontSize: 22,
    fontWeight: "900"
  },
  completionTrack: {
    backgroundColor: "rgba(248,243,234,0.18)",
    borderRadius: radii.pill,
    height: 12,
    marginTop: spacing.sm,
    overflow: "hidden"
  },
  completionFill: {
    backgroundColor: c.gold,
    borderRadius: radii.pill,
    height: "100%"
  },
  statRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md
  },
  statChip: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: radii.md,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 11
  },
  statValue: {
    fontFamily: fonts.display,
    fontSize: 22,
    fontWeight: "900"
  },
  statLabel: {
    color: c.muted,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2,
    textTransform: "uppercase"
  },
  shelfCard: {
    ...shadows.card,
    backgroundColor: c.surface,
    borderColor: c.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginTop: spacing.md,
    padding: spacing.md
  },
  sectionTopline: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md
  },
  sectionTitle: {
    color: c.ink,
    fontFamily: fonts.display,
    fontSize: 22,
    fontWeight: "900"
  },
  sectionMeta: {
    color: c.muted,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: "900"
  },
  coverRail: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md
  },
  railCover: {
    width: 62,
    height: 92
  },
  pathCard: {
    ...shadows.card,
    backgroundColor: c.surface,
    borderColor: c.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginTop: spacing.md,
    padding: spacing.md
  },
  activeRow: {
    marginTop: spacing.md
  },
  activePill: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: c.navy,
    borderRadius: radii.pill,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  activePillSoft: {
    backgroundColor: c.gold
  },
  activePillText: {
    color: c.card,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: "900"
  },
  activePillTextSoft: {
    color: c.navy
  },
  activeTitle: {
    color: c.ink,
    fontFamily: fonts.display,
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 32,
    marginTop: spacing.sm
  },
  activeMeta: {
    color: c.muted,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 20,
    marginTop: 4
  },
  activeTrack: {
    backgroundColor: c.border,
    borderRadius: radii.pill,
    height: 8,
    marginTop: spacing.sm,
    overflow: "hidden"
  },
  activeFill: {
    backgroundColor: c.teal,
    borderRadius: radii.pill,
    height: "100%"
  },
  queueWrap: {
    marginTop: spacing.md
  },
  queueLabel: {
    color: c.muted,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase"
  },
  queueRow: {
    alignItems: "center",
    backgroundColor: c.surfaceAlt,
    borderColor: c.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12
  },
  queueIndex: {
    color: c.gold,
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: "900",
    width: 28
  },
  queueCopy: {
    flex: 1
  },
  queueTitle: {
    color: c.ink,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: "900"
  },
  queueMeta: {
    color: c.muted,
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    marginTop: 2
  },
  orderRail: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md
  },
  roadmapCard: {
    marginTop: spacing.md
  },
  roadmapRow: {
    backgroundColor: c.surface,
    borderColor: c.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.md,
    padding: spacing.md
  },
  rowCover: {
    width: 76,
    height: 112
  },
  roadmapCopy: {
    flex: 1
  },
  orderBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  orderBadge: {
    backgroundColor: c.gold + "22",
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  orderBadgeAlt: {
    backgroundColor: c.teal + "18"
  },
  orderBadgeText: {
    color: c.gold,
    fontFamily: fonts.body,
    fontSize: 10,
    fontWeight: "900"
  },
  orderBadgeTextAlt: {
    color: c.teal,
  },
  bookTitle: {
    color: c.ink,
    fontFamily: fonts.display,
    fontSize: 21,
    fontWeight: "900",
    lineHeight: 24,
    marginTop: 6
  },
  bookMeta: {
    color: c.muted,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 5
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: spacing.sm
  },
  rowProgressTrack: {
    backgroundColor: c.border,
    borderRadius: radii.pill,
    height: 7,
    marginTop: spacing.sm,
    overflow: "hidden"
  },
  rowProgressFill: {
    backgroundColor: c.teal,
    borderRadius: radii.pill,
    height: "100%"
  },
  upcomingCard: {
    ...shadows.card,
    backgroundColor: c.surface,
    borderColor: c.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginTop: spacing.lg,
    padding: spacing.md
  },
  upcomingRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md
  },
  upcomingDateChip: {
    alignItems: "center",
    backgroundColor: c.gold + "22",
    borderRadius: radii.md,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: spacing.sm
  },
  upcomingDateText: {
    color: c.gold,
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: "900"
  },
  upcomingCopy: {
    flex: 1
  },
  upcomingTitle: {
    color: c.ink,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: "900"
  },
  upcomingMeta: {
    color: c.muted,
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    marginTop: 2
  }
  });
}
