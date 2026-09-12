/**
 * bookIntake/components — presentational pieces of the Add-book flow.
 * Extracted from BookIntakeScreen: no business logic, no navigation, no state
 * machine — just rendering. The screen file keeps the flow orchestration.
 */
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { BookMatch } from "../../services/bookLookupService";
import { formatIsbn13 } from "../../utils/isbnUtils";
import { matchMetaLine } from "./matchLogic";
import { ScanQueueEntry, ScanShelfChoice } from "./scanQueue";
import { fonts, radii, spacing } from "../../theme/theme";
import { useColors, useTheme } from "../../theme/ThemeContext";
import { BookEditionOption } from "../../utils/bookMetadata";
import { ScalePressable } from "../../components/ScalePressable";
import { createStyles } from "./styles";
import { useI18n } from "../../i18n/LocalizationContext";

export type IconName = keyof typeof Ionicons.glyphMap;

// ─── Animated scan line ───────────────────────────────────────────────────────

export function ScanLine() {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  return (
    <Animated.View
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        height: 2,
        backgroundColor: "#14B8A6",
        opacity: 0.85,
        transform: [
          {
            translateY: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 100],
            }),
          },
        ],
      }}
    />
  );
}

type IntakePathProps = {
  title: string;
  description: string;
  icon: IconName;
  accent: string;
  onPress: () => void;
};

export function IntakePath({ title, description, icon, accent, onPress }: IntakePathProps) {
  const c = useColors();
  const { isDark } = useTheme();
  const styles = useMemo(() => createStyles(c, isDark), [c, isDark]);
  return (
    <Pressable accessibilityRole="button" style={styles.pathCard} onPress={onPress}>
      <View style={[styles.pathIcon, { backgroundColor: accent, borderColor: isDark && accent === c.surface ? c.border : "transparent", borderWidth: isDark && accent === c.surface ? 1 : 0 }]}>
        <Ionicons color={isDark && accent === c.surface ? c.ink : "#FFFFFF"} name={icon} size={24} />
      </View>
      <Text style={styles.pathTitle}>{title}</Text>
      <Text style={styles.pathDescription}>{description}</Text>
    </Pressable>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  hint?: string;
  keyboardType?: "default" | "number-pad";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  multiline?: boolean;
};

export function Field({
  label,
  value,
  onChangeText,
  hint,
  keyboardType = "default",
  autoCapitalize = "sentences",
  multiline = false
}: FieldProps) {
  const c = useColors();
  const { isDark } = useTheme();
  const styles = useMemo(() => createStyles(c, isDark), [c, isDark]);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      <TextInput
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        multiline={multiline}
        placeholderTextColor={c.gray}
        style={[styles.input, multiline && styles.textArea]}
        value={value}
        onChangeText={onChangeText}
      />
    </View>
  );
}

const MODAL_LANGUAGES = ["English", "Spanish", "French", "German", "Swedish", "Portuguese", "Italian", "Dutch", "Russian", "Japanese", "Chinese", "Korean", "Arabic", "Polish", "Turkish"];

