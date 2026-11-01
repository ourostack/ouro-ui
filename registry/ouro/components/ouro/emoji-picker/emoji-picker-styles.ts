import { emojiSkinTones, matchWords, type EmojiSkinTone } from "@/registry/ouro/components/ouro/emoji/emoji-styles";

export {
  barButtonClass,
  barClass,
  cellClass,
  COLUMNS,
  emojiSkinTones,
  fillCount,
  gridClass,
  headingClass,
  matchEmoji,
  panelClass,
  previewClass,
  previewGlyphClass,
  quickClass,
  scrollerClass,
  skinToneNames,
  stepInRow,
  toned,
  toneOptionClass,
};
export type { EmojiSkinTone, ToneableEmoji };

// Class strings, value lists and helpers for EmojiPicker, apart from the component so its file
// exports only components (React Fast Refresh). Class strings are literal so the app's Tailwind
// finds them. The skin tones come from Emoji, which draws a catalogue's images.

/**
 * What screen readers hear for each skin tone, unless the app passes its own words. @internal
 *
 * @claim "hear for each skin tone" registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx verify:testExists(registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx::EmojiPicker skin tones > opens the tones as a radio group on the checked tone, and changes the tone live with the arrow keys)
 * @claim "hear for each skin tone" registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx verify:testExists(registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx::EmojiPicker labels > takes every word it shows or speaks from its props, for other languages)
 */
const skinToneNames: Readonly<Record<EmojiSkinTone, string>> = {
  default: "Default",
  light: "Light",
  "medium-light": "Medium-light",
  medium: "Medium",
  "medium-dark": "Medium-dark",
  dark: "Dark",
};

/** Emoji per row in the grid. @internal */
const COLUMNS = 8;

/** The part of an emoji the tone and the search read. @internal */
interface ToneableEmoji {
  emoji: string;
  name: string;
  keywords?: readonly string[] | undefined;
  skinTones?: boolean | readonly string[] | undefined;
  /** A catalogue emoji's shortcodes, which the search matches whole or by their words. */
  shortcodes?: readonly string[] | undefined;
  /** A catalogue emoji's text, which a search for that text finds. */
  text?: string | undefined;
}

/**
 * The emoji in a skin tone: the toned form the app listed, or Unicode's modifier after the
 * first character (dropping the variation selector that follows it, as the toned form has
 * none). An emoji without skin tones, or the default tone, keeps its own form. @internal
 *
 * @claim "the toned form the app listed" registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx verify:testExists(registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx::EmojiPicker skin tones > puts the tone into what it chooses, by Unicode's modifier or the toned forms the app listed)
 * @claim "the toned form the app listed" registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx verify:testExists(registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx::EmojiPicker skin tones > keeps a toned form the app left out as the emoji itself)
 */
function toned(item: Pick<ToneableEmoji, "emoji" | "skinTones">, tone: EmojiSkinTone): string {
  const index = emojiSkinTones.indexOf(tone);
  if (!item.skinTones || index <= 0) return item.emoji;
  if (item.skinTones !== true) return item.skinTones[index - 1] ?? item.emoji;
  const [first, ...rest] = Array.from(item.emoji);
  const tail = rest[0] === "\uFE0F" ? rest.slice(1) : rest;
  return `${first}${String.fromCodePoint(0x1f3fa + index)}${tail.join("")}`;
}

/**
 * Whether an emoji matches the search: every word typed starts a word of its name, keywords or
 * shortcodes (or a whole shortcode), ignoring case and accents and colons around a shortcode, or
 * the search is the emoji itself or its text. @internal
 *
 * @claim "every word typed starts" registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx verify:testExists(registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx::EmojiPicker search > matches the start of any word in the name or keywords, ignoring case and accents, and hides the categories)
 * @claim "every word typed starts" registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx verify:testExists(registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx::EmojiPicker search > finds an emoji pasted into the search, and lists one found twice only once)
 * @claim "or a whole shortcode" registry/ouro/components/ouro/emoji-picker/emoji-picker.catalogue.test.tsx verify:testExists(registry/ouro/components/ouro/emoji-picker/emoji-picker.catalogue.test.tsx::EmojiPicker with a catalogue > searches by shortcode, with or without colons, by keyword and by the emoji's text)
 */
function matchEmoji(item: ToneableEmoji, query: string): boolean {
  const typed = query.trim();
  if (typed === item.emoji || (item.text !== undefined && typed.replace(/\uFE0F/g, "") === item.text.replace(/\uFE0F/g, ""))) return true;
  return matchWords([item.name, ...(item.keywords ?? []), ...(item.shortcodes ?? [])], typed);
}

/**
 * Where a key moves focus in a row of `count` buttons from `at`: the arrows step (the other
 * way in a right-to-left page) and stop at the ends, Home and End go to the ends. Any other
 * key is not the row's. @internal
 */
function stepInRow(key: string, at: number, count: number, rtl: boolean): number | undefined {
  const forward = rtl ? "ArrowLeft" : "ArrowRight";
  const back = rtl ? "ArrowRight" : "ArrowLeft";
  if (key === forward) return Math.min(at + 1, count - 1);
  if (key === back) return Math.max(at - 1, 0);
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return undefined;
}

/**
 * Puts a count into a label: "{count} emoji" with 3 is "3 emoji". @internal
 *
 * @claim "Puts a count into" registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx verify:testExists(registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx::EmojiPicker labels > takes every word it shows or speaks from its props, for other languages)
 * @claim "Puts a count into" registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx verify:testExists(registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx::EmojiPicker search > matches the start of any word in the name or keywords, ignoring case and accents, and hides the categories)
 */
