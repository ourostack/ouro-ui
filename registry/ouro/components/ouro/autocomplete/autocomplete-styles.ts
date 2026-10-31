export { caretRect, filterItems, findMatch, insertText, matchAt };
export type { AutocompleteMatch };

// The caret arithmetic and DOM edits Autocomplete uses, apart from the component so its file
// exports only components and types (React Fast Refresh).

/**
 * A trigger the caret is in: which trigger, where its character is, and what follows it.
 *
 * @internal
 */
interface AutocompleteMatch {
  /** The trigger's index in `triggers`. */
  trigger: number;
  /** The index of the trigger character in the text. */
  start: number;
  /** The text between the trigger character and the caret. */
  query: string;
}

/**
 * The trigger the caret is in, or null: the nearest trigger character before the caret that
 * starts the text or follows a space or an opening bracket or quote, with no line break, and no
 * space unless `allowSpaces`, between it and the caret, and at least `minQueryLength`
 * characters after it.
 *
 * @internal
 * @claim "The trigger the caret is in, or null" registry/ouro/components/ouro/autocomplete/autocomplete.test.tsx verify:testExists(registry/ouro/components/ouro/autocomplete/autocomplete.test.tsx::Autocomplete text helpers > finds the nearest trigger before the caret, with its query)
 * @claim "The trigger the caret is in, or null" registry/ouro/components/ouro/autocomplete/autocomplete.test.tsx verify:testExists(registry/ouro/components/ouro/autocomplete/autocomplete.test.tsx::Autocomplete text helpers > finds none inside a word, across a line break or a space, before the shortest query, or after a space at the start)
 */
function findMatch(
  text: string,
  caret: number,
  triggers: ReadonlyArray<{ char: string; allowSpaces?: boolean | undefined; minQueryLength?: number | undefined }>,
): AutocompleteMatch | null {
  for (let start = caret - 1; start >= 0; start -= 1) {
    const character = text[start]!;
    if (character === "\n") return null;
    const trigger = triggers.findIndex((candidate) => candidate.char === character);
    if (trigger !== -1 && (start === 0 || /[\s([{"'“‘]/.test(text[start - 1]!))) {
      const { allowSpaces, minQueryLength = 0 } = triggers[trigger]!;
      const query = text.slice(start + 1, caret);
      if (/^\s/.test(query) || (!allowSpaces && /\s/.test(query)) || query.length < minQueryLength) return null;
      return { trigger, start, query };
    }
  }
  return null;
}

/**
 * The items for `query` from a list: those whose label, a word of it, or whose value starts
 * with it, ignoring case, in their order.
 *
 * @internal
 */
function filterItems<T extends { value: string; label: string }>(items: readonly T[], query: string): T[] {
  const needle = query.toLocaleLowerCase();
  return items.filter(
    (item) =>
      item.value.toLocaleLowerCase().startsWith(needle) ||
      item.label.toLocaleLowerCase().startsWith(needle) ||
      item.label.toLocaleLowerCase().split(/\s/).some((word) => word.startsWith(needle)),
  );
}

/**
 * Where `query` matches `label` for showing in bold: at its start or the start of one of its
 * words, ignoring case. A negative index means it matches neither.
 *
 * @internal
 */
function matchAt(label: string, query: string): number {
  if (query === "") return -1;
  const needle = query.toLocaleLowerCase();
  // Stryker disable next-line EqualityOperator: past the end the slice is empty, which no query (empty returned already) equals.
  for (let index = 0; index < label.length; index += 1) {
    if ((index === 0 || /\s/.test(label[index - 1]!)) && label.slice(index, index + query.length).toLocaleLowerCase() === needle) return index;
  }
  return -1;
}

/** The styles that decide where a character lands in a text control, copied to the mirror. */
const mirrored = [
  "boxSizing",
  "width",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderStyle",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "fontStyle",
  "fontVariant",
  "fontWeight",
  "fontStretch",
  "fontSize",
  "fontFamily",
  "lineHeight",
  "letterSpacing",
  "wordSpacing",
  "textTransform",
  "textIndent",
  "tabSize",
  "direction",
] as const;

/**
 * Where the character at `index` sits in a textarea or input, in viewport coordinates: a
 * zero-width box one line tall. It lays the text out again in a hidden copy of the control
 * with the same box and font, and measures a marker at `index` that holds the word starting
 * there, so a word that wraps takes the marker with it.
 *
 * @internal
 * @claim "Where the character at `index` sits" registry/ouro/components/ouro/autocomplete/autocomplete.test.tsx verify:testExists(registry/ouro/components/ouro/autocomplete/autocomplete.test.tsx::Autocomplete text helpers > measures the caret on a wrapped line and in a scrolled field)
 */
function caretRect(control: HTMLTextAreaElement | HTMLInputElement, index: number): DOMRect {
  const document = control.ownerDocument;
  const style = getComputedStyle(control);
  const textarea = control.tagName === "TEXTAREA";
  const mirror = document.createElement("div");
  // Out of sight and out of the page's flow; the marker's offsets are from the mirror's box.
  mirror.style.cssText = "position: absolute; top: 0; left: -9999px; visibility: hidden; overflow: hidden";
  for (const property of mirrored) mirror.style[property] = style[property];
  // A textarea wraps, and breaks a word too long for a line; an input keeps one line.
  mirror.style.whiteSpace = textarea ? "pre-wrap" : "pre";
  mirror.style.overflowWrap = "break-word";
  mirror.textContent = control.value.slice(0, index);
  const marker = document.createElement("span");
  // The word that starts at `index`, so the marker wraps to the next line where that word does,
  // or a dot, so it has a line box even at the end of the text.
  marker.textContent = control.value.slice(index).split(/\s/, 1)[0] || ".";
  mirror.append(marker);
  document.body.append(mirror);
  const box = control.getBoundingClientRect();
  const top = box.top + marker.offsetTop - control.scrollTop;
  const left = box.left + marker.offsetLeft - control.scrollLeft;
  const height = marker.offsetHeight;
  mirror.remove();
  return new DOMRect(left, top, 0, height);
}

/**
 * Replaces the text from `start` to `end` with `text` and puts the caret after it, as typing
 * would: through the browser's insertText command, which keeps undo, or, where that is not
 * available, with `setRangeText` and an `input` event, so React's change handlers run.
 *
 * @internal
 */
function insertText(control: HTMLTextAreaElement | HTMLInputElement, start: number, end: number, text: string): void {
  control.focus();
  control.setSelectionRange(start, end);
  // `execCommand` is deprecated but is still the only edit that joins the undo stack.
  // Stryker disable next-line BooleanLiteral: browsers ignore execCommand's showUI argument.
  if (control.ownerDocument.execCommand("insertText", false, text)) return;
  control.setRangeText(text, start, end, "end");
  control.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertReplacementText", data: text }));
}
