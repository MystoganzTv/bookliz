/**
 * Choose a book from the library — for giving an inbox audiobook its book.
 * Books still without audio come first (audiobook format before the rest); a
 * book that already has audio is marked, because choosing it replaces that audio.
 */
import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useAudiobookPlayer } from "../audio/AudiobookPlayerContext";
import { useBookliz } from "../data/BooklizContext";
import { useI18n } from "../i18n/LocalizationContext";
import { AppColors, fonts, radii, spacing } from "../theme/theme";
import { useColors } from "../theme/ThemeContext";
import { MiniCover } from "./MiniCover";

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

type Props = {
  open: boolean;
  title: string;
  /** Pre-filled search (the inbox item's guessed title). */
  initialQuery?: string;
  onPick: (bookId: string) => void;
  onClose: () => void;
};

export function BookPickerSheet({ open, title, initialQuery = "", onPick, onClose }: Props) {
  const { t } = useI18n();
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const { books, getAuthor } = useBookliz();
  const { library } = useAudiobookPlayer();
  const [query, setQuery] = useState(initialQuery);
  const [lastOpen, setLastOpen] = useState(false);
  // Re-seed the search each time the sheet opens.
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setQuery(initialQuery);
  }

  const rows = useMemo(() => {
    const words = norm(query).split(/\s+/).filter((w) => w.length > 1);
    const rank = (bookId: string, format: string) => (library[bookId] ? 2 : format === "audiobook" ? 0 : 1);
    return books
      .map((book) => ({ book, author: getAuthor(book.authorId)?.name ?? "" }))
      .filter(({ book, author }) => {
        if (!words.length) return true;
        const hay = norm(`${book.title} ${author} ${book.seriesName ?? ""}`);
        // Any word matching is enough: file names are rough ("Dune Messiah Part" still finds Dune Messiah).
        return words.some((w) => hay.includes(w));
      })
      .map((row) => {
        const hay = norm(`${row.book.title} ${row.author}`);
        return { ...row, hits: words.filter((w) => hay.includes(w)).length };
      })
      .sort((a, b) => b.hits - a.hits || rank(a.book.id, a.book.format) - rank(b.book.id, b.book.format) || a.book.title.localeCompare(b.book.title));
  }, [books, getAuthor, library, query]);

  return (
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.wrap, { backgroundColor: c.bg }]}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={2}>{title}</Text>
          <Pressable accessibilityRole="button" onPress={onClose} hitSlop={10}>
            <Text style={styles.cancel}>{t("common.cancel")}</Text>
          </Pressable>
        </View>
        <TextInput
          style={styles.search}
          placeholder={t("library.searchPlaceholder")}
          placeholderTextColor={c.muted}
          value={query}
          onChangeText={setQuery}
          clearButtonMode="while-editing"
          autoCorrect={false}
        />
        <FlatList
          data={rows}
          keyExtractor={(r) => r.book.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={styles.empty}>{t("fileManager.noBookMatch")}</Text>}
          renderItem={({ item: { book, author } }) => (
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.surfaceAlt }]}
              onPress={() => {
                onPick(book.id);
                onClose();
              }}
            >
              <MiniCover book={book} />
              <View style={styles.copy}>
                <Text style={styles.bookTitle} numberOfLines={2}>{book.title}</Text>
                <Text style={styles.author} numberOfLines={1}>{author}</Text>
                {library[book.id] ? (
                  <View style={styles.hasAudio}>
                    <Ionicons name="headset" size={12} color={c.coral} />
                    <Text style={styles.hasAudioText}>{t("fileManager.replacesAudio")}</Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    wrap: { flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.md },
    header: { alignItems: "center", flexDirection: "row", gap: spacing.md, justifyContent: "space-between", marginBottom: spacing.md },
    title: { color: c.ink, flex: 1, fontFamily: fonts.display, fontSize: 20, fontWeight: "900" },
    cancel: { color: c.tealDark, fontFamily: fonts.body, fontSize: 16, fontWeight: "800" },
    search: {
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: radii.md,
      borderWidth: 1,
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 15,
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
    },
    row: { alignItems: "center", borderRadius: radii.sm, flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.xs, paddingVertical: 8 },
    copy: { flex: 1 },
    bookTitle: { color: c.ink, fontFamily: fonts.body, fontSize: 15, fontWeight: "800" },
    author: { color: c.muted, fontFamily: fonts.bodyRegular, fontSize: 13, marginTop: 2 },
    hasAudio: { alignItems: "center", flexDirection: "row", gap: 4, marginTop: 4 },
    hasAudioText: { color: c.coral, fontFamily: fonts.body, fontSize: 12, fontWeight: "700" },
    empty: { color: c.muted, fontFamily: fonts.bodyRegular, fontSize: 14, marginTop: spacing.lg, textAlign: "center" },
  });
}
