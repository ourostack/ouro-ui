export { lastInput };

// The pointer type of the last `pointerdown` on the document, or "keyboard" after a later key press.
let input = "";

/**
 * How the user last interacted with the page: "mouse", "touch" or "pen" (the last
 * `pointerdown`), "keyboard" after a later key press, or "" before either.
 * Overlays read it when they open: a controlled `Dialog` focuses its popup rather
 * than its first input after a tap (the app's own button opened it, so Dialog never
 * saw the press), and a `Tooltip` never opens after a touch.
 *
 * Internal: Ouro UI components use it; apps don't need to.
 *
 * @example
 * const tapped = lastInput() === "touch" || lastInput() === "pen";
 */
function lastInput(): string {
  return input;
}

// From module load, not from the first overlay's mount: an app that mounts its Dialog on
// the tap that opens it (`{editing && <Dialog open … />}`) must still see that tap. The
// capture phase means nothing can stop it.
/* istanbul ignore else @preserve -- the else path is server rendering, which has no document */
if (typeof document !== "undefined") {
  document.addEventListener("pointerdown", (event) => (input = event.pointerType), true);
  document.addEventListener("keydown", () => (input = "keyboard"), true);
}
