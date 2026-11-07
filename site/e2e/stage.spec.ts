import { expect, test, type Page } from "@playwright/test";
import { BELL_TOASTS, LOG, OPENING_LOG, SPEAKER, STAGE_CONTROLS, STAGE_COPY, TANKS } from "../src/voyage/stage/copy";
import { diagnostics } from "./diagnostics";
import { watchToasts } from "./toasts";

// The porthole stage against the production build (site-design.md, "Verification in CI"): each
// control in STAGE_CONTROLS has a test named "control: <id>" that operates it and asserts what it
// visibly changes (site/scripts/stage-census.test.mjs fails when one is missing), every operable
// element on the stage is one of those controls, touch works on phones, nothing moves under reduced
// motion, and the fish rest off screen. Each control's latency is stage.latency.spec.ts's.

async function open(page: Page): Promise<void> {
  await page.goto("./");
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
}

const scene = (page: Page) => page.locator(".stage-scene");

/**
 * The fish swimming at Half, from a page the stage has judged: a screen too slow to swim them (CI's WebKit, drawing without
 * its GPU) starts in still water, and a press on Half sets them going, as a visitor's would.
 */
async function swimming(page: Page): Promise<void> {
  // real clock: the stage judges the screen on its real frames, a beat and then a second of them.
  await expect(page.locator("[data-stage]")).toHaveAttribute("data-paced", "");
  // The verdict asked of the control, which commits with data-paced: the scene follows the controls a paint later, so its
  // data-speed can still say Half for a frame after the stage has chosen Stop.
  if (await page.getByRole("radio", { name: "Stop" }).isChecked()) await page.getByRole("radio", { name: "Half" }).click();
  await expect(scene(page)).toHaveAttribute("data-speed", "half");
}

/** Holds the page on each frame for `ms` from when its HTML has loaded, as a screen that draws slowly would. */
const slowFrames = (page: Page, ms: number) =>
  page.addInitScript((hold) => {
    const burn = () => {
      const end = performance.now() + hold;
      while (performance.now() < end);
      requestAnimationFrame(burn);
    };
    addEventListener("DOMContentLoaded", () => requestAnimationFrame(burn));
  }, ms);

/** Opens the stage on a page that draws slowly, which takes longer to be ready. */
async function openSlow(page: Page): Promise<void> {
  await page.goto("./");
  await expect(page.locator("html[data-site-ready]")).toBeAttached({ timeout: 20_000 });
}

/** The stage's endless animations that are running: the fish's drift and the caustics' sway. */
const ambient = (page: Page) =>
  page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === "running" && ["stage-drift", "stage-caustics"].includes((animation as CSSAnimation).animationName)).length);
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

