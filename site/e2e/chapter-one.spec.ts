import { expect, test, type Page } from "@playwright/test";
import { ARTICLES, CHAPTER_ONE, CHAPTER_ONE_CONTROLS, CODE_SHEETS, CREW, EXPEDITION, PARTS, SHIPYARD, SIGN, START_ORDER, YARD } from "../src/voyage/chapters/copy";
import { diagnostics } from "./diagnostics";
import { watchToasts } from "./toasts";

// Chapter I, "Build the ship", against the production build (site-design.md, "Verification in
// CI"): each control in CHAPTER_ONE_CONTROLS has a test named "control: <id>" that operates it and
// asserts what it visibly changes (site/scripts/stage-census.test.mjs fails when one is missing),
// every operable element in the chapter is one of those controls, the chapter is server-rendered
// and loads its code only as it nears the screen, X-ray finds its HX components, phones work by
// touch, and under reduced motion nothing moves. Each control's latency is stage.latency.spec.ts's.

/** Opens the voyage and scrolls to Chapter I, waiting for it to hydrate. */
async function open(page: Page): Promise<void> {
  await page.goto("voyage/");
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
  await page.locator("#chapter-one").scrollIntoViewIfNeeded();
  await expect(page.locator("#chapter-one[data-chapter-ready]")).toBeAttached();
}

const shipyard = (page: Page) => page.locator("[data-composition='shipyard']");
const articles = (page: Page) => page.locator("[data-composition='articles']");
const plan = (page: Page) => page.locator(".site-blueprint");
const yardCrew = (page: Page) => shipyard(page).locator("[data-chapter-crew]");
const signCrew = (page: Page) => articles(page).locator("[data-chapter-crew]");
const job = (page: Page, id: (typeof PARTS)[number]["id"]) => page.getByRole("checkbox", { name: PARTS.find((part) => part.id === id)!.job });
const launchButton = (page: Page) => shipyard(page).locator("[data-chapter-control='launch'] button");
const nameField = (page: Page) => page.getByRole("textbox", { name: ARTICLES.name });
const tradeField = (page: Page) => page.getByRole("combobox", { name: ARTICLES.trade });
const oath = (page: Page) => page.getByRole("checkbox", { name: ARTICLES.oath });
const signButton = (page: Page) => page.getByRole("button", { name: ARTICLES.sign });

/**
 * Opens a composition's Code sheet: each thing HX does over its line of code, the site's part, the
 * source, and focus back on close. No line of code runs off the panel's edge.
 */
async function opensCodeSheet(page: Page, composition: (page: Page) => ReturnType<typeof shipyard>, sheet: { title: string; hx: readonly { text: string; code: string }[]; site: readonly string[] }): Promise<void> {
  const errors = diagnostics(page);
  await open(page);
  const button = composition(page).getByRole("button", { name: CHAPTER_ONE.code });
  await button.click();
  const dialog = page.getByRole("dialog", { name: sheet.title });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: CODE_SHEETS.hxHeading })).toBeVisible();
  for (const line of [...sheet.hx.map((each) => each.text), ...sheet.site]) await expect(dialog.getByText(line, { exact: true })).toBeVisible();
  const code = dialog.locator("[data-chapter-code]");
  expect(await code.allTextContents()).toEqual(sheet.hx.map((each) => each.code));
  for (const line of await code.all()) {
    await expect(line).toBeVisible();
    expect(await line.evaluate((element) => element.scrollWidth <= element.clientWidth && element.getBoundingClientRect().right <= element.closest("[role='dialog']")!.getBoundingClientRect().right)).toBe(true);
  }
  await expect(dialog.getByRole("link", { name: new RegExp(CODE_SHEETS.source) })).toHaveAttribute("href", /\/tree\/main\/site\/src\/voyage\/chapters$/);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(button).toBeFocused();
  expect(errors).toEqual([]);
}

async function buildAll(page: Page): Promise<void> {
  for (const part of PARTS) await job(page, part.id).click();
}

async function chooseTrade(page: Page, label: string): Promise<void> {
  await tradeField(page).click();
  await page.getByRole("option", { name: label }).click();
}

async function signOn(page: Page, name: string, trade = "Engineer"): Promise<void> {
  await nameField(page).fill(name);
  await chooseTrade(page, trade);
  await oath(page).click();
  await signButton(page).click();
}

