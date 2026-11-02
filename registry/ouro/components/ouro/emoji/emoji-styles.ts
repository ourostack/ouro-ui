import type { EmojiCatalogue, EmojiItem, EmojiItemTone } from "@/registry/ouro/components/ouro/emoji/emoji";

export { catalogueIndex, emojiClass, emojiSkinTones, emojiToken, fold, matchWords, searchCatalogue, splitEmojiText, toneOf };
export type { CatalogueIndex, EmojiSkinTone, EmojiTextPart, FoundEmoji };

// Value lists and helpers for Emoji and the components that draw a catalogue's emoji, apart from
// the component so its file exports only components (React Fast Refresh). Class strings are
// literal so the app's Tailwind finds them.

/**
 * A skin tone: the default (no tone) or one of Unicode's five, light to dark.
 *
 * @claim "one of Unicode's five" https://www.unicode.org/reports/tr51/#Diversity verify:urlOk(https://www.unicode.org/reports/tr51/#Diversity)
 * @claim "one of Unicode's five" registry/ouro/components/ouro/emoji/emoji-styles.ts verify:fileLine(registry/ouro/components/ouro/emoji/emoji-styles.ts, /\["default", "light", "medium-light", "medium", "medium-dark", "dark"\]/)
 */
type EmojiSkinTone = "default" | "light" | "medium-light" | "medium" | "medium-dark" | "dark";

/** The skin tones, in the order a picker offers them. @internal */
const emojiSkinTones: readonly EmojiSkinTone[] = ["default", "light", "medium-light", "medium", "medium-dark", "dark"];

/**
 * An emoji's image: 1.25em square, so it takes the size of the text around it as a font's
 * emoji does, sitting on the line. @internal
 *
 * @claim "image: 1.25em square, so" registry/ouro/components/ouro/emoji/emoji-styles.ts verify:fileLine(registry/ouro/components/ouro/emoji/emoji-styles.ts, /"inline-block size-\[1\.25em\]/)
 */
const emojiClass = "inline-block size-[1.25em] shrink-0 align-[-0.3em] object-contain select-none";

/** The emoji's form in a skin tone: its toned image, or the emoji itself in the default tone or without tones. @internal */
function toneOf(item: EmojiItem, tone: EmojiSkinTone | undefined): EmojiItem | EmojiItemTone {
  // The default tone, or one that is no tone, is the emoji itself.
  return item.skinTones?.[emojiSkinTones.indexOf(tone!) - 1] ?? item;
}

/**
 * The text that stands for an emoji in a message, `:shortcode:`: its first shortcode, or else
 * its id, and in a skin tone its tone's id. `EmojiText` draws it as the image. @internal
 *
 * @claim "its first shortcode, or else its id" registry/ouro/components/ouro/emoji/emoji.test.tsx verify:testExists(registry/ouro/components/ouro/emoji/emoji.test.tsx::EmojiText > draws shortcode, id and tone id tokens as their images, and leaves unknown ones as text)
 */
function emojiToken(item: EmojiItem, tone?: EmojiSkinTone): string {
  const form = toneOf(item, tone);
  return `:${form === item ? (item.shortcodes?.[0] ?? item.id) : form.id}:`;
}

/** An emoji found in a catalogue, and the skin tone its id or text named. */
interface FoundEmoji {
  item: EmojiItem;
  tone: EmojiSkinTone;
}

/** A catalogue's emoji by id, by token and by text, built once per catalogue. */
interface CatalogueIndex {
  /**
   * The catalogue's emoji in order, each id once.
   *
   * @claim "each id once" registry/ouro/components/ouro/emoji/emoji.test.tsx verify:testExists(registry/ouro/components/ouro/emoji/emoji.test.tsx::Emoji helpers > indexes a catalogue once, each emoji once, by id, tone id, token and text)
   */
  items: readonly EmojiItem[];
  /** An emoji by its id or a tone's id. */
  byId: ReadonlyMap<string, FoundEmoji>;
  /** An emoji by what goes between the colons of a token: a shortcode (in lower case), an id or a tone's id. */
  byToken: ReadonlyMap<string, FoundEmoji>;
  /** An emoji by its text, without variation selectors. */
  byText: ReadonlyMap<string, FoundEmoji>;
  /** Finds a token's colon and name, up to its closing colon, and the emoji text the catalogue lists, longest text first. */
  pattern: RegExp;
  /**
   * Finds only the emoji text the catalogue lists, longest first, and nothing when it lists none.
   *
   * @claim "nothing when it lists none" registry/ouro/components/ouro/emoji/emoji.test.tsx verify:testExists(registry/ouro/components/ouro/emoji/emoji.test.tsx::Emoji helpers > splits text into its runs and emoji with no empty runs between or around them)
   */
  textPattern: RegExp;
}

