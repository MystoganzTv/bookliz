/**
 * The loading screen, animated — what shows from the moment JavaScript runs
 * until the library has loaded.
 *
 * iOS launch screens are static by rule, so the native one is just the navy
 * background. This takes over on the same navy and builds the app icon piece
 * by piece, like a little sunrise:
 *
 *   1. the icon's halo rings ripple out from behind,
 *   2. the book falls open from its spine,
 *   3. the sun rises out of the pages with a warm glow,
 *   4. the plant grows, the stars pop, the birds glide in,
 *   5. "bookliz" and the tagline settle underneath.
 *
 * While the library is still loading the scene keeps living (the glow
 * breathes, stars twinkle, birds drift, the plant sways). Once it is ready the
 * whole scene lifts toward the viewer and fades into the app.
 *
 * The pieces are layers cut from the 1024px app icon (assets/splash), so they
 * stay sharp and match the icon exactly. Every animation runs on the native
 * driver, so it stays smooth while JavaScript is busy loading the library.
 * With Reduce Motion on, it shows the finished scene and simply fades.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, useWindowDimensions, View } from "react-native";
import { useI18n } from "../i18n/LocalizationContext";
import { playOpeningSound } from "../audio/splashSound";

const NAVY = "#0F172A";
/** Shortest time on screen: long enough for the entrance to finish, so a fast launch never cuts it off. */
const MIN_MS = 2700;
const MIN_MS_REDUCED = 500;
/** When the sun starts to rise — the chime starts with it. */
const SUN_RISES_MS = 650;

/** Where each layer sits on the 1024×1024 icon (from the cut). */
const LAYERS = {
  sun: { x: 359, y: 137, w: 306, h: 306, source: require("../../assets/splash/sun.png") },
  sparkle: { x: 588, y: 308, w: 44, h: 44, source: require("../../assets/splash/sparkle.png") },
  star: { x: 221, y: 236, w: 58, h: 59, source: require("../../assets/splash/star.png") },
  birds: { x: 661, y: 262, w: 182, h: 111, source: require("../../assets/splash/birds.png") },
  leaves: { x: 178, y: 271, w: 155, h: 188, source: require("../../assets/splash/leaves.png") },
  bookLeft: { x: 129, y: 433, w: 383, h: 333, source: require("../../assets/splash/book-left.png") },
  bookRight: { x: 512, y: 433, w: 383, h: 365, source: require("../../assets/splash/book-right.png") },
} as const;
const GLOW = require("../../assets/splash/glow.png");

/** The scene is cropped to the drawn part of the icon. */
const CROP_TOP = 130;
const CROP_BOTTOM = 800;
/** Centre of the icon's halo rings and the sun. */
const RING_CENTER = { x: 512, y: 300 };
const RINGS = [
  { r: 800, color: "#0F1C2E" },
  { r: 630, color: "#0F2535" },
  { r: 460, color: "#103340" },
];

const native = true;
const ease = Easing.out(Easing.cubic);

