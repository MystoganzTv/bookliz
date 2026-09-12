/**
 * Minutes, written the way a listener says them.
 *
 * Not localised beyond the unit letters on purpose: "3h 20m" is read the same
 * in both of this app's languages, and an hours-and-minutes phrase built by
 * hand per locale is a translation bug waiting for the first long audiobook.
 */
export function formatMinutes(totalMinutes: number, unitHour = "h", unitMinute = "m"): string {
  const safe = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  if (!hours) return `${minutes}${unitMinute}`;
  if (!minutes) return `${hours}${unitHour}`;
  return `${hours}${unitHour} ${minutes}${unitMinute}`;
}
