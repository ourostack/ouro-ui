import { expect, test, type Page } from "@playwright/test";
import { CHAPTER_TWO } from "../src/voyage/chapters/chapter-two-copy";
import { ARTICLES, CHAPTER_ONE, CHAPTER_ONE_CONTROLS, CODE_SHEETS, codeLines, CREW, EXPEDITION, ONWARD, PARTS, SHIPYARD, SIGN, START_ORDER, YARD, type PartId, type SheetCopy } from "../src/voyage/chapters/copy";
import { railStaysInView, scrollSettled } from "./chapters";
import { diagnostics, watchHang } from "./diagnostics";
import { watchToasts } from "./toasts";

// Chapter I, "Build the ship", against the production build (site-design.md, "Verification in
// CI"): each control in CHAPTER_ONE_CONTROLS has a test named "control: <id>" that operates it and
// asserts what it visibly changes (site/scripts/stage-census.test.mjs fails when one is missing),
// every operable element in the chapter is one of those controls, the chapter is server-rendered
// and loads its code only as it nears the screen, X-ray finds its HX components, phones work by
// touch, and under reduced motion nothing moves. Each control's latency is stage.latency.spec.ts's.

/** Opens the voyage and scrolls to Chapter I, waiting for it to hydrate. */
// A page that stops answering is paused before the test runs out of time, and where its JavaScript was is recorded (#2488).
let stopWatching = () => {};
test.beforeEach(async ({ page }) => {
  stopWatching = await watchHang(page);
});
test.afterEach(() => stopWatching());

async function open(page: Page): Promise<void> {
  await page.goto("nautilus/");
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
  await page.locator("#chapter-one").scrollIntoViewIfNeeded();
  await expect(page.locator("#chapter-one[data-chapter-ready]")).toBeAttached();
  await scrollSettled(page);
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
/** The way on to Chapter II: under the plan once she floats ("next"), and in the articles once you have signed ("signed-next"). */
const onward = (page: Page, control: "next" | "signed-next") => page.locator(`#chapter-one [data-chapter-control='${control}']`).getByRole("link", { name: ONWARD.label });

/** Presses the way on, and Chapter II's heading comes into view, with its place in the address. */
async function goesToChapterTwo(page: Page, link: ReturnType<typeof onward>): Promise<void> {
  await expect(link).toHaveAttribute("href", ONWARD.href);
  await link.click();
  await expect(page).toHaveURL(/#chapter-two$/);
  await expect(page.locator("#chapter-two").getByRole("heading", { level: 2, name: CHAPTER_TWO.title })).toBeInViewport();
}

/**
 * Opens a composition's Code sheet: each thing HX does over its line of code (written from the
 * exhibit as it starts), the site's part, the source, and focus back on close. No line of code runs
 * off the panel's edge.
 */
async function opensCodeSheet<S>(page: Page, composition: (page: Page) => ReturnType<typeof shipyard>, sheet: SheetCopy<S>): Promise<void> {
  const errors = diagnostics(page);
  await open(page);
  const button = composition(page).getByRole("button", { name: CHAPTER_ONE.code });
  await button.click();
  const dialog = page.getByRole("dialog", { name: sheet.title });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: CODE_SHEETS.hxHeading })).toBeVisible();
  for (const line of [...sheet.hx.map((each) => each.text), ...sheet.site]) await expect(dialog.getByText(line, { exact: true })).toBeVisible();
  const code = dialog.locator("[data-chapter-code]");
  expect(await code.allTextContents()).toEqual(codeLines(sheet));
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

/**
 * Waits for the field messages that are going to go, so a step starts from the layout it sees. A
 * message fades before it leaves, and the fields and Sign below it move up when it does; a press
 * that starts meanwhile is held in place (Field keeps a message's space until the press ends), which
 * the press-while-leaving test checks.
 */
async function settled(page: Page): Promise<void> {
  await expect(articles(page).locator("form [id$='-error']:not([data-invalid])")).toHaveCount(0);
}

async function chooseTrade(page: Page, label: string): Promise<void> {
  await settled(page);
  await tradeField(page).click();
  await page.getByRole("option", { name: label }).click();
}

/** Ticks the oath, once the messages above it have settled. */
async function tickOath(page: Page): Promise<void> {
  await settled(page);
  await oath(page).click();
}

/** Presses Sign, once the messages above it have settled. */
async function sign(page: Page): Promise<void> {
  await settled(page);
  await signButton(page).click();
}

