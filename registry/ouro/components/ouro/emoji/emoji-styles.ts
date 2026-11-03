import type { EmojiCatalogue, EmojiItem, EmojiItemTone } from "@/registry/ouro/components/ouro/emoji/emoji";
import { devWarn } from "@/registry/ouro/lib/ouro/dev";

export {
  catalogueIndex,
  emojiClass,
  emojiPictureClass,
  emojiPictureFadeClass,
  emojiPlaceholderClass,
  emojiPlaceholderFadeClass,
  emojiSkinTones,
  emojiToken,
  emojiTextToTokens,
  fold,
  matchWords,
  searchCatalogue,
  splitEmojiText,
  toneOf,
};
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

/**
 * An emoji's picture over its placeholder: the box of the emoji around it, hidden until the
 * root is marked `data-loaded`. @internal
 */
const emojiPictureClass = "absolute inset-0 size-full object-contain opacity-0 group-data-loaded/emoji:opacity-100";

/** The picture's fade in over the short duration, once loaded only, left off when motion is reduced (`useReducedMotion`). @internal */
const emojiPictureFadeClass =
  "group-data-loaded/emoji:transition-opacity group-data-loaded/emoji:duration-(--ouro-duration-fast) group-data-loaded/emoji:ease-(--ouro-ease-out)";

/** What stands in for the picture: the emoji's box, with an element centred and clipped to it, hidden once the picture is loaded. @internal */
const emojiPlaceholderClass =
  "pointer-events-none absolute inset-0 grid size-full place-items-center overflow-hidden group-data-loaded/emoji:invisible group-data-loaded/emoji:opacity-0";

/** The placeholder's fade out with the picture's fade in, left off when motion is reduced. @internal */
const emojiPlaceholderFadeClass =
  "group-data-loaded/emoji:transition-[opacity,visibility] group-data-loaded/emoji:duration-(--ouro-duration-fast) group-data-loaded/emoji:ease-(--ouro-ease-out)";

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

/** A step in a path of objects, held weakly, with the index the path ends at. */
interface IndexPath {
  next: WeakMap<object, IndexPath>;
  index?: CatalogueIndex;
}

const paths: IndexPath = { next: new WeakMap() };

/**
 * Where a sequence of objects leads, a lookup per object: the same objects in the same order
 * lead to the same place.
 *
 * @claim "the same objects in the same order lead to the same place" registry/ouro/components/ouro/emoji/emoji.index.test.tsx verify:testExists(registry/ouro/components/ouro/emoji/emoji.index.test.tsx::catalogueIndex > shares one index between fresh catalogue objects holding the same emoji)
 */
function pathOf(steps: readonly object[]): IndexPath {
  let path = paths;
  for (const step of steps) {
    let next = path.next.get(step);
    if (!next) path.next.set(step, (next = { next: new WeakMap() }));
    path = next;
  }
  return path;
}

/**
 * The indexes of catalogues an app named with an `id`, at most `NAMED` of them, the oldest let go first.
 *
 * @claim "at most `NAMED` of them" registry/ouro/components/ouro/emoji/emoji.index.test.tsx verify:testExists(registry/ouro/components/ouro/emoji/emoji.index.test.tsx::catalogueIndex > shares one index between catalogues with the same id, and keeps the most recent ids)
 */
const named = new Map<string, CatalogueIndex>();
const NAMED = 16;

/** When a set of emoji, named by their ids, was built in the last `REBUILD_SPAN` milliseconds, in development only. */
const builds = new Map<string, number[]>();
const REBUILD_SPAN = 1000;
const REBUILD_LIMIT = 3;

/**
 * Warns once, in development, when the index of the same emoji is built more than
 * `REBUILD_LIMIT` times within a second, as when an app makes its catalogue's emoji afresh for
 * each message. Catalogues of different emoji, such as a page of examples, never count together.
 *
 * @claim "the same emoji is built more than `REBUILD_LIMIT` times within a second" registry/ouro/components/ouro/emoji/emoji.index.test.tsx verify:testExists(registry/ouro/components/ouro/emoji/emoji.index.test.tsx::catalogueIndex > warns once in development when the same emoji are indexed more than three times within a second)
 * @claim "Catalogues of different emoji, such as a page of examples, never count together" registry/ouro/components/ouro/emoji/emoji.index.test.tsx verify:testExists(registry/ouro/components/ouro/emoji/emoji.index.test.tsx::catalogueIndex > stays quiet for many different catalogues, and for equivalent fresh ones however often an app makes them)
 */
