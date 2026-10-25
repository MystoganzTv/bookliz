import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { withAlpha } from "../theme/theme";

/**
 * Behind the top of every screen under an atmosphere: a soft wash of its
 * colour, and two of its motifs in the top-right corner (one large and
 * tucked off the edge, one small up by the status bar) — clear of titles. Fixed — content scrolls over it — static,
 * hidden from VoiceOver, and faint enough to sit behind a title. Everything
 * else an atmosphere draws goes in empty space only (`AtmosphereFill`).
 * Classic draws nothing.
 */
export function AtmosphereBackdrop() {
  const { atmosphere, isDark, colors: c } = useTheme();
  if (!atmosphere) return null;
  const wash = (isDark ? atmosphere.dark : atmosphere.light).wash;
  const [hero, second] = atmosphere.motifs;
  const ink = isDark ? c.teal : c.tealDark;
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.root}>
      <LinearGradient
        colors={[withAlpha(wash, isDark ? 0.85 : 0.75), withAlpha(wash, 0)]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <MaterialCommunityIcons name={hero} size={150} color={ink} style={[styles.hero, { opacity: isDark ? 0.1 : 0.07 }]} />
      <MaterialCommunityIcons name={second} size={30} color={c.coral} style={[styles.second, { opacity: isDark ? 0.16 : 0.12 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: "absolute", top: 0, left: 0, right: 0, height: 300, overflow: "hidden" },
  hero: { position: "absolute", right: -34, top: 18, transform: [{ rotate: "-14deg" }] },
  second: { position: "absolute", right: 132, top: 64, transform: [{ rotate: "12deg" }] },
});
