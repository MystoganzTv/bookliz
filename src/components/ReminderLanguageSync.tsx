import { useEffect } from "react";
import { useI18n } from "../i18n/LocalizationContext";
import { syncReminderLanguage } from "../utils/notificationService";

/**
 * Keeps the daily reading reminder in the app's language. iOS freezes a
 * scheduled notification's text, so a language change has to reschedule it.
 */
export function ReminderLanguageSync() {
  const { locale } = useI18n();
  useEffect(() => {
    void syncReminderLanguage(locale);
  }, [locale]);
  return null;
}
