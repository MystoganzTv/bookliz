import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useI18n } from "../i18n/LocalizationContext";
import { AppColors, fonts, radii, spacing } from "../theme/theme";
import { useColors } from "../theme/ThemeContext";

const EMOJI_PICKS = ["📚", "📁", "⭐", "🌙", "🔥", "💎", "🧠", "🌿", "🎯", "✨", "🗺️", "❤️"];

type Props = {
  open: boolean;
  initialName?: string;
  initialEmoji?: string;
  mode?: "create" | "rename";
  onSave: (name: string, emoji: string) => void;
  /** Shown only in rename mode — lets the user delete the list. */
  onDelete?: () => void;
  onClose: () => void;
  /** Same sheet for library folders: only the wording changes. */
  kind?: "list" | "folder";
};

export function CreateListSheet({ open, initialName = "", initialEmoji = "📚", mode = "create", onSave, onDelete, onClose, kind = "list" }: Props) {
  const { t } = useI18n();
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const [name, setName] = useState(initialName);
  const [emoji, setEmoji] = useState(initialEmoji);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setEmoji(initialEmoji || "📚");
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, initialName, initialEmoji]);

  const canSave = name.trim().length > 0;

  // Always dismiss keyboard before closing — prevents iOS ScrollView freeze
  const handleClose = () => { Keyboard.dismiss(); onClose(); };
  const handleSave  = () => { if (!canSave) return; Keyboard.dismiss(); onSave(name.trim(), emoji); onClose(); };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.overlay}>
        <Pressable accessibilityRole="button" style={StyleSheet.absoluteFill} onPress={handleClose} />

        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>
            {kind === "folder"
              ? mode === "rename" ? t("folders.renameTitle") : t("folders.createTitle")
              : mode === "rename" ? t("lists.renameTitle") : t("lists.createTitle")}
          </Text>

          {/* Emoji picker */}
          <View style={styles.emojiRow}>
            {EMOJI_PICKS.map((e) => (
              <Pressable accessibilityRole="button"
                key={e}
                style={[styles.emojiChip, emoji === e && styles.emojiChipActive]}
                onPress={() => setEmoji(e)}
              >
                <Text style={styles.emojiText}>{e}</Text>
              </Pressable>
            ))}
          </View>

          {/* Name input */}
          <View style={styles.inputWrap}>
            <Text style={styles.selectedEmoji}>{emoji}</Text>
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder={kind === "folder" ? t("folders.namePlaceholder") : t("listSheet.listName")}
              placeholderTextColor={c.muted}
              value={name}
              onChangeText={setName}
              maxLength={40}
              returnKeyType="done"
              onSubmitEditing={handleSave}
            />
          </View>

          <Pressable accessibilityRole="button"
            style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!canSave}
          >
            <Text style={styles.saveBtnText}>{mode === "rename" ? t("lists.renameBtn") : t("lists.createBtn")}</Text>
          </Pressable>

          {mode === "rename" && onDelete ? (
            <Pressable accessibilityRole="button"
              style={styles.deleteBtn}
              onPress={() => { Keyboard.dismiss(); onDelete(); }}
            >
              <Ionicons name="trash-outline" size={15} color="#D95D47" />
              <Text style={styles.deleteText}>{kind === "folder" ? t("folders.delete") : t("lists.deleteBtn")}</Text>
            </Pressable>
          ) : null}

          <Pressable accessibilityRole="button" style={styles.cancelBtn} onPress={handleClose}>
            <Text style={styles.cancelText}>{t("common.cancel")}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
  overlay: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
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
  title: {
    color: c.ink,
    fontFamily: fonts.display,
    fontSize: 22,
    fontWeight: "900",
    marginBottom: spacing.md
  },
  emojiRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: spacing.md
  },
  emojiChip: {
    alignItems: "center",
    backgroundColor: c.surfaceAlt,
    borderColor: c.border,
    borderRadius: radii.md,
    borderWidth: 2,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  emojiChipActive: {
    borderColor: c.teal,
    backgroundColor: c.teal + "18"
  },
  emojiText: {
    fontSize: 22
  },
  inputWrap: {
    alignItems: "center",
    backgroundColor: c.surfaceAlt,
    borderColor: c.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14
  },
  selectedEmoji: {
    fontSize: 22
  },
  input: {
    color: c.ink,
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 16,
    fontWeight: "800"
  },
  saveBtn: {
    alignItems: "center",
    backgroundColor: c.teal,
    borderRadius: radii.pill,
    paddingVertical: 15
  },
  saveBtnDisabled: {
    opacity: 0.4
  },
  saveBtnText: {
    color: "#FFFFFF",
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: "900"
  },
  deleteBtn: {
    alignItems: "center",
    borderColor: "rgba(217,93,71,0.45)",
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    marginTop: spacing.sm,
    paddingVertical: 12
  },
  deleteText: {
    color: "#D95D47",
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: "900"
  },
  cancelBtn: {
    alignItems: "center",
    marginTop: spacing.sm,
    paddingVertical: 10
  },
  cancelText: {
    color: c.muted,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: "900"
  }
});
}
