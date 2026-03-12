import PinyinMatch from "pinyin-match";

/**
 * Match text against query using case-insensitive substring first,
 * then pinyin matching for Chinese characters.
 * Returns true if either method matches.
 */
export function matchesPinyinOrSubstring(
  text: string,
  query: string,
): boolean {
  if (!query) return true;
  if (!text) return false;

  // Case-insensitive substring match
  if (text.toLowerCase().includes(query.toLowerCase())) {
    return true;
  }

  // Pinyin match (handles full pinyin, abbreviations, mixed input)
  const result = PinyinMatch.match(text, query);
  return result !== false;
}
