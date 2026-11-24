import { expect, test, type Page } from "@playwright/test";
import { siteReady } from "./ready";

// The site's corners are squircles. A corner that is round, where the browser can draw a squircle, is a corner the
// design language doesn't use (ourostack/ouro-ui#2790). The base's own exceptions stay round: a switch, a radio, a
// slider thumb, a presence dot and a spinner,
// and Tailwind's rounded-full, which the base draws round.

const PAGES = ["", "nautilus/", "docs/", "docs/button/", "docs/dialog/", "docs/message-list/", "apple/", "ax/", "current/"];

/** The elements that are round on purpose. */
const ROUND_ON_PURPOSE = [
  "[role='switch']",
  "[role='switch'] *",
  "[role='radio']",
  "[role='radio'] *",
  "[role='slider'] *",
  "[data-ouro='switch'] *",
  "[data-ouro='spinner']",
  "[data-ouro='spinner'] *",
  "[data-ouro-part='dot']",
  "[data-ouro-part='thumb']",
  "[data-ouro-round]",
  // The avatar's box is the circle that encloses its squircle surface, so its shadow follows it and the presence dot may hang over it.
  "[data-ouro='avatar']",
  ".rounded-full",
  ".site-dot",
  ".site-dot *",
  ".site-window-dots > span",
].join(", ");

/** The visible elements whose corners are rounded and not drawn as a squircle, as selectors a person can find. */
async function roundCorners(page: Page): Promise<string[]> {
  return page.evaluate((exceptions) => {
    const found: string[] = [];
    for (const element of document.querySelectorAll("body *")) {
      if (element.matches(exceptions)) continue;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") continue;
      if (parseFloat(style.borderTopLeftRadius) === 0 && parseFloat(style.borderTopRightRadius) === 0 && parseFloat(style.borderBottomLeftRadius) === 0 && parseFloat(style.borderBottomRightRadius) === 0) continue;
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const shape = style.getPropertyValue("corner-shape") || "round";
      // A dot or a pill is rounded all the way: its radius reaches half its short side, so it is a circle by its geometry.
      const radius = style.borderTopLeftRadius;
      const short = Math.min(box.width, box.height);
      if ((radius.endsWith("%") ? (parseFloat(radius) / 100) * short : parseFloat(radius)) >= short / 2 - 0.5) continue;
      // Chromium computes a squircle as superellipse(2) and a round corner as superellipse(1).
      if (shape === "squircle" || shape === "superellipse(2)") continue;
      const tag = element.tagName.toLowerCase();
      const classes = typeof element.className === "string" ? element.className.trim().split(/\s+/).slice(0, 3).join(".") : "";
      found.push(`${tag}${classes ? `.${classes}` : ""} (${Math.round(box.width)}×${Math.round(box.height)}, radius ${style.borderTopLeftRadius}, corner-shape ${shape})`);
    }
    return found;
  }, ROUND_ON_PURPOSE);
}

test.describe("corners on the site", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Chromium draws corner-shape; the other engines draw the fallback");

  for (const path of PAGES) {
    for (const scheme of ["light", "dark"] as const) {
      test(`on /${path} in ${scheme}, every rounded element is a squircle`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(path);
        await siteReady(page);
        const supported = await page.evaluate(() => CSS.supports("corner-shape", "squircle"));
        expect(supported, "this browser draws a squircle, so a round corner is a choice").toBe(true);
        const round = await roundCorners(page);
        expect(round, `a corner on /${path} is round: draw it as a squircle (corner-shape: var(--ouro-corner-shape)), or mark a radio, switch, thumb, dot or spinner`).toEqual([]);
      });
    }
  }
});