async function signOn(page: Page, name: string, trade = "Engineer"): Promise<void> {
  await nameField(page).fill(name);
  await chooseTrade(page, trade);
  await tickOath(page);
  await sign(page);
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

  test("the shipyard's Code sheet shows the yard as it stands: three jobs done, and its bar reads value={60}", async ({ page }) => {
    await open(page);
    for (const id of (["hull", ...START_ORDER.filter((id) => id !== "hull")] satisfies PartId[]).slice(0, 3)) await job(page, id).click();
    await expect(shipyard(page).getByRole("progressbar", { name: SHIPYARD.progress })).toHaveAttribute("aria-valuenow", "60");
    await shipyard(page).getByRole("button", { name: CHAPTER_ONE.code }).click();
    const sheet = page.getByRole("dialog", { name: CODE_SHEETS.shipyard.title });
    // real clock: the Code sheet, which stays open until it is closed.
    await expect(sheet.locator("[data-chapter-code]", { hasText: "<Progress" })).toHaveText(`<Progress label="${SHIPYARD.progress}" value={60} showValue />`);
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
    await expect(yardCrew(page)).toContainText(YARD.hull.text);
    // A job ticked in order adds nothing the box and the plan don't show, so the line stays.
    await job(page, "windows").click();
    await expect(plan(page)).toHaveAttribute("data-built", "lantern hull windows");
    await expect(yardCrew(page)).toContainText(YARD.hull.text);
    await job(page, "hull").click();
    await expect(plan(page)).toHaveAttribute("data-built", "lantern windows");
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
    await expect(shipyard(page).locator("[data-chapter-afloat]")).toContainText(SHIPYARD.afloat);
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

  test("control: next, once she floats, takes you down to Chapter II", async ({ page }) => {
    await open(page);
    await expect(onward(page, "next")).toHaveCount(0);
    await buildAll(page);
    await launchButton(page).click();
    await expect(shipyard(page).locator("[data-chapter-afloat]")).toContainText(SHIPYARD.afloat);
    await expect(onward(page, "next")).toBeVisible();
    await goesToChapterTwo(page, onward(page, "next"));
  });

  test("control: name is required, a blank name and a name already aboard are refused under the field", async ({ page }) => {
    await open(page);
    await sign(page);
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
    await sign(page);
    await expect(nameField(page)).toHaveAccessibleDescription(new RegExp(ARTICLES.taken("Ned Land").replace(".", "\\.")));
    await expect(nameField(page)).toBeFocused();
    await expect(signCrew(page)).toContainText(SIGN.mine("Ned Land").text);
    await expect(articles(page).locator("[data-chapter-aboard]")).toHaveText(ARTICLES.aboard(CREW.length));
    // Changing the field clears its message.
    await nameField(page).fill("Ana");
    await expect(nameField(page)).not.toHaveAttribute("aria-invalid", "true");
  });

  test("control: trade is required, and takes the trade you choose", async ({ page }) => {
    await open(page);
    await nameField(page).fill("Ana");
    await tickOath(page);
    await sign(page);
    await expect(tradeField(page)).toHaveAttribute("aria-invalid", "true");
    await expect(signCrew(page)).toContainText(SIGN.refuse(["trade"]).text);
    await chooseTrade(page, "Cabin boy or girl");
    await expect(tradeField(page)).toHaveText(/Cabin boy or girl/);
    await expect(tradeField(page)).not.toHaveAttribute("aria-invalid", "true");
  });

  test("control: oath must be ticked before you can sign", async ({ page }) => {
    await open(page);
    await nameField(page).fill("Ana");
    await chooseTrade(page, "Cook");
    await sign(page);
    await expect(oath(page)).toHaveAttribute("aria-invalid", "true");
    await expect(signCrew(page)).toContainText(SIGN.refuse(["oath"]).text);
    await expect(articles(page).locator("[data-chapter-aboard]")).toHaveText(ARTICLES.aboard(CREW.length));
    await tickOath(page);
    await expect(oath(page)).toBeChecked();
    await sign(page);
    await expect(articles(page).locator("[data-chapter-aboard]")).toHaveText(ARTICLES.aboard(CREW.length + 1));
  });

  test("control: sign puts you on the crew list with your trade, and the crew says welcome, with no toast to repeat it", async ({ page }) => {
    await open(page);
    await expect(signCrew(page)).toContainText(SIGN.opening.text);
    const toasts = await watchToasts(page);
    await signOn(page, "Ana Lind");
    const roster = page.getByRole("list", { name: ARTICLES.roster });
    await expect(roster.getByText("Ana Lind")).toBeVisible();
    await expect(roster.getByText(ARTICLES.you, { exact: true })).toBeVisible();
    await expect(roster.getByText("Engineer", { exact: true })).toBeVisible();
    await expect(articles(page).locator("[data-chapter-aboard]")).toHaveText(ARTICLES.aboard(CREW.length + 1));
    await expect(signCrew(page)).toContainText(SIGN.welcome("Ana Lind", "Engineer").text);
    // The articles step aside: you are aboard, with the way on, and no empty form waits to be signed again.
    await expect(articles(page).locator("[data-chapter-signed]")).toContainText(ARTICLES.welcomeAboard("Ana Lind"));
    await expect(articles(page).getByText(ARTICLES.signAgain)).toBeVisible();
    await expect(onward(page, "signed-next")).toBeVisible();
    await expect(articles(page).locator("form")).toBeHidden();
    await expect(nameField(page)).toHaveCount(0);
    await expect(signButton(page)).toHaveCount(0);
    // Focus is on your row.
    const leave = articles(page).getByRole("button", { name: ARTICLES.leave });
    await expect(leave).toBeFocused();
    // Your row and Conseil's welcome say you signed on; no toast says it again over them. What the
    // press left for after its paint (a frame, then a task) has run, and the watcher has seen a frame since.
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(done))))));
    expect(await toasts.titles()).toEqual([]);
  });

  test("Sign hands focus straight to your row's Leave, with nothing unfocused in between", async ({ page }) => {
    await open(page);
    await nameField(page).fill("Ana Lind");
    await chooseTrade(page, "Engineer");
    await tickOath(page);
    // Records each moment the page has nothing focused: after any change to the articles (a
    // microtask, before a paint) and before every frame. And when your row's Leave comes in, whether
    // it already has focus: Sign's own commit must move it there.
    await articles(page).evaluate((box) => {
      const lost: string[] = ((window as unknown as { __lost: string[] }).__lost = []);
      const leaves: string[] = ((window as unknown as { __leaves: string[] }).__leaves = []);
      const check = (when: string) => {
        if (document.activeElement === document.body || document.activeElement === null) lost.push(when);
      };
      const LEAVE = "[data-chapter-control='leave'] button";
      new MutationObserver((records) => {
        for (const record of records)
          for (const node of record.addedNodes) {
            if (!(node instanceof Element)) continue;
            const leave = node.matches(LEAVE) ? node : node.querySelector(LEAVE);
            if (leave) leaves.push(document.activeElement === leave ? "focused" : `focus on ${document.activeElement?.textContent ?? "nothing"}`);
          }
        check("after a change");
      }).observe(box, { childList: true, subtree: true });
      const frame = () => {
        check("before a frame");
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    await sign(page);
    const leave = articles(page).getByRole("button", { name: ARTICLES.leave });
    await expect(leave).toBeFocused();
    await expect(articles(page).locator("form")).toBeHidden();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(await page.evaluate(() => (window as unknown as { __leaves: string[] }).__leaves)).toEqual(["focused"]);
    expect(await page.evaluate(() => (window as unknown as { __lost: string[] }).__lost)).toEqual([]);
    await expect(leave).toBeFocused();
  });

  test("a press on Sign lands while a message leaves under it, without waiting for the message to go", async ({ page }) => {
    // On a phone the form is one column, so a message's whole line and its gap move Sign up.
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    await nameField(page).fill("Ana");
    await tradeField(page).click();
    await page.getByRole("option", { name: "Cook" }).click();
    await signButton(page).click();
    await expect(oath(page)).toHaveAttribute("aria-invalid", "true");
    const before = (await signButton(page).boundingBox())!;
    // On a loaded machine the message's fade can end before the press below begins, and then nothing is leaving under
    // it. The page holds the fade from its first frame until the press has begun, so the press lands while it leaves.
    // It also notes what the press reached, so a failure says whether the form took it with the message still there (#2038).
    await articles(page).locator("form").evaluate((form) => {
      const held: Animation[] = [];
      const pressed: string[] = [];
      Object.assign(globalThis, { releaseLeave: () => held.forEach((animation) => animation.play()), pressed });
      new MutationObserver((records, observer) => {
        for (const record of records) {
          const element = record.target as Element;
          if (!element.matches("[id$='-error'][data-ending-style]")) continue;
          for (const animation of element.getAnimations()) {
            animation.pause();
            held.push(animation);
          }
          observer.disconnect();
        }
      }).observe(form, { attributes: true, attributeFilter: ["data-ending-style"], subtree: true });
      form.ownerDocument.addEventListener(
        "pointerdown",
        (event) => {
          const target = event.target as Element;
          const field = form.querySelector<HTMLElement>("[id$='-error']")?.closest<HTMLElement>("[data-ouro]");
          const where = `${target.tagName.toLowerCase()}${target.id ? `#${target.id}` : ""} "${(target.textContent ?? "").trim().slice(0, 30)}"`;
          pressed.push(`pressed ${where}, in the form: ${form.contains(target)}, message there: ${Boolean(field)}`);
          setTimeout(() => pressed.push(`its field's min-height: ${field?.style.minHeight || "none"}`));
        },
        { capture: true, once: true },
      );
    });
    // Ticking the oath starts its message leaving; the press on Sign begins while it does.
    await oath(page).click();
    await expect(articles(page).locator("form [id$='-error'][data-ending-style]")).toHaveCount(1);
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    try {
      await page.evaluate(() => (globalThis as unknown as { releaseLeave: () => void }).releaseLeave());
      await expect(articles(page).locator("form [id$='-error']")).toHaveCount(0);
      const pressed = await page.evaluate(() => (globalThis as unknown as { pressed: string[] }).pressed.join("; "));
      expect(Math.abs((await signButton(page).boundingBox())!.y - before.y), pressed).toBeLessThan(2);
    } finally {
      await page.mouse.up();
    }
    await expect(signCrew(page)).toContainText(SIGN.welcome("Ana", "Cook").text);
  });

  test("control: sign, while the articles are not done, has Conseil refuse politely and pencil you in", async ({ page }) => {
    await open(page);
    await nameField(page).fill("Ana");
    await sign(page);
    await expect(tradeField(page)).toHaveAttribute("aria-invalid", "true");
    await expect(oath(page)).toHaveAttribute("aria-invalid", "true");
    await expect(signCrew(page)).toContainText(SIGN.refuse(["trade", "oath"]).text);
    const pencilled = articles(page).locator("[data-chapter-pending]");
    await expect(pencilled).toContainText("Ana");
    await expect(pencilled).toContainText(SIGN.waiting(["trade", "oath"]));
    await expect(pencilled).toContainText(ARTICLES.pending);
    await expect(articles(page).locator("[data-chapter-aboard]")).toHaveText(ARTICLES.aboard(CREW.length));
    await chooseTrade(page, "Cook");
    await tickOath(page);
    await sign(page);
    await expect(pencilled).toHaveCount(0);
    await expect(signCrew(page)).toContainText(SIGN.welcome("Ana", "Cook").text);
  });

  test("control: sign with the name taken away again rubs out the pencilled name", async ({ page }) => {
    await open(page);
    const pencilled = articles(page).locator("[data-chapter-pending]");
    // Emptied: the browser's own check stops the signing, and the waiting row goes.
    await nameField(page).fill("Ana");
    await sign(page);
    await expect(pencilled).toContainText("Ana");
    await nameField(page).fill("");
    await sign(page);
    await expect(pencilled).toHaveCount(0);
    await expect(signCrew(page)).toContainText(SIGN.needName.text);
    // Spaces only: the browser lets it through, the site refuses it, and the waiting row goes.
    await nameField(page).fill("Ana");
    await sign(page);
    await expect(pencilled).toContainText("Ana");
    await nameField(page).fill("   ");
    await chooseTrade(page, "Cook");
    await tickOath(page);
    await sign(page);
    await expect(nameField(page)).toHaveAccessibleDescription(new RegExp(ARTICLES.blank.replace(".", "\\.")));
    await expect(pencilled).toHaveCount(0);
    await expect(signCrew(page)).toContainText(SIGN.needName.text);
  });

  test("control: signed-next, once you have signed, takes you down to Chapter II", async ({ page }) => {
    await open(page);
    await expect(onward(page, "signed-next")).toHaveCount(0);
    await signOn(page, "Ana");
    await expect(onward(page, "signed-next")).toBeVisible();
    await goesToChapterTwo(page, onward(page, "signed-next"));
  });

  test("control: leave takes you off the crew list", async ({ page }) => {
    await open(page);
    await signOn(page, "Ana");
    await articles(page).getByRole("button", { name: ARTICLES.leave }).click();
    await expect(page.getByRole("list", { name: ARTICLES.roster }).getByText("Ana", { exact: true })).toHaveCount(0);
    // Back to the articles, empty, to sign again, and the line that you are aboard goes.
    await expect(nameField(page)).toBeFocused();
    await expect(nameField(page)).toHaveValue("");
    await expect(articles(page).locator("[data-chapter-signed]")).toHaveCount(0);
    await expect(articles(page).locator("[data-chapter-aboard]")).toHaveText(ARTICLES.aboard(CREW.length));
    await expect(signCrew(page)).toContainText(SIGN.left.text);
  });
});

test("a job ticked before the hull is out of order: its row warns, the plan draws it as a ghost, and Launch waits until the hull is in", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  // The yard starts with the lantern first: the order is the rule, with the hull always before the rest.
  expect((await jobRows(page))[0]).toContain(PARTS[3].job);
  const row = (id: (typeof PARTS)[number]["id"]) => shipyard(page).locator("[data-chapter-control='jobs'] [data-ouro-part='row']").filter({ hasText: PARTS.find((part) => part.id === id)!.job });
  const progress = shipyard(page).getByRole("progressbar", { name: SHIPYARD.progress });
  const lantern = plan(page).locator("[data-part='lantern']");
  const hint = shipyard(page).locator("[data-chapter-launch-hint]");
  await job(page, "lantern").click();
  await expect(job(page, "lantern")).toBeChecked();
  // The row turns HX's warning tone and names the job that comes first; the box is described by it.
  await expect(row("lantern")).toHaveAttribute("data-out-of-order", "");
  await expect(row("lantern")).toContainText(SHIPYARD.first(PARTS[0].job));
  await expect(job(page, "lantern")).toHaveAccessibleDescription(new RegExp(SHIPYARD.first(PARTS[0].job)));
  // On the plan the lantern is a faint, dashed ghost, and it isn't counted as built.
  await expect(plan(page)).toHaveAttribute("data-ghost", "lantern");
  await expect(lantern).toHaveCSS("opacity", "0.5");
  await expect(lantern.locator("path").first()).toHaveCSS("stroke-dasharray", "4px, 3px");
  await expect(plan(page)).toHaveAttribute("aria-label", new RegExp(SHIPYARD.ghosts("lantern")));
  await expect(progress).toHaveAttribute("aria-valuenow", "0");
  // Launch stays off, and its hint says why. Conseil's line is the crew's one word on it.
  await expect(launchButton(page)).toBeDisabled();
  await expect(hint).toHaveText(SHIPYARD.outOfOrder(PARTS[0].job));
  await expect(launchButton(page)).toHaveAccessibleDescription(SHIPYARD.outOfOrder(PARTS[0].job));
  await expect(yardCrew(page)).toContainText(YARD.noHull("Lantern").text);
  // The hull in, the lantern settles into place.
  await job(page, "hull").click();
  await expect(row("lantern")).not.toHaveAttribute("data-out-of-order", "");
  await expect(row("lantern")).not.toContainText(SHIPYARD.first(PARTS[0].job));
  await expect(plan(page)).toHaveAttribute("data-ghost", "");
  await expect(lantern).toHaveCSS("opacity", "1");
  await expect(lantern.locator("path").first()).toHaveCSS("stroke-dasharray", "none");
  await expect(progress).toHaveAttribute("aria-valuenow", "40");
  await expect(hint).toHaveText(SHIPYARD.launchHint(3));
});

