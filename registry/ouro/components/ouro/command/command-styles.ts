export {
  commandCloseClass,
  commandEmptyClass,
  commandEmptyRoomClass,
  commandNoMatchClass,
  commandGroupLabelClass,
  commandInputClass,
  commandItemClass,
  commandListClass,
  commandListboxClass,
  commandLoadingClass,
  commandLoadingRowClass,
  commandSearchClass,
  commandSheetListClass,
  commandSheetSearchClass,
  commandMarkClass,
  commandRecentClass,
  commandRecentsClass,
  matchesQuery,
  oneEditApart,
  queryMatch,
  queryRanges,
  type QueryMatch,
  type TextRange,
};

// Class strings and the search for Command, apart from the component so command.tsx exports
// only components (React Fast Refresh). Class strings are literals so the app's Tailwind finds them.

/**
 * The search row at the top of the palette: a magnifier and the input, over a hairline that takes the ring
 * colour while the input has keyboard focus.
 *
 * @internal
 * @claim "over a hairline that takes the" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command search focus > draws the search row's line in the ring colour while the search input has keyboard focus)
 */
const commandSearchClass =
  "box-border flex shrink-0 items-center gap-2 border-0 border-b border-solid border-border has-[input:focus-visible]:border-ring px-4 text-muted-foreground [&>svg]:size-ouro-4 [&>svg]:shrink-0";

/**
 * The search row in the phone sheet: pinned to the top of the sheet's scrolling body, its field
 * ending clear of the sheet's close button in the top corner.
 *
 * @internal
 */
const commandSheetSearchClass =
  "sticky top-0 z-1 -mx-5 -mt-2 mb-1 box-border flex items-center gap-2 border-0 border-b border-solid border-border has-[input:focus-visible]:border-ring bg-popover ps-5 pe-14 text-muted-foreground [&>svg]:size-ouro-4 [&>svg]:shrink-0";

/**
 * The search input: borderless, 48px tall, 16px text on a coarse pointer (so iOS does not
 * zoom) and 14px with a fine pointer.
 *
 * @internal
 * @claim "The search input: borderless, 48px tall" registry/ouro/components/ouro/command/command.touch.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.touch.test.tsx::Command on a phone > opens from a tap as a full-height sheet focused on itself, with 44px commands and a 16px search input)
 * @claim "The search input: borderless, 48px tall" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command > keeps its size while results filter, so the search input stays put)
 */
const commandInputClass =
  "m-0 box-border h-12 min-w-0 flex-1 border-0 bg-transparent p-0 font-[inherit] text-base pointer-fine:text-sm text-popover-foreground outline-none placeholder:text-muted-foreground";

/**
 * "Searching…" at the end of the search row while results load; it never moves the input.
 *
 * @internal
 * @claim "at the end of the search row while" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command > keeps its size while results filter, so the search input stays put)
 * @claim "at the end of the search row while" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command server search > says it is searching politely, once while typing goes on, and shows the empty state only after loading)
 */
const commandLoadingClass = "shrink-0 text-xs leading-4 text-muted-foreground";

/**
 * The results: a fixed height in the dialog, so the dialog keeps its size (and the input its
 * place) while results filter. The list inside it scrolls (`commandListboxClass`).
 *
 * @internal
 */
const commandListClass = "box-border flex h-[min(22rem,60dvh)] flex-col outline-none";

/**
 * The list of results in the dialog, which scrolls itself: it is the search's own popup, so the
 * arrow keys from the search scroll it, and nothing but the search takes Tab, as in any combobox.
 * A box around the list that scrolled would be a region no keyboard could reach (axe
 * `scrollable-region-focusable`).
 *
 * @internal
 * @claim "A box around the list that scrolled" https://dequeuniversity.com/rules/axe/4.10/scrollable-region-focusable verify:urlOk(https://dequeuniversity.com/rules/axe/4.10/scrollable-region-focusable)
 * @claim "it is the search's own popup" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command > scrolls a long list by the arrow keys from the search, which keeps focus and Tab, and passes axe)
 */
const commandListboxClass = "box-border min-h-0 overflow-y-auto overscroll-contain p-1 scroll-py-1 outline-none";

/**
 * The results in the phone sheet, which scroll with the sheet's body; the sheet keeps its
 * full height.
 *
 * @internal
 */
const commandSheetListClass = "box-border -mx-3 outline-none";

/**
 * A group's heading: small and muted.
 *
 * @internal
 */
const commandGroupLabelClass = "box-border px-2 pt-2 pb-1 text-xs leading-4 font-medium text-muted-foreground select-none";

/**
 * One command: 44px tall with 16px text on a coarse pointer, 36px and 14px with a fine
 * pointer, highlighted by keyboard or pointer, dimmed when disabled.
 *
 * @internal
 * @claim "One command: 44px tall with 16px" registry/ouro/components/ouro/command/command.touch.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.touch.test.tsx::Command on a phone > opens from a tap as a full-height sheet focused on itself, with 44px commands and a 16px search input)
 * @claim "One command: 44px tall with 16px" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command > moves the highlight with the arrow keys)
 */
