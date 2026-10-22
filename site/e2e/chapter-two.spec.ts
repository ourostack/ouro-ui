import { expect, test, type Page } from "@playwright/test";
import { CATALOGUE, CHAPTER_TWO, CHAPTER_TWO_CONTROLS, CHART_ROOM, CLASSING, CODE_SHEETS_TWO, FINDS, MUSEUM, PLANNING, ROUTE, SPECIMENS, START_ROUTE } from "../src/voyage/chapters/chapter-two-copy";
import { arrivals, routeLeagues, SHORTEST, writeDay, writeLeagues } from "../src/voyage/chapters/route";
import { diagnostics } from "./diagnostics";
import { openChapter, opensCodeSheet, operable, watchMotion } from "./chapters";

// Chapter II, "Plan the voyage", against the production build (site-design.md, "Verification in
// CI"): each control in CHAPTER_TWO_CONTROLS has a test named "control: <id>" that operates it and
// asserts what it visibly changes (site/scripts/stage-census.test.mjs fails when one is missing),
// every operable element in the chapter is one of those controls, the chapter is server-rendered
// and loads its code (Recharts with it) only as it nears the screen, X-ray finds its HX components,
// phones work by touch, and under reduced motion nothing moves. Each control's latency is
// chapter-two.latency.spec.ts's.

const open = (page: Page) => openChapter(page, "chapter-two");
const room = (page: Page) => page.locator("[data-composition='chart-room']");
const catalogue = (page: Page) => page.locator("[data-composition='catalogue']");
const chart = (page: Page) => page.locator(".site-chart");
const roomCrew = (page: Page) => room(page).locator("[data-chapter-crew]");
const catalogueCrew = (page: Page) => catalogue(page).locator("[data-chapter-crew]");
const total = (page: Page) => room(page).locator(".site-leagues");
const dayField = (page: Page) => page.getByRole("textbox", { name: CHART_ROOM.departure });
const classify = (page: Page) => page.getByRole("combobox", { name: CATALOGUE.classify });
/** The catalogue's rows as the table shows them, top to bottom: each row's first cell, without its link's "opens in a new tab". */
const names = async (page: Page) => (await catalogue(page).locator("tbody tr th").allInnerTexts()).map((name) => name.replace(/\s*\(opens in a new tab\)$/, "").trim());

/** Moves a port to the bottom of the plan from its handle's menu. */
async function toBottom(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: new RegExp(`^Reorder ${name}`) }).click();
  await page.getByRole("menu", { name: `Reorder ${name}` }).getByRole("menuitem", { name: "Move to bottom" }).click();
}

/** Conseil's shortest way: Crespo, Atlantis, Vigo, the tunnel, the pole. */
async function planShortest(page: Page): Promise<void> {
  for (const name of ["Crespo Island", "Atlantis", "Vigo Bay", "The Red Sea tunnel", "The South Pole"]) await toBottom(page, name);
}

async function pick(page: Page, kind: string): Promise<void> {
  await classify(page).click();
  await page.getByRole("option", { name: kind, exact: true }).click();
}


// CI's WebKit paints the whole voyage slowly (this spec took minutes there on main already), and
// a press waits for the page to hold still, so every test here gets triple time in WebKit.
test.beforeEach(({ browserName }) => {
  test.slow(browserName === "webkit", "WebKit on CI paints the voyage slowly");
});

