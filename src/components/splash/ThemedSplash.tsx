/**
 * The loading screen for a theme other than Classic: the theme's own icon,
 * built up like a pop-up book.
 *
 *   1. the screen warms from the launch navy into the icon's background,
 *      halo rings ripple out,
 *   2. the book falls open from its spine (a stack of books rises instead),
 *   3. the art stands up out of the pages — the chime starts with it —
 *      with a soft glow behind,
 *   4. the larger pieces grow in, the small ones (stars, petals, snowflakes,
 *      bats) pop one after another and then twinkle,
 *   5. "bookliz" and the theme's own line settle underneath.
 *
 * The layers are cut from the 1024px theme icon (themedScenes.ts), so the
 * finished frame is the icon itself. Same rules as the Classic splash: native
 * driver throughout, a minimum time so a fast launch never cuts the entrance,
 * Reduce Motion shows the finished scene and fades.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, useWindowDimensions, View } from "react-native";
import { playOpeningSound } from "../../audio/splashSound";
import { useI18n } from "../../i18n/LocalizationContext";
import { ATMOSPHERES, ThemedEditionId } from "../../theme/atmospheres";
import { SplashLayer, SplashScene } from "./themedScenes";

const NAVY = "#0F172A";
const MIN_MS = 2800;
const MIN_MS_REDUCED = 500;
/** When the art stands up — the chime starts with it. */
const ART_RISES_MS = 650;
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

  const art = scene.layers.find((l) => l.kind === "art");
  const sides = scene.layers.filter((l) => l.kind === "side");
  const sparks = scene.layers.filter((l) => l.kind === "spark");
  const books = scene.layers.filter((l) => l.kind === "bookLeft" || l.kind === "bookRight");
  const center = art ? { x: art.x + art.w / 2, y: art.y + art.h * 0.55 } : { x: 512, y: scene.bookTop - 120 };
  const rings = useMemo(
    () => [800, 630, 460].map((r, i) => ({ r, color: shade(scene.bg, (scene.light ? -1 : 1) * (0.04 + i * 0.035)) })),
    [scene.bg, scene.light]
  );

  const v = useRef({
    bg: new Animated.Value(0),
    rings: [0, 1, 2].map(() => new Animated.Value(0)),
    book: new Animated.Value(0),
    art: new Animated.Value(0),
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
    const chime = setTimeout(() => void playOpeningSound(), reduced ? 0 : ART_RISES_MS);
    const all = [v.bg, ...v.rings, v.book, v.art, ...v.sides, ...v.sparks, v.word, v.tagline];

    if (reduced) {
      all.forEach((a) => a.setValue(1));
      return () => { clearTimeout(timer); clearTimeout(chime); };
    }

    const at = (ms: number, anim: Animated.CompositeAnimation) => Animated.sequence([Animated.delay(ms), anim]);
    const timing = (value: Animated.Value, duration: number, easing = ease) =>
      Animated.timing(value, { toValue: 1, duration, easing, useNativeDriver: native });
    const spring = (value: Animated.Value, friction = 7, tension = 50) =>
      Animated.spring(value, { toValue: 1, friction, tension, useNativeDriver: native });

    const entrance = Animated.parallel([
      timing(v.bg, 380, Easing.out(Easing.quad)),
      ...v.rings.map((ring, i) => at(80 + i * 160, timing(ring, 1400))),
      at(200, spring(v.book, 9, 22)),
      at(ART_RISES_MS, timing(v.art, 1150, Easing.out(Easing.back(1.25)))),
      ...v.sides.map((side, i) => at(1050 + i * 130, spring(side, 6, 40))),
      // Small pieces pop in a quick cascade, top to bottom — never longer than ~0.8 s in all.
      ...v.sparks.map((spark, i) => at(1200 + Math.min(i * 45, 800), spring(spark, 5, 70))),
      at(1550, timing(v.word, 800)),
      at(1800, timing(v.tagline, 750)),
    ]);

    const wave = (value: Animated.Value, duration: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(value, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
          Animated.timing(value, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
        ])
      );
    const loops = [wave(v.breathe, 1400), wave(v.sway, 1900), wave(v.twinkleA, 850), wave(v.twinkleB, 1150), wave(v.float, 2100)];
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

  const ringX = center.x * k;
  const ringY = (center.y - cropTop) * k;
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
              opacity: Animated.multiply(fadeIn(v.art, 0.6), lerp(v.breathe, scene.light ? 0.35 : 0.6, scene.light ? 0.5 : 0.85)),
              position: "absolute",
              tintColor: palette.gold,
              top: ringY - glowSize / 2,
              transform: [{ scale: Animated.multiply(lerp(v.art, 0.5, 1), lerp(v.breathe, 1, 1.08)) }],
              width: glowSize,
            }}
          />

          {/* Larger separate pieces grow from their base, then sway. */}
          {sides.map((l, i) => (
            <Animated.Image
              key={`side${i}`}
              source={l.source}
              style={[
                place(l),
                {
                  opacity: fadeIn(v.sides[i], 0.3),
                  transform: [
                    { scale: v.sides[i] },
                    { rotate: v.sway.interpolate({ inputRange: [0, 1], outputRange: [i % 2 ? "2deg" : "-2deg", i % 2 ? "-2deg" : "2deg"] }) },
                  ],
                  transformOrigin: "50% 100%",
                },
              ]}
            />
          ))}

          {/* The art stands up out of the pages like a pop-up, then floats a little. */}
          {art ? (
            <Animated.Image
              source={art.source}
              style={[
                place(art),
                {
                  opacity: fadeIn(v.art, 0.25),
                  transform: [
                    { perspective: 1000 },
                    { translateY: Animated.add(lerp(v.art, 40 * k, 0), lerp(v.float, 3 * k, -3 * k)) },
                    { rotateX: v.art.interpolate({ inputRange: [0, 1], outputRange: ["78deg", "0deg"] }) },
                  ],
                  transformOrigin: "50% 100%",
                },
              ]}
            />
          ) : null}

          {/* The book: falls open from its spine, or (a stack) rises into place. */}
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {
                opacity: fadeIn(v.book, 0.25),
                transform: scene.mode === "open"
                  ? [{ translateY: lerp(v.book, 70 * k, 0) }]
                  : [{ translateY: lerp(v.book, 140 * k, 0) }, { scale: lerp(v.book, 0.92, 1) }],
              },
            ]}
          >
            {books.map((l) => (
              <Animated.Image
                key={l.kind}
                source={l.source}
                style={[
                  place(l),
                  scene.mode === "open"
                    ? {
                        transform: [
                          { perspective: 900 },
                          { rotateY: v.book.interpolate({ inputRange: [0, 1], outputRange: l.kind === "bookLeft" ? ["78deg", "0deg"] : ["-78deg", "0deg"] }) },
                        ],
                        transformOrigin: l.kind === "bookLeft" ? "100% 50%" : "0% 50%",
                      }
                    : null,
                ]}
              />
            ))}
          </Animated.View>

          {/* Small pieces pop, then twinkle out of step with each other. */}
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
                      { rotate: v.sparks[i].interpolate({ inputRange: [0, 1], outputRange: [i % 2 ? "60deg" : "-60deg", "0deg"] }) },
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
