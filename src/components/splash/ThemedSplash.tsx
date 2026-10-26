/**
 * The loading screen for a theme other than Classic: the theme's own icon,
 * standing up like a pop-up page.
 *
 *   1. the screen warms from the launch navy into the icon's background,
 *      halo rings ripple out,
 *   2. the whole picture — book and all, never cut apart — rises and stands
 *      up from its base, settling with a small overshoot; the chime starts,
 *      and a soft glow comes up behind it,
 *   3. the separate pieces (an acorn, a butterfly) glide in from outside,
 *      the small ones (stars, petals, snowflakes, bats) pop one after another,
 *      nearest first, then twinkle,
 *   4. "bookliz" and the theme's own line settle underneath.
 *
 * While the library loads, the picture floats a little, the glow breathes and
 * the pieces sway. The layers come from the 1024px theme icon
 * (themedScenes.ts), so the finished frame is the icon itself. Native driver
 * throughout; a minimum time so a fast launch never cuts the entrance;
 * Reduce Motion shows the finished scene and fades.
 */
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, useWindowDimensions, View } from "react-native";
import { playOpeningSound } from "../../audio/splashSound";
import { useI18n } from "../../i18n/LocalizationContext";
import { ATMOSPHERES, ThemedEditionId } from "../../theme/atmospheres";
import { SplashLayer, SplashScene } from "./themedScenes";

const NAVY = "#0F172A";
const MIN_MS = 2800;
const MIN_MS_REDUCED = 500;
/** The chime starts as the picture is nearly upright. */
const CHIME_MS = 450;
const GLOW = require("../../../assets/splash/glow.png");
const native = true;
const ease = Easing.out(Easing.cubic);

