/**
 * A tap or a word that lands before its control has hydrated still counts (ourostack/ouro-ui#672). Until React hydrates
 * a control from the server's HTML, it has no handler: a tap on the menu button, a theme picker, Search or a live
 * example did nothing, and text typed into a field was wiped when React hydrated it. The head script keeps them, and
 * on the first frame each control has hydrated it presses the control again, or puts the text back, as the reader left
 * it. React keeps its fiber on each node it hydrates, under a key of its own, which is how the script tells; and as a
 * control's effects run after it hydrates (a select pressed before then opened with no popup to show), each is answered a
 * frame after it is first seen hydrated, in a task of its own.
 */

/** The controls whose press needs the page's JavaScript. Links answer on their own. */
export const EARLY_CONTROLS = 'button, [role="button"], [role="checkbox"], [role="switch"], [role="radio"], [role="tab"], input[type="checkbox"], input[type="radio"]';

/** The fields whose text React would set back to its own when it hydrates them. */
export const EARLY_FIELDS = 'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="file"]), textarea, select';

/**
 * The controls a press moves by where it lands and goes, not by a click: a slider, and a row that swipes open. A tap or
 * a drag there is kept as where the finger came down and where it lifted, and made again along that line.
 */
export const EARLY_POINTS = '[data-ouro-slider-control], [data-ouro="swipe-actions"]';

/** Where React renders: a control elsewhere is never hydrated, so a tap on it is left to the page. */
export const EARLY_SCOPE = "#root";

/** How long a tap or text is kept, in ms, before it is let go: past that, its control is not coming. */
export const EARLY_PATIENCE = 10_000;

/** How long a pressed control waits, in ms, for the page to answer before it looks let go anyway. */
export const EARLY_ANSWER = 1000;

/** What the head script keeps on the window, for the page to hurry hydration while anything waits. */
export type EarlyInputWindow = Window & { __ouroEarlyInput?: number };

/**
 * Keeps the last tap and each field's text from before their controls hydrate, and answers them once they have.
 * Serialized into the head script, so it is self-contained.
 *
 * A kept tap goes no further, so React, if it is listening on a part still to hydrate, never takes it as well as the
 * press that answers it; and its default action waits too, as a checkbox would otherwise tick before React knew, and a
 * submit button send its form unchecked.
 *
 * A Nautilus chapter's island holds its own presses first, on the window (voyage/chapters/island.tsx), so this script
 * never sees a press inside one; both drop a kept press once the reader presses elsewhere.
 */
