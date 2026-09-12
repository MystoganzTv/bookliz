import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { ImageBackground, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { Book, ReadingFormat } from "../types/models";
import { colors, fonts, radii, shadows } from "../theme/theme";
import { isAwaitingCopy } from "../data/shelfRules";
import { statusLabelKey } from "../utils/statusLabels";
import { useI18n } from "../i18n/LocalizationContext";
import { Badge } from "./Badge";
import { ProgressRing } from "./ProgressRing";

type BookCoverProps = {
  book: Book;
  size?: "sm" | "md" | "lg";
  style?: StyleProp<ViewStyle>;
  hideProgress?: boolean;
};

const dimensions = {
  sm: { width: 82, height: 122 },
  md: { width: 112, height: 164 },
  lg: { width: 176, height: 252 }
};

/**
 * Covers render grey when the reader has no copy yet. Exported so the grid and
 * the list rows stay consistent; the rule itself lives in shelfRules because
 * status alone cannot answer it — an owned, unstarted book is `want-to-read`.
 */
export const isMutedBook = (book: Book) => isAwaitingCopy(book.userStatus);

const isMuted = isMutedBook;

/** Icon for non-physical formats; null = physical, no badge. */
export function formatBadgeIcon(format: ReadingFormat): "headset" | "tablet-portrait" | null {
  if (format === "audiobook") return "headset";
  if (format === "ebook" || format === "kindle") return "tablet-portrait";
  return null;
}

/** Small overlay chip marking audiobooks / ebooks on a cover. */
export function FormatBadge({ format, size = 12, style }: {
  format: ReadingFormat;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const icon = formatBadgeIcon(format);
  if (!icon) return null;
  return (
    <View style={[styles.formatBadge, style]}>
      <Ionicons name={icon} size={size} color="#FFFFFF" />
    </View>
  );
}

export function BookCover({ book, size = "md", style, hideProgress = false }: BookCoverProps) {
  const muted = isMuted(book);
  const dimmed = book.userStatus.status === "dnf";
  const gradient = muted ? (["#CBC6BE", "#827C73"] as [string, string]) : book.coverGradient;
  const showTypographyOverlay = !book.coverImageUri;

  return (
    <View style={[styles.wrap, dimensions[size], style, dimmed && styles.dimmed]}>
      {book.coverImageUri ? (
        <ImageBackground
          source={{ uri: book.coverImageUri }}
          style={styles.cover}
          // Audiobook editions often ship square art — contain shows it whole.
          // Everything else keeps the full-bleed cover look.
          imageStyle={[styles.imageCover, book.format === "audiobook" && { resizeMode: "contain" }]}
        >
          {muted ? <View style={styles.mutedOverlay} /> : null}
          <CoverContent book={book} size={size} showTypographyOverlay={showTypographyOverlay} hideProgress={hideProgress} />
        </ImageBackground>
      ) : (
        <LinearGradient colors={gradient} style={styles.cover}>
          <CoverContent book={book} size={size} showTypographyOverlay={showTypographyOverlay} hideProgress={hideProgress} />
        </LinearGradient>
      )}
    </View>
  );
}

function CoverContent({
  book,
  size,
  showTypographyOverlay,
  hideProgress = false,
}: BookCoverProps & { showTypographyOverlay: boolean; hideProgress?: boolean }) {
  const { t } = useI18n();
  return (
    <>
      {showTypographyOverlay ? <View style={styles.sheen} /> : <View style={styles.photoShade} />}
      {showTypographyOverlay ? (
        <>
          <Text numberOfLines={4} style={[styles.title, size === "sm" && styles.smallTitle]}>
            {book.title}
          </Text>
          {book.seriesNumber ? <Text style={styles.series}>Book {book.seriesNumber}</Text> : null}
        </>
      ) : null}
      {!hideProgress && book.userStatus.status === "reading" && (book.userStatus.progressPercent ?? 0) > 0 ? (
        <View style={styles.progress}>
          <ProgressRing progress={book.userStatus.progressPercent} size={size === "lg" ? 48 : 36} />
        </View>
      ) : null}
      {book.userStatus.status === "dnf" ? (
        <View style={styles.dnfBadge}>
          <Badge label={t(statusLabelKey(book.userStatus.status))} tone="danger" />
        </View>
      ) : null}
      <FormatBadge format={book.format} size={size === "sm" ? 13 : 15} />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
    borderRadius: 22,
    overflow: "hidden"
  },
  cover: {
    backgroundColor: colors.navy2,
    flex: 1,
    justifyContent: "flex-end",
    overflow: "hidden",
    padding: 12
  },
  imageCover: {
    borderRadius: 22,
    resizeMode: "cover"
  },
  mutedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(94,89,82,0.52)"
  },
  photoShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(7,17,35,0.16)"
  },
  sheen: {
    backgroundColor: "rgba(255,255,255,0.16)",
    height: 180,
    left: -70,
    position: "absolute",
    top: -35,
    transform: [{ rotate: "24deg" }],
    width: 58
  },
  title: {
    color: colors.card,
    fontFamily: fonts.display,
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 25,
    textShadowColor: "rgba(15,23,42,0.34)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8
  },
  smallTitle: {
    fontSize: 15,
    lineHeight: 18
  },
  series: {
    color: "rgba(255,255,255,0.86)",
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 8,
    textTransform: "uppercase"
  },
  progress: {
    position: "absolute",
    right: 8,
    top: 8
  },
  dnfBadge: {
    left: 8,
    position: "absolute",
    top: 8
  },
  dimmed: {
    opacity: 0.58
  },
  formatBadge: {
    alignItems: "center",
    backgroundColor: "#14B8A6",
    borderColor: "rgba(255,255,255,0.85)",
    borderRadius: 999,
    borderWidth: 1.5,
    bottom: 7,
    elevation: 4,
    height: 28,
    justifyContent: "center",
    left: 7,
    position: "absolute",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    width: 28
  }
});