test.describe("each control in Chapter II", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("control: chart-room-code opens the chart room's Code sheet, which says what is HX's and what is the site's", async ({ page }) => {
    await opensCodeSheet(page, "chapter-two", room(page), CODE_SHEETS_TWO.chartRoom);
  });

  test("control: catalogue-code opens the catalogue's Code sheet, which says what is HX's and what is the site's", async ({ page }) => {
    await opensCodeSheet(page, "chapter-two", catalogue(page), CODE_SHEETS_TWO.catalogue);
  });

  test("control: ports moves a port, the chart redraws the route, the leagues add up and Conseil judges it", async ({ page }) => {
    await open(page);
    await expect(chart(page)).toHaveAttribute("data-route", START_ROUTE.join(" "));
    await expect(total(page)).toHaveText(writeLeagues(routeLeagues(START_ROUTE)));
    await expect(chart(page).locator("[data-port='pole'] .ch-port-number")).toHaveText("1");
    await toBottom(page, "The South Pole");
    const moved = ["vigo", "crespo", "tunnel", "atlantis", "pole"] as const;
    await expect(chart(page)).toHaveAttribute("data-route", moved.join(" "));
    await expect(chart(page).locator("[data-port='pole'] .ch-port-number")).toHaveText("5");
    await expect(total(page)).toHaveText(writeLeagues(routeLeagues(moved)));
    await expect(roomCrew(page)).toContainText(ROUTE.longer(writeLeagues(routeLeagues(moved) - SHORTEST)).text);
    // The days beside the ports follow the new order.
    const firstDay = room(page).locator("[data-chapter-control='ports'] [data-chapter-day]").first();
    await expect(firstDay).toHaveText(CHART_ROOM.sail(writeDay(arrivals(moved, "1867-11-06")[0]!)));
    // Conseil's shortest way: the counter turns, and the rail ticks the step.
    await planShortest(page);
    await expect(total(page)).toHaveText(writeLeagues(SHORTEST));
    await expect(total(page)).toHaveAttribute("data-shortest", "");
    await expect(roomCrew(page)).toContainText(ROUTE.shortest.text);
    await expect(page.getByRole("list", { name: PLANNING.label })).toContainText(PLANNING.routeDone);
  });

  test("control: ports, in the book's order, has Aronnax say so", async ({ page }) => {
    await open(page);
    for (const name of ["Crespo Island", "The Red Sea tunnel", "Vigo Bay", "Atlantis", "The South Pole"]) await toBottom(page, name);
    await expect(chart(page)).toHaveAttribute("data-route", "crespo tunnel vigo atlantis pole");
    await expect(roomCrew(page)).toContainText(ROUTE.book.text);
  });

  test("control: departure sets the day we sail, and every port's day follows", async ({ page }) => {
    await open(page);
    const days = room(page).locator("[data-chapter-control='ports'] [data-chapter-day]");
    await expect(days.first()).toHaveText(CHART_ROOM.sail("6 Nov 1867"));
    await dayField(page).fill("01/03/1868");
    await dayField(page).press("Tab");
    await expect(days.first()).toHaveText(CHART_ROOM.sail("1 Mar 1868"));
    await expect(days.last()).toHaveText(CHART_ROOM.arrive(writeDay(arrivals(START_ROUTE, "1868-03-01").at(-1)!)));
    await expect(roomCrew(page)).toContainText(ROUTE.day("1 Mar 1868").text);
    await expect(page.getByRole("list", { name: PLANNING.label })).toContainText(PLANNING.sailOn("1 Mar 1868"));
    // The calendar opens from its button and gives focus back when it closes.
    const choose = room(page).getByRole("button", { name: "Choose date" });
    await choose.click();
    const calendar = page.getByRole("dialog", { name: CHART_ROOM.departure });
    await expect(calendar).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(calendar).toBeHidden();
  });

  test("control: legs shows a bar for each leg, read from its table, and follows the plan", async ({ page }) => {
    await open(page);
    const legs = room(page).locator("[data-chapter-control='legs']");
    const table = legs.locator("[data-ouro-chart-table] tbody tr");
    await expect(table).toHaveCount(START_ROUTE.length - 1);
    await expect(table.first()).toContainText("Vigo");
    // The plot is a tab stop, and the arrow keys walk its tooltip from leg to leg.
    await legs.getByRole("application", { name: CHART_ROOM.legs }).focus();
    await expect(legs.locator("[data-ouro-chart-tooltip]")).toContainText("Vigo");
    await page.keyboard.press("ArrowRight");
    await expect(legs.locator("[data-ouro-chart-tooltip]")).toContainText("Crespo");
    await planShortest(page);
    await expect(table.first()).toContainText("Atlantis");
    await expect(legs.locator(".recharts-bar-rectangle")).toHaveCount(START_ROUTE.length - 1);
  });

  test("control: sort orders the specimens by name, class or depth", async ({ page }) => {
    await open(page);
    await expect.poll(() => names(page)).toEqual(SPECIMENS.map((each) => each.name).sort());
    await catalogue(page).getByRole("radio", { name: "Depth" }).click();
    await expect.poll(async () => (await names(page))[0]).toBe("Argonaut");
    await expect.poll(async () => (await names(page)).at(-1)).toBe("Red coral");
    await catalogue(page).getByRole("radio", { name: "Class" }).click();
    await expect.poll(async () => (await names(page))[0]).toBe("Torpedo ray");
  });

  test("control: filter shows one class, or says there is none", async ({ page }) => {
    await open(page);
    const shown = catalogue(page).locator("[data-chapter-shown]");
    await expect(shown).toHaveText(CATALOGUE.shown(SPECIMENS.length, SPECIMENS.length));
    await catalogue(page).getByRole("combobox", { name: CATALOGUE.filter }).click();
    await page.getByRole("option", { name: "Mammals" }).click();
    await expect.poll(() => names(page)).toEqual(["Dugong", "Narwhal"]);
    await expect(shown).toHaveText(CATALOGUE.shown(2, SPECIMENS.length));
    await catalogue(page).getByRole("combobox", { name: CATALOGUE.filter }).click();
    await page.getByRole("option", { name: "Crustaceans" }).click();
    await expect(catalogue(page).getByText(CATALOGUE.none)).toBeVisible();
  });

  test("control: notes show Aronnax's note when you point at a name or focus it, and the name links to more", async ({ page }) => {
    await open(page);
    const narwhal = SPECIMENS.find((each) => each.id === "narwhal")!;
    const link = catalogue(page).getByRole("link", { name: new RegExp(narwhal.name) });
    await expect(link).toHaveAttribute("href", narwhal.href);
    await expect(link).toHaveAttribute("target", "_blank");
    await link.hover();
    await expect(page.getByText(narwhal.note)).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(page.getByText(narwhal.note)).toBeHidden();
    const argonaut = SPECIMENS.find((each) => each.id === "argonaut")!;
    await catalogue(page).getByRole("link", { name: new RegExp(argonaut.name) }).focus();
    await expect(page.getByText(argonaut.note)).toBeVisible();
  });

  test("control: classify checks your class: a wrong one gets a hint, a right one joins the catalogue with a toast", async ({ page }) => {
    await open(page);
    const crab = FINDS[0];
    await expect(catalogue(page).locator("[data-chapter-find]")).toContainText(crab.clue);
    await pick(page, "Fish");
    await expect(catalogueCrew(page)).toContainText(CLASSING.wrong("Fish", crab.hint).text);
    await expect.poll(() => names(page)).toHaveLength(SPECIMENS.length);
    await pick(page, "Crustacean");
    await expect(page.getByText(CLASSING.toast("Crustacean"))).toBeVisible();
    await expect(catalogueCrew(page)).toContainText(CLASSING.right(crab.name, "Crustacean").text);
    await expect.poll(() => names(page)).toContain(crab.name);
    await expect(catalogue(page).locator("tbody tr", { hasText: crab.name })).toContainText(CATALOGUE.added);
    await expect(catalogue(page).locator("[data-chapter-find]")).toContainText(FINDS[1].clue);
    await expect(page.getByRole("list", { name: PLANNING.label })).toContainText(PLANNING.classed(1, FINDS.length));
  });

  test("control: museum opens the sheet of Nemo's treasures, and gives focus back", async ({ page }) => {
    await open(page);
    const button = catalogue(page).getByRole("button", { name: CATALOGUE.museum });
    await button.click();
    const sheet = page.getByRole("dialog", { name: MUSEUM.title });
    await expect(sheet).toBeVisible();
    for (const treasure of MUSEUM.treasures) await expect(sheet.getByText(treasure.name, { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(button).toBeFocused();
  });
});

test("every operable element in Chapter II is one of its listed controls, in page order", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const found = await operable(page, "chapter-two");
  expect(found.loose).toEqual([]);
  expect(found.order).toEqual([...CHAPTER_TWO_CONTROLS]);
});

test("Chapter II is in the server HTML, and its code, Recharts with it, loads only as it nears the screen", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const chunks: string[] = [];
  page.on("request", (request) => {
    if (/\/assets\/chapter-two-[\w-]+\.js$/.test(request.url())) chunks.push(request.url());
  });
  await page.goto("voyage/");
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: CHAPTER_TWO.title })).toBeAttached();
  await expect(page.locator(".site-chart [data-port='crespo']")).toBeAttached();
  await expect(page.locator("#chapter-two")).not.toHaveAttribute("data-chapter-ready", "");
  expect(chunks).toEqual([]);
  await page.locator("#chapter-two").scrollIntoViewIfNeeded();
  await expect(page.locator("#chapter-two[data-chapter-ready]")).toBeAttached();
  expect(chunks).toHaveLength(1);
});

