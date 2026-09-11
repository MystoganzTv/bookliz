/**
 * FloatingTimer
 *
 * Persistent bar rendered above the tab bar whenever a reading
 * timer is active. Tapping "Stop" navigates to AddReadingSession
 * with the elapsed minutes pre-filled via route params.
 *
 * Rendered once in AppNavigator so it survives tab changes.
 */
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatElapsed, useReadingTimer } from "../data/ReadingTimerContext";
import { RootStackParamList } from "../navigation/types";
import { AppColors, fonts, spacing } from "../theme/theme";
import { useColors } from "../theme/ThemeContext";
import { useI18n } from "../i18n/LocalizationContext";

export function FloatingTimer() {
  const { t } = useI18n();
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const { isRunning, bookId, elapsedMs, stop, reset } = useReadingTimer();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  if (!isRunning || !bookId) return null;

  const handleStop = () => {
    const minutes = stop();
    // Navigate to AddReadingSession with pre-filled minutes
    navigation.navigate("AddReadingSession", {
      bookId,
      prefillMinutes: minutes,
    });
  };

  const handleDiscard = () => reset();

  return (
    <View style={[styles.bar, { bottom: 88 + insets.bottom }]}>
      {/* Left: book icon + timer */}
      <View style={styles.left}>
        <View style={styles.pulse}>
          <Ionicons name="book" size={14} color="#fff" />
        </View>
        <Text style={styles.elapsed}>{formatElapsed(elapsedMs)}</Text>
        <Text style={styles.label}>Reading…</Text>
      </View>

      {/* Right: discard + stop */}
      <View style={styles.actions}>
        <Pressable
          style={styles.discardBtn}
          onPress={handleDiscard}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t("a11y.discardTimer")}
        >
          <Ionicons name="close" size={16} color="rgba(255,255,255,0.6)" />
        </Pressable>
        <Pressable accessibilityRole="button" style={styles.stopBtn} onPress={handleStop}>
          <Ionicons name="stop" size={13} color={c.navy} />
          <Text style={styles.stopText}>Stop</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    bar: {
      alignItems: "center",
      backgroundColor: c.navy,
      borderRadius: 14,
      bottom: 88,
      elevation: 12,
      flexDirection: "row",
      justifyContent: "space-between",
      left: spacing.md,
      paddingHorizontal: 14,
      paddingVertical: 10,
      position: "absolute",
      right: spacing.md,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 12,
      zIndex: 999,
    },
    left: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
    },
    pulse: {
      alignItems: "center",
      backgroundColor: c.teal,
      borderRadius: 14,
      height: 28,
      justifyContent: "center",
      width: 28,
    },
    elapsed: {
      color: "#fff",
      fontFamily: fonts.display,
      fontSize: 18,
      fontWeight: "900",
      letterSpacing: 1,
    },
    label: {
      color: "rgba(255,255,255,0.55)",
      fontFamily: fonts.body,
      fontSize: 12,
      fontWeight: "700",
    },
    actions: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
    },
    discardBtn: {
      alignItems: "center",
      height: 32,
      justifyContent: "center",
      width: 32,
    },
    stopBtn: {
      alignItems: "center",
      backgroundColor: c.gold,
      borderRadius: 20,
      flexDirection: "row",
      gap: 5,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    stopText: {
      color: c.navy,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: "900",
    },
  });
}
