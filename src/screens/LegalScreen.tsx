/**
 * LegalScreen — in-app Privacy Policy & Terms of Use.
 * Rendered natively (no broken external links, works offline).
 * Fully localized: every heading and body comes from the i18n tree, because
 * the app ships in English and Spanish and a policy nobody can read is not one.
 */
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { useLayoutEffect, useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useI18n } from "../i18n/LocalizationContext";
import { RootStackParamList } from "../navigation/types";
import { AppColors, fonts, spacing } from "../theme/theme";
import { useColors } from "../theme/ThemeContext";
import { PRIVACY_SECTION_IDS, TERMS_SECTION_IDS } from "./legalSections";

type LegalRoute = RouteProp<RootStackParamList, "Legal">;

type Section = { heading: string; body: string };

export function LegalScreen() {
  const { params } = useRoute<LegalRoute>();
  const navigation = useNavigation();
  const c = useColors();
  const { t } = useI18n();
  const styles = useMemo(() => createStyles(c), [c]);

  const isPrivacy = params.doc === "privacy";
  const title = isPrivacy ? t("legal.privacyTitle") : t("legal.termsTitle");
  const group = isPrivacy ? "privacy" : "terms";
  const ids: readonly string[] = isPrivacy ? PRIVACY_SECTION_IDS : TERMS_SECTION_IDS;
  const sections: Section[] = ids.map((id) => ({
    heading: t(`legal.${group}.${id}Heading`),
    body: t(`legal.${group}.${id}Body`),
  }));

  useLayoutEffect(() => {
    // Body carries the big title — keep the nav bar minimal
    navigation.setOptions({ title: "" });
  }, [navigation, title]);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.pageTitle}>{title}</Text>
      <Text style={styles.updated}>{t("legal.lastUpdated", { date: t("legal.lastUpdatedDate") })}</Text>
      <View style={styles.titleRule} />

      {/* Document style — continuous prose, no boxed cards */}
      {sections.map((section, index) => (
        <View key={section.heading} style={index > 0 ? styles.section : undefined}>
          <Text style={styles.sectionHeading}>{section.heading}</Text>
          <Text style={styles.sectionBody}>{section.body}</Text>
        </View>
      ))}

      <View style={styles.footerRule} />
      <Text style={styles.footerNote}>Bookliz · enrique.padron853@gmail.com</Text>
      {isPrivacy ? <Text style={styles.footerNote}>{t("legal.fullPolicy")}</Text> : null}
    </ScrollView>
  );
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    root: { backgroundColor: c.bg, flex: 1 },
    content: { padding: spacing.md, paddingBottom: 60 },
    pageTitle: {
      color: c.ink,
      fontFamily: fonts.display,
      fontSize: 28,
      fontWeight: "900",
    },
    updated: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 12,
      fontWeight: "700",
      marginTop: 6,
    },
    titleRule: {
      backgroundColor: c.border,
      height: 1,
      marginBottom: spacing.lg,
      marginTop: spacing.md,
    },
    section: {
      marginTop: spacing.lg,
    },
    sectionHeading: {
      color: c.ink,
      fontFamily: fonts.display,
      fontSize: 17,
      fontWeight: "800",
      marginBottom: 6,
    },
    sectionBody: {
      color: c.muted,
      fontFamily: fonts.bodyRegular,
      fontSize: 15,
      lineHeight: 24,
    },
    footerRule: {
      backgroundColor: c.border,
      height: 1,
      marginBottom: spacing.md,
      marginTop: spacing.xl,
    },
    footerNote: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 12,
      fontWeight: "700",
      opacity: 0.7,
      textAlign: "center",
    },
  });
}
