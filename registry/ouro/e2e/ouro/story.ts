import type { Locator, Page } from "@playwright/test";

/**
 * Opens one Storybook story on its own, by story id (for example
 * `"overlays-sheet--playground"`), and waits for it to render, its play function to finish, and for the app's web fonts
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
  // The story's play function, done: it brings the story to the state it shows (a bar on a post, an open menu), and a
  // spec that acts while it still runs races it.
  const phase = await page.waitForFunction(() => {
    const render = (window as { __STORYBOOK_PREVIEW__?: { currentRender?: { phase?: string } } }).__STORYBOOK_PREVIEW__?.currentRender;
    return render === undefined || ["completed", "finished", "errored", "aborted"].includes(render.phase ?? "") ? (render?.phase ?? "finished") : null;
  });
  const ended = await phase.jsonValue();
  if (ended === "errored" || ended === "aborted") throw new Error(`openStory: ${id} did not finish rendering (${ended})`);
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
 * Whether a tap still raises a click on an element that cancels pointerdown, as a phone's browser
 * does (Base UI's list items cancel it to keep focus in their input). The WebKit that
 * Playwright 1.63 drives drops that click: https://github.com/microsoft/playwright/issues/43569,
 * fixed from WebKit r2386 (Playwright 1.65 has r2388). This taps a probe that cancels
 * pointerdown, then a plain one: the plain tap's click comes after any click of the first, so once
 * it lands the answer is known, without waiting a set time for a click that may never come. Call
 * it after `openStory` and before the spec opens anything: the probes sit over the page's
 * top-left corner until it returns.
 */
export async function tapKeepsCancelledClick(page: Page): Promise<boolean> {
  await page.evaluate(() => {
    for (const cancels of [true, false]) {
      const probe = document.createElement("button");
      probe.type = "button";
      probe.textContent = cancels ? "Cancelled probe" : "Plain probe";
      probe.dataset["ouroTapProbe"] = cancels ? "cancelled" : "plain";
      probe.dataset["clicks"] = "0";
      // Apart, so the two taps do not read as one double tap.
      Object.assign(probe.style, { position: "fixed", top: "0", ...(cancels ? { left: "0" } : { right: "0" }), width: "48px", height: "48px", zIndex: "2147483647" });
      if (cancels) probe.addEventListener("pointerdown", (event) => event.preventDefault());
      probe.addEventListener("click", (event) => {
        event.stopPropagation();
        probe.dataset["clicks"] = String(Number(probe.dataset["clicks"]) + 1);
      });
      document.body.append(probe);
    }
  });
  await page.locator('[data-ouro-tap-probe="cancelled"]').tap();
  await page.locator('[data-ouro-tap-probe="plain"]').tap();
  try {
    await page.waitForFunction(() => document.querySelector<HTMLElement>('[data-ouro-tap-probe="plain"]')?.dataset["clicks"] === "1", undefined, { timeout: 5000 });
  } catch (error) {
    throw new Error("tapKeepsCancelledClick: the plain probe's tap raised no click, so the probe cannot tell", { cause: error });
  }
  return page.evaluate(() => {
    const probes = [...document.querySelectorAll<HTMLElement>("[data-ouro-tap-probe]")];
    const kept = probes.find((probe) => probe.dataset["ouroTapProbe"] === "cancelled")?.dataset["clicks"] === "1";
    for (const probe of probes) probe.remove();
    return kept;
  });
}
