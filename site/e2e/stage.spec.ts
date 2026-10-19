import { expect, test, type Page } from "@playwright/test";
import { BELL_TOASTS, LOG, STAGE_CONTROLS, STAGE_COPY } from "../src/voyage/stage/copy";

// The porthole stage against the production build (site-design.md, "Verification in CI"): each
// control in STAGE_CONTROLS has a test named "control: <id>" that operates it and asserts what it
// visibly changes (site/scripts/stage-census.test.mjs fails when one is missing), every operable
// element on the stage is one of those controls, touch works on phones, nothing moves under reduced
// motion, and the fish rest off screen. Each control's latency is stage.latency.spec.ts's.

/**
 * WebKit fetches a preloaded font again for its @font-face instead of using the preload, then warns
 * a few seconds after load that the preload went unused. Chromium uses it; the warning is WebKit's.
 */
const WEBKIT_UNUSED_FONT_PRELOAD = /^The resource \S+\/fonts\/[\w.-]+\.woff2 was preloaded using link preload but not used within a few seconds/;

function diagnostics(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if ((message.type() === "error" || message.type() === "warning") && !WEBKIT_UNUSED_FONT_PRELOAD.test(message.text())) errors.push(message.text());
  });
  return errors;
}

async function open(page: Page): Promise<void> {
  await page.goto("voyage/");
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
}

const scene = (page: Page) => page.locator(".stage-scene");
const porthole = (page: Page) => page.locator(".stage-porthole");
const lastLog = (page: Page) => page.locator(".stage-log [data-ouro='message']").last();
const tank = (page: Page, name: string) => page.getByRole("switch", { name, exact: true });
const diveButton = (page: Page) => page.getByRole("button", { name: STAGE_COPY.dive, exact: true });

/** Waits until every finite animation and transition on the page has finished. */
async function settled(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (let round = 0; round < 50; round++) {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const running = document.getAnimations().filter((animation) => animation.playState === "running" && animation.effect?.getComputedTiming().iterations !== Infinity);
      if (running.every((animation) => animation instanceof CSSAnimation && animation.animationName === "stage-drift")) return;
      await Promise.all(running.map((animation) => animation.finished.catch(() => undefined)));
    }
  });
}

/** The porthole as pixels, with the fish held still so only the control under test changes it. */
async function picture(page: Page): Promise<Buffer> {
  await settled(page);
  return porthole(page).screenshot({ animations: "disabled" });
}

/** Operates a control and asserts the porthole looks different afterwards. */
async function changesThePicture(page: Page, act: () => Promise<void>): Promise<void> {
  const before = await picture(page);
  await act();
  const after = await picture(page);
  expect(after.equals(before), "the porthole looks different").toBe(false);
}

async function fillTanks(page: Page): Promise<void> {
  for (const name of ["Fore", "Middle", "Aft"]) await tank(page, name).click();
}

