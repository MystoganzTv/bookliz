/**
 * "Your year in reading" (Bookliz Pro). Every number is computed by
 * stats/yearInReview from what was logged; a quiet year shows a quiet page.
 */
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ReactNode, useMemo, useState } from "react";
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { BarChart } from "../components/BarChart";
import { MiniCover } from "../components/MiniCover";
import { Screen } from "../components/Screen";
import { useBookliz } from "../data/BooklizContext";
import { useI18n } from "../i18n/LocalizationContext";
import { RootStackParamList } from "../navigation/types";
import { usePro } from "../pro/ProContext";
import { buildYearInReview, RankedBook, yearsWithReading } from "../stats/yearInReview";
import { useTheme } from "../theme/ThemeContext";
import { AppColors, fonts, radii, spacing, withAlpha } from "../theme/theme";

export function YearInReviewScreen() {
  const { colors: c } = useTheme();
  const { t, locale } = useI18n();
  const { books, readingSessions, getAuthor, getBook } = useBookliz();
  const { isPro } = usePro();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const styles = useMemo(() => createStyles(c), [c]);
  const currentYear = new Date().getFullYear();
  const years = useMemo(() => yearsWithReading(books, readingSessions, currentYear), [books, readingSessions, currentYear]);
  const [year, setYear] = useState(currentYear);
  const review = useMemo(() => buildYearInReview(books, readingSessions, year), [books, readingSessions, year]);
  const lang = locale === "es" ? "es-ES" : "en-US";

  const monthName = (index: number, style: "short" | "long" = "long") =>
    new Date(Date.UTC(2026, index, 15)).toLocaleDateString(lang, { month: style, timeZone: "UTC" });
  const weekdayName = (index: number) =>
    new Date(Date.UTC(2026, 0, 4 + index)).toLocaleDateString(lang, { weekday: "long", timeZone: "UTC" });
  const hours = Math.floor(review.minutes / 60);
  const authorName = (authorId: string) => getAuthor(authorId)?.name ?? "—";

  if (!isPro) {
    return (
      <Screen>
        <View style={styles.locked}>
          <View style={styles.lockedIcon}>
            <Ionicons name="sparkles" size={34} color={c.gold} />
          </View>
          <Text style={styles.lockedTitle}>{t("yearReview.title", { year: currentYear })}</Text>
          <Text style={styles.lockedBody}>{t("pro.features.yearInReview.body")}</Text>
          <Pressable accessibilityRole="button" style={[styles.cta, { alignSelf: "stretch" }]} onPress={() => navigation.navigate("Paywall", { feature: "yearInReview" })}>
            <Text style={styles.ctaText}>{t("yearReview.unlock")}</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const share = () => {
    const lines = [
      `📚 ${t("yearReview.title", { year })}`,
      "",
      t("yearReview.shareBooks", { count: review.booksFinished }),
      t("yearReview.shareHours", { count: hours }),
      t("yearReview.sharePages", { count: review.pages.toLocaleString(lang) }),
      review.longestStreak > 1 ? t("yearReview.shareStreak", { count: review.longestStreak }) : null,
      review.topRated[0] ? t("yearReview.shareFavorite", { title: review.topRated[0].title }) : null,
      "",
      "Bookliz",
    ].filter((line): line is string => line !== null);
    void Share.share({ message: lines.join("\n") }).catch(() => {});
  };

  const bookRow = (item: RankedBook | null, caption: string, detail?: string) => {
    if (!item) return null;
    const book = getBook(item.bookId);
    return (
      <Pressable
        key={`${caption}-${item.bookId}`}
        accessibilityRole="button"
        style={styles.bookRow}
        onPress={() => navigation.navigate("BookDetail", { bookId: item.bookId })}
      >
        {book ? <MiniCover book={book} width={40} /> : null}
        <View style={styles.bookCopy}>
          <Text style={styles.bookCaption}>{caption}</Text>
          <Text style={styles.bookTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.bookDetail} numberOfLines={1}>{detail ?? authorName(item.authorId)}</Text>
        </View>
      </Pressable>
    );
  };

  const empty = review.minutes === 0 && review.booksFinished === 0;

  return (
    <Screen>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.years}>
        {years.map((y) => (
          <Pressable
            key={y}
            accessibilityRole="button"
            accessibilityState={{ selected: y === year }}
            onPress={() => setYear(y)}
            style={[styles.yearChip, y === year && styles.yearChipActive]}
          >
            <Text style={[styles.yearChipText, y === year && styles.yearChipTextActive]}>{y}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.hero}>
        <Text style={styles.heroEyebrow}>{t("yearReview.title", { year })}</Text>
        {empty ? (
          <Text style={styles.heroEmpty}>{t("yearReview.empty")}</Text>
        ) : (
          <>
            <Text style={styles.heroNumber}>{hours > 0 ? hours : review.minutes}</Text>
            <Text style={styles.heroUnit}>{hours > 0 ? t("yearReview.hoursUnit") : t("yearReview.minutesUnit")}</Text>
            <View style={styles.heroStats}>
              <Stat value={String(review.booksFinished)} label={t("yearReview.booksFinished")} styles={styles} />
              <Stat value={review.pages.toLocaleString(lang)} label={t("yearReview.pages")} styles={styles} />
              <Stat value={String(review.daysRead)} label={t("yearReview.days")} styles={styles} />
            </View>
          </>
        )}
      </View>

      {!empty ? (
        <>
          <Section title={t("yearReview.rhythm")} styles={styles}>
            <BarChart data={review.monthlyMinutes.map((value, i) => ({ label: monthName(i, "short").slice(0, 3), value }))} />
            <View style={styles.factGrid}>
              <Fact icon="flame-outline" label={t("yearReview.streak")} value={t("yearReview.daysCount", { count: review.longestStreak })} styles={styles} c={c} />
              {review.busiestMonth !== null ? (
                <Fact icon="calendar-outline" label={t("yearReview.busiestMonth")} value={monthName(review.busiestMonth)} styles={styles} c={c} />
              ) : null}
              {review.favoriteWeekday !== null ? (
                <Fact icon="today-outline" label={t("yearReview.favoriteDay")} value={weekdayName(review.favoriteWeekday)} styles={styles} c={c} />
              ) : null}
              {review.favoriteTimeOfDay ? (
                <Fact icon="time-outline" label={t("yearReview.favoriteTime")} value={t(`yearReview.timeOfDay.${review.favoriteTimeOfDay}`)} styles={styles} c={c} />
              ) : null}
              {review.listeningMinutes > 0 ? (
                <Fact icon="headset-outline" label={t("yearReview.listening")} value={t("yearReview.hoursMinutes", { h: Math.floor(review.listeningMinutes / 60), m: review.listeningMinutes % 60 })} styles={styles} c={c} />
              ) : null}
              {review.averageRating !== null ? (
                <Fact icon="star-outline" label={t("yearReview.averageRating")} value={`${review.averageRating} / 5`} styles={styles} c={c} />
              ) : null}
            </View>
          </Section>

          {review.mostTimeWith || review.firstFinished || review.longestFinished ? (
            <Section title={t("yearReview.highlights")} styles={styles}>
              {bookRow(review.mostTimeWith, t("yearReview.mostTime"), review.mostTimeWith ? t("yearReview.hoursMinutes", { h: Math.floor(review.mostTimeWith.value / 60), m: review.mostTimeWith.value % 60 }) : undefined)}
              {bookRow(review.firstFinished, t("yearReview.first"))}
              {bookRow(review.lastFinished, t("yearReview.last"))}
              {bookRow(review.longestFinished, t("yearReview.longest"), review.longestFinished ? t("yearReview.pagesCount", { count: review.longestFinished.value }) : undefined)}
            </Section>
          ) : null}

          {review.topRated.length ? (
            <Section title={t("yearReview.topRated")} styles={styles}>
              {review.topRated.map((item) => bookRow(item, "★".repeat(Math.round(item.value))))}
            </Section>
          ) : null}

          {review.topAuthorIds.length || review.topGenres.length ? (
            <Section title={t("yearReview.favorites")} styles={styles}>
              {review.topAuthorIds.map((row, i) => (
                <Ranked key={`a-${row.label}`} place={i + 1} label={authorName(row.label)} value={t("yearReview.booksCount", { count: row.value })} styles={styles} />
              ))}
              {review.topGenres.length ? <View style={styles.divider} /> : null}
              {review.topGenres.map((row, i) => (
                <Ranked key={`g-${row.label}`} place={i + 1} label={row.label} value={t("yearReview.booksCount", { count: row.value })} styles={styles} />
              ))}
            </Section>
          ) : null}

          <Pressable accessibilityRole="button" style={styles.cta} onPress={share}>
            <Ionicons name="share-outline" size={20} color="#fff" />
            <Text style={styles.ctaText}>{t("yearReview.share")}</Text>
          </Pressable>
        </>
      ) : null}
    </Screen>
  );
}

type Styles = ReturnType<typeof createStyles>;

function Stat({ value, label, styles }: { value: string; label: string; styles: Styles }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Section({ title, children, styles }: { title: string; children: ReactNode; styles: Styles }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">{title}</Text>
      {children}
    </View>
  );
}

function Fact({ icon, label, value, styles, c }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; styles: Styles; c: AppColors }) {
  return (
    <View style={styles.fact}>
      <Ionicons name={icon} size={20} color={c.teal} />
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

function Ranked({ place, label, value, styles }: { place: number; label: string; value: string; styles: Styles }) {
  return (
    <View style={styles.ranked}>
      <Text style={styles.rankedPlace}>{place}</Text>
      <Text style={styles.rankedLabel} numberOfLines={1}>{label}</Text>
      <Text style={styles.rankedValue}>{value}</Text>
    </View>
  );
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    years: { gap: spacing.sm, paddingBottom: spacing.md },
    yearChip: { borderColor: c.border, borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 8 },
    yearChipActive: { backgroundColor: c.teal, borderColor: c.teal },
    yearChipText: { color: c.ink, fontFamily: fonts.body, fontSize: 15 },
    yearChipTextActive: { color: "#fff" },
    hero: { alignItems: "center", backgroundColor: withAlpha(c.teal, 0.12), borderRadius: radii.lg, padding: spacing.lg },
    heroEyebrow: { color: c.tealDark, fontFamily: fonts.body, fontSize: 14, letterSpacing: 0.5, textTransform: "uppercase" },
    heroEmpty: { color: c.muted, fontFamily: fonts.bodyRegular, fontSize: 16, lineHeight: 22, marginTop: spacing.md, textAlign: "center" },
    heroNumber: { color: c.ink, fontFamily: fonts.display, fontSize: 64, lineHeight: 72, marginTop: spacing.sm },
    heroUnit: { color: c.muted, fontFamily: fonts.body, fontSize: 16 },
    heroStats: { flexDirection: "row", marginTop: spacing.lg, width: "100%" },
    stat: { alignItems: "center", flex: 1 },
    statValue: { color: c.ink, fontFamily: fonts.body, fontSize: 24, fontWeight: "900" },
    statLabel: { color: c.muted, fontFamily: fonts.bodyRegular, fontSize: 13, marginTop: 2, textAlign: "center" },
    section: { backgroundColor: c.surface, borderRadius: radii.lg, marginTop: spacing.md, padding: spacing.md },
    sectionTitle: { color: c.ink, fontFamily: fonts.display, fontSize: 20, marginBottom: spacing.sm },
    factGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: spacing.md, rowGap: spacing.md },
    fact: { gap: 2, width: "50%" },
    factLabel: { color: c.muted, fontFamily: fonts.bodyRegular, fontSize: 13 },
    factValue: { color: c.ink, fontFamily: fonts.body, fontSize: 16, textTransform: "capitalize" },
    bookRow: { alignItems: "center", flexDirection: "row", gap: spacing.md, paddingVertical: spacing.sm },
    bookCopy: { flex: 1 },
    bookCaption: { color: c.tealDark, fontFamily: fonts.body, fontSize: 12, textTransform: "uppercase" },
    bookTitle: { color: c.ink, fontFamily: fonts.body, fontSize: 16 },
    bookDetail: { color: c.muted, fontFamily: fonts.bodyRegular, fontSize: 13 },
    ranked: { alignItems: "center", flexDirection: "row", gap: spacing.md, paddingVertical: 6 },
    rankedPlace: { color: c.teal, fontFamily: fonts.body, fontSize: 18, fontWeight: "900", width: 20 },
    rankedLabel: { color: c.ink, flex: 1, fontFamily: fonts.body, fontSize: 16 },
    rankedValue: { color: c.muted, fontFamily: fonts.bodyRegular, fontSize: 13 },
    divider: { backgroundColor: c.border, height: StyleSheet.hairlineWidth, marginVertical: spacing.sm },
    cta: { alignItems: "center", backgroundColor: c.teal, borderRadius: radii.md, flexDirection: "row", gap: spacing.sm, height: 52, justifyContent: "center", marginTop: spacing.lg },
    ctaText: { color: "#fff", fontFamily: fonts.body, fontSize: 17, fontWeight: "900" },
    locked: { alignItems: "center", paddingTop: spacing.xl },
    lockedIcon: { alignItems: "center", backgroundColor: withAlpha(c.gold, 0.18), borderRadius: 40, height: 80, justifyContent: "center", width: 80 },
    lockedTitle: { color: c.ink, fontFamily: fonts.display, fontSize: 26, marginTop: spacing.md, textAlign: "center" },
    lockedBody: { color: c.muted, fontFamily: fonts.bodyRegular, fontSize: 16, lineHeight: 22, marginTop: spacing.sm, textAlign: "center" },
  });
}
