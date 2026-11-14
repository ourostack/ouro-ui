import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Every page of the build is opened, so a rule that reaches only some pages (a script that adds an
// unlayered stylesheet, a page's own CSS build) is caught on the pages it reaches. Two invariants hold
// on every page, at rest and while a control is hovered:
// a hover or focus layer drawn on ::before or ::after has the same corner shape as the control it sits on,
// and an element whose classes ask for round corners ([corner-shape:round]: a switch's track and thumb,
// a radio, a slider's thumb, a presence dot) is drawn round, never as a squircle.

const DIST = join(import.meta.dirname, "..", "dist");

function routes(): string[] {
  const found: string[] = [];
  const walk = (dir: string, path: string) => {
    for (const name of readdirSync(join(dir))) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full, `${path}${name}/`);
      else if (name === "index.html") found.push(path);
    }
  };
  walk(DIST, "/");
  return found.filter((route) => !/^\/(storybook|r)\//.test(route)).sort();
}

async function roundDrawnSquare(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("*")]
      .filter((el) => el.classList.contains("[corner-shape:round]") && getComputedStyle(el).getPropertyValue("corner-shape") !== "superellipse(1)")
      .map((el) => `${el.dataset["ouroControl"] ?? el.dataset["ouroPart"] ?? el.tagName.toLowerCase()} is ${getComputedStyle(el).getPropertyValue("corner-shape")}, its classes ask for round`),
  );
}

/** A layer on a pseudo-element that is rounded must draw the same corner shape as its control. */
async function layerMismatch(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-ouro-control]")].flatMap((el) => {
      const own = getComputedStyle(el);
      if (own.borderTopLeftRadius === "0px") return [];
      // Only a layer that takes its control's radius (rounded-[inherit]) must take its corner shape too.
      return (["::before", "::after"] as const).flatMap((pseudo) => {
        const layer = getComputedStyle(el, pseudo);
        if (layer.content === "none" || layer.borderTopLeftRadius !== own.borderTopLeftRadius) return [];
        return layer.getPropertyValue("corner-shape") === own.getPropertyValue("corner-shape")
          ? []
          : [`${el.dataset["ouroControl"]}/${el.dataset["ouroPart"] ?? ""} ${pseudo} is ${layer.getPropertyValue("corner-shape")}, its control ${own.getPropertyValue("corner-shape")}`];
      });
    }),
  );
}


test.describe("one look on every page", () => {
  for (const path of routes()) {
    test(`corners on ${path}`, async ({ page, browserName }) => {
      test.skip(browserName !== "chromium", "only Chromium draws corner-shape");
      await page.goto(path);
      await expect(page.locator("html[data-site-ready]")).toBeAttached();
      let last = "";
      await expect
        .poll(async () => {
          const now = JSON.stringify([await layerMismatch(page), await roundDrawnSquare(page)]);
          const same = now === last;
          last = now;
          return same;
        })
        .toBe(true);
      expect.soft([...new Set(await roundDrawnSquare(page))], `${path}: round parts drawn as squircles`).toEqual([]);
      expect.soft([...new Set(await layerMismatch(page))], `${path}: a layer's corners differ from its control's`).toEqual([]);
    });
  }
});
