import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { BookCover } from "./BookCover";
import { Book, CoreTrackingStatus } from "../types/models";
import { wantsToAcquire } from "../data/shelfRules";
import { AppColors, colors, fonts, radii, spacing } from "../theme/theme";
import { useColors } from "../theme/ThemeContext";
import { useI18n } from "../i18n/LocalizationContext";

type ActionItem = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  hidden?: boolean;
};

type Props = {
  open: boolean;
  book: Book | null;
  authorName: string;
  onClose: () => void;
  onViewDetails: () => void;
  onViewAuthor?: () => void;
  onUpdateStatus: () => void;
  onLogSession: () => void;
  onOpenSeries: (() => void) | undefined;
  onAddToList: () => void;
  onBuy: () => void;
  onRemove: () => void;
};

export function BookContextMenu({
  open,
  book,
  authorName,
  onClose,
  onViewDetails,
  onViewAuthor,
  onUpdateStatus,
  onLogSession,
  onOpenSeries,
  onAddToList,
  onBuy,
  onRemove,
}: Props) {
  const c = useColors();
  const { t } = useI18n();
  const styles = useMemo(() => createStyles(c), [c]);

  if (!book) return null;

  const isReading = book.userStatus.status === "reading";
  const isRead    = book.userStatus.status === "read";
  const hasSeries = Boolean(book.seriesId);

  const actionGroups: ActionItem[][] = [
    // Group 1 — navigation
    [
      { key: "details",  label: t("contextMenu.details"),   icon: "book-outline" },
      { key: "series",   label: t("contextMenu.series"),    icon: "layers-outline",   hidden: !hasSeries },
      { key: "author",   label: authorName,           icon: "person-outline",   hidden: !onViewAuthor },
    ],
    // Group 2 — status & tracking
    [
      { key: "status",   label: t("contextMenu.status"),    icon: "swap-horizontal-outline" },
      { key: "session",  label: t("contextMenu.session"),   icon: "time-outline",   hidden: !isReading },
    ],
    // Group 3 — organisation
    [
      { key: "list",     label: t("contextMenu.addToList"), icon: "bookmark-outline" },
      // Hidden once the reader owns a copy — offering to go buy a book that
      // is already on their shelf is the kind of detail that makes an app
      // feel like it is not paying attention.
      { key: "buy",      label: t("contextMenu.buy"),       icon: "cart-outline", hidden: !wantsToAcquire(book.userStatus) },
    ],
    // Group 4 — destructive
    [
      { key: "remove",   label: t("contextMenu.remove"),    icon: "trash-outline",   destructive: true },
    ],
  ];

  const handleAction = (key: string) => {
    onClose();
    // Tiny delay so the sheet closes visually before navigating
    setTimeout(() => {
      switch (key) {
        case "details": return onViewDetails();
        case "status":  return onUpdateStatus();
        case "session": return onLogSession();
        case "series":  return onOpenSeries?.();
        case "author":  return onViewAuthor?.();
        case "list":    return onAddToList();
        case "buy":     return onBuy();
        case "remove":  return onRemove();
      }
    }, 180);
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable accessibilityRole="button" style={StyleSheet.absoluteFill} onPress={onClose} />

        <View style={styles.sheet}>
          <View style={styles.handle} />

          {/* Book header */}
          <View style={styles.bookHeader}>
            <BookCover book={book} size="sm" style={styles.headerCover} hideProgress />
            <View style={styles.headerCopy}>
              <Text numberOfLines={2} style={styles.headerTitle}>{book.title}</Text>
              <Text numberOfLines={1} style={styles.headerAuthor}>{authorName}</Text>
              {book.seriesName && (
                <Text numberOfLines={1} style={styles.headerSeries}>
                  {book.seriesNumber ? `${t("bookDetail.seriesBookN", { number: book.seriesNumber })} · ` : ""}{book.seriesName}
                </Text>
              )}
            </View>
          </View>

          <View style={styles.divider} />

          {/* Action groups */}
          {actionGroups.map((group, gi) => {
            const visible = group.filter((a) => !a.hidden);
            if (visible.length === 0) return null;
            return (
              <View key={gi}>
                {visible.map((action) => (
                  <Pressable accessibilityRole="button"
                    key={action.key}
                    style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
                    onPress={() => handleAction(action.key)}
                  >
                    <Text style={[styles.actionLabel, action.destructive && styles.actionDestructive]}>
                      {action.label}
                    </Text>
                    <Ionicons
                      name={action.icon}
                      size={20}
                      color={action.destructive ? colors.coral : c.muted}
                    />
                  </Pressable>
                ))}
                {gi < actionGroups.length - 1 && <View style={styles.divider} />}
              </View>
            );
          })}
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
      paddingBottom: 40,
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
    bookHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
    },
    headerCover: {
      borderRadius: 10,
      height: 72,
      width: 52,
    },
    headerCopy: {
      flex: 1,
      gap: 3,
    },
    headerTitle: {
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 16,
      fontWeight: "900",
      lineHeight: 21,
    },
    headerAuthor: {
      color: c.muted,
      fontFamily: fonts.bodyRegular,
      fontSize: 13,
    },
    headerSeries: {
      color: c.tealDark,
      fontFamily: fonts.body,
      fontSize: 12,
      fontWeight: "700",
    },
    divider: {
      backgroundColor: c.border,
      height: StyleSheet.hairlineWidth,
      marginVertical: 4,
    },
    actionRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      minHeight: 52,
      paddingHorizontal: spacing.lg,
    },
    actionRowPressed: {
      backgroundColor: c.surfaceAlt,
    },
    actionLabel: {
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 16,
      fontWeight: "700",
    },
    actionDestructive: {
      color: colors.coral,
    },
  });
}
