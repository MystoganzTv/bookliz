import { MaterialCommunityIcons } from "@expo/vector-icons";
import { NavigationRouteContext } from "@react-navigation/native";
import { useContext, useMemo, useState } from "react";
import { Image, ImageSourcePropType, LayoutChangeEvent, StyleSheet, View } from "react-native";
import type { ThemedEditionId } from "../theme/atmospheres";
import { hashSeed, scatterMotifs } from "../theme/scatter";
import { useTheme } from "../theme/ThemeContext";

/**
 * Landscapes, one per atmosphere: 1200×520 grey+alpha silhouettes with the
 * ground along the bottom edge, painted with `tintColor`. Only shown on a
 * really empty screen (see LANDSCAPE_MIN_HEIGHT).
 */
export const ATMOSPHERE_SCENES: Record<ThemedEditionId, ImageSourcePropType> = {
  mushroom: require("../../assets/atmospheres/mushroom.png"),
  dragon: require("../../assets/atmospheres/dragon.png"),
  arcane: require("../../assets/atmospheres/arcane.png"),
  moonGarden: require("../../assets/atmospheres/moonGarden.png"),
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
const MAX_SCENE_HEIGHT = 240;
/** The landscape only appears when this much of the screen is empty. */
const LANDSCAPE_MIN_HEIGHT = 440;

type Props = {
  /** Padding of the scroll content to bleed into, so the field reaches the real edges. */
  bleedBottom?: number;
  bleedHorizontal?: number;
};

/**
 * The empty space at the end of a screen, filled with the atmosphere's
 * objects — skulls and ghosts for Halloween, palm trees and watermelon for
 * Summer — scattered at random but stable per screen. It grows into whatever
 * room the content leaves (flexGrow), so nothing is ever drawn behind text:
 * a long screen gets a few objects in its bottom padding, an empty search
 * gets a whole field, and a really empty screen also gets the landscape.
 * Renders nothing under Classic.
 */
export function AtmosphereFill({ bleedBottom = 0, bleedHorizontal = 0 }: Props) {
  const { atmosphere, edition, isDark, colors: c } = useTheme();
  const route = useContext(NavigationRouteContext);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const seed = hashSeed(`${route?.name ?? "screen"}:${edition}`);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((prev) => (Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1 ? prev : { width, height }));
  };

  const showLandscape = size.height >= LANDSCAPE_MIN_HEIGHT;
  const sceneHeight = Math.min(size.width * SCENE_RATIO, MAX_SCENE_HEIGHT);
  const fieldHeight = showLandscape ? size.height - sceneHeight : size.height;
  const sprinkles = useMemo(
    () => (atmosphere ? scatterMotifs(seed, size.width, fieldHeight, atmosphere.motifs.length) : []),
    [atmosphere, seed, size.width, fieldHeight]
  );

  if (!atmosphere || edition === "classic") return null;
  const ink = isDark ? c.teal : c.tealDark;

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={onLayout}
      style={[styles.root, { marginBottom: -bleedBottom, marginHorizontal: -bleedHorizontal, minHeight: bleedBottom }]}
    >
      {sprinkles.map((s, index) => (
        <MaterialCommunityIcons
          key={index}
          name={atmosphere.motifs[s.motif]}
          size={s.size}
          color={s.secondary ? c.coral : ink}
          style={{
            position: "absolute",
            left: s.x,
            top: s.y,
            opacity: (isDark ? 0.13 : 0.1) + s.weight * (isDark ? 0.09 : 0.08),
            transform: [{ rotate: `${s.rotate}deg` }],
          }}
        />
      ))}
      {showLandscape ? (
        <View style={[styles.sceneFrame, { height: sceneHeight }]}>
          <Image
            source={ATMOSPHERE_SCENES[edition]}
            resizeMode="stretch"
            accessible={false}
            style={[styles.scene, { width: size.width, height: size.width * SCENE_RATIO, tintColor: ink, opacity: isDark ? 0.22 : 0.15 }]}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, overflow: "hidden" },
  sceneFrame: { position: "absolute", left: 0, right: 0, bottom: 0, overflow: "hidden" },
  scene: { position: "absolute", left: 0, bottom: 0 },
});
