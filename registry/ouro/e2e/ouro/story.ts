import type { Locator, Page } from "@playwright/test";

/**
 * Opens one Storybook story on its own, by story id (for example
 * `"overlays-sheet--playground"`), and waits for it to render and for the app's web fonts
 * to load, so text no longer changes width under a spec that measures. A font first used by
 * content that appears later (an opened menu, a heavier weight) loads later: before measuring
 * such content, wait again with `await page.evaluate(() => document.fonts.ready.then(() => {}))`.
 * The Storybook comes from
 * the `OURO_E2E_URL` environment variable, default `http://localhost:6006`: the
 * Storybook that shows the Ouro UI stories installed in this app, compiled with the
 * app's own Tailwind and theme.
 */
export async function openStory(page: Page, id: string): Promise<void> {
  const base = process.env["OURO_E2E_URL"] ?? "http://localhost:6006";
  const url = new URL(`iframe.html?id=${id}&viewMode=story`, base.endsWith("/") ? base : `${base}/`);
  await page.goto(url.href);
  await page.locator("#storybook-root > *").first().waitFor();
  // A font starts loading when a layout first uses it, so lay the story out before asking.
  await page.evaluate(() => {
    document.body.getBoundingClientRect();
    return document.fonts.ready.then(() => undefined);
  });
}

/**
 * Stops the page's clock where it is, so a state that lasts a set time (a confirmation, a toast,
 * a save in progress) stays until the spec moves the clock on with `page.clock.runFor(ms)` or lets
 * it run again with `page.clock.resume()`: a loaded runner can take longer than that time between
 * two steps. Call `page.clock.install()` before `openStory`, so the page's timers are the clock's.
 */
export async function holdClock(page: Page): Promise<void> {
  // pauseAt takes a time ahead of the page's clock, which runs on while the request travels: aim a
  // little ahead, and further each time the clock got there first.
  for (let ahead = 50; ; ahead *= 2) {
    const at = await page.evaluate((ms) => Date.now() + ms, ahead);
    try {
      await page.clock.pauseAt(at);
      return;
    } catch (error) {
      if (ahead >= 3200 || !String(error).includes("Cannot fast-forward to the past")) throw error;
    }
  }
}

/** Waits for an element's transitions (opening, springing back) to finish, then returns its box. */
export async function settledBox(element: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  await element.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((animation) => animation.finished)));
  const box = await element.boundingBox();
  if (!box) throw new Error("settledBox: the element is not visible");
  return box;
}

/**
 * Drags vertically with the real mouse over `durationMs`, slowly enough that the release
 * velocity does not count as a flick (Playwright's own `steps` moves have no delay).
 */
export async function slowDrag(page: Page, x: number, fromY: number, toY: number, durationMs = 600): Promise<void> {
  const steps = 15;
  await page.mouse.move(x, fromY);
  await page.mouse.down();
  for (let step = 1; step <= steps; step++) {
    await page.mouse.move(x, fromY + ((toY - fromY) * step) / steps);
    await page.waitForTimeout(durationMs / steps);
  }
  await page.mouse.up();
}

/**
 * Presses Tab, or Shift+Tab with `{ shift: true }`, so that focus moves to the next tab stop
 * in every browser. WebKit on a Mac follows the system's "Keyboard navigation" setting: with
 * it off, the default, Tab skips buttons, links and every control that is not a text field.
 * Option+Tab is WebKit's key for "every control, whatever the setting", so this presses that
 * there and plain Tab everywhere else. Use it instead of `page.keyboard.press("Tab")`.
 */
export async function pressTab(page: Page, { shift = false }: { shift?: boolean } = {}): Promise<void> {
  const webkitOnMac = process.platform === "darwin" && page.context().browser()?.browserType().name() === "webkit";
  await page.keyboard.press(`${shift ? "Shift+" : ""}${webkitOnMac ? "Alt+" : ""}Tab`);
}

/**
 * Holds back every picture the page draws for `ms`, as a slow network does, so a spec sees the page
 * before its pictures arrive and as they come. Pictures drawn as `data:` URLs, as stories draw them,
 * are fetched from the page's own address instead, so they wait too. With `fail`, each picture fails
 * to load once its wait is over. Call it before `openStory`.
 */
