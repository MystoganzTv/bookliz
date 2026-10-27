import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useBookliz } from "../data/BooklizContext";
import { useI18n } from "../i18n/LocalizationContext";
import { AppColors, fonts, radii, shadows, spacing } from "../theme/theme";
import { useColors } from "../theme/ThemeContext";

export function SeriesCompletionModal() {
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const { seriesJustCompleted, clearSeriesCompletion } = useBookliz();
  const { t } = useI18n();

  const slideAnim = useRef(new Animated.Value(700)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.6)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  const visible = Boolean(seriesJustCompleted);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 20,
          stiffness: 260,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // Trophy bounce
        Animated.sequence([
          Animated.spring(scaleAnim, {
            toValue: 1.15,
            damping: 6,
            stiffness: 300,
            useNativeDriver: true,
          }),
          Animated.spring(scaleAnim, {
            toValue: 1,
            damping: 10,
            stiffness: 200,
            useNativeDriver: true,
          }),
        ]).start();
        // Subtle wiggle on the trophy
        Animated.sequence([
          Animated.timing(rotateAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
          Animated.timing(rotateAnim, { toValue: -1, duration: 120, useNativeDriver: true }),
          Animated.timing(rotateAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
        ]).start();
      });
    } else {
      slideAnim.setValue(700);
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.6);
      rotateAnim.setValue(0);
    }
  }, [visible, slideAnim, fadeAnim, scaleAnim, rotateAnim]);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 700,
        duration: 260,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(() => clearSeriesCompletion());
  };

  if (!visible || !seriesJustCompleted) return null;

  const rotate = rotateAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ["-8deg", "0deg", "8deg"],
  });

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={dismiss}>
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        <Pressable accessibilityRole="button" style={StyleSheet.absoluteFill} onPress={dismiss} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.handle} />

        {/* Trophy area */}
        <View style={styles.heroWrap}>
          <View style={styles.glowRing} />
          <Animated.View style={[styles.trophyCircle, { transform: [{ scale: scaleAnim }, { rotate }] }]}>
            <Ionicons name="trophy" size={52} color={c.gold} />
          </Animated.View>
        </View>

        {/* Title */}
        <Text style={styles.eyebrow}>{t("seriesCompletion.eyebrow")}</Text>
        <Text style={styles.title}>
          {seriesJustCompleted.seriesName}
        </Text>
        <Text style={styles.subtitle}>{t("seriesCompletion.subtitle")}</Text>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statChip}>
            <Ionicons name="checkmark-circle" size={18} color={c.green} />
            <Text style={styles.statLabel}>{t("seriesCompletion.statComplete")}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statChip}>
            <Ionicons name="sparkles" size={18} color={c.gold} />
            <Text style={styles.statLabel}>{t("seriesCompletion.statAchievement")}</Text>
          </View>
        </View>

        {/* Body */}
        <Text style={styles.body}>{t("seriesCompletion.body")}</Text>

        {/* CTA */}
        <View style={styles.footer}>
          <Pressable accessibilityRole="button" style={styles.ctaButton} onPress={dismiss}>
            <Ionicons name="trophy-outline" size={16} color="#FFFFFF" />
            <Text style={styles.ctaText}>{t("seriesCompletion.cta")}</Text>
          </Pressable>
        </View>
      </Animated.View>
    </Modal>
  );
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.58)",
    },
    sheet: {
      alignItems: "center",
      backgroundColor: c.bg,
      borderTopLeftRadius: 32,
      borderTopRightRadius: 32,
      bottom: 0,
      left: 0,
      paddingBottom: spacing.xl,
      paddingHorizontal: spacing.lg,
      position: "absolute",
      right: 0,
      ...shadows.card,
    },
    handle: {
      alignSelf: "center",
      backgroundColor: c.border,
      borderRadius: 3,
      height: 4,
      marginTop: 12,
      width: 40,
    },
    heroWrap: {
      alignItems: "center",
      justifyContent: "center",
      marginTop: spacing.lg,
      marginBottom: spacing.md,
    },
    glowRing: {
      backgroundColor: c.gold + "22",
      borderColor: c.gold + "40",
      borderRadius: 60,
      borderWidth: 2,
      height: 120,
      position: "absolute",
      width: 120,
    },
    trophyCircle: {
      alignItems: "center",
      backgroundColor: c.navy,
      borderRadius: 50,
      height: 100,
      justifyContent: "center",
      width: 100,
    },
    eyebrow: {
      color: c.gold,
      fontFamily: fonts.body,
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 1.5,
      textAlign: "center",
      textTransform: "uppercase",
    },
    title: {
      color: c.ink,
      fontFamily: fonts.display,
      fontSize: 30,
      fontWeight: "900",
      lineHeight: 34,
      marginTop: spacing.xs,
      textAlign: "center",
    },
    subtitle: {
      color: c.tealDark,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: "800",
      marginTop: spacing.xs,
      textAlign: "center",
    },
    statsRow: {
      alignItems: "center",
      backgroundColor: c.surfaceAlt,
      borderColor: c.border,
      borderRadius: radii.md,
      borderWidth: 1,
      flexDirection: "row",
      gap: spacing.md,
      justifyContent: "center",
      marginTop: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
      width: "100%",
    },
    statChip: {
      alignItems: "center",
      flexDirection: "row",
      gap: 6,
    },
    statDivider: {
      backgroundColor: c.border,
      height: 24,
      width: 1,
    },
    statLabel: {
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: "800",
    },
    body: {
      color: c.muted,
      fontFamily: fonts.bodyRegular,
      fontSize: 14,
      lineHeight: 21,
      marginTop: spacing.md,
      textAlign: "center",
    },
    footer: {
      marginTop: spacing.lg,
      width: "100%",
    },
    ctaButton: {
      alignItems: "center",
      backgroundColor: c.navy,
      borderRadius: radii.pill,
      flexDirection: "row",
      gap: 8,
      justifyContent: "center",
      paddingVertical: 16,
    },
    ctaText: {
      color: "#FFFFFF",
      fontFamily: fonts.body,
      fontSize: 15,
      fontWeight: "900",
    },
  });
}
