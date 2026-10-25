/**
 * The Audio tab — a BookPlayer-style library of everything that plays here.
 *
 * Every book with audio is one row (cover, title, author, length, progress)
 * and also its own folder: tapping it lists its files in order, so a book
 * imported as "Part 05…Part 11" arrives already organised. A ▶︎ on the row
 * plays without leaving the list. The reader's own folders (the same folders
 * the app already keeps, `bookFolders`) group books further.
 *
 * Files not given to a book yet sit on top, named after what the group of
 * files shares. Space, iCloud and the Apple Watch live one level down
 * ("···" → Files & storage) so the list stays a list.
 *
 * The same component is the tab (no folderId) and a pushed folder.
 */
import { Ionicons } from "@expo/vector-icons";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useAudiobookPlayer } from "../audio/AudiobookPlayerContext";
import { INBOX_IMPORT } from "../audio/audiobookEngine";
import { AudioImportError } from "../audio/audioFiles";
import type { Audiobook } from "../audio/audiobookModel";
import { CreateListSheet } from "../components/CreateListSheet";
import { useDialog } from "../components/DialogProvider";
import { FolderPickerSheet } from "../components/FolderPickerSheet";
import { MiniCover } from "../components/MiniCover";
import { Screen } from "../components/Screen";
import { useBookliz } from "../data/BooklizContext";
import { childFolders, deepBookCount, folderOfBook } from "../data/bookFolders";
import { useI18n } from "../i18n/LocalizationContext";
import { RootStackParamList } from "../navigation/types";
import { useColors } from "../theme/ThemeContext";
import { AppColors, fonts, radii, spacing } from "../theme/theme";
import type { BookFolder } from "../types/models";
import { hapticLight, hapticSuccess } from "../utils/haptics";
import { BookPickerSheet } from "../components/BookPickerSheet";
import { useEbooks } from "../ebook/EbookContext";
import { EbookImportError, pickEbookFiles } from "../ebook/ebookFiles";
import { isEbookFileName, isLockedEbookFileName, type Ebook } from "../ebook/ebookModel";
import { formatBytes } from "../audio/audiobookModel";
import { formatListenLength } from "./ManageAudioScreen";

type Menu =
  | { kind: "screen" }
  | { kind: "book"; bookId: string }
  | { kind: "folder"; folder: BookFolder }
  | { kind: "ebookInbox"; ebook: Ebook };