test("every operable element in Chapter I is one of its listed controls, in page order", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  // Launched and signed on, so the ways on and Leave are there too.
  await buildAll(page);
  await launchButton(page).click();
  await signOn(page, "Ana");
  const found = await page.locator("#chapter-one").evaluate((chapter) => {
    const operable = [...chapter.querySelectorAll<HTMLElement>("a[href], button, input:not([type='hidden']), select, textarea, [tabindex]:not([tabindex='-1']), [role='checkbox'], [role='combobox']")].filter((element) => element.checkVisibility());
    const loose = operable.filter((element) => !element.closest("[data-chapter-control]")).map((element) => element.outerHTML.slice(0, 120));
    const order = [...chapter.querySelectorAll("[data-chapter-control]")].map((element) => element.getAttribute("data-chapter-control"));
    return { loose, order };
  });
  expect(found.loose).toEqual([]);
  expect(found.order).toEqual([...CHAPTER_ONE_CONTROLS]);
});

test("Chapter I is in the server HTML, readable before its own chunk arrives, which loads after the page has hydrated", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const chunks: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((done) => {
    release = done;
  });
  await page.route(/\/assets\/chapter-one-[\w-]+\.js$/, async (route) => {
    chunks.push(route.request().url());
    await gate;
    await route.continue();
  });
  try {
    await page.goto("nautilus/");
    await expect(page.locator("html[data-site-ready]")).toBeAttached();
    // Readable already: the heading, the plan and the form are the server's.
    await expect(page.getByRole("heading", { name: CHAPTER_ONE.title })).toBeAttached();
    await expect(page.locator(".site-blueprint [data-part='hull']")).toBeAttached();
    await expect(page.locator("#chapter-one")).not.toHaveAttribute("data-chapter-ready", "");
    // On the Nautilus's page the chapter is near the top, so its chunk is asked for once the page is live.
    await expect.poll(() => chunks.length).toBe(1);
    release();
    await expect(page.locator("#chapter-one[data-chapter-ready]")).toBeAttached();
    expect(chunks).toHaveLength(1);
  } finally {
    release();
  }
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

/** The crew's faces, cut from the Nautilus scenes into site/public/crew/ (crew-faces.ts). */
const FACES = { "Captain Nemo": "nemo", "Professor Aronnax": "aronnax", Conseil: "conseil", "Ned Land": "ned" } as const;

/** Whether an avatar draws a picture that has loaded, and which: its path, or null for initials. */
const pictureOf = (avatar: ReturnType<Page["locator"]>) =>
  avatar.evaluate((element) => {
    const image = element.querySelector("img");
    return image && image.complete && image.naturalWidth > 0 ? new URL(image.src).pathname : null;
  });

/**
 * Whether each face in the cheer is whole: inside the cheer's box, overlapping no other face, and
 * on top at its middle and near each edge, so nothing covers any part of it.
 */
const wholeFaces = (cheer: ReturnType<Page["locator"]>) =>
  cheer.evaluate((element) => {
    const outer = element.getBoundingClientRect();
    const faces = [...element.querySelectorAll<HTMLElement>("[data-ouro='avatar']")];
    const boxes = faces.map((face) => face.getBoundingClientRect());
    return faces.map((face, index) => {
      const box = boxes[index]!;
      const inside = box.left >= outer.left - 0.5 && box.right <= outer.right + 0.5 && box.top >= outer.top - 0.5 && box.bottom <= outer.bottom + 0.5;
      const overlaps = boxes.some((other, at) => at !== index && Math.min(box.right, other.right) - Math.max(box.left, other.left) > 0.5 && Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top) > 0.5);
      const points = [[0.5, 0.5], [0.2, 0.5], [0.8, 0.5], [0.5, 0.2], [0.5, 0.8]] as const;
      const onTop = points.every(([x, y]) => face.contains(document.elementFromPoint(box.left + box.width * x, box.top + box.height * y)));
      return { inside, overlaps, onTop };
    });
  });