test("X-ray outlines Chapter II's HX components", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await page.getByRole("switch", { name: "X-ray" }).click();
  const tags = page.locator("[data-ouro-inspector-outline] [data-ouro-part='tag']");
  await expect.poll(() => tags.count()).toBeGreaterThan(10);
  const names = new Set(await tags.allTextContents());
  for (const item of ["reorderable", "date-picker", "chart", "table", "segmented-control", "select", "combobox", "link", "badge"]) expect(names, item).toContain(item);
});

test("on a phone, the chart room and the catalogue work by touch, and nothing overflows", async ({ browser, browserName }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: browserName === "chromium", reducedMotion: "reduce", baseURL: test.info().project.use.baseURL! });
  const page = await context.newPage();
  const errors = diagnostics(page);
  await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const marker = page.locator("#chapter-two [data-chapter-marker]");
  await expect(marker.getByRole("img")).toHaveAccessibleName("0 of 3 done");
  // Conseil's shortest way, by touch: each handle's menu is a sheet on a phone.
  for (const name of ["Crespo Island", "Atlantis", "Vigo Bay", "The Red Sea tunnel", "The South Pole"]) {
    const handle = page.getByRole("button", { name: new RegExp(`^Reorder ${name}`) });
    // Desktop WebKit with touch on raises no click from a tap on the handle, which takes the
    // press for a drag; Chromium's phone profile taps it, as a phone does.
    await (browserName === "webkit" ? handle.click() : handle.tap());
    await page.getByRole("menu", { name: `Reorder ${name}` }).getByRole("menuitem", { name: "Move to bottom" }).tap();
  }
  await expect(chart(page)).toHaveAttribute("data-route", "crespo atlantis vigo tunnel pole");
  await expect(total(page)).toHaveText(writeLeagues(SHORTEST));
  // The chapter's marker holds under the header while the chapter is on screen, its count ticked.
  await expect(marker).toBeVisible();
  await expect(marker.getByRole("img")).toHaveAccessibleName("1 of 3 done");
  await catalogue(page).scrollIntoViewIfNeeded();
  await expect.poll(async () => (await marker.boundingBox())!.y).toBeLessThan(80);
  // On a phone the Combobox is a button that opens a sheet of the classes.
  await catalogue(page).getByRole("button", { name: CATALOGUE.classify }).tap();
  // The same in desktop WebKit: its emulated tap on an option closes the list before it picks.
  const option = page.getByRole("option", { name: "Crustacean", exact: true });
  await (browserName === "webkit" ? option.click() : option.tap());
  await expect(catalogueCrew(page)).toContainText(CLASSING.right(FINDS[0].name, "Crustacean").text);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await context.close();
});

