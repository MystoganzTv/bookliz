import { useMemo } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { AppColors, fonts, radii, withAlpha } from "../theme/theme";
import { useColors, useTheme } from "../theme/ThemeContext";

type FilterChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
};

export function FilterChip({ label, selected = false, onPress }: FilterChipProps) {
  const c = useColors();
  const { isDark } = useTheme();
  const styles = useMemo(() => createStyles(c, isDark), [c, isDark]);
  return (
    <Pressable accessibilityRole="button" style={[styles.chip, selected && styles.selected]} onPress={onPress}>
      <Text style={[styles.text, selected && styles.selectedText]}>{label}</Text>
    </Pressable>
  );
}

function createStyles(c: AppColors, isDark: boolean) {
  return StyleSheet.create({
    chip: {
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: radii.pill,
      borderWidth: 1,
      marginRight: 8,
      minHeight: 44,
      paddingHorizontal: 14,
      paddingVertical: 9,
      alignItems: "center",
      justifyContent: "center",
    },
    selected: {
      backgroundColor: isDark ? withAlpha(c.teal, 0.16) : c.navy,
      borderColor: isDark ? withAlpha(c.teal, 0.34) : c.navy
    },
    text: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: "800"
    },
    selectedText: {
      color: isDark ? c.ink : c.surface
    }
  });
}