/** Waits until the page has not scrolled for five frames in a row. */
async function scrollAtRest(page: Page): Promise<void> {
  await page.evaluate(async () => {
    let last = scrollY;
    for (let still = 0, frame = 0; still < 5 && frame < 300; frame++) {
      await new Promise(requestAnimationFrame);
      still = scrollY === last ? still + 1 : 0;
      last = scrollY;
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

/**
 * Records each CSS animation that starts from now on, and returns which ones started on the elements
 * a selector matches. A test can't look for a one-off animation still running: it lasts under a
 * second, less than the waits before the look can take on a busy runner.
 */
async function recordAnimations(page: Page): Promise<(selector: string) => Promise<string[]>> {
  await page.evaluate(() => {
    const started: Array<{ target: Element; name: string }> = [];
    (window as unknown as { __started: typeof started }).__started = started;
    document.addEventListener("animationstart", (event) => started.push({ target: event.target as Element, name: event.animationName }));
  });
  return (selector) =>
    page.evaluate((selector) => {
      const started = (window as unknown as { __started: Array<{ target: Element; name: string }> }).__started;
      return [...new Set(started.filter(({ target }) => target.matches(selector)).map(({ name }) => name))];
    }, selector);
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
    // real clock: the hero's line, which stays.
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
    await swimming(page);
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
    // Still, so the lines are the presses' own: a slow screen's still water would add the captain's.
    await page.emulateMedia({ reducedMotion: "reduce" });
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
    const started = await recordAnimations(page);
    const toasts = await watchToasts(page);
    await page.getByRole("button", { name: STAGE_COPY.bell }).click();
    await expect.poll(toasts.titles).toContain(`${SPEAKER[BELL_TOASTS[0]!.name]}: ${BELL_TOASTS[0]!.text}`);
    await expect(lastLog(page)).toContainText(LOG.bell.text);
    await expect(page.locator("[data-stage-control='bell']")).toHaveAttribute("data-ring", "a");
    await expect(page.locator(".stage-ripple")).toHaveCount(3);
    // Under reduced motion the bell glows instead of swinging.
    await expect.poll(() => started(".stage-bell-icon")).toEqual(["stage-bell-glow-a"]);
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
  expect(all.map((entry) => entry.replace(/^[\w-]+:/, "")).filter((property) => !/^(opacity|visibility|color|background-color|backgroundColor|border(-(top|right|bottom|left))?-color|outline-color|outlineColor|stop-color|stopColor|stop-opacity|stopOpacity|fill|stroke|box-shadow|boxShadow)$/.test(property))).toEqual([]);
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
  for (const expected of ["transform", "stage-pop:transform", "stage-bubble:transform", "stage-ready-lights:opacity", "stage-sweep:transform", "stage-bell-a:transform", "stage-ripple:transform"]) expect(all, all.join(" ")).toContain(expected);
  // The creatures answer the light: the fish dart from the beam and the octopus rises into it.
  const moving = (selector: string) => page.locator(selector).first().evaluate((element) => getComputedStyle(element).transform);
  await expect.poll(() => moving(".stage-band-midnight .stage-react")).not.toBe("none");
  await expect.poll(() => moving(".stage-octopus")).toBe("none");
});

test("the deep glows: in midnight water the lanternfish's lamps and the deep jelly pulse, and rest off screen", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  const glowing = () => page.locator(".stage-band-midnight .stage-glow").evaluateAll((elements) => elements.flatMap((element) => element.getAnimations()).filter((animation) => (animation as CSSAnimation).animationName === "stage-glow" && animation.playState === "running").length);
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
  const blinks = await page.locator(".stage-hull-lit").evaluate((element) => element.getAnimations().map((animation) => (animation as CSSAnimation).animationName));
  expect(blinks).toContain("stage-ready-lights");
  await expect(page.locator("[data-stage-tank-count]")).toHaveText(STAGE_COPY.tankCount(3));
});

// The switch to still water draws no long frame: a visitor on a slow screen may reach for the menu just then
// (ourostack/ouro-ui#667). The stage's judge is shown slow frames by scaling its requestAnimationFrame timestamps, so it
// reaches its real verdict while the page itself runs at full speed and pays the switch's real cost; the frames are read
// from an unscaled requestAnimationFrame, from just before the verdict until the scene has stood still for half a second.
const SWITCH_FRAME_BUDGET = 100;
test("the switch to still water draws no long frame", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    const raw = window.requestAnimationFrame.bind(window);
    const frames: number[] = [];
    (window as unknown as { __frames: number[] }).__frames = frames;
    window.requestAnimationFrame = (callback) => raw((now) => callback(now * 10));
    const count = () => {
      frames.push(performance.now());
      raw(count);
    };
    raw(count);
    // When the verdict lands, stamped in the page.
    document.addEventListener("DOMContentLoaded", () => {
      const stage = document.querySelector("[data-stage]")!;
      new MutationObserver(() => {
        if (stage.hasAttribute("data-paced")) (window as unknown as { __paced: number }).__paced ??= performance.now();
      }).observe(stage, { attributes: true, attributeFilter: ["data-paced"] });
    });
  });
  await open(page);
  await expect(page.locator("[data-stage]")).toHaveAttribute("data-paced", "");
  await expect(scene(page)).toHaveAttribute("data-speed", "stop");
  // real clock: half a second of frames with the scene still.
  await page.waitForTimeout(500);
  const { worst, at, series } = await page.evaluate(() => {
    const from = (window as unknown as { __paced: number }).__paced;
    const all = (window as unknown as { __frames: number[] }).__frames;
    // Every frame's gap from 1.5 s before the verdict, as "ms from the verdict:gap", for the failure's record.
    const series = all
      .map((time, index) => (index ? `${Math.round(all[index - 1]! - from)}:${Math.round(time - all[index - 1]!)}` : ""))
      .filter((entry, index) => index && all[index - 1]! >= from - 1500)
      .join(" ");
    const frames = all.filter((time) => time >= from - 50);
    let worst = 0;
    let at = 0;
    for (let index = 1; index < frames.length; index += 1)
      if (frames[index]! - frames[index - 1]! > worst) {
        worst = frames[index]! - frames[index - 1]!;
        at = frames[index - 1]! - from;
      }
    return { worst: Math.round(worst), at: Math.round(at), series };
  });
  expect(worst, `the longest frame around the switch, ${at} ms from the verdict; each frame from 1.5 s before it: ${series}`).toBeLessThan(SWITCH_FRAME_BUDGET);
});

