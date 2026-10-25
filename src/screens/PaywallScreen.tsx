/**
 * Bookliz Pro — one screen, BookPlayer-style: what Pro adds, the plans with
 * the yearly one preselected, one button, Restore, and the terms Apple
 * requires next to a subscription (price, length, auto-renew, links).
 */
import { Ionicons } from "@expo/vector-icons";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDialog } from "../components/DialogProvider";
import { useI18n } from "../i18n/LocalizationContext";
import { RootStackParamList } from "../navigation/types";
import { PRO_FEATURES, ProFeature, usePro } from "../pro/ProContext";
import { FALLBACK_PRICES, PRO_PLANS, ProPlan, productForPlan, yearlySavingsPercent } from "../pro/proProducts";
import { useTheme } from "../theme/ThemeContext";
import { AppColors, fonts, radii, spacing, withAlpha } from "../theme/theme";

const FEATURE_ICONS: Record<ProFeature, keyof typeof Ionicons.glyphMap> = {
  watchStandalone: "watch-outline",
  cloudAudio: "cloud-upload-outline",
  yearInReview: "sparkles-outline",
  appIcons: "color-palette-outline",
  readerFonts: "text-outline",
};

const BETA_FEATURES: ProFeature[] = ["watchStandalone", "cloudAudio"];