test("the crew's faces come from the Nautilus scenes, a newcomer keeps initials, and the cheer shows every face whole", async ({ browser }) => {
  test.slow();
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, reducedMotion: "reduce", baseURL: test.info().project.use.baseURL! });
    const page = await context.newPage();
    await open(page);
    await expect.poll(() => pictureOf(yardCrew(page).locator("[data-ouro='avatar']")), { message: `${viewport.width}px: the crew line's face` }).toBe(`/crew/${FACES[YARD.opening.name]}-96.webp`);
    const roster = page.getByRole("list", { name: ARTICLES.roster }).locator("[data-ouro='avatar']");
    for (const [index, member] of CREW.entries()) await expect.poll(() => pictureOf(roster.nth(index)), { message: `${viewport.width}px: ${member.name} on the crew list` }).toBe(`/crew/${FACES[member.name]}-192.webp`);
    await signOn(page, "Ana Lind");
    await expect(roster).toHaveCount(CREW.length + 1);
    await expect(roster.last()).toHaveAttribute("data-image", "idle");
    expect(await pictureOf(roster.last()), `${viewport.width}px: a newcomer's avatar`).toBeNull();
    await expect(roster.last().locator("[data-ouro-avatar-initials='AL']")).toBeAttached();
    await buildAll(page);
    await launchButton(page).click();
    const cheer = shipyard(page).locator("[data-chapter-cheer]");
    await cheer.scrollIntoViewIfNeeded();
    const faces = cheer.locator("[data-ouro='avatar']");
    await expect(faces).toHaveCount(CREW.length);
    for (const [index, member] of CREW.entries()) await expect.poll(() => pictureOf(faces.nth(index)), { message: `${viewport.width}px: ${member.name} in the cheer` }).toBe(`/crew/${FACES[member.name]}-96.webp`);
    await expect.poll(() => cheer.evaluate((element) => element.getAnimations({ subtree: true }).filter((animation) => animation.playState !== "finished").length)).toBe(0);
    expect(await wholeFaces(cheer), `${viewport.width}px: the cheer's faces`).toEqual(CREW.map(() => ({ inside: true, overlaps: false, onTop: true })));
    await context.close();
  }
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
  // The plan is above the button on a phone: Launch brings it into view to watch her float, whole, below the chapter's marker.
  const marker = (await page.locator("#chapter-one [data-chapter-marker]").boundingBox())!;
  await expect.poll(async () => { const box = (await plan(page).boundingBox())!; return box.y >= marker.y + marker.height && box.y + box.height <= 844; }).toBe(true);
  // The way on under the plan is a full touch target, and its line keeps clear of the ship.
  await expect(onward(page, "next")).toBeVisible();
  const next = (await onward(page, "next").boundingBox())!;
  expect(Math.min(next.width, next.height)).toBeGreaterThanOrEqual(44);
  const line = (await shipyard(page).locator("[data-chapter-afloat]").boundingBox())!;
  const ship = (await plan(page).locator(".bp-ship").boundingBox())!;
  expect(line.y).toBeGreaterThanOrEqual(ship.y + ship.height);
  await nameField(page).tap();
  await nameField(page).fill("Ana");
  await tradeField(page).tap();
  await page.getByRole("option", { name: "Cook" }).tap();
  await oath(page).tap();
  await signButton(page).tap();
  await expect(articles(page).locator("[data-chapter-aboard]")).toHaveText(ARTICLES.aboard(CREW.length + 1));
  const signedNext = (await onward(page, "signed-next").boundingBox())!;
  expect(Math.min(signedNext.width, signedNext.height)).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await context.close();
});