test.describe("each control on the stage", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("control: depth takes the porthole down through the three waters", async ({ page }) => {
    const errors = diagnostics(page);
    await open(page);
    const slider = page.getByRole("slider", { name: STAGE_COPY.depth });
    await expect(scene(page)).toHaveAttribute("data-band", "sunlit");
    await changesThePicture(page, async () => {
      await slider.focus();
      for (let step = 0; step < 12; step++) await page.keyboard.press("ArrowRight");
    });
    await expect(scene(page)).toHaveAttribute("data-band", "twilight");
    await expect(page.locator("[data-stage-readout]")).toContainText("60 fathoms");
    await expect(page.locator("[data-stage-band]")).toHaveText("Twilight water");
    await expect(lastLog(page)).toContainText(LOG.band.twilight.text);
    await changesThePicture(page, () => page.keyboard.press("End"));
    await expect(scene(page)).toHaveAttribute("data-band", "midnight");
    await expect(lastLog(page)).toContainText(LOG.band.midnight.text);
    expect(errors).toEqual([]);
  });

  test("control: tank-fore floods the fore tank, and the Nautilus sits lower", async ({ page }) => {
    await open(page);
    await changesThePicture(page, () => tank(page, "Fore").click());
    await expect(scene(page)).toHaveAttribute("data-tanks", "1");
    await expect(page.locator("#stage-dive-hint")).toHaveText(STAGE_COPY.diveHint(1));
    await expect(lastLog(page)).toContainText("The fore tank is full of sea water.");
  });

  test("control: tank-middle floods the middle tank, and the Nautilus sits lower", async ({ page }) => {
    await open(page);
    await changesThePicture(page, () => tank(page, "Middle").click());
    await expect(scene(page)).toHaveAttribute("data-tanks", "1");
    await expect(lastLog(page)).toContainText("The middle tank is full of sea water.");
    await changesThePicture(page, () => tank(page, "Middle").click());
    await expect(scene(page)).toHaveAttribute("data-tanks", "0");
    await expect(lastLog(page)).toContainText("The middle tank is empty again.");
  });

  test("control: tank-aft floods the aft tank, and the third full tank frees the Dive button", async ({ page }) => {
    await open(page);
    await tank(page, "Fore").click();
    await tank(page, "Middle").click();
    await expect(diveButton(page)).toBeDisabled();
    await changesThePicture(page, () => tank(page, "Aft").click());
    await expect(scene(page)).toHaveAttribute("data-tanks", "3");
    await expect(diveButton(page)).toBeEnabled();
    await expect(lastLog(page)).toContainText(LOG.allFull.text);
  });

  test("control: dive takes the Nautilus and the porthole down, and Surface brings them up", async ({ page }) => {
    await open(page);
    await expect(diveButton(page)).toBeDisabled();
    await fillTanks(page);
    await changesThePicture(page, () => diveButton(page).click());
    await expect(scene(page)).toHaveAttribute("data-dived", "");
    await expect(scene(page)).toHaveAttribute("data-band", "midnight");
    await expect(lastLog(page)).toContainText(LOG.dive.text);
    await changesThePicture(page, () => page.getByRole("button", { name: STAGE_COPY.surface, exact: true }).click());
    await expect(scene(page)).not.toHaveAttribute("data-dived", "");
    await expect(scene(page)).toHaveAttribute("data-band", "sunlit");
    await expect(diveButton(page)).toBeDisabled();
  });

  test("control: speed sets how fast the fish swim, and Stop holds them", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await open(page);
    const drift = () =>
      page.locator(".stage-band-sunlit .stage-drift").first().evaluate((element) => {
        const animation = element.getAnimations()[0];
        return animation ? { rate: animation.playbackRate, state: animation.playState } : undefined;
      });
    const half = await drift();
    expect(half?.state).toBe("running");
    await page.getByRole("radio", { name: "Full" }).click();
    await expect(scene(page)).toHaveAttribute("data-speed", "full");
    await expect.poll(async () => (await drift())?.rate).toBeGreaterThan(half!.rate);
    await expect(lastLog(page)).toContainText(LOG.speed.full.text);
    await page.getByRole("radio", { name: "Stop" }).click();
    await expect.poll(async () => (await drift())?.state).toBe("paused");
    await expect(lastLog(page)).toContainText(LOG.speed.stop.text);
  });

  test("control: lights shine the lantern, and in the deep find who lives there", async ({ page }) => {
    await open(page);
    const lights = page.getByRole("switch", { name: STAGE_COPY.lights });
    await changesThePicture(page, () => lights.click());
    await expect(scene(page)).toHaveAttribute("data-lights", "");
    await expect(lastLog(page)).toContainText(LOG.lightsOn.text);
    await fillTanks(page);
    await diveButton(page).click();
    await settled(page);
    await expect(page.locator(".stage-hidden")).toHaveCSS("opacity", "1");
    await changesThePicture(page, () => lights.click());
    await expect(page.locator(".stage-hidden")).toHaveCSS("opacity", "0");
  });

  test("control: bell brings a toast from the crew and a line in the log", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: STAGE_COPY.bell }).click();
    await expect(page.getByText(`${BELL_TOASTS[0]!.name}: ${BELL_TOASTS[0]!.text}`)).toBeVisible();
    await expect(lastLog(page)).toContainText(LOG.bell.text);
  });
});

