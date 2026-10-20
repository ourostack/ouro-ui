import { test, type Page } from "@playwright/test";

/**
 * WebKit warns about a preload still unused 3 seconds after the window's load event: a one-shot timer
 * (unusedPreloadTimeout in WebKit's CachedResourceLoader), so whether it prints depends on the
 * machine's speed, not the preload. WebKit fetches a preloaded font again for its @font-face instead
 * of using the preload, and on a busy machine a chunk Vite's preload helper links before its import is
 * requested after the timer (the page or demo it belongs to still runs). Chromium prints the same
 * text, but there it means a real mismatch (a wrong `as`, or a crossorigin that differs, so the file
 * downloads twice), so only WebKit's is ignored, and only for this site's own fonts and chunks.
 * catalog.spec.ts checks separately that each page loads only its own JavaScript.
 */
function webkitUnusedPreload(base: string): RegExp {
  const escaped = new URL(base).href.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  return new RegExp(`^The resource ${escaped}(?:fonts/[\\w.-]+\\.woff2|assets/[\\w.-]+\\.js) was preloaded using link preload but not used within a few seconds`);
}

/** Collects the page's errors and console errors and warnings, but WebKit's unused-preload warning for this site's files. */
export function diagnostics(page: Page): string[] {
  const errors: string[] = [];
  const base = test.info().project.use.baseURL;
  const ignored = page.context().browser()?.browserType().name() === "webkit" && base ? webkitUnusedPreload(base) : undefined;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if ((message.type() === "error" || message.type() === "warning") && !ignored?.test(message.text())) errors.push(message.text());
  });
  return errors;
}