const indexes = new WeakMap<EmojiCatalogue, CatalogueIndex>();
const VARIATION = /\uFE0F/g;
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The catalogue's index, built on first use and kept while the catalogue object lives. @internal */
function catalogueIndex(catalogue: EmojiCatalogue): CatalogueIndex {
  const known = indexes.get(catalogue);
  if (known) return known;
  const items: EmojiItem[] = [];
  const byId = new Map<string, FoundEmoji>();
  const byToken = new Map<string, FoundEmoji>();
  const byText = new Map<string, FoundEmoji>();
  for (const item of catalogue.categories.flatMap((category) => category.items)) {
    if (byId.has(item.id)) continue;
    items.push(item);
    const tones = (item.skinTones ?? []).map((form, index): [EmojiItemTone, EmojiSkinTone] => [form, emojiSkinTones[index + 1]!]);
    for (const [form, tone] of [[item, "default"] as [EmojiItem, EmojiSkinTone], ...tones]) {
      const found = { item, tone };
      byId.set(form.id, found);
      byToken.set(form.id.toLowerCase(), found);
      if (form.text) byText.set(form.text.replace(VARIATION, ""), found);
    }
  }
  // Shortcodes win over ids that look the same, so they go in last.
  for (const item of items) item.shortcodes?.forEach((shortcode) => byToken.set(shortcode.toLowerCase(), { item, tone: "default" }));
  // Longest first, so a sequence wins over the emoji it starts with; a variation selector may follow any character.
  const texts = [...byText.keys()].sort((a, b) => b.length - a.length).map((text) => Array.from(text, (char) => `${escape(char)}\\uFE0F?`).join(""));
  const pattern = new RegExp([":[^\\s:]+(?=:)", ...texts].join("|"), "gu");
  // (?!) matches nothing, for a catalogue that lists no text.
  const textPattern = new RegExp(["(?!)", ...texts].join("|"), "gu");
  const index = { items, byId, byToken, byText, pattern, textPattern };
  indexes.set(catalogue, index);
  return index;
}

/** A run of text, or an emoji found in it with the text it was found as. */
type EmojiTextPart = string | (FoundEmoji & { source: string });

/**
 * Splits text into runs of text and the emoji its tokens (`:shortcode:`, `:id:`) and emoji
 * text name in the catalogue, each with the text it was found as. A token the catalogue does not
 * know stays text, and its closing colon can still open the next one. With `tokens` false, only
 * the emoji text counts, for text such as code where `:name:` means something else. @internal
 *
 * @claim "each with the text it was found as" registry/ouro/components/ouro/emoji/emoji.test.tsx verify:testExists(registry/ouro/components/ouro/emoji/emoji.test.tsx::Emoji helpers > splits text into its runs and emoji with no empty runs between or around them)
 * @claim "A token the catalogue does not know stays text" registry/ouro/components/ouro/emoji/emoji.test.tsx verify:testExists(registry/ouro/components/ouro/emoji/emoji.test.tsx::EmojiText > draws shortcode, id and tone id tokens as their images, and leaves unknown ones as text)
 */
function splitEmojiText(text: string, catalogue: EmojiCatalogue, tokens = true): EmojiTextPart[] {
  const { byToken, byText, pattern, textPattern } = catalogueIndex(catalogue);
  const parts: EmojiTextPart[] = [];
  let plainFrom = 0;
  for (const match of text.matchAll(tokens ? pattern : textPattern)) {
    // A token's closing colon, already taken, does not open another.
    if (match.index < plainFrom) continue;
    const token = match[0].startsWith(":");
    const found = token ? byToken.get(match[0].slice(1).toLowerCase()) : byText.get(match[0].replace(VARIATION, ""));
    if (!found) continue;
    if (match.index > plainFrom) parts.push(text.slice(plainFrom, match.index));
    const end = match.index + match[0].length + (token ? 1 : 0);
    parts.push({ ...found, source: text.slice(match.index, end) });
    plainFrom = end;
  }
  if (plainFrom < text.length) parts.push(text.slice(plainFrom));
  return parts;
}

/** Lower case, without accents, so "Café" matches "cafe". @internal */
function fold(text: string): string {
  // Stryker disable next-line MethodExpression: both sides of every comparison fold the same way, so upper case matches as lower case does.
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * Whether every word typed starts one of `words`, or a part of one split at spaces, hyphens,
 * underscores and colons, ignoring case and accents. Colons around a typed shortcode are
 * dropped, so `:party` finds `party_popper`. @internal
 *
 * @claim "Whether every word typed starts" registry/ouro/components/ouro/emoji/emoji.test.tsx verify:testExists(registry/ouro/components/ouro/emoji/emoji.test.tsx::Emoji helpers > matches every typed word to the start of a word, a part of one, or a whole one, ignoring case, accents and colons)
 */
function matchWords(words: readonly string[], query: string): boolean {
  const whole = words.map(fold);
  // Runs of separators leave empty words and terms, which match nothing and everything, so they change no result.
  const parts = whole.flatMap((word) => word.split(/[\s_:-]/));
  return fold(query)
    .split(/\s/)
    .map((term) => term.replace(/^:+|:+$/g, ""))
    .every((term) => parts.some((word) => word.startsWith(term)) || whole.some((word) => word.startsWith(term)));
}

/**
 * The catalogue's emoji whose name, shortcodes or keywords the query starts, those with a
 * shortcode that starts with it first, at most `limit`. @internal
 */
function searchCatalogue(catalogue: EmojiCatalogue, query: string, limit: number): EmojiItem[] {
  const { items } = catalogueIndex(catalogue);
  const typed = fold(query);
  const byShortcode = items.filter((item) => item.shortcodes?.some((shortcode) => fold(shortcode).startsWith(typed)));
  const rest = items.filter((item) => !byShortcode.includes(item) && matchWords([item.name, ...(item.shortcodes ?? []), ...(item.keywords ?? [])], query));
  return [...byShortcode, ...rest].slice(0, limit);
}
