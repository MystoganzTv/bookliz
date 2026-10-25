import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { withAlpha } from "../theme/theme";

/**
 * The top of every screen under an atmosphere: a soft wash of the edition's
 * colour fading into the background, and its three motifs drawn very faintly
 * (a large one tucked into the top-right corner, two small ones). Fixed — the
 * content scrolls over it — static, and invisible to VoiceOver. Classic draws
 * nothing, so the stock look is pixel-for-pixel what it was.
 *
 * Opacities are low on purpose: text sits on top of this on every screen,
 * and the contrast floors in atmospheres.test.ts are measured against `bg`.
 */
export function AtmosphereBackdrop() {
  const { atmosphere, isDark, colors: c } = useTheme();
  if (!atmosphere) return null;
  const wash = (isDark ? atmosphere.dark : atmosphere.light).wash;
  const [hero, second, third] = atmosphere.motifs;
  const ink = isDark ? c.ink : c.tealDark;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.root}
    >
      <LinearGradient
        colors={[withAlpha(wash, isDark ? 0.85 : 0.75), withAlpha(wash, 0)]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Ionicons name={hero} size={150} color={ink} style={[styles.hero, { opacity: isDark ? 0.07 : 0.06 }]} />
      <Ionicons name={second} size={34} color={ink} style={[styles.second, { opacity: isDark ? 0.1 : 0.08 }]} />
      <Ionicons name={third} size={22} color={ink} style={[styles.third, { opacity: isDark ? 0.12 : 0.1 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: "absolute", top: 0, left: 0, right: 0, height: 300, overflow: "hidden" },
  hero: { position: "absolute", right: -34, top: 18, transform: [{ rotate: "-14deg" }] },
  second: { position: "absolute", right: 128, top: 74, transform: [{ rotate: "12deg" }] },
  third: { position: "absolute", right: 96, top: 168, transform: [{ rotate: "-8deg" }] },
});
