/**
 * Settings, as a grouped list.
 *
 * Every row is one line: what it is and its current value. Anything with more
 * than two choices opens its own screen (SettingsChoiceScreen); a yes/no is a
 * Switch on the row. The "why" of a setting is the group footer.
 */
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Application from "expo-application";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAudiobookPlayer } from "../audio/AudiobookPlayerContext";
import { loadIncludeAudioInBackup, setIncludeAudioInBackup } from "../audio/audioBackup";
import { audioFolderSize } from "../audio/audioFiles";
import { formatBytes } from "../audio/audiobookModel";
import { updatePlayerPrefs, usePlayerPrefs } from "../audio/playerPrefs";
import { loadOpeningSoundEnabled, setOpeningSoundEnabled } from "../audio/splashSound";
import { isFileBackupAvailable } from "../../modules/file-backup";
import { onWatchStatus, watchStatus, WatchStatus } from "../../modules/watch-bridge";
import { useDialog } from "../components/DialogProvider";
import { GoogleConnectionCard } from "../components/GoogleConnectionCard";
import { Screen } from "../components/Screen";
import { SettingsGroup, SettingsRow, SettingsToggleRow } from "../components/settings/SettingsList";
import { useBookliz } from "../data/BooklizContext";
import { findContradictedLanguages } from "../data/languageRepair";
import { buildDebugInfo, SUPPORT_EMAIL } from "../support/debugInfo";
import { useI18n } from "../i18n/LocalizationContext";
import { usePro } from "../pro/ProContext";
import { RootStackParamList } from "../navigation/types";
import { useTheme } from "../theme/ThemeContext";
import { AppColors, fonts, radii, spacing } from "../theme/theme";
import {
  formatReminderTime,
  loadNotificationPrefs,
  NotificationPrefs,
  setReminderEnabled,
} from "../utils/notificationService";

