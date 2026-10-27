/**
 * The app's text field: a plain TextInput plus a "Done" bar above the iOS
 * keyboard.
 *
 * Without it the keyboard had no way out on most screens: a number pad has no
 * return key at all, a multiline field turns return into a new line, and a
 * sheet with no scroll view behind it can't be swiped down. Every field gets
 * the bar here, once, so the next screen can't forget it.
 *
 * Each field renders its own accessory view (a unique nativeID next to it)
 * rather than pointing at one shared bar, because a shared bar mounted at the
 * root is not reliably found by a field inside a native Modal (every sheet in
 * the app). A field that brings its own `inputAccessoryViewID` keeps it.
 * Android needs none of this: its keyboard has a hide key.
 */
import { forwardRef, useId } from "react";
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from "react-native";
import { useI18n } from "../i18n/LocalizationContext";
import { fonts, spacing } from "../theme/theme";
import { useColors } from "../theme/ThemeContext";

export type AppTextInputProps = TextInputProps & {
  /** false: no Done bar (a field that handles return itself and wants nothing above the keys). */
  doneBar?: boolean;
};

export const AppTextInput = forwardRef<TextInput, AppTextInputProps>(function AppTextInput(
  { doneBar = true, inputAccessoryViewID, ...props },
  ref
) {
  const reactId = useId();
  const ownBar = Platform.OS === "ios" && doneBar && !inputAccessoryViewID;
  const barId = `keyboard-done-${reactId.replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <>
      <TextInput ref={ref} {...props} inputAccessoryViewID={ownBar ? barId : inputAccessoryViewID} />
      {ownBar ? <KeyboardDoneBar nativeID={barId} /> : null}
    </>
  );
});

/** The bar itself — exported for screens that share one bar between several fields. */
export function KeyboardDoneBar({ nativeID }: { nativeID: string }) {
  const c = useColors();
  const { t } = useI18n();
  return (
    <InputAccessoryView nativeID={nativeID}>
      <View style={[styles.bar, { backgroundColor: c.surfaceAlt, borderTopColor: c.border }]}>
        <Pressable
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => Keyboard.dismiss()}
          style={({ pressed }) => [styles.done, pressed && { opacity: 0.6 }]}
        >
          <Text style={[styles.doneText, { color: c.tealDark }]}>{t("common.done")}</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: "flex-end",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  done: { paddingHorizontal: spacing.xs, paddingVertical: 2 },
  doneText: { fontFamily: fonts.body, fontSize: 16, fontWeight: "900" },
});
