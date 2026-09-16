/**
 * titleCase — undo library-catalogue sentence case on English titles.
 *
 * Open Library stores many titles the way MARC records do, in sentence case:
 * "The forgotten", "Total control", "No man's land". Next to Google Books'
 * "Nash Falls" and "End Game" the list looks broken. English titles are title
 * cased; Spanish, French or Italian titles legitimately are NOT ("Alas de
 * ónix", "La sombra del viento"), so this only fires with evidence the title
 * is English:
 *
 *  - most other multi-word titles by the same author in the same result set
 *    are already in title case (the catalogue, not the author, chose the
 *    casing), or
 *  - the title contains an English-only function word ("the", "of", "and" …)
 *    and no accented letters.
 *
 * It never changes spelling, only capitals, and leaves any title that already
 * has a capital after its first letter alone.
 *
 * Pure, no React.
 */

const SMALL_WORDS = new Set([
  "a", "an", "the", "and", "but", "or", "nor", "for", "so", "yet",
  "as", "at", "by", "in", "of", "on", "to", "up", "via", "vs", "per", "from", "with", "into",
]);

const ENGLISH_EVIDENCE = /\b(the|of|and|with|from|for|my|your|our|their|his|her|to|at|by|is|into|over|under|who|what|when)\b/i;

const isWord = (token: string) => /[A-Za-z]/.test(token);

/** "The forgotten" is sentence case; "The Forgotten", "iPhone basics" and "Dune" are not. */
export function isSentenceCase(title: string): boolean {
  const words = title.trim().split(/\s+/).filter(isWord);
  if (words.length < 2) return false;
  if (!/^[A-Z0-9"'¡¿(]/.test(words[0])) return false;
  // Any capital after the first word's first letter means someone chose casing.
  if (/[A-Z]/.test(title.trim().slice(1))) return false;
  return words.slice(1).some((word) => !SMALL_WORDS.has(word.toLowerCase().replace(/[^a-z']/g, "")));
}

export function isTitleCase(title: string): boolean {
  const words = title.trim().split(/\s+/).filter(isWord);
  if (words.length < 2) return false;
  return words.every((word, index) => {
    const bare = word.replace(/^[^A-Za-z]+/, "");
    if (index > 0 && SMALL_WORDS.has(bare.toLowerCase())) return true;
    return /^[A-Z0-9]/.test(bare);
  });
}

export function toEnglishTitleCase(title: string): string {
  const tokens = title.split(/(\s+)/);
  const wordIndexes = tokens.map((token, index) => (isWord(token) ? index : -1)).filter((index) => index >= 0);
  const first = wordIndexes[0];
  const last = wordIndexes[wordIndexes.length - 1];
  let afterColon = false;
  return tokens
    .map((token, index) => {
      if (!isWord(token)) return token;
      const lower = token.toLowerCase().replace(/[^a-z]/g, "");
      const keepSmall = index !== first && index !== last && !afterColon && SMALL_WORDS.has(lower);
      afterColon = /[:—–]$/.test(token);
      if (keepSmall) return token;
      return token.replace(/[A-Za-z]/, (letter) => letter.toUpperCase());
    })
    .join("");
}

/**
 * @param siblings other titles by the same author shown alongside this one
 */
export function displayTitle(title: string, siblings: string[] = []): string {
  if (!isSentenceCase(title)) return title;
  const multiWord = siblings.filter((sibling) => sibling !== title && sibling.trim().split(/\s+/).length >= 2);
  const titleCased = multiWord.filter(isTitleCase).length;
  const siblingsSayEnglish = multiWord.length >= 3 && titleCased / multiWord.length >= 0.6;
  const wordsSayEnglish = ENGLISH_EVIDENCE.test(title) && !/[^\x00-\x7F]/.test(title);
  return siblingsSayEnglish || wordsSayEnglish ? toEnglishTitleCase(title) : title;
}
