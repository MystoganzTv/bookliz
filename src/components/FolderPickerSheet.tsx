/**
 * "Move to folder" — the whole folder tree as one indented list, plus the way
 * out ("No folder" / "Top level") and an inline "New folder". One Modal with
 * an inline create view: a second Modal opening over the first freezes on iOS.
 */
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { AppTextInput } from "./AppTextInput";
import { childFolders } from "../data/bookFolders";
import { useBookliz } from "../data/BooklizContext";
import { useI18n } from "../i18n/LocalizationContext";
import { AppColors, fonts, radii, spacing } from "../theme/theme";
import { useColors } from "../theme/ThemeContext";
import type { BookFolder } from "../types/models";

type Props = {
  open: boolean;
  title: string;
  /** Where the thing being moved is now (checked). null = no folder / top level. */
  currentId: string | null;
  /** Label for the null choice: "No folder" for a book, "Top level" for a folder. */
  noneLabel: string;
  /** Folders that cannot be chosen (moving a folder: itself and its descendants). */
  disabledIds?: ReadonlySet<string>;
  onPick: (folderId: string | null) => void;
  onClose: () => void;
};

type Row = { folder: BookFolder; depth: number };

function flattenTree(folders: readonly BookFolder[]): Row[] {
  const out: Row[] = [];
  const seen = new Set<string>();
  const walk = (parentId: string | null, depth: number) => {
    for (const folder of childFolders(folders, parentId)) {
      if (seen.has(folder.id)) continue;
      seen.add(folder.id);
      out.push({ folder, depth });
      walk(folder.id, depth + 1);
    }
  };
  walk(null, 0);
  // Orphans (parent deleted on another device before the merge caught up) still show, at the top level.
  for (const folder of folders) if (!seen.has(folder.id)) out.push({ folder, depth: 0 });
  return out;
}

