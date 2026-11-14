import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

const distanceFromBottom = (scroller: Locator) => scroller.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);
const scrollTop = (scroller: Locator) => scroller.evaluate((el) => el.scrollTop);

/**
 * Waits until the list stops scrolling (wheel scrolling is smooth): until its position has held
 * for 30 frames in a row. Counting the page's own frames, rather than reading from here at
 * intervals, waits out a busy page that pauses a smooth scroll midway (a cold Storybook does),
 * since a paused page draws no frames.
 */
async function settle(scroller: Locator) {
  await scroller.evaluate(
    (el) =>
      new Promise<void>((resolve) => {
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

async function wheelOver(page: Page, scroller: Locator, deltaY: number) {
  const box = (await scroller.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, deltaY);
  await settle(scroller);
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  test(`at ${viewport.width}px, a reader who scrolls up keeps their place while a reply streams, and jumps back`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openStory(page, "chat-messagelist--live");
    const scroller = page.getByRole("region", { name: "Conversation with Ouro" });
    await expect.poll(() => distanceFromBottom(scroller)).toBeLessThanOrEqual(1);

    // At the bottom, a new question and its streamed reply stay in view.
    await page.getByRole("button", { name: "Send next question" }).click();
    await expect(page.getByRole("article").last()).not.toHaveAttribute("aria-busy");
    await expect.poll(() => distanceFromBottom(scroller)).toBeLessThanOrEqual(1);

    await wheelOver(page, scroller, -300);
    await expect(page.getByRole("button", { name: "Jump to latest" })).toBeVisible();
    const top = await scrollTop(scroller);
    await page.getByRole("button", { name: "Send next question" }).click();
    await expect(page.getByRole("article").last()).not.toHaveAttribute("aria-busy");
    expect(await scrollTop(scroller)).toBe(top);

    await page.getByRole("button", { name: "Jump to latest" }).click();
    await expect.poll(() => distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
    await expect(page.getByRole("button", { name: "Jump to latest" })).toHaveCount(0);
    await expect(page.getByRole("article").last()).toBeFocused();
  });
}

test("each finished reply is announced once, politely", async ({ page }) => {
  await openStory(page, "chat-messagelist--live");
  const live = page.locator("[data-ouro-message-list-live]");
  await expect(live).toHaveAttribute("aria-live", "polite");
  await page.getByRole("button", { name: "Send next question" }).click();
  await expect(page.getByRole("article").last()).not.toHaveAttribute("aria-busy");
  await expect(live.locator("p")).toHaveCount(1);
  await expect(live.locator("p")).toHaveText(/^Ouro: /);
});

test("the posts are one Tab stop: the arrow keys move between them, and a key of the app's reacts to the focused one", async ({ page }) => {
  await openStory(page, "chat-messagelist--keyboard");
  const posts = page.getByRole("article");
  await expect(posts).toHaveCount(6);
  await posts.last().focus();
  await page.keyboard.press("ArrowUp");
  await expect(posts.nth(4)).toBeFocused();
  await page.keyboard.press("Home");
  await expect(posts.first()).toBeFocused();
  await page.keyboard.press("2");
  await expect(posts.first()).toContainText("🎉");
  await page.keyboard.press("End");
  await expect(posts.last()).toBeFocused();
  await expect(posts.last()).toHaveAttribute("aria-posinset", "6");
});

test("the messages spring as the wheel scrolls them, and settle back with no transform, the scroll position where the wheel left it", async ({ page }) => {
  await openStory(page, "chat-messagelist--springs");
  const scroller = page.getByRole("region", { name: "Conversation with Ouro" });
  await expect.poll(() => distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
  // Records whether any message was drawn moved, from inside the page, so no frame is missed.
  await scroller.evaluate((el) => {
    const record = el as HTMLElement & { sprang?: boolean };
    new MutationObserver(() => {
      record.sprang ||= el.querySelector("[data-ouro-settling]") !== null;
    }).observe(el, { attributes: true, subtree: true, attributeFilter: ["data-ouro-settling"] });
  });
  await wheelOver(page, scroller, -400);
  await expect.poll(() => scroller.evaluate((el) => (el as HTMLElement & { sprang?: boolean }).sprang === true)).toBe(true);
  await expect(page.locator("[data-ouro-settling]")).toHaveCount(0);
  const top = await scrollTop(scroller);
  await settle(scroller);
  expect(await scrollTop(scroller)).toBe(top);
  expect(await page.locator('[data-ouro="message"][style]').count()).toBe(0);
});

test("with reduced motion, the wheel scrolls the messages and moves none of them", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openStory(page, "chat-messagelist--springs");
  const scroller = page.getByRole("region", { name: "Conversation with Ouro" });
  await expect.poll(() => distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
  await scroller.evaluate((el) => {
    const record = el as HTMLElement & { sprang?: boolean };
    new MutationObserver(() => {
      record.sprang = true;
    }).observe(el, { attributes: true, subtree: true, attributeFilter: ["style", "data-ouro-settling"] });
  });
  await wheelOver(page, scroller, -400);
  expect(await scroller.evaluate((el) => (el as HTMLElement & { sprang?: boolean }).sprang === true)).toBe(false);
  expect(await distanceFromBottom(scroller)).toBeGreaterThan(100);
});

const posted = (page: Page, index: number) => page.locator(`#post-${index} [data-ouro-message-content]`);

test("the list draws one bar, on the post the pointer is over, and one menu, from a right-click or the bar's button", async ({ page }) => {
  await openStory(page, "chat-messagelist--actions");
  const bars = page.locator('[role="toolbar"][data-ouro-message-actions]');
  for (const index of [39, 38, 36]) {
    await posted(page, index).hover();
    await expect(bars).toHaveCount(1);
    await expect(page.locator(`#post-${index} [role="toolbar"]`)).toHaveCount(1);
  }
  // Off the list, none stays behind.
  await page.mouse.move(1, 1);
  await expect(bars).toHaveCount(0);

  await posted(page, 38).click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Message actions for Grace Hopper" });
  await expect(menu).toBeVisible();
  await expect(bars).toHaveCount(0);
  await expect(menu.getByRole("group", { name: "Reactions" }).getByRole("menuitem")).toHaveCount(5);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(page.locator("#post-38")).toBeFocused();

  await posted(page, 39).hover();
  await page.getByRole("button", { name: "More actions" }).click();
  await expect(page.getByRole("menu", { name: "Message actions for Ouro" })).toBeVisible();
  await expect(page.locator('[data-ouro="menu"]')).toHaveCount(1);
  await page.getByRole("menuitem", { name: "Heart" }).click();
  await expect(page.getByLabel("You reacted ❤️")).toBeVisible();
});

test("from the keyboard, focus on a post shows its bar, and Shift+F10 opens its menu; Escape puts focus back on the post", async ({ page }) => {
  await openStory(page, "chat-messagelist--actions");
  await page.mouse.move(1, 1);
  await page.locator("#post-39").focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.locator("#post-38")).toBeFocused();
  await expect(page.locator('#post-38 [role="toolbar"]')).toHaveCount(1);
  await page.keyboard.press("Shift+F10");
  const menu = page.getByRole("menu", { name: "Message actions for Grace Hopper" });
  await expect(menu).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(page.locator("#post-38")).toBeFocused();
});

test("on a CPU slowed 4 times, the bar is on the post the pointer moved to by the next frame, and so is the menu after a right-click", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "CPU throttling is a Chromium DevTools feature");
  await openStory(page, "chat-messagelist--actions");
  // Each pointerover onto a post: the work done in the event, and whether the bar was in that post at the next frame.
  await page.evaluate(() => {
    const samples: { id: string; work: number; shown: boolean }[] = [];
    const menus: { work: number; shown: boolean }[] = [];
    let start = 0;
    let started = 0;
    Object.assign(window, { hoverSamples: samples, menuSamples: menus });
    document.addEventListener("pointerover", () => (start = performance.now()), true);
    window.addEventListener("pointerover", (event) => {
      const row = (event.target as Element).closest<HTMLElement>('[data-ouro="message"]');
      if (row === null || samples.at(-1)?.id === row.id) return;
      const work = performance.now() - start;
      requestAnimationFrame(() => samples.push({ id: row.id, work, shown: row.querySelector('[role="toolbar"]') !== null }));
    });
    document.addEventListener("contextmenu", () => (started = performance.now()), true);
    window.addEventListener("contextmenu", () => {
      const work = performance.now() - started;
      requestAnimationFrame(() => menus.push({ work, shown: document.querySelector('[data-ouro="menu"]') !== null }));
    });
  });
  // Warm: the bar's and the menu's code load the first time each shows.
  await posted(page, 39).hover();
  await posted(page, 39).click({ button: "right" });
  // The menu's code comes with its first opening: Escape once it is open, or the menu opens after it and stays.
  await expect(page.locator('[data-ouro="menu"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-ouro="menu"]')).toHaveCount(0);
  await page.evaluate(() => {
    const w = window as unknown as { hoverSamples: unknown[]; menuSamples: unknown[] };
    w.hoverSamples.length = 0;
    w.menuSamples.length = 0;
  });
  // The posts wholly in view, newest first: the pointer moves between them without the list scrolling, as a scroll under
  // the pointer puts the bar away until the pointer moves again.
  const inView = await page.evaluate(() => {
    const list = document.querySelector("[data-ouro-message-list-scroller]")!.getBoundingClientRect();
    return [...document.querySelectorAll('[data-ouro="message"] [data-ouro-message-content]')]
      .map((content) => content.getBoundingClientRect())
      .filter((box) => box.top >= list.top && box.bottom <= list.bottom)
      .reverse()
      .slice(0, 4)
      .map((box) => ({ x: box.left + Math.min(box.width / 2, 40), y: box.top + box.height / 2 }));
  });
  expect(inView.length).toBeGreaterThanOrEqual(3);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  let hovers: { id: string; work: number; shown: boolean }[];
  try {
    for (let step = 1; step <= 10; step++) {
      await page.mouse.move(inView[step % inView.length]!.x, inView[step % inView.length]!.y);
      // Its sample is taken at the next frame: the pointer moves on once it is.
      await page.waitForFunction((count) => (window as unknown as { hoverSamples: unknown[] }).hoverSamples.length >= count, step);
    }
    // The hovers so far: a right-click opens the menu, and the bar goes as it opens, before the next frame.
    hovers = await page.evaluate(() => [...(window as unknown as { hoverSamples: { id: string; work: number; shown: boolean }[] }).hoverSamples]);
    for (const [index, at] of [inView[1]!, inView[0]!, inView[2]!].entries()) {
      await page.mouse.click(at.x, at.y, { button: "right" });
      // Its sample is taken at the next frame: Escape once it is, and the next right-click once the menu has gone.
      await page.waitForFunction((count) => (window as unknown as { menuSamples: unknown[] }).menuSamples.length >= count, index + 1);
      await page.keyboard.press("Escape");
      await expect(page.locator('[data-ouro="menu"]')).toHaveCount(0);
    }
  } finally {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  }
  const menus = await page.evaluate(() => (window as unknown as { menuSamples: { work: number; shown: boolean }[] }).menuSamples);
  const median = (values: number[]) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)]!;
  const report = `hover: median ${median(hovers.map((sample) => sample.work)).toFixed(1)} ms, max ${Math.max(...hovers.map((sample) => sample.work)).toFixed(1)} ms over ${hovers.length}; menu: median ${median(menus.map((sample) => sample.work)).toFixed(1)} ms over ${menus.length}`;
  test.info().annotations.push({ type: "latency at 4x CPU", description: report });
  console.log(`[latency at 4x CPU] ${report}`);
  expect(hovers.length).toBeGreaterThanOrEqual(8);
  expect(hovers.filter((sample) => !sample.shown)).toEqual([]);
  expect(menus.map((sample) => sample.shown)).toEqual([true, true, true]);
  // The frame is what is held, not milliseconds: these stories run on the development build, several times slower than
  // a production one, and the work each event does is reported above.
});

