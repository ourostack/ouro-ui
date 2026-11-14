import { expect, test, type Page } from "@playwright/test";
import { LOG } from "../src/voyage/stage/copy";
import { open, scene, bringUp, swimming, slowFrames, openSlow, ambient, lastLog, FORE, tank } from "./stage-helpers";

// The stage judging the screen: a slow one gets still water, and the site menu or a choice made first holds the verdict.
test("a screen too slow to swim the fish gets still water, its speed at Stop, and Half sets them swimming", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await slowFrames(page, 150);
  await openSlow(page);
  await bringUp(page);
  // real clock: the stage judges the screen on its real frames, a beat and then a second of them; on a loaded WebKit these
  // slow frames can miss the first two seconds' three gaps, and the stage reads two seconds more, as on a starved screen
  // (ourostack/ouro-ui#1255).
  await expect(page.locator("[data-stage]")).toHaveAttribute("data-paced", "", { timeout: 10_000 });
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
 * hides the page and shows it again that long after the first beat. With `hold`, the first beat waits until the page's
 * `__releaseBeat()` is called, and the stage clearing it (as it does once a press has judged the screen) cancels it.
 */
const onTheBeat = (
  page: Page,
  {
    stall = 0,
    delay = 0,
    starve = false,
    lift = [],
    hideAt = 0,
    hold = false,
  }: { stall?: number; delay?: number; starve?: boolean; lift?: (number | undefined)[]; hideAt?: number; hold?: boolean },
) =>
  page.addInitScript(
    ({ stall, delay, starve, lift, hideAt, hold }) => {
      const original = window.setTimeout;
      const clear = window.clearTimeout;
      // A held beat has an id of its own (negative, apart from the browser's), so clearing it still cancels it.
      const heldBeats = new Map<number, () => void>();
      let releaseId = 0;
      let released = !hold;
      (window as unknown as { __releaseBeat: () => void }).__releaseBeat = () => {
        released = true;
        for (const start of heldBeats.values()) start();
        heldBeats.clear();
      };
      window.clearTimeout = ((id?: number) => {
        if (typeof id === "number" && heldBeats.delete(id)) return;
        clear(id);
      }) as typeof clearTimeout;
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
        const first = scheduled++ === 0;
        const later = first ? delay : 0;
        if (first && !released) {
          const id = --releaseId;
          heldBeats.set(id, () => window.setTimeout(callback, 500, ...rest));
          return id;
        }
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
    { stall, delay, starve, lift, hideAt, hold },
  );

test("one long task is not a slow screen: the fish keep swimming", async ({ page, browserName }) => {
  test.skip(browserName === "webkit", "CI's WebKit is a slow screen with no stall: it draws without the GPU");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // One stall of nearly a second inside the second the stage reads, which a count of that second's frames calls slow.
  await onTheBeat(page, { stall: 900 });
  await open(page);
  await bringUp(page);
  // real clock: the stage judges the screen on its real frames, a beat and then a second of them.
  await expect(page.locator("[data-stage]")).toHaveAttribute("data-paced", "");
  await expect(scene(page)).toHaveAttribute("data-speed", "half");
});

test("a screen that draws no frame for two seconds, twice running, gets still water", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // No frame for 4.5 s from the beat, past both of the stage's two-second waits; then frames, which draw its Stop.
  await onTheBeat(page, { starve: true, lift: [4500] });
  await open(page);
  await bringUp(page);
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
  await bringUp(page);
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
  await bringUp(page);
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
    // The stage's first beat held until after the visitor's press, so the press comes first however slow the runner: a
    // beat put off by a fixed four seconds came first on a loaded WebKit, and the stage judged the screen before the press (ourostack/ouro-ui#1267).
    await onTheBeat(page, { hold: true });
    await slowFrames(page, 150);
    await openSlow(page);
    await bringUp(page);
    await expect(page.locator("[data-stage]")).not.toHaveAttribute("data-paced", "");
    await press(page);
    // real clock: the press itself marks the stage as judged; no timer is involved.
    await expect(page.locator("[data-stage]")).toHaveAttribute("data-paced", "");
    await page.evaluate(() => (window as unknown as { __releaseBeat: () => void }).__releaseBeat());
    // real clock: past the released beat and the stage's judging of the frames, to show it no longer judges.
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
