import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// A component looks the same wherever it appears. Every page of the build is opened, in each colour mode, in
// each engine; every Ouro element (root or part) is keyed by its item, part, element, variant and state, and
// the properties that make up its shape (corner shape, radii, border widths and style, outline, shadow, and
// the corner shape of its hover layers) are compared across pages. An instance whose shape differs from the
// one the rest share is a page-level rule (a global stylesheet, a page's own CSS build) changing a component.
// A part that must sit inside its container (a switch's thumb in its track, a radio's dot in its circle) does.

const DIST = join(import.meta.dirname, "..", "dist");

function routes(): string[] {
  const found: string[] = [];
  const walk = (dir: string, path: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full, `${path}${name}/`);
      else if (name === "index.html") found.push(path);
    }
  };
  walk(DIST, "/");
  return found.filter((route) => !/^\/(storybook|r)\//.test(route)).sort();
}

interface Entry {
  key: string;
  shape: string;
}

async function collect(page: Page): Promise<{ records: Entry[]; escapes: string[] }> {
  return page.evaluate(() => {
    const state = /^data-(checked|unchecked|disabled|invalid|variant|tone|size|orientation|open|pressed|selected|shape)$/;
    const records: { key: string; shape: string }[] = [];
    const escapes: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("[data-ouro], [data-ouro-part]")) {
      const root = el.closest<HTMLElement>("[data-ouro]");
      const cs = getComputedStyle(el);
      const attrs = [...el.attributes].filter((a) => state.test(a.name)).map((a) => `${a.name}=${a.value}`).sort().join(",");
      const inGroup = el.closest("[data-ouro='button-group'], [data-ouro='scroll-area']") !== null;
      const key = `${inGroup ? "grouped " : ""}${root?.dataset["ouro"]}|${el.dataset["ouroPart"] ?? ""}|${el.tagName.toLowerCase()}|${attrs}`;
      const radii = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomLeftRadius, cs.borderBottomRightRadius];
      const rounded = radii.some((r) => parseFloat(r) > 0);
      const corner = cs.getPropertyValue("corner-shape");
      for (const pseudo of ["::before", "::after"] as const) {
        const layer = getComputedStyle(el, pseudo);
        if (layer.content === "none" || !rounded || layer.borderTopLeftRadius !== cs.borderTopLeftRadius) continue;
        if (parseFloat(layer.borderTopLeftRadius) > 0 && layer.getPropertyValue("corner-shape") !== corner) {
          escapes.push(`${key}: ${pseudo} layer is ${layer.getPropertyValue("corner-shape")} inside ${corner}`);
        }
      }
      // Item's card look comes from a prop that leaves no attribute, so its border and corner vary by design.
      const byDesign = root?.dataset["ouro"] === "item" || inGroup;
      const shape = byDesign ? "item" : [rounded ? corner : "square", cs.borderTopWidth, cs.borderTopStyle, cs.outlineStyle, cs.outlineWidth].join(" ; ");
      records.push({ key, shape });
      const contained =
        (el.getAttribute("role") === "switch" && el.dataset["ouroPart"] === "track") || el.dataset["ouroPart"] === "circle";
      if (contained) {
        const outer = el.getBoundingClientRect();
        for (const child of el.children) {
          const inner = child.getBoundingClientRect();
          if (inner.width === 0) continue;
          const slack = 1;
          if (inner.left < outer.left - slack || inner.right > outer.right + slack || inner.top < outer.top - slack || inner.bottom > outer.bottom + slack) {
            escapes.push(`${key}: ${child.tagName.toLowerCase()} ${JSON.stringify(inner)} leaves its container ${JSON.stringify(outer)}`);
          }
        }
      }
    }
    return { records, escapes };
  });
}

for (const mode of ["light", "dark"] as const) {
  test(`one shape per component on every page, ${mode}`, async ({ page, browserName }) => {
    test.setTimeout(600_000);
    await page.addInitScript((m) => localStorage.setItem("ouro-site-theme", JSON.stringify({ preset: "pearl", mode: m })), mode);
    const groups = new Map<string, Map<string, string[]>>();
    const escapes: string[] = [];
    for (const path of routes()) {
      await page.goto(path);
      await expect(page.locator("html[data-site-ready]")).toBeAttached();
      let last = "";
      await expect
        .poll(async () => {
          const now = JSON.stringify((await collect(page)).records);
          const same = now === last;
          last = now;
          return same;
        })
        .toBe(true);
      const { records, escapes: out } = await collect(page);
      escapes.push(...out.map((e) => `${path}: ${e}`));
      for (const { key, shape } of records) {
        const shapes = groups.get(key) ?? new Map<string, string[]>();
        groups.set(key, shapes);
        const where = shapes.get(shape) ?? [];
        shapes.set(shape, where);
        if (where.length < 3) where.push(path);
        else where[2] = path;
      }
    }
    const differing: string[] = [];
    for (const [key, shapes] of groups) {
      if (shapes.size < 2) continue;
      const [majority, ...rest] = [...shapes].sort((a, b) => b[1].length - a[1].length);
      for (const [shape, where] of rest) differing.push(`${key} on ${where.join(", ")} is ${shape}; elsewhere ${majority![0]}`);
    }
    console.log(`${browserName} ${mode}: ${groups.size} component states over ${routes().length} pages`);
    expect.soft(escapes, "a part leaves its container").toEqual([]);
    expect.soft(differing, "a component's shape differs from page to page").toEqual([]);
  });
}