/** The jobs' rows as the checklist shows them, top to bottom: the job and its day. */
const jobRows = (page: Page) => shipyard(page).locator("[data-chapter-control='jobs'] [data-ouro-part='row']").allTextContents();


test.describe("each control in Chapter I", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("control: shipyard-code opens the shipyard's Code sheet, which says what is HX's and what is the site's", async ({ page }) => {
    await opensCodeSheet(page, shipyard, CODE_SHEETS.shipyard);
  });

  test("control: articles-code opens the articles' Code sheet, which says what is HX's and what is the site's", async ({ page }) => {
    await opensCodeSheet(page, articles, CODE_SHEETS.articles);
  });

  test("control: order moves a job, the days follow, and Conseil judges the plan", async ({ page }) => {
    await open(page);
    // The yard starts with the lantern first.
    expect((await jobRows(page))[0]).toContain(PARTS[3].job);
    const handle = page.getByRole("button", { name: /^Reorder Double hull/ });
    await handle.click();
    await page.getByRole("menuitem", { name: "Move to top" }).click();
    await expect.poll(async () => (await jobRows(page))[0]).toContain(PARTS[0].job);
    expect((await jobRows(page))[0]).toContain(SHIPYARD.day(1));
    await expect(yardCrew(page)).toContainText(YARD.inOrder.text);
    // From the keyboard: pick the organ up, carry it to the top, drop it.
    await page.getByRole("button", { name: /^Reorder Organ/ }).focus();
    await page.keyboard.press("Space");
    for (let step = 0; step < 4; step++) await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Space");
    await expect.poll(async () => (await jobRows(page))[0]).toContain(PARTS[4].job);
    await expect(yardCrew(page)).toContainText(YARD.outOfOrder.organ.text);
  });

  test("control: jobs tick a job, the plan draws its part, the bar fills and the crew says so", async ({ page }) => {
    await open(page);
    const progress = shipyard(page).getByRole("progressbar", { name: SHIPYARD.progress });
    await expect(progress).toHaveAttribute("aria-valuenow", "0");
    await expect(plan(page).locator("[data-part='hull']")).toHaveCSS("opacity", "0.14");
    await job(page, "lantern").click();
    await expect(yardCrew(page)).toContainText(YARD.noHull("Lantern").text);
    await job(page, "hull").click();
    await expect(plan(page)).toHaveAttribute("data-built", "lantern hull");
    await expect(plan(page).locator("[data-part='hull']")).toHaveCSS("opacity", "1");
    await expect(plan(page)).toHaveAttribute("aria-label", /Drawn so far: double hull, lantern\./);
    await expect(progress).toHaveAttribute("aria-valuenow", "40");
    await expect(yardCrew(page)).toContainText(YARD.built.hull.text);
    await job(page, "hull").click();
    await expect(plan(page)).toHaveAttribute("data-built", "lantern");
    await expect(yardCrew(page)).toContainText(YARD.undone("Double hull").text);
  });

  test("control: launch is off until every job is done, then floats the ship, and builds her again", async ({ page }) => {
    await open(page);
    await expect(launchButton(page)).toBeDisabled();
    await expect(shipyard(page).locator("[data-chapter-launch-hint]")).toHaveText(SHIPYARD.launchHint(5));
    await buildAll(page);
    await expect(yardCrew(page)).toContainText(YARD.ready.text);
    await expect(launchButton(page)).toBeEnabled();
    await expect(launchButton(page)).toHaveText(SHIPYARD.launch);
    await launchButton(page).click();
    await expect(plan(page)).toHaveAttribute("data-launched", "");
    await expect(plan(page)).toHaveAttribute("aria-label", "The Nautilus, built and afloat.");
    await expect(plan(page).locator(".bp-grid")).toHaveCSS("opacity", "0");
    await expect(shipyard(page).locator("[data-chapter-afloat]")).toHaveText(SHIPYARD.afloat);
    await expect(plan(page).locator(".bp-mooring")).toHaveCSS("opacity", "0");
    await expect(yardCrew(page)).toContainText(YARD.launch.text);
    await expect(launchButton(page)).toHaveText(SHIPYARD.again);
    await expect(shipyard(page).locator("[data-chapter-cheer] [data-ouro='avatar']")).toHaveCount(CREW.length);
    await launchButton(page).click();
    await expect(plan(page)).not.toHaveAttribute("data-launched", "");
    await expect(plan(page)).toHaveAttribute("data-built", "");
    await expect(shipyard(page).locator("[data-chapter-afloat]")).toHaveCount(0);
    await expect(yardCrew(page)).toContainText(YARD.again.text);
    // Launch waits for the work again, and focus is where the next build starts.
    await expect(launchButton(page)).toBeDisabled();
    await expect(job(page, "lantern")).toBeFocused();
  });

  test("control: name is required, a blank name and a name already aboard are refused under the field", async ({ page }) => {
    await open(page);
    await signButton(page).click();
    await expect(nameField(page)).toHaveAttribute("aria-invalid", "true");
    await expect(nameField(page)).toBeFocused();
    await expect(signCrew(page)).toContainText(SIGN.needName.text);
    // Spaces pass the browser's check, but are no name: the site refuses it under the field.
    await signOn(page, "   ", "Cook");
    await expect(nameField(page)).toHaveAccessibleDescription(new RegExp(ARTICLES.blank.replace(".", "\\.")));
    await expect(nameField(page)).toBeFocused();
    await expect(articles(page).locator("[data-chapter-aboard]")).toHaveText(ARTICLES.aboard(CREW.length));
    await expect(page.getByRole("list", { name: ARTICLES.roster }).getByRole("listitem")).toHaveCount(CREW.length);
    await nameField(page).fill("Ned Land");
    await signButton(page).click();
    await expect(nameField(page)).toHaveAccessibleDescription(new RegExp(ARTICLES.taken("Ned Land").replace(".", "\\.")));
    await expect(nameField(page)).toBeFocused();
    await expect(signCrew(page)).toContainText(SIGN.mine("Ned Land").text);
    await expect(articles(page).locator("[data-chapter-aboard]")).toHaveText(ARTICLES.aboard(CREW.length));
    // Changing the field clears its message.
    await nameField(page).fill("Ada");
    await expect(nameField(page)).not.toHaveAttribute("aria-invalid", "true");
  });

  test("control: trade is required, and takes the trade you choose", async ({ page }) => {
    await open(page);
    await nameField(page).fill("Ada");
    await oath(page).click();
    await signButton(page).click();
    await expect(tradeField(page)).toHaveAttribute("aria-invalid", "true");
    await expect(signCrew(page)).toContainText(SIGN.refuse(["trade"]).text);
    await chooseTrade(page, "Cabin boy or girl");
    await expect(tradeField(page)).toHaveText(/Cabin boy or girl/);
    await expect(tradeField(page)).not.toHaveAttribute("aria-invalid", "true");
  });

  test("control: oath must be ticked before you can sign", async ({ page }) => {
    await open(page);
    await nameField(page).fill("Ada");
    await chooseTrade(page, "Cook");
    await signButton(page).click();
    await expect(oath(page)).toHaveAttribute("aria-invalid", "true");
    await expect(signCrew(page)).toContainText(SIGN.refuse(["oath"]).text);
    await expect(articles(page).locator("[data-chapter-aboard]")).toHaveText(ARTICLES.aboard(CREW.length));
    await oath(page).click();
    await expect(oath(page)).toBeChecked();
    await signButton(page).click();
    await expect(articles(page).locator("[data-chapter-aboard]")).toHaveText(ARTICLES.aboard(CREW.length + 1));
  });

  test("control: sign puts you on the crew list with your trade, and the crew says welcome", async ({ page }) => {
    await open(page);
    await expect(signCrew(page)).toContainText(SIGN.opening.text);
    const toasts = await watchToasts(page, { selector: "[data-composition='articles'] [data-chapter-control='leave'] button", kind: "row" });
    await signOn(page, "Ada Lovelace");
    const roster = page.getByRole("list", { name: ARTICLES.roster });
    await expect(roster.getByText("Ada Lovelace")).toBeVisible();
    await expect(roster.getByText(ARTICLES.you, { exact: true })).toBeVisible();
    await expect(roster.getByText("Engineer", { exact: true })).toBeVisible();
    await expect(articles(page).locator("[data-chapter-aboard]")).toHaveText(ARTICLES.aboard(CREW.length + 1));
    await expect(signCrew(page)).toContainText(SIGN.welcome("Ada Lovelace", "Engineer").text);
    await expect.poll(toasts.titles).toContain(ARTICLES.signed("Ada Lovelace"));
    // The articles are blank again for the next hand, and focus is on your row, clear of the toast.
    await expect(nameField(page)).toHaveValue("");
    const leave = articles(page).getByRole("button", { name: ARTICLES.leave });
    await expect(leave).toBeFocused();
    // Judged only once the toast has settled: it slides in from below its place.
    await expect.poll(toasts.settled).toBeGreaterThan(5);
    expect(await toasts.overlapped()).toBe(false);
  });

  test("Sign hands focus straight to your row's Leave, with nothing unfocused in between", async ({ page }) => {
    await open(page);
    await nameField(page).fill("Ada Lovelace");
    await chooseTrade(page, "Engineer");
    await oath(page).click();
    // Records each moment the page has nothing focused: after any change to the articles (a
    // microtask, before a paint) and before every frame.
    await articles(page).evaluate((box) => {
      const lost: string[] = ((window as unknown as { __lost: string[] }).__lost = []);
      const check = (when: string) => {
        if (document.activeElement === document.body || document.activeElement === null) lost.push(when);
      };
      new MutationObserver(() => check("after a change")).observe(box, { childList: true, subtree: true });
      const frame = () => {
        check("before a frame");
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    await signButton(page).click();
    const leave = articles(page).getByRole("button", { name: ARTICLES.leave });
    await expect(leave).toBeFocused();
    await expect(nameField(page)).toHaveValue("");
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(await page.evaluate(() => (window as unknown as { __lost: string[] }).__lost)).toEqual([]);
    await expect(leave).toBeFocused();
  });

  test("control: sign, while the articles are not done, has Conseil refuse politely and pencil you in", async ({ page }) => {
    await open(page);
    await nameField(page).fill("Ada");
    await signButton(page).click();
    await expect(tradeField(page)).toHaveAttribute("aria-invalid", "true");
    await expect(oath(page)).toHaveAttribute("aria-invalid", "true");
    await expect(signCrew(page)).toContainText(SIGN.refuse(["trade", "oath"]).text);
    const pencilled = articles(page).locator("[data-chapter-pending]");
    await expect(pencilled).toContainText("Ada");
    await expect(pencilled).toContainText(SIGN.waiting(["trade", "oath"]));
    await expect(pencilled).toContainText(ARTICLES.pending);
    await expect(articles(page).locator("[data-chapter-aboard]")).toHaveText(ARTICLES.aboard(CREW.length));
    await chooseTrade(page, "Cook");
    await oath(page).click();
    await signButton(page).click();
    await expect(pencilled).toHaveCount(0);
    await expect(signCrew(page)).toContainText(SIGN.welcome("Ada", "Cook").text);
  });

  test("control: sign with the name taken away again rubs out the pencilled name", async ({ page }) => {
    await open(page);
    const pencilled = articles(page).locator("[data-chapter-pending]");
    // Emptied: the browser's own check stops the signing, and the waiting row goes.
    await nameField(page).fill("Ada");
    await signButton(page).click();
    await expect(pencilled).toContainText("Ada");
    await nameField(page).fill("");
    await signButton(page).click();
    await expect(pencilled).toHaveCount(0);
    await expect(signCrew(page)).toContainText(SIGN.needName.text);
    // Spaces only: the browser lets it through, the site refuses it, and the waiting row goes.
    await nameField(page).fill("Ada");
    await signButton(page).click();
    await expect(pencilled).toContainText("Ada");
    await nameField(page).fill("   ");
    await chooseTrade(page, "Cook");
    await oath(page).click();
    await signButton(page).click();
    await expect(nameField(page)).toHaveAccessibleDescription(new RegExp(ARTICLES.blank.replace(".", "\\.")));
    await expect(pencilled).toHaveCount(0);
    await expect(signCrew(page)).toContainText(SIGN.needName.text);
  });

  test("control: leave takes you off the crew list", async ({ page }) => {
    await open(page);
    await signOn(page, "Ada");
    await articles(page).getByRole("button", { name: ARTICLES.leave }).click();
    await expect(page.getByRole("list", { name: ARTICLES.roster }).getByText("Ada", { exact: true })).toHaveCount(0);
    // Back to the articles, to sign again.
    await expect(nameField(page)).toBeFocused();
    await expect(articles(page).locator("[data-chapter-aboard]")).toHaveText(ARTICLES.aboard(CREW.length));
    await expect(signCrew(page)).toContainText(SIGN.left.text);
  });
});

test("every operable element in Chapter I is one of its listed controls, in page order", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await signOn(page, "Ada");
  const found = await page.locator("#chapter-one").evaluate((chapter) => {
    const operable = [...chapter.querySelectorAll<HTMLElement>("a[href], button, input:not([type='hidden']), select, textarea, [tabindex]:not([tabindex='-1']), [role='checkbox'], [role='combobox']")].filter((element) => element.checkVisibility());
    const loose = operable.filter((element) => !element.closest("[data-chapter-control]")).map((element) => element.outerHTML.slice(0, 120));
    const order = [...chapter.querySelectorAll("[data-chapter-control]")].map((element) => element.getAttribute("data-chapter-control"));
    return { loose, order };
  });
  expect(found.loose).toEqual([]);
  expect(found.order).toEqual([...CHAPTER_ONE_CONTROLS]);
});

test("Chapter I is in the server HTML, and its code loads only as it nears the screen", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const chunks: string[] = [];
  page.on("request", (request) => {
    if (/\/assets\/chapter-one-[\w-]+\.js$/.test(request.url())) chunks.push(request.url());
  });
  await page.goto("voyage/");
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
  await page.waitForLoadState("networkidle");
  // Readable already: the heading, the plan and the form are the server's.
  await expect(page.getByRole("heading", { name: CHAPTER_ONE.title })).toBeAttached();
  await expect(page.locator(".site-blueprint [data-part='hull']")).toBeAttached();
  await expect(page.locator("#chapter-one")).not.toHaveAttribute("data-chapter-ready", "");
  expect(chunks).toEqual([]);
  await page.locator("#chapter-one").scrollIntoViewIfNeeded();
  await expect(page.locator("#chapter-one[data-chapter-ready]")).toBeAttached();
  expect(chunks).toHaveLength(1);
});

