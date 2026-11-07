import { expect, test, type Locator, type Page } from "@playwright/test";

// A tap or text that lands before its control has hydrated is kept and answered once it has (src/early-input.ts,
// ourostack/ouro-ui#672). Each test holds back the script a control waits on, acts while it is held, then lets it go.

const PHONE = { width: 390, height: 844 };

/** Holds back requests matching `pattern` until the returned release is called; resolves once one has been asked for. */
async function hold(page: Page, pattern: RegExp | string): Promise<{ asked: Promise<void>; release: () => void }> {
  let release!: () => void;
  const gate = new Promise<void>((done) => (release = done));
  let asked!: () => void;
  const requested = new Promise<void>((done) => (asked = done));
  await page.route(pattern, async (route) => {
    asked();
    await gate;
    await route.continue();
  });
  return { asked: requested, release };
}

const ENTRY = /\/assets\/entry-[^/]*\.js$/;

/**
 * How long a kept tap or text may take to be answered once its control has hydrated, in ms. The page answers it a frame
 * or two later and the menu takes about 140 ms to open at a 4× slower CPU; this ceiling, for a shared CI runner, still
 * fails a tap left waiting on its part of the page's turn to hydrate (seconds).
 */
const ANSWERED = 1000;

/** Waits until React has hydrated `control`: it keeps its fiber on the node, under a key of its own. */
async function hydrated(control: Locator): Promise<void> {
  const node = await control.elementHandle();
  await node!.evaluate((element) => new Promise<void>((done) => {
    const look = () => (Object.keys(element).some((key) => key.startsWith("__reactFiber$")) ? done() : requestAnimationFrame(look));
    look();
  }));
}

/**
 * Records, from the page's first script, the frames and what the head script keeps, so a test that times out can say
 * where the time went (`timeline`).
 */
async function recordTimeline(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log: string[] = [];
    const frames: Array<[number, number]> = [];
    Object.assign(window, { __timeline: log, __frames: frames });
    const at = () => Math.round(performance.now());
    let last = 0;
    let kept = -1;
    const frame = () => {
      const now = at();
      const held = (window as unknown as { __ouroEarlyInput?: number }).__ouroEarlyInput ?? 0;
      if (last) frames.push([now, now - last]);
      if (now - last > 50 || held !== kept) log.push(`${now}: frame +${now - last}, kept ${held}`);
      [last, kept] = [now, held];
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    for (const type of ["pointerdown", "click"]) document.addEventListener(type, (event) => log.push(`${at()}: ${type} ${event.isTrusted ? "by the reader" : "replayed"}`), true);
    new MutationObserver(() => {
      if (document.documentElement.hasAttribute("data-site-ready") && !log.some((line) => line.endsWith("ready"))) log.push(`${at()}: ready`);
    }).observe(document.documentElement, { attributes: true });
  });
}

/** The most a slow runner may stretch ANSWERED to (`answerWithin`): past it, a kept tap counts as left waiting. */
const ANSWERED_AT_MOST = 5000;

/**
 * Lets the held script go, first noting the time, so `answerWithin` can tell the runner's own frames from the page's.
 */
async function releaseNoted(page: Page, release: () => void): Promise<void> {
  await page.evaluate(() => Object.assign(window, { __released: performance.now() }));
  release();
}

/**
 * How long a kept tap may take to be answered on this page: ANSWERED, or three of the slowest frame the page drew before
 * its script was let go, where that is slower, up to ANSWERED_AT_MOST. Only the runner sets those frames, with none of our
 * script running yet, so a slow hydration cannot widen its own limit. The page answers a frame after the control hydrates
 * and shows the answer on the next; CI's WebKit draws the home page's first seconds at 0.4 to 1.8 s a frame (#683, #676),
 * where no page answers within 1 s.
 */
async function answerWithin(page: Page): Promise<number> {
  const slowest = await page.evaluate(() => {
    const { __frames: frames, __released: released } = window as unknown as { __frames: Array<[number, number]>; __released: number };
    return Math.max(0, ...frames.filter(([at]) => at <= released).map(([, gap]) => gap));
  });
  const within = Math.min(ANSWERED_AT_MOST, Math.max(ANSWERED, 3 * slowest));
  await page.evaluate((line) => (window as unknown as { __timeline: string[] }).__timeline.push(line), `${Math.round(slowest)} ms: the slowest frame before the script was let go; answered within ${within} ms`);
  return within;
}

