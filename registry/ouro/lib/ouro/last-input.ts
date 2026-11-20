export { lastInput };

const modifierKeys = new Set(["Shift", "Control", "Alt", "Meta", "AltGraph", "CapsLock"]);

/** The mark ouro-base's keyboard-only focus rings read: on the focused element, while its focus came from a press. */
const PRESSED_FOCUS = "data-ouro-pressed-focus";

// The modality of the last press or key, once there has been one.
let current: "keyboard" | "pointer" | undefined;

// Marks an element that has focus after a press, and unmarks it after a key: one element's attribute, so a switch
// between keyboard and pointer restyles the element that has focus, not every element a rule on <html> reaches (#2524).
function mark(element: EventTarget | null): void {
  // The page itself holds focus when nothing does; it is no control and draws no ring.
  if (!(element instanceof Element) || element === document.body || element === document.documentElement) return;
  if (current === "pointer") {
    if (!element.hasAttribute(PRESSED_FOCUS)) element.setAttribute(PRESSED_FOCUS, "");
  } else if (element.hasAttribute(PRESSED_FOCUS)) element.removeAttribute(PRESSED_FOCUS);
}

// Written to <html> only when it changes, and only after the first press or key: the server HTML and the
// first client render carry no attribute, so hydration never differs, and reading it forces no layout. No Ouro rule
// reads it; the focused element's mark is what the focus rings follow.
function modality(next: "keyboard" | "pointer"): void {
  current = next;
  const root = document.documentElement;
  if (root.getAttribute("data-ouro-modality") !== next) root.setAttribute("data-ouro-modality", next);
  mark(document.activeElement);
}

// The pointer type of the last `pointerdown` (or mouse or pen `pointermove`) on the document, or "keyboard" after a later key press.
let input = "";

/**
 * How the user last interacted with the page: "mouse", "touch" or "pen" (the last
 * `pointerdown`, or a mouse or pen moving), "keyboard" after a later key press, or ""
 * before any of these.
 * Overlays read it when they open: a controlled `Dialog` focuses its popup rather
 * than its first input after a tap (the app's own button opened it, so Dialog never
 * saw the press), and a `Tooltip` never opens after a touch.
 *
 * The same listeners keep `data-ouro-modality="keyboard"` or `"pointer"` on `<html>`: `pointer` after a press and
 * `keyboard` after a key other than a lone modifier. For `ouro-base`'s keyboard-only focus rings they mark the focused
 * element with `data-ouro-pressed-focus` while its focus came from a press. Before either, there is no mark and the
 * browser's own `:focus-visible` decides. Moving the mouse changes neither.
 *
 * Internal: Ouro UI components use it; apps don't need to.
 *
 * @example
 * const tapped = lastInput() === "touch" || lastInput() === "pen";
 * @claim "Overlays read it when they open" registry/ouro/lib/ouro/last-input.test.ts verify:testExists(registry/ouro/lib/ouro/last-input.test.ts::records the pointer type of a press, and keyboard after a key press)
 * @claim "Overlays read it when they open" registry/ouro/components/ouro/dialog/dialog.touch.test.tsx verify:testExists(registry/ouro/components/ouro/dialog/dialog.touch.test.tsx::initial focus in a controlled dialog opened from the app's own button > focuses the centered popup, not its first input, after a tap)
 */
function lastInput(): string {
  return input;
}

// From module load, not from the first overlay's mount: an app that mounts its Dialog on
// the tap that opens it (`{editing && <Dialog open … />}`) must still see that tap. The
// capture phase means nothing can stop it.
/* istanbul ignore else @preserve -- the else path is server rendering, which has no document */
if (typeof document !== "undefined") {
  document.addEventListener(
    "pointerdown",
    (event) => {
      input = event.pointerType;
      modality("pointer");
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (event) => {
      input = "keyboard";
      // A modifier alone (Shift held for a range select with the mouse) is no sign the keyboard is in use.
      if (!modifierKeys.has(event.key)) modality("keyboard");
    },
    true,
  );
  // Focus that lands takes the mark the last press or key calls for; focus that leaves takes none away with it.
  document.addEventListener("focusin", (event) => mark(event.target), true);
  document.addEventListener(
    "focusout",
    (event) => {
      if (event.target instanceof Element) event.target.removeAttribute(PRESSED_FOCUS);
    },
    true,
  );
  // A moving mouse or pen is in use again, so a device with both a touchscreen and a
  // trackpad gets its hover back after a tap. Touch moves only during a press.
  document.addEventListener(
    "pointermove",
    (event) => {
      if (event.pointerType === "mouse" || event.pointerType === "pen") input = event.pointerType;
    },
    true,
  );
}