test("X-ray outlines Chapter I's HX components", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await page.getByRole("switch", { name: "X-ray" }).click();
  const tags = page.locator("[data-ouro-inspector-outline] [data-ouro-part='tag']");
  await expect.poll(() => tags.count()).toBeGreaterThan(10);
  const names = new Set(await tags.allTextContents());
  for (const item of ["reorderable", "checklist", "progress", "form", "text-field", "select", "checkbox", "item-group", "avatar", "badge"]) expect(names, item).toContain(item);
});

test("on a phone, the shipyard and the articles work by touch, and nothing overflows", async ({ browser, browserName }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: browserName === "chromium", reducedMotion: "reduce", baseURL: test.info().project.use.baseURL! });
  const page = await context.newPage();
  const errors = diagnostics(page);
  await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const part of PARTS) await job(page, part.id).tap();
  await expect(plan(page)).toHaveAttribute("data-built", PARTS.map((part) => part.id).join(" "));
  await launchButton(page).tap();
  await expect(plan(page)).toHaveAttribute("data-launched", "");
  // The plan is above the button on a phone: Launch brings it into view to watch her float.
  await expect.poll(async () => { const box = (await plan(page).boundingBox())!; return box.y >= 56 && box.y + box.height <= 844; }).toBe(true);
  await nameField(page).tap();
  await nameField(page).fill("Ada");
  await tradeField(page).tap();
  await page.getByRole("option", { name: "Cook" }).tap();
  await oath(page).tap();
  const toasts = await watchToasts(page, { selector: "[data-composition='articles'] [data-chapter-crew]", kind: "below" });
  await signButton(page).tap();
  await expect(articles(page).locator("[data-chapter-aboard]")).toHaveText(ARTICLES.aboard(CREW.length + 1));
  // The toast never covers your row or Conseil's welcome under it.
  await expect.poll(async () => (await toasts.titles()).length).toBeGreaterThan(0);
  // Judged only once the toast has settled: it slides in from below its place.
  await expect.poll(toasts.settled).toBeGreaterThan(5);
  expect(await toasts.overlapped()).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await context.close();
});

