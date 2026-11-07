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
export const EARLY_FIELDS = 'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), textarea, select';

/** What the head script keeps on the window, for the page to hurry hydration while anything waits. */
export type EarlyInputWindow = Window & { __ouroEarlyInput?: number };

/**
 * Keeps the last tap and each field's text from before their controls hydrate, and answers them once they have.
 * Serialized into the head script, so it is self-contained.
 *
 * A kept tap goes no further, so React, if it is listening on a part still to hydrate, never takes it as well as the
 * press that answers it; and its default action waits too, as a checkbox would otherwise tick before React knew, and a
 * submit button send its form unchecked.
 */
export function keepEarlyInput(page: EarlyInputWindow, controls: string, fields: string): void {
  const document = page.document;
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
  // The kept control stays pressed until it is answered, so the tap shows it landed: the theme's press scale, where
  // motion is welcome, and a little dimmer. Set on the element and put back as it was.
  let before: [string, string] = ["", ""];
  const still = typeof page.matchMedia === "function" && page.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hold = (control: HTMLElement | null) => {
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
    for (let index = texts.length - 1; index >= 0; index--) {
      const kept = texts[index]!;
      if (!kept.field.isConnected) texts.splice(index, 1);
      else if (ready(kept.field)) {
        texts.splice(index, 1);
        if (kept.field.value !== kept.value) {
          // Through the element's own setter, so React reads the change as the reader's.
          const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(kept.field), "value")!.set!;
          setter.call(kept.field, kept.value);
          kept.field.dispatchEvent(new Event("input", { bubbles: true }));
          kept.field.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    }
    if (tap && !tap.isConnected) hold(null);
    else if (tap && ready(tap)) {
      const pressed = tap;
      hold(null);
      setTimeout(() => pressed.click(), 0);
    }
    page.__ouroEarlyInput = waiting();
    if (waiting()) frame = requestAnimationFrame(answer);
  };
  const soon = () => {
    page.__ouroEarlyInput = waiting();
    if (!frame) frame = requestAnimationFrame(answer);
  };
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target as Element | null;
      const control = target && target.closest ? target.closest(controls) : null;
      if (!control || fiber(control) || control.closest('[disabled], [aria-disabled="true"]')) return;
      event.preventDefault();
      event.stopPropagation();
      hold(control as HTMLElement);
      soon();
    },
    true,
  );
  const typed = (event: Event) => {
    const field = event.target as Element | null;
    if (!field || !field.matches || !field.matches(fields) || fiber(field)) return;
    const kept = field as HTMLInputElement;
    for (const entry of texts) if (entry.field === kept) entry.value = kept.value;
    if (!texts.some((entry) => entry.field === kept)) texts.push({ field: kept, value: kept.value });
    soon();
  };
  document.addEventListener("input", typed, true);
  document.addEventListener("change", typed, true);
}

/** The inline script for <head>. */
export const earlyInputScript = `try{(${keepEarlyInput.toString()})(window,${JSON.stringify(EARLY_CONTROLS)},${JSON.stringify(EARLY_FIELDS)})}catch(e){}`;
