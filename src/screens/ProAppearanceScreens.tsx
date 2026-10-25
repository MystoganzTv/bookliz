/**
 * Settings › Accent colour and Settings › Icons & atmosphere (Bookliz Pro).
 * Without Pro both screens still show every option — tapping one opens the
 * paywall on that feature instead of applying it.
 */
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { currentIcon, setIcon, supportsAlternateIcons } from "../../modules/app-icon";
import { EditionBanner } from "../components/EditionBanner";
import { EDITION_IDS, EditionPreference, seasonalEdition } from "../pro/editions";
import { useDialog } from "../components/DialogProvider";
import { Screen } from "../components/Screen";
import { useI18n } from "../i18n/LocalizationContext";
import { RootStackParamList } from "../navigation/types";
import { APP_ICONS, ICON_COLLECTIONS, AppIconId, iconIdForNativeName } from "../pro/appIcons";
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
  const { colors: c, edition, editionPreference, setEditionPreference, hemisphere, setHemisphere } = useTheme();
  const { t } = useI18n();
  const { isPro } = usePro();
  const dialog = useDialog();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const styles = useMemo(() => createStyles(c), [c]);
  const [selected, setSelected] = useState<AppIconId | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const changing = useRef(false);

  useEffect(() => {
    let mounted = true;
    void Promise.all([currentIcon(), supportsAlternateIcons()]).then(([name, available]) => {
      if (!mounted) return;
      setSelected(iconIdForNativeName(name));
      setSupported(available);
    });
    return () => { mounted = false; };
  }, []);

  const choose = async (id: AppIconId) => {
    if (!isPro && id !== "default") {
      navigation.navigate("Paywall", { feature: "appIcons" });
      return;
    }
    if (changing.current || supported === null || id === selected) return;
    if (!supported) {
      dialog.alert(t("appearancePro.iconUnsupportedTitle"), t("appearancePro.iconUnsupportedBody"));
      return;
    }
    const icon = APP_ICONS.find((row) => row.id === id);
    if (!icon) return;
    changing.current = true;
    setBusy(true);
    try {
      await setIcon(icon.nativeName);
      setSelected(id);
    } catch {
      dialog.alert(t("appearancePro.iconFailedTitle"), t("appearancePro.iconFailedBody"));
    } finally {
      changing.current = false;
      setBusy(false);
    }
  };

  const chooseEdition = (next: EditionPreference) => {
    if (!isPro && next !== "classic") {
      navigation.navigate("Paywall", { feature: "appIcons" });
      return;
    }
    setEditionPreference(next);
  };
  const activeEdition = isPro ? editionPreference : "classic";

  return (
    <Screen>
      {!isPro ? <ProNote text={t("appearancePro.iconLocked")} /> : null}
      <Text style={styles.sectionTitle}>{t("appearancePro.homeScreenTitle")}</Text>
      <Text style={styles.description}>{t("appearancePro.collectionDescription")}</Text>
      {supported === false ? <ProNote text={t("appearancePro.iconUnsupportedBody")} /> : null}
      {busy || supported === null ? <ActivityIndicator color={c.teal} accessibilityLabel={t("appearancePro.updating")} /> : null}
      {ICON_COLLECTIONS.map((collection) => (
        <View key={collection.id} style={styles.collection}>
          <Text style={styles.collectionTitle}>{t(`appearancePro.collections.${collection.id}`)}</Text>
          <View style={styles.grid}>
            {collection.icons.map((id) => {
              const icon = APP_ICONS.find((row) => row.id === id)!;
              const isSelected = icon.id === selected;
              return (
                <Pressable
                  key={icon.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected, disabled: busy || supported === null }}
                  accessibilityLabel={t(`appearancePro.icons.${icon.id}`)}
                  disabled={busy || supported === null}
                  onPress={() => { void choose(icon.id); }}
                  style={({ pressed }) => [styles.iconCell, { opacity: pressed || busy ? 0.6 : 1 }]}
                >
                  <View style={[styles.iconRing, isSelected && { borderColor: c.teal }]}>
                    <Image source={icon.preview} style={styles.icon} accessible={false} />
                    {isSelected || (!isPro && id !== "default") ? (
                      <View style={styles.iconBadge}>
                        <Ionicons name={isSelected ? "checkmark" : "lock-closed"} size={13} color={c.ink} />
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.label}>{t(`appearancePro.icons.${icon.id}`)}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      <View style={styles.divider} />
      <Text style={styles.sectionTitle}>{t("appearancePro.inAppTitle")}</Text>
      <Text style={styles.description}>{t("appearancePro.inAppDescription")}</Text>
      <EditionBanner edition={edition} />
      {activeEdition === "seasonal" ? (
        <View style={styles.calendarOptions}>
          <Text style={styles.collectionTitle}>{t("appearancePro.hemisphereTitle")}</Text>
          <View style={styles.hemisphereRow} accessibilityRole="radiogroup" accessibilityLabel={t("appearancePro.hemisphereTitle")}>
            {(["north", "south"] as const).map((id) => (
              <Pressable
                key={id}
                accessibilityRole="radio"
                accessibilityLabel={t(`appearancePro.hemispheres.${id}`)}
                accessibilityState={{ selected: hemisphere === id }}
                onPress={() => setHemisphere(id)}
                style={[styles.hemisphereButton, hemisphere === id && { borderColor: c.teal }]}
              >
                <Text style={styles.hemisphereLabel}>{t(`appearancePro.hemispheres.${id}`)}</Text>
                {hemisphere === id ? <Ionicons name="checkmark-circle" size={18} color={c.teal} /> : null}
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      <View style={styles.grid}>
        {(["seasonal", ...EDITION_IDS] as EditionPreference[]).map((id) => {
          const previewId = id === "seasonal" ? seasonalEdition(new Date(), hemisphere) : id;
          const icon = APP_ICONS.find((row) => row.id === (previewId === "classic" ? "default" : previewId))!;
          const chosen = activeEdition === id;
          return (
            <Pressable
              key={id}
              accessibilityRole="radio"
              accessibilityState={{ selected: chosen }}
              accessibilityLabel={t(`appearancePro.editions.${id}`)}
              onPress={() => chooseEdition(id)}
              style={styles.editionCell}
            >
              <View style={[styles.editionTile, chosen && { borderColor: c.teal }]}>
                {id === "seasonal" ? <Ionicons name="calendar-outline" size={30} color={c.teal} />
                  : <Image source={icon.preview} style={styles.editionImage} accessible={false} />}
                <Text style={styles.editionLabel}>{t(`appearancePro.editions.${id}`)}</Text>
                {chosen || (!isPro && id !== "classic") ? (
                  <View style={styles.editionIndicator}>
                    <Ionicons name={chosen ? "checkmark-circle" : "lock-closed"} size={chosen ? 17 : 12} color={chosen ? c.teal : c.muted} />
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.footnote}>{t("appearancePro.seasonalHint")}</Text>
    </Screen>
  );
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    sectionTitle: { color: c.ink, fontFamily: fonts.display, fontSize: 23, marginBottom: spacing.sm },
    description: { color: c.muted, fontFamily: fonts.bodyRegular, fontSize: 14, lineHeight: 21, marginBottom: spacing.lg },
    collection: { marginBottom: spacing.lg },
    collectionTitle: { color: c.muted, fontFamily: fonts.body, fontSize: 13, marginBottom: spacing.sm },
    calendarOptions: { marginBottom: spacing.lg },
    hemisphereRow: { flexDirection: "row", gap: spacing.sm },
    hemisphereButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: spacing.sm, minHeight: 48, borderRadius: radii.sm, borderWidth: 2, borderColor: c.border, backgroundColor: c.surface },
    hemisphereLabel: { flexShrink: 1, color: c.ink, fontFamily: fonts.body, fontSize: 13 },
    iconBadge: { position: "absolute", right: 0, bottom: 0, backgroundColor: c.surface, borderRadius: 12, padding: 4 },
    divider: { height: 1, backgroundColor: c.border, marginBottom: spacing.lg, marginTop: spacing.sm },
    editionCell: { width: "50%", paddingHorizontal: 4 },
    editionTile: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, minHeight: 74, borderRadius: radii.md, borderWidth: 2, borderColor: c.border, backgroundColor: c.surface },
    editionImage: { height: 34, width: 34, borderRadius: 10 },
    editionIndicator: { position: "absolute", right: 5, top: 5 },
    editionLabel: { flex: 1, color: c.ink, fontFamily: fonts.body, fontSize: 12 },
    footnote: { color: c.muted, fontFamily: fonts.bodyRegular, fontSize: 12, lineHeight: 19, marginTop: spacing.md },
    note: { alignItems: "center", backgroundColor: c.surface, borderRadius: radii.md, flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md, padding: spacing.md },
    noteText: { color: c.ink, flex: 1, fontFamily: fonts.bodyRegular, fontSize: 14, lineHeight: 20 },
    grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start", rowGap: spacing.lg },
    swatchCell: { alignItems: "center", width: "25%" },
    swatchRing: { borderColor: "transparent", borderRadius: 34, borderWidth: 3, padding: 3 },
    swatch: { alignItems: "center", borderRadius: 26, height: 52, justifyContent: "center", width: 52 },
    iconCell: { alignItems: "center", width: "33.33%" },
    iconRing: { borderColor: "transparent", borderRadius: 26, borderWidth: 3, padding: 3 },
    icon: { borderRadius: 20, height: 84, width: 84 },
    label: { color: c.ink, fontFamily: fonts.body, fontSize: 13, marginTop: 6, textAlign: "center", paddingHorizontal: 4 },
    preview: { alignItems: "center", borderRadius: radii.md, borderWidth: 1, gap: spacing.md, marginTop: spacing.xl, padding: spacing.lg },
    previewButton: { alignItems: "center", borderRadius: radii.md, height: 48, justifyContent: "center", width: "100%" },
    previewButtonText: { color: "#fff", fontFamily: fonts.body, fontSize: 16, fontWeight: "900" },
    previewTrack: { backgroundColor: c.border, borderRadius: 3, height: 6, overflow: "hidden", width: "100%" },
    previewFill: { height: 6, width: "62%" },
  });
}