const commandItemClass =
  "relative box-border flex min-h-ouro-11 pointer-fine:min-h-9 cursor-default items-center gap-3 rounded-ouro-md px-2 py-1.5 " +
  "text-base leading-5 pointer-fine:text-sm text-popover-foreground outline-none select-none [-webkit-tap-highlight-color:transparent] " +
  "data-highlighted:bg-accent data-highlighted:text-accent-foreground group-data-chips-active/command:data-highlighted:bg-transparent group-data-chips-active/command:data-highlighted:text-inherit active:bg-accent active:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 " +
  // Forced colours drop the fill, so the highlight takes the system's pair.
  "forced-colors:data-highlighted:bg-[Highlight] forced-colors:data-highlighted:text-[HighlightText]";

/**
 * The close button: always present for screen readers (a phone has no Escape key), hidden
 * from view until it has keyboard focus, then shown at the top corner.
 *
 * @internal
 * @claim "The close button: always present for" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command > labels the search input and its close button, translated)
 */
const commandCloseClass =
  "sr-only focus-visible:top-2 focus-visible:end-2 focus-visible:z-1 focus-visible:m-0 focus-visible:size-auto " +
  "focus-visible:overflow-visible focus-visible:[clip-path:none] focus-visible:px-2 focus-visible:py-1 " +
  "focus-visible:rounded-ouro-md focus-visible:bg-muted focus-visible:text-foreground focus-visible:text-xs focus-visible:leading-4 focus-visible:font-medium " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * The empty state's message.
 *
 * @internal
 */
const commandEmptyClass = "box-border px-2 py-8 text-center text-sm leading-5 text-muted-foreground";

/** The empty state above rows shown whatever the search is: the empty state's words, with less room, since rows follow. */
const commandNoMatchClass = "box-border px-2 py-3 text-center text-sm leading-5 text-muted-foreground";

/**
 * Around the empty state in the dialog: while it shows, it takes the room the results had and centres
 * the message in it, so it does not hang at the top of a blank box. With results it takes none. The phone
 * sheet's results have no fixed room, so there the message stays at the top, above the keyboard.
 *
 * @internal
 * @claim "while it shows, it takes the room" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command > centres the empty state in the room the results had, and gives the results all of it again)
 * @claim "With results it takes none" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command > centres the empty state in the room the results had, and gives the results all of it again)
 * @claim "The phone sheet's results have no fixed room" registry/ouro/components/ouro/command/command.touch.test.tsx verify:fileLine(registry/ouro/components/ouro/command/command.touch.test.tsx, /The empty state sits right under the search/)
 */
const commandEmptyRoomClass = "flex flex-col justify-center has-[>[data-ouro-command-empty]]:flex-1";

/** Lower case, without accents, so "Thème" matches "theme". */
function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase();
}

/**
 * Whether `typed` becomes `word` with at most one edit: a letter dropped, added or changed, or two
 * neighbouring letters swapped.
 *
 * @internal
 * @claim "Whether `typed` becomes `word` with at" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command > forgives one slip in a word of four letters or more: a letter dropped, added, changed, or two swapped)
 */
function oneEditApart(typed: string, word: string): boolean {
  // Stryker disable next-line ConditionalExpression: equivalent; words two or more letters apart fail every comparison below, as their rests differ in length.
  if (Math.abs(typed.length - word.length) > 1) return false;
  let same = 0;
  // Stryker disable next-line ConditionalExpression,EqualityOperator: equivalent; queryMatch asks only about a word the text lacks, so typed is never the same as word and the two differ, or one ends, before typed does.
  while (same < typed.length && typed[same] === word[same]) same++;
  const rest = (from: number, to: number) => typed.slice(from) === word.slice(to);
  if (typed.length < word.length) return rest(same, same + 1);
  if (typed.length > word.length) return rest(same + 1, same);
  return rest(same + 1, same + 1) || (typed[same] === word[same + 1] && typed[same + 1] === word[same] && rest(same + 2, same + 2));
}

/**
 * How well a command matches a query, best first: 0 when its label starts with the query, 1 when it holds the query's
 * words, 2 when a word is one slip away.
 *
 * @claim "How well a command matches a" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command > ranks a command that starts with the search first, then one that holds it, then one a slip away)
 */
type QueryMatch = 0 | 1 | 2;

/**
 * How a command matches the query, or undefined when it does not: every word of the query appears
 * in its label or keywords, ignoring case and accents (0 when the label starts with the first
 * word, else 1), or else each word that does not is four letters or more and one edit from a word
 * there, or from the start of one (2).
 *
 * @internal
 * @claim "How a command matches the query" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command > ranks a command that starts with the search first, then one that holds it, then one a slip away)
 */