export function PaywallScreen() {
  const { colors: c } = useTheme();
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "Paywall">>();
  const dialog = useDialog();
  const pro = usePro();
  const styles = useMemo(() => createStyles(c), [c]);
  const [selected, setSelected] = useState<ProPlan>("yearly");
  const [busy, setBusy] = useState<"buy" | "restore" | null>(null);
  // Confirmation lives on the screen itself, not in a dialog (see handleBuy).
  const [unlocked, setUnlocked] = useState<"bought" | "restored" | null>(null);
  const owned = pro.isPro || unlocked !== null;
  const highlighted = route.params?.feature;

  const monthly = productForPlan(pro.products, "monthly");
  const yearly = productForPlan(pro.products, "yearly");
  const savings = yearlySavingsPercent(monthly, yearly) ?? 37;
  const priceOf = (plan: ProPlan) => productForPlan(pro.products, plan)?.displayPrice ?? FALLBACK_PRICES[plan];
  const intro = yearly?.introOffer?.paymentMode === "freeTrial" ? yearly.introOffer : undefined;

  const close = () => navigation.goBack();

  const handleBuy = async () => {
    if (!pro.storeAvailable) {
      dialog.alert(t("pro.unavailableTitle"), t("pro.unavailableBody"));
      return;
    }
    setBusy("buy");
    try {
      const status = await pro.buy(selected);
      // Success: no dialog. The StoreKit sheet is still animating out, and
      // presenting a modal on top of it (then dismissing the paywall from its
      // callback) is what froze the app in App Review. The screen itself
      // flips to "You're Pro" as soon as the entitlement lands.
      if (status === "success") {
        setUnlocked("bought");
      } else if (status === "pending") {
        dialog.alert(t("pro.pendingTitle"), t("pro.pendingBody"));
      } else if (status !== "cancelled") {
        dialog.alert(t("pro.failedTitle"), t("pro.failedBody"));
      }
    } catch (error) {
      dialog.alert(t("pro.failedTitle"), `${t("pro.failedBody")}\n\n${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(null);
    }
  };

  const handleRestore = async () => {
    setBusy("restore");
    try {
      const restored = await pro.restore();
      // Restored: the screen flips to its "You're Pro" state; no dialog that
      // closes the paywall from its callback (see handleBuy).
      if (restored) setUnlocked("restored");
      else dialog.alert(t("pro.nothingTitle"), t("pro.nothingBody"));
    } catch (error) {
      dialog.alert(t("pro.failedTitle"), error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  const renewsLine = pro.renewsAt
    ? t("pro.renews", { date: new Date(pro.renewsAt).toLocaleDateString(locale === "es" ? "es-ES" : "en-US", { day: "numeric", month: "long", year: "numeric" }) })
    : pro.plan === "lifetime" ? t("pro.lifetimeOwned") : "";

  return (
    <View style={[styles.root, { paddingTop: insets.top > 20 ? 12 : insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("pro.close")} hitSlop={10} onPress={close} style={styles.circleButton}>
          <Ionicons name="close" size={22} color={c.teal} />
        </Pressable>
        <Text style={styles.topTitle}>Bookliz Pro</Text>
        {owned ? <View style={styles.topSpacer} /> : (
          <Pressable accessibilityRole="button" hitSlop={10} onPress={handleRestore} disabled={busy !== null} style={styles.restoreButton}>
            {busy === "restore" ? <ActivityIndicator color={c.teal} /> : <Text style={styles.restoreText}>{t("pro.restore")}</Text>}
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Text style={styles.headline}>
          {unlocked === "bought" ? t("pro.welcomeTitle") : unlocked === "restored" ? t("pro.restoredTitle") : pro.isPro ? t("pro.youArePro") : t("pro.headline")}
        </Text>
        {unlocked ? (
          <Text style={styles.subhead}>{unlocked === "bought" ? t("pro.welcomeBody") : t("pro.restoredBody")}</Text>
        ) : pro.isPro && renewsLine ? <Text style={styles.subhead}>{renewsLine}</Text> : null}

        <View style={styles.features}>
          {PRO_FEATURES.map((feature) => {
            const isHighlighted = feature === highlighted;
            return (
              <View key={feature} style={[styles.featureRow, isHighlighted && styles.featureRowHighlighted]}>
                <View style={styles.featureIcon}>
                  <Ionicons name={FEATURE_ICONS[feature]} size={24} color={c.teal} />
                </View>
                <View style={styles.featureCopy}>
                  <Text style={styles.featureTitle}>
                    {t(`pro.features.${feature}.title`)}
                    {BETA_FEATURES.includes(feature) ? <Text style={styles.beta}>{`  ${t("pro.beta")}`}</Text> : null}
                  </Text>
                  <Text style={styles.featureBody}>{t(`pro.features.${feature}.body`)}</Text>
                </View>
              </View>
            );
          })}
        </View>

        {owned ? (
          pro.isPro && pro.plan && pro.plan !== "lifetime" ? (
            <Pressable accessibilityRole="button" style={styles.cta} onPress={() => { void pro.manage(); }}>
              <Text style={styles.ctaText}>{t("pro.manage")}</Text>
            </Pressable>
          ) : null
        ) : (
          <>
            <Text style={styles.choose}>{t("pro.choosePlan")}</Text>
            {PRO_PLANS.map((plan) => {
              const isSelected = plan === selected;
              return (
                <Pressable
                  key={plan}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => setSelected(plan)}
                  style={[styles.plan, isSelected && styles.planSelected]}
                >
                  <View style={styles.planCopy}>
                    <Text style={[styles.planPrice, isSelected && styles.planPriceSelected]}>
                      {t(`pro.plans.${plan}`, { price: priceOf(plan) })}
                    </Text>
                    {plan === "yearly" ? (
                      <Text style={styles.planNote}>
                        {intro ? t("pro.trial", { count: intro.periodValue * intro.periodCount }) : t("pro.save", { percent: savings })}
                      </Text>
                    ) : plan === "lifetime" ? (
                      <Text style={styles.planNote}>{t("pro.oncePayment")}</Text>
                    ) : null}
                  </View>
                  <Ionicons
                    name={isSelected ? "checkmark-circle-outline" : "ellipse-outline"}
                    size={28}
                    color={isSelected ? c.teal : c.muted}
                  />
                </Pressable>
              );
            })}

            <Pressable
              accessibilityRole="button"
              disabled={busy !== null}
              onPress={handleBuy}
              style={[styles.cta, busy !== null && styles.ctaBusy]}
            >
              {busy === "buy" ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.ctaText}>{selected === "lifetime" ? t("pro.buyLifetime") : t("pro.subscribe")}</Text>
              )}
            </Pressable>

            <Text style={styles.fine}>
              {selected === "lifetime"
                ? t("pro.fineLifetime", { price: priceOf("lifetime") })
                : t("pro.fineSubscription", {
                    price: priceOf(selected),
                    period: t(selected === "yearly" ? "pro.periodYear" : "pro.periodMonth"),
                  })}
            </Text>
          </>
        )}

        <Text style={styles.legal}>
          {t("pro.legalLead")}{" "}
          <Text style={styles.link} onPress={() => navigation.navigate("Legal", { doc: "privacy" })}>{t("pro.privacy")}</Text>
          {` ${t("pro.and")} `}
          <Text style={styles.link} onPress={() => navigation.navigate("Legal", { doc: "terms" })}>{t("pro.terms")}</Text>
        </Text>
      </ScrollView>
    </View>
  );
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    topBar: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
    circleButton: { alignItems: "center", backgroundColor: c.surfaceAlt, borderRadius: 22, height: 44, justifyContent: "center", width: 44 },
    topTitle: { color: c.ink, fontFamily: fonts.body, fontSize: 18, fontWeight: "800" },
    topSpacer: { width: 44 },
    restoreButton: { alignItems: "center", backgroundColor: c.surfaceAlt, borderRadius: radii.pill, height: 44, justifyContent: "center", minWidth: 44, paddingHorizontal: 16 },
    restoreText: { color: c.teal, fontFamily: fonts.body, fontSize: 16, fontWeight: "800" },
    scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, maxWidth: 640, width: "100%", alignSelf: "center" },
    headline: { color: c.ink, fontFamily: fonts.display, fontSize: 26, lineHeight: 32, textAlign: "center" },
    subhead: { color: c.muted, fontFamily: fonts.bodyRegular, fontSize: 15, marginTop: 6, textAlign: "center" },
    features: { gap: spacing.md, marginTop: spacing.lg },
    featureRow: { borderRadius: radii.md, flexDirection: "row", gap: spacing.md, padding: spacing.sm },
    featureRowHighlighted: { backgroundColor: withAlpha(c.teal, 0.12) },
    featureIcon: { alignItems: "center", backgroundColor: withAlpha(c.teal, 0.14), borderRadius: 24, height: 48, justifyContent: "center", width: 48 },
    featureCopy: { flex: 1 },
    featureTitle: { color: c.ink, fontFamily: fonts.body, fontSize: 17, fontWeight: "800" },
    beta: { color: c.coral, fontFamily: fonts.body, fontSize: 12, fontWeight: "800" },
    featureBody: { color: c.muted, fontFamily: fonts.bodyRegular, fontSize: 15, lineHeight: 21, marginTop: 2 },
    choose: { color: c.muted, fontFamily: fonts.body, fontSize: 16, marginBottom: spacing.sm, marginTop: spacing.xl, textAlign: "center" },
    plan: { alignItems: "center", borderColor: c.border, borderRadius: radii.md, borderWidth: 2, flexDirection: "row", marginBottom: spacing.sm, minHeight: 64, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    planSelected: { borderColor: c.teal },
    planCopy: { flex: 1 },
    planPrice: { color: c.ink, fontFamily: fonts.body, fontSize: 17, fontWeight: "800" },
    planPriceSelected: { color: c.teal },
    planNote: { color: c.muted, fontFamily: fonts.bodyRegular, fontSize: 13, marginTop: 2 },
    cta: { alignItems: "center", backgroundColor: c.teal, borderRadius: radii.md, height: 56, justifyContent: "center", marginTop: spacing.md },
    ctaBusy: { opacity: 0.7 },
    ctaText: { color: "#fff", fontFamily: fonts.body, fontSize: 18, fontWeight: "900" },
    fine: { color: c.muted, fontFamily: fonts.bodyRegular, fontSize: 12, lineHeight: 17, marginTop: spacing.md, textAlign: "center" },
    legal: { color: c.muted, fontFamily: fonts.bodyRegular, fontSize: 13, lineHeight: 19, marginTop: spacing.md, textAlign: "center" },
    link: { color: c.teal, fontFamily: fonts.body },
  });
}
