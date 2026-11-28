import { expect, test, type Locator, type Page } from "@playwright/test";
import { BATTLE, CHAPTER_THREE, CHAPTER_THREE_CONTROLS, CODE_SHEETS_THREE, ENCOUNTER, FIGHT, ORDERS, SALOON } from "../src/voyage/chapters/chapter-three-copy";
import { diagnostics } from "./diagnostics";
import { openChapter, opensCodeSheet, operable, railStaysInView, watchMotion } from "./chapters";
import { watchToasts } from "./toasts";
import { holdClock } from "../../registry/ouro/e2e/ouro/story";
import { HANDOFF } from "../src/copy";
import { ARTICLES, CHAPTER_ONE, CREW, PARTS } from "../src/voyage/chapters/copy";
import { CATALOGUE, FINDS } from "../src/voyage/chapters/chapter-two-copy";
import { SHORTEST, writeLeagues } from "../src/voyage/chapters/route";

// Chapter III, "Face the squid", against the production build (site-design.md, "Verification in
// CI"): each control in CHAPTER_THREE_CONTROLS has a test named "control: <id>" that operates it
// and asserts what it visibly changes (site/scripts/stage-census.test.mjs fails when one is
// missing), every operable element in the chapter is one of those controls, the chapter is
// server-rendered and loads its code only as it nears the screen, X-ray finds its HX components,
// phones work by touch, and under reduced motion nothing moves. Each control's latency is
// chapter-three.latency.spec.ts's.

const open = (page: Page) => openChapter(page, "chapter-three");
const encounter = (page: Page) => page.locator("[data-composition='encounter']");
const saloon = (page: Page) => page.locator("[data-composition='saloon']");
const scene = (page: Page) => page.locator(".site-porthole");
const crew = (page: Page) => encounter(page).locator("[data-chapter-crew]");
const status = (page: Page) => encounter(page).locator("[data-chapter-status]");
const alarm = (page: Page) => encounter(page).getByRole("button", { name: ENCOUNTER.alarm });
const playButton = (page: Page) => saloon(page).getByRole("button", { name: SALOON.play });
const dialog = (page: Page) => page.getByRole("dialog", { name: ENCOUNTER.dialog });

/**
 * The HX name X-ray's tag shows on the element `control` finds: the tag of the outline drawn over its
 * box, or null while X-ray draws none there or hides that tag (crowded out, or covered).
 */
async function tagOn(page: Page, control: Locator): Promise<string | null> {
  const box = await control.boundingBox();
  if (!box) return null;
  return page.evaluate((want) => {
    for (const outline of document.querySelectorAll<HTMLElement>("[data-ouro-inspector-outline]")) {
      const drawn = outline.getBoundingClientRect();
      const over = [drawn.x - want.x, drawn.y - want.y, drawn.width - want.width, drawn.height - want.height].every((gap) => Math.abs(gap) < 1);
      const tag = outline.querySelector<HTMLElement>("[data-ouro-part='tag']");
      if (over && tag && getComputedStyle(tag).visibility === "visible") return tag.textContent;
    }
    return null;
  }, box);
}

/** Gives an order from the Orders menu. */
async function order(page: Page, name: string): Promise<void> {
  const trigger = encounter(page).getByRole("button", { name: ENCOUNTER.orders, exact: true });
  await trigger.click();
  const menu = page.getByRole("menu");
  // WebKit can drop a press on an item while the menu is still opening, so it opens fully first.
  await expect(menu).toBeVisible();
  await expect(menu).not.toHaveAttribute("data-starting-style");
  await menu.evaluate((element) => Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)));
  const checkbox = menu.getByRole("menuitemcheckbox", { name, exact: true });
  await menu.getByRole("menuitem", { name, exact: true }).or(checkbox).click();
  // A checkbox item leaves the menu open, so more can be ticked; Escape closes it.
  if (await checkbox.count()) await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  // The menu hands focus back to Orders a moment after it closes; a menu opened before then would lose it and close.
  await expect(trigger).toBeFocused();
}

/** The focused element's text once two reads two frames apart agree, so a focus move a key started has landed. */
async function settledFocus(page: Page): Promise<string> {
  const read = () =>
    page.evaluate(() => new Promise<string>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(document.activeElement?.textContent?.trim() ?? "")))));
  let last = await read();
  for (;;) {
    const now = await read();
    if (now === last) return now;
    last = now;
  }
}