function queryMatch(label: string, keywords: readonly string[], query: string): QueryMatch | undefined {
  const text = fold([label, ...keywords].join(" "));
  // Stryker disable next-line Regex: an empty word between two spaces is in every text, as the one empty word they make is.
  const words = fold(query).split(/\s+/);
  if (words.every((word) => text.includes(word))) return fold(label).startsWith(words[0]!) ? 0 : 1;
  // Words split on anything but letters, their marks and digits, so a Devanagari vowel sign stays in its word.
  const tokens = text.split(/[^\p{L}\p{M}\p{N}]/u);
  // A word of five letters or more may also be a slip of a word's start ("confrim" for Confirmation); a shorter one
  // only of a whole word, or it would find every word sharing its first three letters.
  // Stryker disable next-line ArrayDeclaration: a word shorter than five letters is one edit from no part but the token, whatever the list holds.
  const starts = (word: string, token: string) => (word.length >= 5 ? [token.slice(0, word.length - 1), token.slice(0, word.length), token.slice(0, word.length + 1)] : []);
  const near = (word: string) => word.length >= 4 && tokens.some((token) => [token, ...starts(word, token)].some((part) => oneEditApart(word, part)));
  return words.every((word) => text.includes(word) || near(word)) ? 2 : undefined;
}

/**
 * Whether a command matches the query: every word of the query appears in its label or
 * keywords, ignoring case and accents, or is one slip from a word there (`queryMatch`).
 *
 * @internal
 * @claim "Whether a command matches the query" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command > filters by label and keywords, ignoring case and accents, and hides empty groups)
 */
function matchesQuery(label: string, keywords: readonly string[], query: string): boolean {
  return queryMatch(label, keywords, query) !== undefined;
}

/**
 * A row's shape while results are on their way: the item's own height, padding and line, so
 * the results that arrive take its place without moving the rows around them.
 *
 * @internal
 */
const commandLoadingRowClass =
  "box-border flex min-h-ouro-11 pointer-fine:min-h-9 items-center gap-3 px-2 py-1.5 text-base leading-5 pointer-fine:text-sm";

/** A range of a text, from `start` up to, and not including, `end`. */
type TextRange = readonly [start: number, end: number];

/**
 * Folds a text character by character, so a character that folds to an empty string (a standalone
 * accent such as a middle dot) keeps its place instead of dropping out. Returns the folded text
 * alongside, for a folded index, the original text's matching index.
 */
function foldKeepingPlaces(text: string): { folded: string; places: number[] } {
  let folded = "";
  const places: number[] = [];
  let at = 0;
  for (const char of text) {
    const piece = fold(char) || char;
    for (let i = 0; i < piece.length; i++) places.push(at);
    folded += piece;
    at += char.length;
  }
  return { folded, places };
}

/**
 * Where the words of a query appear in a text, ignoring case and accents, merged where they touch,
 * in order. Folds the text character by character and maps folded positions back to the original
 * text, so a standalone accent that folds to an empty string keeps its place and a range lands on
 * the text as written.
 *
 * @internal
 * @claim "Where the words of a query" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command match highlighting > marks the words of the search in each command's label and description, and keeps the text as it was)
 */
function queryRanges(text: string, query: string): TextRange[] {
  const { folded, places } = foldKeepingPlaces(text);
  const ranges: [number, number][] = [];
  // Stryker disable next-line Regex: an empty word between two spaces is dropped by the filter after it.
  for (const word of fold(query).split(/\s+/).filter(Boolean)) {
    for (let at = folded.indexOf(word); at !== -1; at = folded.indexOf(word, at + word.length)) {
      const end = at + word.length;
      ranges.push([places[at]!, end < places.length ? places[end]! : text.length]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push(range);
  }
  return merged;
}

/**
 * A marked word: a tint of the primary colour behind the text colour, in semibold, and the system's
 * mark colours under forced colours.
 *
 * @internal
 * @claim "A marked word: a tint of" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command match highlighting > draws marked words that keep their contrast in light and dark, highlighted or not, and in forced colours)
 */
const commandMarkClass =
  "rounded-[0.2em] bg-[color-mix(in_oklab,var(--primary)_22%,transparent)] font-semibold text-foreground " +
  "forced-colors:bg-[Mark] forced-colors:text-[MarkText]";

/** The single row of recent chips under the search: it scrolls sideways rather than wrapping. @internal */
const commandRecentsClass = "box-border flex shrink-0 gap-2 overflow-x-auto overscroll-x-contain border-0 border-b border-solid border-border px-4 py-2";

/** One recent chip: a quiet pill that shows focus and press. @internal */
const commandRecentClass =
  "press relative box-border inline-flex min-h-ouro-8 shrink-0 cursor-default items-center gap-1.5 rounded-ouro-4xl border-0 bg-secondary px-3 text-sm leading-5 text-secondary-foreground outline-none data-highlighted:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