export function FolderPickerSheet({ open, title, currentId, noneLabel, disabledIds, onPick, onClose }: Props) {
  const { t } = useI18n();
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const { bookFolders, createFolder } = useBookliz();
  const [view, setView] = useState<"pick" | "create">("pick");
  const [name, setName] = useState("");
  const inputRef = useRef<TextInput>(null);
  const rows = useMemo(() => flattenTree(bookFolders), [bookFolders]);

  useEffect(() => {
    if (open) {
      setView("pick");
      setName("");
    }
  }, [open]);

  useEffect(() => {
    if (view === "create") setTimeout(() => inputRef.current?.focus(), 80);
  }, [view]);

  const close = () => {
    Keyboard.dismiss();
    onClose();
  };

  const pick = (folderId: string | null) => {
    Keyboard.dismiss();
    onPick(folderId);
    onClose();
  };

  const create = () => {
    if (!name.trim()) return;
    const folder = createFolder(name.trim(), null, "📁");
    pick(folder.id);
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("common.cancel")} style={StyleSheet.absoluteFill} onPress={close} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          {view === "pick" ? (
            <>
              <Text style={styles.title}>{title}</Text>
              <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
                <PickRow
                  styles={styles}
                  c={c}
                  icon="remove-circle-outline"
                  label={noneLabel}
                  depth={0}
                  checked={currentId === null}
                  onPress={() => pick(null)}
                />
                {rows.map(({ folder, depth }) => (
                  <PickRow
                    key={folder.id}
                    styles={styles}
                    c={c}
                    emoji={folder.emoji ?? "📁"}
                    label={folder.name}
                    depth={depth}
                    checked={currentId === folder.id}
                    disabled={disabledIds?.has(folder.id)}
                    onPress={() => pick(folder.id)}
                  />
                ))}
              </ScrollView>
              <Pressable accessibilityRole="button" style={styles.newRow} onPress={() => setView("create")}>
                <View style={styles.newIcon}>
                  <Ionicons name="add" size={18} color={c.teal} />
                </View>
                <Text style={styles.newText}>{t("folders.new")}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" style={styles.cancelBtn} onPress={close}>
                <Text style={styles.cancelText}>{t("common.cancel")}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.title}>{t("folders.createTitle")}</Text>
              <AppTextInput
                ref={inputRef}
                style={styles.input}
                placeholder={t("folders.namePlaceholder")}
                placeholderTextColor={c.muted}
                value={name}
                onChangeText={setName}
                maxLength={40}
                returnKeyType="done"
                onSubmitEditing={create}
              />
              <Pressable
                accessibilityRole="button"
                style={[styles.saveBtn, !name.trim() && styles.saveBtnDisabled]}
                disabled={!name.trim()}
                onPress={create}
              >
                <Text style={styles.saveText}>{t("folders.createAndMove")}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" style={styles.cancelBtn} onPress={() => { Keyboard.dismiss(); setView("pick"); }}>
                <Text style={styles.cancelText}>{t("common.cancel")}</Text>
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function PickRow({
  styles,
  c,
  icon,
  emoji,
  label,
  depth,
  checked,
  disabled,
  onPress,
}: {
  styles: ReturnType<typeof createStyles>;
  c: AppColors;
  icon?: keyof typeof Ionicons.glyphMap;
  emoji?: string;
  label: string;
  depth: number;
  checked: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: checked, disabled }}
      disabled={disabled}
      style={[styles.row, { paddingLeft: spacing.sm + depth * 18 }, disabled && styles.rowDisabled]}
      onPress={onPress}
    >
      {emoji ? <Text style={styles.emoji}>{emoji}</Text> : <Ionicons name={icon ?? "folder-outline"} size={20} color={c.muted} />}
      <Text style={styles.rowText} numberOfLines={1}>{label}</Text>
      {checked ? <Ionicons name="checkmark" size={18} color={c.tealDark} /> : null}
    </Pressable>
  );
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    overlay: { alignItems: "center", backgroundColor: "rgba(0,0,0,0.55)", flex: 1, justifyContent: "flex-end" },
    sheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: "80%",
      paddingBottom: 40,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      width: "100%",
    },
    handle: { alignSelf: "center", backgroundColor: c.border, borderRadius: radii.pill, height: 4, marginBottom: spacing.lg, width: 40 },
    title: { color: c.ink, fontFamily: fonts.display, fontSize: 22, fontWeight: "900", marginBottom: spacing.md },
    scroll: { maxHeight: 360 },
    row: {
      alignItems: "center",
      borderBottomColor: c.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: spacing.sm,
      minHeight: 48,
      paddingRight: spacing.sm,
    },
    rowDisabled: { opacity: 0.35 },
    emoji: { fontSize: 18, width: 22, textAlign: "center" },
    rowText: { color: c.ink, flex: 1, fontFamily: fonts.body, fontSize: 15 },
    newRow: { alignItems: "center", flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, minHeight: 44 },
    newIcon: { alignItems: "center", backgroundColor: c.teal + "18", borderRadius: radii.pill, height: 30, justifyContent: "center", width: 30 },
    newText: { color: c.tealDark, fontFamily: fonts.body, fontSize: 15, fontWeight: "800" },
    input: {
      backgroundColor: c.surfaceAlt,
      borderColor: c.border,
      borderRadius: radii.md,
      borderWidth: 1,
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 16,
      marginBottom: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
    },
    saveBtn: { alignItems: "center", backgroundColor: c.teal, borderRadius: radii.md, paddingVertical: 14 },
    saveBtnDisabled: { opacity: 0.4 },
    saveText: { color: "#FFFFFF", fontFamily: fonts.body, fontSize: 15, fontWeight: "900" },
    cancelBtn: { alignItems: "center", marginTop: spacing.sm, paddingVertical: 12 },
    cancelText: { color: c.muted, fontFamily: fonts.body, fontSize: 14, fontWeight: "700" },
  });
}