function fillCount(template: string, count: number): string {
  return template.replaceAll("{count}", String(count));
}

/** The panel inside the popover or the sheet. @internal */
const panelClass = "box-border flex w-full min-w-0 flex-col gap-2 p-1";

/** The category bar: its buttons spread across the panel, or scrolling sideways when they do not fit, over a rule. @internal */
const barClass =
  "flex min-w-0 shrink-0 items-center justify-between gap-0.5 overflow-x-auto [scrollbar-width:none] " +
  "border-0 border-b border-solid border-border pb-1";

/**
 * The quick row: on the grid's eight columns, so its emoji line up with the grid's, over a rule. @internal
 *
 * @claim "on the grid's eight columns" registry/ouro/components/ouro/emoji-picker/emoji-picker-styles.ts verify:fileLine(registry/ouro/components/ouro/emoji-picker/emoji-picker-styles.ts, /"grid shrink-0 grid-cols-\[repeat\(8,minmax\(0,1fr\)\)\]/)
 */
const quickClass =
  "grid shrink-0 grid-cols-[repeat(8,minmax(0,1fr))] justify-items-center border-0 border-b border-solid border-border pb-1";

/**
 * An emoji: a 40px square, 44px on touch screens, with the native glyph at 24px. Hover tints
 * under a mouse only, and the press scale stops with reduced motion. Focus scrolls it clear of
 * its category's sticky heading. @internal
 *
 * @claim "a 40px square, 44px" registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx verify:testExists(registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx::EmojiPicker on the page > lines its eight columns up across the panel's width)
 * @claim "a 40px square, 44px" registry/ouro/components/ouro/emoji-picker/emoji-picker.touch.test.tsx verify:testExists(registry/ouro/components/ouro/emoji-picker/emoji-picker.touch.test.tsx::EmojiPicker on a phone > is a bottom sheet whose emoji, categories and tones are 44px touch targets, and a tap chooses)
 * @claim "a 40px square, 44px" registry/ouro/components/ouro/emoji-picker/emoji-picker-styles.ts verify:fileLine(registry/ouro/components/ouro/emoji-picker/emoji-picker-styles.ts, /size-10 shrink-0.*pointer-coarse:size-11 rounded-md border-0 bg-transparent text-2xl/)
 */
const cellClass =
  "press relative box-border flex size-10 shrink-0 cursor-pointer items-center justify-center m-0 p-0 " +
  "pointer-coarse:size-11 rounded-md border-0 bg-transparent text-2xl leading-none [-webkit-tap-highlight-color:transparent] " +
  "pointer-fine:hover:bg-accent motion-safe:active:scale-(--ouro-press-scale) scroll-mt-6 scroll-mb-1 " +
  "outline-ring -outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid";

/**
 * A category button: a square whose icon is grey and faint until it is the category in view,
 * or under a mouse. @internal
 */
const barButtonClass =
  "press relative box-border flex size-8 shrink-0 cursor-pointer items-center justify-center m-0 p-0 " +
  "pointer-coarse:size-11 rounded-md border-0 bg-transparent text-lg leading-none text-muted-foreground [-webkit-tap-highlight-color:transparent] " +
  "[&_svg]:size-4 pointer-fine:hover:bg-accent pointer-fine:hover:text-accent-foreground motion-safe:active:scale-(--ouro-press-scale) " +
  "aria-current:bg-accent aria-current:text-accent-foreground " +
  "[&:not([aria-current])>*]:grayscale [&:not([aria-current])>*]:opacity-70 pointer-fine:hover:[&>*]:grayscale-0 pointer-fine:hover:[&>*]:opacity-100 " +
  "[&>*]:transition-opacity [&>*]:duration-(--ouro-duration-fast) [&>*]:ease-(--ouro-ease-out) " +
  "forced-colors:aria-current:bg-[Highlight] forced-colors:aria-current:text-[HighlightText] " +
  "outline-ring -outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid";

/** A skin tone choice: the emoji in that tone, ringed while it is the chosen one. @internal */
const toneOptionClass =
  "press relative box-border flex size-9 shrink-0 cursor-pointer items-center justify-center m-0 p-0 " +
  "pointer-coarse:size-11 rounded-full border-2 border-solid border-transparent bg-transparent text-xl leading-none [-webkit-tap-highlight-color:transparent] " +
  "pointer-fine:hover:bg-accent motion-safe:active:scale-(--ouro-press-scale) " +
  "aria-checked:border-primary forced-colors:aria-checked:border-[Highlight] " +
  "outline-ring outline-offset-1 focus-visible:outline-2 focus-visible:outline-solid";

/** The grid's scrolling area: a fixed height, so the panel keeps its size while searching. @internal */
const scrollerClass = "relative box-border h-72 min-h-0 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]";

/** A category's heading, which stays at the top while its emoji scroll under it. @internal */
const headingClass = "sticky top-0 z-1 m-0 bg-popover px-1 py-1 text-xs leading-4 font-medium text-muted-foreground";

/**
 * A category's emoji, eight to a row. @internal
 *
 * @claim "eight to a row" registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx verify:testExists(registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx::EmojiPicker on the page > lines its eight columns up across the panel's width)
 */
const gridClass = "grid grid-cols-[repeat(8,minmax(0,1fr))] justify-items-center";

/** The name of the emoji in focus, under the grid. @internal */
const previewClass =
  "flex min-h-10 min-w-0 shrink-0 items-center gap-2 border-0 border-t border-solid border-border pt-2 text-sm leading-5 text-muted-foreground";

/** The emoji in focus, drawn large beside its name. @internal */
const previewGlyphClass = "text-2xl leading-none";