/** Gives an order from the Orders menu by keys: the arrows walk to it, and Enter gives it. */
async function orderByKeys(page: Page, name: string): Promise<void> {
  const trigger = encounter(page).getByRole("button", { name: ENCOUNTER.orders, exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const item = page.getByRole("menu").getByRole("menuitem", { name, exact: true });
  await expect(page.getByRole("menu")).toBeVisible();
  // The menu moves focus a frame after the key (and after it opens), so each press waits for the
  // focus to land before the next: read at once, the old item looks current and the walk overshoots.
  await expect.poll(() => page.evaluate(() => document.activeElement?.closest('[role="menu"]') != null)).toBe(true);
  for (let step = 0; step < 6 && (await settledFocus(page)) !== name; step++) await page.keyboard.press("ArrowDown");
  await expect(item).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(trigger).toBeFocused();
}

/**
 * Up, and the deck lamp (the `feathers` order): the squid lets go. By keys, because on CI WebKit sometimes closes the menu
 * after surfacing or drops a pointer press on an item; the orders control test keeps the pointer.
 */
async function win(page: Page): Promise<void> {
  await orderByKeys(page, ORDERS.surface);
  await orderByKeys(page, ORDERS.feathers);
  await expect(scene(page)).toHaveAttribute("data-squid", "gone");
}


test.describe("each control in Chapter III", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("control: encounter-code opens the encounter's Code sheet, which says what is HX's and what is the site's", async ({ page }) => {
    await opensCodeSheet(page, "chapter-three", encounter(page), CODE_SHEETS_THREE.encounter);
  });

  test("control: saloon-code opens the saloon's Code sheet, which says what is HX's and what is the site's", async ({ page }) => {
    await opensCodeSheet(page, "chapter-three", saloon(page), CODE_SHEETS_THREE.saloon);
  });

  test("the encounter's Code sheet shows the orders as they stand: with the floodlights on, it reads checked={true}", async ({ page }) => {
    await open(page);
    await order(page, ORDERS.lights);
    await expect(scene(page)).toHaveAttribute("data-lights", "");
    await encounter(page).getByRole("button", { name: CHAPTER_ONE.code }).click();
    const sheet = page.getByRole("dialog", { name: CODE_SHEETS_THREE.encounter.title });
    // real clock: the Code sheet, which stays open until it is closed.
    await expect(sheet.locator("[data-chapter-code]", { hasText: "<Menu " })).toContainText(`<MenuCheckboxItem checked={true} onCheckedChange={setLights}>${ORDERS.lights}</MenuCheckboxItem>`);
  });

  test("control: alarm opens the dialog, and the crew turns out", async ({ page }) => {
    await open(page);
    await expect(crew(page)).toContainText(FIGHT.opening.text);
    await alarm(page).click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page)).toContainText(ENCOUNTER.dialogBody);
    await expect(crew(page)).toContainText(FIGHT.alarm.text);
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toBeHidden();
    await expect(alarm(page)).toBeFocused();
  });

  test("control: feathers, from the dialog, readies the crew; then up, and the squid lets go, said once by the crew with no toast", async ({ page }) => {
    await open(page);
    await alarm(page).click();
    await dialog(page).getByRole("button", { name: ORDERS.feathers }).click();
    await expect(dialog(page)).toBeHidden();
    await expect(status(page)).toContainText(ENCOUNTER.feathersReady);
    await expect(crew(page)).toContainText(FIGHT.feathersDeep.text);
    await expect(scene(page)).toHaveAttribute("data-squid", "holding");
    const toasts = await watchToasts(page);
    await order(page, ORDERS.surface);
    await expect(scene(page)).toHaveAttribute("data-squid", "gone");
    await expect(status(page)).toContainText(ENCOUNTER.free);
    await expect(crew(page)).toContainText(FIGHT.win.text);
    // The crew's line, the badge and the porthole say it: no toast says it again.
    expect(await toasts.titles()).toEqual([]);
  });

  test("control: surface, from the dialog, takes the ship up; then the deck lamp, and the squid lets go", async ({ page }) => {
    await open(page);
    await alarm(page).click();
    await dialog(page).getByRole("button", { name: ENCOUNTER.hope }).click();
    await expect(dialog(page)).toBeHidden();
    await expect(scene(page)).toHaveAttribute("data-surfaced", "");
    await expect(scene(page).locator(".ph-surface")).toHaveCSS("opacity", "1");
    await expect(crew(page)).toContainText(FIGHT.surface.text);
    await alarm(page).click();
    await dialog(page).getByRole("button", { name: ORDERS.feathers }).click();
    await expect(scene(page)).toHaveAttribute("data-squid", "gone");
  });

  test("control: orders lists every order: the floodlights tick on and off, and Dive and the organ stay off while the squid holds on", async ({ page }) => {
    await open(page);
    await order(page, ORDERS.lights);
    await expect(scene(page)).toHaveAttribute("data-lights", "");
    await expect(scene(page).locator(".ph-beam")).toHaveCSS("opacity", "1");
    await expect(crew(page)).toContainText(FIGHT.lightsOnHeld.text);
    await encounter(page).getByRole("button", { name: ENCOUNTER.orders, exact: true }).click();
    await expect(page.getByRole("menuitemcheckbox", { name: ORDERS.lights })).toBeChecked();
    for (const name of [ORDERS.dive, ORDERS.organ]) {
      const item = page.getByRole("menuitem", { name, exact: true });
      await expect(item).toBeDisabled();
      await item.click({ force: true });
      await expect(page.getByRole("menu")).toBeVisible();
    }
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toBeHidden();
    await expect(encounter(page).getByRole("button", { name: ENCOUNTER.orders, exact: true })).toBeFocused();
    await expect(crew(page)).toContainText(FIGHT.lightsOnHeld.text);
    await expect(scene(page)).not.toHaveAttribute("data-surfaced", "");
    await order(page, ORDERS.lights);
    await expect(scene(page)).not.toHaveAttribute("data-lights", "");
  });

  test("control: palette finds an order as you type and runs it", async ({ page }) => {
    await open(page);
    const trigger = encounter(page).getByRole("button", { name: ENCOUNTER.palette });
    await trigger.click();
    const search = page.getByRole("combobox", { name: ENCOUNTER.paletteSearch });
    await expect(search).toBeFocused();
    await expect(search).toHaveAttribute("placeholder", ENCOUNTER.palettePlaceholder);
    // Dive and the organ wait for the squid to let go, and say so.
    for (const name of [ORDERS.dive, ORDERS.organ]) {
      await expect(page.getByRole("option", { name })).toBeDisabled();
      await expect(page.getByRole("option", { name })).toContainText(ENCOUNTER.heldOrder);
    }
    await page.keyboard.type("flood");
    await expect(page.getByRole("option", { name: ORDERS.lights })).toBeVisible();
    await expect(page.getByRole("option", { name: ORDERS.dive })).toHaveCount(0);
    await page.keyboard.press("Enter");
    await expect(scene(page)).toHaveAttribute("data-lights", "");
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(search).toBeFocused();
    await page.keyboard.type("deck");
    await expect(page.getByRole("option", { name: ORDERS.feathers })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(status(page)).toContainText(ENCOUNTER.feathersReady);
  });

  test("control: organ waits for the fight, then plays: the pipes glow, the log gets its line, and the way on is offered, with focus kept on Play", async ({ page }) => {
    await open(page);
    await expect(playButton(page)).toBeDisabled();
    await expect(saloon(page).locator("[data-chapter-organ-hint]")).toHaveText(SALOON.playHint);
    await win(page);
    await expect(playButton(page)).toBeEnabled();
    const toasts = await watchToasts(page);
    await playButton(page).scrollIntoViewIfNeeded();
    const top = await page.evaluate(() => scrollY);
    await playButton(page).click();
    await expect(saloon(page).locator("[data-chapter-log] li").last()).toHaveText(new RegExp(SALOON.logPlayed));
    await expect(scene(page)).toHaveAttribute("data-squid", "listening");
    await expect(saloon(page).locator(".site-organ")).toHaveAttribute("data-played", "");
    await expect.poll(() => saloon(page).locator(".site-organ .or-playing").evaluate((layer) => getComputedStyle(layer).opacity)).toBe("1");
    await expect(page.getByRole("list", { name: BATTLE.label })).toContainText(BATTLE.organDone);
    await expect(saloon(page).locator("[data-chapter-next]")).toBeVisible();
    // Play keeps focus and the page stays put: the way on shows below without taking either.
    await expect(saloon(page).getByRole("button", { name: SALOON.playAgain })).toBeFocused();
    expect(await page.evaluate(() => scrollY)).toBe(top);
    // The end raises no toast: the log and the porthole say it.
    expect(await toasts.titles()).toEqual([]);
  });

  test("control: reveal turns X-ray on where the reader stands, so the organ's Play wears its HX name, and a second press turns it off", async ({ page }) => {
    await open(page);
    await win(page);
    await playButton(page).click();
    const reveal = saloon(page).locator("[data-chapter-control='reveal']").getByRole("button", { name: SALOON.reveal });
    const xray = page.getByRole("switch", { name: "X-ray" });
    await expect(reveal).toHaveAttribute("aria-pressed", "false");
    await expect(xray).not.toBeChecked();
    await reveal.scrollIntoViewIfNeeded();
    const top = await page.evaluate(() => scrollY);
    await reveal.click();
    await expect(reveal).toHaveAttribute("aria-pressed", "true");
    await expect(xray).toBeChecked();
    await expect.poll(() => tagOn(page, saloon(page).getByRole("button", { name: SALOON.playAgain }))).toBe("button");
    // The reader stays where they are, at the toggle, and the tags appear around it.
    await expect(reveal).toBeFocused();
    expect(await page.evaluate(() => scrollY)).toBe(top);
    await reveal.click();
    await expect(reveal).toHaveAttribute("aria-pressed", "false");
    await expect(xray).not.toBeChecked();
    await expect(page.locator("[data-ouro-inspector-outline]")).toHaveCount(0);
    await expect(reveal).toBeFocused();
  });

  test("control: handoff copies the line for a coding agent, and says Copied on its own button, with no toast", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Only Chromium lets a test grant the clipboard");
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.clock.install();
    await open(page);
    await win(page);
    await playButton(page).click();
    const copy = saloon(page).locator("[data-chapter-control='handoff'] [data-ouro='copy-button'] button");
    await expect(copy).toHaveText("Copy");
    // "Copied" lasts two seconds, which a loaded runner can outlast between two steps: the clock is held from the press.
    await holdClock(page);
    await copy.click();
    await expect(copy).toHaveText("Copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(HANDOFF.prompt);
    // A toast would come with the confirmation; with the clock held it would stay, so none is in the page.
    expect(await page.locator('[data-ouro="toast"]').count()).toBe(0);
  });

  test("control: components leads to the catalogue of components", async ({ page }) => {
    await open(page);
    await win(page);
    await playButton(page).click();
    const link = saloon(page).getByRole("link", { name: SALOON.components });
    await expect(link).toHaveAttribute("href", /^\/docs\/$/);
    await link.click();
    await expect(page).toHaveURL(/\/docs\/$/);
  });

  test("control: again brings the squid back for another go, and focus to the alarm", async ({ page }) => {
    await open(page);
    await win(page);
    await playButton(page).click();
    await saloon(page).getByRole("button", { name: SALOON.again }).click();
    await expect(scene(page)).toHaveAttribute("data-squid", "holding");
    await expect(scene(page)).not.toHaveAttribute("data-surfaced", "");
    await expect(playButton(page)).toBeDisabled();
    await expect(saloon(page).locator("[data-chapter-log] li")).toHaveCount(1);
    await expect(crew(page)).toContainText(FIGHT.again.text);
    await expect(alarm(page)).toBeFocused();
  });
});