test("a screen too slow to swim the fish gets still water, its speed at Stop, and Half sets them swimming", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await slowFrames(page, 150);
  await openSlow(page);
  // real clock: the stage judges the screen on its real frames, a beat and then a second of them.
  await expect(page.locator("[data-stage]")).toHaveAttribute("data-paced", "");
  await expect(scene(page)).toHaveAttribute("data-speed", "stop");
  await expect(page.getByRole("radio", { name: "Stop" })).toBeChecked();
  await expect(lastLog(page)).toContainText(LOG.stillWater.text);
  await expect.poll(() => ambient(page)).toBe(0);
  await page.getByRole("radio", { name: "Half" }).click();
  await expect(scene(page)).toHaveAttribute("data-speed", "half");
  await expect.poll(() => ambient(page)).toBeGreaterThan(0);
});

/**
 * Times the page to the stage's beat (its 500 ms wait before it reads the frames). `stall` holds the page that long inside
 * the second the stage reads (after its first frame); `delay` puts the first beat off. With `starve`, the page draws no frame from
 * each beat on (requestAnimationFrame's callbacks wait) until `lift[n]` ms after the nth beat, if that is given; `hideAt`
 * hides the page and shows it again that long after the first beat.
 */
const onTheBeat = (
  page: Page,
  { stall = 0, delay = 0, starve = false, lift = [], hideAt = 0 }: { stall?: number; delay?: number; starve?: boolean; lift?: (number | undefined)[]; hideAt?: number },
) =>
  page.addInitScript(
    ({ stall, delay, starve, lift, hideAt }) => {
      const original = window.setTimeout;
      const frames = window.requestAnimationFrame.bind(window);
      const cancel = window.cancelAnimationFrame.bind(window);
      let starving = false;
      // Held frames keep ids of their own (negative, apart from the browser's), so cancelling one still works.
      const waiting = new Map<number, FrameRequestCallback>();
      let held = 0;
      window.requestAnimationFrame = (callback) => {
        if (!starving) return frames(callback);
        waiting.set(--held, callback);
        return held;
      };
      window.cancelAnimationFrame = (id) => {
        if (id < 0) waiting.delete(id);
        else cancel(id);
      };
      const feed = () => {
        starving = false;
        for (const callback of waiting.values()) frames(callback);
        waiting.clear();
      };
      let hidden = false;
      Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
      let beats = 0;
      let scheduled = 0;
      window.setTimeout = ((callback: () => void, ms?: number, ...rest: unknown[]) => {
        if (ms !== 500) return original(callback, ms, ...rest);
        const later = scheduled++ === 0 ? delay : 0;
        return original(
          () => {
            const beat = beats++;
            if (starve) starving = true;
            callback();
            // A gap in `lift` arrives here as null (the script's arguments travel as JSON).
            const after = lift[beat];
            if (starve && typeof after === "number") original(feed, after);
            if (hideAt && beat === 0)
              original(() => {
                hidden = true;
                document.dispatchEvent(new Event("visibilitychange"));
                hidden = false;
                document.dispatchEvent(new Event("visibilitychange"));
              }, hideAt);
            // The stall lands inside the second the stage reads: its first frame has started it.
            if (stall)
              requestAnimationFrame(() =>
                requestAnimationFrame(() => {
                  const end = performance.now() + stall;
                  while (performance.now() < end);
                }),
              );
          },
          500 + later,
        );
      }) as typeof setTimeout;
    },
    { stall, delay, starve, lift, hideAt },
  );

