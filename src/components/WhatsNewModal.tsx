import * as Application from "expo-application";
import Constants from "expo-constants";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { RELEASE_NOTES, ReleaseSection } from "../data/releaseNotes";
import { AppColors, fonts, radii, shadows, spacing } from "../theme/theme";
import { useColors } from "../theme/ThemeContext";

export const WHATS_NEW_KEY = "@bookliz/whatsNewLastVersion";
const STORAGE_KEY = WHATS_NEW_KEY;
const APP_VERSION =
  Application.nativeApplicationVersion ??
  Constants.expoConfig?.version ??
  "1.0.0";

// ─── Section config ───────────────────────────────────────────────────────────

const SECTION_CONFIG = {
  new: {
    emoji: "🆕",
    label: "What's New",
  },
  improved: {
    emoji: "👍",
    label: "Improved",
  },
  fixed: {
    emoji: "🔧",
    label: "Fixed",
  },
} as const;

const booklizIcon = require("../../assets/brand/bookliz-icon.png");

// ─── Component ────────────────────────────────────────────────────────────────

export function WhatsNewModal() {
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const [visible, setVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(600)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Find release notes for the current version
  const entry = RELEASE_NOTES.find((r) => r.version === APP_VERSION);

  useEffect(() => {
    if (!entry) return;
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored !== APP_VERSION) {
          setVisible(true);
        }
      } catch {
        // If AsyncStorage fails, don't show modal
      }
    })();
  }, [entry]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 22,
          stiffness: 280,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, slideAnim, fadeAnim]);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 600,
        duration: 260,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(async () => {
      setVisible(false);
      try {
        await AsyncStorage.setItem(STORAGE_KEY, APP_VERSION);
      } catch {
        // ignore
      }
    });
  };

  if (!visible || !entry) return null;

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={dismiss}>
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        <Pressable accessibilityRole="button" style={StyleSheet.absoluteFill} onPress={dismiss} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          { transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Handle bar */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <Image source={booklizIcon} style={styles.appIcon} />
          <Text style={styles.appName}>
            Book<Text style={styles.appNameAccent}>liz</Text>
          </Text>
          <View style={styles.versionBadge}>
            <Text style={styles.versionText}>v{APP_VERSION}</Text>
          </View>
        </View>

        {/* Content */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {entry.sections.map((section) => (
            <SectionBlock key={section.type} section={section} styles={styles} c={c} />
          ))}
        </ScrollView>

        {/* CTA */}
        <View style={styles.footer}>
          <Pressable accessibilityRole="button" style={styles.ctaButton} onPress={dismiss}>
            <Text style={styles.ctaButtonText}>Got it!</Text>
          </Pressable>
        </View>
      </Animated.View>
    </Modal>
  );
}

// ─── SectionBlock ─────────────────────────────────────────────────────────────

function SectionBlock({
  section,
  styles,
  c,
}: {
  section: ReleaseSection;
  styles: ReturnType<typeof createStyles>;
  c: AppColors;
}) {
  const config = SECTION_CONFIG[section.type];
  // Theme colours, so the notes match whichever theme is on.
  const tone =
    section.type === "new" ? { bg: c.teal, text: "#FFFFFF", badge: "rgba(255,255,255,0.22)" }
    : section.type === "improved" ? { bg: c.gold + "33", text: c.ink, badge: c.gold + "40" }
    : { bg: c.green + "33", text: c.ink, badge: c.green + "40" };
  return (
    <View style={styles.section}>
      {/* Section header */}
      <View style={[styles.sectionHeader, { backgroundColor: tone.bg }]}>
        <Text style={styles.sectionEmoji}>{config.emoji}</Text>
        <Text style={[styles.sectionLabel, { color: tone.text }]}>
          {config.label}
        </Text>
        <View style={[styles.countBadge, { backgroundColor: tone.badge }]}>
          <Text style={[styles.countText, { color: tone.text }]}>
            {section.items.length}
          </Text>
        </View>
      </View>

      {/* Items */}
      <View style={[styles.sectionBody, { backgroundColor: c.surface }]}>
        {section.items.map((item, i) => (
          <View key={i} style={[styles.item, i < section.items.length - 1 && styles.itemBorder]}>
            <View style={styles.bullet} />
            <Text style={styles.itemText}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function createStyles(c: AppColors) {
  return StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.52)",
    },
    sheet: {
      backgroundColor: c.bg,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      bottom: 0,
      left: 0,
      maxHeight: "88%",
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
    header: {
      alignItems: "center",
      paddingBottom: spacing.md,
      paddingTop: spacing.lg,
    },
    appIcon: {
      borderRadius: 22,
      height: 72,
      width: 72,
    },
    appName: {
      color: c.ink,
      fontFamily: fonts.display,
      fontSize: 26,
      fontWeight: "900",
      marginTop: spacing.sm,
    },
    appNameAccent: {
      color: c.tealDark,
    },
    versionBadge: {
      backgroundColor: c.surfaceAlt,
      borderColor: c.border,
      borderRadius: radii.pill,
      borderWidth: 1,
      marginTop: 8,
      paddingHorizontal: 12,
      paddingVertical: 5,
    },
    versionText: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: "800",
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      gap: spacing.md,
      paddingBottom: spacing.lg,
      paddingHorizontal: spacing.md,
    },
    section: {
      borderRadius: radii.lg,
      overflow: "hidden",
    },
    sectionHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      paddingHorizontal: spacing.md,
      paddingVertical: 14,
    },
    sectionEmoji: {
      fontSize: 18,
    },
    sectionLabel: {
      flex: 1,
      fontFamily: fonts.display,
      fontSize: 16,
      fontWeight: "900",
    },
    countBadge: {
      borderRadius: 14,
      height: 26,
      minWidth: 26,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 8,
    },
    countText: {
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: "900",
    },
    sectionBody: {
      borderBottomLeftRadius: radii.lg,
      borderBottomRightRadius: radii.lg,
      paddingHorizontal: spacing.md,
    },
    item: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 12,
      paddingVertical: 13,
    },
    itemBorder: {
      borderBottomColor: c.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    bullet: {
      backgroundColor: c.tealDark,
      borderRadius: 4,
      height: 8,
      marginTop: 6,
      width: 8,
      flexShrink: 0,
    },
    itemText: {
      color: c.ink,
      flex: 1,
      fontFamily: fonts.bodyRegular,
      fontSize: 14,
      lineHeight: 21,
    },
    footer: {
      borderTopColor: c.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      padding: spacing.md,
      paddingBottom: spacing.xl,
    },
    ctaButton: {
      alignItems: "center",
      backgroundColor: c.navy,
      borderRadius: radii.pill,
      paddingVertical: 15,
    },
    ctaButtonText: {
      color: "#FFFFFF",
      fontFamily: fonts.body,
      fontSize: 15,
      fontWeight: "900",
    },
  });
}