test("Sail again leaves X-ray as the reader set it, on or off", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const xray = page.getByRole("switch", { name: "X-ray" });
  for (const on of [true, false]) {
    await win(page);
    await playButton(page).click();
    const reveal = saloon(page).getByRole("button", { name: SALOON.reveal });
    if (on) await reveal.click();
    await expect(xray).toBeChecked({ checked: on });
    await saloon(page).getByRole("button", { name: SALOON.again }).click();
    await expect(alarm(page)).toBeFocused();
    await expect(xray).toBeChecked({ checked: on });
    if (on) await expect.poll(() => tagOn(page, alarm(page))).toBe("button");
    else await expect(page.locator("[data-ouro-inspector-outline]")).toHaveCount(0);
    if (on) await xray.click();
  }
});

/** The page's scroll position once two reads two frames apart agree, so a smooth scroll has ended. */
async function settledScroll(page: Page): Promise<number> {
  const read = () => page.evaluate(() => new Promise<number>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(scrollY)))));
  let last = await read();
  for (;;) {
    const now = await read();
    if (now === last) return now;
    last = now;
  }
}

test("Sail again pressed with a mouse glides back up to the squid, never in one jump, and pressed by keys takes focus to the alarm", async ({ page, browserName }) => {
  await page.setViewportSize({ width: 1440, height: 820 });
  await open(page);
  await win(page);
  await playButton(page).click();
  const again = saloon(page).getByRole("button", { name: SALOON.again });
  await again.scrollIntoViewIfNeeded();
  await settledScroll(page);
  // The scroll position and the time in every frame from when focus moves to the alarm: the press's own frame can
  // shift the page by the lines the log loses (Chromium keeps what is under the pointer still), but the move up to
  // the squid must glide.
  await page.evaluate(() => {
    const frames: [number, number][] = [];
    (window as unknown as { glide: [number, number][] }).glide = frames;
    const frame = (time: number) => {
      frames.push([scrollY, time]);
      requestAnimationFrame(frame);
    };
    const moved = (event: FocusEvent) => {
      if (!(event.target as Element).closest("[data-chapter-control='alarm']")) return;
      removeEventListener("focusin", moved);
      frame(performance.now());
    };
    addEventListener("focusin", moved);
  });
  await again.click();
  await expect(scene(page)).toHaveAttribute("data-squid", "holding");
  await expect(alarm(page)).toBeFocused();
  await settledScroll(page);
  await expect(scene(page)).toBeInViewport({ ratio: 1 });
  const frames = await page.evaluate(() => (window as unknown as { glide: [number, number][] }).glide);
  const moves = frames.filter(([top], index) => index > 0 && top !== frames[index - 1]![0]).map(([, time]) => time);
  expect(frames[0]![0] - frames.at(-1)![0]).toBeGreaterThan(300);
  // A glide, not a jump: the page moves over a tenth of a second or more, not in one frame, however slow the frames come.
  // In CI's WebKit on Linux a smooth scroll lands in one frame, so there the test can only see it land on the squid.
  if (browserName === "chromium") expect(moves.at(-1)! - moves[0]!).toBeGreaterThanOrEqual(100);

  await win(page);
  await playButton(page).click();
  await again.focus();
  await page.keyboard.press("Enter");
  await expect(scene(page)).toHaveAttribute("data-squid", "holding");
  await expect(alarm(page)).toBeFocused();
  await expect(alarm(page)).toBeInViewport();
});

