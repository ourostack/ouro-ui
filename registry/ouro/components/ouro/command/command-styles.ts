export {
  commandCloseClass,
  commandEmptyClass,
  commandGroupLabelClass,
  commandInputClass,
  commandItemClass,
  commandListClass,
  commandLoadingClass,
  commandSearchClass,
  commandSheetListClass,
  commandSheetSearchClass,
  commandMarkClass,
  matchesQuery,
  queryRanges,
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
  "box-border flex shrink-0 items-center gap-2 border-0 border-b border-solid border-border has-[input:focus-visible]:border-ring px-4 text-muted-foreground [&>svg]:size-4 [&>svg]:shrink-0";

/**
 * The search row in the phone sheet: pinned to the top of the sheet's scrolling body.
 *
 * @internal
 */
const commandSheetSearchClass =
  "sticky top-0 z-1 -mx-5 -mt-2 mb-1 box-border flex items-center gap-2 border-0 border-b border-solid border-border has-[input:focus-visible]:border-ring bg-popover px-5 text-muted-foreground [&>svg]:size-4 [&>svg]:shrink-0";

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
 * place) while results filter.
 *
 * @internal
 */
const commandListClass = "box-border h-[min(22rem,60dvh)] overflow-y-auto overscroll-contain p-1 outline-none";

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
  "relative box-border flex min-h-11 pointer-fine:min-h-9 cursor-default items-center gap-3 rounded-md px-2 py-1.5 " +
  "text-base leading-5 pointer-fine:text-sm text-popover-foreground outline-none select-none [-webkit-tap-highlight-color:transparent] " +
  "data-highlighted:bg-accent data-highlighted:text-accent-foreground active:bg-accent active:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 " +
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
  "focus-visible:rounded-md focus-visible:bg-muted focus-visible:text-foreground focus-visible:text-xs focus-visible:leading-4 focus-visible:font-medium " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * The empty state's message.
 *
 * @internal
 */
const commandEmptyClass = "box-border px-2 py-8 text-center text-sm leading-5 text-muted-foreground";

/** Lower case, without accents, so "Thème" matches "theme". */
function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase();
}

/**
 * Whether a command matches the query: every word of the query appears in its label or
 * keywords, ignoring case and accents.
 *
 * @internal
 * @claim "Whether a command matches the query" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command > filters by label and keywords, ignoring case and accents, and hides empty groups)
 */
function matchesQuery(label: string, keywords: readonly string[], query: string): boolean {
  const text = fold([label, ...keywords].join(" "));
  return fold(query)
    .split(/\s+/)
    .every((word) => text.includes(word));
}

/** A range of a text, from `start` up to, and not including, `end`. */
type TextRange = readonly [start: number, end: number];

/**
 * Where the words of a query appear in a text, ignoring case and accents, merged where they touch,
 * in order. Nothing when folding the text changes its length, so a range would land off its letters.
 *
 * @internal
 * @claim "Where the words of a query" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command match highlighting > marks the words of the search in each command's label and description, and keeps the text as it was)
 */
function queryRanges(text: string, query: string): TextRange[] {
  const folded = fold(text);
  if (folded.length !== text.length) return [];
  const ranges: [number, number][] = [];
  // Stryker disable next-line Regex: an empty word between two spaces is dropped by the filter after it.
  for (const word of fold(query).split(/\s+/).filter(Boolean)) {
    for (let at = folded.indexOf(word); at !== -1; at = folded.indexOf(word, at + word.length)) ranges.push([at, at + word.length]);
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