test("under reduced motion, building, launching and signing change only colour and opacity, and nothing moves", async ({ page }) => {
  // It builds, launches and signs on, as the rail's test does: about 28 s for WebKit on a shared runner.
  test.slow();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  /**
   * Every element of the site's own in the chapter (the plan, the yard, the crew, the layout) and
   * where its transforms put it, so a jump with no transition is caught too. An HX component's
   * insides are its own: a Progress fill or a Checklist's strike-through shows its value by a
   * transform, set without a transition under reduced motion, and HX's tests hold those.
   */
  const placed = () =>
    page.locator("#chapter-one").evaluate((chapter) => {
      const marks = (window as unknown as { __marks?: WeakMap<Element, number> }).__marks ?? new WeakMap<Element, number>();
      (window as unknown as { __marks: WeakMap<Element, number> }).__marks = marks;
      let next = 0;
      const places: Record<string, string> = {};
      for (const element of [chapter, ...chapter.querySelectorAll("*")]) {
        if (element.closest("[data-ouro]")) continue;
        if (!marks.has(element)) marks.set(element, 1_000_000 + next++);
        const style = getComputedStyle(element);
        places[`${marks.get(element)}:${element.tagName}.${element.getAttribute("class") ?? ""}`] = [style.transform, style.translate, style.scale, style.rotate].join(" | ");
      }
      return places;
    });
  const before = await placed();
  await page.evaluate(() => {
    const moved: string[] = ((window as unknown as { __moved: string[] }).__moved = []);
    const allowed = /^(opacity|color|background-color|border-.*color|outline-color|fill|stroke|text-decoration-color|box-shadow|stop-color|visibility|text-decoration-line|all)$/;
    const chapter = document.getElementById("chapter-one")!;
    document.addEventListener("transitionstart", (event) => {
      if (chapter.contains(event.target as Node) && !allowed.test(event.propertyName)) moved.push(`${event.propertyName} on ${(event.target as Element).tagName}`);
    });
    document.addEventListener("animationstart", (event) => {
      if (!chapter.contains(event.target as Node)) return;
      const animation = (event.target as Element).getAnimations().find((each) => (each as CSSAnimation).animationName === event.animationName);
      const keys = (animation?.effect as KeyframeEffect | undefined)?.getKeyframes().flatMap((frame) => Object.keys(frame)) ?? [];
      for (const key of keys) if (!["offset", "easing", "composite", "computedOffset", "opacity", "color", "backgroundColor", "fill", "stroke", "strokeDashoffset"].includes(key)) moved.push(`${event.animationName}:${key}`);
    });
  });
  await buildAll(page);
  await launchButton(page).click();
  await signOn(page, "Ada");
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => (window as unknown as { __moved: string[] }).__moved)).toEqual([]);
  // No element that was there before sits anywhere else now, by transition or by a jump.
  const after = await placed();
  const jumped = Object.keys(before).filter((key) => key in after && after[key] !== before[key]).map((key) => `${key}: ${before[key]} -> ${after[key]}`);
  expect(jumped).toEqual([]);
  // The launch still shows: the ship afloat in the yard fades in.
  await expect(page.locator(".site-yard .yd-afloat")).toHaveCSS("opacity", "1");
  await expect(page.locator(".site-yard .yd-ship")).toHaveCSS("opacity", "0");
});