test("every operable element in Chapter III is one of its listed controls, in page order", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await win(page);
  await playButton(page).click();
  // The way on follows Play by a frame (the saloon's deferred render).
  await expect(saloon(page).locator("[data-chapter-next]")).toBeVisible();
  const found = await operable(page, "chapter-three");
  expect(found.loose).toEqual([]);
  // The dialog's two choices are over the page, not in it.
  expect(found.order).toEqual(CHAPTER_THREE_CONTROLS.filter((id) => id !== "feathers" && id !== "surface"));
  await alarm(page).click();
  const choices = await dialog(page).evaluate((panel) => [...panel.querySelectorAll("[data-chapter-control]")].map((element) => element.getAttribute("data-chapter-control")));
  expect(choices).toEqual(["surface", "feathers"]);
});

test("Chapter III is in the server HTML, and its code loads only as it nears the screen", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const chunks: string[] = [];
  page.on("request", (request) => {
    if (/\/assets\/chapter-three-[\w-]+\.js$/.test(request.url())) chunks.push(request.url());
  });
  await page.goto("nautilus/");
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: CHAPTER_THREE.title })).toBeAttached();
  await expect(page.locator(".site-porthole picture[data-brand-scene='nautilus-porthole'] img")).toBeAttached();
  await expect(page.locator("#chapter-three")).not.toHaveAttribute("data-chapter-ready", "");
  expect(chunks).toEqual([]);
  await page.locator("#chapter-three").scrollIntoViewIfNeeded();
  await expect(page.locator("#chapter-three[data-chapter-ready]")).toBeAttached();
  expect(chunks).toHaveLength(1);
});