test("on a tablet, Launch brings the plan into view when it sits hidden under the header and the chapter's marker", async ({ browser, browserName }) => {
  const context = await browser.newContext({ viewport: { width: 768, height: 1024 }, hasTouch: true, isMobile: browserName === "chromium", reducedMotion: "reduce", baseURL: test.info().project.use.baseURL! });
  const page = await context.newPage();
  const errors = diagnostics(page);
  await open(page);
  for (const part of PARTS) await job(page, part.id).tap();
  // The drawing just under the header and the marker, out of sight, with Launch on screen.
  const bottom = (await plan(page).boundingBox())!;
  await page.evaluate((by) => window.scrollBy({ top: by, behavior: "instant" }), bottom.y + bottom.height - 80);
  await expect(launchButton(page)).toBeInViewport();
  await launchButton(page).tap();
  await expect(plan(page)).toHaveAttribute("data-launched", "");
  const marker = (await page.locator("#chapter-one [data-chapter-marker]").boundingBox())!;
  await expect.poll(async () => { const box = (await plan(page).boundingBox())!; return box.y >= marker.y + marker.height && box.y + box.height <= 1024; }).toBe(true);
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
      // Visibility only switches, so a fade can keep a link it brings in from being pressed before it shows.
      for (const key of keys) if (!["offset", "easing", "composite", "computedOffset", "opacity", "visibility", "color", "backgroundColor", "fill", "stroke", "strokeDashoffset"].includes(key)) moved.push(`${event.animationName}:${key}`);
    });
  });
  await buildAll(page);
  await launchButton(page).click();
  await signOn(page, "Ana");
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => (window as unknown as { __moved: string[] }).__moved)).toEqual([]);
  // No element that was there before sits anywhere else now, by transition or by a jump.
  const after = await placed();
  const jumped = Object.keys(before).filter((key) => key in after && after[key] !== before[key]).map((key) => `${key}: ${before[key]} -> ${after[key]}`);
  expect(jumped).toEqual([]);
  // The launch still shows, in the rail's words.
  await expect(page.getByRole("list", { name: EXPEDITION.label })).toContainText(EXPEDITION.afloat(true));
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
  // The painting she becomes waits for the slide, so it is seen before the painting covers it.
  await expect(shipyard(page).locator("[data-chapter-plan-ship]")).toHaveCSS("transition-delay", "1.2s");
  await expect.poll(() => ship.evaluate((group) => getComputedStyle(group).translate)).toBe("0px 10px");
  await expect(plan(page).locator(".bp-launch")).toHaveCSS("opacity", "1");
});

