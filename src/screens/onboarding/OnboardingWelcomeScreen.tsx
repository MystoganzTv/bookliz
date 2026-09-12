import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import { colors, fonts, radii, spacing } from "../../theme/theme";
import { useI18n } from "../../i18n/LocalizationContext";

const booklizLogo = require("../../../assets/brand/bookliz-onboarding-glow.png");

const BULLETS = [
  { emoji: "📚", text: "Track every book you own or read" },
  { emoji: "⏱️", text: "Log reading sessions with mood & place" },
  { emoji: "🏆", text: "Unlock achievements as you grow" }
];

type Nav = NativeStackNavigationProp<RootStackParamList, "OnboardingWelcome">;

function StepDots({ current }: { current: number }) {
  return (
    <View style={dots.row}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={[dots.dot, i === current && dots.dotActive]} />
      ))}
    </View>
  );
}

export function OnboardingWelcomeScreen() {
  const navigation = useNavigation<Nav>();
  const { t } = useI18n();

  return (
    <View style={styles.root}>
      {/* Decorative glows — inverted corners */}
      <View style={styles.glowTR} />
      <View style={styles.glowBL} />

      {/* Logo inverted — white silhouette on navy */}
      <View style={styles.logoWrap}>
        <Image source={booklizLogo} style={styles.logo} resizeMode="contain" />
      </View>

      {/* Copy */}
      <Text style={styles.tagline}>Your reading life,{"\n"}beautifully kept.</Text>
      <Text style={styles.sub}>
        Books, sessions, moods, places, and milestones kept together in one warm, personal library.
      </Text>

      {/* Bullet list */}
      <View style={styles.bullets}>
        {BULLETS.map((b) => (
          <View key={b.text} style={styles.bulletRow}>
            <Text style={styles.bulletEmoji}>{b.emoji}</Text>
            <Text style={styles.bulletText}>{b.text}</Text>
          </View>
        ))}
      </View>

      {/* Bottom */}
      <View style={styles.bottom}>
        <StepDots current={0} />
        <TouchableOpacity accessibilityRole="button"
          style={styles.cta}
          onPress={() => navigation.navigate("OnboardingName")}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaText}>{t("onboarding.getStarted")}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const dots = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    marginBottom: spacing.md
  },
  dot: {
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: radii.pill,
    height: 7,
    width: 7
  },
  dotActive: {
    backgroundColor: colors.gold,
    width: 20
  }
});

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.navy,
    flex: 1,
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: spacing.lg,
    paddingTop: 60,
    paddingBottom: 48
  },
  glowTR: {
    backgroundColor: "rgba(20,184,166,0.22)",
    borderRadius: 220,
    height: 280,
    position: "absolute",
    right: -90,
    top: -70,
    width: 280
  },
  glowBL: {
    backgroundColor: "rgba(255,122,89,0.18)",
    borderRadius: 220,
    bottom: -70,
    height: 280,
    left: -90,
    position: "absolute",
    width: 280
  },
  logoWrap: {
    alignItems: "center",
    marginBottom: spacing.lg
  },
  logo: {
    height: 156,
    width: 234
  },
  tagline: {
    color: colors.card,
    fontFamily: fonts.display,
    fontSize: 42,
    fontWeight: "900",
    lineHeight: 48,
    textAlign: "center"
  },
  sub: {
    color: "#C8C2B8",
    fontFamily: fonts.bodyRegular,
    fontSize: 16,
    lineHeight: 24,
    marginTop: spacing.sm,
    textAlign: "center"
  },
  bullets: {
    gap: spacing.sm,
    marginTop: spacing.xl
  },
  bulletRow: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  bulletEmoji: {
    fontSize: 22
  },
  bulletText: {
    color: "#E8E2D9",
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: "800",
    flex: 1
  },
  bottom: {
    marginTop: "auto",
    paddingTop: spacing.xl
  },
  cta: {
    alignItems: "center",
    backgroundColor: colors.gold,
    borderRadius: radii.pill,
    paddingVertical: 16
  },
  ctaText: {
    color: colors.navy,
    fontFamily: fonts.body,
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: 0.4
  }
});