test("a long conversation draws only what is near the view, and a quote or a search reaches a message far up", async ({ page }) => {
  await openStory(page, "chat-messagelist--long-conversation");
  const scroller = page.getByRole("region", { name: "Conversation with Ouro" });
  await expect.poll(() => distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
  expect(await page.getByRole("article").count()).toBeLessThan(60);

  // The quote on the newest message goes to the first question, drawing it first.
  await page.getByRole("button", { name: /Quoting Ana Lind/ }).click();
  await expect(page.locator("#long-0")).toBeFocused();
  await expect(page.locator("#long-0")).toBeInViewport();
  await expect(page.getByRole("button", { name: "Jump to latest" })).toBeVisible();

  // Find in chat searches the messages, not the page, and reveals the match.
  await page.getByRole("textbox", { name: "Find in chat" }).fill("(1200)");
  await page.getByRole("button", { name: "Find" }).click();
  await expect(page.locator("#long-1199")).toBeFocused();
  await expect(page.locator("#long-1199")).toBeInViewport();

  // Jump to latest draws the end again, and goes there.
  await page.getByRole("button", { name: "Jump to latest" }).click();
  await expect.poll(() => distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
  await expect(page.locator("#long-1999")).toBeFocused();
});

// Frames where the wheel came, the list was not at an end, and the message at the centre of the view moved neither in that
// frame nor in the next, while older posts load above (ourostack/ouro-ui#925): dead frames. The centre message is what is read,
// not scrollTop: the list corrects its own scrollTop to hold the reader's place as a page goes in, which moves nothing on screen.
// And frames where the wheel pushed up at scrollTop 0 while messages already drawn sat above the view, out of reach: wall frames,
// which a list that holds older posts above the scroll's start until the wheel rests would make, and the dead count cannot see.
for (const { story, label, least } of [
  { story: "chat-messagelist--older-history", label: "Older history", least: 500 },
  { story: "chat-messagelist--older-history-drawn", label: "Older history drawn", least: 174 },
]) {
  test(`${label}: a reader who flicks the wheel upward while older posts load never has the wheel go dead, or stop at a wall, for more than three frames`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await openStory(page, story);
    const scroller = page.getByRole("region", { name: label });
    await expect.poll(() => distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
    await page.evaluate(() => {
      const s = document.querySelector<HTMLElement>("[data-ouro-message-list-scroller]")!;
      const w = window as unknown as { __frames: { dt: number; wheel: number; scrollTop: number; maxTop: number; moved: number | null; above: boolean; carried: string }[]; __wheel: number; __stop: boolean };
      Object.assign(w, { __frames: [], __wheel: 0, __stop: false });
      addEventListener("wheel", (e) => (w.__wheel += e.deltaY), { capture: true, passive: true });
      const top = (el: Element) => {
        const m = /translateY\((-?[\d.]+)px\)/.exec((el as HTMLElement).style.transform);
        return el.getBoundingClientRect().top - (m ? Number(m[1]) : 0);
      };
      const pick = () => {
        const v = s.getBoundingClientRect();
        return document.elementFromPoint(v.left + v.width / 2, v.top + v.height / 2)?.closest('[data-ouro="message"]') ?? null;
      };
      let anchor = pick();
      let anchorTop = anchor ? top(anchor) : 0;
      let last = performance.now();
      const content = s.querySelector<HTMLElement>("[data-ouro-message-list-content]")!;
      const tick = (now: number) => {
        if (w.__stop) return;
        const moved = anchor?.isConnected ? anchorTop - top(anchor) : null;
        const first = s.querySelector('[data-ouro="message"]');
        const above = first !== null && first.getBoundingClientRect().bottom < s.getBoundingClientRect().top;
        w.__frames.push({ dt: now - last, wheel: w.__wheel, scrollTop: s.scrollTop, maxTop: s.scrollHeight - s.clientHeight, moved, above, carried: content.style.translate });
        last = now;
        w.__wheel = 0;
        anchor = pick();
        anchorTop = anchor ? top(anchor) : 0;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const box = (await scroller.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    // Flicks sent without waiting for the page, as the OS sends them.
    const sent: Promise<void>[] = [];
    for (let flick = 0; flick < 24; flick++) {
      for (let delta = -60; Math.abs(delta) >= 1; delta *= 0.95) {
        sent.push(page.mouse.wheel(0, Math.round(delta)));
        await new Promise((resolve) => setTimeout(resolve, 16)); // real clock: the wheel's own pace
      }
    }
    await Promise.all(sent);
    await settle(scroller);
    const frames = await page.evaluate(() => {
      const w = window as unknown as { __frames: { dt: number; wheel: number; scrollTop: number; maxTop: number; moved: number | null; above: boolean; carried: string }[]; __stop: boolean };
      w.__stop = true;
      return w.__frames;
    });
    const atEnd = (f: (typeof frames)[number]) => (f.wheel < 0 ? f.scrollTop <= 1 : f.scrollTop >= f.maxTop - 1);
    const still = (f: (typeof frames)[number] | undefined) => f !== undefined && f.moved !== null && Math.abs(f.moved) < 0.5;
    const dead = frames.filter((f, i) => f.wheel !== 0 && !atEnd(f) && still(f) && still(frames[i + 1]));
    const wall = frames.filter((f) => f.wheel < 0 && f.scrollTop <= 1 && still(f) && f.above);
    // Pages went in above while the reader scrolled, and the scroll was neither stalled nor stopped short on the way.
    const count = Number(await page.locator("[data-count]").getAttribute("data-count"));
    // The frames around the first dead ones, each [ms, wheel, scrollTop, centre moved, content's translate], to read a failure by.
    const around = dead.slice(0, 3).map((f) => {
      const at = frames.indexOf(f);
      return frames.slice(Math.max(0, at - 3), at + 3).map((g) => [Math.round(g.dt), Math.round(g.wheel), Math.round(g.scrollTop), g.moved === null ? null : Math.round(g.moved * 10) / 10, g.carried]);
    });
    const longest = Math.round(Math.max(0, ...frames.slice(1).map((f) => f.dt)));
    const counts = `${dead.length} dead frames, ${wall.length} wall frames, longest frame ${longest} ms, ${count} messages, ${frames.length} frames; around the first dead: ${JSON.stringify(around)}`;
    await testInfo.attach("frames.json", { body: JSON.stringify(frames.map((f) => [Math.round(f.dt * 10) / 10, Math.round(f.wheel), Math.round(f.scrollTop), f.moved === null ? null : Math.round(f.moved * 10) / 10])), contentType: "application/json" });
    expect(count, counts).toBeGreaterThanOrEqual(least);
    expect(dead.length, counts).toBeLessThanOrEqual(3);
    expect(wall.length, counts).toBeLessThanOrEqual(3);
    expect(longest, counts).toBeLessThan(250);
  });
}

// Plain scroll, with pictures loading as the reader goes: the same dead frame count, and no frame a reader would feel as a stall.
test("Pictures loading: a reader who flicks the wheel up and down the channel has no dead frame and no frame over 250 ms", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await openStory(page, "chat-messagelist--pictures-loading");
  const scroller = page.getByRole("region", { name: "Pictures loading" });
  await expect.poll(() => distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
  await page.evaluate(() => {
    const s = document.querySelector<HTMLElement>("[data-ouro-message-list-scroller]")!;
    const w = window as unknown as { __frames: { dt: number; wheel: number; scrollTop: number; maxTop: number; moved: number | null }[]; __wheel: number; __stop: boolean };
    Object.assign(w, { __frames: [], __wheel: 0, __stop: false });
    addEventListener("wheel", (e) => (w.__wheel += e.deltaY), { capture: true, passive: true });
    const top = (el: Element) => {
      const m = /translateY\((-?[\d.]+)px\)/.exec((el as HTMLElement).style.transform);
      return el.getBoundingClientRect().top - (m ? Number(m[1]) : 0);
    };
    const pick = () => {
      const v = s.getBoundingClientRect();
      return document.elementFromPoint(v.left + v.width / 2, v.top + v.height / 2)?.closest('[data-ouro="message"]') ?? null;
    };
    let anchor = pick();
    let anchorTop = anchor ? top(anchor) : 0;
    let last = performance.now();
    const tick = (now: number) => {
      if (w.__stop) return;
      const moved = anchor?.isConnected ? anchorTop - top(anchor) : null;
      w.__frames.push({ dt: now - last, wheel: w.__wheel, scrollTop: s.scrollTop, maxTop: s.scrollHeight - s.clientHeight, moved });
      last = now;
      w.__wheel = 0;
      anchor = pick();
      anchorTop = anchor ? top(anchor) : 0;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const box = (await scroller.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const sent: Promise<void>[] = [];
  for (const direction of [-1, 1]) {
    for (let flick = 0; flick < 8; flick++) {
      for (let delta = 60; Math.abs(delta) >= 1; delta *= 0.95) {
        sent.push(page.mouse.wheel(0, Math.round(direction * delta)));
        await new Promise((resolve) => setTimeout(resolve, 16)); // real clock: the wheel's own pace
      }
    }
  }
  await Promise.all(sent);
  await settle(scroller);
  const frames = await page.evaluate(() => {
    const w = window as unknown as { __frames: { dt: number; wheel: number; scrollTop: number; maxTop: number; moved: number | null }[]; __stop: boolean };
    w.__stop = true;
    return w.__frames;
  });
  type Frame = (typeof frames)[number];
  const atEnd = (f: Frame) => (f.wheel < 0 ? f.scrollTop <= 1 : f.scrollTop >= f.maxTop - 1);
  const still = (f: Frame | undefined) => f !== undefined && f.moved !== null && Math.abs(f.moved) < 0.5;
  const dead = frames.filter((f, i) => f.wheel !== 0 && !atEnd(f) && still(f) && still(frames[i + 1]));
  const longest = Math.round(Math.max(0, ...frames.slice(1).map((f) => f.dt)));
  const counts = `${dead.length} dead frames, longest frame ${longest} ms, ${frames.length} frames; dead at ${JSON.stringify(dead.slice(0, 5).map((f) => [Math.round(f.dt), Math.round(f.wheel), Math.round(f.scrollTop), Math.round(f.maxTop), f.moved === null ? null : Math.round(f.moved * 10) / 10]))}`;
  await testInfo.attach("frames.json", { body: JSON.stringify(frames.map((f) => [Math.round(f.dt * 10) / 10, Math.round(f.wheel), Math.round(f.scrollTop), f.moved === null ? null : Math.round(f.moved * 10) / 10])), contentType: "application/json" });
  expect(dead.length, counts).toBe(0);
  expect(longest, counts).toBeLessThan(250);
});
