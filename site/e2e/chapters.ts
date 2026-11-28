import { expect, type Locator, type Page } from "@playwright/test";
import { CHAPTER_ONE, CODE_SHEETS, codeLines, type SheetCopy } from "../src/voyage/chapters/copy";
import { diagnostics } from "./diagnostics";

// What the chapters' end-to-end specs share: opening the voyage at a chapter once it has hydrated,
// a composition's Code sheet, and the census of operable elements.

/** Opens the voyage and scrolls to a chapter, waiting for it to hydrate and for the page to stop scrolling. */
export async function openChapter(page: Page, id: string): Promise<void> {
  await page.goto("nautilus/");
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
  await page.locator(`#${id}`).scrollIntoViewIfNeeded();
  await expect(page.locator(`#${id}[data-chapter-ready]`)).toBeAttached();
  await scrollSettled(page);
}

/** Waits until the page stops scrolling: the site scrolls smoothly, and the sticky header moves with it until it lands, so a press that starts mid-scroll ends on the header's wrapper, not the control. */
export async function scrollSettled(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let last = scrollY;
        let still = 0;
        const frame = () => {
          still = scrollY === last ? still + 1 : 0;
          last = scrollY;
          if (still >= 30) resolve();
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
  );
}

/**
 * Opens a composition's Code sheet: each thing HX does over its line of code (written from the
 * exhibit as it starts), the site's part, the source, and focus back on close. No line of code runs
 * off the panel's edge.
 */
export async function opensCodeSheet<S>(page: Page, chapter: string, composition: Locator, sheet: SheetCopy<S>): Promise<void> {
  const errors = diagnostics(page);
  await openChapter(page, chapter);
  const button = composition.getByRole("button", { name: CHAPTER_ONE.code });
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

/**
 * Every operable element in a chapter that is visible, and whether each sits inside a listed
 * control; and the chapter's controls in page order.
 */
export async function operable(page: Page, chapter: string): Promise<{ loose: string[]; order: string[] }> {
  return page.locator(`#${chapter}`).evaluate((root) => {
    const found = [...root.querySelectorAll<HTMLElement>("a[href], button, input:not([type='hidden']), select, textarea, [tabindex]:not([tabindex='-1']), [role='checkbox'], [role='combobox']")].filter((element) => element.checkVisibility());
    const loose = found.filter((element) => !element.closest("[data-chapter-control]")).map((element) => element.outerHTML.slice(0, 120));
    const order = [...root.querySelectorAll("[data-chapter-control]")].map((element) => element.getAttribute("data-chapter-control")!);
    return { loose, order };
  });
}

/**
 * Watches a chapter under reduced motion: any transition or animation of something other than
 * colour or opacity is recorded, for the spec to read with `moved`.
 */
export async function watchMotion(page: Page, chapter: string): Promise<() => Promise<string[]>> {
  await page.evaluate((id) => {
    const moved: string[] = ((window as unknown as { __moved: string[] }).__moved = []);
    const allowed = /^(opacity|color|background-color|border-.*color|outline-color|fill|stroke|text-decoration-color|box-shadow|stop-color|stop-opacity|filter|visibility|text-decoration-line|all)$/;
    const root = document.getElementById(id)!;
    document.addEventListener("transitionstart", (event) => {
      if (root.contains(event.target as Node) && !(event.target as Element).closest("[data-ouro]") && !allowed.test(event.propertyName)) moved.push(`${event.propertyName} on ${(event.target as Element).tagName}`);
    });
    document.addEventListener("animationstart", (event) => {
      if (!root.contains(event.target as Node) || (event.target as Element).closest("[data-ouro]")) return;
      const animation = (event.target as Element).getAnimations().find((each) => (each as CSSAnimation).animationName === event.animationName);
      const keys = (animation?.effect as KeyframeEffect | undefined)?.getKeyframes().flatMap((frame) => Object.keys(frame)) ?? [];
      for (const key of keys) if (!["offset", "easing", "composite", "computedOffset", "opacity", "color", "backgroundColor", "fill", "stroke"].includes(key)) moved.push(`${event.animationName}:${key}`);
    });
  }, chapter);
  return () => page.evaluate(() => (window as unknown as { __moved: string[] }).__moved);
}

/**
 * On a laptop's screen, however short, a chapter's rail stays beside it: scrolled to the end of the
 * chapter's last composition, the rail's picture and steps are whole on screen, below the site's header.
 */
export async function railStaysInView(page: Page, chapter: string, rail: string): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openChapter(page, chapter);
  // 1440x540 is short enough that the rail's picture gives up some height to keep the steps on screen.
  for (const [width, height] of [
    [1440, 820],
    [1280, 720],
    [1440, 540],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.locator(`#${chapter} [data-composition]`).last().evaluate((last) => scrollBy(0, last.getBoundingClientRect().bottom - innerHeight));
    const place = await page.locator(`#${chapter} [${rail}]`).evaluate((element) => {
      const frame = element.querySelector<HTMLElement>("[data-chapter-picture]")!;
      const picture = frame.getBoundingClientRect();
      const drawn = [...frame.querySelectorAll("img")].filter((img) => img.checkVisibility()).map((img) => img.getBoundingClientRect().height);
      return {
        crops: drawn.map((each) => Math.abs(each - frame.clientHeight) <= 1),
        header: document.querySelector("[data-ouro='navbar']")!.getBoundingClientRect().bottom,
        pictureTop: picture.top,
        pictureHeight: picture.height,
        stepsBottom: element.querySelector("ol")!.getBoundingClientRect().bottom,
        screen: innerHeight,
      };
    });
    expect(place.pictureTop, `${width}x${height}: the picture's top`).toBeGreaterThanOrEqual(place.header);
    expect(place.pictureHeight, `${width}x${height}: the picture's height`).toBeGreaterThan(150);
    expect(place.stepsBottom, `${width}x${height}: the steps' bottom`).toBeLessThanOrEqual(place.screen);
    // Both states fill the frame, so they crop alike and line up when one fades to the other.
    expect(place.crops, `${width}x${height}: each state fills the picture`).toEqual([true, true]);
  }
}
