import type { TextAreaHighlight } from "@/registry/ouro/components/ouro/text-field/text-area";
import type { DevWarning } from "@/registry/ouro/lib/ouro/use-dev-messages";
import { renamedTones } from "@/registry/ouro/lib/ouro/tones";

export {
  describeHighlights,
  fitHeight,
  highlightLayerClass,
  highlightRuns,
  highlightTone,
  highlightTones,
  highlightWarnings,
  highlightsKey,
  mirroredStyles,
  moveHighlights,
  normalizeHighlights,
  textAreaClass,
  textAreaSizes,
  textAreaVariants,
};
export type { HighlightEdit, HighlightRun };

// Class strings and the autoGrow measurement for TextArea, apart from the component so its
// file exports only components (React Fast Refresh). Class strings are literal so the app's
// Tailwind finds them when it compiles.

/**
 * The textarea, whatever its variant and size. The user can drag its height unless it grows
 * by itself.
 *
 * @internal
 */
const textAreaClass =
  "m-0 box-border block w-full min-w-0 rounded-md text-foreground " +
  "font-[inherit] placeholder:text-muted-foreground " +
  "outline-ring outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid " +
  "disabled:cursor-not-allowed disabled:opacity-50";

/**
 * The textarea's frame. `outline` is Field's control look. `plain` draws no border,
 * background or padding, for a textarea inside a frame the app draws (a chat composer); it
 * keeps the corner radius, which only the focus outline shows.
 *
 * @internal
 * @claim "`plain` draws no border, background or" registry/ouro/components/ouro/text-field/text-area.test.tsx verify:testExists(registry/ouro/components/ouro/text-field/text-area.test.tsx::TextArea variant and size > draws no frame of its own with variant plain, and still outlines on keyboard focus)
 */
const textAreaVariants = {
  outline:
    "px-3 py-2 border border-solid border-input bg-transparent " +
    "transition-[border-color] duration-(--ouro-duration-fast) ease-[ease] " +
    "aria-invalid:border-destructive dark:bg-input/30",
  plain: "p-0 border-0 bg-transparent",
} as const;

/**
 * The textarea's font size. `md` is a 16px font on 24px lines on phones (iOS zooms into
 * smaller text on focus), stepping down to 14px on 20px lines from the `sm` breakpoint with a
 * fine pointer, so a landscape phone keeps the phone size. `lg` is 20px on 28px lines at
 * every width.
 *
 * @internal
 * @claim "`lg` is 20px on 28px lines" registry/ouro/components/ouro/text-field/text-area.test.tsx verify:testExists(registry/ouro/components/ouro/text-field/text-area.test.tsx::TextArea variant and size > sets 20px text on 28px lines with size lg, at phone and desktop widths)
 * @claim "`md` is a 16px font on" registry/ouro/components/ouro/text-field/text-area.test.tsx verify:testExists(registry/ouro/components/ouro/text-field/text-area.test.tsx::TextArea > uses a 16px font on phones, so iOS does not zoom on focus)
 */
const textAreaSizes = {
  md: "text-base leading-6 sm:pointer-fine:text-sm sm:pointer-fine:leading-5",
  lg: "text-xl leading-7",
} as const;

/**
 * Sizes a textarea to its content, between `rows` and `maxRows` lines, and lets it scroll
 * only once it is capped. Only an `autoGrow` TextArea calls it; without `autoGrow` the
 * inline height belongs to the user's resize handle.
 *
 * @internal
 */
function fitHeight(textarea: HTMLTextAreaElement, rows: number, maxRows: number | undefined): void {
  const style = getComputedStyle(textarea);
  const line = parseFloat(style.lineHeight);
  const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  const border = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
  const min = rows * line + padding + border;
  const max = maxRows === undefined ? Infinity : Math.max(min, maxRows * line + padding + border);
  // Collapse first so scrollHeight measures the content, not the current height.
  textarea.style.height = `${min}px`;
  const needed = textarea.scrollHeight + border;
  textarea.style.height = `${Math.min(Math.max(needed, min), max)}px`;
  textarea.style.overflowY = needed > max + 0.5 ? "auto" : "hidden";
}

/**
 * The layer that draws the marks: the textarea's text again, transparent, in the same box,
 * so a mark wraps as its words do. It sits over the textarea, and the pointer passes through
 * it. Its text keeps the textarea's colour, so contrast checkers read it as they read the
 * textarea's, but is filled transparent. Forced colours leave it alone, so its text stays
 * transparent and the underlines show, in the system's text colour.
 *
 * @internal
 */
