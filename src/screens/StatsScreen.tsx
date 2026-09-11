import { Ionicons } from "@expo/vector-icons";
import { useDialog } from "../components/DialogProvider";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { BarChart } from "../components/BarChart";
import { Screen } from "../components/Screen";
import { useBookliz } from "../data/BooklizContext";
import { ReadingSession } from "../types/models";
import { AppColors, fonts, radii, shadows, spacing } from "../theme/theme";
import { useColors } from "../theme/ThemeContext";
import { useI18n } from "../i18n/LocalizationContext";
import { localDateKey } from "../utils/dateUtils";

type Tab = "books" | "pages" | "minutes";
type StatsStyles = ReturnType<typeof createStyles>;

export function StatsScreen() {
  const c = useColors();
  const { t } = useI18n();
  const dialog = useDialog();
  const styles = useMemo(() => createStyles(c), [c]);
  const { books, overallStats, userProfile, readingSessions } = useBookliz();
  // Sessions logged from the app carry no rating (0); only show the tile when real ratings exist.
  const hasSessionRatings = readingSessions.some((session) => (session.enjoymentRating ?? 0) > 0);
  const [activeTab, setActiveTab] = useState<Tab>("books");

  const unfinishedCount = books.filter((b) => b.userStatus.status === "dnf").length;
  const goalPct = Math.min(100, Math.round((overallStats.booksReadThisYear / userProfile.yearlyGoal) * 100));

  const chartData: Record<Tab, { label: string; value: number }[]> = {
    books: overallStats.monthly.map((m) => ({ label: m.label, value: m.booksFinished })),
    pages: overallStats.monthly.map((m) => ({ label: m.label, value: m.pages })),
    minutes: overallStats.monthly.map((m) => ({ label: m.label, value: m.minutes }))
  };

  const topGenre = overallStats.genreCounts[0]?.label ?? "—";
  const topAuthor = overallStats.authorCounts[0]?.label ?? "—";
  const topLocation = overallStats.locationCounts[0]?.label ?? "—";
  const topFormat = overallStats.formatCounts[0]?.label ?? "—";
  const avgSpeed = Math.round(
    overallStats.speedOverTime.reduce((s, d) => s + d.value, 0) /
    (overallStats.speedOverTime.length || 1)
  );
  const hoursRead = Math.round(overallStats.minutesRead / 60);
  const bestDay = overallStats.bestReadingDay === "No sessions yet"
    ? "—"
    : new Date(`${overallStats.bestReadingDay}T00:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric"
      });

  const shareYearInReview = async () => {
    const year = new Date().getFullYear();
    const text = [
      `📚 ${t("stats.shareText").replace("{{year}}", String(year))}`,
      "",
      `${overallStats.booksReadThisYear} ${t("stats.shareBooks")}`,
      overallStats.rereadsCompleted > 0 ? `${overallStats.rereadsCompleted} ${t("stats.shareRereads")}` : null,
      `${overallStats.pagesRead.toLocaleString()} ${t("stats.sharePages")}`,
      `${hoursRead} ${t("stats.shareHours")}`,
      `${overallStats.longestStreak}${t("stats.shareStreak")}`,
      topGenre !== "—" ? `${t("stats.shareFavGenre")} ${topGenre}` : null,
      topAuthor !== "—" ? `${t("stats.shareMostRead")} ${topAuthor}` : null,
      overallStats.averageRating > 0 ? `${t("stats.shareAvgRating")} ${overallStats.averageRating} ★` : null
    ].filter(Boolean).join("\n");

    try {
      await Share.share({ message: text });
    } catch {
      dialog.alert(t("stats.shareError"), t("stats.shareErrorBody"));
    }
  };

  const tabLabels: Record<Tab, string> = {
    books: t("stats.tabBooks"),
    pages: t("stats.tabPages"),
    minutes: t("stats.tabMinutes"),
  };

  const hasData = overallStats.totalBooksRead > 0 || overallStats.pagesRead > 0;

  if (!hasData) {
    return (
      <Screen>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{t("stats.eyebrow")}</Text>
          <Text style={styles.title}>{t("stats.title")}</Text>
          <Text style={styles.subtitle}>{t("stats.subtitleEmpty")}</Text>
        </View>

        <View style={styles.emptyState}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="bar-chart-outline" size={42} color={c.teal} />
          </View>
          <Text style={styles.emptyTitle}>{t("stats.emptyTitle")}</Text>
          <Text style={styles.emptySub}>{t("stats.emptySub")}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>{t("stats.eyebrow")}</Text>
        <Text style={styles.title}>{t("stats.title")}</Text>
        <Text style={styles.subtitle}>{t("stats.subtitle")}</Text>
      </View>

      <View style={styles.heroCard}>
        <View style={styles.heroGlowA} />
        <View style={styles.heroGlowB} />

        <View style={styles.goalRow}>
          <View style={styles.goalLeft}>
            <Text style={styles.goalLabel}>{t("stats.annualGoal")}</Text>
            <Text style={styles.goalNumbers}>
              {overallStats.booksReadThisYear}
              <Text style={styles.goalOf}> / {userProfile.yearlyGoal}</Text>
            </Text>
          </View>
          <Text style={styles.goalPct}>{goalPct}%</Text>
        </View>

        <View style={styles.goalTrack}>
          <View style={[styles.goalFill, { width: `${goalPct}%` }]} />
        </View>

        <View style={styles.heroNumbers}>
          <HeroStat styles={styles} value={overallStats.pagesRead.toLocaleString()} label={t("stats.pages")} />
          <HeroStat styles={styles} value={`${hoursRead}h`} label={t("stats.hoursRead")} />
          <HeroStat styles={styles} value={`${overallStats.longestStreak}d`} label={t("stats.bestStreak")} accent={c.coral} />
          <HeroStat styles={styles} value={overallStats.totalSessions.toString()} label={t("stats.sessions")} />
        </View>
      </View>

      {/* ── STREAK CARD ── */}
      <View style={[styles.chartCard, styles.streakCard]}>
        <View style={styles.streakCol}>
          <Text style={styles.streakFire}>🔥</Text>
          <Text style={[styles.streakVal, { color: overallStats.currentStreak > 0 ? c.coral : c.muted }]}>
            {overallStats.currentStreak}d
          </Text>
          <Text style={styles.streakLbl}>Current streak</Text>
        </View>
        <View style={styles.streakDivider} />
        <View style={styles.streakCol}>
          <Text style={styles.streakFire}>🏆</Text>
          <Text style={[styles.streakVal, { color: c.gold }]}>{overallStats.longestStreak}d</Text>
          <Text style={styles.streakLbl}>Best streak</Text>
        </View>
      </View>

      {/* ── MONTHLY ACTIVITY ── */}
      <View style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <Text style={styles.sectionTitle}>{t("stats.monthlyActivity")}</Text>
          <View style={styles.tabs}>
            {(["books", "pages", "minutes"] as Tab[]).map((tab) => (
              <Pressable accessibilityRole="button"
                key={tab}
                style={[styles.tab, activeTab === tab && styles.tabActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                  {tabLabels[tab]}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <BarChart data={chartData[activeTab]} />
      </View>

      {/* ── READING HEATMAP ── */}
      <View style={styles.chartCard}>
        <Text style={[styles.sectionTitle, { marginBottom: spacing.sm }]}>Reading activity</Text>
        <ReadingHeatmap sessions={readingSessions} c={c} />
        <View style={styles.heatmapLegend}>
          <Text style={styles.heatmapLegendLabel}>Less</Text>
          {["00", "50", "80", "B0", "FF"].map((a) => (
            <View key={a} style={[styles.heatmapLegendCell, { backgroundColor: a === "00" ? c.border : c.teal + a }]} />
          ))}
          <Text style={styles.heatmapLegendLabel}>More</Text>
        </View>
      </View>

      <View style={styles.chartCard}>
        <Text style={styles.sectionTitle}>{t("stats.insights")}</Text>
        <View style={styles.insightsGrid}>
          <InsightTile styles={styles} icon="compass-outline" label={t("stats.topGenre")} value={topGenre} color={c.teal} />
          <InsightTile styles={styles} icon="person-outline" label={t("stats.topAuthor")} value={topAuthor} color={c.gold} />
          <InsightTile styles={styles} icon="speedometer-outline" label={t("stats.avgSpeed")} value={`${avgSpeed} pp/h`} color="#7C83FD" />
          <InsightTile styles={styles} icon="calendar-outline" label={t("stats.bestDay")} value={bestDay} color={c.green} />
          <InsightTile styles={styles} icon="star-outline" label={t("stats.avgRating")} value={`${overallStats.averageRating.toFixed(1)} ★`} color={c.coral} />
          <InsightTile styles={styles} icon="close-circle-outline" label={t("stats.unfinished")} value={unfinishedCount.toString()} color={c.muted} />
        </View>
      </View>

      <View style={styles.chartCard}>
        <Text style={styles.sectionTitle}>{t("stats.collectorDashboard")}</Text>
        <View style={styles.collectorGrid}>
          <CollectorTile styles={styles} label={t("stats.trackedBooks")} value={overallStats.booksTracked.toString()} sub={`${overallStats.completionRate}${t("stats.completedSuffix")}`} accent={c.tealDark} />
          <CollectorTile styles={styles} label={t("stats.ownedShelf")} value={overallStats.ownedCount.toString()} sub={`${overallStats.wishlistCount} ${t("stats.wishlistSuffix")}`} accent={c.gold} />
          <CollectorTile styles={styles} label={t("stats.wantToBuy")} value={overallStats.wantToBuyCount.toString()} sub={`${overallStats.completedSeriesCount} ${t("stats.sagasDone")}`} accent={c.coral} />
          <CollectorTile styles={styles} label={t("stats.avgLength")} value={`${overallStats.averageBookLength}`} sub={t("stats.pagesPerBook")} accent={c.ink} />
        </View>
      </View>

      <View style={styles.chartCard}>
        <Text style={styles.sectionTitle}>{t("stats.habitLens")}</Text>
        <View style={styles.collectorGrid}>
          {hasSessionRatings ? (
            <CollectorTile styles={styles} label={t("stats.enjoyment")} value={`${overallStats.averageSessionEnjoyment.toFixed(1)} / 10`} sub={t("stats.avgSessionRating")} accent={c.green} />
          ) : null}
          <CollectorTile styles={styles} label={t("stats.sessionLength")} value={`${overallStats.averageMinutesPerSession}m`} sub={t("stats.avgSession")} accent={c.teal} />
          <CollectorTile styles={styles} label={t("stats.topPlace")} value={topLocation} sub={t("stats.whereYouRead")} accent={c.gold} />
          <CollectorTile styles={styles} label={t("stats.topFormat")} value={topFormat} sub={t("stats.dominantFormat")} accent={c.coral} />
        </View>
      </View>

      {overallStats.mostActiveDays.length > 0 && (
        <View style={styles.chartCard}>
          <Text style={styles.sectionTitle}>Most active days</Text>
          <BarChart data={overallStats.mostActiveDays} />
        </View>
      )}

      {overallStats.speedOverTime.length > 1 && (
        <View style={styles.chartCard}>
          <Text style={styles.sectionTitle}>Reading speed trend</Text>
          <BarChart data={overallStats.speedOverTime} />
        </View>
      )}

      {overallStats.genreCounts.length > 0 && (
        <View style={styles.chartCard}>
          <Text style={styles.sectionTitle}>{t("stats.byGenre")}</Text>
          <BarChart data={overallStats.genreCounts.slice(0, 6)} />
        </View>
      )}

      {overallStats.locationCounts.length > 0 && (
        <View style={styles.chartCard}>
          <Text style={styles.sectionTitle}>{t("stats.readingPlaces")}</Text>
          <BarChart data={overallStats.locationCounts.slice(0, 5)} />
        </View>
      )}

      {overallStats.formatCounts.length > 0 && (
        <View style={styles.chartCard}>
          <Text style={styles.sectionTitle}>{t("stats.byFormat")}</Text>
          <BarChart data={overallStats.formatCounts} />
        </View>
      )}

      <View style={styles.yearCard}>
        <View style={styles.yearTop}>
          <Text style={styles.yearEyebrow}>{new Date().getFullYear()} {t("stats.yearInReview")}</Text>
          <Ionicons name="trophy" size={20} color={c.gold} />
        </View>

        <Text style={styles.yearTitle}>{t("stats.yearTitle")}</Text>

        <View style={styles.yearRow}>
          <YearStat styles={styles} value={overallStats.booksReadThisYear.toString()} label={t("stats.booksRead")} />
          <YearStat styles={styles} value={overallStats.pagesRead.toLocaleString()} label={t("stats.pages")} />
          <YearStat styles={styles} value={`${hoursRead}h`} label={t("stats.hours")} />
        </View>

        {(topGenre !== "—" || topAuthor !== "—") && (
          <View style={styles.yearMeta}>
            {topGenre !== "—" && <YearMeta styles={styles} label={t("stats.topGenre")} value={topGenre} />}
            {topAuthor !== "—" && <YearMeta styles={styles} label={t("stats.topAuthor")} value={topAuthor} />}
          </View>
        )}

        <Pressable accessibilityRole="button" style={styles.shareBtn} onPress={shareYearInReview}>
          <Ionicons name="share-outline" size={15} color={c.navy} />
          <Text style={styles.shareBtnText}>{t("stats.shareYear")}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

function HeroStat({
  value,
  label,
  accent,
  styles
}: {
  value: string;
  label: string;
  accent?: string;
  styles: StatsStyles;
}) {
  return (
    <View style={styles.heroStatWrap}>
      <Text style={[styles.heroStatVal, accent ? { color: accent } : null]}>{value}</Text>
      <Text style={styles.heroStatLbl}>{label}</Text>
    </View>
  );
}

function InsightTile({
  icon,
  label,
  value,
  color,
  styles
}: {
  icon: string;
  label: string;
  value: string;
  color: string;
  styles: StatsStyles;
}) {
  return (
    <View style={styles.insightTile}>
      <View style={[styles.insightIconWrap, { backgroundColor: color + "18" }]}>
        <Ionicons name={icon as any} size={16} color={color} />
      </View>
      <Text style={styles.insightLabel}>{label}</Text>
      <Text style={styles.insightValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function CollectorTile({
  label,
  value,
  sub,
  accent,
  styles
}: {
  label: string;
  value: string;
  sub: string;
  accent: string;
  styles: StatsStyles;
}) {
  return (
    <View style={styles.collectorTile}>
      <Text style={[styles.collectorValue, { color: accent }]} numberOfLines={1}>{value}</Text>
      <Text style={styles.collectorLabel}>{label}</Text>
      <Text style={styles.collectorSub} numberOfLines={2}>{sub}</Text>
    </View>
  );
}

function YearStat({ value, label, styles }: { value: string; label: string; styles: StatsStyles }) {
  return (
    <View style={styles.yearStatWrap}>
      <Text style={styles.yearStatVal}>{value}</Text>
      <Text style={styles.yearStatLbl}>{label}</Text>
    </View>
  );
}

function YearMeta({
  label,
  value,
  styles
}: {
  label: string;
  value: string;
  styles: StatsStyles;
}) {
  return (
    <View style={styles.yearMetaRow}>
      <Text style={styles.yearMetaLabel}>{label}</Text>
      <Text style={styles.yearMetaValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// ── Reading heatmap ───────────────────────────────────────────────────────────

function ReadingHeatmap({ sessions, c }: { sessions: ReadingSession[]; c: AppColors }) {
  const WEEKS = 52;
  const CELL = 10;
  const GAP = 2;

  const { grid, monthLabels } = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of sessions) {
      if (s.date) map[s.date] = (map[s.date] ?? 0) + (s.minutesRead || 0);
    }

    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sun…6=Sat
    const start = new Date(today);
    start.setDate(start.getDate() - (WEEKS * 7 - 1 + dayOfWeek));

    const todayStr = localDateKey(today);
    const labels: { label: string; col: number }[] = [];
    let lastMonth = -1;
    const grid: { mins: number; future: boolean }[][] = [];
    const cur = new Date(start);

    for (let w = 0; w < WEEKS; w++) {
      const week: { mins: number; future: boolean }[] = [];
      for (let d = 0; d < 7; d++) {
        const ds = localDateKey(cur);
        if (d === 0 && cur.getMonth() !== lastMonth) {
          labels.push({ label: cur.toLocaleDateString("en-US", { month: "short" }), col: w });
          lastMonth = cur.getMonth();
        }
        week.push({ mins: map[ds] ?? 0, future: ds > todayStr });
        cur.setDate(cur.getDate() + 1);
      }
      grid.push(week);
    }

    return { grid, monthLabels: labels };
  }, [sessions]);

  const cellColor = (mins: number, future: boolean): string => {
    if (future) return "transparent";
    if (mins === 0) return c.border;
    if (mins < 20)  return c.teal + "50";
    if (mins < 45)  return c.teal + "80";
    if (mins < 90)  return c.teal + "B0";
    return c.teal;
  };

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View>
        {/* Month labels */}
        <View style={{ flexDirection: "row", height: 14, marginBottom: GAP, position: "relative" }}>
          {monthLabels.map(({ label, col }) => (
            <View key={label + col} style={{ left: col * (CELL + GAP), position: "absolute" }}>
              <Text style={{ color: c.muted, fontFamily: fonts.body, fontSize: 9, fontWeight: "700" }}>
                {label}
              </Text>
            </View>
          ))}
        </View>
        {/* Day columns */}
        <View style={{ flexDirection: "row", gap: GAP }}>
          {grid.map((week, wi) => (
            <View key={wi} style={{ flexDirection: "column", gap: GAP }}>
              {week.map((day, di) => (
                <View
                  key={di}
                  style={{ backgroundColor: cellColor(day.mins, day.future), borderRadius: 2, height: CELL, width: CELL }}
                />
              ))}
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    header: {
      marginBottom: spacing.md
    },
    eyebrow: {
      color: c.tealDark,
      fontFamily: fonts.body,
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 1.5,
      textTransform: "uppercase"
    },
    title: {
      color: c.ink,
      fontFamily: fonts.display,
      fontSize: 28,
      fontWeight: "900",
      marginTop: 2
    },
    subtitle: {
      color: c.muted,
      fontFamily: fonts.bodyRegular,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 6
    },
    heroCard: {
      ...shadows.card,
      backgroundColor: c.navy,
      borderRadius: radii.lg,
      marginBottom: spacing.md,
      overflow: "hidden",
      padding: spacing.lg,
      position: "relative"
    },
    heroGlowA: {
      backgroundColor: c.teal + "20",
      borderRadius: 160,
      height: 180,
      position: "absolute",
      right: -40,
      top: -20,
      width: 180
    },
    heroGlowB: {
      backgroundColor: c.gold + "24",
      borderRadius: 110,
      bottom: -50,
      height: 150,
      left: -30,
      position: "absolute",
      width: 150
    },
    goalRow: {
      alignItems: "flex-start",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: spacing.sm
    },
    goalLeft: { flex: 1 },
    goalLabel: {
      color: "rgba(255,255,255,0.55)",
      fontFamily: fonts.body,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1,
      textTransform: "uppercase"
    },
    goalNumbers: {
      color: "#FFFFFF",
      fontFamily: fonts.display,
      fontSize: 30,
      fontWeight: "900",
      marginTop: 2
    },
    goalOf: {
      color: "rgba(255,255,255,0.45)",
      fontSize: 20
    },
    goalPct: {
      color: c.gold,
      fontFamily: fonts.display,
      fontSize: 28,
      fontWeight: "900"
    },
    goalTrack: {
      backgroundColor: "rgba(255,255,255,0.12)",
      borderRadius: radii.pill,
      height: 7,
      marginBottom: spacing.lg,
      overflow: "hidden"
    },
    goalFill: {
      backgroundColor: c.gold,
      borderRadius: radii.pill,
      height: "100%"
    },
    heroNumbers: {
      borderTopColor: "rgba(255,255,255,0.10)",
      borderTopWidth: 1,
      flexDirection: "row",
      paddingTop: spacing.md
    },
    heroStatWrap: { alignItems: "center", flex: 1 },
    heroStatVal: { color: "#FFFFFF", fontFamily: fonts.display, fontSize: 18, fontWeight: "900" },
    heroStatLbl: { color: "rgba(255,255,255,0.58)", fontFamily: fonts.body, fontSize: 10, fontWeight: "800", marginTop: 2 },
    chartCard: {
      ...shadows.card,
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: radii.lg,
      borderWidth: 1,
      marginBottom: spacing.md,
      padding: spacing.md
    },
    chartHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: spacing.md
    },
    sectionTitle: {
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 1,
      textTransform: "uppercase"
    },
    tabs: {
      flexDirection: "row",
      gap: spacing.xs
    },
    tab: {
      backgroundColor: c.surfaceAlt,
      borderColor: c.border,
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 5
    },
    tabActive: {
      backgroundColor: c.navy,
      borderColor: c.navy
    },
    tabText: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 11,
      fontWeight: "900"
    },
    tabTextActive: { color: "#FFFFFF" },
    insightsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
      marginTop: spacing.sm
    },
    collectorGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
      marginTop: spacing.sm
    },
    insightTile: {
      backgroundColor: c.surfaceAlt,
      borderColor: c.border,
      borderRadius: radii.md,
      borderWidth: 1,
      flex: 1,
      minWidth: "30%",
      padding: spacing.sm + 2
    },
    insightIconWrap: {
      alignItems: "center",
      borderRadius: 8,
      height: 28,
      justifyContent: "center",
      marginBottom: 6,
      width: 28
    },
    insightLabel: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 10,
      fontWeight: "800",
      marginBottom: 3,
      textTransform: "uppercase"
    },
    insightValue: {
      color: c.ink,
      fontFamily: fonts.display,
      fontSize: 14,
      fontWeight: "900"
    },
    collectorTile: {
      backgroundColor: c.surfaceAlt,
      borderColor: c.border,
      borderRadius: radii.md,
      borderWidth: 1,
      flex: 1,
      minWidth: "47%",
      padding: spacing.sm + 2
    },
    collectorValue: {
      fontFamily: fonts.display,
      fontSize: 18,
      fontWeight: "900"
    },
    collectorLabel: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 10,
      fontWeight: "900",
      marginTop: 4,
      textTransform: "uppercase"
    },
    collectorSub: {
      color: c.muted,
      fontFamily: fonts.bodyRegular,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 4
    },
    yearCard: {
      ...shadows.card,
      backgroundColor: c.surfaceAlt,
      borderColor: c.border,
      borderRadius: radii.lg,
      borderWidth: 1,
      marginBottom: spacing.md,
      padding: spacing.lg
    },
    yearTop: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: spacing.xs
    },
    yearEyebrow: {
      color: c.gold,
      fontFamily: fonts.body,
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 1.2,
      textTransform: "uppercase"
    },
    yearTitle: {
      color: c.ink,
      fontFamily: fonts.display,
      fontSize: 20,
      fontWeight: "900",
      lineHeight: 26,
      marginBottom: spacing.lg
    },
    yearRow: {
      borderTopColor: c.border,
      borderTopWidth: 1,
      flexDirection: "row",
      marginBottom: spacing.md,
      paddingTop: spacing.md
    },
    yearStatWrap: { alignItems: "center", flex: 1 },
    yearStatVal: { color: c.ink, fontFamily: fonts.display, fontSize: 22, fontWeight: "900" },
    yearStatLbl: { color: c.muted, fontFamily: fonts.body, fontSize: 10, fontWeight: "800", marginTop: 2 },
    yearMeta: {
      borderTopColor: c.border,
      borderTopWidth: 1,
      marginBottom: spacing.md,
      paddingTop: spacing.sm
    },
    yearMetaRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 4
    },
    yearMetaLabel: { color: c.muted, fontFamily: fonts.body, fontSize: 12, fontWeight: "800" },
    yearMetaValue: { color: c.ink, fontFamily: fonts.body, fontSize: 12, fontWeight: "900", maxWidth: "60%", textAlign: "right" },
    shareBtn: {
      alignItems: "center",
      backgroundColor: c.gold,
      borderRadius: radii.pill,
      flexDirection: "row",
      gap: spacing.sm,
      justifyContent: "center",
      paddingVertical: 13
    },
    shareBtnText: {
      color: c.navy,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: "900"
    },
    emptyState: {
      alignItems: "center",
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: radii.lg,
      borderWidth: 1,
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: 54
    },
    emptyIconWrap: {
      alignItems: "center",
      backgroundColor: c.surfaceAlt,
      borderRadius: 24,
      height: 88,
      justifyContent: "center",
      width: 88
    },
    emptyTitle: {
      color: c.ink,
      fontFamily: fonts.display,
      fontSize: 22,
      fontWeight: "900",
      textAlign: "center"
    },
    emptySub: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 14,
      lineHeight: 21,
      textAlign: "center"
    },

    // Streak card
    streakCard: {
      flexDirection: "row",
      alignItems: "center",
    },
    streakCol: {
      alignItems: "center",
      flex: 1,
      gap: 2,
    },
    streakDivider: {
      backgroundColor: c.border,
      height: 48,
      width: 1,
    },
    streakFire: {
      fontSize: 22,
    },
    streakVal: {
      fontFamily: fonts.display,
      fontSize: 26,
      fontWeight: "900",
    },
    streakLbl: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 10,
      fontWeight: "800",
      textTransform: "uppercase",
    },

    // Heatmap legend
    heatmapLegend: {
      alignItems: "center",
      flexDirection: "row",
      gap: 4,
      justifyContent: "flex-end",
      marginTop: spacing.sm,
    },
    heatmapLegendCell: {
      borderRadius: 2,
      height: 10,
      width: 10,
    },
    heatmapLegendLabel: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 9,
      fontWeight: "700",
    },
  });
}
