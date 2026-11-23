import { expect, test, type Locator, type Page } from "@playwright/test";
import { CATALOGUE, CHAPTER_TWO, CHAPTER_TWO_CONTROLS, CHART_ROOM, CLASSING, CODE_SHEETS_TWO, FINDS, MUSEUM, PLANNING, RADIO, RADIO_START, ROUTE, SPECIMENS, START_ROUTE } from "../src/voyage/chapters/chapter-two-copy";
import { ARTICLES, CHAPTER_ONE } from "../src/voyage/chapters/copy";
import { arrivals, routeLeagues, SHORTEST, writeDay, writeLeagues } from "../src/voyage/chapters/route";
import { diagnostics } from "./diagnostics";
import { openChapter, opensCodeSheet, operable, railStaysInView, watchMotion } from "./chapters";
import { watchToasts } from "./toasts";

// Chapter II, "Plan the voyage", against the production build (site-design.md, "Verification in
// CI"): each control in CHAPTER_TWO_CONTROLS has a test named "control: <id>" that operates it and
// asserts what it visibly changes (site/scripts/stage-census.test.mjs fails when one is missing),
// every operable element in the chapter is one of those controls, the chapter is server-rendered
// and loads its code only as it nears the screen, X-ray finds its HX components,
// phones work by touch, and under reduced motion nothing moves. Each control's latency is
// chapter-two.latency.spec.ts's.

const open = (page: Page) => openChapter(page, "chapter-two");
const room = (page: Page) => page.locator("[data-composition='chart-room']");
const catalogue = (page: Page) => page.locator("[data-composition='catalogue']");
const radio = (page: Page) => page.locator("[data-composition='radio']");
/** Sends a line on the radio from its Composer, by Enter. */
async function say(page: Page, text: string): Promise<void> {
  await radio(page).getByRole("textbox", { name: RADIO.compose }).fill(text);
  await page.keyboard.press("Enter");
}
const chart = (page: Page) => page.locator(".site-chart");
const roomCrew = (page: Page) => room(page).locator("[data-chapter-crew]");
const catalogueCrew = (page: Page) => catalogue(page).locator("[data-chapter-crew]");
const total = (page: Page) => room(page).locator(".site-leagues");
const dayField = (page: Page) => page.getByRole("textbox", { name: CHART_ROOM.departure });
const classify = (page: Page) => page.getByRole("combobox", { name: CATALOGUE.classify });
/** The catalogue's rows as the table shows them, top to bottom: each row's first cell, without its link's "opens in a new tab" and the word joiner that glues its icon on. */
const names = async (page: Page) => (await catalogue(page).locator("tbody tr th").allInnerTexts()).map((name) => name.replace(/\u2060?\s*\(opens in a new tab\)$/, "").trim());

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