test("before its island, the porthole is the squid's painting in its brass ring: the ring's colours are in the server HTML", async ({ browser }) => {
  // No script at all: the page as the server sends it, before any island hydrates.
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 }, baseURL: test.info().project.use.baseURL! });
  const page = await context.newPage();
  await page.goto("nautilus/");
  const porthole = page.locator(".site-porthole");
  const paint = (selector: string, property: string) => porthole.locator(selector).first().evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);
  expect(await paint(".ph-sea", "fill")).not.toBe("none");
  // The squid's painting is in the page as the server sends it, and the sea it leaves is under it, hidden.
  await expect(porthole.locator(".ph-squid picture[data-brand-scene='nautilus-porthole'] img")).toHaveAttribute("src", /nautilus-porthole\.webp$/);
  expect(await porthole.locator(".ph-squid").evaluate((layer) => getComputedStyle(layer).opacity)).toBe("1");
  // Each painting fills the glass edge to edge, the sea it leaves too, so no band of the plain sea shows below it.
  for (const name of ["nautilus-porthole", "nautilus-porthole-free"]) {
    const [glass, img] = await Promise.all([porthole.boundingBox(), porthole.locator(`picture[data-brand-scene='${name}'] img`).boundingBox()]);
    expect(img!.height, name).toBeGreaterThanOrEqual(glass!.height - 1);
  }
  expect(await paint(".ph-ring", "stroke")).not.toBe("none");
  expect(await paint(".ph-bolts circle", "fill")).not.toBe("none");
  expect(await paint(".ph-bolts circle", "stroke")).not.toBe("none");
  await test.info().attach("porthole before hydration", { body: await porthole.screenshot(), contentType: "image/png" });
  await context.close();
});

test("X-ray outlines Chapter III's HX components", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const xray = page.getByRole("switch", { name: "X-ray" });
  await xray.click();
  await expect(xray).toBeChecked();
  const tags = page.locator("[data-ouro-inspector-outline] [data-ouro-part='tag']");
  await expect.poll(() => tags.count()).toBeGreaterThan(10);
  const names = new Set(await tags.allTextContents());
  for (const item of ["button", "badge", "avatar"]) expect(names, item).toContain(item);
});

test("on a phone, the fight and the organ work by touch, and nothing overflows", async ({ browser, browserName }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: browserName === "chromium", reducedMotion: "reduce", baseURL: test.info().project.use.baseURL! });
  const page = await context.newPage();
  const errors = diagnostics(page);
  await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await alarm(page).tap();
  await dialog(page).getByRole("button", { name: ENCOUNTER.hope }).tap();
  await expect(scene(page)).toHaveAttribute("data-surfaced", "");
  await alarm(page).tap();
  await dialog(page).getByRole("button", { name: ORDERS.feathers }).tap();
  await expect(scene(page)).toHaveAttribute("data-squid", "gone");
  await playButton(page).tap();
  await expect(saloon(page).locator("[data-chapter-log] li").last()).toHaveText(new RegExp(SALOON.logPlayed));
  const marker = page.locator("#chapter-three [data-chapter-marker]");
  await expect(marker.getByRole("img")).toHaveAccessibleName("3 of 3 done");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await context.close();
});

