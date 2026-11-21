export { findMatches };
export type { FindFold, FindMatch, FindOptions };

/** What a find ignores when it compares text with the query: nothing, case, accents, or both. */
type FindFold = "none" | "case" | "accents" | "all";

/** One match: the half-open range `[start, end)` counted in the text's own code units. */
interface FindMatch {
  start: number;
  end: number;
}

interface FindOptions {
  /** What to ignore when comparing. Default `"all"`, as a browser's find bar does. */
  fold?: FindFold | undefined;
  /** A language tag for the case rules, such as `"tr"`, where `I` is the dotless ı and `İ` is a dotted i. Default: the language-neutral rules. */
  locale?: string | undefined;
}

// Full case folding (Unicode CaseFolding.txt, status F) for what lowercasing leaves alone.
const expansions: Record<string, string> = {
  ß: "ss",
  ς: "σ",
  ſ: "s",
  ŉ: "ʼn",
  և: "եւ",
  ẚ: "aʾ",
  ﬀ: "ff",
  ﬁ: "fi",
  ﬂ: "fl",
  ﬃ: "ffi",
  ﬄ: "ffl",
  ﬅ: "st",
  ﬆ: "st",
};

const diacritics = [
  [0x300, 0x36f],
  [0x1ab0, 0x1aff],
  [0x1dc0, 0x1dff],
  [0x20d0, 0x20ff],
  [0xfe20, 0xfe2f],
] as const;
const isDiacritic = (char: string) => diacritics.some(([low, high]) => char.codePointAt(0)! >= low && char.codePointAt(0)! <= high);
const anyMark = /\p{M}/u;

function foldUnit(unit: string, fold: FindFold, locale: string | undefined): string {
  let out = unit.normalize("NFC");
  if (fold === "case" || fold === "all") {
    // Stryker disable next-line ConditionalExpression,MethodExpression: lowercasing and uppercasing both sides alike match the same text, and an undefined locale is the default one.
    out = locale === undefined ? out.toLowerCase() : out.toLocaleLowerCase(locale);
    let spread = "";
    for (const char of out) spread += expansions[char] ?? char;
    out = spread;
  }
  if (fold === "accents" || fold === "all") out = [...out.normalize("NFD")].filter((char) => !isDiacritic(char)).join("").normalize("NFC");
  return out;
}

const inRange = (char: string, low: number, high: number) => char.codePointAt(0)! >= low && char.codePointAt(0)! <= high;

/** Whether `char` continues the letter `before` ends: a combining mark, or a Hangul vowel or final jamo after a jamo or syllable. */
function continues(before: string, char: string): boolean {
  if (anyMark.test(char)) return true;
  const last = [...before].pop()!;
  return inRange(char, 0x1160, 0x11ff) && (inRange(last, 0x1100, 0x11ff) || inRange(last, 0xac00, 0xd7a3));
}

/** Splits text into letters, a character together with the marks that follow it, and a Hangul syllable's jamo together. */
function units(text: string): string[] {
  const out: string[] = [];
  for (const char of text) {
    if (out.length > 0 && continues(out[out.length - 1]!, char)) out[out.length - 1] += char;
    else out.push(char);
  }
  return out;
}

/**
 * Finds where `query` occurs in `text`, ignoring what `fold` says to ignore, for a chat's find bar. The matches are
 * ranges of the original text, so a highlight drawn from them lands on the letters the reader sees: a match never
 * starts or ends inside a character and its combining marks, so `é` written as `e` and a mark is one letter, and `ß`
 * is matched whole, by `ss` or `ß` and not by `s`. Matches don't overlap; an empty query matches nothing.
 *
 * Case folding is full case folding, so `ß` and `ss`, `ς` and `σ`, `ﬁ` and `fi` are the same. Accent folding takes off
 * combining diacritics only, so Hebrew points and Indic vowel signs still count. Without a locale `I` and `i` are the same
 * letter, and `ı` (dotless) is a letter of its own; with `locale: "tr"` `I` is `ı` and `İ` is `i`.
 *
 * @example
 * findMatches("Résumé und RESUME", "resume"); // [{ start: 0, end: 6 }, { start: 11, end: 17 }]
 *
 * @claim "Matches don't overlap" registry/ouro/lib/ouro/find-text.test.ts verify:testExists(registry/ouro/lib/ouro/find-text.test.ts::findMatches > never overlaps matches and finds every one)
 * @claim "an empty query matches nothing" registry/ouro/lib/ouro/find-text.test.ts verify:testExists(registry/ouro/lib/ouro/find-text.test.ts::findMatches > matches nothing for an empty query or empty text)
 * @claim "a match never starts or ends inside a character and its combining marks" registry/ouro/lib/ouro/find-text.test.ts verify:testExists(registry/ouro/lib/ouro/find-text.test.ts::findMatches > never splits a letter from its combining marks)
 * @internal
 */
function findMatches(text: string, query: string, options: FindOptions = {}): FindMatch[] {
  const fold = options.fold ?? "all";
  const { locale } = options;
  const wanted = units(query)
    .map((unit) => foldUnit(unit, fold, locale))
    .join("");
  if (wanted === "") return [];

  let folded = "";
  // For each folded code unit, which letter it came from; a letter's range in the text; and where each letter's fold starts.
  const owner: number[] = [];
  const from: number[] = [];
  const to: number[] = [];
  const startsAt: number[] = [];
  let offset = 0;
  for (const unit of units(text)) {
    const piece = foldUnit(unit, fold, locale);
    const at = from.length;
    from.push(offset);
    to.push(offset + unit.length);
    startsAt.push(folded.length);
    for (let i = 0; i < piece.length; i++) owner.push(at);
    folded += piece;
    offset += unit.length;
  }
  startsAt.push(folded.length);

  const found: FindMatch[] = [];
  let search = 0;
  for (;;) {
    const at = folded.indexOf(wanted, search);
    if (at === -1) return found;
    const end = at + wanted.length;
    const first = owner[at]!;
    const last = owner[end - 1]!;
    if (startsAt[first] === at && startsAt[last + 1] === end) {
      found.push({ start: from[first]!, end: to[last]! });
      search = end;
    } else search = at + 1;
  }
}
