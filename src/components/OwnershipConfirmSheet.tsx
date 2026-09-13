/**
 * OwnershipConfirmSheet — the second half of the scanner's ownership question.
 *
 * The camera asks "do you own it?" and gives the reader a few seconds; a book
 * nobody answered for still lands in the library, carrying the question as
 * `ownership: "undecided"` (see data/shelfRules.needsOwnershipAnswer). This is
 * where it gets asked again, away from the barcode frame, with the cover and
 * the author in front of the reader instead of whatever the camera had time to
 * resolve.
 *
 * Deliberately one book at a time. A list of twelve books with two buttons
 * each is a form, and a form is what the reader was avoiding when they let the
 * countdown run out. Skipping is always available and costs nothing: the books
 * keep the question and the banner comes back.
 */
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Book } from "../types/models";
import { AppColors, fonts, radii, spacing } from "../theme/theme";
import { useColors } from "../theme/ThemeContext";
import { useI18n } from "../i18n/LocalizationContext";
import { ScalePressable } from "./ScalePressable";

type Props = {
  open: boolean;
  /** Books still carrying the unanswered question, newest scan first. */
  books: Book[];
  authorNameFor: (book: Book) => string;
  onAnswer: (book: Book, owned: boolean) => void;
  onClose: () => void;
};

export function OwnershipConfirmSheet({ open, books, authorNameFor, onAnswer, onClose }: Props) {
  const { t } = useI18n();
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const [index, setIndex] = useState(0);

  // Re-opening starts at the top of whatever is still unanswered.
  useEffect(() => { if (open) setIndex(0); }, [open]);

  /**
   * Answering removes the book from `books` (its ownership is no longer
   * undecided), so the list shifts under the cursor and the NEXT book arrives
   * at the same index. Skipping is the only move that advances it.
   *
   * When the reader has skipped their way past the end, wrap back rather than
   * closing: the remaining books are all skipped ones, and silently shutting
   * the sheet would look like it lost them.
   */
  const total = books.length;
  const current = total ? books[Math.min(index, total - 1)] : undefined;

  useEffect(() => {
    if (open && total === 0) onClose();
  }, [open, total, onClose]);

  if (!current) return null;

  const answer = (owned: boolean) => {
    onAnswer(current, owned);
    // Do not advance: the answered book leaves the list.
    setIndex((i) => Math.min(i, Math.max(0, total - 2)));
  };

  const skip = () => setIndex((i) => (i + 1) % total);

  const cover = current.coverImageUri;
  const author = authorNameFor(current);

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        {/* Catches the tap so it never reaches the dismissing overlay behind. */}
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />

          <Text style={styles.title}>{t("library.confirmTitle")}</Text>
          <Text style={styles.note}>{t("library.confirmNote")}</Text>

          <View style={styles.bookRow}>
            {cover ? (
              <Image source={{ uri: cover }} style={styles.cover} resizeMode="cover" />
            ) : (
              <View style={[styles.cover, styles.coverFallback]}>
                <Ionicons name="book-outline" size={20} color={c.gray} />
              </View>
            )}
            <View style={styles.bookCopy}>
              <Text style={styles.bookTitle} numberOfLines={2}>{current.title}</Text>
              {author ? <Text style={styles.bookAuthor} numberOfLines={1}>{author}</Text> : null}
              <Text style={styles.progress}>
                {t("library.confirmProgress", {
                  current: String(Math.min(index, total - 1) + 1),
                  total: String(total),
                })}
              </Text>
            </View>
          </View>

          <Text style={styles.question}>{t("shelf.question")}</Text>

          <View style={styles.actions}>
            <ScalePressable
              accessibilityRole="button"
              accessibilityLabel={t("shelf.owned")}
              style={[styles.btn, styles.btnOwned]}
              onPress={() => answer(true)}
            >
              <Ionicons name="checkmark-circle-outline" size={17} color="#FFFFFF" />
              <Text style={styles.btnText}>{t("shelf.owned")}</Text>
            </ScalePressable>

            <ScalePressable
              accessibilityRole="button"
              accessibilityLabel={t("shelf.wanted")}
              style={[styles.btn, styles.btnWanted]}
              onPress={() => answer(false)}
            >
              <Ionicons name="bookmark-outline" size={17} color="#FFFFFF" />
              <Text style={styles.btnText}>{t("shelf.wanted")}</Text>
            </ScalePressable>
          </View>

          <View style={styles.footer}>
            {total > 1 ? (
              <Pressable accessibilityRole="button" onPress={skip} hitSlop={8}>
                <Text style={styles.footerLink}>{t("library.confirmSkip")}</Text>
              </Pressable>
            ) : <View />}
            <Pressable accessibilityRole="button" onPress={onClose} hitSlop={8}>
              <Text style={styles.footerLink}>{t("library.confirmDone")}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
    sheet: {
      backgroundColor: c.card,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xl,
    },
    handle: {
      alignSelf: "center", width: 38, height: 4, borderRadius: 2,
      backgroundColor: c.border, marginBottom: spacing.md,
    },
    title: { fontFamily: fonts.display, fontSize: 20, color: c.ink },
    note: { fontFamily: fonts.bodyRegular, fontSize: 13, color: c.gray, marginTop: 4, lineHeight: 18 },

    bookRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg, alignItems: "center" },
    cover: { width: 52, height: 78, borderRadius: radii.sm, backgroundColor: c.surface },
    coverFallback: { alignItems: "center", justifyContent: "center" },
    bookCopy: { flex: 1, minWidth: 0 },
    bookTitle: { fontFamily: fonts.display, fontSize: 16, color: c.ink, lineHeight: 21 },
    bookAuthor: { fontFamily: fonts.bodyRegular, fontSize: 13, color: c.gray, marginTop: 2 },
    progress: { fontFamily: fonts.body, fontSize: 11, color: c.gray, marginTop: 6, letterSpacing: 0.4 },

    question: { fontFamily: fonts.body, fontSize: 14, color: c.ink, marginTop: spacing.lg },
    actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
    btn: {
      flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 7, paddingVertical: 13, borderRadius: radii.md,
    },
    btnOwned: { backgroundColor: c.teal },
    btnWanted: { backgroundColor: c.coral },
    btnText: { fontFamily: fonts.body, fontSize: 14.5, color: "#FFFFFF" },

    footer: {
      flexDirection: "row", justifyContent: "space-between", alignItems: "center",
      marginTop: spacing.lg,
    },
    footerLink: { fontFamily: fonts.body, fontSize: 14, color: c.gray },
  });
}
