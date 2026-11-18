/**
 * Flesch–Kincaid grade level, for the stage's copy (site-design.md: stage and chapter copy at grade
 * 6 or under). Syllables are counted by the usual rule of thumb: vowel groups, less a silent final
 * "e" or "-es"/"-ed", at least one a word. Digits read as one syllable a number.
 */
export function syllables(word: string): number {
  let letters = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!letters) return /\d/.test(word) ? 1 : 0;
  if (letters.length <= 3) return 1;
  if (!/[^aeiouy]le$/.test(letters)) letters = letters.replace(/(?:[^aeiouy]es|[^aeiouy]ed|e)$/, (end) => (end.length > 1 ? end[0]! : ""));
  letters = letters.replace(/^y/, "");
  return Math.max(1, letters.match(/[aeiouy]+/g)?.length ?? 0);
}

export interface Readability {
  words: number;
  sentences: number;
  syllables: number;
  grade: number;
}

/** Reads a set of lines as one text: each line is at least one sentence. */
export function fleschKincaid(lines: readonly string[]): Readability {
  let words = 0;
  let sentences = 0;
  let count = 0;
  for (const line of lines) {
    const tokens = line.split(/[\s—–-]+/).filter((token) => /[a-z0-9]/i.test(token));
    if (tokens.length === 0) continue;
    words += tokens.length;
    sentences += Math.max(1, line.split(/[.!?]+(?:\s|$)/).filter((part) => /[a-z0-9]/i.test(part)).length);
    count += tokens.reduce((total, token) => total + syllables(token), 0);
  }
  const grade = 0.39 * (words / sentences) + 11.8 * (count / words) - 15.59;
  return { words, sentences, syllables: count, grade: Math.round(grade * 10) / 10 };
}

/**
 * The words that made the Nautilus read as a toy (Ari, 2026-11-17: "reads more like 'toy' than
 * 'professional'"): a squid that hugs, giggles and is tickled loose with feathers. The chapters keep
 * their warmth and wit; a premium film's crew doesn't talk like a nursery book.
 */
export const NURSERY_WORDS = /\b(hugs?|hugging|giggl\w*|tickl\w*|feathers?|fluffy|blub|hee hee|big friend|fun fact|love a good)\b/i;

/** How a set of lines sounds: the lines that shout (end a sentence on "!"), the nursery words, and any emoji drawn as text. */
export function voice(lines: readonly string[]): { shouts: string[]; nursery: string[]; emoji: string[] } {
  return {
    shouts: lines.filter((line) => line.includes("!")),
    nursery: lines.filter((line) => NURSERY_WORDS.test(line)),
    emoji: lines.filter((line) => /\p{Extended_Pictographic}/u.test(line)),
  };
}
