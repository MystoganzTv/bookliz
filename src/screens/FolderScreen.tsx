/**
 * One Library folder: its subfolders, then its books. From the header: new
 * subfolder, and "···" for rename / move / delete. "Add books" opens the whole
 * library with checkboxes — the quick way to file many books at once.
 */
import { AtmosphereFill } from "../components/AtmosphereFill";
import { Ionicons } from "@expo/vector-icons";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useLayoutEffect, useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { MiniCover } from "../components/MiniCover";
import { CreateListSheet } from "../components/CreateListSheet";
import { useDialog } from "../components/DialogProvider";
import { FolderPickerSheet } from "../components/FolderPickerSheet";
import { Screen } from "../components/Screen";
import { booksInFolder, childFolders, deepBookCount, folderOfBook, folderPath } from "../data/bookFolders";
import { useBookliz } from "../data/BooklizContext";
import { useI18n } from "../i18n/LocalizationContext";
import { RootStackParamList } from "../navigation/types";
import { AppColors, fonts, radii, spacing } from "../theme/theme";
import { useColors } from "../theme/ThemeContext";
import type { Book } from "../types/models";

export function FolderScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, "Folder">>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { t } = useI18n();
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const dialog = useDialog();
  const { books, getAuthor, bookFolders, createFolder, renameFolder, deleteFolder, moveFolder, moveBookToFolder } = useBookliz();

  const [sheet, setSheet] = useState<"create" | "rename" | "move" | "add" | "moveBook" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [bookToMove, setBookToMove] = useState<Book | null>(null);

  const folder = bookFolders.find((f) => f.id === params.folderId);
  const existing = useMemo(() => new Set(books.map((b) => b.id)), [books]);
  const subfolders = useMemo(() => childFolders(bookFolders, params.folderId), [bookFolders, params.folderId]);
  const folderBooks = useMemo(() => {
    if (!folder) return [];
    const ids = new Set(booksInFolder(folder, bookFolders, existing));
    return books.filter((b) => ids.has(b.id)).sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true }));
  }, [books, bookFolders, existing, folder]);
  const path = useMemo(() => folderPath(bookFolders, params.folderId), [bookFolders, params.folderId]);
  const descendants = useMemo(() => {
    const out = new Set<string>([params.folderId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const f of bookFolders) if (f.parentId && out.has(f.parentId) && !out.has(f.id)) { out.add(f.id); grew = true; }
    }
    return out;
  }, [bookFolders, params.folderId]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: folder ? `${folder.emoji ? `${folder.emoji} ` : ""}${folder.name}` : "",
      headerRight: folder
        ? () => (
            <View style={styles.headerButtons}>
              <Pressable accessibilityRole="button" accessibilityLabel={t("folders.newSub")} hitSlop={10} onPress={() => setSheet("create")}>
                <Ionicons name="folder-open-outline" size={22} color={c.navText} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={t("folders.more")} hitSlop={10} onPress={() => setMenuOpen(true)}>
                <Ionicons name="ellipsis-horizontal-circle-outline" size={24} color={c.navText} />
              </Pressable>
            </View>
          )
        : undefined,
    });
  }, [c.navText, folder, navigation, styles.headerButtons, t]);

  if (!folder) {
    return (
      <Screen>
        <Text style={styles.empty}>{t("folders.gone")}</Text>
      </Screen>
    );
  }

  const parent = path.length > 1 ? path[path.length - 2] : null;

  const confirmDelete = () =>
    dialog.confirm({
      title: t("folders.deleteTitle", { name: folder.name }),
      body: parent ? t("folders.deleteBodyParent", { parent: parent.name }) : t("folders.deleteBodyTop"),
      confirmLabel: t("folders.delete"),
      destructive: true,
      onConfirm: () => {
        deleteFolder(folder.id);
        navigation.goBack();
      },
    });

  const header = (
    <View>
      {path.length > 1 ? (
        <Text style={styles.breadcrumb} numberOfLines={1}>
          {path.slice(0, -1).map((p) => p.name).join(" › ")}
        </Text>
      ) : null}
      {subfolders.length > 0 ? (
        <View style={styles.block}>
          {subfolders.map((sub, index) => (
            <Pressable
              key={sub.id}
              accessibilityRole="button"
              style={({ pressed }) => [styles.folderRow, index > 0 && styles.rowBorder, pressed && styles.pressed]}
              onPress={() => navigation.push("Folder", { folderId: sub.id })}
            >
              <Text style={styles.folderEmoji}>{sub.emoji ?? "📁"}</Text>
              <Text style={styles.folderName} numberOfLines={1}>{sub.name}</Text>
              <Text style={styles.count}>{deepBookCount(bookFolders, sub.id, existing)}</Text>
              <Ionicons name="chevron-forward" size={17} color={c.muted} />
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={styles.booksHeader}>
        <Text style={styles.sectionLabel}>
          {folderBooks.length === 1 ? t("folders.bookCountOne") : t("folders.bookCount", { count: folderBooks.length })}
        </Text>
        <Pressable accessibilityRole="button" style={styles.addBtn} onPress={() => setSheet("add")}>
          <Ionicons name="add" size={16} color={c.tealDark} />
          <Text style={styles.addBtnText}>{t("folders.addBooks")}</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <Screen scroll={false}>
      <FlatList
        data={folderBooks}
        keyExtractor={(b) => b.id}
        ListHeaderComponent={header}
        ListEmptyComponent={
          subfolders.length === 0 ? <Text style={styles.empty}>{t("folders.emptyFolder")}</Text> : null
        }
        ListFooterComponent={<AtmosphereFill bleedBottom={120} bleedHorizontal={spacing.md} />}
        ListFooterComponentStyle={styles.listFooter}
        contentContainerStyle={styles.listContent}
        renderItem={({ item: book }) => (
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.bookRow, pressed && styles.pressed]}
            onPress={() => navigation.navigate("BookDetail", { bookId: book.id })}
            onLongPress={() => {
              setBookToMove(book);
              setSheet("moveBook");
            }}
          >
            <MiniCover book={book} />
            <View style={styles.bookCopy}>
              <Text style={styles.bookTitle} numberOfLines={2}>{book.title}</Text>
              <Text style={styles.bookAuthor} numberOfLines={1}>{getAuthor(book.authorId)?.name ?? ""}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("folders.moveBook")}
              hitSlop={8}
              onPress={() => {
                setBookToMove(book);
                setSheet("moveBook");
              }}
            >
              <Ionicons name="folder-outline" size={20} color={c.muted} />
            </Pressable>
          </Pressable>
        )}
      />

      {/* ··· menu */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("common.cancel")} style={styles.menuOverlay} onPress={() => setMenuOpen(false)}>
          <View style={styles.menu}>
            {(
              [
                ["rename", "create-outline", t("folders.rename")],
                ["move", "return-up-forward-outline", t("folders.moveFolder")],
                ["delete", "trash-outline", t("folders.delete")],
              ] as const
            ).map(([key, icon, label]) => (
              <Pressable
                key={key}
                accessibilityRole="button"
                style={styles.menuRow}
                onPress={() => {
                  setMenuOpen(false);
                  // Let this Modal finish closing before the next one opens (iOS).
                  setTimeout(() => {
                    if (key === "delete") confirmDelete();
                    else setSheet(key);
                  }, 300);
                }}
              >
                <Ionicons name={icon} size={19} color={key === "delete" ? c.danger : c.ink} />
                <Text style={[styles.menuText, key === "delete" && { color: c.danger }]}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <CreateListSheet
        kind="folder"
        open={sheet === "create"}
        mode="create"
        initialEmoji="📁"
        onSave={(name, emoji) => createFolder(name, folder.id, emoji)}
        onClose={() => setSheet(null)}
      />
      <CreateListSheet
        kind="folder"
        open={sheet === "rename"}
        mode="rename"
        initialName={folder.name}
        initialEmoji={folder.emoji ?? "📁"}
        onSave={(name, emoji) => renameFolder(folder.id, name, emoji)}
        onClose={() => setSheet(null)}
      />
      <FolderPickerSheet
        open={sheet === "move"}
        title={t("folders.moveFolderTitle", { name: folder.name })}
        currentId={folder.parentId ?? null}
        noneLabel={t("folders.topLevel")}
        disabledIds={descendants}
        onPick={(target) => moveFolder(folder.id, target)}
        onClose={() => setSheet(null)}
      />
      <FolderPickerSheet
        open={sheet === "moveBook" && Boolean(bookToMove)}
        title={t("folders.moveBookTitle", { title: bookToMove?.title ?? "" })}
        currentId={bookToMove ? folderOfBook(bookFolders, bookToMove.id)?.id ?? null : null}
        noneLabel={t("folders.noFolder")}
        onPick={(target) => bookToMove && moveBookToFolder(bookToMove.id, target)}
        onClose={() => {
          setSheet(null);
          setBookToMove(null);
        }}
      />
      <AddBooksSheet
        open={sheet === "add"}
        folderId={folder.id}
        folderName={folder.name}
        onClose={() => setSheet(null)}
      />
    </Screen>
  );
}

/** The whole library with checkboxes: checked = in this folder. Tapping files or unfiles at once. */
function AddBooksSheet({ open, folderId, folderName, onClose }: { open: boolean; folderId: string; folderName: string; onClose: () => void }) {
  const { t } = useI18n();
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const { books, getAuthor, bookFolders, moveBookToFolder } = useBookliz();
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return books
      .map((book) => ({ book, author: getAuthor(book.authorId)?.name ?? "", folder: folderOfBook(bookFolders, book.id) }))
      .filter(({ book, author }) => !q || `${book.title} ${author}`.toLowerCase().includes(q))
      // Unfiled first: that is what someone organising wants to see.
      .sort((a, b) => Number(Boolean(a.folder)) - Number(Boolean(b.folder)) || a.book.title.localeCompare(b.book.title));
  }, [books, bookFolders, getAuthor, query]);

  return (
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.addSheet, { backgroundColor: c.bg }]}>
        <View style={styles.addHeader}>
          <Text style={styles.addTitle} numberOfLines={1}>{t("folders.addBooksTo", { name: folderName })}</Text>
          <Pressable accessibilityRole="button" onPress={onClose} hitSlop={10}>
            <Text style={styles.addDone}>{t("lists.done")}</Text>
          </Pressable>
        </View>
        <TextInput
          style={styles.search}
          placeholder={t("library.searchPlaceholder")}
          placeholderTextColor={c.muted}
          value={query}
          onChangeText={setQuery}
          clearButtonMode="while-editing"
        />
        <FlatList
          data={rows}
          keyExtractor={(r) => r.book.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item: { book, author, folder } }) => {
            const inHere = folder?.id === folderId;
            return (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: inHere }}
                style={styles.checkRow}
                onPress={() => moveBookToFolder(book.id, inHere ? null : folderId)}
              >
                <View style={[styles.checkbox, inHere && styles.checkboxOn]}>
                  {inHere ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
                </View>
                <View style={styles.bookCopy}>
                  <Text style={styles.bookTitle} numberOfLines={1}>{book.title}</Text>
                  <Text style={styles.bookAuthor} numberOfLines={1}>
                    {folder && !inHere ? `${author} · ${folder.emoji ?? "📁"} ${folder.name}` : author}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    headerButtons: { alignItems: "center", flexDirection: "row", gap: spacing.md },
    listFooter: { flexGrow: 1 },
    listContent: { flexGrow: 1, paddingBottom: 120, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
    breadcrumb: { color: c.muted, fontFamily: fonts.body, fontSize: 13, marginBottom: spacing.sm, paddingHorizontal: spacing.xs },
    block: {
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      marginBottom: spacing.lg,
      overflow: "hidden",
    },
    folderRow: { alignItems: "center", flexDirection: "row", gap: spacing.sm, minHeight: 52, paddingHorizontal: spacing.md },
    rowBorder: { borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth },
    pressed: { backgroundColor: c.surfaceAlt },
    folderEmoji: { fontSize: 20 },
    folderName: { color: c.ink, flex: 1, fontFamily: fonts.body, fontSize: 16 },
    count: { color: c.muted, fontFamily: fonts.bodyRegular, fontSize: 15 },
    booksHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm, paddingHorizontal: spacing.xs },
    sectionLabel: { color: c.muted, fontFamily: fonts.body, fontSize: 13, fontWeight: "700" },
    addBtn: { alignItems: "center", flexDirection: "row", gap: 4, minHeight: 36, paddingHorizontal: 6 },
    addBtnText: { color: c.tealDark, fontFamily: fonts.body, fontSize: 14, fontWeight: "800" },
    bookRow: { alignItems: "center", borderRadius: radii.sm, flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.xs, paddingVertical: 8 },
    bookCopy: { flex: 1 },
    bookTitle: { color: c.ink, fontFamily: fonts.body, fontSize: 15, fontWeight: "800" },
    bookAuthor: { color: c.muted, fontFamily: fonts.bodyRegular, fontSize: 13, marginTop: 2 },
    empty: { color: c.muted, fontFamily: fonts.bodyRegular, fontSize: 14, lineHeight: 20, marginTop: spacing.lg, textAlign: "center" },
    menuOverlay: { backgroundColor: "rgba(0,0,0,0.4)", flex: 1, justifyContent: "flex-end", padding: spacing.md },
    menu: { backgroundColor: c.surface, borderRadius: radii.lg, marginBottom: spacing.xl, overflow: "hidden" },
    menuRow: { alignItems: "center", flexDirection: "row", gap: spacing.md, minHeight: 54, paddingHorizontal: spacing.lg },
    menuText: { color: c.ink, fontFamily: fonts.body, fontSize: 16 },
    addSheet: { flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.md },
    addHeader: { alignItems: "center", flexDirection: "row", gap: spacing.md, justifyContent: "space-between", marginBottom: spacing.md },
    addTitle: { color: c.ink, flex: 1, fontFamily: fonts.display, fontSize: 20, fontWeight: "900" },
    addDone: { color: c.tealDark, fontFamily: fonts.body, fontSize: 16, fontWeight: "900" },
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
    checkRow: { alignItems: "center", flexDirection: "row", gap: spacing.md, minHeight: 54 },
    checkbox: { alignItems: "center", borderColor: c.border, borderRadius: 7, borderWidth: 2, height: 24, justifyContent: "center", width: 24 },
    checkboxOn: { backgroundColor: c.teal, borderColor: c.teal },
  });
}