test("under reduced motion, the fight and the organ change only colour and opacity, and nothing moves", async ({ page }) => {
  test.slow();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const moved = await watchMotion(page, "chapter-three");
  await order(page, ORDERS.lights);
  await win(page);
  await playButton(page).click();
  await page.waitForTimeout(600);
  expect(await moved()).toEqual([]);
  // The squid still comes back to listen, and the organ's pipes still glow: they fade.
  await expect(scene(page)).toHaveAttribute("data-squid", "listening");
  await expect.poll(() => scene(page).locator(".ph-squid").evaluate((layer) => getComputedStyle(layer).opacity)).toBe("1");
  await expect(scene(page).locator(".ph-squid")).toHaveCSS("translate", "none");
  await expect(scene(page).locator(".ph-squid")).toHaveCSS("animation-name", "none");
  await expect.poll(() => saloon(page).locator(".or-playing").evaluate((layer) => getComputedStyle(layer).opacity)).toBe("1");
});

test("a third tune puts the squid at the saloon's window to sleep, the log and Conseil say so, and Sail again wakes it", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await win(page);
  const organ = saloon(page).locator(".site-organ");
  const asleep = organ.locator(".or-asleep");
  const opacity = () => asleep.evaluate((layer) => getComputedStyle(layer).opacity);
  const log = saloon(page).locator("[data-chapter-log] li");
  const moved = await watchMotion(page, "chapter-three");
  await playButton(page).click();
  const again = saloon(page).getByRole("button", { name: SALOON.playAgain });
  await again.click();
  // Two tunes in, it is still awake and listening.
  await expect(crew(page)).toContainText(FIGHT.organ.text);
  await expect(organ).not.toHaveAttribute("data-asleep");
  expect(await opacity()).toBe("0");
  await again.click();
  // The lullaby: its eye closes, faded in over the playing picture, and the log and Conseil say so.
  await expect(organ).toHaveAttribute("data-asleep", "");
  await expect.poll(opacity).toBe("1");
  await expect(organ).toHaveAccessibleName(`${SALOON.organ}. ${SALOON.asleep}`);
  await expect(log.last()).toContainText(SALOON.logAsleep);
  await expect(crew(page)).toContainText(FIGHT.asleep.text);
  const lines = await log.count();
  // More tunes, and it sleeps on: the log gets no new line.
  await again.click();
  await expect(organ).toHaveAttribute("data-asleep", "");
  await expect(log).toHaveCount(lines);
  // Under reduced motion it only fades.
  expect(await moved()).toEqual([]);
  await saloon(page).getByRole("button", { name: SALOON.again }).click();
  await expect(organ).not.toHaveAttribute("data-asleep");
  await expect.poll(opacity).toBe("0");
  await expect(saloon(page).locator("[data-chapter-log]")).not.toContainText(SALOON.logAsleep);
});

test("without reduced motion, the squid clings, lets go and drifts off into the deep over its ink, and swims back for the organ", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  // Clinging: it breathes against the glass.
  await expect(scene(page).locator(".ph-squid")).toHaveCSS("animation-name", "sq-hold");
  await win(page);
  // Its painting is feathered at the glass's edge, so as it shrinks away no square edge shows inside the glass.
  await expect(scene(page).locator(".ph-squid")).toHaveCSS("mask-image", /radial-gradient/);
  // It lets go and drifts off, smaller and fading, over the painting of the sea it leaves, inked.
  await expect.poll(() => scene(page).locator(".ph-squid").evaluate((layer) => getComputedStyle(layer).translate)).toBe("6% 22%");
  await expect.poll(() => scene(page).locator(".ph-squid").evaluate((layer) => getComputedStyle(layer).opacity)).toBe("0");
  await expect(scene(page).locator(".ph-free picture[data-brand-scene='nautilus-porthole-free'] img")).toBeAttached();
  // The whole crew turns out and hops, with the shared frame's styles, whether or not Chapter I has loaded.
  await expect(crew(page).locator("[data-chapter-cheer] > *").first()).toHaveCSS("animation-name", "site-hop");
  await playButton(page).click();
  await expect.poll(() => saloon(page).locator(".or-playing").evaluate((layer) => getComputedStyle(layer).opacity)).toBe("1");
  // The squid swims back up to the glass to listen.
  await expect(scene(page)).toHaveAttribute("data-squid", "listening");
  await expect.poll(() => scene(page).locator(".ph-squid").evaluate((layer) => getComputedStyle(layer).translate)).toBe("none");
  await expect.poll(() => scene(page).locator(".ph-squid").evaluate((layer) => getComputedStyle(layer).opacity)).toBe("1");
});

