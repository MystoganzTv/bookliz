/**
 * publicationYear — the first-publication year a search row may show.
 *
 * Open Library's `first_publish_year` is just the minimum of every edition's
 * year, so one mis-catalogued edition drags the whole work back in time:
 * Baldacci's "The Escape" (2014) comes back as 1970 because a single record
 * says so — its edition years are [1970, 2014, 2015, 2018, 2019, 2020].
 *
 * Rule: the earliest year is an outlier when it sits far before a tight,
 * well-supported cluster of later years — more than 10 years before the next
 * one AND more than twice as far as that cluster is wide, with at least three
 * later years backing the cluster. Genuinely old works with a long publishing
 * history (Moby Dick: 1851, then 1892 … 2024) keep their year, because their
 * later years span far more than the gap. Two lonely years (1965, 2020) are
 * not enough evidence to overrule the catalogue, so they are left alone.
 *
 * Pure, no React.
 */
export function credibleFirstPublishYear(
  firstPublishYear: number | undefined,
  editionYears: number[] | undefined
): number | undefined {
  const years = Array.from(
    new Set((editionYears ?? []).filter((year) => Number.isInteger(year) && year > 0))
  ).sort((a, b) => a - b);
  if (years.length < 4) return firstPublishYear ?? years[0];

  let index = 0;
  // Peel off outliers one at a time (a record could be wrong twice: 1900, 1970, 2014 …).
  while (years.length - index >= 4) {
    const candidate = years[index];
    const rest = years.slice(index + 1);
    const gap = rest[0] - candidate;
    const span = rest[rest.length - 1] - rest[0];
    if (gap > 10 && gap > span * 2) index += 1;
    else break;
  }

  const earliest = years[index];
  if (firstPublishYear === undefined) return earliest;
  // Only ever move the year forward, and only past years we just ruled out.
  return firstPublishYear < earliest ? earliest : firstPublishYear;
}
