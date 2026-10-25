/**
 * Audio files — Bookliz's file manager, BookPlayer-style.
 *
 * Files come in first (Import here, or "Open in Bookliz" from Files / AirDrop)
 * and wait in "Not assigned" until they are given a book: an existing one, or
 * a new one found through the normal book search. Below that, every book's
 * audio with what it takes up and the ways to give space back.
 */
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Paths } from "expo-file-system";
import { useMemo, useState } from "react";
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useAudiobookPlayer } from "../audio/AudiobookPlayerContext";
import { INBOX_IMPORT } from "../audio/audiobookEngine";
import { AudioImportError, audioFolderSize } from "../audio/audioFiles";
import { formatBytes, type AudioInboxItem } from "../audio/audiobookModel";
import { CloudEntry } from "../audio/cloudAudio";
import { useCloudAudio } from "../audio/useCloudAudio";
import { useWatchAudio } from "../watch/useWatchAudio";
import { usePro } from "../pro/ProContext";
import { BookPickerSheet } from "../components/BookPickerSheet";
import { useDialog } from "../components/DialogProvider";
import { Screen } from "../components/Screen";
import { SettingsGroup, SettingsRow } from "../components/settings/SettingsList";
import { useBookliz } from "../data/BooklizContext";
import { useI18n } from "../i18n/LocalizationContext";
import { RootStackParamList } from "../navigation/types";
import { useColors } from "../theme/ThemeContext";
import { AppColors, fonts, radii, spacing } from "../theme/theme";
import { hapticSuccess } from "../utils/haptics";

/** "9 h 12 min" / "48 min". */
export function formatListenLength(sec: number, t: (key: string, vars?: Record<string, string | number>) => string): string {
  const minutes = Math.max(1, Math.round(sec / 60));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return t("fileManager.minutes", { m });
  return m ? t("fileManager.hoursMinutes", { h, m }) : t("fileManager.hours", { h });
}