export function AudioLibraryScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "AudioFolder">>();
  const folderId = route.params?.folderId ?? null;
  const isRoot = folderId === null;
  const { t } = useI18n();
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const dialog = useDialog();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { getBook, getAuthor, bookFolders, createFolder, renameFolder, deleteFolder, moveBookToFolder } = useBookliz();
  const player = useAudiobookPlayer();
  const { engine } = player;
  const ebooks = useEbooks();

  const folder = folderId ? bookFolders.find((f) => f.id === folderId) ?? null : null;
  useEffect(() => {
    if (!isRoot) navigation.setOptions({ title: folder ? `${folder.emoji ?? "📁"} ${folder.name}` : "" });
  }, [folder, isRoot, navigation]);

  /** Books that have audio here (and still exist in the library). */
  const audioIds = useMemo(
    () =>
      new Set(
        [...Object.keys(player.library), ...Object.values(ebooks.library).map((e) => e.bookId ?? "")]
          .filter((id) => Boolean(id && getBook(id)))
      ),
    [ebooks.library, getBook, player.library]
  );

  // Folders here: those holding audio somewhere below, and empty ones (just
  // made, waiting to be filled). Library folders with only print books stay out.
  const folders = useMemo(
    () =>
      childFolders(bookFolders, folderId).filter((f) => {
        if (deepBookCount(bookFolders, f.id, audioIds) > 0) return true;
        const hasAnyBook = bookFolders.some((g) => (g.id === f.id || g.parentId === f.id) && g.bookIds.length > 0);
        return !hasAnyBook;
      }),
    [audioIds, bookFolders, folderId]
  );

  /** Books here that have audio, an ebook, or both — most recently used first. */
  const audiobooks = useMemo(() => {
    const here = [...audioIds].filter((id) => (folderOfBook(bookFolders, id)?.id ?? null) === folderId);
    const rank = (id: string) => {
      const audio: Audiobook | undefined = player.library[id];
      const ebook = ebooks.ebookForBook(id);
      return [audio?.lastPlayedAt, audio?.addedAt, ebook?.lastOpenedAt, ebook?.addedAt].filter(Boolean).sort().pop() ?? "";
    };
    return here.sort((a, b) => rank(b).localeCompare(rank(a)));
  }, [audioIds, bookFolders, ebooks, folderId, player.library]);

  const inbox = isRoot ? player.inbox : [];
  const ebookInbox = isRoot ? ebooks.inbox : [];
  const importingInbox = player.importing?.bookId === INBOX_IMPORT ? player.importing : null;
  const isEmpty = !inbox.length && !ebookInbox.length && !folders.length && !audiobooks.length;

  // ── Menus ────────────────────────────────────────────────────────────────
  const [menu, setMenu] = useState<Menu | null>(null);
  const [sheet, setSheet] = useState<
    | { kind: "createFolder" }
    | { kind: "renameFolder"; folder: BookFolder }
    | { kind: "moveBook"; bookId: string }
    | { kind: "assignEbook"; ebook: Ebook }
    | null
  >(null);
  // An action picked in the menu runs once the menu's Modal is gone: iOS
  // refuses to present a second modal while the first is still sliding out.
  const pendingRef = useRef<(() => void) | null>(null);
  const runAfterMenu = (action: () => void) => {
    pendingRef.current = action;
    setMenu(null);
    setTimeout(flushPending, 600);
  };
  const flushPending = () => {
    const action = pendingRef.current;
    pendingRef.current = null;
    action?.();
  };

  /**
   * One picker for everything this tab holds: audio goes to the audio inbox,
   * ebooks (EPUB, PDF, CBZ/CBR, TXT) to the ebook inbox.
   */
  const importFiles = async () => {
    let picked;
    try {
      picked = await pickEbookFiles();
    } catch (error) {
      dialog.alert(t("player.errors.unreadableTitle"), error instanceof Error ? error.message : String(error));
      return;
    }
    if (!picked) return;
    const books = picked.filter((p) => isEbookFileName(p.name) || isLockedEbookFileName(p.name));
    const audio = picked.filter((p) => !books.includes(p));
    if (books.length) {
      const result = ebooks.importPicked(books, null);
      if (result.imported.length) hapticSuccess();
      const failure = result.failed[0];
      if (failure) {
        const problem = failure.error instanceof EbookImportError ? failure.error.problem : "unreadable";
        dialog.alert(t(`ebook.errors.${problem}Title`), t(`ebook.errors.${problem}Body`, { name: failure.name }));
      }
    }
    if (audio.length) {
      try {
        const item = await engine.importIntoInbox(audio);
        if (item) hapticSuccess();
      } catch (error) {
        const problem = error instanceof AudioImportError ? error.problem : "unreadable";
        const detail = error instanceof AudioImportError ? error.detail : error instanceof Error ? error.message : undefined;
        const body = t(`player.errors.${problem}Body`);
        dialog.alert(t(`player.errors.${problem}Title`), detail ? `${body}\n\n${t("auth.errorDetail", { detail })}` : body);
      }
    }
  };

  const playOrPause = (bookId: string) => {
    hapticLight();
    if (player.activeBookId === bookId && player.isPlaying) engine.pause();
    else void engine.open(bookId, true);
  };

  const removeAudio = (bookId: string) =>
    dialog.confirm({
      title: t("player.removeConfirmTitle"),
      body: t("player.removeConfirmBody"),
      confirmLabel: t("player.removeConfirm"),
      destructive: true,
      onConfirm: () => engine.removeAudio(bookId),
    });

  const confirmDeleteFolder = (target: BookFolder) =>
    dialog.confirm({
      title: t("audioLib.deleteFolderTitle", { name: target.name }),
      body: t("audioLib.deleteFolderBody"),
      confirmLabel: t("common.delete"),
      destructive: true,
      onConfirm: () => deleteFolder(target.id),
    });

  // ── Render ───────────────────────────────────────────────────────────────
  const menuRows: { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; danger?: boolean; run: () => void }[] =
    menu?.kind === "screen"
      ? [
          { key: "import", icon: "download-outline", label: t("fileManager.import"), run: () => void importFiles() },
          { key: "newFolder", icon: "folder-open-outline", label: t("audioLib.newFolder"), run: () => setSheet({ kind: "createFolder" }) },
          { key: "storage", icon: "server-outline", label: t("audioLib.storage"), run: () => navigation.navigate("ManageAudio") },
        ]
      : menu?.kind === "ebookInbox"
        ? [
            { key: "read", icon: "book-outline", label: t("ebook.read"), run: () => navigation.navigate("Reader", { ebookId: menu.ebook.id }) },
            { key: "assign", icon: "link-outline", label: t("fileManager.assign"), run: () => setSheet({ kind: "assignEbook", ebook: menu.ebook }) },
            { key: "delete", icon: "trash-outline", label: t("fileManager.delete"), danger: true, run: () => dialog.confirm({
              title: t("fileManager.deleteTitle"),
              body: t("fileManager.deleteBody", { title: menu.ebook.title }),
              confirmLabel: t("common.delete"),
              destructive: true,
              onConfirm: () => ebooks.remove(menu.ebook.id),
            }) },
          ]
      : menu?.kind === "book"
        ? [
            ...(player.library[menu.bookId]
              ? [{ key: "files", icon: "list-outline" as const, label: t("audioLib.showFiles"), run: () => navigation.navigate("AudioBookFiles", { bookId: menu.bookId }) }]
              : []),
            ...(ebooks.ebookForBook(menu.bookId)
              ? [{ key: "read", icon: "book-outline" as const, label: t("ebook.read"), run: () => navigation.navigate("Reader", { ebookId: ebooks.ebookForBook(menu.bookId)!.id }) }]
              : []),
            { key: "move", icon: "folder-outline", label: t("audioLib.moveToFolder"), run: () => setSheet({ kind: "moveBook", bookId: menu.bookId }) },
            { key: "detail", icon: "book-outline", label: t("audioLib.openBook"), run: () => navigation.navigate("BookDetail", { bookId: menu.bookId }) },
            ...(player.library[menu.bookId]
              ? [{ key: "remove", icon: "trash-outline" as const, label: t("player.removeAudio"), danger: true, run: () => removeAudio(menu.bookId) }]
              : []),
            ...(ebooks.ebookForBook(menu.bookId)
              ? [{ key: "removeEbook", icon: "trash-outline" as const, label: t("ebook.remove"), danger: true, run: () => dialog.confirm({
                  title: t("ebook.removeTitle"),
                  body: t("ebook.removeBody"),
                  confirmLabel: t("common.delete"),
                  destructive: true,
                  onConfirm: () => ebooks.remove(ebooks.ebookForBook(menu.bookId)!.id),
                }) }]
              : []),
          ]
        : menu?.kind === "folder"
          ? [
              { key: "rename", icon: "create-outline", label: t("audioLib.renameFolder"), run: () => setSheet({ kind: "renameFolder", folder: menu.folder }) },
              { key: "delete", icon: "trash-outline", label: t("audioLib.deleteFolder"), danger: true, run: () => confirmDeleteFolder(menu.folder) },
            ]
          : [];
  const menuTitle =
    menu?.kind === "book" ? getBook(menu.bookId)?.title ?? "" : menu?.kind === "folder" ? menu.folder.name : menu?.kind === "ebookInbox" ? menu.ebook.title : "";

  return (
    <Screen>
      <View style={styles.header}>
        {isRoot ? <Text style={styles.title}>{t("audioLib.title")}</Text> : <View style={{ flex: 1 }} />}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("fileManager.import")}
          disabled={Boolean(player.importing)}
          hitSlop={6}
          style={styles.circleBtn}
          onPress={() => void importFiles()}
        >
          {importingInbox ? <ActivityIndicator color={c.teal} /> : <Ionicons name="add" size={22} color={c.teal} />}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("a11y.more")}
          hitSlop={6}
          style={styles.circleBtn}
          onPress={() => setMenu({ kind: "screen" })}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={c.teal} />
        </Pressable>
      </View>
      {importingInbox ? (
        <Text style={styles.importing}>{t("fileManager.importing", { done: importingInbox.done, total: importingInbox.total })}</Text>
      ) : null}

      {isEmpty ? (
        <View style={styles.empty}>
          <Ionicons name={isRoot ? "headset-outline" : "folder-open-outline"} size={40} color={c.muted} />
          <Text style={styles.emptyTitle}>{isRoot ? t("audioLib.emptyTitle") : t("audioLib.emptyFolderTitle")}</Text>
          <Text style={styles.emptyBody}>{isRoot ? t("audioLib.emptyBody") : t("audioLib.emptyFolderBody")}</Text>
          {isRoot ? (
            <Pressable accessibilityRole="button" style={styles.emptyBtn} onPress={() => void importFiles()}>
              <Ionicons name="download-outline" size={18} color="#FFFFFF" />
              <Text style={styles.emptyBtnText}>{t("fileManager.import")}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* ── Not given to a book yet ───────────────────────────────────────── */}
      {inbox.length || ebookInbox.length ? (
        <>
          <Text style={styles.sectionLabel}>{t("audioLib.unassigned")}</Text>
          {ebookInbox.map((ebook) => (
            <Pressable
              key={ebook.id}
              accessibilityRole="button"
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => setMenu({ kind: "ebookInbox", ebook })}
            >
              <View style={[styles.tile, { backgroundColor: c.teal + "1A" }]}>
                <Ionicons name={ebook.format === "comic" ? "images" : ebook.format === "pdf" ? "document" : "book"} size={22} color={c.tealDark} />
              </View>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle} numberOfLines={2}>{ebook.title}</Text>
                <Text style={styles.rowSub} numberOfLines={1}>{[t(`ebook.format_${ebook.format}`), formatBytes(ebook.bytes)].join(" · ")}</Text>
                <Text style={styles.rowHint}>{t("audioLib.assignHint")}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={c.muted} />
            </Pressable>
          ))}
          {inbox.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => navigation.navigate("ManageAudio", { inboxItemId: item.id })}
            >
              <View style={[styles.tile, { backgroundColor: c.coral + "22" }]}>
                <Ionicons name="musical-notes" size={22} color={c.coral} />
              </View>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle} numberOfLines={2}>{item.title || t("fileManager.untitled")}</Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {[t("manageAudio.files", { count: item.tracks.filter((track) => !track.removed).length }), formatListenLength(item.totalSec, t)].join(" · ")}
                </Text>
                <Text style={styles.rowHint}>{t("audioLib.assignHint")}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={c.muted} />
            </Pressable>
          ))}
          {folders.length || audiobooks.length ? <Text style={styles.sectionLabel}>{t("audioLib.audiobooks")}</Text> : null}
        </>
      ) : null}

      {/* ── Folders ───────────────────────────────────────────────────────── */}
      {folders.map((f) => {
        const count = deepBookCount(bookFolders, f.id, audioIds);
        return (
          <Pressable
            key={f.id}
            accessibilityRole="button"
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => navigation.push("AudioFolder", { folderId: f.id })}
            onLongPress={() => setMenu({ kind: "folder", folder: f })}
          >
            <View style={[styles.tile, { backgroundColor: c.teal + "1A" }]}>
              <Text style={styles.tileEmoji}>{f.emoji ?? "📁"}</Text>
            </View>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle} numberOfLines={1}>{f.name}</Text>
              <Text style={styles.rowSub}>{count === 1 ? t("audioLib.oneAudiobook") : t("audioLib.audiobookCount", { count })}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={c.muted} />
          </Pressable>
        );
      })}

      {/* ── Audiobooks ────────────────────────────────────────────────────── */}
      {audiobooks.map((bookId) => {
        const book = getBook(bookId);
        if (!book) return null;
        const audiobook = player.library[bookId] as Audiobook | undefined;
        const ebook = ebooks.ebookForBook(bookId);
        if (!audiobook && ebook) {
          // Ebook only: the row opens the reader.
          const pct = Math.round((ebook.progress ?? 0) * 100);
          return (
            <Pressable
              key={bookId}
              accessibilityRole="button"
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => navigation.navigate("Reader", { ebookId: ebook.id })}
              onLongPress={() => setMenu({ kind: "book", bookId })}
            >
              <MiniCover book={book} width={52} />
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle} numberOfLines={2}>{book.title}</Text>
                <Text style={styles.rowSub} numberOfLines={1}>{getAuthor(book.authorId)?.name ?? ""}</Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {[t(`ebook.format_${ebook.format}`), pct >= 99 ? t("audioLib.finished") : pct > 0 ? t("audioLib.percent", { pct }) : null].filter(Boolean).join(" · ")}
                </Text>
                {pct > 0 && pct < 99 ? <View style={styles.track}><View style={[styles.trackFill, { width: `${pct}%` }]} /></View> : null}
              </View>
              <View style={styles.playBtn}>
                <Ionicons name="book-outline" size={18} color={c.teal} />
              </View>
            </Pressable>
          );
        }
        if (!audiobook) return null;
        const active = player.activeBookId === bookId;
        const playing = active && player.isPlaying;
        const pct = audiobook.totalSec > 0 ? Math.min(100, Math.round((audiobook.positionSec / audiobook.totalSec) * 100)) : 0;
        const files = audiobook.tracks.filter((track) => !track.removed).length;
        return (
          <Pressable
            key={bookId}
            accessibilityRole="button"
            accessibilityHint={t("audioLib.rowHint")}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => navigation.navigate("AudioBookFiles", { bookId })}
            onLongPress={() => setMenu({ kind: "book", bookId })}
          >
            <MiniCover book={book} width={52} />
            <View style={styles.rowCopy}>
              <Text style={[styles.rowTitle, active && { color: c.tealDark }]} numberOfLines={2}>{book.title}</Text>
              <Text style={styles.rowSub} numberOfLines={1}>{getAuthor(book.authorId)?.name ?? ""}</Text>
              <Text style={styles.rowSub} numberOfLines={1}>
                {[
                  formatListenLength(audiobook.totalSec, t),
                  files > 1 ? t("manageAudio.files", { count: files }) : null,
                  ebook ? t(`ebook.format_${ebook.format}`) : null,
                  pct >= 99 ? t("audioLib.finished") : pct > 0 ? t("audioLib.percent", { pct }) : null,
                ].filter(Boolean).join(" · ")}
              </Text>
              {pct > 0 && pct < 99 ? (
                <View style={styles.track}><View style={[styles.trackFill, { width: `${pct}%` }]} /></View>
              ) : null}
            </View>
            {ebook ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("ebook.read")}
                hitSlop={8}
                style={styles.playBtn}
                onPress={() => navigation.navigate("Reader", { ebookId: ebook.id })}
              >
                <Ionicons name="book-outline" size={18} color={c.teal} />
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={playing ? t("audioLib.pause") : t("audioLib.play")}
              hitSlop={8}
              style={[styles.playBtn, active && styles.playBtnActive]}
              onPress={() => playOrPause(bookId)}
            >
              <Ionicons name={playing ? "pause" : "play"} size={18} color={active ? "#FFFFFF" : c.teal} style={playing ? undefined : { marginLeft: 2 }} />
            </Pressable>
          </Pressable>
        );
      })}

      {/* ── Menu ──────────────────────────────────────────────────────────── */}
      <Modal visible={Boolean(menu)} transparent animationType="fade" onRequestClose={() => setMenu(null)} onDismiss={flushPending}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("common.cancel")} style={styles.menuOverlay} onPress={() => setMenu(null)}>
          <View style={styles.menu}>
            {menuTitle ? <Text style={styles.menuTitle} numberOfLines={2}>{menuTitle}</Text> : null}
            {menuRows.map((row) => (
              <Pressable key={row.key} accessibilityRole="button" style={styles.menuRow} onPress={() => runAfterMenu(row.run)}>
                <Ionicons name={row.icon} size={19} color={row.danger ? c.danger : c.ink} />
                <Text style={[styles.menuText, row.danger && { color: c.danger }]}>{row.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <CreateListSheet
        kind="folder"
        open={sheet?.kind === "createFolder"}
        mode="create"
        initialEmoji="🎧"
        onSave={(name, emoji) => createFolder(name, folderId, emoji)}
        onClose={() => setSheet(null)}
      />
      <CreateListSheet
        kind="folder"
        open={sheet?.kind === "renameFolder"}
        mode="rename"
        initialName={sheet?.kind === "renameFolder" ? sheet.folder.name : ""}
        initialEmoji={sheet?.kind === "renameFolder" ? sheet.folder.emoji ?? "📁" : "📁"}
        onSave={(name, emoji) => sheet?.kind === "renameFolder" && renameFolder(sheet.folder.id, name, emoji)}
        onClose={() => setSheet(null)}
      />
      <BookPickerSheet
        open={sheet?.kind === "assignEbook"}
        title={t("fileManager.assignTitle", { title: sheet?.kind === "assignEbook" ? sheet.ebook.title : "" })}
        initialQuery={sheet?.kind === "assignEbook" ? sheet.ebook.title : ""}
        onPick={(bookId) => {
          if (sheet?.kind !== "assignEbook") return;
          ebooks.assign(sheet.ebook.id, bookId);
          hapticSuccess();
        }}
        onClose={() => setSheet(null)}
      />
      <FolderPickerSheet
        open={sheet?.kind === "moveBook"}
        title={t("audioLib.moveTitle", { title: sheet?.kind === "moveBook" ? getBook(sheet.bookId)?.title ?? "" : "" })}
        currentId={sheet?.kind === "moveBook" ? folderOfBook(bookFolders, sheet.bookId)?.id ?? null : null}
        noneLabel={t("audioLib.noFolder")}
        onPick={(target) => sheet?.kind === "moveBook" && moveBookToFolder(sheet.bookId, target)}
        onClose={() => setSheet(null)}
      />
    </Screen>
  );
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    header: { alignItems: "center", flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
    title: { color: c.ink, flex: 1, fontFamily: fonts.display, fontSize: 28, fontWeight: "900" },
    circleBtn: {
      alignItems: "center", backgroundColor: c.surface, borderColor: c.border, borderRadius: 22,
      borderWidth: 1, height: 44, justifyContent: "center", width: 44,
    },
    importing: { color: c.tealDark, fontFamily: fonts.body, fontSize: 13, fontWeight: "800", marginBottom: spacing.sm },
    sectionLabel: {
      color: c.muted, fontFamily: fonts.body, fontSize: 12, fontWeight: "900", letterSpacing: 0.8,
      marginBottom: spacing.xs, marginTop: spacing.sm, textTransform: "uppercase",
    },
    row: {
      alignItems: "center", borderBottomColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row", gap: spacing.md, paddingVertical: 12,
    },
    rowPressed: { opacity: 0.7 },
    tile: { alignItems: "center", borderRadius: radii.sm, height: 52, justifyContent: "center", width: 52 },
    tileEmoji: { fontSize: 24 },
    rowCopy: { flex: 1, gap: 2 },
    rowTitle: { color: c.ink, fontFamily: fonts.body, fontSize: 16, fontWeight: "800" },
    rowSub: { color: c.muted, fontFamily: fonts.body, fontSize: 13, fontWeight: "600" },
    rowHint: { color: c.coral, fontFamily: fonts.body, fontSize: 12, fontWeight: "800", marginTop: 2 },
    track: { backgroundColor: c.border, borderRadius: 2, height: 3, marginTop: 6, overflow: "hidden" },
    trackFill: { backgroundColor: c.teal, height: 3 },
    playBtn: {
      alignItems: "center", borderColor: c.teal, borderRadius: 20, borderWidth: 1.5,
      height: 40, justifyContent: "center", width: 40,
    },
    playBtnActive: { backgroundColor: c.teal },
    empty: { alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
    emptyTitle: { color: c.ink, fontFamily: fonts.display, fontSize: 20, fontWeight: "900", textAlign: "center" },
    emptyBody: { color: c.muted, fontFamily: fonts.bodyRegular, fontSize: 14, lineHeight: 20, textAlign: "center" },
    emptyBtn: {
      alignItems: "center", backgroundColor: c.teal, borderRadius: radii.pill, flexDirection: "row",
      gap: spacing.xs, marginTop: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: 12,
    },
    emptyBtnText: { color: "#FFFFFF", fontFamily: fonts.body, fontSize: 15, fontWeight: "900" },
    menuOverlay: { backgroundColor: "rgba(0,0,0,0.4)", flex: 1, justifyContent: "flex-end", padding: spacing.md },
    menu: { backgroundColor: c.surface, borderRadius: radii.lg, marginBottom: spacing.xl, overflow: "hidden" },
    menuTitle: { color: c.muted, fontFamily: fonts.body, fontSize: 13, fontWeight: "700", paddingBottom: spacing.xs, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
    menuRow: { alignItems: "center", flexDirection: "row", gap: spacing.md, minHeight: 54, paddingHorizontal: spacing.lg },
    menuText: { color: c.ink, fontFamily: fonts.body, fontSize: 16 },
  });
}