const highlightLayerClass =
  "pointer-events-none absolute inset-0 box-border overflow-hidden border-solid border-transparent " +
  "[-webkit-text-fill-color:transparent] whitespace-pre-wrap break-words select-none forced-color-adjust-none";

/**
 * The marks' looks, by tone. `destructive` and `warning` draw a wavy underline, as spelling and
 * grammar checkers do; the others a dotted underline on a faint tint of the tone. The line's
 * style says it is a mark, so colour is not the only sign of it.
 *
 * @internal
 */
const highlightTones = {
  primary: "bg-primary/10 underline decoration-primary decoration-dotted decoration-2 underline-offset-4",
  secondary: "bg-muted underline decoration-muted-foreground decoration-dotted decoration-2 underline-offset-4",
  success: "bg-success/10 underline decoration-success decoration-dotted decoration-2 underline-offset-4",
  destructive: "underline decoration-destructive decoration-wavy decoration-[1.5px] underline-offset-4",
  warning: "underline decoration-warning decoration-wavy decoration-[1.5px] underline-offset-4",
} as const;

/**
 * The textarea's computed styles the layer copies, so its text sits exactly on the
 * textarea's. Paddings and border widths place it; the rest lay the text out.
 *
 * @internal
 */
const mirroredStyles = [
  "color",
  "boxSizing",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "fontStretch",
  "fontVariant",
  "fontFeatureSettings",
  "lineHeight",
  "letterSpacing",
  "wordSpacing",
  "textIndent",
  "textTransform",
  "textAlign",
  "tabSize",
  "direction",
  "wordBreak",
  "overflowWrap",
  "hyphens",
] as const;

/** Where an edit happened: the selection when it began, and the caret after it. @internal */
interface HighlightEdit {
  before: { start: number; end: number };
  caret: number;
}

/** A run of the text, marked by the highlight at index `mark`, or unmarked. @internal */
interface HighlightRun {
  text: string;
  mark: number | undefined;
}

/**
 * The highlights that fit the text, in order, clamped into it, without the ones that end up
 * empty or are not numbers.
 *
 * @internal
 */
function normalizeHighlights(highlights: readonly TextAreaHighlight[] | undefined, length: number): TextAreaHighlight[] {
  const kept: TextAreaHighlight[] = [];
  // Stryker disable next-line ArrayDeclaration: anything in the fallback has no start or end, so it is left out as a mark that is not a number.
  for (const highlight of highlights ?? []) {
    const start = Math.max(0, Math.min(length, Math.trunc(highlight.start)));
    const end = Math.max(0, Math.min(length, Math.trunc(highlight.end)));
    if (end > start) kept.push({ ...highlight, start, end });
  }
  return kept;
}

/** A string that changes exactly when the highlights do, whatever array holds them. @internal */
function highlightsKey(highlights: readonly TextAreaHighlight[] | undefined): string {
  // Stryker disable next-line ArrayDeclaration: no highlights need only a key of their own, whatever it reads.
  return JSON.stringify((highlights ?? []).map(({ start, end, tone, label, id }) => [start, end, tone, label, id]));
}

/**
 * The lengths of the unchanged start and end around an edit: the longest unchanged start,
 * then the longest unchanged end. When the new text matches its neighbours, the change could
 * sit in more than one place; the selection says where the person made it.
 */