export async function slowPictures(page: Page, ms: number, { fail = false }: { fail?: boolean } = {}): Promise<void> {
  await page.addInitScript(() => {
    const slow = (value: unknown) => (typeof value === "string" && value.startsWith("data:image/") ? `${location.origin}/__ouro-slow-picture?${encodeURIComponent(value)}` : value);
    const src = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src")!;
    Object.defineProperty(HTMLImageElement.prototype, "src", {
      ...src,
      set(value: string) {
        src.set!.call(this, slow(value));
      },
    });
    const setAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name: string, value: string) {
      setAttribute.call(this, name, this instanceof HTMLImageElement && name.toLowerCase() === "src" ? (slow(value) as string) : value);
    };
  });
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.resourceType() !== "image") return route.fallback();
    await new Promise((resolve) => setTimeout(resolve, ms));
    if (fail) return route.fulfill({ status: 404 });
    const url = new URL(request.url());
    if (url.pathname !== "/__ouro-slow-picture") return route.fallback();
    const data = decodeURIComponent(url.search.slice(1));
    const comma = data.indexOf(",");
    const head = data.slice("data:".length, comma);
    const body = head.endsWith(";base64") ? Buffer.from(data.slice(comma + 1), "base64") : Buffer.from(decodeURIComponent(data.slice(comma + 1)));
    await route.fulfill({ status: 200, contentType: head.split(";")[0]!, body });
  });
}

/**
 * Slows the page's CPU by `rate` (4: four times slower), as a mid-range phone runs, in Chromium,
 * the one browser that can. Elsewhere it does nothing.
 */
export async function slowCpu(page: Page, rate: number): Promise<void> {
  if (page.context().browser()?.browserType().name() !== "chromium") return;
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setCPUThrottlingRate", { rate });
}

/** What moved under the reader: the layout shift score, and each element that moved, with how. */
export interface LayoutShifts {
  /** The page's layout shift score from the browser, the sum of every shift no input caused; `null` where the browser does not report shifts (WebKit). */
  score: number | null;
  /** Each move of an Ouro UI component (`[data-ouro]`) or a picture in one between two frames, in every browser: where it was and where it went, on the page (a scroll of the page itself moves nothing). */
  moved: string[];
}

/**
 * Starts watching for layout shift from the page's first frame: the browser's own layout shift
 * entries where it has them, and in every browser the box of each Ouro UI component and each
 * picture in one, read once a frame, so a spec sees a component move in WebKit too. Call it before
 * `openStory`, then `layoutShifts` once the page has settled.
 */
export async function watchLayoutShift(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const watch = { score: 0, supported: false, moved: [] as string[] };
    (window as unknown as { __ouroLayoutShift: typeof watch }).__ouroLayoutShift = watch;
    if (PerformanceObserver.supportedEntryTypes.includes("layout-shift")) {
      watch.supported = true;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!entry.hadRecentInput) watch.score += entry.value;
      }).observe({ type: "layout-shift", buffered: true });
    }
    const boxes = new Map<Element, string>();
    const name = (element: Element) => {
      const root = element.closest("[data-ouro]");
      const words = (element.getAttribute("alt") ?? element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
      return `${element.tagName.toLowerCase()} in ${root?.getAttribute("data-ouro") ?? "the page"} "${words}"`;
    };
    const frame = () => {
      for (const element of document.querySelectorAll("[data-ouro], [data-ouro] img")) {
        const r = element.getBoundingClientRect();
        const box = `${Math.round(r.x + scrollX)},${Math.round(r.y + scrollY)} ${Math.round(r.width)}x${Math.round(r.height)}`;
        const was = boxes.get(element);
        if (was !== undefined && was !== box) watch.moved.push(`${name(element)}: ${was} to ${box}`);
        boxes.set(element, box);
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

/** What moved since `watchLayoutShift` started watching, read two frames after the call. */
export async function layoutShifts(page: Page): Promise<LayoutShifts> {
  return page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const watch = (window as unknown as { __ouroLayoutShift: { score: number; supported: boolean; moved: string[] } }).__ouroLayoutShift;
    return { score: watch.supported ? watch.score : null, moved: [...watch.moved] };
  });
}