/** Blend a #RRGGBB toward white (amount > 0) or black (amount < 0). */
function shade(hex: string, amount: number) {
  const n = hex.replace("#", "");
  const to = amount > 0 ? 255 : 0;
  const a = Math.abs(amount);
  const parts = [0, 2, 4].map((i) => Math.round(parseInt(n.slice(i, i + 2), 16) * (1 - a) + to * a));
  return `#${parts.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

const isMain = (l: SplashLayer) => l.kind === "main" || l.kind === "art" || l.kind === "bookLeft" || l.kind === "bookRight";

type Props = { edition: ThemedEditionId; scene: SplashScene; ready: boolean; onDone: () => void };

export function ThemedSplash({ edition, scene, ready, onDone }: Props) {
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const palette = scene.light ? ATMOSPHERES[edition].light : ATMOSPHERES[edition].dark;

  const size = Math.min(width * 0.82, 340);
  const k = size / 1024;
  const cropTop = Math.min(...scene.layers.map((l) => l.y)) - 10;
  const cropBottom = Math.max(...scene.layers.map((l) => l.y + l.h)) + 10;
  const sceneHeight = (cropBottom - cropTop) * k;

  const mains = scene.layers.filter(isMain);
  const sides = scene.layers.filter((l) => l.kind === "side");
  const sparks = scene.layers.filter((l) => l.kind === "spark");
  const cx = scene.cx ?? 512;
  const cy = scene.cy ?? (cropTop + cropBottom) / 2;
  const rings = [800, 630, 460].map((r, i) => ({ r, color: shade(scene.bg, (scene.light ? -1 : 1) * (0.04 + i * 0.035)) }));

  const v = useRef({
    bg: new Animated.Value(0),
    rings: [0, 1, 2].map(() => new Animated.Value(0)),
    main: new Animated.Value(0),
    glow: new Animated.Value(0),
    sides: sides.map(() => new Animated.Value(0)),
    sparks: sparks.map(() => new Animated.Value(0)),
    word: new Animated.Value(0),
    tagline: new Animated.Value(0),
    breathe: new Animated.Value(0),
    sway: new Animated.Value(0),
    twinkleA: new Animated.Value(0),
    twinkleB: new Animated.Value(0),
    float: new Animated.Value(0),
    exit: new Animated.Value(0),
  }).current;

  const [reduced, setReduced] = useState<boolean | null>(null);
  const [minElapsed, setMinElapsed] = useState(false);
  const leaving = useRef(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => alive && setReduced(on))
      .catch(() => alive && setReduced(false));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (reduced === null) return;
    const timer = setTimeout(() => setMinElapsed(true), reduced ? MIN_MS_REDUCED : MIN_MS);
    const chime = setTimeout(() => void playOpeningSound(), reduced ? 0 : CHIME_MS);

    if (reduced) {
      [v.bg, ...v.rings, v.main, v.glow, ...v.sides, ...v.sparks, v.word, v.tagline].forEach((a) => a.setValue(1));
      return () => { clearTimeout(timer); clearTimeout(chime); };
    }

    const at = (ms: number, anim: Animated.CompositeAnimation) => Animated.sequence([Animated.delay(ms), anim]);
    const timing = (value: Animated.Value, duration: number, easing = ease) =>
      Animated.timing(value, { toValue: 1, duration, easing, useNativeDriver: native });
    const spring = (value: Animated.Value, friction: number, tension: number) =>
      Animated.spring(value, { toValue: 1, friction, tension, useNativeDriver: native });

    const entrance = Animated.parallel([
      timing(v.bg, 380, Easing.out(Easing.quad)),
      ...v.rings.map((ring, i) => at(80 + i * 160, timing(ring, 1400))),
      // One soft spring for the whole picture: rises, stands up, overshoots a hair, settles.
      at(200, spring(v.main, 8, 26)),
      at(400, timing(v.glow, 1000)),
      ...v.sides.map((side, i) => at(900 + i * 140, spring(side, 7, 38))),
      ...v.sparks.map((spark, i) => at(1100 + Math.min(i * 55, 850), spring(spark, 5, 75))),
      at(1500, timing(v.word, 800)),
      at(1750, timing(v.tagline, 750)),
    ]);

    const wave = (value: Animated.Value, duration: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(value, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
          Animated.timing(value, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
        ])
      );
    const loops = [wave(v.breathe, 1400), wave(v.sway, 1900), wave(v.twinkleA, 850), wave(v.twinkleB, 1150), wave(v.float, 2200)];
    entrance.start();
    const idle = setTimeout(() => loops.forEach((l) => l.start()), 2000);

    return () => {
      clearTimeout(timer);
      clearTimeout(chime);
      clearTimeout(idle);
      entrance.stop();
      loops.forEach((l) => l.stop());
    };
  }, [reduced, v]);

  useEffect(() => {
    if (!ready || !minElapsed || leaving.current) return;
    leaving.current = true;
    Animated.timing(v.exit, { toValue: 1, duration: reduced ? 250 : 600, easing: Easing.in(Easing.cubic), useNativeDriver: native })
      .start(() => onDone());
  }, [minElapsed, onDone, ready, reduced, v.exit]);

  const place = (l: SplashLayer) => ({
    height: l.h * k,
    left: l.x * k,
    position: "absolute" as const,
    top: (l.y - cropTop) * k,
    width: l.w * k,
  });
  const lerp = (value: Animated.Value, from: number, to: number) =>
    value.interpolate({ inputRange: [0, 1], outputRange: [from, to] });
  const fadeIn = (value: Animated.Value, until = 0.35) =>
    value.interpolate({ inputRange: [0, until, 1], outputRange: [0, 1, 1], extrapolate: "clamp" });

  const ringX = cx * k;
  const ringY = (cy - cropTop) * k;
  const glowSize = 900 * k;
  const ink = scene.light ? palette.ink : "#FFFBF4";
  const accent = scene.light ? palette.tealDark : palette.gold;

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.root, { opacity: lerp(v.exit, 1, 0) }]}>
      {/* Launch navy warms into the icon's own background. */}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: scene.bg, opacity: v.bg }]} />
      <Animated.View style={{ alignItems: "center", transform: [{ scale: lerp(v.exit, 1, 1.07) }, { translateY: -sceneHeight * 0.06 }] }}>
        <View style={{ height: sceneHeight, width: size }}>
          {rings.map((ring, i) => (
            <Animated.View
              key={ring.r}
              style={{
                backgroundColor: ring.color,
                borderRadius: ring.r * k,
                height: ring.r * 2 * k,
                left: ringX - ring.r * k,
                opacity: fadeIn(v.rings[i], 0.5),
                position: "absolute",
                top: ringY - ring.r * k,
                transform: [{ scale: lerp(v.rings[i], 0.55, 1) }],
                width: ring.r * 2 * k,
              }}
            />
          ))}

          <Animated.Image
            source={GLOW}
            style={{
              height: glowSize,
              left: ringX - glowSize / 2,
              opacity: Animated.multiply(v.glow, lerp(v.breathe, scene.light ? 0.3 : 0.55, scene.light ? 0.45 : 0.8)),
              position: "absolute",
              tintColor: palette.gold,
              top: ringY - glowSize / 2,
              transform: [{ scale: Animated.multiply(lerp(v.glow, 0.6, 1), lerp(v.breathe, 1, 1.08)) }],
              width: glowSize,
            }}
          />

          {/* Separate pieces glide in from outside the picture, then sway. */}
          {sides.map((l, i) => {
            const dx = l.x + l.w / 2 - cx;
            const dy = l.y + l.h / 2 - cy;
            const n = Math.hypot(dx, dy) || 1;
            const turn = i % 2 ? 1 : -1;
            return (
              <Animated.Image
                key={`side${i}`}
                source={l.source}
                style={[
                  place(l),
                  {
                    opacity: fadeIn(v.sides[i], 0.3),
                    transform: [
                      { translateX: lerp(v.sides[i], (dx / n) * 70 * k, 0) },
                      { translateY: lerp(v.sides[i], (dy / n) * 70 * k, 0) },
                      { rotate: v.sides[i].interpolate({ inputRange: [0, 1], outputRange: [`${12 * turn}deg`, "0deg"] }) },
                      { rotate: v.sway.interpolate({ inputRange: [0, 1], outputRange: [`${-2 * turn}deg`, `${2 * turn}deg`] }) },
                      { scale: lerp(v.sides[i], 0.7, 1) },
                    ],
                  },
                ]}
              />
            );
          })}

          {/* The whole picture rises and stands up from its base, then floats. */}
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {
                opacity: fadeIn(v.main, 0.3),
                transform: [
                  { perspective: 1100 },
                  { translateY: Animated.add(lerp(v.main, 50 * k, 0), lerp(v.float, 3 * k, -3 * k)) },
                  { rotateX: v.main.interpolate({ inputRange: [0, 1], outputRange: ["62deg", "0deg"] }) },
                  { scale: lerp(v.main, 0.86, 1) },
                ],
                transformOrigin: `50% ${Math.min(100, ((Math.max(...mains.map((l) => l.y + l.h)) - cropTop) / (cropBottom - cropTop)) * 100)}%`,
              },
            ]}
          >
            {mains.map((l, i) => (
              <Animated.Image key={`main${i}`} source={l.source} style={place(l)} />
            ))}
          </Animated.View>

          {/* Small pieces pop nearest-first, then twinkle out of step. */}
          {sparks.map((l, i) => {
            const twinkle = i % 2 ? v.twinkleB : v.twinkleA;
            return (
              <Animated.Image
                key={`spark${i}`}
                source={l.source}
                style={[
                  place(l),
                  {
                    opacity: Animated.multiply(fadeIn(v.sparks[i], 0.2), lerp(twinkle, 1, 0.6)),
                    transform: [
                      { scale: Animated.multiply(v.sparks[i], lerp(twinkle, 1, 0.82)) },
                      { rotate: v.sparks[i].interpolate({ inputRange: [0, 1], outputRange: [i % 2 ? "50deg" : "-50deg", "0deg"] }) },
                    ],
                  },
                ]}
              />
            );
          })}
        </View>

        <Animated.Text style={[styles.word, { color: ink, fontSize: size * 0.15, opacity: v.word, transform: [{ translateY: lerp(v.word, 14, 0) }] }]}>
          bookliz
        </Animated.Text>
        <Animated.Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={[styles.tagline, { color: accent, opacity: v.tagline, transform: [{ translateY: lerp(v.tagline, 10, 0) }] }]}
        >
          {t(`appearancePro.editionMessages.${edition}`).toUpperCase()}
        </Animated.Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: "center", backgroundColor: NAVY, justifyContent: "center", overflow: "hidden", zIndex: 1000 },
  tagline: { fontFamily: "Nunito_800ExtraBold", fontSize: 12, letterSpacing: 2.6, marginTop: 6, maxWidth: "90%" },
  word: { fontFamily: "Lora_700Bold", letterSpacing: 0.5, marginTop: 18 },
});
