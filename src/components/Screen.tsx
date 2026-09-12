import { useScrollToTop } from "@react-navigation/native";
import { PropsWithChildren, ReactNode, useMemo, useRef } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColors } from "../theme/ThemeContext";
import { spacing } from "../theme/theme";

/**
 * How wide the content column is allowed to get.
 *
 * On a phone this never binds — every iPhone is narrower — so nothing about
 * the phone layout changes. On an iPad it is the whole difference between a
 * reading app and an iPhone screenshot stretched to 33 centimetres: a row of
 * three stat tiles spread across the full 1024pt put each number alone in the
 * middle of its own empty third, and a line of body text ran so wide the eye
 * lost the start of the next line.
 *
 * 700 is a column, not a guess: it holds the widest thing the app lays out
 * (the three-across stat row) without stretching it, and keeps prose near the
 * 60-75 characters that is comfortable to read.
 */
const MAX_CONTENT_WIDTH = 700;

type ScreenProps = PropsWithChildren<{
  scroll?: boolean;
  contentStyle?: ViewStyle;
  headerRight?: ReactNode;
}>;

export function Screen({ children, scroll = true, contentStyle, headerRight }: ScreenProps) {
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const { width } = useWindowDimensions();
  const isWide = width > MAX_CONTENT_WIDTH;
  /**
   * Tapping the tab you are already on returns you to the top of it — the
   * behaviour every iOS app has, and the only way back up from a long shelf
   * that does not involve flicking. Registered here rather than screen by
   * screen so it cannot be forgotten on the next tab that gets added.
   */
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);

  if (!scroll) {
    return (
      <SafeAreaView style={[styles.safe, contentStyle]}>
        {headerRight ? <View style={styles.headerRight}>{headerRight}</View> : null}
        {/* flex:1 so a list inside still owns the full height — only the width is capped. */}
        <View style={[styles.column, styles.columnFill, !isWide && styles.columnFree]}>{children}</View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {headerRight ? <View style={styles.headerRight}>{headerRight}</View> : null}
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, contentStyle]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      >
        <View style={[styles.column, !isWide && styles.columnFree]}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(c: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    safe: {
      backgroundColor: c.bg,
      flex: 1,
    },
    content: {
      paddingBottom: 124,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
    },
    column: {
      alignSelf: "center",
      maxWidth: MAX_CONTENT_WIDTH,
      width: "100%",
    },
    /** Only for the non-scrolling variant, whose child list needs the height. */
    columnFill: {
      flex: 1,
    },
    /**
     * On a phone the cap must not introduce a layout box of its own: some
     * screens measure their own width off the parent, and a maxWidth that
     * never binds still changes what they see.
     */
    columnFree: {
      maxWidth: undefined,
    },
    headerRight: {
      alignItems: "center",
      alignSelf: "center",
      flexDirection: "row",
      justifyContent: "flex-end",
      maxWidth: MAX_CONTENT_WIDTH,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      width: "100%",
    },
  });
}