test("one long task is not a slow screen: the fish keep swimming", async ({ page, browserName }) => {
  test.skip(browserName === "webkit", "CI's WebKit is a slow screen with no stall: it draws without the GPU");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // One stall of nearly a second inside the second the stage reads, which a count of that second's frames calls slow.
  await onTheBeat(page, { stall: 900 });
  await open(page);
  // real clock: the stage judges the screen on its real frames, a beat and then a second of them.
  await expect(page.locator("[data-stage]")).toHaveAttribute("data-paced", "");
  await expect(scene(page)).toHaveAttribute("data-speed", "half");
});

test("a screen that draws no frame for two seconds, twice running, gets still water", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // No frame for 4.5 s from the beat, past both of the stage's two-second waits; then frames, which draw its Stop.
  await onTheBeat(page, { starve: true, lift: [4500] });
  await open(page);
  // real clock: the stage gives up waiting for frames two seconds after it starts to read them, twice.
  await expect(page.locator("[data-stage]")).toHaveAttribute("data-paced", "", { timeout: 10_000 });
  await expect(scene(page)).toHaveAttribute("data-speed", "stop");
  await expect(lastLog(page)).toContainText(LOG.stillWater.text);
});

test("two seconds without a frame, once, is not a slow screen: the stage reads another second", async ({ page, browserName }) => {
  test.skip(browserName === "webkit", "CI's WebKit is a slow screen with no stall: it draws without the GPU");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // No frame for 1.9 s from the beat, so the stage's first two seconds end without a verdict; then frames as usual.
  await onTheBeat(page, { starve: true, lift: [1900] });
  await open(page);
  // real clock: the stage judges the screen on its real frames, a beat, two seconds and then a second of them.
  await expect(page.locator("[data-stage]")).toHaveAttribute("data-paced", "", { timeout: 10_000 });
  await expect(scene(page)).toHaveAttribute("data-speed", "half");
});

test("a page hidden and shown again starts its count of frameless seconds afresh", async ({ page, browserName }) => {
  test.skip(browserName === "webkit", "CI's WebKit is a slow screen with no stall: it draws without the GPU");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // Two frameless seconds, then the page hidden and shown, then two more and frames as usual: once each side is not slow.
  await onTheBeat(page, { starve: true, lift: [undefined, 1900], hideAt: 2500 });
  await open(page);
  // real clock: the stage judges the screen on its real frames, across a beat, the hidden page, another beat and seconds of frames.
  await expect(page.locator("[data-stage]")).toHaveAttribute("data-paced", "", { timeout: 15_000 });
  await expect(scene(page)).toHaveAttribute("data-speed", "half");
});

