import { expect, test, type Page } from "@playwright/test";
import { BELL_TOASTS, LOG, OPENING_LOG, STAGE_CONTROLS, STAGE_COPY, TANKS } from "../src/voyage/stage/copy";

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
/**
 * Chapter I's island is fetched with Vite's modulepreload hints for its imports; on a busy runner
 * WebKit can judge a hint "unused" when the island's import lands after its few-second window,
 * though the import then uses it.
 */
const WEBKIT_UNUSED_CHUNK_PRELOAD = /^The resource \S+\/assets\/[\w.-]+\.js was preloaded using link preload but not used within a few seconds/;

function diagnostics(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Only WebKit's heuristic is forgiven, and only in WebKit.
  const webkit = page.context().browser()?.browserType().name() === "webkit";
  page.on("console", (message) => {
    if ((message.type() === "error" || message.type() === "warning") && !WEBKIT_UNUSED_FONT_PRELOAD.test(message.text()) && !(webkit && WEBKIT_UNUSED_CHUNK_PRELOAD.test(message.text()))) errors.push(message.text());
  });
  return errors;
}

async function open(page: Page): Promise<void> {
  await page.goto("voyage/");
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
}

const scene = (page: Page) => page.locator(".stage-scene");
const porthole = (page: Page) => page.locator(".stage-porthole");
/** The crew's newest line, under the porthole. */
const lastLog = (page: Page) => page.locator("[data-stage-crew]");
const [FORE, MIDDLE, AFT] = TANKS;
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
  for (const { name } of TANKS) await tank(page, name).click();
}