export function AnimatedSplash({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const size = Math.min(width * 0.82, 340);
  const k = size / 1024;
  const sceneHeight = (CROP_BOTTOM - CROP_TOP) * k;

  const v = useRef({
    rings: RINGS.map(() => new Animated.Value(0)),
    book: new Animated.Value(0),
    sun: new Animated.Value(0),
    leaves: new Animated.Value(0),
    star: new Animated.Value(0),
    sparkle: new Animated.Value(0),
    birds: new Animated.Value(0),
    word: new Animated.Value(0),
    tagline: new Animated.Value(0),
    // idle loops
    breathe: new Animated.Value(0),
    sway: new Animated.Value(0),
    twinkle: new Animated.Value(0),
    drift: new Animated.Value(0),
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
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (reduced === null) return;
    const timer = setTimeout(() => setMinElapsed(true), reduced ? MIN_MS_REDUCED : MIN_MS);
    // The opening chime: its two notes rise with the sun (it respects the silent switch).
    // This is the only place in the app that plays a sound like this.
    const chime = setTimeout(() => void playOpeningSound(), reduced ? 0 : SUN_RISES_MS);

    if (reduced) {
      [...v.rings, v.book, v.sun, v.leaves, v.star, v.sparkle, v.birds, v.word, v.tagline].forEach((a) => a.setValue(1));
      return () => {
        clearTimeout(timer);
        clearTimeout(chime);
      };
    }

    const at = (ms: number, anim: Animated.CompositeAnimation) => Animated.sequence([Animated.delay(ms), anim]);
    const timing = (value: Animated.Value, duration: number, easing = ease) =>
      Animated.timing(value, { toValue: 1, duration, easing, useNativeDriver: native });
    const spring = (value: Animated.Value, friction = 7, tension = 50) =>
      Animated.spring(value, { toValue: 1, friction, tension, useNativeDriver: native });

    const entrance = Animated.parallel([
      ...v.rings.map((ring, i) => at(i * 160, timing(ring, 1400))),
      at(200, spring(v.book, 9, 22)),
      at(SUN_RISES_MS, timing(v.sun, 1400, Easing.out(Easing.back(1.1)))),
      at(1100, spring(v.leaves, 7, 34)),
      at(1250, spring(v.star, 5, 60)),
      at(1500, spring(v.sparkle, 5, 60)),
      at(1150, timing(v.birds, 1600)),
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
    const loops = [wave(v.breathe, 1400), wave(v.sway, 1800), wave(v.twinkle, 900), wave(v.drift, 2200)];

    entrance.start();
    // The idle life starts once the sun is up, overlapping the tail of the entrance.
    const idle = setTimeout(() => loops.forEach((l) => l.start()), 1900);

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
    Animated.timing(v.exit, {
      toValue: 1,
      duration: reduced ? 250 : 600,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: native,
    }).start(() => onDone());
  }, [minElapsed, onDone, ready, reduced, v.exit]);

  const place = useMemo(
    () => (key: keyof typeof LAYERS) => {
      const l = LAYERS[key];
      return { height: l.h * k, left: l.x * k, position: "absolute" as const, top: (l.y - CROP_TOP) * k, width: l.w * k };
    },
    [k]
  );

  const lerp = (value: Animated.Value | Animated.AnimatedInterpolation<number>, from: number, to: number) =>
    value.interpolate({ inputRange: [0, 1], outputRange: [from, to] });
  const fadeIn = (value: Animated.Value, until = 0.35) =>
    value.interpolate({ inputRange: [0, until, 1], outputRange: [0, 1, 1], extrapolate: "clamp" });

  const ringX = RING_CENTER.x * k;
  const ringY = (RING_CENTER.y - CROP_TOP) * k;
  const glowSize = 900 * k;

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.root, { opacity: lerp(v.exit, 1, 0) }]}>
      <Animated.View
        style={{
          alignItems: "center",
          transform: [{ scale: lerp(v.exit, 1, 1.07) }, { translateY: -sceneHeight * 0.08 }],
        }}
      >
        {/* The icon itself: halo rings, book, sun and friends. */}
        <View style={{ height: sceneHeight, width: size }}>
          {RINGS.map((ring, i) => (
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

          {/* Warm light behind the sun — it breathes while the library loads. */}
          <Animated.Image
            source={GLOW}
            style={{
              height: glowSize,
              left: (512 * k) - glowSize / 2,
              opacity: Animated.multiply(fadeIn(v.sun, 0.6), lerp(v.breathe, 0.75, 1)),
              position: "absolute",
              top: (290 - CROP_TOP) * k - glowSize / 2,
              transform: [{ scale: Animated.multiply(lerp(v.sun, 0.5, 1), lerp(v.breathe, 1, 1.1)) }],
              width: glowSize,
            }}
          />

          {/* The sun climbs out of the pages. */}
          <Animated.View
            style={[
              place("sun"),
              {
                opacity: fadeIn(v.sun, 0.3),
                transform: [{ translateY: lerp(v.sun, 170 * k, 0) }, { scale: lerp(v.sun, 0.7, 1) }],
              },
            ]}
          >
            <Animated.Image source={LAYERS.sun.source} style={styles.fill} />
          </Animated.View>

          {/* The plant grows up from behind the left page, then sways. */}
          <Animated.Image
            source={LAYERS.leaves.source}
            style={[
              place("leaves"),
              {
                transform: [
                  { scale: v.leaves },
                  { rotate: v.sway.interpolate({ inputRange: [0, 1], outputRange: ["-2.5deg", "2.5deg"] }) },
                ],
                transformOrigin: "60% 100%",
              },
            ]}
          />

          {/* The book falls open from its spine. */}
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { opacity: fadeIn(v.book, 0.25), transform: [{ translateY: lerp(v.book, 70 * k, 0) }] },
            ]}
          >
            <Animated.Image
              source={LAYERS.bookLeft.source}
              style={[
                place("bookLeft"),
                {
                  transform: [
                    { perspective: 900 },
                    { rotateY: v.book.interpolate({ inputRange: [0, 1], outputRange: ["78deg", "0deg"] }) },
                  ],
                  transformOrigin: "100% 50%",
                },
              ]}
            />
            <Animated.Image
              source={LAYERS.bookRight.source}
              style={[
                place("bookRight"),
                {
                  transform: [
                    { perspective: 900 },
                    { rotateY: v.book.interpolate({ inputRange: [0, 1], outputRange: ["-78deg", "0deg"] }) },
                  ],
                  transformOrigin: "0% 50%",
                },
              ]}
            />
          </Animated.View>

          {/* Stars pop, then twinkle out of step with each other. */}
          <Animated.Image
            source={LAYERS.star.source}
            style={[
              place("star"),
              {
                opacity: lerp(v.twinkle, 1, 0.65),
                transform: [{ scale: Animated.multiply(v.star, lerp(v.twinkle, 1, 0.78)) }, { rotate: v.star.interpolate({ inputRange: [0, 1], outputRange: ["-90deg", "0deg"] }) }],
              },
            ]}
          />
          <Animated.Image
            source={LAYERS.sparkle.source}
            style={[
              place("sparkle"),
              {
                opacity: lerp(v.twinkle, 0.7, 1),
                transform: [{ scale: Animated.multiply(v.sparkle, lerp(v.twinkle, 0.8, 1.1)) }],
              },
            ]}
          />

          {/* The birds glide in from the left and keep drifting. */}
          <Animated.Image
            source={LAYERS.birds.source}
            style={[
              place("birds"),
              {
                opacity: fadeIn(v.birds, 0.4),
                transform: [
                  { translateX: Animated.add(lerp(v.birds, -120 * k, 0), lerp(v.drift, -6 * k, 6 * k)) },
                  { translateY: Animated.add(lerp(v.birds, 40 * k, 0), lerp(v.drift, 5 * k, -5 * k)) },
                ],
              },
            ]}
          />
        </View>

        <Animated.Text
          style={[
            styles.word,
            { fontSize: size * 0.15, opacity: v.word, transform: [{ translateY: lerp(v.word, 14, 0) }] },
          ]}
        >
          bookliz
        </Animated.Text>
        <Animated.Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={[styles.tagline, { opacity: v.tagline, transform: [{ translateY: lerp(v.tagline, 10, 0) }] }]}
        >
          {t("welcome.title").toUpperCase()}
        </Animated.Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { height: "100%", width: "100%" },
  root: { alignItems: "center", backgroundColor: NAVY, justifyContent: "center", overflow: "hidden", zIndex: 1000 },
  tagline: {
    color: "#FFC857",
    fontFamily: "Nunito_800ExtraBold",
    fontSize: 12,
    letterSpacing: 3,
    marginTop: 6,
    maxWidth: "90%",
  },
  word: {
    color: "#FFFBF4",
    fontFamily: "Lora_700Bold",
    letterSpacing: 0.5,
    marginTop: 18,
  },
});