/** Runs `check`, and on a failure adds the page's timeline (`recordTimeline`) to its message. */
async function explained(page: Page, check: () => Promise<void>): Promise<void> {
  try {
    await check();
  } catch (error) {
    const timeline = await page.evaluate(() => (window as unknown as { __timeline?: string[] }).__timeline ?? []).catch(() => []);
    (error as Error).message += `\n\nThe page's timeline, in ms since it began:\n${timeline.slice(-60).join("\n")}`;
    throw error;
  }
}

for (const path of ["./", "docs/tooltip/", "ax/"]) {
  test(`a tap on the menu button before the page's script has run opens the menu, on ${path}`, async ({ page }) => {
    await page.setViewportSize(PHONE);
    await recordTimeline(page);
    const { release } = await hold(page, ENTRY);
    await page.goto(path, { waitUntil: "commit" });
    const button = page.getByRole("banner").getByRole("button", { name: "Menu", exact: true });
    await button.click();
    await releaseNoted(page, release);
    await hydrated(button);
    await page.evaluate(() => (window as unknown as { __timeline: string[] }).__timeline.push(`${Math.round(performance.now())}: the button has hydrated`));
    const within = await answerWithin(page);
    // real clock: the menu stays open until it is closed; no timer ends it.
    await explained(page, () => expect(page.getByRole("dialog", { name: "Menu" })).toBeVisible({ timeout: within }));
    // real clock: the menu stays open until it is closed; no timer ends it.
    await expect(page.getByRole("dialog", { name: "Menu" }).getByRole("navigation", { name: "Site" })).toBeVisible();
  });
}

test("a tap on the theme picker or Search before the page's script has run is answered", async ({ page }) => {
  for (const name of [/^Theme: /, /^Search/]) {
    const { release } = await hold(page, ENTRY);
    await page.goto("docs/tooltip/", { waitUntil: "commit" });
    const button = page.getByRole("banner").getByRole("button", { name });
    await button.click();
    release();
    await hydrated(button);
    // Each opens a dialog: the theme picker's popover, and Search's command palette.
    // real clock: each stays open until it is closed; no timer ends it.
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: ANSWERED });
    await page.unroute(ENTRY);
  }
});

test("text typed into the docs filter before the page's script has run stays, and filters", async ({ page }) => {
  const { release } = await hold(page, ENTRY);
  await page.goto("docs/toggle/", { waitUntil: "commit" });
  const filter = page.getByPlaceholder("Filter components");
  await filter.fill("tabs");
  release();
  await hydrated(filter);
  await expect(page.getByRole("link", { name: "Toggle", exact: true })).toBeHidden({ timeout: ANSWERED });
  await expect(page.getByRole("link", { name: "Tabs", exact: true })).toBeVisible();
  await expect(filter).toHaveValue("tabs");
});

test("a live example answers a tap and keeps text from before its own script arrived, and is never shown disabled", async ({ page }) => {
  const { asked, release } = await hold(page, "**/assets/form.demo-*.js");
  await page.goto("docs/form/", { waitUntil: "domcontentloaded" });
  await asked;
  const name = page.getByRole("textbox", { name: "Recipe name", exact: true });
  const course = page.getByRole("combobox", { name: "Course", exact: true });
  await expect(page.locator("[data-site-demo-ready]")).toHaveCount(0);
  await expect(name).toBeEnabled();
  await name.fill("Soup");
  await course.click();
  release();
  await hydrated(course);
  await expect(page.locator('[data-ouro="select-popup"]')).toHaveAttribute("data-open", "", { timeout: ANSWERED });
  await expect(page.getByRole("option", { name: "Main", exact: true })).toBeVisible();
  await expect(name).toHaveValue("Soup");
});

test("a tap on the stage before the page's script has run is answered once the page hydrates, not when the stage's turn comes", async ({ page }) => {
  // The stage hydrates in its turn, when the browser is next idle (src/hydrate.tsx); here that is 4 s away, so only the
  // kept tap hurrying it along answers the press in time.
  await page.addInitScript(() => {
    window.requestIdleCallback = (callback: IdleRequestCallback) => window.setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 10 }), 4000);
  });
  await recordTimeline(page);
  const { release } = await hold(page, ENTRY);
  await page.goto("./", { waitUntil: "commit" });
  const speed = page.locator(".site-hero-stage").getByRole("radio").first();
  await expect(speed).toHaveAttribute("aria-checked", "false");
  await speed.click();
  await releaseNoted(page, release);
  await page.waitForFunction(() => Object.keys(document.getElementById("root")!).some((key) => key.startsWith("__reactContainer$")));
  const within = await answerWithin(page);
  await explained(page, () => expect(speed).toHaveAttribute("aria-checked", "true", { timeout: within }));
});

