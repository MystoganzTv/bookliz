import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AppColors, colors, fonts, radii, spacing } from "../theme/theme";
import { useColors } from "../theme/ThemeContext";
import { useI18n } from "../i18n/LocalizationContext";

// ── Format groups ────────────────────────────────────────────────────────────
export const FORMAT_GROUPS = [
  {
    key: "physical" as const,
    label: "Physical",
    icon: "book-outline" as const,
    formats: ["paperback", "hardcover", "mass-market-paperback", "spiral-bound", "leather-bound", "physical"],
  },
  {
    key: "ebook" as const,
    label: "E-book",
    icon: "tablet-portrait-outline" as const,
    formats: ["ebook", "kindle"],
  },
  {
    key: "audiobook" as const,
    label: "Audiobook",
    icon: "headset-outline" as const,
    formats: ["audiobook"],
  },
  {
    key: "comics" as const,
    label: "Comics",
    icon: "color-palette-outline" as const,
    formats: ["comic-book", "graphic-novel", "manga", "magazine"],
  },
] as const;

export type FormatKey = typeof FORMAT_GROUPS[number]["key"];

// ── Sort options ─────────────────────────────────────────────────────────────
export const SORT_OPTIONS = [
  { key: "personalRank",      label: "Personal rank" },
  { key: "rating",            label: "Rating" },
  { key: "dateRead",          label: "Date finished" },
  { key: "mostRecentlyLogged",label: "Recently logged" },
  { key: "author",            label: "Author A–Z" },
  { key: "seriesOrder",       label: "Series order" },
  { key: "releaseDate",       label: "Release date" },
] as const;

export type LibrarySort = typeof SORT_OPTIONS[number]["key"];

// ── Language options ──────────────────────────────────────────────────────────
export const LANGUAGE_OPTIONS = [
  { key: "da", label: "Danish" },
  { key: "en", label: "English" },
  { key: "fr", label: "French" },
  { key: "de", label: "German" },
  { key: "it", label: "Italian" },
  { key: "es", label: "Spanish" },
  { key: "sv", label: "Swedish" },
] as const;

export type LanguageKey = typeof LANGUAGE_OPTIONS[number]["key"];

// ── Filter state (persisted in LibraryScreen) ─────────────────────────────────
export type FilterState = {
  formats: Set<FormatKey>;
  languages: Set<LanguageKey>;
  sort: LibrarySort;
};

export const DEFAULT_FILTERS: FilterState = {
  formats: new Set(),
  languages: new Set(),
  sort: "personalRank",
};

export function activeFilterCount(f: FilterState): number {
  return f.formats.size + f.languages.size + (f.sort !== "personalRank" ? 1 : 0);
}

// ── Component ─────────────────────────────────────────────────────────────────
type Props = {
  open: boolean;
  filters: FilterState;
  resultCount: number;
  onApply: (filters: FilterState) => void;
  onClose: () => void;
};