test.describe("each control in Chapter II", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("control: chart-room-code opens the chart room's Code sheet, which says what is HX's and what is the site's", async ({ page }) => {
    await opensCodeSheet(page, "chapter-two", room(page), CODE_SHEETS_TWO.chartRoom);
  });

  test("the chart room's Code sheet shows the day you chose, as its DatePicker's value", async ({ page }) => {
    await open(page);
    await dayField(page).fill("1868-03-01");
    await dayField(page).press("Tab");
    await expect(roomCrew(page)).toContainText(ROUTE.day("1 Mar 1868").text);
    await room(page).getByRole("button", { name: CHAPTER_ONE.code }).click();
    const sheet = page.getByRole("dialog", { name: CODE_SHEETS_TWO.chartRoom.title });
    // real clock: the Code sheet, which stays open until it is closed.
    await expect(sheet.locator("[data-chapter-code]", { hasText: "<DatePicker" })).toHaveText(`<DatePicker label="${CHART_ROOM.departure}" value="1868-03-01" onValueChange={setDay} />`);
  });

  test("control: catalogue-code opens the catalogue's Code sheet, which says what is HX's and what is the site's", async ({ page }) => {
    await opensCodeSheet(page, "chapter-two", catalogue(page), CODE_SHEETS_TWO.catalogue);
  });

  test("control: radio-code opens the radio's Code sheet, which says what is HX's and what is the site's", async ({ page }) => {
    await opensCodeSheet(page, "chapter-two", radio(page), CODE_SHEETS_TWO.radio);
  });

  test("control: compose sends your line, the crew write back, and they react to yours", async ({ page }) => {
    await open(page);
    await expect(radio(page).getByText(RADIO_START.crew[0]!.text)).toBeVisible();
    await say(page, "Hello there");
    const box = radio(page).getByRole("textbox", { name: RADIO.compose });
    await expect(box).toHaveValue("");
    const yours = radio(page).locator("[data-ouro='message']", { hasText: "Hello there" });
    await expect(yours).toBeVisible();
    await expect(radio(page).locator("[data-ouro-message-content]", { hasText: "Good day, and welcome aboard." })).toBeVisible();
    await expect(yours.locator("[data-ouro='reaction-bar']")).toContainText("Wave, 1");
  });

  test("once you sign on in Chapter I, the captain's welcome on the radio greets you by name, until you leave the crew", async ({ page }) => {
    await openChapter(page, "chapter-one");
    const articles = page.locator("[data-composition='articles']");
    await articles.getByRole("textbox", { name: ARTICLES.name }).fill("Ana Ruiz");
    await articles.getByRole("combobox", { name: ARTICLES.trade }).click();
    await page.getByRole("option", { name: "Engineer" }).click();
    await articles.getByRole("checkbox", { name: ARTICLES.oath }).click();
    await articles.getByRole("button", { name: ARTICLES.sign }).click();
    await expect(articles.locator("[data-chapter-signed]")).toBeVisible();
    // On to the radio on the same page, so the signing is kept.
    await page.locator("#chapter-two").scrollIntoViewIfNeeded();
    await expect(page.locator("#chapter-two[data-chapter-ready]")).toBeAttached();
    const welcome = radio(page).locator("[data-ouro-message-content]").first();
    await expect(welcome).toHaveText("Welcome aboard, Ana. This is the ship's radio. Say hello to the crew.");
    await articles.getByRole("button", { name: ARTICLES.leave }).click();
    await radio(page).scrollIntoViewIfNeeded();
    await expect(welcome).toHaveText(RADIO_START.crew[0]!.text);
  });

  test("control: react puts your emoji on the crew's newest line, and takes it back", async ({ page }) => {
    await open(page);
    const newest = radio(page).locator("[data-ouro='message']", { hasText: RADIO_START.crew[2]!.text });
    const love = newest.getByRole("button", { name: "Love", exact: true });
    await love.click();
    const counted = newest.getByRole("button", { name: /^Love, 1/ });
    await expect(counted).toHaveAttribute("aria-pressed", "true");
    await counted.click();
    await expect(newest.getByRole("button", { name: /^Love, 1/ })).toHaveCount(0);
  });

  test("control: members lists who is in the crew's chat and where each of them is", async ({ page }) => {
    await open(page);
    await expect(radio(page).getByRole("heading", { level: 4, name: RADIO.crew })).toBeVisible();
    await radio(page).getByRole("button", { name: "4 members" }).click();
    const list = page.getByRole("dialog", { name: "Members" });
    // real clock: the member list, which stays open until it is closed.
    await expect(list).toContainText("Ned Land");
    // real clock: the member list, which stays open until it is closed.
    await expect(list).toContainText(RADIO.presence["Ned Land"].label);
    await page.keyboard.press("Escape");
    await expect(list).toBeHidden();
    await expect(radio(page).getByRole("button", { name: "4 members" })).toBeFocused();
  });

  test("control: channels switches who you talk to, and someone new calls once you mention the squid", async ({ page }) => {
    await open(page);
    const list = radio(page).getByRole("list", { name: RADIO.channels });
    // The crew's group chat names the captain too, so his own row is the one without the crew's title.
    await list.getByRole("button", { name: new RegExp(RADIO.captain) }).filter({ hasNotText: RADIO.crew }).click();
    await expect(radio(page).getByRole("region", { name: RADIO.list(RADIO.captain) })).toBeVisible();
    await expect(list.getByRole("button", { name: new RegExp(RADIO.caller) })).toHaveCount(0);
    await say(page, "Any squid out there?");
    await expect(list.getByRole("button", { name: new RegExp(RADIO.caller) })).toBeVisible();
    await list.getByRole("button", { name: new RegExp(RADIO.caller) }).click();
    await expect(radio(page).getByText(RADIO_START.caller[2]!.text)).toBeVisible();
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
  });

  test("control: ports, in Conseil's shortest order, turns the counter and ticks the rail", async ({ page }) => {
    await open(page);
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
    await expect(days.first()).toHaveText(CHART_ROOM.sail("1867-11-06"));
    await dayField(page).fill("1868-03-01");
    await dayField(page).press("Tab");
    // The field and the list write the day the same way, year first.
    await expect(dayField(page)).toHaveValue("1868-03-01");
    await expect(days.first()).toHaveText(CHART_ROOM.sail("1868-03-01"));
    await expect(days.last()).toHaveText(CHART_ROOM.arrive(writeDay(arrivals(START_ROUTE, "1868-03-01").at(-1)!)));
    await expect(roomCrew(page)).toContainText(ROUTE.day("1 Mar 1868").text);
    await expect(page.getByRole("list", { name: PLANNING.label })).toContainText(PLANNING.sailOn("1 Mar 1868"));
    // The calendar opens from its button and gives focus back when it closes.
    const choose = room(page).getByRole("button", { name: "Choose date" });
    await choose.click();
    const calendar = page.getByRole("dialog", { name: CHART_ROOM.departure });
    // real clock: the departure calendar, which stays open until a day is picked.
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
    await expect(legs.locator("[data-ouro-chart-bar]")).toHaveCount(START_ROUTE.length - 1);
    // Each leg's label is HTML under its bar, not the chart's SVG text (useAxisLabels).
    await expect(legs.locator("[data-chapter-axis]")).toContainText("Atlantis");
    await expect(legs.locator("[data-ouro-chart-tick]").first()).toBeHidden();
  });

  test("control: sort orders the specimens by name, group or depth", async ({ page }) => {
    await open(page);
    await expect.poll(() => names(page)).toEqual(SPECIMENS.map((each) => each.name).sort());
    await catalogue(page).getByRole("radio", { name: "Depth" }).click();
    await expect.poll(async () => (await names(page))[0]).toBe("Argonaut");
    await expect.poll(async () => (await names(page)).at(-1)).toBe("Red coral");
    await catalogue(page).getByRole("radio", { name: "Group" }).click();
    // Corals come first, then fish.
    await expect.poll(async () => (await names(page)).slice(0, 2)).toEqual(["Red coral", "Torpedo ray"]);
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
    // real clock: Aronnax's note, which stays while the name has the pointer.
    await expect(page.getByText(narwhal.note)).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(page.getByText(narwhal.note)).toBeHidden();
    const argonaut = SPECIMENS.find((each) => each.id === "argonaut")!;
    await catalogue(page).getByRole("link", { name: new RegExp(argonaut.name) }).focus();
    // real clock: Aronnax's note, which stays while the name has focus.
    await expect(page.getByText(argonaut.note)).toBeVisible();
  });

  test("control: classify checks your class: a wrong one gets a hint, a right one joins the catalogue, with no toast to repeat it", async ({ page }) => {
    await open(page);
    const crab = FINDS[0];
    await expect(catalogue(page).locator("[data-chapter-find]")).toContainText(crab.clue);
    await pick(page, "Fish");
    await expect(catalogueCrew(page)).toContainText(CLASSING.wrong("Fish", crab.hint).text);
    await expect.poll(() => names(page)).toHaveLength(SPECIMENS.length);
    const toasts = await watchToasts(page);
    await pick(page, "Crustacean");
    await expect(catalogueCrew(page)).toContainText(CLASSING.right(crab.name, "Crustacean").text);
    await expect.poll(() => names(page)).toContain(crab.name);
    await expect(catalogue(page).locator("tbody tr", { hasText: crab.name })).toContainText(CATALOGUE.added);
    await expect(catalogue(page).locator("[data-chapter-find]")).toContainText(FINDS[1].clue);
    await expect(page.getByRole("list", { name: PLANNING.label })).toContainText(PLANNING.classed(1, FINDS.length));
    // Conseil's line and the new row in the book say it: no toast says it again.
    expect(await toasts.titles()).toEqual([]);
  });

  test("control: museum opens the sheet of Nemo's treasures, and gives focus back", async ({ page }) => {
    await open(page);
    const button = catalogue(page).getByRole("button", { name: CATALOGUE.museum });
    await button.click();
    const sheet = page.getByRole("dialog", { name: MUSEUM.title });
    // real clock: the museum's sheet, which stays open until it is closed.
    await expect(sheet).toBeVisible();
    // real clock: the treasures in the museum's sheet, which stays open until it is closed.
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

test("Chapter II is in the server HTML, and its code loads only as it nears the screen", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const chunks: string[] = [];
  page.on("request", (request) => {
    if (/\/assets\/chapter-two-[\w-]+\.js$/.test(request.url())) chunks.push(request.url());
  });
  await page.goto("nautilus/");
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
  for (const item of ["reorderable", "date-picker", "chart", "table", "segmented-control", "select", "combobox", "link", "badge", "conversation-list", "avatar", "message-list", "message", "reaction-bar", "composer"]) expect(names, item).toContain(item);
});

test("on a phone, the chart room and the catalogue work by touch, and nothing overflows", async ({ browser, browserName }) => {
  const press = (target: Locator) => target.tap();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: browserName === "chromium", reducedMotion: "reduce", baseURL: test.info().project.use.baseURL! });
  const page = await context.newPage();
  const errors = diagnostics(page);
  await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const marker = page.locator("#chapter-two [data-chapter-marker]");
  await expect(marker.getByRole("img")).toHaveAccessibleName("0 of 3 done");
  // Conseil's shortest way, by touch: each handle's menu is a sheet on a phone.
  for (const name of ["Crespo Island", "Atlantis", "Vigo Bay", "The Red Sea tunnel", "The South Pole"]) {
    await press(page.getByRole("button", { name: new RegExp(`^Reorder ${name}`) }));
    const menu = page.getByRole("menu", { name: `Reorder ${name}` });
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem", { name: "Move to bottom" }).tap();
  }
  await expect(chart(page)).toHaveAttribute("data-route", "crespo atlantis vigo tunnel pole");
  await expect(total(page)).toHaveText(writeLeagues(SHORTEST));
  // The chapter's marker holds under the header while the chapter is on screen, its count ticked.
  await expect(marker).toBeVisible();
  await expect(marker.getByRole("img")).toHaveAccessibleName("1 of 3 done");
  await catalogue(page).scrollIntoViewIfNeeded();
  await expect.poll(async () => (await marker.boundingBox())!.y).toBeLessThan(80);
  // With a coarse pointer on a narrow screen the Combobox is a button that opens a sheet of the classes.
  await catalogue(page).getByRole("button", { name: CATALOGUE.classify }).or(classify(page)).tap();
  await press(page.getByRole("option", { name: "Crustacean", exact: true }));
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

test("the chapter's picture answers the plan: once the best route is set, it fades to the atlas open at it and the globe showing it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const picture = page.locator("[data-chapter-planning] [data-chapter-picture='nautilus-library']");
  const state = picture.locator(".site-picture-state");
  await expect(picture).toHaveAttribute("data-chapter-picture-state", "nautilus-library");
  await expect(state).toHaveCSS("opacity", "0");
  await planShortest(page);
  await expect(picture).toHaveAttribute("data-chapter-picture-state", "nautilus-library-planned");
  await expect.poll(() => state.evaluate((layer) => getComputedStyle(layer).opacity)).toBe("1");
  await expect(picture.getByRole("img")).toHaveCount(1);
  await expect(picture.getByRole("img")).toHaveAccessibleName(/voyage planned/);
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
    await page.keyboard.type("1867-12-24");
    await page.keyboard.press("Enter");
    await expect(room(page).locator("[data-chapter-day]").first()).toHaveText(CHART_ROOM.sail("1867-12-24"));
  });

  test("the catalogue: sort with the arrow keys, and class a find by typing", async ({ page }) => {
    await open(page);
    await catalogue(page).getByRole("radio", { name: "Name" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(catalogue(page).getByRole("radio", { name: "Group" })).toBeChecked();
    await classify(page).focus();
    await page.keyboard.type("Crus");
    await expect(page.getByRole("option", { name: "Crustacean", exact: true })).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(catalogueCrew(page)).toContainText(CLASSING.right(FINDS[0].name, "Crustacean").text);
  });
});

test("on a laptop's screen, however short, Chapter II's rail keeps its picture and steps in view to the chapter's end", async ({ page }) => {
  await railStaysInView(page, "chapter-two", "data-chapter-planning");
});
