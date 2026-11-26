/**
 * Bookliz notification service — local daily reading reminders.
 *
 * Uses expo-notifications for scheduling. Push tokens are NOT needed;
 * these are all local (device-only) notifications.
 *
 * Storage key: @bookliz/notificationPrefs
 * Schema: { enabled: boolean; hour: number; minute: number; locale?: "en" | "es" }
 *
 * iOS stores a scheduled notification's text when it is scheduled, so the
 * reminder is written in the app's language at that moment and rescheduled by
 * syncReminderLanguage when the language changes.
 */
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppLocale, translations } from "../i18n/translations";

export const NOTIFICATION_PREFS_KEY = "@bookliz/notificationPrefs";
const PREFS_KEY = NOTIFICATION_PREFS_KEY;
const CHANNEL_ID = "bookliz-reading-reminder";
const NOTIFICATION_ID = "daily-reading-reminder";

export type NotificationPrefs = {
  enabled: boolean;
  hour: number;   // 0–23
  minute: number; // 0–59
  /** Language the scheduled reminder was written in. */
  locale?: AppLocale;
};

const DEFAULT_PREFS: NotificationPrefs = {
  enabled: false,
  hour: 20,
  minute: 0,
};

// ─── Prefs persistence ────────────────────────────────────────────────────────

export async function loadNotificationPrefs(): Promise<NotificationPrefs> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<NotificationPrefs>) };
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function saveNotificationPrefs(prefs: NotificationPrefs): Promise<void> {
  await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

// ─── Permission ───────────────────────────────────────────────────────────────

export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

export async function getNotificationPermissionStatus(): Promise<"granted" | "denied" | "undetermined"> {
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

// ─── Android channel setup ────────────────────────────────────────────────────

export async function ensureNotificationChannel(): Promise<void> {
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Daily Reading Reminder",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#14B8A6",
    sound: "default",
  });
}

// ─── Schedule / cancel ────────────────────────────────────────────────────────

const REMINDER_COUNT = 4;

/** The reminder texts in one language, read from the translation table. */
export function reminderMessages(locale: AppLocale): { title: string; body: string }[] {
  const table = (translations[locale] ?? translations.en).notifications as Record<string, string>;
  const fallback = translations.en.notifications as Record<string, string>;
  return Array.from({ length: REMINDER_COUNT }, (_, index) => {
    const n = index + 1;
    return {
      title: table[`reminder${n}Title`] ?? fallback[`reminder${n}Title`],
      body: table[`reminder${n}Body`] ?? fallback[`reminder${n}Body`],
    };
  });
}

/** Schedule (or re-schedule) the daily reading reminder for the given time. */
export async function scheduleDailyReminder(hour: number, minute: number, locale: AppLocale = "en"): Promise<void> {
  // Cancel any existing instance first
  await cancelDailyReminder();

  // Pick a random message each scheduling cycle
  const messages = reminderMessages(locale);
  const msg = messages[Math.floor(Math.random() * messages.length)];

  await Notifications.scheduleNotificationAsync({
    identifier: NOTIFICATION_ID,
    content: {
      title: msg.title,
      body: msg.body,
      sound: "default",
      data: { type: "daily-reading-reminder" },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
}

/** Cancel the standing daily reminder. */
export async function cancelDailyReminder(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID);
  } catch {
    // May throw if notification doesn't exist — safe to ignore
  }
}

// ─── Toggle helper (used by Settings) ────────────────────────────────────────

/**
 * Enable or disable the daily reminder.
 * Returns the resulting prefs (useful if permission was denied).
 */
export async function setReminderEnabled(
  enabled: boolean,
  hour = DEFAULT_PREFS.hour,
  minute = DEFAULT_PREFS.minute,
  locale: AppLocale = "en"
): Promise<{ prefs: NotificationPrefs; permissionGranted: boolean }> {
  if (enabled) {
    const granted = await requestNotificationPermission();
    if (!granted) {
      return { prefs: { enabled: false, hour, minute }, permissionGranted: false };
    }
    await ensureNotificationChannel();
    await scheduleDailyReminder(hour, minute, locale);
    const prefs: NotificationPrefs = { enabled: true, hour, minute, locale };
    await saveNotificationPrefs(prefs);
    return { prefs, permissionGranted: true };
  } else {
    await cancelDailyReminder();
    const prefs: NotificationPrefs = { enabled: false, hour, minute };
    await saveNotificationPrefs(prefs);
    return { prefs, permissionGranted: true };
  }
}

/**
 * Rewrites a standing reminder in the app's current language. Does nothing
 * when reminders are off, already in that language, or no longer permitted.
 * Reminders scheduled before this existed have no locale and get rewritten once.
 */
export async function syncReminderLanguage(locale: AppLocale): Promise<void> {
  try {
    const prefs = await loadNotificationPrefs();
    if (!prefs.enabled || prefs.locale === locale) return;
    if ((await getNotificationPermissionStatus()) !== "granted") return;
    await scheduleDailyReminder(prefs.hour, prefs.minute, locale);
    await saveNotificationPrefs({ ...prefs, locale });
  } catch {
    // Best effort: the old reminder keeps firing in its old language.
  }
}

// ─── Format helper ────────────────────────────────────────────────────────────

/** Format hour+minute as "8:00 PM" / "20:00" depending on locale preference. */
export function formatReminderTime(hour: number, minute: number): string {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