export function ManageAudioScreen() {
  const { t } = useI18n();
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const dialog = useDialog();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { getBook } = useBookliz();
  const player = useAudiobookPlayer();
  const { engine } = player;
  // Sizes are read from disk; bump to re-read after a delete.
  const [version, setVersion] = useState(0);
  const [actionsFor, setActionsFor] = useState<AudioInboxItem | null>(null);
  const [assigning, setAssigning] = useState<AudioInboxItem | null>(null);
  const [renaming, setRenaming] = useState<AudioInboxItem | null>(null);
  const { isPro } = usePro();
  const cloud = useCloudAudio(isPro);
  const watchAudio = useWatchAudio();

  const sendToWatch = (bookId: string) => {
    if (!isPro) {
      navigation.navigate("Paywall", { feature: "watchStandalone" });
      return;
    }
    const queued = watchAudio.send(bookId);
    if (queued > 0) {
      hapticSuccess();
      dialog.alert(t("watchAudio.sentTitle"), t("watchAudio.sentBody"));
    } else {
      dialog.alert(t("watchAudio.failedTitle"), t("watchAudio.failedBody"));
    }
  };

  const removeFromWatch = (bookId: string, title: string) =>
    dialog.confirm({
      title: t("watchAudio.removeTitle"),
      body: t("watchAudio.removeBody", { title }),
      confirmLabel: t("watchAudio.removeConfirm"),
      destructive: true,
      onConfirm: () => watchAudio.remove(bookId),
    });
  const cloudReady = isPro && cloud.supported && cloud.status.available;
  const remoteOnly = cloud.entries.filter((entry) => !entry.onThisDevice);

  const cloudError = (error: unknown) =>
    dialog.alert(t("cloudAudio.failedTitle"), error instanceof Error ? error.message : String(error));

  const saveToCloud = async (bookId: string) => {
    if (!isPro) {
      navigation.navigate("Paywall", { feature: "cloudAudio" });
      return;
    }
    if (!cloudReady) {
      dialog.alert(t("cloudAudio.offTitle"), t("cloudAudio.offBody"));
      return;
    }
    try {
      await cloud.upload(bookId);
      hapticSuccess();
    } catch (error) {
      cloudError(error);
    }
  };

  const downloadFromCloud = async (entry: CloudEntry) => {
    try {
      const where = await cloud.download(entry);
      hapticSuccess();
      setVersion((v) => v + 1);
      if (where === "inbox") dialog.alert(t("cloudAudio.inInboxTitle"), t("cloudAudio.inInboxBody"));
    } catch (error) {
      cloudError(error);
    }
  };

  const removeFromCloud = (entry: CloudEntry, title: string) =>
    dialog.confirm({
      title: t("cloudAudio.removeTitle"),
      body: t("cloudAudio.removeBody", { title }),
      confirmLabel: t("cloudAudio.removeConfirm"),
      destructive: true,
      onConfirm: () => { void cloud.remove(entry).catch(cloudError); },
    });

  const transferText = (id: string) => {
    const transfer = cloud.transfers[id];
    if (!transfer) return null;
    return t(transfer.direction === "upload" ? "cloudAudio.uploading" : "cloudAudio.downloading", {
      done: transfer.done,
      total: transfer.total,
    });
  };

  const importingInbox = player.importing?.bookId === INBOX_IMPORT ? player.importing : null;

  const inboxRows = useMemo(() => {
    void version;
    return player.inbox.map((item) => ({ item, bytes: audioFolderSize(item.folder), files: item.tracks.filter((t) => !t.removed).length }));
  }, [player.inbox, version]);

  const bookRows = useMemo(() => {
    void version;
    return Object.values(player.library)
      .map((audiobook) => {
        const book = getBook(audiobook.bookId);
        return {
          bookId: audiobook.bookId,
          title: book?.title ?? "—",
          bytes: audioFolderSize(audiobook.folder),
          files: audiobook.tracks.filter((track) => !track.removed).length,
          listened: engine.listenedFiles(audiobook.bookId),
        };
      })
      .sort((a, b) => b.bytes - a.bytes);
  }, [engine, getBook, player.library, version]);

  const total = bookRows.reduce((sum, row) => sum + row.bytes, 0) + inboxRows.reduce((sum, row) => sum + row.bytes, 0);
  let free = 0;
  try {
    free = Paths.availableDiskSpace;
  } catch {
    free = 0;
  }

  const importFiles = async () => {
    try {
      const item = await engine.pickIntoInbox();
      if (item) hapticSuccess();
    } catch (error) {
      const problem = error instanceof AudioImportError ? error.problem : "unreadable";
      const detail = error instanceof AudioImportError ? error.detail : error instanceof Error ? error.message : undefined;
      const body = t(`player.errors.${problem}Body`);
      dialog.alert(t(`player.errors.${problem}Title`), detail ? `${body}\n\n${t("auth.errorDetail", { detail })}` : body);
    }
  };

  const removeListened = (bookId: string, count: number, bytes: number) =>
    dialog.confirm({
      title: t("player.deleteListenedTitle"),
      body: t("player.deleteListenedBody", { count, size: formatBytes(bytes) }),
      confirmLabel: t("player.deleteListenedConfirm"),
      destructive: true,
      onConfirm: () => {
        engine.removeListenedFiles(bookId);
        hapticSuccess();
        setVersion((v) => v + 1);
      },
    });

  const removeAudio = (bookId: string) =>
    dialog.confirm({
      title: t("player.removeConfirmTitle"),
      body: t("player.removeConfirmBody"),
      confirmLabel: t("player.removeConfirm"),
      destructive: true,
      onConfirm: () => {
        engine.removeAudio(bookId);
        hapticSuccess();
        setVersion((v) => v + 1);
      },
    });

  const runItemAction = (key: "assign" | "create" | "rename" | "delete", item: AudioInboxItem) => {
    setActionsFor(null);
    // Let the action sheet finish closing before another Modal opens (iOS).
    setTimeout(() => {
      if (key === "assign") setAssigning(item);
      else if (key === "rename") setRenaming(item);
      else if (key === "create") {
        navigation.navigate("BookIntake", {
          initialMode: "search",
          initialQuery: item.title,
          autoRun: Boolean(item.title),
          attachAudioFrom: item.id,
        });
      } else {
        dialog.confirm({
          title: t("fileManager.deleteTitle"),
          body: t("fileManager.deleteBody", { title: item.title || t("fileManager.untitled") }),
          confirmLabel: t("common.delete"),
          destructive: true,
          onConfirm: () => {
            engine.removeInboxItem(item.id);
            setVersion((v) => v + 1);
          },
        });
      }
    }, 300);
  };

  return (
    <Screen>
      <Pressable
        accessibilityRole="button"
        disabled={Boolean(player.importing)}
        style={({ pressed }) => [styles.importBtn, pressed && { opacity: 0.85 }, player.importing && { opacity: 0.6 }]}
        onPress={() => void importFiles()}
      >
        {importingInbox ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="download-outline" size={20} color="#FFFFFF" />}
        <Text style={styles.importText}>
          {importingInbox
            ? t("fileManager.importing", { done: importingInbox.done, total: importingInbox.total })
            : t("fileManager.import")}
        </Text>
      </Pressable>

      {/* ── iCloud (Pro) ─────────────────────────────────────────────────── */}
      <SettingsGroup
        header={t("cloudAudio.header")}
        footer={
          !isPro
            ? t("cloudAudio.footerPro")
            : !cloud.supported
              ? t("cloudAudio.footerUnsupported")
              : !cloud.status.available
                ? t("cloudAudio.offBody")
                : remoteOnly.length
                  ? t("cloudAudio.footerRemote")
                  : t("cloudAudio.footerEmpty")
        }
      >
        {!isPro ? (
          <SettingsRow
            title={t("cloudAudio.rowLocked")}
            value={t("pro.requiresPro")}
            onPress={() => navigation.navigate("Paywall", { feature: "cloudAudio" })}
          />
        ) : null}
        {cloudReady
          ? remoteOnly.map((entry) => {
              const title = entry.manifest?.title || t("fileManager.untitled");
              const moving = transferText(entry.remoteId);
              return (
                <SettingsRow
                  key={entry.remoteId}
                  title={title}
                  subtitle={moving ?? [entry.manifest?.author, t("manageAudio.files", { count: entry.files }), formatBytes(entry.bytes)].filter(Boolean).join(" · ")}
                  chevron={false}
                  accessory={
                    moving ? (
                      <ActivityIndicator color={c.teal} />
                    ) : (
                      <Pressable accessibilityRole="button" accessibilityLabel={t("cloudAudio.download")} hitSlop={8} onPress={() => void downloadFromCloud(entry)}>
                        <Ionicons name="cloud-download-outline" size={22} color={c.teal} />
                      </Pressable>
                    )
                  }
                  onPress={moving ? undefined : () => removeFromCloud(entry, title)}
                />
              );
            })
          : null}
      </SettingsGroup>

      <SettingsGroup
        header={t("fileManager.inboxHeader")}
        footer={inboxRows.length ? t("fileManager.inboxFooter") : t("fileManager.inboxEmpty")}
      >
        {inboxRows.map(({ item, bytes, files }) => (
          <SettingsRow
            key={item.id}
            title={item.title || t("fileManager.untitled")}
            subtitle={[
              t("manageAudio.files", { count: files }),
              formatListenLength(item.totalSec, t),
              formatBytes(bytes),
            ].join(" · ")}
            onPress={() => setActionsFor(item)}
          />
        ))}
      </SettingsGroup>

      <SettingsGroup header={t("manageAudio.spaceHeader")}>
        <SettingsRow title={t("manageAudio.audiobooks")} value={total > 0 ? formatBytes(total) : "—"} />
        {free > 0 ? <SettingsRow title={t("manageAudio.free")} value={formatBytes(free)} /> : null}
      </SettingsGroup>

      {bookRows.length ? <Text style={styles.sectionLabel}>{t("fileManager.inBooksHeader")}</Text> : null}
      {bookRows.map((row) => (
        <SettingsGroup key={row.bookId} header={row.title}>
          <SettingsRow
            title={t("manageAudio.size")}
            value={`${formatBytes(row.bytes)} · ${t("manageAudio.files", { count: row.files })}`}
          />
          {row.listened.count > 0 ? (
            <SettingsRow
              title={t("player.deleteListened")}
              subtitle={t("player.deleteListenedDetail", { count: row.listened.count, size: formatBytes(row.listened.bytes) })}
              chevron={false}
              onPress={() => removeListened(row.bookId, row.listened.count, row.listened.bytes)}
            />
          ) : null}
          <SettingsRow
            title={t("fileManager.detach")}
            subtitle={t("fileManager.detachHint")}
            chevron={false}
            onPress={() =>
              dialog.confirm({
                title: t("fileManager.detachTitle"),
                body: t("fileManager.detachBody"),
                confirmLabel: t("fileManager.detachConfirm"),
                onConfirm: () => {
                  engine.detachToInbox(row.bookId);
                  setVersion((v) => v + 1);
                },
              })
            }
          />
          {(() => {
            const moving = transferText(row.bookId);
            const entry = cloud.inCloud.get(row.bookId);
            if (moving) {
              return <SettingsRow title={moving} chevron={false} accessory={<ActivityIndicator color={c.teal} />} />;
            }
            if (entry && cloudReady) {
              return (
                <SettingsRow
                  title={entry.uploaded ? t("cloudAudio.inCloud") : t("cloudAudio.syncing")}
                  subtitle={t("cloudAudio.removeHint")}
                  chevron={false}
                  accessory={<Ionicons name={entry.uploaded ? "cloud-done-outline" : "cloud-upload-outline"} size={20} color={c.teal} />}
                  onPress={() => removeFromCloud(entry, row.title)}
                />
              );
            }
            return (
              <SettingsRow
                title={t("cloudAudio.save")}
                value={isPro ? undefined : t("pro.requiresPro")}
                chevron={false}
                accessory={<Ionicons name="cloud-upload-outline" size={20} color={c.teal} />}
                onPress={() => void saveToCloud(row.bookId)}
              />
            );
          })()}
          {watchAudio.available
            ? (() => {
                const sending = watchAudio.transfers.get(row.bookId);
                const onWatch = watchAudio.held.get(row.bookId);
                if (sending) {
                  return (
                    <SettingsRow
                      title={t("watchAudio.sending", { percent: Math.round(sending.fraction * 100) })}
                      subtitle={t("watchAudio.sendingHint")}
                      chevron={false}
                      accessory={<ActivityIndicator color={c.teal} />}
                    />
                  );
                }
                if (onWatch?.complete) {
                  return (
                    <SettingsRow
                      title={t("watchAudio.onWatch")}
                      subtitle={t("watchAudio.removeHint")}
                      chevron={false}
                      accessory={<Ionicons name="watch" size={20} color={c.teal} />}
                      onPress={() => removeFromWatch(row.bookId, row.title)}
                    />
                  );
                }
                return (
                  <SettingsRow
                    title={t("watchAudio.send")}
                    subtitle={onWatch ? t("watchAudio.partial", { received: onWatch.received, total: onWatch.total }) : undefined}
                    value={isPro ? undefined : t("pro.requiresPro")}
                    chevron={false}
                    accessory={<Ionicons name="watch-outline" size={20} color={c.teal} />}
                    onPress={() => sendToWatch(row.bookId)}
                  />
                );
              })()
            : null}
          <SettingsRow title={t("player.removeAudio")} destructive chevron={false} onPress={() => removeAudio(row.bookId)} />
        </SettingsGroup>
      ))}

      {/* Inbox item actions */}
      <Modal visible={Boolean(actionsFor)} transparent animationType="fade" onRequestClose={() => setActionsFor(null)}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("common.cancel")} style={styles.menuOverlay} onPress={() => setActionsFor(null)}>
          <View style={styles.menu}>
            <Text style={styles.menuTitle} numberOfLines={2}>{actionsFor?.title || t("fileManager.untitled")}</Text>
            {(
              [
                ["assign", "book-outline", t("fileManager.assign")],
                ["create", "add-circle-outline", t("fileManager.createBook")],
                ["rename", "create-outline", t("fileManager.rename")],
                ["delete", "trash-outline", t("fileManager.delete")],
              ] as const
            ).map(([key, icon, label]) => (
              <Pressable
                key={key}
                accessibilityRole="button"
                style={styles.menuRow}
                onPress={() => actionsFor && runItemAction(key, actionsFor)}
              >
                <Ionicons name={icon} size={19} color={key === "delete" ? c.danger : c.ink} />
                <Text style={[styles.menuText, key === "delete" && { color: c.danger }]}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <BookPickerSheet
        open={Boolean(assigning)}
        title={t("fileManager.assignTitle", { title: assigning?.title || t("fileManager.untitled") })}
        initialQuery={assigning?.title ?? ""}
        onPick={(bookId) => {
          if (!assigning) return;
          const item = assigning;
          const go = () => {
            if (engine.assignInboxItem(item.id, bookId)) {
              hapticSuccess();
              setVersion((v) => v + 1);
            }
          };
          if (player.library[bookId]) {
            setTimeout(
              () =>
                dialog.confirm({
                  title: t("fileManager.replaceTitle"),
                  body: t("fileManager.replaceBody", { title: getBook(bookId)?.title ?? "" }),
                  confirmLabel: t("fileManager.replaceConfirm"),
                  destructive: true,
                  onConfirm: go,
                }),
              400
            );
          } else go();
        }}
        onClose={() => setAssigning(null)}
      />

      <RenameSheet
        item={renaming}
        styles={styles}
        c={c}
        onSave={(title) => renaming && engine.renameInboxItem(renaming.id, title)}
        onClose={() => setRenaming(null)}
      />
    </Screen>
  );
}

function RenameSheet({
  item,
  styles,
  c,
  onSave,
  onClose,
}: {
  item: AudioInboxItem | null;
  styles: ReturnType<typeof createStyles>;
  c: AppColors;
  onSave: (title: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const [forId, setForId] = useState<string | null>(null);
  if (item && item.id !== forId) {
    setForId(item.id);
    setValue(item.title);
  }
  const save = () => {
    if (!value.trim()) return;
    Keyboard.dismiss();
    onSave(value.trim());
    onClose();
  };
  return (
    <Modal visible={Boolean(item)} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.menuOverlay}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("common.cancel")} style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.menu, { padding: spacing.lg }]}>
          <Text style={styles.menuTitle}>{t("fileManager.rename")}</Text>
          <TextInput
            autoFocus
            style={styles.input}
            value={value}
            onChangeText={setValue}
            returnKeyType="done"
            onSubmitEditing={save}
            placeholderTextColor={c.muted}
          />
          <Pressable accessibilityRole="button" style={[styles.importBtn, { marginBottom: 0 }]} onPress={save}>
            <Text style={styles.importText}>{t("common.save")}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    importBtn: {
      alignItems: "center",
      backgroundColor: c.teal,
      borderRadius: radii.md,
      flexDirection: "row",
      gap: spacing.sm,
      justifyContent: "center",
      marginBottom: spacing.lg,
      marginTop: spacing.sm,
      minHeight: 50,
    },
    importText: { color: "#FFFFFF", fontFamily: fonts.body, fontSize: 16, fontWeight: "900" },
    sectionLabel: { color: c.ink, fontFamily: fonts.display, fontSize: 18, fontWeight: "900", marginBottom: spacing.sm, paddingHorizontal: spacing.xs },
    menuOverlay: { backgroundColor: "rgba(0,0,0,0.4)", flex: 1, justifyContent: "flex-end", padding: spacing.md },
    menu: { backgroundColor: c.surface, borderRadius: radii.lg, marginBottom: spacing.xl, overflow: "hidden" },
    menuTitle: { color: c.muted, fontFamily: fonts.body, fontSize: 13, fontWeight: "700", paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xs },
    menuRow: { alignItems: "center", flexDirection: "row", gap: spacing.md, minHeight: 54, paddingHorizontal: spacing.lg },
    menuText: { color: c.ink, fontFamily: fonts.body, fontSize: 16 },
    input: {
      backgroundColor: c.surfaceAlt,
      borderColor: c.border,
      borderRadius: radii.md,
      borderWidth: 1,
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 16,
      marginBottom: spacing.md,
      marginTop: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
    },
  });
}
