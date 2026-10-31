import { expect, test, type Page } from "@playwright/test";
import { BATTLE, CHAPTER_THREE, CHAPTER_THREE_CONTROLS, CODE_SHEETS_THREE, ENCOUNTER, FIGHT, ORDERS, SALOON, TOASTS } from "../src/voyage/chapters/chapter-three-copy";
import { diagnostics } from "./diagnostics";
import { openChapter, opensCodeSheet, operable, watchMotion } from "./chapters";
import { watchToasts } from "./toasts";

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


// PROBE (never merged): records focus, pointer and menu events, and dumps them when a test fails.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const log: string[] = [];
    (window as unknown as { __probe: string[] }).__probe = log;
    const t = () => performance.now().toFixed(1);
    const name = (node: EventTarget | null) => {
      if (!(node instanceof Element)) return String(node && (node as Node).nodeName);
      const role = node.getAttribute("role");
      const text = (node.textContent ?? "").trim().slice(0, 24);
      return `${node.tagName.toLowerCase()}${role ? `[role=${role}]` : ""}${node.id ? `#${node.id}` : ""} "${text}"`;
    };
    for (const type of ["focusin", "focusout", "pointerdown", "pointerup", "click", "keydown", "scroll"]) {
      document.addEventListener(type, (event) => log.push(`${t()} ${type} ${name(event.target)}${type === "focusout" || type === "focusin" ? ` related=${name((event as FocusEvent).relatedTarget)}` : ""}`), true);
    }
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) if (node instanceof Element && (node.matches("[role=menu]") || node.querySelector("[role=menu]"))) log.push(`${t()} menu added`);
        for (const node of record.removedNodes) if (node instanceof Element && (node.matches("[role=menu]") || node.querySelector("[role=menu]"))) log.push(`${t()} menu removed`);
        if (record.type === "attributes" && record.target instanceof Element && record.target.matches("[role=menu]")) log.push(`${t()} menu attr ${record.attributeName}=${record.target.getAttribute(record.attributeName!)}`);
        if (record.type === "attributes" && record.target instanceof Element && record.target.matches("button[aria-haspopup=menu]")) log.push(`${t()} trigger attr ${record.attributeName}=${record.target.getAttribute(record.attributeName!)}`);
      }
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-open", "data-closed", "data-starting-style", "data-ending-style", "aria-expanded", "hidden"] });
    document.addEventListener("DOMContentLoaded", () => log.push(`${t()} domcontentloaded`));
    window.addEventListener("load", () => log.push(`${t()} load`));
    new MutationObserver(() => {
      if (document.documentElement.hasAttribute("data-site-ready")) log.push(`${t()} site-ready`);
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-site-ready"] });
  });
});
test.afterEach(async ({ page }, testInfo) => {
  const log = await page.evaluate(() => (window as unknown as { __probe?: string[] }).__probe ?? []).catch(() => ["(page gone)"]);
  const text = log.join("\n");
  await testInfo.attach("probe-log", { body: text, contentType: "text/plain" });
  if (testInfo.status !== testInfo.expectedStatus) console.log(`PROBE FAILED ${testInfo.title} (repeat ${testInfo.repeatEachIndex}, worker ${testInfo.workerIndex})\n${text.split("\n").slice(-80).join("\n")}`);
});

/** Gives an order from the Orders menu. */
async function order(page: Page, name: string): Promise<void> {
  await encounter(page).getByRole("button", { name: ENCOUNTER.orders, exact: true }).click();
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
}

