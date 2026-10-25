/**
 * Settings › Accent colour and Settings › App icon (Bookliz Pro).
 * Without Pro both screens still show every option — tapping one opens the
 * paywall on that feature instead of applying it.
 */
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { currentIcon, setIcon, supportsAlternateIcons } from "../../modules/app-icon";
import { useDialog } from "../components/DialogProvider";
import { Screen } from "../components/Screen";
import { useI18n } from "../i18n/LocalizationContext";
import { RootStackParamList } from "../navigation/types";
import { APP_ICONS, AppIconId, iconIdForNativeName } from "../pro/appIcons";
import { usePro } from "../pro/ProContext";
import { ACCENT_IDS, ACCENTS, AccentId } from "../theme/accents";
import { useTheme } from "../theme/ThemeContext";
import { AppColors, fonts, radii, spacing } from "../theme/theme";

function ProNote({ text }: { text: string }) {
  const { colors: c } = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);
  return (
    <View style={styles.note}>
      <Ionicons name="sparkles" size={16} color={c.gold} />
      <Text style={styles.noteText}>{text}</Text>
    </View>
  );
}

export function AccentPickerScreen() {
  const { colors: c, accent, setAccent } = useTheme();
  const { t } = useI18n();
  const { isPro } = usePro();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const styles = useMemo(() => createStyles(c), [c]);

  const choose = (id: AccentId) => {
    if (!isPro && id !== "teal") {
      navigation.navigate("Paywall", { feature: "accentThemes" });
      return;
    }
    setAccent(id);
  };

  const active: AccentId = isPro ? accent : "teal";

  return (
    <Screen>
      {!isPro ? <ProNote text={t("appearancePro.accentLocked")} /> : null}
      <View style={styles.grid}>
        {ACCENT_IDS.map((id) => {
          const selected = id === active;
          return (
            <Pressable
              key={id}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={t(`appearancePro.accents.${id}`)}
              onPress={() => choose(id)}
              style={styles.swatchCell}
            >
              <View style={[styles.swatchRing, selected && { borderColor: ACCENTS[id].main }]}>
                <View style={[styles.swatch, { backgroundColor: ACCENTS[id].main }]}>
                  {selected ? <Ionicons name="checkmark" size={24} color="#fff" /> : null}
                </View>
              </View>
              <Text style={styles.label}>{t(`appearancePro.accents.${id}`)}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={[styles.preview, { borderColor: c.border }]}>
        <View style={[styles.previewButton, { backgroundColor: c.teal }]}>
          <Text style={styles.previewButtonText}>{t("appearancePro.previewButton")}</Text>
        </View>
        <View style={styles.previewTrack}>
          <View style={[styles.previewFill, { backgroundColor: c.teal }]} />
        </View>
      </View>
    </Screen>
  );
}

export function AppIconPickerScreen() {
  const { colors: c } = useTheme();
  const { t } = useI18n();
  const { isPro } = usePro();
  const dialog = useDialog();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const styles = useMemo(() => createStyles(c), [c]);
  const [selected, setSelected] = useState<AppIconId>(() => iconIdForNativeName(currentIcon()));
  const supported = supportsAlternateIcons();

  useEffect(() => {
    setSelected(iconIdForNativeName(currentIcon()));
  }, []);

  const choose = async (id: AppIconId) => {
    if (!isPro && id !== "default") {
      navigation.navigate("Paywall", { feature: "appIcons" });
      return;
    }
    if (!supported) {
      dialog.alert(t("appearancePro.iconUnsupportedTitle"), t("appearancePro.iconUnsupportedBody"));
      return;
    }
    const icon = APP_ICONS.find((row) => row.id === id);
    if (!icon) return;
    try {
      await setIcon(icon.nativeName);
      setSelected(id);
    } catch (error) {
      dialog.alert(t("appearancePro.iconFailedTitle"), error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Screen>
      {!isPro ? <ProNote text={t("appearancePro.iconLocked")} /> : null}
      <View style={styles.grid}>
        {APP_ICONS.map((icon) => {
          const isSelected = icon.id === selected;
          return (
            <Pressable
              key={icon.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={t(`appearancePro.icons.${icon.id}`)}
              onPress={() => { void choose(icon.id); }}
              style={styles.iconCell}
            >
              <View style={[styles.iconRing, isSelected && { borderColor: c.teal }]}>
                <Image source={icon.preview} style={styles.icon} />
              </View>
              <Text style={styles.label}>{t(`appearancePro.icons.${icon.id}`)}</Text>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    note: { alignItems: "center", backgroundColor: c.surface, borderRadius: radii.md, flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md, padding: spacing.md },
    noteText: { color: c.ink, flex: 1, fontFamily: fonts.bodyRegular, fontSize: 14, lineHeight: 20 },
    grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start", rowGap: spacing.lg },
    swatchCell: { alignItems: "center", width: "25%" },
    swatchRing: { borderColor: "transparent", borderRadius: 34, borderWidth: 3, padding: 3 },
    swatch: { alignItems: "center", borderRadius: 26, height: 52, justifyContent: "center", width: 52 },
    iconCell: { alignItems: "center", width: "33.33%" },
    iconRing: { borderColor: "transparent", borderRadius: 26, borderWidth: 3, padding: 3 },
    icon: { borderRadius: 20, height: 84, width: 84 },
    label: { color: c.ink, fontFamily: fonts.body, fontSize: 13, marginTop: 6 },
    preview: { alignItems: "center", borderRadius: radii.md, borderWidth: 1, gap: spacing.md, marginTop: spacing.xl, padding: spacing.lg },
    previewButton: { alignItems: "center", borderRadius: radii.md, height: 48, justifyContent: "center", width: "100%" },
    previewButtonText: { color: "#fff", fontFamily: fonts.body, fontSize: 16, fontWeight: "900" },
    previewTrack: { backgroundColor: c.border, borderRadius: 3, height: 6, overflow: "hidden", width: "100%" },
    previewFill: { height: 6, width: "62%" },
  });
}