function noteBuild(items: readonly EmojiItem[]): void {
  const now = Date.now();
  const key = items.map((item) => item.id).join();
  // Stryker disable next-line ArrayDeclaration: the filter keeps only recent times, so anything else the empty list starts with is dropped.
  const times = (builds.get(key) ?? []).filter((time) => time > now - REBUILD_SPAN);
  times.push(now);
  builds.set(key, times);
  /* istanbul ignore else @preserve -- the else path exists only in production bundles; scripts/dev-strip.test.mjs covers it */
  if (process.env.NODE_ENV !== "production") {
    if (times.length > REBUILD_LIMIT) {
      devWarn(
        "EmojiCatalogue",
        `the index of the same emoji was built more than ${REBUILD_LIMIT} times within a second, each time for a catalogue of new emoji objects. Each build maps every emoji and compiles two patterns of their text, so drawing a conversation this way can take seconds`,
        "build the catalogue once and pass that object every time (useMemo(() => toCatalogue(emoji), [emoji])), or give every copy the same id that changes only when the emoji do: { id: \"contoso-2026-11\", categories }",
      );
    }
  }
}

/**
 * The catalogue's index, built on first use and kept while the catalogue's emoji live. A fresh
 * catalogue object with the same emoji shares it: one with the same `id`, or else one whose
 * categories hold the same `items` arrays (a lookup per category), or the same emoji objects in
 * the same order (a lookup per emoji). @internal
 *
 * @claim "A fresh catalogue object with the same emoji shares it" registry/ouro/components/ouro/emoji/emoji.index.test.tsx verify:testExists(registry/ouro/components/ouro/emoji/emoji.index.test.tsx::catalogueIndex > shares one index between fresh catalogue objects holding the same emoji)
 */
function catalogueIndex(catalogue: EmojiCatalogue): CatalogueIndex {
  let index = indexes.get(catalogue) ?? named.get(catalogue.id!);
  if (!index) {
    const arrays = pathOf(catalogue.categories.map((category) => category.items));
    const emoji = arrays.index ? arrays : pathOf(catalogue.categories.flatMap((category) => category.items));
    index = emoji.index ?? buildCatalogueIndex(catalogue);
    arrays.index = emoji.index = index;
    if (catalogue.id !== undefined) {
      named.set(catalogue.id, index);
      if (named.size > NAMED) named.delete(named.keys().next().value!);
    }
  }
  indexes.set(catalogue, index);
  return index;
}

/** Builds a catalogue's index: maps of its emoji and the patterns that find their text. */
function buildCatalogueIndex(catalogue: EmojiCatalogue): CatalogueIndex {
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
  /* istanbul ignore else @preserve -- the else path exists only in production bundles; scripts/dev-strip.test.mjs covers it */
  if (process.env.NODE_ENV !== "production") noteBuild(items);
  // Shortcodes win over ids that look the same, so they go in last.
  for (const item of items) item.shortcodes?.forEach((shortcode) => byToken.set(shortcode.toLowerCase(), { item, tone: "default" }));
  // Longest first, so a sequence wins over the emoji it starts with; a variation selector may follow any character.
  const texts = [...byText.keys()].sort((a, b) => b.length - a.length).map((text) => Array.from(text, (char) => `${escape(char)}\\uFE0F?`).join(""));
  const pattern = new RegExp([":[^\\s:]+(?=:)", ...texts].join("|"), "gu");
  // (?!) matches nothing, for a catalogue that lists no text.
  const textPattern = new RegExp(["(?!)", ...texts].join("|"), "gu");
  return { items, byId, byToken, byText, pattern, textPattern };
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

/** Splits text into the characters a person sees, an emoji with its tone modifier or its joined parts whole. */
// Stryker disable next-line ObjectLiteral: grapheme is Intl.Segmenter's default granularity, named here for the reader.
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * The text with the emoji the catalogue lists as text turned into their tokens: `:shortcode:`,
 * or a tone's `:id:`. It reads the text a whole character at a time, so an emoji joined from
 * others (a zero width joiner sequence) or one with a skin tone modifier changes only when the
 * catalogue lists it whole. Any other character, and an emoji the catalogue does not list,
 * stays as it is. @internal
 *
 * @claim "changes only when the catalogue lists it whole" registry/ouro/components/ouro/emoji/emoji.test.tsx verify:testExists(registry/ouro/components/ouro/emoji/emoji.test.tsx::Emoji helpers > turns each emoji the catalogue lists as text into its token, a whole character at a time)
 */
function emojiTextToTokens(text: string, catalogue: EmojiCatalogue): string {
  const { byText } = catalogueIndex(catalogue);
  let tokens = "";
  for (const { segment } of graphemes.segment(text)) {
    const found = byText.get(segment.replace(VARIATION, ""));
    tokens += found ? emojiToken(found.item, found.tone) : segment;
  }
  return tokens;
}