function unchanged(before: string, after: string, edit: HighlightEdit | null): [number, number] {
  let start = 0;
  const shortest = Math.min(before.length, after.length);
  // Past the shorter text's end its character reads undefined, unequal to the other's, since the texts differ: the bound only stops the scan sooner.
  // Stryker disable next-line ConditionalExpression,EqualityOperator: as above.
  while (start < shortest && before[start] === after[start]) start++;
  let end = 0;
  while (end < shortest - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
  if (edit) {
    const at = Math.min(edit.before.start, edit.caret);
    const rest = after.length - edit.caret;
    if (at + rest === start + end && before.slice(0, at) === after.slice(0, at) && before.endsWith(after.slice(edit.caret))) return [at, rest];
  }
  return [start, end];
}

/**
 * The highlights after the text changes from `before` to `after`. A mark keeps the characters
 * it marked: typed or pasted text is left unmarked, a mark the edit falls inside splits around
 * it, and a mark whose characters are gone is dropped.
 *
 * @internal
 */
function moveHighlights(highlights: readonly TextAreaHighlight[], before: string, after: string, edit: HighlightEdit | null): TextAreaHighlight[] {
  const [head, tail] = unchanged(before, after, edit);
  const removedEnd = before.length - tail;
  const shift = after.length - before.length;
  const moved: TextAreaHighlight[] = [];
  for (const highlight of highlights) {
    // The part before the edit stays where it was, and the part after it moves with the text.
    const before = Math.min(highlight.end, head);
    if (highlight.start < before) moved.push({ ...highlight, end: before });
    const after = Math.max(highlight.start, removedEnd);
    if (after < highlight.end) moved.push({ ...highlight, start: after + shift, end: highlight.end + shift });
  }
  return moved;
}

/**
 * The text cut where a mark starts or ends, with the mark that shows on a run: where marks
 * overlap, the later one in the array.
 *
 * @internal
 */
function highlightRuns(text: string, highlights: readonly TextAreaHighlight[]): HighlightRun[] {
  const points = [...new Set([0, text.length, ...highlights.flatMap((highlight) => [highlight.start, highlight.end])])].sort((a, b) => a - b);
  const runs: HighlightRun[] = [];
  points.slice(1).forEach((to, index) => {
    const from = points[index]!;
    let mark: number | undefined;
    highlights.forEach((highlight, at) => {
      if (highlight.start <= from && highlight.end >= to) mark = at;
    });
    // A mark split only by another mark's edge stays one run, so its tint has no seam.
    const last = runs.at(-1);
    if (last && last.mark === mark) last.text += text.slice(from, to);
    else runs.push({ text: text.slice(from, to), mark });
  });
  return runs;
}

/** How many words the description quotes from a mark before it shortens it. */
const quotedWords = 8;

/** A mark's text as the description quotes it: spaces folded, and long ones shortened. */
function quote(text: string): string {
  const words = text.trim().split(/\s+/);
  return `\u201c${words.length > quotedWords ? `${words.slice(0, quotedWords).join(" ")}\u2026` : words.join(" ")}\u201d`;
}

/**
 * What screen readers hear about the marks, after the field's own description: the labels in
 * the order they first appear, with the words they mark. "Suggested by your assistant: “Thanks
 * for the notes”, “see you Tuesday”."
 *
 * @internal
 */
function describeHighlights(text: string, highlights: readonly TextAreaHighlight[]): string {
  const byLabel = new Map<string, string[]>();
  for (const highlight of highlights) {
    const words = text.slice(highlight.start, highlight.end);
    if (words.trim() === "") continue;
    const quotes = byLabel.get(highlight.label) ?? [];
    quotes.push(quote(words));
    byLabel.set(highlight.label, quotes);
  }
  return [...byLabel].map(([label, quotes]) => `${label}: ${quotes.join(", ")}.`).join(" ");
}

/** A highlight's tone, or `primary` for one that is not a tone. @internal */
function highlightTone(highlight: TextAreaHighlight): keyof typeof highlightTones {
  // Stryker disable next-line StringLiteral: a tone that is not one renders primary anyway.
  const tone = highlight.tone ?? "primary";
  return Object.hasOwn(highlightTones, tone) ? (tone as keyof typeof highlightTones) : "primary";
}

/**
 * The dev messages for `highlights`: the first unlabelled mark, the first that marks
 * nothing and the first with an unknown tone. Development only.
 *
 * @internal
 */
function highlightWarnings(highlights: readonly TextAreaHighlight[] | undefined): DevWarning[] {
  const list = highlights ?? [];
  const unlabeled = list.findIndex((highlight) => typeof highlight.label !== "string" || highlight.label.trim() === "");
  const empty = list.findIndex((highlight) => !(highlight.end > highlight.start));
  const untoned = list.findIndex((highlight) => highlightTone(highlight) !== (highlight.tone ?? "primary"));
  const tone = String(list[untoned]?.tone);
  const renamed = Object.hasOwn(renamedTones, tone) ? renamedTones[tone] : undefined;
  return [
    unlabeled >= 0 && [
      `highlights[${unlabeled}] has no label, so screen readers cannot say what it marks`,
      '<TextArea highlights={[{ start: 0, end: 5, label: "Suggested by your assistant" }]}>',
    ],
    empty >= 0 && [
      `highlights[${empty}] ends where it starts or before, so it marks nothing`,
      "<TextArea highlights={[{ start: 0, end: 5, label }]}> with end after start",
    ],
    untoned >= 0 && [
      `highlights[${untoned}] has tone="${tone}", which is not a tone${renamed ? "" : `; use ${Object.keys(highlightTones).map((name) => `"${name}"`).join(", ")}`}`,
      `<TextArea highlights={[{ start: 0, end: 5, label: "Possible spelling mistake", tone: "${renamed ?? "destructive"}" }]}>`,
    ],
  ];
}
