/**
 * Settings › Themes (Bookliz Pro). A theme is a package: it repaints the app
 * (src/theme/atmospheres.ts) and brings its home-screen icon with it, unless
 * the reader switches that off. Classic carries the original icon in six
 * colourways. Without Pro every theme is shown; tapping one opens the paywall.
 *
 * Laid out as open sections — a header and a row of icons — not boxes: the
 * screen repaints behind you as you tap, which is the real preview.
 */
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { supportsAlternateIcons } from "../../modules/app-icon";
import { useDialog } from "../components/DialogProvider";
import { Screen } from "../components/Screen";
import { useI18n } from "../i18n/LocalizationContext";
import { RootStackParamList } from "../navigation/types";
import { APP_ICONS, AppIconId, CLASSIC_ICON_IDS, ClassicIconId, iconForEdition } from "../pro/appIcons";
import { EditionId, EditionPreference, seasonalEdition } from "../pro/editions";
import { usePro } from "../pro/ProContext";
import { applyAppIcon } from "../pro/themeIcon";
import { paintAtmosphere } from "../theme/atmospheres";
import { useTheme } from "../theme/ThemeContext";
import { AppColors, darkColors, fonts, lightColors, spacing } from "../theme/theme";

const SECTIONS: { id: "seasonal" | "celebrations" | "illustrated" | "originals"; themes: EditionPreference[] }[] = [
  { id: "seasonal", themes: ["seasonal", "spring", "summer", "autumn", "winter"] },
  { id: "celebrations", themes: ["valentines", "walpurgis", "workers", "halloween", "christmas"] },
  { id: "illustrated", themes: ["moonlight", "botanical", "library", "audio"] },
  { id: "originals", themes: ["classic"] },
];

const preview = (id: AppIconId) => APP_ICONS.find((icon) => icon.id === id)!.preview;

