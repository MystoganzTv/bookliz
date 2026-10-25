import { LinearGradient } from "expo-linear-gradient";
import { Image, ImageSourcePropType, StyleSheet, useWindowDimensions, View } from "react-native";
import type { ThemedEditionId } from "../theme/atmospheres";
import { useTheme } from "../theme/ThemeContext";
import { withAlpha } from "../theme/theme";

/**
 * Landscapes, one per atmosphere: 1200×520 grey+alpha silhouettes with the
 * ground along the bottom edge. Painted with `tintColor`, so the shape comes
 * from the file and the colour from the atmosphere (light or dark).
 */
export const ATMOSPHERE_SCENES: Record<ThemedEditionId, ImageSourcePropType> = {
  spring: require("../../assets/atmospheres/spring.png"),
  summer: require("../../assets/atmospheres/summer.png"),
  autumn: require("../../assets/atmospheres/autumn.png"),
  winter: require("../../assets/atmospheres/winter.png"),
  valentines: require("../../assets/atmospheres/valentines.png"),
  walpurgis: require("../../assets/atmospheres/walpurgis.png"),
  workers: require("../../assets/atmospheres/workers.png"),
  halloween: require("../../assets/atmospheres/halloween.png"),
  christmas: require("../../assets/atmospheres/christmas.png"),
  moonlight: require("../../assets/atmospheres/moonlight.png"),
  botanical: require("../../assets/atmospheres/botanical.png"),
  library: require("../../assets/atmospheres/library.png"),
  audio: require("../../assets/atmospheres/audio.png"),
};

const SCENE_RATIO = 520 / 1200;
/** On an iPad the full-width landscape would be ~450pt tall; past this the sky is cropped, never the ground. */
const MAX_SCENE_HEIGHT = 300;

/**
 * What an atmosphere draws behind the content of every `<Screen>` (and the
 * few screens that paint their own root): a soft wash of its colour at the
 * top, and its landscape along the bottom, in the free space under short
 * screens, empty searches and empty lists. Fixed — content scrolls over it —
 * static, and hidden from VoiceOver. Classic draws nothing.
 *
 * Kept faint on purpose: text sits on top of it, and the contrast floors in
 * atmospheres.test.ts are measured against `bg`.
 */
export function AtmosphereBackdrop() {
  const { atmosphere, edition, isDark, colors: c } = useTheme();
  const { width } = useWindowDimensions();
  if (!atmosphere || edition === "classic") return null;
  const wash = (isDark ? atmosphere.dark : atmosphere.light).wash;
  const sceneHeight = width * SCENE_RATIO;
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={[withAlpha(wash, isDark ? 0.85 : 0.75), withAlpha(wash, 0)]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.wash}
      />
      <View style={[styles.sceneFrame, { height: Math.min(sceneHeight, MAX_SCENE_HEIGHT) }]}>
        <Image
          source={ATMOSPHERE_SCENES[edition]}
          resizeMode="stretch"
          style={[styles.scene, { width, height: sceneHeight, tintColor: isDark ? c.teal : c.tealDark, opacity: isDark ? 0.24 : 0.17 }]}
          accessible={false}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wash: { position: "absolute", top: 0, left: 0, right: 0, height: 300 },
  sceneFrame: { position: "absolute", left: 0, right: 0, bottom: 0, overflow: "hidden" },
  scene: { position: "absolute", left: 0, bottom: 0 },
});