test("without reduced motion, each part is lowered into place and the launched ship settles into the water", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const offset = (part: string) => plan(page).locator(`[data-part='${part}']`).evaluate((group) => getComputedStyle(group).translate);
  expect(await offset("hull")).toBe("0px -6px");
  await job(page, "hull").click();
  await expect.poll(() => offset("hull")).toBe("none");
  for (const part of PARTS.slice(1)) await job(page, part.id).click();
  await launchButton(page).click();
  // She slides off the ways and rocks to rest in the water, her wake and bubbles behind her.
  const ship = plan(page).locator(".bp-ship");
  await expect(ship).toHaveCSS("animation-name", "bp-slide");
  await expect(plan(page).locator(".bp-wake path").first()).toHaveCSS("animation-name", "bp-wake");
  await expect(plan(page).locator(".bp-bubbles circle").first()).toHaveCSS("animation-name", "bp-bubble");
  await expect.poll(() => ship.evaluate((group) => getComputedStyle(group).translate)).toBe("0px 10px");
  await expect(plan(page).locator(".bp-launch")).toHaveCSS("opacity", "1");
});

test("the rail beside the chapter shows how the voyage stands, and the yard on the island grows with it", async ({ page }) => {
  // It builds, launches and signs on: a long walk for WebKit on a shared runner.
  test.slow();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const rail = page.getByRole("list", { name: EXPEDITION.label });
  const yard = page.locator(".site-yard");
  await expect(rail).toContainText(EXPEDITION.built(0));
  await expect(rail).toContainText(EXPEDITION.afloat(false));
  await expect(rail).toContainText(EXPEDITION.signed(null));
  await expect(yard.locator("[data-part='hull']")).toHaveCSS("opacity", "0.35");
  await job(page, "hull").click();
  await expect(rail).toContainText(EXPEDITION.built(1));
  await expect(yard).toHaveAttribute("data-built", "hull");
  await expect(yard.locator("[data-part='hull']")).toHaveCSS("opacity", "1");
  for (const part of PARTS.slice(1)) await job(page, part.id).click();
  await launchButton(page).click();
  await expect(rail).toContainText(EXPEDITION.afloat(true));
  await expect(yard).toHaveAttribute("data-launched", "");
  await signOn(page, "Ada", "Cook");
  await expect(rail).toContainText(EXPEDITION.signed({ name: "Ada", trade: "Cook" }));
  // The pennant flies on both ships: the one that sails off, and the one drawn afloat for reduced motion.
  for (const flag of await yard.locator(".yd-flag").all()) await expect(flag).toHaveCSS("opacity", "1");
  await expect(yard.locator(".yd-afloat")).toHaveCSS("opacity", "1");
  // Held in view beside both applications as you work down them.
  await articles(page).scrollIntoViewIfNeeded();
  const box = (await rail.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(900);
});

test.describe("by keyboard alone", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("the shipyard: Tab to each job, Space to tick it, Enter to launch, and Enter to build her again", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: /^Reorder Electric engine/ }).focus();
    for (const id of START_ORDER) {
      await page.keyboard.press("Tab");
      await expect(job(page, id)).toBeFocused();
      await page.keyboard.press("Space");
      await expect(job(page, id)).toBeChecked();
    }
    await page.keyboard.press("Tab");
    await expect(launchButton(page)).toBeFocused();
    await expect(launchButton(page)).toHaveText(SHIPYARD.launch);
    await page.keyboard.press("Enter");
    await expect(plan(page)).toHaveAttribute("data-launched", "");
    await expect(launchButton(page)).toBeFocused();
    await expect(launchButton(page)).toHaveText(SHIPYARD.again);
    await page.keyboard.press("Enter");
    await expect(plan(page)).toHaveAttribute("data-built", "");
    await expect(job(page, START_ORDER[0]!)).toBeFocused();
  });

  test("the articles: fill them in, Enter to sign, and Enter to leave", async ({ page }) => {
    await open(page);
    await nameField(page).focus();
    await page.keyboard.type("Ada");
    await page.keyboard.press("Tab");
    await expect(tradeField(page)).toBeFocused();
    await page.keyboard.press("Enter");
    const cook = page.getByRole("option", { name: "Cook" });
    await expect(cook).toBeVisible();
    // The list takes focus as it opens; then arrow down, one option at a time, until Cook is the
    // one. (WebKit can drop a key pressed in the frame the list takes focus: a move not seen is
    // pressed again.)
    await expect(page.locator("[role='listbox'] :focus, [role='listbox']:focus")).toHaveCount(1);
    const highlighted = page.locator("[role='option'][data-highlighted]");
    const now = async () => ((await highlighted.count()) ? await highlighted.textContent() : null);
    for (let step = 0; step < 12 && (await now()) !== "Cook"; step++) {
      const before = await now();
      await page.keyboard.press("ArrowDown");
      await expect.poll(now, { timeout: 1000 }).not.toBe(before).catch(() => undefined);
    }
    await expect(cook).toHaveAttribute("data-highlighted", "");
    await page.keyboard.press("Enter");
    await expect(tradeField(page)).toBeFocused();
    await expect(tradeField(page)).toHaveText(/Cook/);
    await page.keyboard.press("Tab");
    await expect(oath(page)).toBeFocused();
    await page.keyboard.press("Space");
    await expect(oath(page)).toBeChecked();
    await page.keyboard.press("Tab");
    await expect(signButton(page)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(articles(page).locator("[data-chapter-aboard]")).toHaveText(ARTICLES.aboard(CREW.length + 1));
    const leave = articles(page).getByRole("button", { name: ARTICLES.leave });
    await expect(leave).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(articles(page).locator("[data-chapter-aboard]")).toHaveText(ARTICLES.aboard(CREW.length));
    await expect(nameField(page)).toBeFocused();
    // Enter in the name field signs too, and Conseil says what is still wanting.
    await page.keyboard.type("Ada");
    await page.keyboard.press("Enter");
    await expect(signCrew(page)).toContainText(SIGN.refuse(["trade", "oath"]).text);
  });
});