test.describe("each control on the stage", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("control: xray outlines every HX component on the page, only when pressed", async ({ page }) => {
    await open(page);
    await expect(page.locator("[data-ouro-inspector-outline]")).toHaveCount(0);
    await expect(page.getByText(STAGE_COPY.real)).toBeVisible();
    await page.locator("[data-stage-control='xray']").getByRole("button", { name: STAGE_COPY.xray }).click();
    await expect(page.getByRole("switch", { name: "X-ray" })).toBeChecked();
    await expect.poll(() => page.locator("[data-ouro-inspector-outline]").count()).toBeGreaterThan(3);
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

  test("control: tank-fore floods the forward tank, its gauge reads full, and the Nautilus sits lower", async ({ page }) => {
    await open(page);
    await changesThePicture(page, () => tank(page, FORE.name).click());
    await expect(scene(page)).toHaveAttribute("data-tanks", "1");
    await expect(page.locator("[data-stage-control='tank-fore'] .stage-gauge")).toHaveAttribute("data-full", "");
    await expect(page.locator("#stage-dive-hint")).toHaveText(STAGE_COPY.diveHint(1));
    await expect(lastLog(page)).toContainText(LOG.tankFull(FORE.noun, 1).text);
  });

  test("control: tank-middle floods the middle tank, and the Nautilus sits lower", async ({ page }) => {
    await open(page);
    await changesThePicture(page, () => tank(page, MIDDLE.name).click());
    await expect(scene(page)).toHaveAttribute("data-tanks", "1");
    await expect(lastLog(page)).toContainText(LOG.tankFull(MIDDLE.noun, 1).text);
    await changesThePicture(page, () => tank(page, MIDDLE.name).click());
    await expect(scene(page)).toHaveAttribute("data-tanks", "0");
    await expect(page.locator("[data-stage-control='tank-middle'] .stage-gauge")).not.toHaveAttribute("data-full", "");
    await expect(lastLog(page)).toContainText(LOG.tankEmpty(MIDDLE.noun).text);
  });

  test("control: tank-aft floods the aft tank, and the third full tank frees the Dive button", async ({ page }) => {
    await open(page);
    await tank(page, FORE.name).click();
    await tank(page, MIDDLE.name).click();
    await expect(lastLog(page)).toContainText(LOG.tankFull(MIDDLE.noun, 2).text);
    await expect(diveButton(page)).toBeDisabled();
    await expect(page.locator("[data-stage-ready]")).toHaveCount(0);
    await changesThePicture(page, () => tank(page, AFT.name).click());
    await expect(scene(page)).toHaveAttribute("data-tanks", "3");
    await expect(diveButton(page)).toBeEnabled();
    await expect(page.locator("[data-stage-ready]")).toHaveText(STAGE_COPY.ready);
    await expect(lastLog(page)).toContainText(LOG.allFull.text);
  });

  test("control: dive takes the Nautilus and the porthole down, and Surface brings them up", async ({ page }) => {
    await open(page);
    await expect(diveButton(page)).toBeDisabled();
    await fillTanks(page);
    await changesThePicture(page, () => diveButton(page).click());
    await expect(scene(page)).toHaveAttribute("data-dived", "");
    await expect(scene(page)).toHaveAttribute("data-band", "midnight");
    await expect(page.locator(".stage-bubbles")).toHaveAttribute("data-streaming", "");
    await expect(page.locator(".stage-specks")).toHaveCSS("opacity", "1");
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

  test("control: log unfolds the crew's lines", async ({ page }) => {
    await open(page);
    const fold = page.getByRole("button", { name: /^Ship's log \(/ });
    // At rest the captain's welcome shows under the porthole, and the log holds it.
    await expect(fold).toHaveAccessibleName(STAGE_COPY.logAll(1));
    await expect(lastLog(page)).toContainText(OPENING_LOG[0]!.text);
    await page.getByRole("radio", { name: "Full" }).click();
    await page.getByRole("radio", { name: "Stop" }).click();
    await expect(fold).toHaveAccessibleName(STAGE_COPY.logAll(3));
    await expect(lastLog(page)).toContainText(LOG.speed.stop.text);
    const earlier = page.locator(".stage-log-fold").getByText(LOG.speed.full.text);
    // Folded, the panel takes no room (WebKit, without hidden=until-found, still reports its text's box).
    const height = () => page.locator(".stage-log-fold [data-ouro-collapsible-panel]").evaluate((panel) => panel.getBoundingClientRect().height);
    await expect.poll(height).toBe(0);
    await fold.click();
    await expect(earlier).toBeVisible();
    await expect.poll(height).toBeGreaterThan(40);
    await fold.click();
    await expect.poll(height).toBe(0);
  });

  test("control: bell brings a toast from the crew, rings, and sends rings through the water", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: STAGE_COPY.bell }).click();
    await expect(page.getByText(`${BELL_TOASTS[0]!.name}: ${BELL_TOASTS[0]!.text}`)).toBeVisible();
    await expect(lastLog(page)).toContainText(LOG.bell.text);
    await expect(page.locator("[data-stage-control='bell']")).toHaveAttribute("data-ring", "a");
    await expect(page.locator(".stage-ripples ellipse")).toHaveCount(3);
    // Under reduced motion the bell glows instead of swinging. The glow is 900ms and runs once, so read the style rather than the running animations.
    await expect(page.locator(".stage-bell-body")).toHaveCSS("animation-name", "stage-bell-glow-a");
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
    // As a reader would: scroll the console up under the porthole until the lever is in view.
    await control.evaluate((element) => element.scrollIntoView({ block: "end" }));
    const box = await control.boundingBox();
    if (box) await page.touchscreen.tap(box.x + box.width - 2, box.y + box.height / 2);
    else {
      await page.getByRole("slider", { name: STAGE_COPY.depth }).focus();
      await page.keyboard.press("End");
    }
    await expect(scene(page)).not.toHaveAttribute("data-band", "sunlit");
    for (const { name } of TANKS) await tank(page, name).tap();
    await expect(scene(page)).toHaveAttribute("data-tanks", "3");
    await diveButton(page).evaluate((element) => element.scrollIntoView({ block: "end" }));
    const scrolled = await page.evaluate(() => window.scrollY);
    const dive = (await diveButton(page).boundingBox())!;
    await page.touchscreen.tap(dive.x + dive.width / 2, dive.y + dive.height / 2);
    await expect(scene(page)).toHaveAttribute("data-dived", "");
    // Dive doesn't move the page: the porthole is already in view, held under the sticky header.
    expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
    const view = await porthole(page).evaluate((element) => {
      const box = element.querySelector("svg")!.getBoundingClientRect();
      const header = document.querySelector("header")!.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, headerBottom: header.bottom, height: window.innerHeight };
    });
    expect(view.top).toBeGreaterThanOrEqual(view.headerBottom - 1);
    expect(view.bottom).toBeLessThanOrEqual(view.height + 1);
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

/** What each animation and transition that starts on the page changes: a CSS property, or an animation's keyframe properties. */
async function recordMotion(page: Page): Promise<void> {
  await page.evaluate(() => {
    const moved: string[] = ((window as unknown as { __moved: string[] }).__moved = []);
    document.addEventListener("transitionstart", (event) => moved.push(event.propertyName));
    document.addEventListener("animationstart", (event) => {
      const animation = (event.target as Element).getAnimations().find((each) => (each as CSSAnimation).animationName === event.animationName);
      const keys = (animation?.effect as KeyframeEffect | undefined)?.getKeyframes().flatMap((frame) => Object.keys(frame)) ?? [];
      moved.push(...new Set(keys.filter((key) => !["offset", "easing", "composite", "computedOffset"].includes(key)).map((key) => `${event.animationName}:${key}`)));
    });
  });
}
const moved = (page: Page) => page.evaluate(() => (window as unknown as { __moved: string[] }).__moved);

test("under reduced motion the fish hold still and every payoff changes only colour and opacity", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  expect(await page.locator(".stage-drift").evaluateAll((elements) => elements.flatMap((element) => element.getAnimations()).length)).toBe(0);
  await recordMotion(page);
  await fillTanks(page);
  await diveButton(page).click();
  await page.getByRole("switch", { name: STAGE_COPY.lights }).click();
  await page.getByRole("radio", { name: "Full" }).click();
  await page.getByRole("button", { name: STAGE_COPY.bell }).click();
  await settled(page);
  const all = await moved(page);
  expect(all.length).toBeGreaterThan(0);
  expect(all.map((entry) => entry.replace(/^[\w-]+:/, "")).filter((property) => !/^(opacity|color|background-color|backgroundColor|border(-(top|right|bottom|left))?-color|outline-color|outlineColor|stop-color|stopColor|stop-opacity|stopOpacity|fill|stroke|box-shadow|boxShadow)$/.test(property))).toEqual([]);
});

test("without reduced motion, each payoff moves: bubbles, the needles, the Ready badge, the beam, the bell and the rings", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await open(page);
  await recordMotion(page);
  await fillTanks(page);
  await expect(page.locator("[data-stage-ready]")).toBeVisible();
  await settled(page);
  await diveButton(page).click();
  await page.getByRole("switch", { name: STAGE_COPY.lights }).click();
  await page.getByRole("button", { name: STAGE_COPY.bell }).click();
  await settled(page);
  const all = await moved(page);
  for (const expected of ["transform", "stage-pop:transform", "stage-bubble:transform", "stage-ready-lights:fill", "stage-sweep:transform", "stage-bell-a:transform", "stage-ripple:transform"]) expect(all, all.join(" ")).toContain(expected);
  // The creatures answer the light: the fish dart from the beam and the octopus rises into it.
  const moving = (selector: string) => page.locator(selector).first().evaluate((element) => getComputedStyle(element).transform);
  await expect.poll(() => moving(".stage-band-midnight .stage-react")).not.toBe("none");
  await expect.poll(() => moving(".stage-octopus")).toBe("none");
});

test("the deep glows: in midnight water the lanternfish's lamps and the deep jelly pulse, and rest off screen", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  const glowing = () => page.locator(".stage-band-midnight .c-glow").evaluateAll((elements) => elements.flatMap((element) => element.getAnimations()).filter((animation) => (animation as CSSAnimation).animationName === "stage-lure" && animation.playState === "running").length);
  expect(await glowing()).toBe(0);
  await page.getByRole("slider", { name: STAGE_COPY.depth }).focus();
  await page.keyboard.press("End");
  await expect(scene(page)).toHaveAttribute("data-band", "midnight");
  await expect.poll(glowing).toBeGreaterThan(3);
});

test("three full tanks are a small celebration: the hull's lights blink and bubbles rise", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  await expect(page.locator(".stage-bubbles")).not.toHaveAttribute("data-streaming", "");
  await fillTanks(page);
  await expect(page.locator(".stage-bubbles")).toHaveAttribute("data-streaming", "");
  const blinks = await page.locator(".n-lights circle").first().evaluate((element) => element.getAnimations().map((animation) => (animation as CSSAnimation).animationName));
  expect(blinks).toContain("stage-ready-lights");
  await expect(page.locator("[data-stage-tank-count]")).toHaveText(STAGE_COPY.tankCount(3));
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

test.describe("the ballast manifold and the bell's payoffs", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  /** How far up a tank's sight glass the water stands, 0 (empty) to 1 (brim), from its drawn box. */
  const waterLevel = (page: Page, id: string) =>
    page.locator(`[data-stage-control='tank-${id}'] .stage-gauge`).evaluate((gauge) => {
      const glass = gauge.querySelector(".stage-gauge-face")!.getBoundingClientRect();
      const water = gauge.querySelector(".stage-gauge-water")!.getBoundingClientRect();
      return Math.round(Math.min(1, Math.max(0, (glass.bottom - water.top) / glass.height)) * 100) / 100;
    });
  const pipeFill = (page: Page) =>
    page.locator(".stage-pipe").evaluate((pipe) => Math.round((pipe.querySelector(".stage-pipe-water")!.getBoundingClientRect().width / pipe.getBoundingClientRect().width) * 100) / 100);

  test("each tank floods visibly: its glass fills, the pipe fills a third, and the crew says so", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await open(page);
    expect(await waterLevel(page, "fore")).toBe(0);
    expect(await pipeFill(page)).toBe(0);
    await tank(page, FORE.name).click();
    await expect.poll(() => waterLevel(page, "fore")).toBeGreaterThan(0.75);
    await expect.poll(() => pipeFill(page)).toBeCloseTo(1 / 3, 1);
    await expect(lastLog(page)).toContainText(LOG.tankFull(FORE.noun, 1).text);
    await tank(page, MIDDLE.name).click();
    await expect.poll(() => pipeFill(page)).toBeCloseTo(2 / 3, 1);
    await tank(page, FORE.name).click();
    await expect.poll(() => waterLevel(page, "fore")).toBe(0);
    await expect(lastLog(page)).toContainText(LOG.tankEmpty(FORE.noun).text);
  });

  test("under reduced motion a flooded glass's water fades in instead of rising", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page);
    const water = page.locator("[data-stage-control='tank-aft'] .stage-gauge-water");
    await expect(water).toHaveCSS("opacity", "0");
    await tank(page, AFT.name).click();
    await expect(water).toHaveCSS("opacity", "1");
  });

  test("full tanks make Dive the panel's one bright button, ringed and breathing", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page);
    const background = (locator: ReturnType<Page["locator"]>) => locator.evaluate((element) => getComputedStyle(element).backgroundColor);
    const solid = await background(page.getByRole("link", { name: "Come aboard" }));
    expect(await background(diveButton(page))).not.toBe(solid);
    await fillTanks(page);
    await expect(page.locator("[data-stage-control='dive']")).toHaveAttribute("data-ready", "");
    await expect.poll(() => background(diveButton(page))).toBe(solid);
    expect(await diveButton(page).evaluate((element) => element.getAnimations().map((animation) => (animation as CSSAnimation).animationName))).toContain("stage-dive-ready");
  });

  test("the bell sends sonar through the water, the creatures start, and the crew answers", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await open(page);
    await page.getByRole("button", { name: STAGE_COPY.bell }).click();
    await expect(scene(page)).toHaveAttribute("data-ring", "a");
    await expect(page.getByText(`${BELL_TOASTS[0]!.name}: ${BELL_TOASTS[0]!.text}`)).toBeVisible();
    await expect(lastLog(page)).toContainText(LOG.bell.text);
    const names = (selector: string) => page.locator(selector).evaluateAll((elements) => elements.flatMap((element) => element.getAnimations()).map((animation) => (animation as CSSAnimation).animationName));
    expect(await names(".stage-ripples ellipse")).toContain("stage-ripple");
    expect(await names(".stage-band-sunlit .stage-react")).toContain("stage-startle-a");
    await page.getByRole("button", { name: STAGE_COPY.bell }).click();
    await expect(scene(page)).toHaveAttribute("data-ring", "b");
    expect(await names(".stage-band-sunlit .stage-react")).toContain("stage-startle-b");
  });

  test("under reduced motion the bell's creatures flicker instead of starting", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page);
    await page.getByRole("button", { name: STAGE_COPY.bell }).click();
    await expect(scene(page)).toHaveAttribute("data-ring", "a");
    const names = await page.locator(".stage-band-sunlit .stage-react").evaluateAll((elements) => elements.flatMap((element) => element.getAnimations()).map((animation) => (animation as CSSAnimation).animationName));
    expect(names).toContain("stage-startle-fade-a");
  });
});