for (const { choice, press, speed } of [
  { choice: "a speed", press: (page: Page) => page.getByRole("radio", { name: "Full" }).click(), speed: "full" },
  { choice: "a tank", press: (page: Page) => tank(page, FORE.name).click(), speed: "half" },
]) {
  test(`${choice} chosen before the stage has judged the screen stands, however slow it draws`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    // The stage's beat put off by four seconds, so the visitor's press comes first.
    await onTheBeat(page, { delay: 4000 });
    await slowFrames(page, 150);
    await openSlow(page);
    await expect(page.locator("[data-stage]")).not.toHaveAttribute("data-paced", "");
    await press(page);
    // real clock: the press itself marks the stage as judged; no timer is involved.
    await expect(page.locator("[data-stage]")).toHaveAttribute("data-paced", "");
    // real clock: past the stage's put-off beat and a second of frames, to show it no longer judges.
    await page.waitForTimeout(6000);
    await expect(scene(page)).toHaveAttribute("data-speed", speed);
    await expect(lastLog(page)).not.toContainText(LOG.stillWater.text);
  });
}

const siteMenu = (page: Page) => page.getByRole("banner").getByRole("button", { name: "Menu", exact: true });

test("under the open site menu the fish wait, and swim on when it closes, at every open", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await open(page);
  await swimming(page);
  // real clock: the sheet is built when the browser says the page is idle, which no page clock drives.
  await expect(page.locator('[data-ouro="sheet"][hidden]')).toBeAttached();
  await expect.poll(() => ambient(page)).toBeGreaterThan(0);
  // The first open and the next, on the sheet kept between them.
  for (let round = 0; round < 2; round += 1) {
    await siteMenu(page).click();
    await expect.poll(() => ambient(page)).toBe(0);
    await page.keyboard.press("Escape");
    await expect.poll(() => ambient(page)).toBeGreaterThan(0);
  }
});

test("the stage judges the screen only once the site menu over it has closed", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // The stage's beat put off by six seconds, so the menu opens first, on a page too slow for the fish.
  await onTheBeat(page, { delay: 6000 });
  await slowFrames(page, 150);
  await openSlow(page);
  // A record of what the stage waits on, read back if it has not judged: the menu's mark on the root, its beats (the
  // 500 ms waits) as they are set and fire, and the frames drawn. Kept from the loaded page, whose root is the one marked.
  await page.evaluate(() => {
    const record = { marks: [] as string[], beats: [] as string[], frames: 0, lastFrame: 0 };
    (window as unknown as { __stageRecord: typeof record }).__stageRecord = record;
    const at = () => Math.round(performance.now());
    new MutationObserver(() => record.marks.push(`${at()}:${document.documentElement.hasAttribute("data-site-menu-open") ? "open" : "shut"}`)).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-site-menu-open"],
    });
    const set = window.setTimeout;
    window.setTimeout = ((callback: () => void, ms?: number, ...rest: unknown[]) => {
      if (ms !== 500 && ms !== 2000) return set(callback, ms, ...rest);
      const id = set(() => {
        record.beats.push(`${at()}:fire${ms}#${id}`);
        callback();
      }, ms, ...rest);
      record.beats.push(`${at()}:set${ms}#${id}`);
      return id;
    }) as typeof setTimeout;
    const clear = window.clearTimeout;
    window.clearTimeout = ((id?: number) => {
      if (id && record.beats.some((beat) => beat.endsWith(`#${id}`))) record.beats.push(`${at()}:clear#${id}`);
      clear(id);
    }) as typeof clearTimeout;
    const stage = document.querySelector("[data-stage]")!;
    new MutationObserver(() => record.marks.push(`${at()}:${stage.hasAttribute("data-paced") ? "paced" : "unpaced"}`)).observe(stage, {
      attributes: true,
      attributeFilter: ["data-paced"],
    });
    const count = () => {
      record.frames += 1;
      record.lastFrame = at();
      requestAnimationFrame(count);
    };
    requestAnimationFrame(count);
  });
  await siteMenu(page).click();
  // real clock: past the stage's put-off beat and a second of frames, with the menu open all the while.
  await page.waitForTimeout(8000);
  await expect(page.locator("[data-stage]")).not.toHaveAttribute("data-paced", "");
  await page.keyboard.press("Escape");
  // real clock: a beat after the menu closes, and then a second of frames. Until then, what the stage is waiting on.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const stage = document.querySelector("[data-stage]")!;
          if (stage.hasAttribute("data-paced")) return "judged";
          return JSON.stringify({
            menuOpen: document.documentElement.hasAttribute("data-site-menu-open"),
            offscreen: stage.hasAttribute("data-offscreen"),
            hidden: document.hidden,
            speed: document.querySelector(".stage-scene")?.getAttribute("data-speed"),
            sheets: [...document.querySelectorAll<HTMLElement>('[data-ouro="sheet"]')].map((sheet) => (sheet.hidden ? "hidden" : "shown")),
            scrollY: Math.round(scrollY),
            // The page's own visibility, under the stand-in onTheBeat gives document.hidden.
            visibility: document.visibilityState,
            reallyHidden: Object.getOwnPropertyDescriptor(Document.prototype, "hidden")?.get?.call(document),
            reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
            now: Math.round(performance.now()),
            record: (window as unknown as { __stageRecord: unknown }).__stageRecord,
          });
        }),
      { timeout: 15_000 },
    )
    .toBe("judged");
  await expect(scene(page)).toHaveAttribute("data-speed", "stop");
  // The crew says why, through React's scheduler: if that were held up after the menu closes, this line would not come.
  await expect(lastLog(page)).toContainText(LOG.stillWater.text);
});

