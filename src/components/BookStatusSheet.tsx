import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { CoreTrackingStatus } from "../types/models";
import { AppColors, fonts, radii, spacing } from "../theme/theme";
import { useColors } from "../theme/ThemeContext";
import { useI18n } from "../i18n/LocalizationContext";

type StatusOption = {
  value: CoreTrackingStatus;
  labelKey: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: keyof AppColors;
};

const STATUS_OPTIONS: StatusOption[] = [
  { value: "want-to-read", labelKey: "statusSheet.wantToRead", icon: "bookmark-outline",         color: "muted" },
  { value: "reading",      labelKey: "statusSheet.reading",    icon: "book-outline",              color: "teal"  },
  { value: "read",         labelKey: "statusSheet.read",       icon: "checkmark-circle-outline",  color: "green" },
  { value: "wishlist",     labelKey: "statusSheet.wishlist",   icon: "heart-outline",             color: "coral" }
];

type Props = {
  open: boolean;
  currentStatus: CoreTrackingStatus;
  currentRating?: number;
  /** Whether the reader owns a copy. Independent of the reading status. */
  currentOwned?: boolean;
  onSave: (status: CoreTrackingStatus, rating?: number, owned?: boolean) => void;
  onClose: () => void;
};

export function BookStatusSheet({ open, currentStatus, currentRating, currentOwned, onSave, onClose }: Props) {
  const { t } = useI18n();
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const [status, setStatus] = useState<CoreTrackingStatus>(currentStatus);
  const [rating, setRating] = useState<number | undefined>(currentRating);
  const [owned, setOwned] = useState<boolean>(currentOwned ?? false);
  // Wishlist means "I want this and do not have it", so the two cannot both be
  // true. The toggle is hidden rather than disabled: an unavailable control the
  // user cannot act on is just noise.
  const ownershipApplies = status !== "wishlist";

  // Sync local state whenever the sheet (re-)opens
  useEffect(() => {
    if (open) {
      setStatus(currentStatus);
      setRating(currentRating);
      setOwned(currentOwned ?? false);
    }
  }, [open, currentStatus, currentRating, currentOwned]);

  const handleSave = () => {
    onSave(status, status === "read" ? rating : undefined, ownershipApplies ? owned : false);
    onClose();
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable accessibilityRole="button" style={StyleSheet.absoluteFill} onPress={onClose} />

        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>{t("statusSheet.title")}</Text>

          {/* Status grid */}
          <View style={styles.statusGrid}>
            {STATUS_OPTIONS.map((opt) => {
              const active = status === opt.value;
              const optColor = c[opt.color];
              return (
                <Pressable accessibilityRole="button"
                  key={opt.value}
                  style={[styles.statusOption, active && { borderColor: optColor, backgroundColor: `${optColor}18` }]}
                  onPress={() => setStatus(opt.value)}
                >
                  <Ionicons name={opt.icon} size={24} color={active ? optColor : c.muted} />
                  <Text style={[styles.statusLabel, active && { color: optColor }]}>
                    {t(opt.labelKey)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Ownership — a separate axis from the reading status: a book can be
              owned and unread, or read and borrowed. Making it a fifth status
              chip would silently overwrite whichever one was set. */}
          {ownershipApplies && (
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: owned }}
              style={[styles.ownedRow, owned && { borderColor: c.teal, backgroundColor: `${c.teal}18` }]}
              onPress={() => setOwned((prev) => !prev)}
            >
              <Ionicons
                name={owned ? "checkbox" : "square-outline"}
                size={22}
                color={owned ? c.teal : c.muted}
              />
              <Text style={[styles.ownedLabel, owned && { color: c.teal }]}>{t("statusSheet.owned")}</Text>
            </Pressable>
          )}

          {/* Star rating — only when Read */}
          {status === "read" && (
            <View style={styles.ratingSection}>
              <Text style={styles.ratingLabel}>{t("statusSheet.yourRating")}</Text>
              <View style={styles.stars}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Pressable
                    key={star}
                    onPress={() => setRating(star)}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel={t("a11y.rateStars", { count: star })}
                  >
                    <Ionicons
                      name={rating !== undefined && rating >= star ? "star" : "star-outline"}
                      size={34}
                      color={rating !== undefined && rating >= star ? c.gold : c.border}
                    />
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          <Pressable accessibilityRole="button" style={styles.saveButton} onPress={handleSave}>
            <Text style={styles.saveButtonText}>{t("common.save")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
  overlay: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    flex: 1,
    justifyContent: "flex-end"
  },
  sheet: {
    backgroundColor: c.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 44,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    width: "100%"
  },
  handle: {
    alignSelf: "center",
    backgroundColor: c.border,
    borderRadius: radii.pill,
    height: 4,
    marginBottom: spacing.lg,
    width: 40
  },
  sheetTitle: {
    color: c.ink,
    fontFamily: fonts.display,
    fontSize: 24,
    fontWeight: "900",
    marginBottom: spacing.md
  },
  statusGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.md
  },
  statusOption: {
    alignItems: "center",
    backgroundColor: c.surfaceAlt,
    borderColor: c.border,
    borderRadius: radii.md,
    borderWidth: 2,
    flex: 1,
    gap: 6,
    minWidth: "44%",
    paddingVertical: spacing.md
  },
  statusLabel: {
    color: c.muted,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center"
  },
  ownedRow: {
    alignItems: "center",
    borderColor: c.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md
  },
  ownedLabel: {
    color: c.ink,
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: "600"
  },
  ratingSection: {
    marginBottom: spacing.md
  },
  ratingLabel: {
    color: c.muted,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: spacing.sm,
    textTransform: "uppercase"
  },
  stars: {
    flexDirection: "row",
    gap: spacing.sm
  },
  saveButton: {
    alignItems: "center",
    backgroundColor: c.teal,
    borderRadius: radii.pill,
    marginTop: spacing.sm,
    paddingVertical: 15
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: "900"
  }
});
}