/** Compact language selector — shows a short prioritized list, custom input at the bottom. */
export function CompactLanguageModal({
  visible,
  selected,
  preferredLanguages,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selected: string;
  preferredLanguages: string[];
  onSelect: (lang: string) => void;
  onClose: () => void;
}) {
  const c = useColors();
  const { isDark } = useTheme();
  const [custom, setCustom] = useState("");

  // Build prioritized list: user's preferred languages first, then defaults, deduped
  const prioritized = Array.from(new Set([
    ...preferredLanguages.filter((l) => MODAL_LANGUAGES.includes(l)),
    "English", "Spanish", "French", "German", "Swedish",
  ])).slice(0, 8);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" style={styles_modal.backdrop} onPress={onClose} />
      <View style={[styles_modal.sheet, { backgroundColor: isDark ? "#1E293B" : "#FFFFFF" }]}>
        <View style={styles_modal.handle} />
        <Text style={[styles_modal.title, { color: isDark ? "#F1F5F9" : "#0F172A" }]}>Language</Text>
        <ScrollView style={styles_modal.list} showsVerticalScrollIndicator={false}>
          {prioritized.map((lang) => (
            <Pressable accessibilityRole="button"
              key={lang}
              style={[styles_modal.row, selected === lang && styles_modal.rowActive]}
              onPress={() => onSelect(lang)}
            >
              <Text style={[styles_modal.rowText, { color: isDark ? "#F1F5F9" : "#0F172A" }, selected === lang && styles_modal.rowTextActive]}>
                {lang}
              </Text>
              {selected === lang ? <Ionicons name="checkmark-outline" size={16} color="#14B8A6" /> : null}
            </Pressable>
          ))}
          <View style={styles_modal.divider} />
          {MODAL_LANGUAGES.filter((l) => !prioritized.includes(l)).map((lang) => (
            <Pressable accessibilityRole="button"
              key={lang}
              style={[styles_modal.row, selected === lang && styles_modal.rowActive]}
              onPress={() => onSelect(lang)}
            >
              <Text style={[styles_modal.rowText, { color: isDark ? "#CBD5E1" : "#475569" }, selected === lang && styles_modal.rowTextActive]}>
                {lang}
              </Text>
              {selected === lang ? <Ionicons name="checkmark-outline" size={16} color="#14B8A6" /> : null}
            </Pressable>
          ))}
          <View style={styles_modal.divider} />
          <TextInput
            placeholder="Other language…"
            placeholderTextColor="#94A3B8"
            style={[styles_modal.customInput, { color: isDark ? "#F1F5F9" : "#0F172A", borderColor: isDark ? "#334155" : "#E2E8F0" }]}
            value={custom}
            onChangeText={setCustom}
            onSubmitEditing={() => { if (custom.trim()) onSelect(custom.trim()); }}
            returnKeyType="done"
          />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles_modal = StyleSheet.create({  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "70%", paddingBottom: 32, paddingHorizontal: 20, paddingTop: 12 },
  handle: { alignSelf: "center", backgroundColor: "#94A3B8", borderRadius: 2, height: 4, marginBottom: 16, width: 40 },
  title: { fontFamily: "Lora-Bold", fontSize: 17, fontWeight: "700", marginBottom: 12 },
  list: { maxHeight: 380 },
  row: { alignItems: "center", borderRadius: 10, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 13 },
  rowActive: { backgroundColor: "rgba(20,184,166,0.12)" },
  rowText: { fontSize: 15 },
  rowTextActive: { color: "#14B8A6", fontWeight: "700" },
  divider: { backgroundColor: "#E2E8F0", height: 1, marginVertical: 6 },
  customInput: { borderRadius: 10, borderWidth: 1, fontSize: 14, marginTop: 4, paddingHorizontal: 12, paddingVertical: 11 },
});

export function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

// ─── Edition picker modal ──────────────────────────────────────────────────────