export function ThemesScreen() {
  const {
    colors: c, isDark, editionPreference, setEditionPreference, hemisphere, setHemisphere,
    iconFollowsTheme, setIconFollowsTheme, classicIcon, setClassicIcon,
  } = useTheme();
  const { t } = useI18n();
  const { isPro } = usePro();
  const dialog = useDialog();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const styles = useMemo(() => createStyles(c), [c]);
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    void supportsAlternateIcons().then((value) => { if (mounted) setSupported(value); });
    return () => { mounted = false; };
  }, []);

  const active: EditionPreference = isPro ? editionPreference : "classic";
  const activeClassicIcon: ClassicIconId = isPro ? classicIcon : "default";
  const today = seasonalEdition(new Date(), hemisphere);
  const resolve = (id: EditionPreference): EditionId => (id === "seasonal" ? today : id);

  const applyIcon = async (target: AppIconId) => {
    if (!iconFollowsTheme || !supported) return;
    if ((await applyAppIcon(target)) === "failed") {
      dialog.alert(t("appearancePro.iconFailedTitle"), t("appearancePro.iconFailedBody"));
    }
  };

  const chooseTheme = (id: EditionPreference) => {
    if (!isPro && id !== "classic") {
      navigation.navigate("Paywall", { feature: "appIcons" });
      return;
    }
    setEditionPreference(id);
    void applyIcon(iconForEdition(resolve(id), activeClassicIcon));
  };

  const chooseClassicIcon = (id: ClassicIconId) => {
    if (!isPro && id !== "default") {
      navigation.navigate("Paywall", { feature: "appIcons" });
      return;
    }
    setClassicIcon(id);
    if (active === "classic") void applyIcon(id);
  };

  const toggleFollow = (next: boolean) => {
    setIconFollowsTheme(next);
    if (next && supported) void applyAppIcon(iconForEdition(resolve(active), activeClassicIcon));
  };

  return (
    <Screen>
      <Text style={styles.description}>{t("appearancePro.themeDescription")}</Text>
      {!isPro ? (
        <View style={styles.note}>
          <Ionicons name="sparkles" size={16} color={c.gold} />
          <Text style={styles.noteText}>{t("appearancePro.iconLocked")}</Text>
        </View>
      ) : null}

      {SECTIONS.map((section) => (
        <View key={section.id} style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">{t(`appearancePro.collections.${section.id}`)}</Text>
          <View style={styles.grid} accessibilityRole="radiogroup">
            {section.themes.map((id) => {
              const edition = resolve(id);
              const tile = paintAtmosphere(isDark ? darkColors : lightColors, edition, isDark);
              const chosen = active === id;
              const locked = !isPro && id !== "classic";
              return (
                <Pressable
                  key={id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: chosen }}
                  accessibilityLabel={t(`appearancePro.editions.${id}`)}
                  onPress={() => chooseTheme(id)}
                  style={({ pressed }) => [styles.cell, pressed && { opacity: 0.6 }]}
                >
                  <View style={[styles.ring, chosen && { borderColor: tile.teal }]}>
                    <Image source={preview(iconForEdition(edition, activeClassicIcon))} style={styles.icon} accessible={false} />
                    {id === "seasonal" ? (
                      <View style={[styles.badge, styles.badgeLeft, { backgroundColor: c.bg }]}>
                        <Ionicons name="calendar" size={13} color={c.tealDark} />
                      </View>
                    ) : null}
                    {chosen || locked ? (
                      <View style={[styles.badge, { backgroundColor: c.bg }]}>
                        <Ionicons name={chosen ? "checkmark-circle" : "lock-closed"} size={chosen ? 17 : 12} color={chosen ? tile.teal : c.muted} />
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.label, chosen && { color: c.ink }]} numberOfLines={2}>{t(`appearancePro.editions.${id}`)}</Text>
                  <View style={styles.swatches}>
                    {[tile.bg, tile.teal, tile.coral].map((color, index) => (
                      <View key={index} style={[styles.swatch, { backgroundColor: color, borderColor: c.border }]} />
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>

          {section.id === "seasonal" && active === "seasonal" ? (
            <View style={styles.inline} accessibilityRole="radiogroup" accessibilityLabel={t("appearancePro.hemisphereTitle")}>
              <Text style={styles.inlineTitle}>{t("appearancePro.hemisphereTitle")}</Text>
              <View style={styles.segment}>
                {(["north", "south"] as const).map((id) => (
                  <Pressable
                    key={id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: hemisphere === id }}
                    onPress={() => setHemisphere(id)}
                    style={[styles.segmentItem, hemisphere === id && { backgroundColor: c.teal }]}
                  >
                    <Text style={[styles.segmentText, hemisphere === id && { color: "#FFFFFF" }]}>{t(`appearancePro.hemispheres.${id}`)}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {section.id === "originals" && active === "classic" ? (
            <View style={styles.inline}>
              <Text style={styles.inlineTitle}>{t("appearancePro.classicIconTitle")}</Text>
              <View style={styles.classicRow} accessibilityRole="radiogroup">
                {CLASSIC_ICON_IDS.map((id) => {
                  const chosen = activeClassicIcon === id;
                  return (
                    <Pressable
                      key={id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: chosen }}
                      accessibilityLabel={t(`appearancePro.icons.${id}`)}
                      onPress={() => chooseClassicIcon(id)}
                      style={[styles.smallRing, chosen && { borderColor: c.teal }]}
                    >
                      <Image source={preview(id)} style={styles.smallIcon} accessible={false} />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
        </View>
      ))}

      <View style={styles.rule} />
      {supported === false ? (
        <Text style={styles.footnote}>{t("appearancePro.iconUnsupportedBody")}</Text>
      ) : (
        <View style={styles.toggleRow}>
          <View style={styles.toggleCopy}>
            <Text style={styles.toggleTitle}>{t("appearancePro.iconFollowsTitle")}</Text>
            <Text style={styles.toggleBody}>{t("appearancePro.iconFollowsBody")}</Text>
          </View>
          <Switch
            accessibilityLabel={t("appearancePro.iconFollowsTitle")}
            value={iconFollowsTheme}
            onValueChange={toggleFollow}
            disabled={supported === null}
            trackColor={{ false: c.border, true: c.teal }}
            ios_backgroundColor={c.border}
          />
        </View>
      )}
      <Text style={styles.footnote}>{t("appearancePro.seasonalHint")}</Text>
    </Screen>
  );
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    description: { color: c.muted, fontFamily: fonts.bodyRegular, fontSize: 15, lineHeight: 22, marginBottom: spacing.lg },
    note: { alignItems: "center", flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
    noteText: { color: c.ink, flex: 1, fontFamily: fonts.bodyRegular, fontSize: 14, lineHeight: 20 },
    section: { marginBottom: spacing.xl },
    sectionTitle: { color: c.muted, fontFamily: fonts.body, fontSize: 12, letterSpacing: 1.2, marginBottom: spacing.md, textTransform: "uppercase" },
    grid: { flexDirection: "row", flexWrap: "wrap", rowGap: spacing.lg },
    cell: { alignItems: "center", width: "33.33%", paddingHorizontal: 4 },
    ring: { borderColor: "transparent", borderRadius: 26, borderWidth: 3, padding: 3 },
    icon: { borderRadius: 19, height: 76, width: 76 },
    badge: { position: "absolute", right: -2, bottom: -2, borderRadius: 12, padding: 3 },
    badgeLeft: { right: undefined, left: -2 },
    label: { color: c.muted, fontFamily: fonts.body, fontSize: 13, marginTop: 6, textAlign: "center" },
    swatches: { flexDirection: "row", gap: 4, marginTop: 5 },
    swatch: { borderRadius: 5, borderWidth: StyleSheet.hairlineWidth, height: 10, width: 10 },
    inline: { marginTop: spacing.lg },
    inlineTitle: { color: c.ink, fontFamily: fonts.body, fontSize: 14, marginBottom: spacing.sm },
    segment: { backgroundColor: c.surfaceAlt, borderRadius: 12, flexDirection: "row", padding: 3 },
    segmentItem: { alignItems: "center", borderRadius: 10, flex: 1, minHeight: 40, justifyContent: "center", paddingHorizontal: 6 },
    segmentText: { color: c.ink, fontFamily: fonts.body, fontSize: 13, textAlign: "center" },
    classicRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    smallRing: { borderColor: "transparent", borderRadius: 18, borderWidth: 2.5, padding: 2 },
    smallIcon: { borderRadius: 13, height: 46, width: 46 },
    rule: { backgroundColor: c.border, height: StyleSheet.hairlineWidth, marginBottom: spacing.lg },
    toggleRow: { alignItems: "center", flexDirection: "row", gap: spacing.md },
    toggleCopy: { flex: 1, gap: 4 },
    toggleTitle: { color: c.ink, fontFamily: fonts.body, fontSize: 16 },
    toggleBody: { color: c.muted, fontFamily: fonts.bodyRegular, fontSize: 13, lineHeight: 19 },
    footnote: { color: c.muted, fontFamily: fonts.bodyRegular, fontSize: 12, lineHeight: 19, marginTop: spacing.lg },
  });
}
