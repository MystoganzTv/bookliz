import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMemo } from "react";
import { BookCard } from "../components/BookCard";
import { Screen } from "../components/Screen";
import { SectionHeader } from "../components/SectionHeader";
import { useBookliz } from "../data/BooklizContext";
import { useI18n } from "../i18n/LocalizationContext";
import { useIsWide } from "../utils/layout";
import { RootStackParamList } from "../navigation/types";
import { Achievement } from "../types/models";
import { AppColors, fonts, radii, shadows, spacing } from "../theme/theme";
import { useTheme } from "../theme/ThemeContext";
import { getAchievementIconSource } from "../utils/achievementIcons";

const TIER_COLOR: Record<Achievement["tier"], string> = {
  bronze: "#CD7F32",
  silver: "#A8A9AD",
  gold: "#FFC857",
  legendary: "#9B5DE5"
};

const READER_LEVELS = [
  { title: "Page Apprentice", minBooks: 0, note: "Starting the shelf." },
  { title: "Story Scout", minBooks: 2, note: "Testing your taste." },
  { title: "Shelf Wanderer", minBooks: 4, note: "Building rhythm." },
  { title: "Saga Cartographer", minBooks: 5, note: "Tracking worlds and arcs." },
  { title: "Chapter Curator", minBooks: 10, note: "Your shelves have shape." },
  { title: "Archive Architect", minBooks: 18, note: "Reading with intention." },
  { title: "Canon Keeper", minBooks: 30, note: "A serious personal library." },
  { title: "Mythic Reader", minBooks: 50, note: "A reader with gravity." },
  { title: "Legend Ledger", minBooks: 75, note: "The log becomes legacy." }
] as const;

type ProfileStyles = ReturnType<typeof createStyles>;

function UnlockedBubble({
  achievement,
  styles
}: {
  achievement: Achievement;
  styles: ProfileStyles;
}) {
  const source = getAchievementIconSource(achievement);
  const isCompound = Array.from(achievement.icon).length > 1;

  return (
    <View style={[styles.bubble, { borderColor: TIER_COLOR[achievement.tier] }]}>
      {source ? (
        <Image source={source} style={styles.achievementArtwork} resizeMode="contain" />
      ) : (
        <Text numberOfLines={1} style={[styles.achievementEmoji, isCompound && styles.achievementEmojiCompound]}>
          {achievement.icon}
        </Text>
      )}
    </View>
  );
}