test("under reduced motion, planning and classing change only colour and opacity, and nothing moves", async ({ page }) => {
  test.slow();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const moved = await watchMotion(page, "chapter-two");
  await planShortest(page);
  await pick(page, "Crustacean");
  await page.waitForTimeout(600);
  expect(await moved()).toEqual([]);
  // The new route still shows: it fades in whole.
  await expect(chart(page).locator(".ch-route")).toHaveCSS("animation-name", "ch-fade");
});

test("without reduced motion, a new route draws itself across the chart", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await toBottom(page, "The South Pole");
  await expect(chart(page).locator(".ch-route")).toHaveCSS("animation-name", "ch-draw");
});

test.describe("by keyboard alone", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("the chart room: pick a port up, carry it, drop it; type the day", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: /^Reorder Crespo Island/ }).focus();
    await page.keyboard.press("Space");
    for (let step = 0; step < 2; step++) await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Space");
    await expect(chart(page)).toHaveAttribute("data-route", "crespo pole vigo tunnel atlantis");
    await dayField(page).focus();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("24/12/1867");
    await page.keyboard.press("Enter");
    await expect(room(page).locator("[data-chapter-day]").first()).toHaveText(CHART_ROOM.sail("24 Dec 1867"));
  });

  test("the catalogue: sort with the arrow keys, and class a find by typing", async ({ page }) => {
    await open(page);
    await catalogue(page).getByRole("radio", { name: "Name" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(catalogue(page).getByRole("radio", { name: "Class" })).toBeChecked();
    await classify(page).focus();
    await page.keyboard.type("Crus");
    await expect(page.getByRole("option", { name: "Crustacean", exact: true })).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(catalogueCrew(page)).toContainText(CLASSING.right(FINDS[0].name, "Crustacean").text);
  });
});
