/** Bottom sheet used by the audiobook player for chapters, speed, sleep timer and "more". */
import { Ionicons } from "@expo/vector-icons";
import { createContext, PropsWithChildren, useContext, useMemo } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppColors, fonts, radii, spacing } from "../theme/theme";
import { useColors } from "../theme/ThemeContext";

/** Lets a screen with its own palette (the player is always dark) dress its sheets to match. */
const SheetColors = createContext<AppColors | null>(null);

export function PlayerSheet({
  open,
  title,
  onClose,
  colors,
  children,
}: PropsWithChildren<{ open: boolean; title?: string; onClose: () => void; colors?: AppColors }>) {
  const themed = useColors();
  const c = colors ?? themed;
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(c), [c]);
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          {title ? <Text style={styles.title}>{title}</Text> : null}
          <ScrollView bounces={false} style={styles.scroll}>
            <SheetColors.Provider value={c}>{children}</SheetColors.Provider>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function SheetRow({
  label,
  detail,
  icon,
  selected,
  destructive,
  disabled,
  onPress,
}: {
  label: string;
  detail?: string;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  selected?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const themed = useColors();
  const c = useContext(SheetColors) ?? themed;
  const styles = useMemo(() => createStyles(c), [c]);
  const color = destructive ? c.danger : selected ? c.tealDark : c.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected), disabled: Boolean(disabled) }}
      disabled={disabled}
      style={({ pressed }) => [styles.row, selected && styles.rowSelected, disabled && { opacity: 0.4 }, pressed && { opacity: 0.6 }]}
      onPress={onPress}
    >
      {icon ? <Ionicons name={icon} size={20} color={color} /> : null}
      <Text style={[styles.rowLabel, { color }]} numberOfLines={2}>
        {label}
      </Text>
      {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      {selected ? <Ionicons name="checkmark" size={18} color={c.tealDark} /> : null}
    </Pressable>
  );
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    overlay: { backgroundColor: "rgba(0,0,0,0.45)", flex: 1, justifyContent: "flex-end" },
    sheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      maxHeight: "80%",
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
    },
    handle: { alignSelf: "center", backgroundColor: c.border, borderRadius: 3, height: 5, marginBottom: spacing.sm, width: 40 },
    title: { color: c.ink, fontFamily: fonts.display, fontSize: 18, fontWeight: "800", marginBottom: spacing.sm, paddingHorizontal: 4 },
    scroll: { flexGrow: 0 },
    row: {
      alignItems: "center",
      borderRadius: radii.sm,
      flexDirection: "row",
      gap: spacing.sm,
      minHeight: 48,
      paddingHorizontal: spacing.sm,
      paddingVertical: 10,
    },
    rowSelected: { backgroundColor: c.teal + "1A" },
    rowLabel: { flex: 1, fontFamily: fonts.body, fontSize: 15, fontWeight: "800" },
    rowDetail: { color: c.muted, fontFamily: fonts.body, fontSize: 13, fontVariant: ["tabular-nums"], fontWeight: "700" },
  });
}
