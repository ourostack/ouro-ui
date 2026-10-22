import { expect, type Locator, type Page } from "@playwright/test";
import { CHAPTER_ONE, CODE_SHEETS } from "../src/voyage/chapters/copy";
import { diagnostics } from "./diagnostics";

// What the chapters' end-to-end specs share: opening the voyage at a chapter once it has hydrated,
// a composition's Code sheet, and the census of operable elements.

/** Opens the voyage and scrolls to a chapter, waiting for it to hydrate. */
export async function openChapter(page: Page, id: string): Promise<void> {
  await page.goto("voyage/");
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
  await page.locator(`#${id}`).scrollIntoViewIfNeeded();
  await expect(page.locator(`#${id}[data-chapter-ready]`)).toBeAttached();
}

export interface Sheet {
  title: string;
  hx: readonly { text: string; code: string }[];
  site: readonly string[];
}

/**
 * Opens a composition's Code sheet: each thing HX does over its line of code, the site's part, the
 * source, and focus back on close. No line of code runs off the panel's edge.
 */
export async function opensCodeSheet(page: Page, chapter: string, composition: Locator, sheet: Sheet): Promise<void> {
  const errors = diagnostics(page);
  await openChapter(page, chapter);
  const button = composition.getByRole("button", { name: CHAPTER_ONE.code });
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