test("an order paints its control first, and the porthole only in a later frame", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  // What the porthole shows in the frame that paints the press (the first frame after the click),
  // and whether it shows it by the frame after.
  const watchNextFrames = () =>
    page.evaluate(() => {
      const porthole = document.querySelector(".site-porthole")!;
      (window as unknown as { __frames: Promise<(string | null)[]> }).__frames = new Promise((resolve) => {
        document.addEventListener(
          "click",
          () => requestAnimationFrame(() => {
            const first = porthole.getAttribute("data-lights");
            setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve([first, porthole.getAttribute("data-lights")]))), 50);
          }),
          { capture: true, once: true },
        );
      });
    });
  const frames = () => page.evaluate(() => (window as unknown as { __frames: Promise<(string | null)[]> }).__frames);
  // From the Menu.
  await encounter(page).getByRole("button", { name: ENCOUNTER.orders, exact: true }).click();
  await watchNextFrames();
  await page.getByRole("menuitemcheckbox", { name: ORDERS.lights }).click();
  expect(await frames()).toEqual([null, ""]);
  await page.keyboard.press("Escape");
  // From the palette, by mouse.
  await encounter(page).getByRole("button", { name: ENCOUNTER.palette }).click();
  await page.keyboard.type("flood");
  await watchNextFrames();
  await page.getByRole("option", { name: ORDERS.lights }).click();
  expect(await frames()).toEqual(["", null]);
});

test("the chapter's picture answers the fight: once the squid lets go the saloon's window shows open sea, until the organ calls it back", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const picture = page.locator("[data-chapter-battle] [data-chapter-picture='nautilus-squid']");
  const state = picture.locator(".site-picture-state");
  await expect(picture).toHaveAttribute("data-chapter-picture-state", "nautilus-squid");
  await expect(state).toHaveCSS("opacity", "0");
  await win(page);
  await expect(picture).toHaveAttribute("data-chapter-picture-state", "nautilus-squid-free");
  await expect.poll(() => state.evaluate((layer) => getComputedStyle(layer).opacity)).toBe("1");
  await expect(picture.getByRole("img")).toHaveCount(1);
  await expect(picture.getByRole("img")).toHaveAccessibleName(/let go/);
  await playButton(page).click();
  await expect(picture).toHaveAttribute("data-chapter-picture-state", "nautilus-squid");
  await expect.poll(() => state.evaluate((layer) => getComputedStyle(layer).opacity)).toBe("0");
});

test.describe("by keyboard alone", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("the alarm opens the dialog, and focus comes back to it when it closes", async ({ page }) => {
    await open(page);
    await alarm(page).focus();
    await page.keyboard.press("Enter");
    await expect(dialog(page)).toBeVisible();
    // Focus is in the dialog, and stays there.
    await expect.poll(() => dialog(page).evaluate((panel) => panel.contains(document.activeElement))).toBe(true);
    for (let step = 0; step < 4; step++) {
      await page.keyboard.press("Tab");
      await expect.poll(() => dialog(page).evaluate((panel) => panel.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toBeHidden();
    await expect(alarm(page)).toBeFocused();
  });

  test("win the fight from the menu and play the organ, all by keys", async ({ page }) => {
    await open(page);
    const menuButton = encounter(page).getByRole("button", { name: ENCOUNTER.orders, exact: true });
    await menuButton.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem", { name: ORDERS.surface })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(scene(page)).toHaveAttribute("data-surfaced", "");
    await expect(menuButton).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem", { name: ORDERS.surface })).toBeFocused();
    for (let step = 0; step < 3; step++) await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: ORDERS.feathers })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(scene(page)).toHaveAttribute("data-squid", "gone");
    await playButton(page).focus();
    await page.keyboard.press("Enter");
    await expect(saloon(page).locator("[data-chapter-log] li").last()).toHaveText(new RegExp(SALOON.logPlayed));
    await expect(saloon(page).getByRole("button", { name: SALOON.playAgain })).toBeFocused();
  });

  test("from a link straight to Chapter III on a slow connection, focus stays in the Orders menu as the page's later styles load (#2224)", async ({ page }) => {
    // The page's stylesheet comes late, as on a slow connection, so it is still on its way as the HTML arrives. Then Safari,
    // left to itself, jumps to #chapter-three again each time a later stylesheet loads (opening the menu fetches one, and
    // Chapter II brings its own as it wakes), and each jump takes focus out of the menu (site/index.html).
    await page.route(/\/assets\/voyage-[^/]*\.css$/, async (route) => {
      await new Promise((arrived) => setTimeout(arrived, 1000));
      await route.continue();
    });
    let wake!: () => void;
    const woken = new Promise<void>((done) => (wake = done));
    await page.route(/\/assets\/chapter-two-[^/]*\.js$/, async (route) => {
      await woken;
      await route.continue();
    });
    await page.goto("nautilus/#chapter-three");
    await expect(page.locator("html[data-site-ready]")).toBeAttached();
    await expect(page.locator("#chapter-three[data-chapter-ready]")).toBeAttached();
    const menuButton = encounter(page).getByRole("button", { name: ENCOUNTER.orders, exact: true });
    await menuButton.focus();
    await page.keyboard.press("Enter");
    const surface = page.getByRole("menuitem", { name: ORDERS.surface });
    await expect(surface).toBeFocused();
    wake();
    await expect(page.locator("#chapter-two[data-chapter-ready]")).toBeAttached();
    // Two frames on, so a jump the new styles set off has landed.
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    await expect(surface).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: ORDERS.surface })).not.toBeFocused();
    await expect.poll(() => page.evaluate(() => document.activeElement?.closest('[role="menu"]') != null)).toBe(true);
  });
});

