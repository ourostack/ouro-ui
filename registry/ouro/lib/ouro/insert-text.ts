export { insertText };

/**
 * Replaces the text from `start` to `end` with `text` and puts the caret after it, as typing
 * would: through the browser's insertText command, which keeps undo, or, where that is not
 * available, with `setRangeText` and an `input` event, so React's change handlers run.
 * Autocomplete inserts a pick with it, and Composer an emoji's token.
 *
 * Internal: Ouro UI components use it; apps don't need to.
 *
 * @claim "which keeps undo" registry/ouro/lib/ouro/insert-text.test.ts verify:testExists(registry/ouro/lib/ouro/insert-text.test.ts::replaces the range and puts the caret after it, in one step undo takes out)
 * @claim "where that is not available" registry/ouro/lib/ouro/insert-text.test.ts verify:testExists(registry/ouro/lib/ouro/insert-text.test.ts::inserts with setRangeText and an input event where insertText is not available)
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