test("the fish rest while the stage is off screen", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 600 });
  await open(page);
  await swimming(page);
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
    // A busy machine can style the page before its stylesheet arrives, and the glasses and the pipe
    // then drain from unstyled (full) to empty through their transitions. Measure them at rest.
    await settled(page);
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

  /** The share of the lower half of two same-sized screenshots whose pixels differ clearly. */
  const changedShare = (page: Page, before: Buffer, after: Buffer) =>
    page.evaluate(
      async ({ before, after }) => {
        const pixels = async (png: string) => {
          const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(png), (char) => char.charCodeAt(0))], { type: "image/png" }));
          const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d")!;
          context.drawImage(bitmap, 0, 0);
          return context.getImageData(0, 0, bitmap.width, bitmap.height);
        };
        const [a, b] = await Promise.all([pixels(before), pixels(after)]);
        let changed = 0;
        let total = 0;
        for (let row = Math.ceil(a.height / 2); row < a.height; row++) {
          for (let column = 0; column < a.width; column++) {
            const at = (row * a.width + column) * 4;
            total++;
            const apart = (channel: number) => Math.abs((a.data[at + channel] ?? 0) - (b.data[at + channel] ?? 0));
            if (apart(0) + apart(1) + apart(2) > 96) changed++;
          }
        }
        return changed / total;
      },
      { before: before.toString("base64"), after: after.toString("base64") },
    );

  for (const colorScheme of ["light", "dark"] as const) {
    test(`under forced colours (${colorScheme}) a flooded sight glass shows its water`, async ({ page }) => {
      await page.emulateMedia({ forcedColors: "active", colorScheme, reducedMotion: "reduce" });
      await open(page);
      const glass = page.locator("[data-stage-control='tank-aft'] .stage-gauge-glass");
      await settled(page);
      const empty = await glass.screenshot({ animations: "disabled" });
      await tank(page, AFT.name).click();
      await expect(page.locator("[data-stage-control='tank-aft'] .stage-gauge-water")).toHaveCSS("opacity", "1");
      await settled(page);
      const full = await glass.screenshot({ animations: "disabled" });
      expect(await changedShare(page, empty, full), "the water fills most of the glass's lower half").toBeGreaterThan(0.6);
    });
  }

  test("full tanks make Dive the panel's one bright button, ringed and breathing", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page);
    const background = (locator: ReturnType<Page["locator"]>) => locator.evaluate((element) => getComputedStyle(element).backgroundColor);
    const solid = await background(page.locator(".site-hero").getByRole("link", { name: "Come aboard" }));
    expect(await background(diveButton(page))).not.toBe(solid);
    const started = await recordAnimations(page);
    await fillTanks(page);
    await expect(page.locator("[data-stage-control='dive']")).toHaveAttribute("data-ready", "");
    await expect.poll(() => background(diveButton(page))).toBe(solid);
    await expect.poll(() => started("[data-stage-control='dive'] button")).toContain("stage-dive-ready");
  });

  test("the bell sends sonar through the water, the creatures start, and the crew answers", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await open(page);
    const started = await recordAnimations(page);
    const toasts = await watchToasts(page);
    await page.getByRole("button", { name: STAGE_COPY.bell }).click();
    await expect(scene(page)).toHaveAttribute("data-ring", "a");
    await expect.poll(toasts.titles).toContain(`${SPEAKER[BELL_TOASTS[0]!.name]}: ${BELL_TOASTS[0]!.text}`);
    await expect(lastLog(page)).toContainText(LOG.bell.text);
    await expect.poll(() => started(".stage-ripple")).toContain("stage-ripple");
    await expect.poll(() => started(".stage-band-sunlit")).toContain("stage-startle-a");
    await page.getByRole("button", { name: STAGE_COPY.bell }).click();
    await expect(scene(page)).toHaveAttribute("data-ring", "b");
    await expect.poll(() => started(".stage-band-sunlit")).toContain("stage-startle-b");
  });

  test("under reduced motion the bell's creatures flicker instead of starting", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page);
    const started = await recordAnimations(page);
    await page.getByRole("button", { name: STAGE_COPY.bell }).click();
    await expect(scene(page)).toHaveAttribute("data-ring", "a");
    await expect.poll(() => started(".stage-band-sunlit .stage-react")).toContain("stage-startle-fade-a");
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
    const place = await page.evaluate(async () => {
      // WebKit scrolls to a newly focused element from a zero-delay timer, not during focus
      // (LocalFrameView::scheduleScrollToFocusedElement), and reading layout doesn't run it early. On a
      // busy runner this script can run before that timer and see where the element was before the
      // scroll. Measure after it: a zero-delay timer set now fires after the one focus set.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const focused = document.activeElement as HTMLElement;
      if (!focused.closest("[data-stage]")) return null;
      const labelledBy = focused.getAttribute("aria-labelledby");
      const name = focused.getAttribute("aria-label") ?? (labelledBy && document.getElementById(labelledBy)?.textContent) ?? focused.textContent;
      return { top: focused.getBoundingClientRect().top, glass: document.querySelector(".stage-window")!.getBoundingClientRect().bottom, name };
    });
    if (!place) break;
    expect(place.top, `${place.name} is below the porthole`).toBeGreaterThanOrEqual(place.glass - 1);
  }
  await context.close();
});