test("the rail beside the chapter shows how the voyage stands, beside the chapter's picture", async ({ page }) => {
  // It builds, launches and signs on: a long walk for WebKit on a shared runner.
  test.slow();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const rail = page.getByRole("list", { name: EXPEDITION.label });
  const picture = page.locator("[data-chapter-expedition] [data-chapter-picture='nautilus-shipyard']");
  await expect(picture).toBeVisible();
  await expect(rail).toContainText(EXPEDITION.built(0));
  await expect(rail).toContainText(EXPEDITION.afloat(false));
  await expect(rail).toContainText(EXPEDITION.signed(null));
  await job(page, "hull").click();
  await expect(rail).toContainText(EXPEDITION.built(1));
  for (const part of PARTS.slice(1)) await job(page, part.id).click();
  await launchButton(page).click();
  await expect(rail).toContainText(EXPEDITION.afloat(true));
  await signOn(page, "Ana", "Cook");
  await expect(rail).toContainText(EXPEDITION.signed({ name: "Ana", trade: "Cook" }));
  // Held in view beside both applications as you work down them.
  await articles(page).scrollIntoViewIfNeeded();
  const box = (await rail.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(900);
});

test("the chapter's picture answers the yard: once she is launched it fades to the cove with her afloat, and back when you build her again", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const picture = page.locator("[data-chapter-expedition] [data-chapter-picture='nautilus-shipyard']");
  const state = picture.locator(".site-picture-state");
  await expect(picture).toHaveAttribute("data-chapter-picture-state", "nautilus-shipyard");
  await expect(state).toHaveCSS("opacity", "0");
  // The second picture loads with the first, so it is there when she floats.
  await expect(state.locator("picture[data-brand-scene='nautilus-shipyard-afloat'] img")).toHaveAttribute("loading", "lazy");
  await buildAll(page);
  await expect(state).toHaveCSS("opacity", "0");
  await launchButton(page).click();
  await expect(picture).toHaveAttribute("data-chapter-picture-state", "nautilus-shipyard-afloat");
  await expect.poll(() => state.evaluate((layer) => getComputedStyle(layer).opacity)).toBe("1");
  // A screen reader hears the picture that shows, once.
  await expect(picture.getByRole("img")).toHaveCount(1);
  await expect(picture.getByRole("img")).toHaveAccessibleName(/launched/);
  await launchButton(page).click();
  await expect(picture).toHaveAttribute("data-chapter-picture-state", "nautilus-shipyard");
  await expect.poll(() => state.evaluate((layer) => getComputedStyle(layer).opacity)).toBe("0");
});

