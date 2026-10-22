import type { Page } from "@playwright/test";

/** How a showing toast must sit against an element: wholly below it, or (`row`) 40px below its top or 200px past its left edge. */
type Clearance = { selector: string; kind: "below" | "row" };

interface ToastWatch {
  /** The titles of the toasts that have shown, in the order they showed. */
  titles: () => Promise<string[]>;
  /** Whether, in some frame while a toast showed, the first toast sat clear of the element. */
  cleared: () => Promise<boolean>;
}

/**
 * Watches the page's toasts from inside the page, on every animation frame, from now on. A toast
 * shows for five seconds, and a loaded runner can take longer than that between two of a spec's
 * steps, so a spec that looked for the toast afterwards could miss it; the page itself does not
 * wait on the runner. It records each toast's title as it shows and, given `clearOf`, whether the
 * first toast has sat clear of the element `clearOf.selector` names.
 */
export async function watchToasts(page: Page, clearOf?: Clearance): Promise<ToastWatch> {
  await page.evaluate((clearance) => {
    const state = { titles: [] as string[], cleared: false };
    (window as unknown as { ouroToasts: typeof state }).ouroToasts = state;
    const tick = () => {
      const toasts = [...document.querySelectorAll<HTMLElement>('[data-ouro="toast"]')];
      for (const toast of toasts) {
        const title = toast.querySelector("[data-ouro-toast-title]")?.textContent;
        if (title && !state.titles.includes(title)) state.titles.push(title);
      }
      const element = clearance && document.querySelector(clearance.selector);
      if (clearance && element && toasts[0]) {
        const box = element.getBoundingClientRect();
        const toast = toasts[0].getBoundingClientRect();
        if (clearance.kind === "below" ? box.bottom <= toast.top : box.top + 40 <= toast.top || box.left + 200 <= toast.left) state.cleared = true;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, clearOf);
  const read = () => page.evaluate(() => (window as unknown as { ouroToasts: { titles: string[]; cleared: boolean } }).ouroToasts);
  return { titles: async () => (await read()).titles, cleared: async () => (await read()).cleared };
}
