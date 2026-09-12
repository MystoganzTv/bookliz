/**
 * A drag-to-set slider, built on PanResponder.
 *
 * Deliberately not @react-native-community/slider: this is a bare workflow
 * with `ios/` committed, adding a native module means a pod install and a
 * rebuild, and `expo prebuild` would destroy the current signing setup. A
 * slider is a track, a filled portion and a knob — none of that needs native
 * code, and none of it is worth risking the build for.
 *
 * The value is clamped to [min, max] and rounded to whole steps, so it can
 * never report a page that does not exist or one behind where the reader
 * already was.
 */
import { useMemo, useRef, useState } from "react";
import { PanResponder, StyleSheet, View } from "react-native";
import { useColors } from "../theme/ThemeContext";
import { radii } from "../theme/theme";

const KNOB = 26;

export function ValueSlider({
  value,
  min,
  max,
  onChange,
  onSettle,
  accessibilityLabel,
}: {
  value: number;
  min: number;
  max: number;
  /** Fires continuously while dragging. */
  onChange: (value: number) => void;
  /** Fires once when the finger lifts — for the expensive follow-up work. */
  onSettle?: (value: number) => void;
  accessibilityLabel?: string;
}) {
  const c = useColors();
  const [width, setWidth] = useState(0);

  // The responder is created once; everything it reads changes underneath it,
  // so it reads through refs rather than closing over stale props.
  const state = useRef({ width: 0, min, max, onChange, onSettle });
  state.current = { width, min, max, onChange, onSettle };

  const span = Math.max(1, max - min);
  const ratio = Math.min(1, Math.max(0, (value - min) / span));

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => emit(event.nativeEvent.locationX),
        onPanResponderMove: (_event, gesture) => emit(gesture.moveX - trackX.current),
        onPanResponderRelease: (_event, gesture) => emit(gesture.moveX - trackX.current, true),
        onPanResponderTerminate: (_event, gesture) => emit(gesture.moveX - trackX.current, true),
      }),
    []
  );

  const trackX = useRef(0);

  function emit(x: number, settled = false) {
    const s = state.current;
    if (!s.width) return;
    const fraction = Math.min(1, Math.max(0, x / s.width));
    const next = Math.round(s.min + fraction * Math.max(1, s.max - s.min));
    const clamped = Math.min(s.max, Math.max(s.min, next));
    s.onChange(clamped);
    if (settled) s.onSettle?.(clamped);
  }

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min, max, now: value }}
      style={styles.hitArea}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      // Measured in window coordinates so a move gesture, which reports
      // absolute x, can be turned back into a position along the track.
      ref={(node) => {
        node?.measureInWindow?.((x) => {
          trackX.current = x;
        });
      }}
      {...responder.panHandlers}
    >
      <View style={[styles.track, { backgroundColor: c.border }]}>
        <View style={[styles.fill, { backgroundColor: c.teal, width: `${ratio * 100}%` }]} />
      </View>
      <View
        style={[
          styles.knob,
          {
            backgroundColor: c.card,
            borderColor: c.teal,
            left: Math.max(0, Math.min(width - KNOB, ratio * width - KNOB / 2)),
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hitArea: {
    height: 40,
    justifyContent: "center",
    width: "100%",
  },
  track: {
    borderRadius: radii.pill,
    height: 6,
    overflow: "hidden",
    width: "100%",
  },
  fill: {
    borderRadius: radii.pill,
    height: "100%",
  },
  knob: {
    borderRadius: KNOB / 2,
    borderWidth: 3,
    height: KNOB,
    position: "absolute",
    top: (40 - KNOB) / 2,
    width: KNOB,
  },
});