test("the plan becomes the ship: at the launch it fades into a painting of her afloat, and back to the plan when you build her again", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const painting = shipyard(page).locator("[data-chapter-plan-ship]");
  const opacity = () => painting.evaluate((layer) => getComputedStyle(layer).opacity);
  // It's in the server HTML and loads with the plan, unseen, so it is there when she floats.
  await expect(painting).toHaveCSS("opacity", "0");
  await expect(painting).toHaveAttribute("aria-hidden", "true");
  const day = painting.locator("picture.story-world-day img");
  await expect(day).toHaveAttribute("loading", "lazy");
  await expect(day).toHaveAttribute("alt", "");
  await buildAll(page);
  await expect(painting).toHaveCSS("opacity", "0");
  const jobsTop = async () => (await shipyard(page).locator("[data-chapter-control='jobs']").boundingBox())!.y - (await plan(page).boundingBox())!.y;
  const before = await jobsTop();
  await launchButton(page).click();
  await expect.poll(opacity).toBe("1");
  // The plan's own label says what the painting shows; the painting itself is decoration.
  await expect(plan(page)).toHaveAttribute("aria-label", "The Nautilus, built and afloat.");
  await expect(day).toBeVisible();
  await expect.poll(() => day.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  // It covers the plan exactly.
  const [art, drawing] = [(await painting.boundingBox())!, (await plan(page).boundingBox())!];
  expect(Math.abs(art.height - drawing.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(art.width - drawing.width)).toBeLessThanOrEqual(1);
  // The words that she floats sit under the painting, never over it, in a row that was kept for them: nothing below moves.
  await expect(shipyard(page).locator("[data-chapter-afloat]")).toBeVisible();
  expect((await shipyard(page).locator("[data-chapter-afloat]").boundingBox())!.y).toBeGreaterThanOrEqual(art.y + art.height);
  expect(await jobsTop()).toBe(before);
  // At night it is the same sea under the moon, its own file, and the day's is not drawn.
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  const night = painting.locator("picture.story-world-night img");
  await expect(night).toBeVisible();
  await expect(day).toBeHidden();
  await expect.poll(() => night.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await launchButton(page).click();
  await expect.poll(opacity).toBe("0");
  await expect(plan(page)).not.toHaveAttribute("data-launched", "");
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
    await page.keyboard.type("Ana");
    await page.keyboard.press("Tab");
    await expect(tradeField(page)).toBeFocused();
    await page.keyboard.press("Enter");
    const cook = page.getByRole("option", { name: "Cook" });
    await expect(cook).toBeVisible();
    // The list takes focus in the frame after it opens (Base UI queues the move for the next
    // animation frame). A loaded WebKit can paint no frame for several seconds while its scripts
    // still run, longer than an assertion waits, so wait for that frame, however late, then look.
    // Then arrow down, one option at a time, until Cook is the one. (WebKit can drop a key pressed
    // in the frame the list takes focus: a move not seen is pressed again.)
    await page.evaluate(() => new Promise((frame) => requestAnimationFrame(() => requestAnimationFrame(frame))));
    await expect(page.locator("[role='listbox'] :focus, [role='listbox']:focus")).toHaveCount(1);
    const highlighted = page.locator("[role='option'][data-highlighted]");
    const now = async () => ((await highlighted.count()) ? await highlighted.textContent() : null);
    for (let step = 0; step < 12 && (await now()) !== "Cook"; step++) {
      const before = await now();
      await page.keyboard.press("ArrowDown");
      // short poll: a key WebKit drops never moves the highlight, so each step gives up after 1 s and presses again.
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
    await page.keyboard.type("Ana");
    await page.keyboard.press("Enter");
    await expect(signCrew(page)).toContainText(SIGN.refuse(["trade", "oath"]).text);
  });
});

test("on a laptop's screen, however short, Chapter I's rail keeps its picture and steps in view to the chapter's end", async ({ page }) => {
  await railStaysInView(page, "chapter-one", "data-chapter-expedition");
});
