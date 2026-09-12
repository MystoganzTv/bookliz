import { useState } from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import { useBookliz } from "../../data/BooklizContext";
import { colors, fonts, radii, spacing } from "../../theme/theme";
import { useI18n } from "../../i18n/LocalizationContext";

type Nav = NativeStackNavigationProp<RootStackParamList, "OnboardingGenres">;
type Route = RouteProp<RootStackParamList, "OnboardingGenres">;
const onboardingLogo = require("../../../assets/brand/bookliz-onboarding-glow.png");

const GENRES = [
  { label: "Fantasy",            icon: "🐉" },
  { label: "Science Fiction",    icon: "🚀" },
  { label: "Mystery",            icon: "🔎" },
  { label: "Romance",            icon: "❤️" },
  { label: "Thriller",           icon: "😰" },
  { label: "Historical Fiction", icon: "🏛️" },
  { label: "Non-Fiction",        icon: "📰" },
  { label: "Horror",             icon: "👻" },
  { label: "Literary Fiction",   icon: "🖋️" },
  { label: "Adventure",          icon: "🗺️" },
  { label: "Biography",          icon: "👤" },
  { label: "Comics",             icon: "💥" }
];

function StepDots({ current }: { current: number }) {
  return (
    <View style={dots.row}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={[dots.dot, i === current && dots.dotActive]} />
      ))}
    </View>
  );
}

export function OnboardingGenresScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { completeOnboarding } = useBookliz();
  const { name } = route.params;
  const { t } = useI18n();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const toggle = (genre: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(genre)) next.delete(genre);
      else next.add(genre);
      return next;
    });
  };

  const canFinish = selected.size > 0;

  const handleFinish = async () => {
    if (!canFinish || loading) return;
    setLoading(true);
    await completeOnboarding(name, Array.from(selected));
  };

  return (
    <View style={styles.root}>
      {/* Decorative glows */}
      <View style={styles.glowTR} />
      <View style={styles.glowBL} />

      {/* Fixed header */}
      <View style={styles.header}>
        <View style={styles.topRow}>
          <TouchableOpacity accessibilityRole="button" onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <View style={styles.stepPill}>
            <Text style={styles.stepText}>3 of 3</Text>
          </View>
        </View>

        <View style={styles.logoWrap}>
          <Image source={onboardingLogo} style={styles.logo} resizeMode="contain" />
        </View>

        <Text style={styles.eyebrow}>{t("onboarding.yourTaste")}</Text>
        <Text style={styles.heading}>
          Nice to meet you,{"\n"}
          <Text style={styles.nameHighlight}>{name}.</Text>
        </Text>
        <Text style={styles.sub}>
          Pick the genres you love — we'll shape your library around them.
        </Text>

        {selected.size > 0 && (
          <View style={styles.countRow}>
            <View style={styles.countPill}>
              <Text style={styles.countText}>{selected.size} selected</Text>
            </View>
          </View>
        )}
      </View>

      {/* Genre grid — scrollable */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
      >
        {GENRES.map((g) => {
          const active = selected.has(g.label);
          return (
            <TouchableOpacity accessibilityRole="button"
              key={g.label}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => toggle(g.label)}
              activeOpacity={0.75}
            >
              <Text style={styles.chipIcon}>{g.icon}</Text>
              <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                {g.label}
              </Text>
              {active && (
                <View style={styles.checkDot}>
                  <Text style={styles.checkMark}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
        {/* Bottom padding so last row clears the fixed bottom bar */}
        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Fixed bottom */}
      <View style={styles.bottom}>
        <StepDots current={2} />
        <TouchableOpacity accessibilityRole="button"
          style={[styles.cta, !canFinish && styles.ctaDisabled]}
          onPress={handleFinish}
          activeOpacity={0.85}
          disabled={!canFinish || loading}
        >
          <Text style={[styles.ctaText, !canFinish && styles.ctaTextDisabled]}>
            {loading ? "Setting up your library…" : "Start Reading"}
          </Text>
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
    overflow: "hidden"
  },
  glowTR: {
    backgroundColor: "rgba(255,122,89,0.18)",
    borderRadius: 220,
    height: 260,
    position: "absolute",
    right: -80,
    top: -60,
    width: 260
  },
  glowBL: {
    backgroundColor: "rgba(20,184,166,0.16)",
    borderRadius: 220,
    bottom: -80,
    height: 280,
    left: -90,
    position: "absolute",
    width: 280
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: 60
  },
  topRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.sm
  },
  logoWrap: {
    alignItems: "center",
    marginBottom: spacing.lg
  },
  logo: {
    height: 112,
    width: 168
  },
  backBtn: {
    width: 40
  },
  backArrow: {
    color: "rgba(255,255,255,0.80)",
    fontFamily: fonts.body,
    fontSize: 24,
    fontWeight: "900"
  },
  stepPill: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 5
  },
  stepText: {
    color: "rgba(255,255,255,0.70)",
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.5
  },
  eyebrow: {
    color: colors.coral ?? colors.gold,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.8,
    marginBottom: spacing.xs,
    textTransform: "uppercase"
  },
  heading: {
    color: colors.card,
    fontFamily: fonts.display,
    fontSize: 36,
    fontWeight: "900",
    lineHeight: 42,
    marginBottom: spacing.xs
  },
  nameHighlight: {
    color: colors.gold
  },
  sub: {
    color: "rgba(255,255,255,0.55)",
    fontFamily: fonts.bodyRegular,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.sm
  },
  countRow: {
    flexDirection: "row",
    marginBottom: spacing.xs
  },
  countPill: {
    backgroundColor: "rgba(255,200,87,0.18)",
    borderColor: "rgba(255,200,87,0.35)",
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4
  },
  countText: {
    color: colors.gold,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.5
  },
  scroll: {
    flex: 1,
    marginTop: spacing.sm
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg
  },
  chip: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: radii.md,
    borderWidth: 1.5,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    width: "47%"
  },
  chipActive: {
    backgroundColor: "rgba(20,184,166,0.18)",
    borderColor: colors.teal
  },
  chipIcon: {
    fontSize: 18
  },
  chipLabel: {
    color: "rgba(255,255,255,0.75)",
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: "900"
  },
  chipLabelActive: {
    color: colors.card
  },
  checkDot: {
    alignItems: "center",
    backgroundColor: colors.teal,
    borderRadius: 10,
    height: 20,
    justifyContent: "center",
    width: 20
  },
  checkMark: {
    color: colors.navy,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: "900"
  },
  bottom: {
    backgroundColor: "rgba(15,23,42,0.95)",
    borderTopColor: "rgba(255,255,255,0.08)",
    borderTopWidth: 1,
    paddingBottom: 48,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md
  },
  cta: {
    alignItems: "center",
    backgroundColor: colors.gold,
    borderRadius: radii.pill,
    paddingVertical: 16
  },
  ctaDisabled: {
    backgroundColor: "rgba(255,255,255,0.10)"
  },
  ctaText: {
    color: colors.navy,
    fontFamily: fonts.body,
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: 0.4
  },
  ctaTextDisabled: {
    color: "rgba(255,255,255,0.30)"
  }
});
