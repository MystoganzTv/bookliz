import { useMemo } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { AppColors, fonts, radii, spacing } from "../theme/theme";
import { useColors } from "../theme/ThemeContext";

type Props = {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  onConfirm: () => void;
  onCancel?: () => void;
  /** Fires once the native modal is fully gone (iOS `onDismiss`). */
  onDismissed?: () => void;
};

export function BooklizDialog({
  open,
  title,
  body,
  confirmLabel = "Okay",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  onCancel,
  onDismissed,
}: Props) {
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const hasTwoButtons = Boolean(onCancel);

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onCancel ?? onConfirm} onDismiss={onDismissed}>
      <View style={styles.overlay}>
        <Pressable accessibilityRole="button" style={StyleSheet.absoluteFill} onPress={onCancel ?? onConfirm} />
        <View style={styles.card}>
          <View style={styles.handle} />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          {hasTwoButtons ? (
            <View style={styles.buttonRow}>
              <Pressable accessibilityRole="button" style={[styles.button, styles.buttonCancel]} onPress={onCancel}>
                <Text style={[styles.buttonText, styles.buttonCancelText]}>{cancelLabel}</Text>
              </Pressable>
              <Pressable accessibilityRole="button"
                style={[styles.button, styles.buttonConfirm, variant === "destructive" && styles.buttonDestructive]}
                onPress={onConfirm}
              >
                <Text style={[styles.buttonText, variant === "destructive" && styles.buttonDestructiveText]}>
                  {confirmLabel}
                </Text>
              </Pressable>
            </View>
          ) : (
            <Pressable accessibilityRole="button" style={[styles.button, styles.buttonSingle, styles.buttonConfirm]} onPress={onConfirm}>
              <Text style={styles.buttonText}>{confirmLabel}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    overlay: {
      alignItems: "center",
      backgroundColor: c.navy + "99",
      flex: 1,
      justifyContent: "center",
      paddingHorizontal: spacing.lg,
    },
    card: {
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: 30,
      borderWidth: 1,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.lg,
      width: "100%",
    },
    handle: {
      alignSelf: "center",
      backgroundColor: c.border,
      borderRadius: radii.pill,
      height: 4,
      marginBottom: spacing.md,
      width: 42,
    },
    title: {
      color: c.ink,
      fontFamily: fonts.display,
      fontSize: 24,
      fontWeight: "900",
      lineHeight: 30,
    },
    body: {
      color: c.muted,
      fontFamily: fonts.bodyRegular,
      fontSize: 15,
      lineHeight: 23,
      marginTop: spacing.sm,
    },
    buttonRow: {
      flexDirection: "row",
      gap: spacing.sm,
      marginTop: spacing.lg,
    },
    button: {
      alignItems: "center",
      borderRadius: radii.pill,
      flex: 1, // shared width inside the two-button row
      justifyContent: "center",
      paddingVertical: 15,
    },
    buttonSingle: {
      // Standalone button in a column: flex 1 collapses its height and clips
      // the label — neutralize it and add the row's usual top spacing.
      flex: 0,
      marginTop: spacing.lg,
    },
    buttonConfirm: {
      backgroundColor: c.teal, // navy was invisible on dark surfaces
    },
    buttonCancel: {
      backgroundColor: c.surfaceAlt,
      borderColor: c.border,
      borderWidth: 1,
    },
    buttonDestructive: {
      backgroundColor: c.danger + "18",
      borderColor: c.danger + "50",
      borderWidth: 1,
    },
    buttonText: {
      color: "#FFFFFF",
      fontFamily: fonts.body,
      fontSize: 14,
      fontWeight: "900",
    },
    buttonCancelText: {
      color: c.muted,
    },
    buttonDestructiveText: {
      color: c.danger,
    },
  });
}
