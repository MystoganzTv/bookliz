/**
 * Local-date helpers. `toISOString()` is UTC, so "today" computed from it is
 * wrong for anyone reading in the evening west of Greenwich (or the morning
 * east of it). These helpers always work in the device's local time zone.
 */

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Local calendar date as "YYYY-MM-DD". */
export const localDateKey = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** Parse a "YYYY-MM-DD" key as local midnight. Returns null when malformed or not a real date. */
export const parseDateKey = (key: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const day = Number(key.slice(8, 10));
  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
};

/** The "YYYY-MM-DD" key `days` calendar days away (negative = earlier). Returns the input when it is malformed. */
export const shiftDateKey = (key: string, days: number): string => {
  const date = parseDateKey(key);
  if (!date) return key;
  date.setDate(date.getDate() + days);
  return localDateKey(date);
};

/** BCP-47 tag for the app's two languages, for toLocaleDateString. */
export const dateLocaleTag = (locale: "en" | "es"): string => (locale === "es" ? "es-ES" : "en-US");

/**
 * A stored "YYYY-MM-DD" (or full ISO) date as people read it: "Nov 16, 2026" /
 * "16 nov 2026". Anything that is not a date comes back unchanged.
 */
export const formatDateKey = (
  value: string,
  locale: "en" | "es",
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }
): string => {
  const date = parseDateKey(value.slice(0, 10));
  return date ? date.toLocaleDateString(dateLocaleTag(locale), options) : value;
};

const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ES_MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const EN_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ES_WEEKDAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/**
 * The stats are computed with English short labels ("Nov", "Mon"); these turn
 * them into the reader's language at render time. Unknown labels pass through.
 */
export const localizeMonthLabel = (label: string, locale: "en" | "es"): string => {
  const index = EN_MONTHS.indexOf(label);
  return locale === "es" && index >= 0 ? ES_MONTHS[index] : label;
};

export const localizeWeekdayLabel = (label: string, locale: "en" | "es"): string => {
  const index = EN_WEEKDAYS.indexOf(label);
  return locale === "es" && index >= 0 ? ES_WEEKDAYS[index] : label;
};
