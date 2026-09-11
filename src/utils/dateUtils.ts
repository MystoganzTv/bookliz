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