test("a tap on a live slider before its own script arrived moves it there once it does", async ({ page }) => {
  await page.setViewportSize(PHONE);
  const { asked, release } = await hold(page, "**/assets/slider.demo-*.js");
  await page.goto("docs/slider/", { waitUntil: "domcontentloaded" });
  await asked;
  const spice = page.getByRole("slider", { name: "Spice level" });
  await expect(spice).toHaveAttribute("aria-valuenow", "2");
  const track = page.locator('[data-ouro="slider"]').filter({ has: spice }).locator("[data-ouro-slider-control]");
  const box = (await track.boundingBox())!;
  // Near the end of the track: 4 of 0 to 5, past the thumb at 2.
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height / 2);
  release();
  await expect(page.locator('[data-site-demo="slider"][data-site-demo-ready]')).toBeAttached();
  await hydrated(track);
  await expect(spice).toHaveAttribute("aria-valuenow", "4", { timeout: ANSWERED });
});

test("a drag of a live slider's thumb before its own script arrived moves it to where the drag ended once it does", async ({ page }) => {
  await page.setViewportSize(PHONE);
  const { asked, release } = await hold(page, "**/assets/slider.demo-*.js");
  await page.goto("docs/slider/", { waitUntil: "domcontentloaded" });
  await asked;
  const spice = page.getByRole("slider", { name: "Spice level" });
  const track = page.locator('[data-ouro="slider"]').filter({ has: spice }).locator("[data-ouro-slider-control]");
  const thumb = track.locator("[data-ouro-slider-thumb]");
  const [from, box] = [(await thumb.boundingBox())!, (await track.boundingBox())!];
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.95, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  release();
  await hydrated(track);
  await expect(spice).toHaveAttribute("aria-valuenow", "5", { timeout: ANSWERED });
});

test("a swipe on a live example's row before its own script arrived opens the row's actions once it does, never past where the finger left it", async ({ page }) => {
  await page.setViewportSize(PHONE);
  const { asked, release } = await hold(page, "**/assets/swipe-actions.demo-*.js");
  await page.goto("docs/swipe-actions/", { waitUntil: "domcontentloaded" });
  await asked;
  const row = page.locator('[data-site-demo="swipe-actions"] [data-ouro="swipe-actions"]').first();
  const box = (await row.boundingBox())!;
  // A finger, leftward from the row's right side a third of the way across: its trailing action. A mouse never swipes a row
  // (its way to the actions is the actions button), and WebKit has no touch input to drive, so the finger is pointer events.
  await row.evaluate(async (element, box) => {
    const y = box.y + box.height / 2;
    const at = (x: number, buttons: number): PointerEventInit =>
      ({ bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0, buttons, pointerId: 2, isPrimary: true, pointerType: "touch" });
    element.dispatchEvent(new PointerEvent("pointerdown", at(box.x + box.width * 0.9, 1)));
    for (let step = 1; step <= 8; step++) {
      await new Promise((frame) => setTimeout(frame, 16));
      element.dispatchEvent(new PointerEvent("pointermove", at(box.x + box.width * (0.9 - 0.04 * step), 1)));
    }
    element.dispatchEvent(new PointerEvent("pointerup", at(box.x + box.width * 0.58, 0)));
    // The row's offset on every frame from here on.
    const offsets: number[] = [];
    (window as unknown as { offsets: number[] }).offsets = offsets;
    const look = () => {
      offsets.push(new DOMMatrix(getComputedStyle(element.firstElementChild!).transform).m41);
      requestAnimationFrame(look);
    };
    look();
  }, box);
  release();
  await hydrated(row);
  await expect(row).toHaveAttribute("data-open", "trailing", { timeout: ANSWERED });
  // The replay is the swipe as the finger made it, in its time: the row goes about as far as the finger took it (a third
  // of its width; on a ready page the same swipe carries it a tenth farther), where a swipe replayed in an instant flung
  // it off the screen and back.
  const farthest = Math.min(...(await page.evaluate(() => (window as unknown as { offsets: number[] }).offsets)));
  expect(farthest).toBeGreaterThanOrEqual(-box.width * 0.32 * 1.2);
});
