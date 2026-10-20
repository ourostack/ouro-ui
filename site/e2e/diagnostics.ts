import type { Page } from "@playwright/test";

/**
 * WebKit warns about a preload that nothing has used 3 seconds after the window's load event (a
 * one-shot timer, unusedPreloadTimeout in WebKit's CachedResourceLoader). Whether it fires depends
 * on the clock, not the preload: a font WebKit fetches again for its @font-face instead of using the
 * preload, and a chunk Vite's preload helper links before its import, which on a busy machine is
 * requested after the timer (the demo or page it belongs to still runs). Chromium has no such
 * warning. catalog.spec.ts checks separately that each page loads only its own JavaScript.
 */
const WEBKIT_UNUSED_PRELOAD = /^The resource \S+\/ouro-ui\/(?:fonts\/[\w.-]+\.woff2|assets\/[\w.-]+\.js) was preloaded using link preload but not used within a few seconds/;

/** Collects the page's errors and console errors and warnings, but WebKit's unused-preload warning. */
export function diagnostics(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if ((message.type() === "error" || message.type() === "warning") && !WEBKIT_UNUSED_PRELOAD.test(message.text())) errors.push(message.text());
  });
  return errors;
}