export function FilterSheet({ open, filters, resultCount, onApply, onClose }: Props) {
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const { t } = useI18n();

  const [localFormats,   setLocalFormats]   = useState<Set<FormatKey>>(new Set(filters.formats));
  const [localLanguages, setLocalLanguages] = useState<Set<LanguageKey>>(new Set(filters.languages));
  const [localSort,      setLocalSort]      = useState<LibrarySort>(filters.sort);

  useEffect(() => {
    if (open) {
      setLocalFormats(new Set(filters.formats));
      setLocalLanguages(new Set(filters.languages));
      setLocalSort(filters.sort);
    }
  }, [open]);

  const toggleFormat = (key: FormatKey) => {
    setLocalFormats((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleLanguage = (key: LanguageKey) => {
    setLocalLanguages((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleClear = () => {
    const cleared: FilterState = { formats: new Set(), languages: new Set(), sort: "personalRank" };
    setLocalFormats(new Set());
    setLocalLanguages(new Set());
    setLocalSort("personalRank");
    onApply(cleared);
    onClose();
  };

  const handleApply = () => {
    onApply({ formats: localFormats, languages: localLanguages, sort: localSort });
    onClose();
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable accessibilityRole="button" style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>{t("filters.filterBy")}</Text>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

            {/* ── Format ── */}
            <Text style={styles.sectionLabel}>{t("filters.format")}</Text>
            <View style={styles.chipRow}>
              {FORMAT_GROUPS.map((fg) => {
                const active = localFormats.has(fg.key);
                return (
                  <Pressable accessibilityRole="button"
                    key={fg.key}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => toggleFormat(fg.key)}
                  >
                    <Ionicons
                      name={fg.icon}
                      size={14}
                      color={active ? colors.navy : c.muted}
                    />
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {fg.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* ── Language ── */}
            <Text style={styles.sectionLabel}>{t("filters.language")}</Text>
            <View style={styles.chipRow}>
              {LANGUAGE_OPTIONS.map((lang) => {
                const active = localLanguages.has(lang.key);
                return (
                  <Pressable accessibilityRole="button"
                    key={lang.key}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => toggleLanguage(lang.key)}
                  >
                    {active && <Ionicons name="checkmark" size={13} color={colors.navy} />}
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {lang.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* ── Sort ── */}
            <Text style={styles.sectionLabel}>{t("filters.sortBy")}</Text>
            <View style={styles.chipRow}>
              {SORT_OPTIONS.map((opt) => {
                const active = localSort === opt.key;
                return (
                  <Pressable accessibilityRole="button"
                    key={opt.key}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setLocalSort(opt.key)}
                  >
                    {active && (
                      <Ionicons name="checkmark" size={13} color={colors.navy} />
                    )}
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          {/* ── Footer ── */}
          <View style={styles.footer}>
            <Pressable accessibilityRole="button" style={styles.clearBtn} onPress={handleClear}>
              <Text style={styles.clearText}>{t("filters.clear")}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.applyBtn} onPress={handleApply}>
              <Text style={styles.applyText}>Show {resultCount} results</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.55)",
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      maxHeight: "85%",
      paddingBottom: 36,
      paddingTop: spacing.md,
    },
    handle: {
      alignSelf: "center",
      backgroundColor: c.border,
      borderRadius: radii.pill,
      height: 4,
      marginBottom: spacing.md,
      width: 40,
    },
    sheetTitle: {
      color: c.ink,
      fontFamily: fonts.display,
      fontSize: 22,
      fontWeight: "900",
      marginBottom: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    scrollContent: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
    },
    sectionLabel: {
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 16,
      fontWeight: "900",
      marginBottom: spacing.sm,
      marginTop: spacing.md,
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.xs,
    },
    chip: {
      alignItems: "center",
      borderColor: c.border,
      borderRadius: 12,
      borderWidth: 1.5,
      flexDirection: "row",
      gap: 5,
      minHeight: 44,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    chipActive: {
      backgroundColor: c.teal,
      borderColor: c.teal,
    },
    chipText: {
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 14,
      fontWeight: "700",
    },
    chipTextActive: {
      color: colors.navy,
      fontWeight: "900",
    },
    footer: {
      borderTopColor: c.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: spacing.sm,
      marginTop: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
    },
    clearBtn: {
      alignItems: "center",
      borderColor: c.border,
      borderRadius: radii.pill,
      borderWidth: 1.5,
      flex: 1,
      justifyContent: "center",
      minHeight: 52,
    },
    clearText: {
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 15,
      fontWeight: "800",
    },
    applyBtn: {
      alignItems: "center",
      backgroundColor: c.teal,
      borderRadius: radii.pill,
      flex: 2,
      justifyContent: "center",
      minHeight: 52,
    },
    applyText: {
      color: colors.navy,
      fontFamily: fonts.body,
      fontSize: 15,
      fontWeight: "900",
    },
  });
}
