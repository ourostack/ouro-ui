import type { Page } from "@playwright/test";
import { expect, test } from "../ouro-fixtures";
import { openStory } from "../ouro/story";

// The MessageList paint frame probe: repository-only, run by message-list-paint-frames.yml by hand, never by CI's e2e
// shards (playwright.config.ts ignores probes/). It runs in the same Linux WebKit as the e2e shards' container, where the
// long frames in ourostack/ouro-ui#2735 were found: a desktop WebKit does its painting and compositing in software there,
// which a developer's own macOS WebKit does not. It measures how long each frame takes (the gap between one
// requestAnimationFrame callback and the next) while a continuous upward wheel keeps asking for older pages, on the
// OlderHistory and OlderHistoryDrawn stories, and compares four variants, none of which change the shipped source:
// - "shipped": the list as it ships.
// - "margin": the carry that holds the reader's place while the wheel turns, normally written as a `translate` on the
//   content element, redirected (by overriding CSSStyleDeclaration's `translate` setter and `removeProperty` for this
//   page only, before the story loads) to an equal `margin-block-start` instead.
// - "contain": `contain: layout paint` added, by a page style tag, to every message's own root.
// - "content-visibility": `content-visibility: auto` (with an estimated `contain-intrinsic-size`) added the same way.
// This is a measurement only: it reports frame counts per variant and takes no side on which, if any, is a fix.

type Variant = "shipped" | "margin" | "contain" | "content-visibility";
const VARIANTS: Variant[] = ["shipped", "margin", "contain", "content-visibility"];

const STORIES = [
  { story: "chat-messagelist--older-history", label: "Older history" },
  { story: "chat-messagelist--older-history-drawn", label: "Older history drawn" },
] as const;

/** Redirects the content element's `translate` writes to an equal `margin-block-start`, for this page only. */
async function installMarginCarry(page: Page): Promise<void> {
  const script: () => void = () => {
    const proto = CSSStyleDeclaration.prototype;
    const translateDescriptor = Object.getOwnPropertyDescriptor(proto, "translate")!;
    const nativeRemoveProperty = proto.removeProperty;
    Object.defineProperty(proto, "translate", {
      configurable: true,
      enumerable: Boolean(translateDescriptor.enumerable),
      get: translateDescriptor.get!,
      set(this: CSSStyleDeclaration, value: string) {
        // The shipped carry writes exactly `0 ${-carried}px`: the same number as a margin holds the reader's
        // place the same way, since removing that much margin above moves the content up by it, as the translate did.
        const written = /^0 (-?[\d.]+)px$/.exec(value);
        if (written) {
          this.marginBlockStart = `${written[1]}px`;
          nativeRemoveProperty.call(this, "translate");
        } else translateDescriptor.set!.call(this, value);
      },
    });
    proto.removeProperty = function (this: CSSStyleDeclaration, property: string) {
      if (property === "translate") return nativeRemoveProperty.call(this, "margin-block-start");
      return nativeRemoveProperty.call(this, property);
    };
  };
  await page.addInitScript(script);
}

async function applyVariant(page: Page, variant: Variant): Promise<void> {
  if (variant === "margin") await installMarginCarry(page);
}

/** Waits until the list stops scrolling: until its position has held for 30 frames in a row. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const el = document.querySelector<HTMLElement>("[data-ouro-message-list-scroller]")!;
        let last = el.scrollTop;
        let still = 0;
        const frame = () => {
          still = el.scrollTop === last ? still + 1 : 0;
          last = el.scrollTop;
          if (still >= 30) resolve();
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
  );
}

/**
 * Sends a continuous upward wheel (24 flicks, each decaying by 5% every 16 ms, as the reader's trackpad would), while a
 * `requestAnimationFrame` loop in the page logs the gap since the frame before: the frame's whole cost, paint and
 * compositing included, with no script of this probe's own running meanwhile.
 */
async function frameGaps(page: Page, story: string, variant: Variant): Promise<number[]> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await applyVariant(page, variant);
  await openStory(page, story);
  if (variant === "contain") {
    await page.addStyleTag({ content: '[data-ouro="message"] { contain: layout paint; }' });
  } else if (variant === "content-visibility") {
    // An estimate of a message's usual height, so collapsed messages do not shrink the scrollable range so far that
    // the story's own "near the top" loading check (and this probe's wheel) stop finding anything to scroll.
    await page.addStyleTag({ content: '[data-ouro="message"] { content-visibility: auto; contain-intrinsic-size: auto 96px; }' });
  }
  const scroller = page.locator("[data-ouro-message-list-scroller]");
  await expect.poll(() => scroller.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThanOrEqual(1);
  await page.evaluate(() => {
    const w = window as unknown as { __gaps: number[]; __stop: boolean };
    Object.assign(w, { __gaps: [], __stop: false });
    let last = performance.now();
    const tick = (now: number) => {
      if (w.__stop) return;
      w.__gaps.push(now - last);
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const box = (await scroller.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const sent: Promise<void>[] = [];
  for (let flick = 0; flick < 24; flick++) {
    for (let delta = -60; Math.abs(delta) >= 1; delta *= 0.95) {
      sent.push(page.mouse.wheel(0, Math.round(delta)));
      await new Promise((resolve) => setTimeout(resolve, 16)); // real clock: the wheel's own pace
    }
  }
  await Promise.all(sent);
  await settle(page);
  const gaps = await page.evaluate(() => {
    const w = window as unknown as { __gaps: number[]; __stop: boolean };
    w.__stop = true;
    return w.__gaps;
  });
  // The first logged gap is the time from registering the loop to its first frame, not a scrolled frame.
  return gaps.slice(1);
}

const atLeast = (gaps: number[], ms: number) => gaps.filter((gap) => gap >= ms).length;

for (const { story, label } of STORIES) {
  test(`${label}: reports frame gaps of 100 ms and 200 ms or more per variant while older posts land during a continuous upward wheel`, async ({ page, context }) => {
    test.setTimeout(10 * 60_000);
    const runs = Number(process.env["OURO_PROBE_RUNS"] ?? 3);
    const results: Record<Variant, { ge100: number[]; ge200: number[] }> = {
      shipped: { ge100: [], ge200: [] },
      margin: { ge100: [], ge200: [] },
      contain: { ge100: [], ge200: [] },
      "content-visibility": { ge100: [], ge200: [] },
    };
    for (const variant of VARIANTS) {
      for (let run = 0; run < runs; run++) {
        // A fresh page per run: the margin variant's override is page-global, and each story restarts its own loading state.
        const own = run === 0 && variant === "shipped" ? page : await context.newPage();
        const gaps = await frameGaps(own, story, variant);
        if (own !== page) await own.close();
        const ge100 = atLeast(gaps, 100);
        const ge200 = atLeast(gaps, 200);
        results[variant].ge100.push(ge100);
        results[variant].ge200.push(ge200);
        console.log(`MessageList paint frames: story=${JSON.stringify(label)} variant=${variant} run=${run} frames=${gaps.length} ge100ms=${ge100} ge200ms=${ge200}`);
      }
    }
    const summary = Object.fromEntries(VARIANTS.map((variant) => [variant, results[variant]]));
    console.log(`MessageList paint frames summary: story=${JSON.stringify(label)} ${JSON.stringify(summary)}`);
    for (const variant of VARIANTS) expect(results[variant].ge100.length, `${variant} measured no runs`).toBe(runs);
  });
}
