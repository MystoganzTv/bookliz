/**
 * Favourite authors and genres: the pure rules, so the editor and the profile
 * agree and the edge cases are tested.
 */

/** The genres offered at onboarding — the same names, so picking one later matches what was picked then. */
export const FAVORITE_GENRE_OPTIONS = [
  "Fantasy",
  "Science Fiction",
  "Mystery",
  "Romance",
  "Thriller",
  "Historical Fiction",
  "Non-Fiction",
  "Horror",
  "Literary Fiction",
  "Adventure",
  "Biography",
  "Comics",
] as const;

const key = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export const sameFavorite = (a: string, b: string) => key(a) === key(b);

/** Trimmed, non-empty, first spelling wins over later duplicates ("tolkien" after "Tolkien"). */
export function cleanFavorites(values: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.replace(/\s+/g, " ").trim();
    if (value && !out.some((existing) => sameFavorite(existing, value))) out.push(value);
  }
  return out;
}

/** Add what was typed — a pasted "A, B, C" becomes three. */
export function addFavorites(current: readonly string[], typed: string): string[] {
  return cleanFavorites([...current, ...typed.split(",")]);
}

export function removeFavorite(current: readonly string[], value: string): string[] {
  return current.filter((existing) => !sameFavorite(existing, value));
}

/** Suggestions not yet chosen, most frequent first, at most `limit`. */
export function favoriteSuggestions(candidates: readonly string[], chosen: readonly string[], limit = 8): string[] {
  const counts = new Map<string, { label: string; count: number; first: number }>();
  candidates.forEach((raw, index) => {
    const label = raw.trim();
    if (!label || chosen.some((c) => sameFavorite(c, label))) return;
    const k = key(label);
    const entry = counts.get(k);
    if (entry) entry.count += 1;
    else counts.set(k, { label, count: 1, first: index });
  });
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.first - b.first)
    .slice(0, limit)
    .map((e) => e.label);
}
