import { Ionicons } from "@expo/vector-icons";
import { useDialog } from "../components/DialogProvider";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { RootStackParamList } from "../navigation/types";
import { GoogleConnectionCard } from "../components/GoogleConnectionCard";
import { Screen } from "../components/Screen";
import { useBookliz } from "../data/BooklizContext";
import { useI18n } from "../i18n/LocalizationContext";
import { useTheme } from "../theme/ThemeContext";
import { AppColors, fonts, radii, shadows, spacing } from "../theme/theme";
import {
  formatReminderTime,
  loadNotificationPrefs,
  NotificationPrefs,
  setReminderEnabled,
} from "../utils/notificationService";

export function SettingsScreen() {
  const { colors: c, isDark, toggleTheme } = useTheme();
  const { locale, setLocale, t } = useI18n();
  const {
    resetApp,
    clearLibrary,
    userProfile,
    books,
    readingSessions,
    conflictBackup,
    restoreConflictBackup,
    discardConflictBackup,
  } = useBookliz();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const dialog = useDialog();
  const styles = useMemo(() => createStyles(c), [c]);

  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>({ enabled: false, hour: 20, minute: 0 });

  useEffect(() => {
    void loadNotificationPrefs().then(setNotifPrefs);
  }, []);

  const handleToggleNotification = useCallback(async (value: boolean) => {
    const { prefs, permissionGranted } = await setReminderEnabled(value, notifPrefs.hour, notifPrefs.minute);
    setNotifPrefs(prefs);
    if (!permissionGranted) {
      dialog.alert(t("notifications.permissionDenied"), t("notifications.permissionDeniedBody"));
    }
  }, [notifPrefs.hour, notifPrefs.minute, t]);

  const themeTitle = isDark ? t("settings.themeDarkTitle") : t("settings.themeLightTitle");
  const themeBody = isDark ? t("settings.themeDarkBody") : t("settings.themeLightBody");

  // ── Recovered copy (a snapshot a sync conflict had to set aside) ─────────
  const backupDate = conflictBackup ? formatBackupDate(conflictBackup.backedUpAt, locale) : "";

  const handleRestoreBackup = useCallback(async () => {
    try {
      await restoreConflictBackup();
      dialog.alert(t("backup.restoredTitle"), t("backup.restoredBody"));
    } catch (error) {
      // Never let a failed restore look like a successful one: nothing was
      // replaced, and the user needs to know why.
      dialog.alert(
        t("backup.failedTitle"),
        t("backup.failedBody", { error: error instanceof Error ? error.message : String(error) })
      );
    }
  }, [dialog, restoreConflictBackup, t]);

  const handleDiscardBackup = useCallback(async () => {
    try {
      await discardConflictBackup();
    } catch (error) {
      dialog.alert(
        t("backup.discardFailedTitle"),
        t("backup.failedBody", { error: error instanceof Error ? error.message : String(error) })
      );
    }
  }, [dialog, discardConflictBackup, t]);

  return (
    <Screen>
      <View style={styles.pageHeader}>
        <Text style={styles.eyebrow}>{t("settings.eyebrow")}</Text>
        <Text style={styles.title}>{t("settings.title")}</Text>
        <Text style={styles.subtitle}>{t("settings.subtitle")}</Text>
      </View>

      {/* ── Connected identity ─────────────────────────────────────────── */}
      <View style={styles.identityCard}>
        <View style={styles.identityAvatar}>
          {userProfile.avatarUri ? (
            <Image source={{ uri: userProfile.avatarUri }} style={styles.identityAvatarImage} />
          ) : (
            <Text style={styles.identityAvatarInitials}>{userProfile.avatarInitials ?? "?"}</Text>
          )}
        </View>
        <View style={styles.identityCopy}>
          <Text style={styles.identityName} numberOfLines={1}>
            {userProfile.name || "Your account"}
          </Text>
          {userProfile.email ? (
            <Text style={styles.identityEmail} numberOfLines={1}>{userProfile.email}</Text>
          ) : (
            <Text style={styles.identityEmailMuted}>No account connected</Text>
          )}
        </View>
        {userProfile.email ? (
          <View style={styles.identityBadge}>
            <Ionicons name="checkmark-circle" size={14} color={c.teal} />
            <Text style={styles.identityBadgeText}>Connected</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIconWrap}>
            <Ionicons name={isDark ? "moon" : "sunny-outline"} size={18} color={isDark ? c.gold : c.tealDark} />
          </View>
          <View style={styles.sectionCopy}>
            <Text style={styles.sectionTitle}>{t("settings.appearanceTitle")}</Text>
            <Text style={styles.sectionBody}>{t("settings.appearanceBody")}</Text>
          </View>
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingCopy}>
            <Text style={styles.settingTitle}>{themeTitle}</Text>
            <Text style={styles.settingSub}>{themeBody}</Text>
          </View>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: isDark }}
            onPress={toggleTheme}
            style={[styles.themeToggle, isDark && styles.themeToggleActive]}
          >
            <View style={[styles.themeToggleThumb, isDark && styles.themeToggleThumbActive]}>
              <Ionicons
                name={isDark ? "moon" : "sunny-outline"}
                size={14}
                color={isDark ? c.tealDark : c.navy}
              />
            </View>
          </Pressable>
        </View>
      </View>

      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIconWrap}>
            <Ionicons name="language-outline" size={18} color={c.tealDark} />
          </View>
          <View style={styles.sectionCopy}>
            <Text style={styles.sectionTitle}>{t("settings.languageTitle")}</Text>
            <Text style={styles.sectionBody}>{t("settings.languageBody")}</Text>
          </View>
        </View>

        <View style={styles.languageRow}>
          <Pressable accessibilityRole="button"
            style={[styles.languageChip, locale === "en" && styles.languageChipActive]}
            onPress={() => setLocale("en")}
          >
            <Text style={[styles.languageChipText, locale === "en" && styles.languageChipTextActive]}>
              {t("common.english")}
            </Text>
          </Pressable>
          <Pressable accessibilityRole="button"
            style={[styles.languageChip, locale === "es" && styles.languageChipActive]}
            onPress={() => setLocale("es")}
          >
            <Text style={[styles.languageChipText, locale === "es" && styles.languageChipTextActive]}>
              {t("common.spanish")}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Notifications card */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIconWrap}>
            <Ionicons name="notifications-outline" size={18} color={c.tealDark} />
          </View>
          <View style={styles.sectionCopy}>
            <Text style={styles.sectionTitle}>{t("notifications.settingsTitle")}</Text>
            <Text style={styles.sectionBody}>{t("notifications.settingsBody")}</Text>
          </View>
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingCopy}>
            <Text style={styles.settingTitle}>{t("notifications.enableLabel")}</Text>
            <Text style={styles.settingSub}>
              {notifPrefs.enabled
                ? t("notifications.scheduled").replace("{time}", formatReminderTime(notifPrefs.hour, notifPrefs.minute))
                : t("notifications.enableSub")}
            </Text>
          </View>
          <Switch
            value={notifPrefs.enabled}
            onValueChange={(v) => { void handleToggleNotification(v); }}
            trackColor={{ false: c.border, true: c.teal + "80" }}
            thumbColor={notifPrefs.enabled ? c.tealDark : c.muted}
          />
        </View>
      </View>

      <View style={styles.sectionWrap}>
        <Text style={styles.sectionEyebrow}>{t("settings.accountTitle")}</Text>
        <Text style={styles.sectionHint}>{t("settings.accountBody")}</Text>
      </View>
      <GoogleConnectionCard variant="settings" />

      {/* ── Legal ─────────────────────────────────────────────────────────── */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIconWrap}>
            <Ionicons name="document-text-outline" size={18} color={c.tealDark} />
          </View>
          <View style={styles.sectionCopy}>
            <Text style={styles.sectionTitle}>Legal</Text>
            <Text style={styles.sectionBody}>Privacy policy and terms of use.</Text>
          </View>
        </View>

        <Pressable accessibilityRole="button"
          style={styles.linkRow}
          onPress={() => navigation.navigate("Legal", { doc: "privacy" })}
        >
          <Text style={styles.linkRowText}>{t("legal.privacyTitle")}</Text>
          <Ionicons name="chevron-forward" size={14} color={c.muted} />
        </Pressable>
        <Pressable accessibilityRole="button"
          style={styles.linkRow}
          onPress={() => navigation.navigate("Legal", { doc: "terms" })}
        >
          <Text style={styles.linkRowText}>{t("legal.termsTitle")}</Text>
          <Ionicons name="chevron-forward" size={14} color={c.muted} />
        </Pressable>
      </View>

      {/* ── Recovered copy ────────────────────────────────────────────────
          Only rendered when a snapshot is actually parked. Sync conflicts are
          resolved at snapshot level, so one side is always discarded; this is
          the way back to it. */}
      {conflictBackup ? (
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconWrap}>
              <Ionicons name="archive-outline" size={18} color={c.tealDark} />
            </View>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionTitle}>{t("backup.title")}</Text>
              <Text style={styles.sectionBody}>{t("backup.body")}</Text>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            style={styles.settingRow}
            onPress={() =>
              dialog.confirm({
                title: t("backup.restoreTitle"),
                body: t("backup.restoreBody", {
                  date: backupDate,
                  books: conflictBackup.bookCount,
                  sessions: conflictBackup.sessionCount,
                  currentBooks: books.length,
                  currentSessions: readingSessions.length,
                }),
                confirmLabel: t("backup.restoreConfirm"),
                destructive: true,
                onConfirm: () => {
                  void handleRestoreBackup();
                },
              })
            }
          >
            <View style={styles.settingCopy}>
              <Text style={styles.settingTitle}>{t("backup.restore")}</Text>
              <Text style={styles.settingSub}>
                {t("backup.summary", {
                  date: backupDate,
                  books: conflictBackup.bookCount,
                  sessions: conflictBackup.sessionCount,
                })}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={c.muted} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            style={styles.backupDiscardRow}
            onPress={() =>
              dialog.confirm({
                title: t("backup.discardTitle"),
                body: t("backup.discardBody", { date: backupDate }),
                confirmLabel: t("backup.discardConfirm"),
                destructive: true,
                onConfirm: () => {
                  void handleDiscardBackup();
                },
              })
            }
          >
            <Ionicons name="close-circle-outline" size={15} color={c.muted} />
            <Text style={styles.backupDiscardText}>{t("backup.discard")}</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.dangerSection}>
        <Text style={styles.dangerEyebrow}>{t("settings.dangerEyebrow")}</Text>
        <Text style={styles.dangerTitle}>{t("settings.dangerTitle")}</Text>
        <Text style={styles.dangerBody}>{t("settings.dangerBody")}</Text>

        {/* Clear library — lighter action, keeps account + profile */}
        <Pressable accessibilityRole="button"
          style={styles.clearDemoButton}
          onPress={() =>
            dialog.confirm({
              title: t("settings.clearLibraryTitle"),
              body: t("settings.clearLibraryBody"),
              confirmLabel: t("settings.clearLibraryConfirm"),
              destructive: true,
              onConfirm: () => { void clearLibrary(); },
            })
          }
        >
          <Ionicons name="trash-outline" size={16} color={c.muted} />
          <Text style={styles.clearDemoButtonText}>{t("settings.clearLibrary")}</Text>
        </Pressable>

        <Pressable accessibilityRole="button"
          style={[styles.dangerButton, { marginTop: spacing.sm }]}
          onPress={() =>
            dialog.confirm({
              title: t("settings.deletePromptTitle"),
              body: t("settings.deletePromptBody"),
              confirmLabel: t("settings.deleteConfirm"),
              destructive: true,
              onConfirm: () => { void resetApp(); },
            })
          }
        >
          <Ionicons name="trash-outline" size={16} color={c.danger} />
          <Text style={styles.dangerButtonText}>{t("settings.dangerButton")}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