test("every operable element on the stage is one of its listed controls", async ({ page }) => {
  await open(page);
  const census = await page.evaluate(() => {
    const operable = [...document.querySelectorAll<HTMLElement>("[data-stage] :is(button, input, select, textarea, a[href], [tabindex]:not([tabindex='-1']), [role=slider], [role=switch], [role=radio])")];
    const loose = operable.filter((element) => !element.closest("[data-stage-control]") && !element.closest(".stage-log")).map((element) => element.outerHTML.slice(0, 120));
    const markers = [...document.querySelectorAll("[data-stage] [data-stage-control]")].map((element) => element.getAttribute("data-stage-control"));
    return { loose, markers };
  });
  expect(census.loose).toEqual([]);
  expect(census.markers).toEqual([...STAGE_CONTROLS]);
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 360, height: 740 },
]) {
  test(`every control answers a touch at ${viewport.width}×${viewport.height}, and nothing overflows`, async ({ browser, browserName }) => {
    test.skip(browserName === "firefox");
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: browserName === "chromium", reducedMotion: "reduce", baseURL: test.info().project.use.baseURL! });
    const page = await context.newPage();
    const errors = diagnostics(page);
    await open(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const control = page.locator("[data-stage-control='depth'] [data-ouro-slider-control]");
    await control.scrollIntoViewIfNeeded();
    const box = await control.boundingBox();
    if (box) await page.touchscreen.tap(box.x + box.width - 2, box.y + box.height / 2);
    else {
      await page.getByRole("slider", { name: STAGE_COPY.depth }).focus();
      await page.keyboard.press("End");
    }
    await expect(scene(page)).not.toHaveAttribute("data-band", "sunlit");
    for (const name of ["Fore", "Middle", "Aft"]) await tank(page, name).tap();
    await expect(scene(page)).toHaveAttribute("data-tanks", "3");
    await diveButton(page).tap();
    await expect(scene(page)).toHaveAttribute("data-dived", "");
    await page.getByRole("switch", { name: STAGE_COPY.lights }).tap();
    await expect(scene(page)).toHaveAttribute("data-lights", "");
    await page.getByRole("radio", { name: "Stop" }).tap();
    await expect(scene(page)).toHaveAttribute("data-speed", "stop");
    await page.getByRole("button", { name: STAGE_COPY.bell }).tap();
    await expect(lastLog(page)).toContainText(LOG.bell.text);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
  });
}

test("under reduced motion the fish hold still and the Nautilus changes place without moving", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  expect(await page.locator(".stage-drift").evaluateAll((elements) => elements.flatMap((element) => element.getAnimations()).length)).toBe(0);
  await page.evaluate(() => {
    (window as unknown as { __moved: string[] }).__moved = [];
    document.addEventListener("transitionstart", (event) => (window as unknown as { __moved: string[] }).__moved.push(event.propertyName));
    document.addEventListener("animationstart", (event) => (window as unknown as { __moved: string[] }).__moved.push(`animation:${event.animationName}`));
  });
  await fillTanks(page);
  await diveButton(page).click();
  await page.getByRole("switch", { name: STAGE_COPY.lights }).click();
  await page.getByRole("radio", { name: "Full" }).click();
  await settled(page);
  const moved = await page.evaluate(() => (window as unknown as { __moved: string[] }).__moved);
  expect(moved.filter((property) => !/^(opacity|color|background-color|border(-(top|right|bottom|left))?-color|outline-color|stop-color|stop-opacity|fill|stroke|box-shadow)$/.test(property))).toEqual([]);
});

test("the fish rest while the stage is off screen", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 600 });
  await open(page);
  const state = () => page.locator(".stage-band-sunlit .stage-drift").first().evaluate((element) => element.getAnimations()[0]?.playState);
  expect(await state()).toBe("running");
  await page.evaluate(() => window.scrollTo(0, document.querySelector("[data-stage]")!.getBoundingClientRect().bottom + window.scrollY + 40));
  await expect(page.locator("[data-stage]")).toHaveAttribute("data-offscreen", "");
  await expect.poll(state).toBe("paused");
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(state).toBe("running");
});
