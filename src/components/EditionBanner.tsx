import type { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Image, StyleSheet, Text, View } from "react-native";
import { useI18n } from "../i18n/LocalizationContext";
import { APP_ICONS } from "../pro/appIcons";
import { EDITIONS, EditionId } from "../pro/editions";
import { fonts, radii, spacing } from "../theme/theme";

const MOTIFS: Record<EditionId, ComponentProps<typeof Ionicons>["name"]> = {
  classic: "sparkles", halloween: "moon", christmas: "snow", moonlight: "star",
  botanical: "leaf", library: "bookmark", audio: "musical-notes",
  spring: "flower", summer: "sunny", autumn: "leaf", winter: "snow",
  valentines: "heart", walpurgis: "flame", workers: "construct",
};

/** Shared by the appearance preview and the actual Home screen. No animation. */
export function EditionBanner({ edition }: { edition: EditionId }) {
  const { t } = useI18n();
  const palette = EDITIONS[edition];
  const artwork = APP_ICONS.find((icon) => icon.id === (edition === "classic" ? "default" : edition))!;
  return (
    <LinearGradient colors={[palette.background, palette.glow]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.banner}>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.motif}>
        <Ionicons name={MOTIFS[edition]} size={106} color={palette.detail} />
      </View>
      <Image source={artwork.preview} style={styles.artwork} accessible={false} />
      <View style={styles.copy}>
        <Text style={[styles.eyebrow, { color: palette.detail }]}>BOOKLIZ · {t(`appearancePro.editions.${edition}`)}</Text>
        <Text style={styles.title}>{t(`appearancePro.editionMessages.${edition}`)}</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  banner: { borderRadius: radii.lg, overflow: "hidden", flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, marginBottom: spacing.lg },
  artwork: { width: 68, height: 68, borderRadius: 18 },
  copy: { flex: 1, gap: 6 },
  eyebrow: { fontFamily: fonts.body, fontSize: 10, letterSpacing: 1.1 },
  title: { color: "#FFF9EE", fontFamily: fonts.display, fontSize: 20, lineHeight: 27 },
  motif: { position: "absolute", right: -18, bottom: -28, opacity: 0.09, transform: [{ rotate: "-18deg" }] },
});
