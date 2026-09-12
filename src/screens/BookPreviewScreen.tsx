/**
 * BookPreviewScreen — rich preview for catalog books (Discover / GenreBrowse / Search).
 *
 * The "shop window" before adding: blurred cover backdrop + sharp floating cover,
 * rating, meta chips, synopsis. One clear CTA — Add to library — which hands off
 * to BookIntake's review flow with everything pre-filled.
 *
 * If the book is already in the user's library, the CTA becomes "Open in your
 * library" and navigates to BookDetail instead.
 */
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import {
  Image,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScalePressable } from "../components/ScalePressable";
import { useBookliz } from "../data/BooklizContext";
import { hapticMedium } from "../utils/haptics";
import { useI18n } from "../i18n/LocalizationContext";
import { RootStackParamList } from "../navigation/types";
import { AppColors, fonts, radii, shadows, spacing } from "../theme/theme";
import { useTheme } from "../theme/ThemeContext";

type PreviewRoute = RouteProp<RootStackParamList, "BookPreview">;
type Nav = NativeStackNavigationProp<RootStackParamList>;

function normalize(text: string | undefined): string {
  return (text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function BookPreviewScreen() {
  const { params } = useRoute<PreviewRoute>();
  const navigation = useNavigation<Nav>();
  const { colors: c, isDark } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(c, isDark), [c, isDark]);
  const { books, getAuthor } = useBookliz();
  const [synopsisExpanded, setSynopsisExpanded] = useState(false);

  const book = params.book;
  const authorName = book.authors[0] ?? t("bookPreview.unknownAuthor");
  // "A & B" for duos, "A, B & C" beyond — co-authors deserve their credit
  const displayAuthors = book.authors.length > 1
    ? `${book.authors.slice(0, -1).join(", ")} & ${book.authors[book.authors.length - 1]}`
    : authorName;

  // Already in library? Match by ISBN first, then by title + author.
  const libraryBook = useMemo(() => {
    if (book.isbn13) {
      const byIsbn = books.find((b) => b.isbn === book.isbn13);
      if (byIsbn) return byIsbn;
    }
    const wantedTitle = normalize(book.title);
    const wantedAuthor = normalize(authorName);
    return books.find((b) => {
      if (normalize(b.title) !== wantedTitle) return false;
      const libAuthor = normalize(getAuthor(b.authorId)?.name);
      return !wantedAuthor || !libAuthor || libAuthor === wantedAuthor;
    });
  }, [books, book.isbn13, book.title, authorName, getAuthor]);

  const fullStars = book.averageRating ? Math.round(book.averageRating) : 0;
  const ratingCountLabel = book.ratingsCount
    ? t("bookPreview.ratingsCount", {
        count: book.ratingsCount >= 1000 ? `${(book.ratingsCount / 1000).toFixed(1)}k` : book.ratingsCount,
      })
    : null;

  const genres = (book.genres ?? [])
    .filter((g) => !/^nyt:/i.test(g) && !/new york times/i.test(g))
    .filter((g, i, arr) => arr.indexOf(g) === i)
    .slice(0, 3);

  const handleAdd = (shelf: "library" | "wishlist") => {
    hapticMedium();
    navigation.navigate("BookIntake", {
      initialBookSelection: {
        shelf,
        title: book.title,
        authorName,
        coAuthorNames: book.authors.slice(1),
        isbn: book.isbn13,
        pages: book.pageCount,
        genre: book.genres ?? [],
        publishedDate: book.publishedYear ? `${book.publishedYear}-01-01` : undefined,
        language: book.language,
        synopsis: book.description,
        coverImageUri: book.coverUrl,
      },
    });
  };

  const heroCover = book.coverUrl?.replace(/zoom=1(?=&|$)/, "zoom=0");

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
      >
        {/* ── Hero: blurred backdrop + sharp floating cover ─────────────────── */}
        {/* paddingTop accounts for the transparent nav header */}
        <View style={[styles.hero, { paddingTop: insets.top + 52 }]}>
          {heroCover ? (
            <ImageBackground
              source={{ uri: heroCover }}
              style={StyleSheet.absoluteFill}
              blurRadius={26}
              imageStyle={{ resizeMode: "cover" }}
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: c.surfaceAlt }]} />
          )}
          <LinearGradient
            colors={
              isDark
                ? ["rgba(17,24,39,0.25)", "rgba(17,24,39,0.55)", c.bg]
                : ["rgba(252,248,241,0.18)", "rgba(252,248,241,0.55)", c.bg]
            }
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroCoverWrap}>
            {book.coverUrl ? (
              <Image source={{ uri: book.coverUrl }} style={styles.heroCover} resizeMode="cover" />
            ) : (
              <View style={[styles.heroCover, styles.heroCoverFallback]}>
                <Ionicons name="book-outline" size={42} color={c.muted} />
              </View>
            )}
          </View>
        </View>

        {/* ── Title block ───────────────────────────────────────────────────── */}
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{book.title}</Text>
          <Text style={styles.author} numberOfLines={2}>{displayAuthors}</Text>

          {fullStars > 0 ? (
            <View style={styles.ratingRow}>
              {[1, 2, 3, 4, 5].map((i) => (
                <Ionicons
                  key={i}
                  name={i <= fullStars ? "star" : "star-outline"}
                  size={15}
                  color={i <= fullStars ? c.gold : c.border}
                />
              ))}
              {book.averageRating ? (
                <Text style={styles.ratingValue}>{book.averageRating.toFixed(1)}</Text>
              ) : null}
              {ratingCountLabel ? <Text style={styles.ratingCount}>· {ratingCountLabel}</Text> : null}
            </View>
          ) : null}

          {libraryBook ? (
            <View style={styles.inLibraryPill}>
              <Ionicons name="checkmark-circle" size={14} color={c.teal} />
              <Text style={styles.inLibraryText}>{t("bookPreview.alreadyInLibrary")}</Text>
            </View>
          ) : null}
        </View>

        {/* ── Meta chips ────────────────────────────────────────────────────── */}
        <View style={styles.chipRow}>
          {genres.map((g) => (
            <View key={g} style={[styles.chip, { backgroundColor: c.teal + "1E", borderColor: c.teal + "44" }]}>
              <Text style={[styles.chipText, { color: c.tealDark }]}>{g}</Text>
            </View>
          ))}
          {book.publishedYear ? (
            <View style={styles.chip}><Text style={styles.chipText}>{book.publishedYear}</Text></View>
          ) : null}
          {book.pageCount ? (
            <View style={styles.chip}><Text style={styles.chipText}>{t("bookPreview.pagesCount", { count: book.pageCount })}</Text></View>
          ) : null}
          {book.language ? (
            <View style={styles.chip}><Text style={styles.chipText}>{book.language.toUpperCase()}</Text></View>
          ) : null}
        </View>

        {/* ── Synopsis ──────────────────────────────────────────────────────── */}
        {book.description ? (
          <View style={styles.synopsisCard}>
            <Text style={styles.eyebrow}>{t("bookDetail.synopsis")}</Text>
            <Pressable accessibilityRole="button" onPress={() => setSynopsisExpanded((v) => !v)}>
              <Text style={styles.synopsisText} numberOfLines={synopsisExpanded ? undefined : 6}>
                {book.description}
              </Text>
              <Text style={styles.synopsisToggle}>
                {synopsisExpanded ? t("bookDetail.showLess") : t("bookDetail.readMore")}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      {/* ── Sticky CTA ──────────────────────────────────────────────────────── */}
      <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 12 }]}>
        {libraryBook ? (
          <ScalePressable accessibilityRole="button"
            pressScale={0.97}
            style={[styles.ctaBtn, { backgroundColor: c.navy }]}
            onPress={() => navigation.navigate("BookDetail", { bookId: libraryBook.id })}
          >
            <Ionicons name="library-outline" size={18} color="#fff" />
            <Text style={styles.ctaText}>{t("bookPreview.openInLibrary")}</Text>
          </ScalePressable>
        ) : (
          /* Two shelves, two buttons. "Add" alone had to guess, and it always
             guessed "I own this" — which is how a book you were only thinking
             of buying ended up counted as one you had. */
          <View style={styles.ctaRow}>
            <ScalePressable
              accessibilityRole="button"
              pressScale={0.97}
              style={[styles.ctaBtn, styles.ctaBtnSplit, { backgroundColor: c.teal }]}
              onPress={() => handleAdd("library")}
            >
              <Ionicons name="library-outline" size={18} color="#fff" />
              <Text style={styles.ctaText}>{t("bookPreview.addToLibrary")}</Text>
            </ScalePressable>
            <ScalePressable
              accessibilityRole="button"
              pressScale={0.97}
              style={[styles.ctaBtn, styles.ctaBtnSplit, styles.ctaBtnSecondary]}
              onPress={() => handleAdd("wishlist")}
            >
              <Ionicons name="bookmark-outline" size={18} color={c.tealDark} />
              <Text style={[styles.ctaText, { color: c.tealDark }]}>{t("bookPreview.addToWishlist")}</Text>
            </ScalePressable>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function createStyles(c: AppColors, isDark: boolean) {
  return StyleSheet.create({
    root: { backgroundColor: c.bg, flex: 1 },

    // Hero
    hero: {
      alignItems: "center",
      justifyContent: "flex-end",
      minHeight: 320,
      overflow: "hidden",
      paddingBottom: spacing.lg,
      paddingTop: spacing.xl,
    },
    heroCoverWrap: {
      ...shadows.card,
      shadowOpacity: 0.35,
      shadowRadius: 22,
    },
    heroCover: {
      backgroundColor: c.surfaceAlt,
      borderRadius: radii.md,
      height: 256,
      width: 172,
    },
    heroCoverFallback: {
      alignItems: "center",
      borderColor: c.border,
      borderWidth: 1,
      justifyContent: "center",
    },

    // Title block
    titleBlock: { alignItems: "center", paddingHorizontal: spacing.lg, paddingTop: spacing.md },
    title: {
      color: c.ink,
      fontFamily: fonts.display,
      fontSize: 26,
      fontWeight: "900",
      lineHeight: 32,
      textAlign: "center",
    },
    author: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 15,
      fontWeight: "700",
      marginTop: 6,
    },
    ctaRow: { flexDirection: "row", gap: spacing.sm },
    ctaBtnSplit: { flex: 1, paddingHorizontal: spacing.sm },
    ctaBtnSecondary: {
      backgroundColor: isDark ? "rgba(20,184,166,0.16)" : "rgba(20,184,166,0.10)",
      borderColor: c.teal + "44",
      borderWidth: 1,
    },
    ratingRow: { alignItems: "center", flexDirection: "row", gap: 3, marginTop: spacing.sm },
    ratingValue: { color: c.ink, fontFamily: fonts.body, fontSize: 13, fontWeight: "900", marginLeft: 6 },
    ratingCount: { color: c.muted, fontFamily: fonts.body, fontSize: 12, fontWeight: "700" },
    inLibraryPill: {
      alignItems: "center",
      backgroundColor: c.teal + (isDark ? "26" : "16"),
      borderColor: c.teal + "55",
      borderRadius: radii.pill,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      marginTop: spacing.sm,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    inLibraryText: { color: c.tealDark, fontFamily: fonts.body, fontSize: 12, fontWeight: "800" },

    // Chips
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      justifyContent: "center",
      marginTop: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    chip: {
      backgroundColor: c.surfaceAlt,
      borderColor: c.border,
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 5,
    },
    chipText: { color: c.muted, fontFamily: fonts.body, fontSize: 12, fontWeight: "800" },

    // Synopsis
    synopsisCard: {
      ...shadows.card,
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: radii.sm,
      borderWidth: 1,
      marginHorizontal: spacing.md,
      marginTop: spacing.lg,
      padding: spacing.md,
    },
    eyebrow: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 0.8,
      marginBottom: spacing.sm,
      textTransform: "uppercase",
    },
    synopsisText: { color: c.ink, fontFamily: fonts.bodyRegular, fontSize: 14, lineHeight: 22 },
    synopsisToggle: { color: c.teal, fontFamily: fonts.body, fontSize: 12, fontWeight: "800", marginTop: 8 },

    // CTA
    ctaBar: {
      backgroundColor: c.bg,
      borderTopColor: c.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      bottom: 0,
      left: 0,
      paddingHorizontal: spacing.md,
      paddingTop: 12,
      position: "absolute",
      right: 0,
    },
    ctaBtn: {
      alignItems: "center",
      borderRadius: radii.pill,
      flexDirection: "row",
      gap: 8,
      justifyContent: "center",
      paddingVertical: 14,
    },
    ctaText: { color: "#FFFFFF", fontFamily: fonts.body, fontSize: 15, fontWeight: "900" },
  });
}