/** Up, and the feathers: the squid lets go. */
async function win(page: Page): Promise<void> {
  await order(page, ORDERS.surface);
  await order(page, ORDERS.feathers);
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

  test("control: feathers, from the dialog, readies the crew; then up, and the squid lets go", async ({ page }) => {
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
    await expect.poll(toasts.titles).toContain(TOASTS.win);
    await expect(status(page)).toContainText(ENCOUNTER.free);
    await expect(crew(page)).toContainText(FIGHT.win.text);
  });

  test("control: surface, from the dialog, takes the ship up; then the feathers, and the squid lets go", async ({ page }) => {
    await open(page);
    await alarm(page).click();
    await dialog(page).getByRole("button", { name: ENCOUNTER.hope }).click();
    await expect(dialog(page)).toBeHidden();
    await expect(scene(page)).toHaveAttribute("data-surfaced", "");
    await expect(scene(page).locator(".ph-sky")).toHaveCSS("opacity", "1");
    await expect(crew(page)).toContainText(FIGHT.surface.text);
    await alarm(page).click();
    await dialog(page).getByRole("button", { name: ORDERS.feathers }).click();
    await expect(scene(page)).toHaveAttribute("data-squid", "gone");
  });

  test("control: orders lists every order: the floodlights tick on and off, and the squid will not let us dive", async ({ page }) => {
    await open(page);
    await order(page, ORDERS.lights);
    await expect(scene(page)).toHaveAttribute("data-lights", "");
    await expect(scene(page).locator(".ph-beam")).toHaveCSS("opacity", "1");
    await expect(crew(page)).toContainText(FIGHT.lightsOnHeld.text);
    await encounter(page).getByRole("button", { name: ENCOUNTER.orders, exact: true }).click();
    await expect(page.getByRole("menuitemcheckbox", { name: ORDERS.lights })).toBeChecked();
    await page.keyboard.press("Escape");
    await order(page, ORDERS.dive);
    await expect(crew(page)).toContainText(FIGHT.diveHeld.text);
    await order(page, ORDERS.organ);
    await expect(crew(page)).toContainText(FIGHT.organHeld.text);
    await order(page, ORDERS.lights);
    await expect(scene(page)).not.toHaveAttribute("data-lights", "");
  });

  test("control: palette finds an order as you type and runs it", async ({ page }) => {
    await open(page);
    const trigger = encounter(page).getByRole("button", { name: ENCOUNTER.palette });
    await trigger.click();
    const search = page.getByRole("combobox", { name: ENCOUNTER.paletteSearch });
    await expect(search).toBeFocused();
    await page.keyboard.type("flood");
    await expect(page.getByRole("option", { name: ORDERS.lights })).toBeVisible();
    await expect(page.getByRole("option", { name: ORDERS.dive })).toHaveCount(0);
    await page.keyboard.press("Enter");
    await expect(scene(page)).toHaveAttribute("data-lights", "");
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(search).toBeFocused();
    await page.keyboard.type("harpoon");
    await expect(page.getByRole("option", { name: ORDERS.feathers })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(status(page)).toContainText(ENCOUNTER.feathersReady);
  });

  test("control: organ waits for the fight, then plays: the notes rise, the log is stamped, and the way on is offered", async ({ page }) => {
    await open(page);
    await expect(playButton(page)).toBeDisabled();
    await expect(saloon(page).locator("[data-chapter-organ-hint]")).toHaveText(SALOON.playHint);
    await win(page);
    await expect(playButton(page)).toBeEnabled();
    const toasts = await watchToasts(page);
    await playButton(page).click();
    await expect(page.locator("[data-chapter-stamp]")).toHaveText(SALOON.stamp);
    await expect.poll(toasts.titles).toContain(TOASTS.organ);
    await expect(scene(page)).toHaveAttribute("data-squid", "listening");
    await expect(saloon(page).locator(".site-organ .or-note").first()).toHaveCSS("opacity", "1");
    await expect(page.getByRole("list", { name: BATTLE.label })).toContainText(BATTLE.organDone);
    await expect(saloon(page).getByRole("link", { name: SALOON.install })).toBeFocused();
  });

  test("control: install leads to the installing guide", async ({ page }) => {
    await open(page);
    await win(page);
    await playButton(page).click();
    const link = saloon(page).getByRole("link", { name: SALOON.install });
    await expect(link).toHaveAttribute("href", /^\/docs\/installing\/$/);
    await link.click();
    await expect(page).toHaveURL(/\/docs\/installing\/$/);
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
    await expect(page.locator("[data-chapter-stamp]")).toHaveCount(0);
    await expect(crew(page)).toContainText(FIGHT.again.text);
    await expect(alarm(page)).toBeFocused();
  });
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
  await expect(page.locator(".site-porthole .sq-eye")).toBeAttached();
  await expect(page.locator("#chapter-three")).not.toHaveAttribute("data-chapter-ready", "");
  expect(chunks).toEqual([]);
  await page.locator("#chapter-three").scrollIntoViewIfNeeded();
  await expect(page.locator("#chapter-three[data-chapter-ready]")).toBeAttached();
  expect(chunks).toHaveLength(1);
});

test("before its island, the porthole is the sea in its brass ring: their colours are in the server HTML", async ({ browser }) => {
  // No script at all: the page as the server sends it, before any island hydrates.
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 }, baseURL: test.info().project.use.baseURL! });
  const page = await context.newPage();
  await page.goto("nautilus/");
  const porthole = page.locator(".site-porthole");
  const paint = (selector: string, property: string) => porthole.locator(selector).first().evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);
  expect(await paint(".ph-sea", "fill")).not.toBe("none");
  expect(await paint(".ph-ring", "stroke")).not.toBe("none");
  expect(await paint(".ph-bolts circle", "fill")).not.toBe("none");
  expect(await paint(".ph-bolts circle", "stroke")).not.toBe("none");
  await test.info().attach("porthole before hydration", { body: await porthole.screenshot(), contentType: "image/png" });
  await context.close();
});

test("X-ray outlines Chapter III's HX components", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await page.getByRole("switch", { name: "X-ray" }).click();
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
  await expect(page.locator("[data-chapter-stamp]")).toHaveText(SALOON.stamp);
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
  // The squid still comes back to listen, and the notes still show: they fade.
  await expect(scene(page)).toHaveAttribute("data-squid", "listening");
  await expect(scene(page).locator(".ph-squid")).toHaveCSS("opacity", "1");
  await expect(scene(page).locator(".ph-squid")).toHaveCSS("translate", "none");
  await expect(saloon(page).locator(".or-note").first()).toHaveCSS("opacity", "1");
});

test("without reduced motion, the squid sinks back into the deep behind its ink and the notes rise", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await win(page);
  await expect(scene(page).locator(".ph-squid")).toHaveCSS("translate", "-25% 32.5%");
  await expect(scene(page).locator(".sq-ink")).toHaveCSS("animation-name", "sq-ink");
  // The whole crew turns out and hops, with the shared frame's styles, whether or not Chapter I has loaded.
  await expect(crew(page).locator("[data-chapter-cheer] > *").first()).toHaveCSS("animation-name", "site-hop");
  await playButton(page).click();
  await expect(saloon(page).locator(".or-note").first()).toHaveCSS("animation-name", "or-rise");
  // The squid swims back, small, to listen, and sways to the tune.
  await expect(scene(page)).toHaveAttribute("data-squid", "listening");
  await expect(scene(page).locator(".ph-squid")).toHaveCSS("animation-name", "sq-sway");
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
    await expect(page.locator("[data-chapter-stamp]")).toHaveText(SALOON.stamp);
    await expect(saloon(page).getByRole("link", { name: SALOON.install })).toBeFocused();
  });
});
