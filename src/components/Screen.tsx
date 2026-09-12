import { useScrollToTop } from "@react-navigation/native";
import { PropsWithChildren, ReactNode, useMemo, useRef } from "react";
import { ScrollView, StyleSheet, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColors } from "../theme/ThemeContext";
import { spacing } from "../theme/theme";

type ScreenProps = PropsWithChildren<{
  scroll?: boolean;
  contentStyle?: ViewStyle;
  headerRight?: ReactNode;
}>;

export function Screen({ children, scroll = true, contentStyle, headerRight }: ScreenProps) {
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
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
        {children}
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
        {children}
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
    headerRight: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "flex-end",
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
    },
  });
}