/**
 * Same approach as ProfileScreen's sync timestamp: format in the ACTIVE locale
 * rather than a hardcoded en-US, and keep the time — two backups on the same
 * day are otherwise indistinguishable.
 */
function formatBackupDate(timestamp: string, locale: string) {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return timestamp;
  return parsed.toLocaleString(locale === "es" ? "es-ES" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    pageHeader: {
      marginBottom: spacing.md,
    },
    identityCard: {
      ...shadows.card,
      alignItems: "center",
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: radii.lg,
      borderWidth: 1,
      flexDirection: "row",
      gap: spacing.md,
      marginBottom: spacing.lg,
      padding: spacing.md,
    },
    identityAvatar: {
      alignItems: "center",
      backgroundColor: c.teal + "22",
      borderRadius: radii.pill,
      height: 48,
      justifyContent: "center",
      width: 48,
    },
    identityAvatarImage: {
      borderRadius: radii.pill,
      height: 48,
      width: 48,
    },
    identityAvatarInitials: {
      color: c.tealDark,
      fontFamily: fonts.body,
      fontSize: 18,
      fontWeight: "900",
    },
    identityCopy: {
      flex: 1,
    },
    identityName: {
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 15,
      fontWeight: "800",
    },
    identityEmail: {
      color: c.muted,
      fontFamily: fonts.bodyRegular,
      fontSize: 12,
      marginTop: 2,
    },
    identityEmailMuted: {
      color: c.muted,
      fontFamily: fonts.bodyRegular,
      fontSize: 12,
      marginTop: 2,
    },
    identityBadge: {
      alignItems: "center",
      backgroundColor: c.teal + "16",
      borderColor: c.teal + "40",
      borderRadius: radii.pill,
      borderWidth: 1,
      flexDirection: "row",
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    identityBadgeText: {
      color: c.tealDark,
      fontFamily: fonts.body,
      fontSize: 11,
      fontWeight: "700",
    },
    backupDiscardRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 6,
      justifyContent: "center",
      marginTop: spacing.sm,
      minHeight: 44,
      paddingVertical: 10,
    },
    backupDiscardText: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: "700",
    },
    clearDemoButton: {
      alignItems: "center",
      backgroundColor: c.surfaceAlt,
      borderColor: c.border,
      borderRadius: radii.md,
      borderWidth: 1,
      flexDirection: "row",
      gap: spacing.sm,
      justifyContent: "center",
      paddingVertical: 13,
    },
    clearDemoButtonText: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 14,
      fontWeight: "700",
    },
    eyebrow: {
      color: c.tealDark,
      fontFamily: fonts.body,
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 1.3,
      textTransform: "uppercase",
    },
    title: {
      color: c.ink,
      fontFamily: fonts.display,
      fontSize: 28,
      fontWeight: "900",
      marginTop: 2,
    },
    subtitle: {
      color: c.muted,
      fontFamily: fonts.bodyRegular,
      fontSize: 14,
      lineHeight: 21,
      marginTop: spacing.xs,
    },
    sectionCard: {
      ...shadows.card,
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: radii.lg,
      borderWidth: 1,
      marginBottom: spacing.md,
      padding: spacing.md,
    },
    sectionHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    sectionIconWrap: {
      alignItems: "center",
      backgroundColor: c.surfaceAlt,
      borderRadius: radii.pill,
      height: 38,
      justifyContent: "center",
      width: 38,
    },
    sectionCopy: {
      flex: 1,
    },
    sectionTitle: {
      color: c.ink,
      fontFamily: fonts.display,
      fontSize: 21,
      fontWeight: "900",
    },
    sectionBody: {
      color: c.muted,
      fontFamily: fonts.bodyRegular,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 3,
    },
    settingRow: {
      alignItems: "center",
      backgroundColor: c.surfaceAlt,
      borderColor: c.border,
      borderRadius: radii.md,
      borderWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
    },
    settingCopy: {
      flex: 1,
      paddingRight: spacing.md,
    },
    settingTitle: {
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 14,
      fontWeight: "900",
    },
    settingSub: {
      color: c.muted,
      fontFamily: fonts.bodyRegular,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 4,
    },
    themeToggle: {
      backgroundColor: c.border,
      borderColor: c.border,
      borderRadius: radii.pill,
      borderWidth: 1,
      height: 40,
      justifyContent: "center",
      paddingHorizontal: 4,
      width: 72,
    },
    themeToggleActive: {
      backgroundColor: c.teal + "28",
      borderColor: c.teal + "55",
    },
    themeToggleThumb: {
      alignItems: "center",
      backgroundColor: c.surface,
      borderRadius: radii.pill,
      height: 30,
      justifyContent: "center",
      transform: [{ translateX: 0 }],
      width: 30,
    },
    themeToggleThumbActive: {
      backgroundColor: c.surface,
      transform: [{ translateX: 32 }],
    },
    languageRow: {
      flexDirection: "row",
      gap: spacing.sm,
    },
    languageChip: {
      backgroundColor: c.surfaceAlt,
      borderColor: c.border,
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
    },
    languageChipActive: {
      backgroundColor: c.teal + "18",
      borderColor: c.teal + "44",
    },
    languageChipText: {
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: "800",
    },
    languageChipTextActive: {
      color: c.tealDark,
    },
    sectionWrap: {
      marginBottom: spacing.sm,
      marginTop: spacing.sm,
    },
    sectionEyebrow: {
      color: c.tealDark,
      fontFamily: fonts.body,
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 1.3,
      textTransform: "uppercase",
    },
    sectionHint: {
      color: c.muted,
      fontFamily: fonts.bodyRegular,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 6,
    },
    dangerSection: {
      borderTopColor: c.danger + "50",
      borderTopWidth: 1,
      marginBottom: spacing.xl,
      marginTop: spacing.xl,
      paddingTop: spacing.lg,
    },
    dangerEyebrow: {
      color: c.danger,
      fontFamily: fonts.body,
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 1.3,
      textTransform: "uppercase",
    },
    dangerTitle: {
      color: c.ink,
      fontFamily: fonts.display,
      fontSize: 22,
      fontWeight: "900",
      marginBottom: spacing.xs,
      marginTop: 2,
    },
    dangerBody: {
      color: c.muted,
      fontFamily: fonts.bodyRegular,
      fontSize: 13,
      lineHeight: 19,
      marginBottom: spacing.md,
    },
    dangerButton: {
      alignItems: "center",
      backgroundColor: c.danger + "14",
      borderColor: c.danger + "45",
      borderRadius: radii.md,
      borderWidth: 1,
      flexDirection: "row",
      gap: spacing.sm,
      justifyContent: "center",
      paddingVertical: 14,
    },
    dangerButtonText: {
      color: c.danger,
      fontFamily: fonts.body,
      fontSize: 14,
      fontWeight: "900",
    },
    linkRow: {
      alignItems: "center",
      backgroundColor: c.surfaceAlt,
      borderColor: c.border,
      borderRadius: radii.md,
      borderWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      minHeight: 44,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
    },
    linkRowText: {
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 14,
      fontWeight: "800",
    },
  });
}
