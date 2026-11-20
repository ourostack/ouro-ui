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

/**
 * Watches a Chromium test for a page that stops answering: shortly before the test's time runs out, if the page's main
 * thread doesn't answer, it is paused over CDP and the top of its stack attached to the test and logged. A press that
 * never returns (Chapter I's trade Select, ourostack/ouro-ui#2488) leaves no other trace of why. Call it from a
 * beforeEach (awaited), and the function it returns from an afterEach; in another browser it watches nothing.
 */
export async function watchHang(page: Page): Promise<() => void> {
  const info = test.info();
  if (page.context().browser()?.browserType().name() !== "chromium") return () => {};
  // The debugger is turned on now: turning it on needs the page's main thread, which a held page never gives back.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Debugger.enable");
  const check = async () => {
    const answered = await Promise.race([page.evaluate(() => true).catch(() => true), new Promise<false>((resolve) => setTimeout(() => resolve(false), 4_000))]);
    if (answered) return;
    type Frame = { functionName: string; url: string; location: { lineNumber: number; columnNumber: number } };
    const paused = new Promise<string[]>((resolve) =>
      cdp.once("Debugger.paused", (event: { callFrames: Frame[] }) =>
        resolve(event.callFrames.slice(0, 30).map((frame) => `${frame.functionName || "(anonymous)"} ${frame.url.split("/").pop()}:${frame.location.lineNumber + 1}:${frame.location.columnNumber + 1}`)),
      ),
    );
    await cdp.send("Debugger.pause");
    const stack = await Promise.race([paused, new Promise<string[]>((resolve) => setTimeout(() => resolve(["(no pause within 4 s: the thread was not in JavaScript)"]), 4_000))]);
    await cdp.send("Debugger.resume").catch(() => undefined);
    const report = `the page stopped answering; its JavaScript was at:\n${stack.join("\n")}`;
    await info.attach("hung page", { body: report, contentType: "text/plain" }).catch(() => undefined);
    console.log(`[hung page] ${info.title}: ${report}`);
  };
  const timer = setTimeout(() => void check().catch(() => undefined), Math.max(info.timeout - 12_000, 1_000));
  return () => {
    clearTimeout(timer);
    void cdp.detach().catch(() => undefined);
  };
}