export function keepEarlyInput(
  page: EarlyInputWindow,
  controls: string,
  points: string,
  fields: string,
  scope: string,
  patience: number,
  answerWithin: number,
): void {
  const document = page.document;
  let since = 0;
  const fiber = (node: Element) => Object.keys(node).some((key) => key.indexOf("__reactFiber$") === 0);
  // Seen hydrated on a frame before this one: its effects have had a frame to run.
  const seen = new Set<Element>();
  const ready = (node: Element) => {
    if (!fiber(node)) return false;
    if (seen.has(node)) return true;
    seen.add(node);
    return false;
  };
  let tap: HTMLElement | null = null;
  // Where a press on a control in `points` left it, and on what, and when: how long the finger moved and how long it then
  // rested before it lifted. And whether the finger is still down.
  let point: { from: [number, number]; x: number; y: number; type: string; at: number; moved: number; rest: number } | null = null;
  let down = false;
  // The kept control stays pressed until it is answered, so the tap shows it landed: the theme's press scale, where
  // motion is welcome, and a little dimmer. Set on the element and put back as it was.
  let before: [string, string] = ["", ""];
  const still = typeof page.matchMedia === "function" && page.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hold = (control: HTMLElement | null) => {
    point = null;
    if (tap) [tap.style.scale, tap.style.opacity] = before;
    tap = control;
    if (!control) return;
    before = [control.style.scale, control.style.opacity];
    if (!still) control.style.scale = "var(--ouro-press-scale, 0.97)";
    control.style.opacity = "0.8";
  };
  const texts: Array<{ field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement; value: string }> = [];
  let frame = 0;
  const waiting = () => (tap ? 1 : 0) + texts.length;
  const answer = () => {
    frame = 0;
    // Past its patience nothing kept is coming: the control's look goes back and the tap and text are let go.
    if (Date.now() - since > patience) {
      hold(null);
      texts.length = 0;
    }
    for (let index = texts.length - 1; index >= 0; index--) {
      const kept = texts[index]!;
      if (!kept.field.isConnected) texts.splice(index, 1);
      else if (ready(kept.field)) {
        texts.splice(index, 1);
        try {
          // React may have set the field back to its own value, or, hydrating, left the reader's text in the field with
          // its own state still empty. Either way the page hears the text as typed: the field's own setter clears what
          // React last knew of it, the element's sets the text, and an input event follows, which React reads as a change.
          const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(kept.field), "value")!.set!;
          kept.field.value = "";
          setter.call(kept.field, kept.value);
          kept.field.dispatchEvent(new Event("input", { bubbles: true }));
          kept.field.dispatchEvent(new Event("change", { bubbles: true }));
        } catch {
          // A field that will not take it keeps what it has; the rest are still answered.
        }
      }
    }
    if (tap && !tap.isConnected) hold(null);
    else if (tap && ready(tap)) {
      const pressed = tap;
      const look = before;
      const at = point;
      tap = null;
      point = null;
      setTimeout(() => answered(pressed, look, at), 0);
    }
    page.__ouroEarlyInput = waiting();
    if (waiting()) frame = requestAnimationFrame(answer);
  };
  // Presses the kept control, which stays pressed until the page answers: its first change to the page, or a field's
  // input, since a control whose answer loads first (Search's palette) would otherwise look let go while it loads.
  const answered = (pressed: HTMLElement, look: [string, string], at: typeof point) => {
    let done = false;
    let observer: MutationObserver | null = null;
    const finish = () => {
      if (done) return;
      done = true;
      if (observer) observer.disconnect();
      document.removeEventListener("input", finish, true);
      document.removeEventListener("change", finish, true);
      clearTimeout(limit);
      [pressed.style.scale, pressed.style.opacity] = look;
    };
    if (typeof MutationObserver === "function") {
      observer = new MutationObserver((records) => {
        // Not the press's own look, and not the page's <head>, where a preload for what the press opens lands first.
        const head = (document as unknown as Document).head;
        if (records.some((record) => !(record.target === pressed && record.attributeName === "style") && !(head && head.contains(record.target)))) finish();
      });
      observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
    }
    document.addEventListener("input", finish, true);
    document.addEventListener("change", finish, true);
    const limit = setTimeout(finish, answerWithin);
    if (!at) pressed.click();
    else {
      // On the control itself, so a drag that began on a slider's thumb moves the slider rather than the thumb in place:
      // down where the finger came down, along to where it lifted, and up there. Pointer 0, which no browser pointer has,
      // so a control that tries to capture it is told no.
      const event = (x: number, y: number, buttons: number) =>
        ({ bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0, buttons, pointerId: 0, isPrimary: true, pointerType: at.type }) as PointerEventInit;
      // Over the time the finger took (up to 400 ms, then at most 200 ms at rest): a row reads a swipe's speed as a
      // fling, and a whole swipe in one instant would fling it far past where the finger left it.
      const took = Math.min(at.moved - at.at, 400);
      pressed.dispatchEvent(new PointerEvent("pointerdown", event(at.from[0], at.from[1], 1)));
      for (let step = 1; step <= 4; step++) {
        const x = at.from[0] + ((at.x - at.from[0]) * step) / 4;
        const y = at.from[1] + ((at.y - at.from[1]) * step) / 4;
        setTimeout(() => pressed.dispatchEvent(new PointerEvent("pointermove", event(x, y, 1))), (took * step) / 4);
      }
      setTimeout(() => pressed.dispatchEvent(new PointerEvent("pointerup", event(at.x, at.y, 0))), took + Math.min(at.rest, 200));
    }
  };
  const soon = () => {
    since = Date.now();
    page.__ouroEarlyInput = waiting();
    if (!frame) frame = requestAnimationFrame(answer);
  };
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target as Element | null;
      const control = target && target.closest ? target.closest(controls) : null;
      // The click that ends a kept press on a slider is that press's own.
      if (point && tap && target && tap.contains(target)) return;
      if (!control || fiber(control) || !control.closest(scope) || control.closest('[disabled], [aria-disabled="true"]')) {
        // A press the page answers itself makes a kept tap stale: the reader has moved on, so it is let go, not made late.
        if (tap) hold(null);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      hold(control as HTMLElement);
      soon();
    },
    true,
  );
  const typed = (event: Event) => {
    const field = event.target as Element | null;
    if (!field || !field.matches || !field.matches(fields) || !field.closest(scope)) return;
    const kept = field as HTMLInputElement;
    // Typed once the field has hydrated: React has it, and any text kept from before is now older than the field's.
    if (fiber(field)) {
      for (let index = texts.length - 1; index >= 0; index--) if (texts[index]!.field === kept) texts.splice(index, 1);
      return;
    }
    for (const entry of texts) if (entry.field === kept) entry.value = kept.value;
    if (!texts.some((entry) => entry.field === kept)) texts.push({ field: kept, value: kept.value });
    soon();
  };
  document.addEventListener(
    "pointerdown",
    (event) => {
      const target = event.target as Element | null;
      const control = target && target.closest ? target.closest(points) : null;
      if (!control || fiber(control) || !control.closest(scope) || control.closest('[disabled], [data-disabled], [aria-disabled="true"]')) return;
      // A press on a button inside a row is the button's: kept by its click.
      const inner = target!.closest(controls);
      if (inner && control.contains(inner) && inner !== control) return;
      // Kept, not also taken by React, should it hydrate the control within this press: the replay is the press.
      event.stopPropagation();
      hold(control as HTMLElement);
      // A whole track shrinking would read as the slider moving: it only dims.
      (control as HTMLElement).style.scale = before[0];
      point = { from: [event.clientX, event.clientY], x: event.clientX, y: event.clientY, type: event.pointerType, at: event.timeStamp, moved: event.timeStamp, rest: 0 };
      down = true;
      soon();
    },
    true,
  );
  document.addEventListener(
    "pointermove",
    (event) => {
      if (down && point) [point.x, point.y, point.moved] = [event.clientX, event.clientY, event.timeStamp];
    },
    { capture: true, passive: true },
  );
  document.addEventListener(
    "pointerup",
    (event) => {
      if (down && point) point.rest = event.timeStamp - point.moved;
      down = false;
    },
    true,
  );
  // The browser took the finger for a scroll: nothing was pressed, and the control looks as it did.
  document.addEventListener(
    "pointercancel",
    () => {
      if (down && point) {
        hold(null);
        page.__ouroEarlyInput = waiting();
      }
      down = false;
    },
    true,
  );
  document.addEventListener("input", typed, true);
  document.addEventListener("change", typed, true);
}

/** The inline script for <head>. */
export const earlyInputScript = `try{(${keepEarlyInput.toString()})(window,${[EARLY_CONTROLS, EARLY_POINTS, EARLY_FIELDS, EARLY_SCOPE].map((text) => JSON.stringify(text)).join(",")},${EARLY_PATIENCE},${EARLY_ANSWER})}catch(e){}`;