export function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors: c } = useTheme();
  const { t, locale } = useI18n();
  const styles = useMemo(() => createStyles(c), [c]);
  const isWide = useIsWide();
  const { books, getAuthor, overallStats, repositoryStatus, userProfile } = useBookliz();

  const topBooks = userProfile.topBookIds.map((id) => books.find((b) => b.id === id)).filter(Boolean);
  const unlockedAchievements = userProfile.achievements.filter((achievement) => achievement.unlocked);
  const lockedAchievements = userProfile.achievements.filter((achievement) => !achievement.unlocked);
  const unlocked = unlockedAchievements.length;
  const goalPct = Math.min(100, Math.round((overallStats.booksReadThisYear / userProfile.yearlyGoal) * 100));
  const repositoryCopy = getRepositoryCopy(c, repositoryStatus, t, locale);
  const level = getReaderLevel(overallStats.totalBooksRead);
  const nextLevel = READER_LEVELS[level.index + 1];
  const nextLevelProgress = nextLevel
    ? Math.min(
        100,
        Math.round(
          ((overallStats.totalBooksRead - level.level.minBooks) / Math.max(1, nextLevel.minBooks - level.level.minBooks)) * 100
        )
      )
    : 100;
  const futureLevels = READER_LEVELS.slice(level.index + 1, level.index + 4);
  const nextUnlocks = [...lockedAchievements]
    .sort((a, b) => b.progress / Math.max(1, b.goal) - a.progress / Math.max(1, a.goal))
    .slice(0, 3);
  const identityStats = [
    { label: t("profile.books"), value: String(overallStats.totalBooksRead) },
    { label: t("profile.sessions"), value: String(overallStats.totalSessions) },
    { label: t("profile.badges"), value: String(unlocked) }
  ];

  return (
    <Screen wide>
      <View style={styles.hero}>
        <View style={styles.heroGlowLarge} />
        <View style={styles.heroGlowSmall} />

        <View style={styles.heroTop}>
          <View style={styles.avatarWrap}>
            {userProfile.avatarUri ? (
              <Image source={{ uri: userProfile.avatarUri }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{userProfile.avatarInitials}</Text>
              </View>
            )}
            <View style={styles.rankMedallion}>
              <Ionicons name="sparkles" size={12} color={c.navy} />
            </View>
          </View>

          <View style={styles.heroCopy}>
            <Text style={styles.name}>{userProfile.name}</Text>
            <Text style={styles.level}>{level.level.title}</Text>
            <Text style={styles.levelNote}>{level.level.note}</Text>
            {userProfile.email ? <Text style={styles.email}>{userProfile.email}</Text> : null}
          </View>

          <View style={styles.heroActions}>
            <Pressable
              style={styles.editButton}
              onPress={() => navigation.navigate("EditProfile")}
              accessibilityRole="button"
              accessibilityLabel={t("a11y.editProfile")}
            >
              <Ionicons name="pencil" size={14} color="#FFFFFF" />
            </Pressable>
            <Pressable
              style={styles.editButton}
              onPress={() => navigation.navigate("Settings")}
              accessibilityRole="button"
              accessibilityLabel={t("a11y.openSettings")}
            >
              <Ionicons name="settings-outline" size={14} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>

        <View style={styles.heroStatsRow}>
          {identityStats.map((item) => (
            <View key={item.label} style={styles.heroStatCard}>
              <Text style={styles.heroStatValue}>{item.value}</Text>
              <Text style={styles.heroStatLabel}>{item.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.heroFooter}>
          <View style={styles.heroFooterPill}>
            <Ionicons name="cloud-done-outline" size={12} color={repositoryCopy.accent} />
            <Text style={styles.heroFooterText}>{repositoryCopy.title}</Text>
          </View>
          <View style={styles.heroFooterPill}>
            <Ionicons name="ribbon-outline" size={12} color={c.gold} />
            <Text style={styles.heroFooterText}>
              {nextLevel
                ? t("profile.booksToNext", { count: nextLevel.minBooks - overallStats.totalBooksRead, level: nextLevel.title })
                : t("profile.topRankReached")}
            </Text>
          </View>
        </View>
      </View>

      {/*
        Wide windows: the three short cards stack on the left and the tall
        achievements card takes the right, so the two sides finish at roughly
        the same height instead of leaving one long gap.
      */}
      <View style={isWide ? styles.columns : undefined}>
        <View style={isWide ? styles.column : undefined}>
      <View style={styles.identityCard}>
        <View style={styles.identityHeader}>
          <View>
            <Text style={styles.identityEyebrow}>{t("profile.readerPath")}</Text>
            <Text style={styles.identityTitle}>
              {nextLevel ? `${t("profile.nextPrefix")} ${nextLevel.title}` : t("profile.readingLegend")}
            </Text>
          </View>
          <Text style={styles.identityPct}>{nextLevelProgress}%</Text>
        </View>
        <Text style={styles.identityBody}>
          {nextLevel
            ? t("profile.booksLoggedToUnlock", { count: overallStats.totalBooksRead, level: nextLevel.title })
            : t("profile.highestTier")}
        </Text>
        <View style={styles.goalTrack}>
          <View style={[styles.goalFill, { width: `${nextLevelProgress}%` }]} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.futureLevelsRow}>
          {futureLevels.map((futureLevel) => (
            <View key={futureLevel.title} style={styles.futureLevelCard}>
              <Text style={styles.futureLevelBooks}>{t("profile.futureBooks", { count: futureLevel.minBooks })}</Text>
              <Text style={styles.futureLevelTitle}>{futureLevel.title}</Text>
              <Text style={styles.futureLevelNote}>{futureLevel.note}</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      <View style={styles.goalCard}>
        <View style={styles.goalRow}>
          <View>
            <Text style={styles.goalLabel}>{t("profile.annualGoal")}</Text>
            <Text style={styles.goalText}>{overallStats.booksReadThisYear} / {userProfile.yearlyGoal} books</Text>
          </View>
          <Text style={styles.goalPct}>{goalPct}%</Text>
        </View>
        <View style={styles.goalTrack}>
          <View style={[styles.goalFill, { width: `${goalPct}%` }]} />
        </View>
        <Text style={styles.goalHint}>
          {goalPct >= 100
            ? t("profile.annualReached")
            : t("profile.annualRemaining", { count: Math.max(0, userProfile.yearlyGoal - overallStats.booksReadThisYear) })}
        </Text>
      </View>

      <Pressable accessibilityRole="button" style={styles.statsNavCard} onPress={() => navigation.navigate("Stats")}>
        <Ionicons name="stats-chart-outline" size={20} color={c.teal} />
        <Text style={styles.statsNavLabel}>{t("profile.viewStats")}</Text>
        <Ionicons name="chevron-forward" size={16} color={c.muted} style={{ marginLeft: "auto" }} />
      </Pressable>

        </View>
        <View style={isWide ? styles.column : undefined}>
      <Pressable accessibilityRole="button" style={styles.achievementsCard} onPress={() => navigation.navigate("Achievements")}>
        <View style={styles.achievementsCardTop}>
          <View>
            <Text style={styles.achievementsEyebrow}>{t("profile.achievements")}</Text>
            <Text style={styles.achievementsCount}>
              {unlocked} <Text style={styles.achievementsCountMuted}>{t("profile.unlockedSuffix", { total: userProfile.achievements.length })}</Text>
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={c.muted} />
        </View>

        {unlocked > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bubblesRow}>
            {unlockedAchievements.slice(0, 6).map((achievement) => (
              <UnlockedBubble key={achievement.id} achievement={achievement} styles={styles} />
            ))}
            {unlockedAchievements.length > 6 ? (
              <View style={styles.lockedCount}>
                <Ionicons name="sparkles" size={12} color={c.gold} />
                <Text style={styles.lockedCountText}>+{unlockedAchievements.length - 6}</Text>
              </View>
            ) : null}
          </ScrollView>
        ) : (
          <Text style={styles.achievementsEmpty}>{t("profile.achievementsEmpty")}</Text>
        )}

        <View style={styles.nextUnlocksWrap}>
          <Text style={styles.nextUnlocksTitle}>{t("profile.closestUnlocks")}</Text>
          {nextUnlocks.map((achievement) => {
            const progressPct = Math.min(100, Math.round((achievement.progress / Math.max(1, achievement.goal)) * 100));
            const iconSource = getAchievementIconSource(achievement);

            return (
              <View key={achievement.id} style={styles.nextUnlockCard}>
                <View style={styles.nextUnlockHeader}>
                  <View style={styles.nextUnlockTitleWrap}>
                    {iconSource ? <Image source={iconSource} style={styles.nextUnlockIcon} resizeMode="contain" /> : null}
                    <View style={styles.nextUnlockCopy}>
                      <Text style={styles.nextUnlockName}>{achievement.title}</Text>
                      <Text style={styles.nextUnlockMeta}>{achievement.progress} / {achievement.goal}</Text>
                    </View>
                  </View>
                  <Text style={styles.nextUnlockPct}>{progressPct}%</Text>
                </View>
                <View style={styles.nextUnlockTrack}>
                  <View style={[styles.nextUnlockFill, { width: `${progressPct}%` }]} />
                </View>
              </View>
            );
          })}
        </View>
      </Pressable>

      {topBooks.length > 0 ? (
        <>
          <SectionHeader title={t("profile.personalFavorites")} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {topBooks.map((book) =>
              book ? (
                <BookCard
                  key={book.id}
                  authorName={getAuthor(book.authorId)?.name ?? ""}
                  book={book}
                  onPress={() => navigation.navigate("BookDetail", { bookId: book.id })}
                />
              ) : null
            )}
          </ScrollView>
        </>
      ) : null}

      {userProfile.favoriteGenres.length > 0 ? (
        <>
          <SectionHeader title={t("profile.favoriteGenres")} />
          <View style={styles.tagWrap}>
            {userProfile.favoriteGenres.map((genre) => (
              <View key={genre} style={[styles.tagPill, styles.tagPillGenre]}>
                <Text style={[styles.tagText, styles.tagTextGenre]}>{genre}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {userProfile.favoriteAuthors.length > 0 ? (
        <>
          <SectionHeader title={t("profile.favoriteAuthors")} />
          <View style={styles.tagWrap}>
            {userProfile.favoriteAuthors.map((author) => (
              <View key={author} style={[styles.tagPill, styles.tagPillAuthor]}>
                <Text style={[styles.tagText, styles.tagTextAuthor]}>{author}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

        </View>
      </View>
    </Screen>
  );
}

function getReaderLevel(totalBooksRead: number) {
  const index = READER_LEVELS.reduce((current, level, levelIndex) => (
    totalBooksRead >= level.minBooks ? levelIndex : current
  ), 0);
  return { index, level: READER_LEVELS[index] };
}

function getRepositoryCopy(
  c: AppColors,
  repositoryStatus: ReturnType<typeof useBookliz>["repositoryStatus"],
  t: (key: string, vars?: Record<string, string | number>) => string,
  locale: string
) {
  if (repositoryStatus.syncState === "error") {
    return {
      accent: c.coral,
      title: t("profile.syncNeedsAttention"),
      body: repositoryStatus.lastError ?? "Bookliz could not persist your latest changes."
    };
  }

  // Only claim cloud sync when the user is actually signed in to a cloud account.
  // Otherwise be honest: data lives on this device only.
  if (repositoryStatus.remoteEnabled && repositoryStatus.cloudSignedIn) {
    return {
      accent: c.teal,
      title: repositoryStatus.lastSavedAt ? t("profile.cloudSyncActive") : t("profile.cloudSyncConnected"),
      body: repositoryStatus.lastSavedAt
        ? t("profile.syncLastSaved", { time: formatSyncTime(repositoryStatus.lastSavedAt, locale) })
        : t("profile.cloudConnectedBody")
    };
  }

  return {
    accent: c.green,
    title: t("profile.savedOnDevice"),
    body: repositoryStatus.lastSavedAt
      ? t("profile.localLastSaved", { time: formatSyncTime(repositoryStatus.lastSavedAt, locale) })
      : t("profile.localStored")
  };
}

function formatSyncTime(timestamp: string, locale: string) {
  const parsed = new Date(timestamp);
  return parsed.toLocaleString(locale === "es" ? "es-ES" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
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
    hero: {
      ...shadows.card,
      backgroundColor: c.navy,
      borderRadius: radii.lg,
      marginBottom: spacing.md,
      overflow: "hidden",
      padding: spacing.lg,
      position: "relative"
    },
    heroGlowLarge: {
      backgroundColor: c.teal + "24",
      borderRadius: 180,
      height: 220,
      position: "absolute",
      right: -60,
      top: -30,
      width: 220
    },
    heroGlowSmall: {
      backgroundColor: c.gold + "24",
      borderRadius: 90,
      bottom: -30,
      height: 120,
      left: -20,
      position: "absolute",
      width: 120
    },
    heroTop: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.md,
      zIndex: 1
    },
    heroActions: {
      alignItems: "center",
      gap: spacing.sm
    },
    avatarWrap: {
      position: "relative"
    },
    avatar: {
      alignItems: "center",
      backgroundColor: c.gold,
      borderRadius: 38,
      height: 76,
      justifyContent: "center",
      width: 76
    },
    avatarImage: {
      borderColor: "rgba(255,255,255,0.16)",
      borderRadius: 38,
      borderWidth: 2,
      height: 76,
      width: 76
    },
    avatarText: {
      color: c.navy,
      fontFamily: fonts.display,
      fontSize: 28,
      fontWeight: "900"
    },
    rankMedallion: {
      alignItems: "center",
      backgroundColor: c.gold,
      borderColor: c.navy,
      borderRadius: radii.pill,
      borderWidth: 2,
      bottom: -4,
      height: 24,
      justifyContent: "center",
      position: "absolute",
      right: -4,
      width: 24
    },
    heroCopy: {
      flex: 1
    },
    name: {
      color: "#FFFFFF",
      fontFamily: fonts.display,
      fontSize: 24,
      fontWeight: "900"
    },
    levelEyebrow: {
      color: "rgba(140,232,219,0.92)",
      fontFamily: fonts.body,
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 1.1,
      marginTop: 3,
      textTransform: "uppercase"
    },
    level: {
      color: c.gold,
      fontFamily: fonts.display,
      fontSize: 20,
      fontWeight: "900",
      marginTop: 2
    },
    levelNote: {
      color: "rgba(255,255,255,0.80)",
      fontFamily: fonts.bodyRegular,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 4
    },
    email: {
      color: "rgba(255,255,255,0.68)",
      fontFamily: fonts.bodyRegular,
      fontSize: 12,
      marginTop: 6
    },
    editButton: {
      alignItems: "center",
      alignSelf: "flex-start",
      backgroundColor: "rgba(255,255,255,0.12)",
      borderColor: "rgba(255,255,255,0.18)",
      borderRadius: radii.pill,
      borderWidth: 1,
      justifyContent: "center",
      padding: 10
    },
    heroStatsRow: {
      flexDirection: "row",
      gap: spacing.sm,
      marginTop: spacing.md,
      zIndex: 1
    },
    heroStatCard: {
      backgroundColor: "rgba(255,255,255,0.08)",
      borderColor: "rgba(255,255,255,0.10)",
      borderRadius: radii.md,
      borderWidth: 1,
      flex: 1,
      paddingHorizontal: spacing.md,
      paddingVertical: 12
    },
    heroStatValue: {
      color: "#FFFFFF",
      fontFamily: fonts.display,
      fontSize: 20,
      fontWeight: "900"
    },
    heroStatLabel: {
      color: "rgba(255,255,255,0.70)",
      fontFamily: fonts.body,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.8,
      marginTop: 2,
      textTransform: "uppercase"
    },
    heroFooter: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
      marginTop: spacing.md,
      zIndex: 1
    },
    heroFooterPill: {
      alignItems: "center",
      backgroundColor: "rgba(255,255,255,0.08)",
      borderRadius: radii.pill,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8
    },
    heroFooterText: {
      color: "#FFFFFF",
      fontFamily: fonts.body,
      fontSize: 11,
      fontWeight: "800"
    },
    identityCard: {
      ...shadows.card,
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: radii.lg,
      borderWidth: 1,
      marginBottom: spacing.md,
      padding: spacing.md
    },
    identityHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between"
    },
    identityEyebrow: {
      color: c.tealDark,
      fontFamily: fonts.body,
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 1,
      textTransform: "uppercase"
    },
    identityTitle: {
      color: c.ink,
      fontFamily: fonts.display,
      fontSize: 24,
      fontWeight: "900",
      marginTop: 2
    },
    identityPct: {
      color: c.teal,
      fontFamily: fonts.display,
      fontSize: 22,
      fontWeight: "900"
    },
    identityBody: {
      color: c.muted,
      fontFamily: fonts.bodyRegular,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 6
    },
    goalCard: {
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: radii.lg,
      borderWidth: 1,
      marginBottom: spacing.md,
      padding: spacing.md
    },
    goalRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between"
    },
    goalLabel: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1,
      textTransform: "uppercase"
    },
    goalPct: {
      color: c.green,
      fontFamily: fonts.display,
      fontSize: 20,
      fontWeight: "900"
    },
    goalText: {
      color: c.ink,
      fontFamily: fonts.display,
      fontSize: 22,
      fontWeight: "900",
      marginTop: 3
    },
    goalTrack: {
      backgroundColor: c.border,
      borderRadius: radii.pill,
      height: 10,
      marginTop: spacing.sm,
      overflow: "hidden"
    },
    goalFill: {
      backgroundColor: c.green,
      borderRadius: radii.pill,
      height: "100%"
    },
    goalHint: {
      color: c.muted,
      fontFamily: fonts.bodyRegular,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 8
    },
    futureLevelsRow: {
      gap: spacing.sm,
      paddingTop: spacing.md
    },
    futureLevelCard: {
      backgroundColor: c.surfaceAlt,
      borderColor: c.border,
      borderRadius: radii.md,
      borderWidth: 1,
      minHeight: 108,
      padding: spacing.md,
      width: 160
    },
    futureLevelBooks: {
      color: c.tealDark,
      fontFamily: fonts.body,
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 0.8,
      textTransform: "uppercase"
    },
    futureLevelTitle: {
      color: c.ink,
      fontFamily: fonts.display,
      fontSize: 18,
      fontWeight: "900",
      marginTop: 6
    },
    futureLevelNote: {
      color: c.muted,
      fontFamily: fonts.bodyRegular,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 6
    },
    statsNavCard: {
      ...shadows.card,
      alignItems: "center",
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: radii.sm,
      borderWidth: 1,
      flexDirection: "row",
      gap: spacing.sm,
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: 14,
    },
    statsNavLabel: {
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 14,
      fontWeight: "900",
    },
    achievementsCard: {
      ...shadows.card,
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: radii.lg,
      borderWidth: 1,
      marginBottom: spacing.md,
      padding: spacing.md
    },
    achievementsCardTop: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: spacing.md
    },
    achievementsEyebrow: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 1,
      textTransform: "uppercase"
    },
    achievementsCount: {
      color: c.ink,
      fontFamily: fonts.display,
      fontSize: 22,
      fontWeight: "900",
      marginTop: 2
    },
    achievementsCountMuted: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 16,
      fontWeight: "700"
    },
    bubblesRow: {
      flexDirection: "row"
    },
    bubble: {
      alignItems: "center",
      backgroundColor: c.surfaceAlt,
      borderRadius: 32,
      borderWidth: 2,
      height: 64,
      justifyContent: "center",
      marginRight: spacing.sm,
      width: 64
    },
    achievementArtwork: {
      height: 60,
      width: 60
    },
    achievementEmoji: {
      fontSize: 25,
      includeFontPadding: false,
      lineHeight: 34,
      minWidth: 48,
      textAlign: "center"
    },
    achievementEmojiCompound: {
      fontSize: 20,
      lineHeight: 28,
      minWidth: 58
    },
    lockedCount: {
      alignItems: "center",
      backgroundColor: c.surfaceAlt,
      borderRadius: 28,
      flexDirection: "row",
      gap: 4,
      height: 52,
      justifyContent: "center",
      paddingHorizontal: 14
    },
    lockedCountText: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: "900"
    },
    achievementsEmpty: {
      color: c.muted,
      fontFamily: fonts.bodyRegular,
      fontSize: 13,
      lineHeight: 19
    },
    nextUnlocksWrap: {
      marginTop: spacing.md
    },
    nextUnlocksTitle: {
      color: c.ink,
      fontFamily: fonts.display,
      fontSize: 18,
      fontWeight: "900",
      marginBottom: spacing.sm
    },
    nextUnlockCard: {
      backgroundColor: c.surfaceAlt,
      borderRadius: radii.md,
      marginTop: spacing.sm,
      padding: spacing.sm
    },
    nextUnlockHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between"
    },
    nextUnlockTitleWrap: {
      alignItems: "center",
      flexDirection: "row",
      flex: 1,
      gap: spacing.sm
    },
    nextUnlockIcon: {
      height: 42,
      width: 42
    },
    nextUnlockCopy: {
      flex: 1
    },
    nextUnlockName: {
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: "900"
    },
    nextUnlockMeta: {
      color: c.muted,
      fontFamily: fonts.bodyRegular,
      fontSize: 12,
      marginTop: 2
    },
    nextUnlockPct: {
      color: c.tealDark,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: "900"
    },
    nextUnlockTrack: {
      backgroundColor: c.border,
      borderRadius: radii.pill,
      height: 8,
      marginTop: 10,
      overflow: "hidden"
    },
    nextUnlockFill: {
      backgroundColor: c.teal,
      borderRadius: radii.pill,
      height: "100%"
    },
    tagWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
      marginBottom: spacing.md
    },
    tagPill: {
      borderRadius: radii.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: 9
    },
    tagPillGenre: {
      backgroundColor: c.surfaceAlt,
      borderColor: c.border,
      borderWidth: 1
    },
    tagPillAuthor: {
      backgroundColor: c.surface,
      borderColor: c.border,
      borderWidth: 1
    },
    tagText: {
      fontFamily: fonts.body,
      fontSize: 12,
      fontWeight: "900"
    },
    tagTextGenre: {
      color: c.tealDark
    },
    tagTextAuthor: {
      color: c.ink
    },
  });
}