test.describe("the ship's log remembers your voyage", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  const log = (page: Page) => saloon(page).locator("[data-chapter-log] li");
  /** Scrolls on to a chapter on the same page, so the voyage so far is kept, and waits for it to hydrate. */
  const sailOn = async (page: Page, id: string) => {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    await expect(page.locator(`#${id}[data-chapter-ready]`)).toBeAttached();
  };

  test("build her, sign on as Ana, plan the shortest way, sort a find, win and play: the log lists each, the crew call Ana by name, and she cheers with them", async ({ page }) => {
    test.slow();
    await openChapter(page, "chapter-one");
    for (const part of PARTS) await page.getByRole("checkbox", { name: part.job }).click();
    await page.locator("[data-composition='shipyard'] [data-chapter-control='launch'] button").click();
    const articles = page.locator("[data-composition='articles']");
    await articles.getByRole("textbox", { name: ARTICLES.name }).fill("Ana Ruiz");
    await articles.getByRole("combobox", { name: ARTICLES.trade }).click();
    await page.getByRole("option", { name: "Engineer" }).click();
    await articles.getByRole("checkbox", { name: ARTICLES.oath }).click();
    await articles.getByRole("button", { name: ARTICLES.sign }).click();
    await expect(articles.locator("[data-chapter-signed]")).toBeVisible();

    await sailOn(page, "chapter-two");
    for (const name of ["Crespo Island", "Atlantis", "Vigo Bay", "The Red Sea tunnel", "The South Pole"]) {
      await page.getByRole("button", { name: new RegExp(`^Reorder ${name}`) }).click();
      await page.getByRole("menu", { name: `Reorder ${name}` }).getByRole("menuitem", { name: "Move to bottom" }).click();
    }
    await expect(page.locator("[data-composition='chart-room'] .site-leagues")).toHaveText(writeLeagues(SHORTEST));
    await page.getByRole("combobox", { name: CATALOGUE.classify }).click();
    await page.getByRole("option", { name: "Crustacean", exact: true }).click();
    await expect(page.locator("[data-composition='catalogue'] [data-chapter-crew]")).toContainText(FINDS[0].name);

    await sailOn(page, "chapter-three");
    await expect(log(page)).toHaveText(["Built in 5 days, and launched.", "Ana Ruiz signed on, engineer.", `Sailed 1867-11-06 by Conseil's shortest way, ${writeLeagues(SHORTEST)} leagues.`, "Sorted a new find.", SALOON.logHeld].map((line, index) => `${String(index + 1).padStart(2, "0")}${line}`));
    await win(page);
    await expect(crew(page)).toContainText("Ana, hold that lamp steady.");
    const cheer = crew(page).locator("[data-chapter-cheer] [data-ouro='avatar']");
    await expect(cheer).toHaveCount(CREW.length + 1);
    await expect(cheer.last().locator("[data-ouro-avatar-initials='AR']")).toBeAttached();
    await playButton(page).click();
    await expect(log(page)).toHaveCount(7);
    await expect(log(page).last()).toHaveText(new RegExp(SALOON.logPlayed));
  });

  test("a reader who opens Chapter III straight from its link finds no line for what they didn't do, and the crew use no name", async ({ page }) => {
    await page.goto("nautilus/#chapter-three");
    await expect(page.locator("html[data-site-ready]")).toBeAttached();
    await page.locator("#chapter-three").scrollIntoViewIfNeeded();
    await expect(page.locator("#chapter-three[data-chapter-ready]")).toBeAttached();
    await expect(log(page)).toHaveText([`01${SALOON.logHeld}`]);
    await win(page);
    await expect(crew(page)).toContainText(FIGHT.win.text);
    await expect(crew(page).locator("[data-chapter-cheer] [data-ouro='avatar']")).toHaveCount(CREW.length);
    await playButton(page).click();
    await expect(log(page)).toHaveText([SALOON.logHeld, SALOON.logFree, SALOON.logPlayed].map((line, index) => `0${index + 1}${line}`));
    await expect(saloon(page).locator("[data-chapter-log]")).not.toContainText(/signed on|leagues|Built/);
  });
});

test("on a laptop's screen, however short, Chapter III's rail keeps its picture and steps in view to the chapter's end", async ({ page }) => {
  await railStaysInView(page, "chapter-three", "data-chapter-battle");
});
