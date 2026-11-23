import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AppColors, fonts, radii, spacing } from "../theme/theme";
import { useColors } from "../theme/ThemeContext";

type BarChartProps = {
  data: { label: string; value: number }[];
  max?: number;
};

export function BarChart({ data, max }: BarChartProps) {
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const peak = max ?? Math.max(1, ...data.map((item) => item.value));

  return (
    <View style={styles.wrap}>
      {/* Position is the identity: two rows can share a label and a value
          (two weeks at the same pace), which made label-value keys collide. */}
      {data.map((item, index) => (
        <View key={`${index}-${item.label}`} style={styles.row}>
          <Text numberOfLines={1} style={styles.label}>
            {item.label}
          </Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.max(8, (item.value / peak) * 100)}%` }]} />
          </View>
          <Text style={styles.value}>{item.value}</Text>
        </View>
      ))}
    </View>
  );
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    wrap: {
      gap: spacing.sm
    },
    row: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm
    },
    label: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 12,
      fontWeight: "800",
      width: 74
    },
    track: {
      backgroundColor: c.border,
      borderRadius: radii.pill,
      flex: 1,
      height: 10,
      overflow: "hidden"
    },
    fill: {
      backgroundColor: c.gold,
      borderRadius: radii.pill,
      height: "100%"
    },
    value: {
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 12,
      fontWeight: "900",
      textAlign: "right",
      width: 34
    }
  });
}
