import { Image, StyleSheet, View } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { SPLASH_SCENES } from "./splash/themedScenes";

/** The same complete theme artwork on Add Book and Files. */
export function ThemeIllustration() {
  const { edition } = useTheme();
  if (edition === "classic") return null;
  const scene = SPLASH_SCENES[edition];
  const main = scene?.layers.find((layer) => layer.kind === "main" || layer.kind === "art");
  if (!main) return null;

  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.frame}>
      <Image source={main.source} resizeMode="contain" accessible={false} style={styles.image} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: "center", alignSelf: "center", marginVertical: 16, width: "100%" },
  image: { height: 180, maxWidth: 250, width: "100%" },
});