export function EditionPickerModal({
  visible,
  loading,
  options,
  selectedIsbn,
  selectedEditionKey,
  onSelect,
  onClose,
}: {
  visible: boolean;
  loading: boolean;
  options: BookEditionOption[];
  selectedIsbn?: string;
  selectedEditionKey?: string;
  onSelect: (option: BookEditionOption) => void;
  onClose: () => void;
}) {
  const { isDark } = useTheme();
  const isSelected = (o: BookEditionOption) =>
    Boolean((selectedEditionKey && o.editionKey === selectedEditionKey) ||
      (selectedIsbn && o.isbn && o.isbn === selectedIsbn));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" style={styles_modal.backdrop} onPress={onClose} />
      <View style={[styles_modal.sheet, { backgroundColor: isDark ? "#1E293B" : "#FFFFFF" }]}>
        <View style={styles_modal.handle} />
        <Text style={[styles_modal.title, { color: isDark ? "#F1F5F9" : "#0F172A" }]}>Choose edition</Text>
        {loading ? (
          <View style={{ alignItems: "center", paddingVertical: 32 }}>
            <ActivityIndicator size="small" color="#14B8A6" />
          </View>
        ) : options.length === 0 ? (
          <Text style={[styles_modal.rowText, { color: isDark ? "#94A3B8" : "#64748B", paddingVertical: 20 }]}>
            No alternative editions found for this title.
          </Text>
        ) : (
          <ScrollView style={styles_modal.list} showsVerticalScrollIndicator={false}>
            {options.map((option) => {
              const active = isSelected(option);
              return (
                <Pressable accessibilityRole="button"
                  key={option.id}
                  style={[styles_modal.row, active && styles_modal.rowActive]}
                  onPress={() => onSelect(option)}
                >
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text
                      style={[styles_modal.rowText, { color: isDark ? "#F1F5F9" : "#0F172A" }, active && styles_modal.rowTextActive]}
                      numberOfLines={2}
                    >
                      {option.label}
                    </Text>
                    {option.isbn ? (
                      <Text style={{ color: isDark ? "#64748B" : "#94A3B8", fontSize: 12, marginTop: 2 }}>
                        ISBN {option.isbn}
                      </Text>
                    ) : null}
                  </View>
                  {active ? <Ionicons name="checkmark-outline" size={16} color="#14B8A6" /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

// ─── MatchCard ────────────────────────────────────────────────────────────────

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "#22C55E",
  medium: "#F59E0B",
  low: "#94A3B8",
};

const SOURCE_LABELS: Record<string, string> = {
  "google-books": "Google Books",
  "open-library": "Open Library",
};

/** Renders 1–5 star glyphs for a 1–5 rating. Partial star not rendered. */
export function StarRating({ rating, count }: { rating: number; count?: number }) {
  const c = useColors();
  const fullStars = Math.round(rating);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons
          key={i}
          name={i <= fullStars ? "star" : "star-outline"}
          size={11}
          color={i <= fullStars ? c.gold : c.muted}
        />
      ))}
      {count !== undefined && count > 0 ? (
        <Text style={{ color: c.muted, fontFamily: "System", fontSize: 11, marginLeft: 4 }}>
          {count >= 1000 ? `${(count / 1000).toFixed(1)}k` : count.toString()}
        </Text>
      ) : null}
    </View>
  );
}


/** Compact 2-col grid result — cover-first, with a + to add. */
export function MatchGridCard({ match, onSelect }: { match: BookMatch; onSelect: () => void }) {
  const c = useColors();
  const { isDark } = useTheme();
  const styles = useMemo(() => createStyles(c, isDark), [c, isDark]);
  const { t } = useI18n();
  const meta = matchMetaLine(match, t);

  return (
    <ScalePressable accessibilityRole="button" style={styles.matchGridCard} onPress={onSelect} pressScale={0.95}>
      <View style={styles.matchGridCoverWrap}>
        {match.coverUrl ? (
          <Image source={{ uri: match.coverUrl }} style={styles.matchGridCover} resizeMode="cover" />
        ) : (
          <View style={[styles.matchGridCover, styles.matchGridCoverFallback]}>
            <Ionicons name="book-outline" size={26} color={c.muted} />
          </View>
        )}
        <View style={styles.matchGridAddBtn}>
          <Ionicons name="add" size={16} color="#fff" />
        </View>
      </View>
      <Text numberOfLines={2} style={styles.matchGridTitle}>{match.title}</Text>
      <Text numberOfLines={1} style={styles.matchGridAuthor}>{match.authors[0] ?? ""}</Text>
      {meta ? <Text style={styles.matchGridMeta} numberOfLines={1}>{meta}</Text> : null}
    </ScalePressable>
  );
}

// ─── Scan queue card ──────────────────────────────────────────────────────────

/**
 * One scanned barcode, rendered over the live camera.
 *
 * The card asks exactly one question — "do you own it?" — and both buttons are
 * tappable from the very first frame, while the metadata is still resolving.
 * Nothing here invents data: until a lookup returns, the card shows the ISBN
 * and a spinner, never a placeholder title.
 */
export function ScanQueueCard({
  entry,
  onChoose,
  onUndo,
  onDismiss,
  onRetry,
  onEditManually,
}: {
  entry: ScanQueueEntry;
  onChoose: (choice: ScanShelfChoice) => void;
  onUndo: () => void;
  onDismiss: () => void;
  onRetry: () => void;
  onEditManually: () => void;
}) {
  const c = useColors();
  const { isDark } = useTheme();
  const styles = useMemo(() => createStyles(c, isDark), [c, isDark]);
  const { t } = useI18n();

  const isbnLabel = t("scanQueue.isbnLabel", { isbn: formatIsbn13(entry.isbn13) });
  const resolvedTitle = entry.book?.title?.trim();
  const author = entry.book?.authorName?.trim();
  const cover = entry.book?.coverImageUri;
  // Empty means unknown: the ISBN stands in for a title we do not have yet.
  const headline =
    entry.status === "duplicate"
      ? entry.duplicateTitle?.trim() || resolvedTitle || isbnLabel
      : resolvedTitle || isbnLabel;
  const asksQuestion =
    entry.status === "resolving" || entry.status === "ready" || entry.status === "adding";
  const busy = entry.status === "adding";

  const meta = () => {
    switch (entry.status) {
      case "resolving":
        return (
          <View style={styles.scanQueueMetaRow}>
            <ActivityIndicator size="small" color={c.teal} />
            <Text style={styles.scanQueueMeta} numberOfLines={1}>
              {entry.choice
                ? entry.choice === "owned"
                  ? t("scanQueue.queuedOwned")
                  : t("scanQueue.queuedWishlist")
                : t("scanQueue.lookingUp")}
            </Text>
          </View>
        );
      case "adding":
        return (
          <View style={styles.scanQueueMetaRow}>
            <ActivityIndicator size="small" color={c.teal} />
            <Text style={styles.scanQueueMeta} numberOfLines={1}>{t("scanQueue.adding")}</Text>
          </View>
        );
      case "added":
        return (
          <View style={styles.scanQueueMetaRow}>
            <Ionicons name="checkmark-circle" size={13} color="#4ADE80" />
            <Text style={[styles.scanQueueMeta, styles.scanQueueMetaOk]} numberOfLines={1}>
              {entry.choice === "wishlist" ? t("scanQueue.addedWishlist") : t("scanQueue.addedOwned")}
            </Text>
          </View>
        );
      case "duplicate":
        return (
          <View style={styles.scanQueueMetaRow}>
            <Ionicons name="library-outline" size={13} color="#FBBF24" />
            <Text style={[styles.scanQueueMeta, styles.scanQueueMetaWarn]} numberOfLines={1}>
              {t("scanQueue.duplicate")}
            </Text>
          </View>
        );
      case "failed":
        return (
          <View style={styles.scanQueueMetaRow}>
            <Ionicons name="alert-circle-outline" size={13} color="#FCA5A5" />
            <Text style={[styles.scanQueueMeta, styles.scanQueueMetaError]} numberOfLines={1}>
              {t("scanQueue.failed")}
            </Text>
          </View>
        );
      default:
        return author ? (
          <View style={styles.scanQueueMetaRow}>
            <Text style={styles.scanQueueMeta} numberOfLines={1}>{author}</Text>
          </View>
        ) : null;
    }
  };

  return (
    <View style={styles.scanQueueCard}>
      <View style={styles.scanQueueRow}>
        {cover ? (
          <Image
            source={{ uri: cover.replace(/zoom=1(?=&|$)/, "zoom=0") }}
            style={styles.scanQueueCover}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.scanQueueCover, styles.scanQueueCoverFallback]}>
            <Ionicons name="barcode-outline" size={16} color="rgba(255,255,255,0.45)" />
          </View>
        )}

        <View style={styles.scanQueueCopy}>
          <Text style={styles.scanQueueTitle} numberOfLines={1}>{headline}</Text>
          {meta()}
          {/* The lookup fell back to a title search — say so rather than
              presenting a guess as the book that was scanned. */}
          {entry.unverified && entry.status !== "failed" ? (
            <View style={styles.scanQueueMetaRow}>
              <Ionicons name="help-circle-outline" size={13} color="#FBBF24" />
              <Text style={[styles.scanQueueMeta, styles.scanQueueMetaWarn]} numberOfLines={2}>
                {t("scanQueue.unverified")}
              </Text>
            </View>
          ) : null}
        </View>

        <Pressable
          style={styles.scanQueueDismiss}
          onPress={onDismiss}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={t("scanQueue.dismiss")}
        >
          <Ionicons name="close" size={16} color="rgba(255,255,255,0.55)" />
        </Pressable>
      </View>

      {asksQuestion ? (
        <>
          <Text style={styles.scanQueueQuestion}>{t("scanQueue.question")}</Text>
          <View style={styles.scanQueueActions}>
            <ScalePressable
              accessibilityRole="button"
              accessibilityLabel={t("scanQueue.owned")}
              disabled={busy}
              style={[styles.scanQueueBtn, entry.choice === "owned" && styles.scanQueueBtnOwned]}
              onPress={() => onChoose("owned")}
            >
              {busy && entry.choice === "owned" ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="checkmark-circle-outline" size={15} color="#F8FAFC" />
              )}
              <Text style={styles.scanQueueBtnText}>{t("scanQueue.owned")}</Text>
            </ScalePressable>

            <ScalePressable
              accessibilityRole="button"
              accessibilityLabel={t("scanQueue.wishlist")}
              disabled={busy}
              style={[styles.scanQueueBtn, entry.choice === "wishlist" && styles.scanQueueBtnWishlist]}
              onPress={() => onChoose("wishlist")}
            >
              {busy && entry.choice === "wishlist" ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="bookmark-outline" size={15} color="#F8FAFC" />
              )}
              <Text style={styles.scanQueueBtnText}>{t("scanQueue.wishlist")}</Text>
            </ScalePressable>
          </View>
        </>
      ) : null}

      {entry.status === "added" ? (
        <View style={styles.scanQueueLinkRow}>
          <ScalePressable accessibilityRole="button" style={styles.scanQueueLink} onPress={onUndo}>
            <Ionicons name="arrow-undo-outline" size={14} color="#F8FAFC" />
            <Text style={styles.scanQueueLinkText}>{t("scanQueue.undo")}</Text>
          </ScalePressable>
        </View>
      ) : null}

      {entry.status === "failed" ? (
        <View style={styles.scanQueueLinkRow}>
          <ScalePressable accessibilityRole="button" style={styles.scanQueueLink} onPress={onRetry}>
            <Ionicons name="refresh-outline" size={14} color="#F8FAFC" />
            <Text style={styles.scanQueueLinkText}>{t("scanQueue.retry")}</Text>
          </ScalePressable>
          <ScalePressable accessibilityRole="button" style={styles.scanQueueLink} onPress={onEditManually}>
            <Ionicons name="create-outline" size={14} color="#F8FAFC" />
            <Text style={styles.scanQueueLinkText}>{t("scanQueue.editManually")}</Text>
          </ScalePressable>
        </View>
      ) : null}
    </View>
  );
}

