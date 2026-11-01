export { insertText };

/**
 * Replaces the text from `start` to `end` in a text field with `text`, and puts the caret after
 * it, as typing would: through the browser's insertText command, which joins the field's undo
 * stack, so Undo and Redo step through it, or, where that is not available, with `setRangeText`
 * and an `input` event, so React's change handlers run. It focuses the field without scrolling
 * any box around it.
 *
 * @example
 * insertText(textarea, 3, 6, "@Jordan Lee ");
 * @internal
 */
function insertText(control: HTMLTextAreaElement | HTMLInputElement, start: number, end: number, text: string): void {
  control.focus({ preventScroll: true });
  control.setSelectionRange(start, end);
  // `execCommand` is deprecated but is still the only edit that joins the undo stack.
  // Stryker disable next-line BooleanLiteral: browsers ignore execCommand's showUI argument.
  if (control.ownerDocument.execCommand("insertText", false, text)) return;
  control.setRangeText(text, start, end, "end");
  control.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertReplacementText", data: text }));
}