for (const mode of ["light", "dark"] as const) {
  test(`on a phone (${mode}), the crew's line sits between the porthole and the console, over nothing, at rest and after a dive`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, colorScheme: mode, baseURL: test.info().project.use.baseURL! });
    await context.addInitScript((m) => localStorage.setItem("ouro-site-theme", JSON.stringify({ preset: "pearl", mode: m })), mode);
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
    // The tap focuses the switch, and the page scrolls smoothly to show it below the glass. WebKit
    // judges a newly focused element against the page as it is mid-scroll: the lever, focused then,
    // looks in view and is left where that scroll carries it, under the glass. Focus it once the page
    // is still.
    await scrollAtRest(page);
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
  const toasts = await watchToasts(page, { selector: "[data-stage-control='bell'] button", kind: "below" });
  await bell.tap();
  await expect.poll(async () => (await toasts.titles()).length).toBeGreaterThan(0);
  // Judged only once the toast has settled: it slides in from below its place.
  await expect.poll(toasts.settled).toBeGreaterThan(5);
  expect(await toasts.overlapped(), await toasts.overlap()).toBe(false);
  await context.close();
});

// TEMPORARY (#667): what each part of the switch to still water costs a frame, each part alone, on a page that swims.
test("DIAG switch parts", async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    const frames: number[] = [];
    (window as unknown as { __frames: number[] }).__frames = frames;
    const count = () => {
      frames.push(performance.now());
      requestAnimationFrame(count);
    };
    requestAnimationFrame(count);
  });
  await open(page);
  await swimming(page);
  await page.waitForTimeout(1000);
  const lines: string[] = [];
  const step = async (name: string, action: string) => {
    const from = await page.evaluate((code) => {
      const at = (window as unknown as { __frames: number[] }).__frames.length;
      // eslint-disable-next-line no-new-func
      new Function(code)();
      return at;
    }, action);
    await page.waitForTimeout(900);
    const gaps = await page.evaluate((at) => {
      const all = (window as unknown as { __frames: number[] }).__frames;
      return all.slice(Math.max(1, at - 2)).map((time, index, list) => (index ? Math.round(time - list[index - 1]!) : 0)).slice(1);
    }, from);
    lines.push(`${name}: max ${Math.max(...gaps)} | ${gaps.slice(0, 8).join(" ")}`);
  };
  const press = (name: string) => `[...document.querySelectorAll('[role=radio]')].find(e => e.textContent.trim()==='${name}' || e.getAttribute('aria-label')==='${name}')?.click()`;
  const text = "const w = document.querySelector('.stage-crew-words'); w.lastChild.textContent = ' Slow screen, so the fish rest. Press Half to sail on! ' + (performance.now() % 7 > 3.5 ? 'a' : 'b')";
  const css = (rule: string) => `let s = document.getElementById('diag'); if (!s) { s = document.createElement('style'); s.id = 'diag'; document.head.append(s); } s.textContent = ${JSON.stringify(rule)}`;
  lines.push(
    await page.evaluate(() => {
      const out: string[] = [];
      for (let e: Element | null = document.querySelector(".stage-crew"); e; e = e.parentElement) {
        const c = getComputedStyle(e);
        out.push(`${e.tagName.toLowerCase()}.${[...e.classList].slice(0, 2).join(".")} ${c.display} ${c.contain} ${c.containerType} ${c.position} ${c.overflow} h${Math.round(e.getBoundingClientRect().height)}`);
      }
      return `chain: ${out.join(" < ")} | elements ${document.querySelectorAll("*").length} | composited? ${document.querySelectorAll(".stage *").length}`;
    }),
  );
  await step("idle", "");
  await step("text a", text);
  await step("text b", text);
  for (const [label, rule] of [
    ["crew contain layout paint", ".stage-crew { contain: layout paint; }"],
    ["crew contain strict 80px", ".stage-crew { contain: strict; height: 80px; }"],
    ["stage contain layout paint", ".stage { contain: layout paint; }"],
    ["stage contain strict", ".stage { contain: strict; height: 900px; }"],
    ["main siblings cv auto", "main > * > *:not(:has(.stage)), main > *:not(:has(.stage)) { content-visibility: auto; contain-intrinsic-size: auto 600px; }"],
    ["header hidden", "header, [role=banner] { display: none !important; }"],
    ["all filters off", "* { filter: none !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; mask: none !important; -webkit-mask: none !important; box-shadow: none !important; }"],
  ] as const) {
    await step(`${label} on`, css(rule));
    await step(`${label} text a`, text);
    await step(`${label} text b`, text);
    await step(`${label} press Stop`, press("Stop"));
    await step(`${label} press Half`, press("Half"));
    await step(`${label} off`, css(""));
  }
  await step("idle end", "");
  console.log(`SWITCHDIAG ${test.info().project.name}\n${lines.join("\n")}`);
});