test("on a phone, keyboard focus on the stage always stops below the pinned porthole", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", baseURL: test.info().project.use.baseURL! });
  const page = await context.newPage();
  await open(page);
  await diveButton(page).evaluate((element) => {
    // Dive is disabled until the tanks are full; focus the first tank's switch after it instead.
    (element.closest(".stage-manifold")!.querySelector("[role='switch']") as HTMLElement).focus();
  });
  for (let step = 0; step < 4; step++) {
    await page.keyboard.press("Shift+Tab");
    const place = await page.evaluate(() => {
      const focused = document.activeElement as HTMLElement;
      if (!focused.closest("[data-stage]")) return null;
      return { top: focused.getBoundingClientRect().top, glass: document.querySelector(".stage-window")!.getBoundingClientRect().bottom, name: focused.getAttribute("aria-label") ?? focused.textContent };
    });
    if (!place) break;
    expect(place.top, `${place.name} is below the porthole`).toBeGreaterThanOrEqual(place.glass - 1);
  }
  await context.close();
});

for (const mode of ["light", "dark"] as const) {
  test(`on a phone (${mode}), the crew's line sits between the porthole and the console, over nothing, at rest and after a dive`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, colorScheme: mode, baseURL: test.info().project.use.baseURL! });
    await context.addInitScript((m) => localStorage.setItem("ouro-site-theme", JSON.stringify({ preset: "sleek", mode: m })), mode);
    const page = await context.newPage();
    await open(page);
    /** Where the crew's line, the porthole and the console's first row are, and what is drawn on top at the first row's label and readout. */
    const layout = () =>
      page.evaluate(() => {
        const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
        const row = document.querySelector(".stage-instruments")!;
        const onTop = [".stage-depth-head .stage-heading", "[data-stage-readout]", "[data-stage-control='depth'] [data-ouro-slider-control]"].map((selector) => {
          const part = document.querySelector(selector)!.getBoundingClientRect();
          return row.contains(document.elementFromPoint(part.left + part.width / 2, part.top + part.height / 2));
        });
        return { crew: box("[data-stage-crew]"), glass: box(".stage-porthole svg"), row: box(".stage-instruments"), slider: box("[data-stage-control='depth'] [data-ouro-slider-control]"), onTop, height: innerHeight };
      });
    const inFlow = (place: Awaited<ReturnType<typeof layout>>) => {
      expect(place.crew.top, "the crew's line is under the glass").toBeGreaterThanOrEqual(place.glass.bottom - 1);
      expect(place.crew.bottom, "the console's first row starts below the crew's line").toBeLessThanOrEqual(place.row.top + 1);
      expect(place.onTop, "nothing lies over Depth's label, readout or lever").toEqual([true, true, true]);
    };
    const rest = await layout();
    inFlow(rest);
    // The first screen shows a control to use, under the whole porthole and the captain's cue.
    expect(rest.slider.bottom).toBeLessThanOrEqual(rest.height);
    for (const { name } of TANKS) await tank(page, name).tap();
    await diveButton(page).tap();
    await page.getByRole("switch", { name: STAGE_COPY.lights }).tap();
    await page.getByRole("slider", { name: STAGE_COPY.depth }).focus();
    await page.keyboard.press("End");
    await expect(scene(page)).toHaveAttribute("data-band", "midnight");
    await expect(lastLog(page)).not.toContainText(OPENING_LOG.at(-1)!.text);
    // Focus on the lever brings its row out from under the pinned glass (the page scrolls smoothly).
    await expect.poll(async () => { const place = await layout(); return place.crew.bottom <= place.row.top + 1 && place.onTop.every(Boolean); }).toBe(true);
    inFlow(await layout());
    await context.close();
  });
}

test("on a phone, the bell's toast never covers the bell", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, baseURL: test.info().project.use.baseURL! });
  const page = await context.newPage();
  await open(page);
  const bell = page.getByRole("button", { name: STAGE_COPY.bell });
  await bell.evaluate((element) => element.scrollIntoView({ block: "end" }));
  await bell.tap();
  const toast = page.locator('[data-ouro="toast"]').first();
  await expect(toast).toBeVisible();
  await expect
    .poll(async () => {
      const [b, t] = await Promise.all([bell.boundingBox(), toast.boundingBox()]);
      return b!.y + b!.height <= t!.y;
    })
    .toBe(true);
  await context.close();
});