export function SettingsScreen() {
  const { colors: c, preference: themePreference, editionPreference } = useTheme();
  const { locale, t } = useI18n();
  const {
    resetApp,
    clearLibrary,
    repositoryStatus,
    userProfile,
    books,
    readingSessions,
    clearBookLanguages,
    conflictBackup,
    restoreConflictBackup,
    discardConflictBackup,
  } = useBookliz();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const dialog = useDialog();
  const audioPlayer = useAudiobookPlayer();
  const playerPrefs = usePlayerPrefs();
  const pro = usePro();
  const styles = useMemo(() => createStyles(c), [c]);

  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>({ enabled: false, hour: 20, minute: 0 });

  useEffect(() => {
    void loadNotificationPrefs().then(setNotifPrefs);
  }, []);

  // ── The chime when the app opens (on by default) ─────────────────────────
  const [openingSound, setOpeningSound] = useState(true);
  useEffect(() => {
    void loadOpeningSoundEnabled().then(setOpeningSound);
  }, []);

  // ── Audiobooks in the iCloud device backup (off by default) ──────────────
  const [audioInBackup, setAudioInBackup] = useState(false);
  useEffect(() => {
    void loadIncludeAudioInBackup().then(setAudioInBackup);
  }, []);
  const handleAudioBackup = useCallback(async (include: boolean) => {
    setAudioInBackup(include);
    const applied = await setIncludeAudioInBackup(include);
    if (applied === false) {
      setAudioInBackup(!include);
      void setIncludeAudioInBackup(!include);
      dialog.alert(t("settings.audioBackup.failedTitle"), t("settings.audioBackup.failedBody"));
    }
  }, [dialog, t]);
  const audioFolders = useMemo(
    () => Object.values(audioPlayer.library).map((a) => a.folder),
    [audioPlayer.library]
  );
  const audioBytes = useMemo(
    () => audioFolders.reduce((sum, folder) => sum + audioFolderSize(folder), 0),
    [audioFolders]
  );

  const handleToggleNotification = useCallback(async (value: boolean) => {
    const { prefs, permissionGranted } = await setReminderEnabled(value, notifPrefs.hour, notifPrefs.minute);
    setNotifPrefs(prefs);
    if (!permissionGranted) {
      dialog.alert(t("notifications.permissionDenied"), t("notifications.permissionDeniedBody"));
    }
  }, [dialog, notifPrefs.hour, notifPrefs.minute, t]);

  // ── Books the old "default to English" left mislabelled ─────────────────
  // Evidence-based and memoised: only books whose ISBN registration group
  // disagrees with what is stored. See src/data/languageRepair.ts for why the
  // repair clears the value instead of writing the implied one.
  const languageSuspects = useMemo(() => findContradictedLanguages(books), [books]);

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

  // ── Apple Watch (only shown when one is paired) ───────────────────────────
  const [watch, setWatch] = useState<WatchStatus>(() => watchStatus());
  useEffect(() => {
    const sub = onWatchStatus(setWatch);
    return () => sub.remove();
  }, []);

  const versionLine = appVersionLine();

  const debugText = () =>
    buildDebugInfo({
      versionLine,
      locale,
      theme: themePreference,
      books: books.length,
      sessions: readingSessions.length,
      audiobooks: audioFolders.length,
      audioBytes,
      sync: repositoryStatus,
      prefs: playerPrefs,
      watch,
      audioInBackup,
      now: new Date(),
    });

  const emailSupport = () => {
    const subject = encodeURIComponent(`Bookliz — ${versionLine || "support"}`);
    const body = encodeURIComponent(`\n\n\n${debugText()}`);
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`).catch(() =>
      dialog.alert(t("support.noMailTitle"), t("support.noMailBody", { email: SUPPORT_EMAIL }))
    );
  };

  return (
    <Screen>
      {/* ── Who is signed in ─────────────────────────────────────────────── */}
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
            {userProfile.name || t("settings.identityFallbackName")}
          </Text>
          <Text style={styles.identityEmail} numberOfLines={1}>
            {userProfile.email ||
              (userProfile.authProvider
                ? t("settings.identityVia", { provider: userProfile.authProvider === "apple" ? "Apple" : "Google" })
                : t("settings.identityNoAccount"))}
          </Text>
        </View>
        {/* Linked ≠ syncing: the badge says which. Linked comes from the device's
            profile, syncing from a live cloud session — see
            ProfileScreen.getRepositoryCopy for why the two can disagree. */}
        {repositoryStatus.remoteEnabled && repositoryStatus.cloudSignedIn ? (
          <View style={styles.identityBadge}>
            <Ionicons name="cloud-done-outline" size={14} color={c.teal} />
            <Text style={styles.identityBadgeText}>{t("settings.identitySyncing")}</Text>
          </View>
        ) : userProfile.authProvider ? (
          <Pressable
            accessibilityRole="button"
            style={[styles.identityBadge, styles.identityBadgeWarn]}
            onPress={() => dialog.alert(t("profile.cloudSyncPending"), t("profile.cloudSyncPendingBody"))}
          >
            <Ionicons name="cloud-offline-outline" size={14} color={c.coral} />
            <Text style={[styles.identityBadgeText, { color: c.coral }]}>{t("settings.identityNotSyncing")}</Text>
          </Pressable>
        ) : null}
      </View>

      {/* ── Bookliz Pro ───────────────────────────────────────────────────── */}
      <SettingsGroup footer={pro.isPro ? undefined : t("pro.settingsFooter")}>
        <SettingsRow
          title={t("pro.settingsRow")}
          value={pro.isPro ? t("pro.settingsActive") : undefined}
          accessory={pro.isPro ? undefined : <Ionicons name="sparkles" size={18} color={c.gold} />}
          chevron
          onPress={() => navigation.navigate("Paywall")}
        />
      </SettingsGroup>

      {/* ── Appearance ───────────────────────────────────────────────────── */}
      <SettingsGroup header={t("settings.appearanceTitle")}>
        <SettingsRow
          title={t("settings.choice.theme")}
          value={t(`settings.theme.${themePreference}`)}
          onPress={() => navigation.navigate("SettingsChoice", { setting: "theme" })}
        />
        <SettingsRow
          title={t("settings.languageTitle")}
          value={locale === "es" ? t("common.spanish") : t("common.english")}
          onPress={() => navigation.navigate("SettingsChoice", { setting: "language" })}
        />
        <SettingsRow
          title={t("appearancePro.iconTitle")}
          value={pro.isPro ? t(`appearancePro.editions.${editionPreference}`) : t("pro.requiresPro")}
          onPress={() => navigation.navigate("Themes")}
        />
        <SettingsToggleRow
          title={t("settings.openingSound")}
          value={openingSound}
          onValueChange={(v) => {
            setOpeningSound(v);
            void setOpeningSoundEnabled(v);
          }}
        />
      </SettingsGroup>

      {/* ── Playback ─────────────────────────────────────────────────────── */}
      <SettingsGroup header={t("settings.playbackHeader")}>
        <SettingsRow title={t("playerSettings.rowTitle")} onPress={() => navigation.navigate("PlayerSettings")} />
        <SettingsRow
          title={t("settings.choice.keepAwake")}
          value={t(`playerSettings.keepAwake.${playerPrefs.keepAwake}`)}
          onPress={() => navigation.navigate("SettingsChoice", { setting: "keepAwake" })}
        />
      </SettingsGroup>
      <SettingsGroup footer={t("playerSettings.autoplayFooter")}>
        <SettingsToggleRow
          title={t("playerSettings.autoplay")}
          value={playerPrefs.autoplayNext}
          onValueChange={(autoplayNext) => updatePlayerPrefs({ autoplayNext })}
        />
      </SettingsGroup>

      {watch.paired ? (
        <SettingsGroup
          header={t("settings.watch.header")}
          footer={watch.installed ? t("settings.watch.footerInstalled") : t("settings.watch.footerMissing")}
        >
          <SettingsRow
            title={t("settings.watch.row")}
            value={watch.installed ? t("settings.watch.installed") : t("settings.watch.notInstalled")}
          />
        </SettingsGroup>
      ) : null}

      {/* ── Reminders ────────────────────────────────────────────────────── */}
      <SettingsGroup
        header={t("notifications.settingsTitle")}
        footer={
          notifPrefs.enabled
            ? t("notifications.scheduled", { time: formatReminderTime(notifPrefs.hour, notifPrefs.minute) })
            : t("notifications.enableSub")
        }
      >
        <SettingsToggleRow
          title={t("notifications.enableLabel")}
          value={notifPrefs.enabled}
          onValueChange={(v) => { void handleToggleNotification(v); }}
        />
      </SettingsGroup>

      {/* ── Storage ──────────────────────────────────────────────────────── */}
      <SettingsGroup header={t("manageAudio.storageHeader")}>
        <SettingsRow
          title={t("fileManager.title")}
          value={
            audioPlayer.inbox.length > 0
              ? t("fileManager.waiting", { count: audioPlayer.inbox.length })
              : audioBytes > 0 ? formatBytes(audioBytes) : undefined
          }
          onPress={() => navigation.navigate("ManageAudio")}
        />
      </SettingsGroup>

      {/* ── iCloud backup ───────────────────────────────────────────────── */}
      <SettingsGroup
        header={t("settings.audioBackup.header")}
        footer={audioInBackup ? t("settings.audioBackup.footerOn") : t("settings.audioBackup.footerOff")}
      >
        <SettingsToggleRow
          title={t("settings.audioBackup.toggle")}
          value={audioInBackup}
          disabled={!isFileBackupAvailable}
          onValueChange={(v) => { void handleAudioBackup(v); }}
        />
      </SettingsGroup>

      {/* ── Account ──────────────────────────────────────────────────────── */}
      <Text style={styles.looseHeader} accessibilityRole="header">{t("settings.accountTitle")}</Text>
      <View style={styles.accountWrap}>
        <GoogleConnectionCard variant="settings" />
      </View>

      {/* ── Mislabelled languages ─────────────────────────────────────────
          Only rendered when there is actual evidence. Clearing is the repair:
          the ISBN group proves the stored value is doubtful, not what the
          right answer is. */}
      {languageSuspects.length > 0 ? (
        <SettingsGroup header={t("languageRepair.title")} footer={t("languageRepair.body")}>
          <SettingsRow
            title={t("languageRepair.action")}
            subtitle={t("languageRepair.summary", { count: languageSuspects.length })}
            onPress={() =>
              dialog.confirm({
                title: t("languageRepair.confirmTitle"),
                body: t("languageRepair.confirmBody", {
                  count: languageSuspects.length,
                  titles: languageSuspects.slice(0, 3).map((s) => s.title).join(", "),
                }),
                confirmLabel: t("languageRepair.confirmAction"),
                onConfirm: () => clearBookLanguages(languageSuspects.map((s) => s.bookId)),
              })
            }
          />
        </SettingsGroup>
      ) : null}

      {/* ── Recovered copy ────────────────────────────────────────────────
          Only rendered when a snapshot is actually parked. Sync conflicts are
          resolved at snapshot level, so one side is always discarded; this is
          the way back to it. */}
      {conflictBackup ? (
        <SettingsGroup header={t("backup.title")} footer={t("backup.body")}>
          <SettingsRow
            title={t("backup.restore")}
            subtitle={t("backup.summary", {
              date: backupDate,
              books: conflictBackup.bookCount,
              sessions: conflictBackup.sessionCount,
            })}
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
                onConfirm: () => { void handleRestoreBackup(); },
              })
            }
          />
          <SettingsRow
            title={t("backup.discard")}
            destructive
            onPress={() =>
              dialog.confirm({
                title: t("backup.discardTitle"),
                body: t("backup.discardBody", { date: backupDate }),
                confirmLabel: t("backup.discardConfirm"),
                destructive: true,
                onConfirm: () => { void handleDiscardBackup(); },
              })
            }
          />
        </SettingsGroup>
      ) : null}

      {/* ── Support ──────────────────────────────────────────────────────── */}
      <SettingsGroup header={t("support.header")} footer={t("support.footer")}>
        <SettingsRow title={t("support.email")} subtitle={SUPPORT_EMAIL} chevron={false} onPress={emailSupport} />
      </SettingsGroup>

      {/* ── Legal ────────────────────────────────────────────────────────── */}
      {__DEV__ ? (
        <SettingsGroup header="Developer" footer="Development builds only: unlocks every Pro feature without buying, to test them.">
          <SettingsToggleRow title="Pretend Pro is active" value={pro.debugPro} onValueChange={pro.setDebugPro} />
        </SettingsGroup>
      ) : null}

      <SettingsGroup header={t("settings.legalTitle")}>
        <SettingsRow title={t("legal.privacyTitle")} onPress={() => navigation.navigate("Legal", { doc: "privacy" })} />
        <SettingsRow title={t("legal.termsTitle")} onPress={() => navigation.navigate("Legal", { doc: "terms" })} />
      </SettingsGroup>

      {versionLine ? <Text style={styles.version} selectable>{versionLine}</Text> : null}

      {/* ── Danger zone ──────────────────────────────────────────────────── */}
      <SettingsGroup header={t("settings.dangerEyebrow")} footer={t("settings.dangerBody")}>
        <SettingsRow
          title={t("settings.clearLibrary")}
          destructive
          chevron={false}
          onPress={() =>
            dialog.confirm({
              title: t("settings.clearLibraryTitle"),
              body: t("settings.clearLibraryBody"),
              confirmLabel: t("settings.clearLibraryConfirm"),
              destructive: true,
              onConfirm: () => { audioPlayer.engine.removeAllAudio(); void clearLibrary(); },
            })
          }
        />
        <SettingsRow
          title={t("settings.dangerButton")}
          destructive
          chevron={false}
          onPress={() =>
            dialog.confirm({
              title: t("settings.deletePromptTitle"),
              body: t("settings.deletePromptBody"),
              confirmLabel: t("settings.deleteConfirm"),
              destructive: true,
              onConfirm: () => { audioPlayer.engine.removeAllAudio(); void resetApp(); },
            })
          }
        />
      </SettingsGroup>
    </Screen>
  );
}

/**
 * "Bookliz 1.1.2 (14) · iOS 26.6.2" — the line a support email needs first.
 * Read from the binary (expo-application), not app.json: with EAS remote
 * versioning the build number in app.json is not the one that shipped.
 */
export function appVersionLine(): string {
  const version = Application.nativeApplicationVersion;
  if (!version) return "";
  const build = Application.nativeBuildVersion;
  const os = Platform.OS === "ios" ? `iOS ${Platform.Version}` : Platform.OS === "android" ? `Android ${Platform.Version}` : "";
  return [`Bookliz ${version}${build ? ` (${build})` : ""}`, os].filter(Boolean).join(" · ");
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
    identityCard: {
      alignItems: "center",
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: spacing.md,
      marginBottom: spacing.lg,
      marginTop: spacing.sm,
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
      fontSize: 16,
      fontWeight: "800",
    },
    identityEmail: {
      color: c.muted,
      fontFamily: fonts.bodyRegular,
      fontSize: 13,
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
    identityBadgeWarn: {
      backgroundColor: c.coral + "14",
      borderColor: c.coral + "55",
    },
    identityBadgeText: {
      color: c.tealDark,
      fontFamily: fonts.body,
      fontSize: 11,
      fontWeight: "700",
    },
    looseHeader: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: "700",
      marginBottom: 7,
      paddingHorizontal: spacing.md,
    },
    accountWrap: {
      marginBottom: spacing.lg,
    },
    version: {
      color: c.muted,
      fontFamily: fonts.bodyRegular,
      fontSize: 12.5,
      marginBottom: spacing.lg,
      marginTop: -spacing.sm,
      paddingHorizontal: spacing.md,
    },
  });
}