export function Choice({
  active,
  icon,
  label,
  onPress
}: {
  active: boolean;
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  const c = useColors();
  const { isDark } = useTheme();
  const styles = useMemo(() => createStyles(c, isDark), [c, isDark]);
  return (
    <Pressable accessibilityRole="button" style={[styles.choice, active && styles.choiceActive]} onPress={onPress}>
      <Ionicons name={icon} size={16} color={active ? c.ink : c.muted} />
      <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text>
    </Pressable>
  );
}


export function MatchCard({
  match,
  onSelect,
  isPrimary = false,
  hideConfidence = false,
}: {
  match: BookMatch;
  onSelect: () => void;
  isPrimary?: boolean;
  hideConfidence?: boolean;
}) {
  const { t } = useI18n();
  const c = useColors();
  const { isDark } = useTheme();
  const styles = useMemo(() => createStyles(c, isDark), [c, isDark]);
  const meta = matchMetaLine(match, t);

  return (
    <Pressable accessibilityRole="button" style={styles.matchCard} onPress={onSelect}>
      {/* Cover */}
      <View style={styles.matchCoverWrap}>
        {match.coverUrl ? (
          <Image source={{ uri: match.coverUrl }} style={styles.matchCover} resizeMode="cover" />
        ) : (
          <View style={styles.matchCoverFallback}>
            <Ionicons name="book-outline" size={26} color="rgba(255,255,255,0.5)" />
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.matchInfo}>
        {/* Series */}
        {match.seriesName ? (
          <Text style={styles.matchSeries} numberOfLines={1}>
            {match.seriesOrder ? `Book ${match.seriesOrder} · ` : ""}{match.seriesName}
          </Text>
        ) : null}

        {/* Title */}
        <Text style={styles.matchTitle} numberOfLines={2}>{match.title}</Text>

        {/* Author */}
        <Text style={styles.matchAuthor} numberOfLines={1}>
          By {match.authors.join(", ") || "Unknown author"}
        </Text>

        {/* Ratings */}
        {match.averageRating ? (
          <View style={{ marginTop: 4 }}>
            <StarRating rating={match.averageRating} count={match.ratingsCount} />
          </View>
        ) : null}

        {/* Edition facts when known, work-level facts otherwise */}
        {meta ? <Text style={styles.matchMeta} numberOfLines={1}>{meta}</Text> : null}
      </View>

      {/* Add button */}
      <Pressable
        style={styles.matchAddBtn}
        onPress={onSelect}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t("a11y.addBookToList", { title: match.title })}
      >
        <View style={styles.matchAddCircle}>
          <Ionicons name="add" size={18} color="#fff" />
        </View>
      </Pressable>
    </Pressable>
  );
}

