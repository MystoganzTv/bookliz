import { useRef, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import { colors, fonts, radii, spacing } from "../../theme/theme";
import { useI18n } from "../../i18n/LocalizationContext";

type Nav = NativeStackNavigationProp<RootStackParamList, "OnboardingName">;
const onboardingLogo = require("../../../assets/brand/bookliz-onboarding-glow.png");

function StepDots({ current }: { current: number }) {
  return (
    <View style={dots.row}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={[dots.dot, i === current && dots.dotActive]} />
      ))}
    </View>
  );
}

export function OnboardingNameScreen() {
  const navigation = useNavigation<Nav>();
  const [name, setName] = useState("");
  const inputRef = useRef<TextInput>(null);
  const { t } = useI18n();

  const canContinue = name.trim().length > 0;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Decorative glows — mirrored vs Welcome */}
      <View style={styles.glowTL} />
      <View style={styles.glowBR} />

      <View style={styles.inner}>
        {/* Back + step */}
        <View style={styles.topRow}>
          <TouchableOpacity accessibilityRole="button" onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <View style={styles.stepPill}>
            <Text style={styles.stepText}>2 of 3</Text>
          </View>
        </View>

        <View style={styles.logoWrap}>
          <Image source={onboardingLogo} style={styles.logo} resizeMode="contain" />
        </View>

        {/* Eyebrow */}
        <Text style={styles.eyebrow}>{t("onboarding.yourIdentity")}</Text>

        {/* Heading */}
        <Text style={styles.heading}>What should{"\n"}we call you?</Text>
        <Text style={styles.sub}>
          This name will appear across your reading profile and achievements.
        </Text>

        {/* Input */}
        <View style={styles.inputWrap}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={t("onboarding.namePlaceholder")}
            placeholderTextColor="rgba(255,255,255,0.30)"
            autoCapitalize="words"
            autoFocus
            returnKeyType="done"
            selectionColor={colors.gold}
            onSubmitEditing={() => {
              if (canContinue) navigation.navigate("OnboardingGenres", { name: name.trim() });
            }}
          />
          {name.trim().length > 0 && (
            <View style={styles.inputGlow} pointerEvents="none" />
          )}
        </View>

        {/* Preview badge */}
        {name.trim().length > 0 && (
          <View style={styles.previewRow}>
            <View style={styles.avatarBadge}>
              <Text style={styles.avatarInitials}>
                {name.trim().charAt(0).toUpperCase()}
              </Text>
            </View>
            <View>
              <Text style={styles.previewName}>{name.trim()}</Text>
              <Text style={styles.previewMeta}>{t("onboarding.readerBadge")}</Text>
            </View>
          </View>
        )}

        {/* Bottom */}
        <View style={styles.bottom}>
          <StepDots current={1} />
          <TouchableOpacity accessibilityRole="button"
            style={[styles.cta, !canContinue && styles.ctaDisabled]}
            onPress={() => {
              if (canContinue) navigation.navigate("OnboardingGenres", { name: name.trim() });
            }}
            activeOpacity={0.85}
            disabled={!canContinue}
          >
            <Text style={[styles.ctaText, !canContinue && styles.ctaTextDisabled]}>
              Continue
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
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
  glowTL: {
    backgroundColor: "rgba(20,184,166,0.20)",
    borderRadius: 220,
    height: 280,
    left: -90,
    position: "absolute",
    top: -70,
    width: 280
  },
  glowBR: {
    backgroundColor: "rgba(255,200,87,0.14)",
    borderRadius: 220,
    bottom: -80,
    height: 260,
    position: "absolute",
    right: -80,
    width: 260
  },
  inner: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: 60,
    paddingBottom: 48
  },
  topRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.md
  },
  logoWrap: {
    alignItems: "center",
    marginBottom: spacing.lg
  },
  logo: {
    height: 118,
    width: 176
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
    color: colors.gold,
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
    fontSize: 40,
    fontWeight: "900",
    lineHeight: 46,
    marginBottom: spacing.sm
  },
  sub: {
    color: "rgba(255,255,255,0.55)",
    fontFamily: fonts.bodyRegular,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing.xl
  },
  inputWrap: {
    position: "relative"
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: radii.md,
    borderWidth: 1.5,
    color: colors.card,
    fontFamily: fonts.display,
    fontSize: 28,
    fontWeight: "900",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md
  },
  inputGlow: {
    borderColor: colors.gold,
    borderRadius: radii.md,
    borderWidth: 1.5,
    bottom: 0,
    left: 0,
    opacity: 0.6,
    position: "absolute",
    right: 0,
    top: 0
  },
  previewRow: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  avatarBadge: {
    alignItems: "center",
    backgroundColor: colors.gold,
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  avatarInitials: {
    color: colors.navy,
    fontFamily: fonts.display,
    fontSize: 20,
    fontWeight: "900"
  },
  previewName: {
    color: colors.card,
    fontFamily: fonts.body,
    fontSize: 16,
    fontWeight: "900"
  },
  previewMeta: {
    color: "rgba(255,255,255,0.45)",
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    marginTop: 2
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
  ctaDisabled: {
    backgroundColor: "rgba(255,255,255,0.12)"
  },
  ctaText: {
    color: colors.navy,
    fontFamily: fonts.body,
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: 0.4
  },
  ctaTextDisabled: {
    color: "rgba(255,255,255,0.35)"
  }
});
