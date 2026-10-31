import type { Page } from "@playwright/test";

/** How a toast must sit against an element: wholly below it, or (`row`) 40px below its top or 200px past its left edge. */
export type Clearance = { selector: string; kind: "below" | "row" };

/** What `toastWatcher` has seen, on `window.ouroToasts`. */
export interface ToastRecord {
  /** The titles of the toasts that have shown, in the order they showed. */
  titles: string[];
  /** Frames in which the first toast had settled: in place, with nothing moving on it or the page. */
  settled: number;
  /** Whether the first toast covered the element in any of those frames. */
  overlapped: boolean;
  /** The first frame the toast covered the element in, for the failure message. */
  overlap?: string;
}

/**
 * Runs in the page: records the toasts on every animation frame from now on, in
 * `window.ouroToasts` (`ToastRecord`). Given `clearance`, it judges the first toast against the
 * element `clearance.selector` names, but only in a settled frame: the toast is neither entering
 * nor leaving (no `data-starting-style` or `data-ending-style`), nothing animates on it, and
 * neither it nor the element moved since the last frame, so the page is not scrolling. A toast
 * slides in from below its place, where it covers less, so a frame of the slide proves nothing.
 * Self-contained, for `page.evaluate`.
 */
export function toastWatcher(clearance?: Clearance): void {
  const record: ToastRecord = { titles: [], settled: 0, overlapped: false };
  (window as unknown as { ouroToasts: ToastRecord }).ouroToasts = record;
  let last = "";
  let firstSeen: { at: number; scroll: number } | undefined;
  const tick = () => {
    const toasts = [...document.querySelectorAll<HTMLElement>('[data-ouro="toast"]')];
    for (const toast of toasts) {
      const title = toast.querySelector("[data-ouro-toast-title]")?.textContent;
      if (title && !record.titles.includes(title)) record.titles.push(title);
    }
    const element = clearance ? document.querySelector(clearance.selector) : null;
    const first = toasts[0];
    if (clearance && element && first) {
      const box = element.getBoundingClientRect();
      const toast = first.getBoundingClientRect();
      firstSeen ??= { at: performance.now(), scroll: scrollY };
      const now = JSON.stringify([box.top, box.left, toast.top, toast.left]);
      const still = now === last && !first.hasAttribute("data-starting-style") && !first.hasAttribute("data-ending-style") && first.getAnimations().length === 0;
      last = now;
      if (still) {
        record.settled++;
        const clear = clearance.kind === "below" ? box.bottom <= toast.top : box.top + 40 <= toast.top || box.left + 200 <= toast.left;
        if (!clear && !record.overlapped) {
          record.overlapped = true;
          record.overlap = `in settled frame ${record.settled}, ${Math.round(performance.now() - firstSeen.at)}ms after the toast was first seen: the element's box ${Math.round(box.top)}-${Math.round(box.bottom)}, the toast's ${Math.round(toast.top)}-${Math.round(toast.bottom)}, the page scrolled ${Math.round(scrollY - firstSeen.scroll)}px since (to ${Math.round(scrollY)})`;
        }
      }
    } else last = "";
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

interface ToastWatch {
  /** The titles of the toasts that have shown, in the order they showed. */
  titles: () => Promise<string[]>;
  /** How many settled frames the first toast has been judged in; wait for a few before reading `overlapped`. */
  settled: () => Promise<number>;
  /** Whether the first toast covered the element in any settled frame. */
  overlapped: () => Promise<boolean>;
  /** Where and when it first covered it, if it did: pass it as the assertion's message. */
  overlap: () => Promise<string | undefined>;
}

/**
 * Watches the page's toasts from inside the page (`toastWatcher`), from now on. A toast shows for
 * five seconds, and a loaded runner can take longer than that between two of a spec's steps, so
 * a spec that looked for the toast afterwards could miss it; the page itself does not wait on the
 * runner. To check that a toast never covers an element, wait until it has settled for a few
 * frames, then check it never overlapped: `expect.poll(toasts.settled).toBeGreaterThan(5)`, then
 * `expect(await toasts.overlapped(), await toasts.overlap()).toBe(false)`.
 */
export async function watchToasts(page: Page, clearOf?: Clearance): Promise<ToastWatch> {
  await page.evaluate(toastWatcher, clearOf);
  const read = () => page.evaluate(() => (window as unknown as { ouroToasts: ToastRecord }).ouroToasts);
  return { titles: async () => (await read()).titles, settled: async () => (await read()).settled, overlapped: async () => (await read()).overlapped, overlap: async () => (await read()).overlap };
}
