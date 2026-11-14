import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Each control is put through hover, keyboard focus and press, on the pages that show it, in both engines
// and both themes. In every state a layer drawn on ::before or ::after that takes its control's radius keeps
// the control's corner shape, an element whose classes ask for round corners is drawn round, and a switch's
// thumb stays inside its track.

const DIST = join(import.meta.dirname, "..", "dist");
const PER_PAGE = 8;

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

async function broken(page: Page, selector: string, index: number): Promise<string[]> {
  return page.evaluate(
    ([sel, i]) => {
      const el = document.querySelectorAll<HTMLElement>(sel as string)[i as number];
      if (!el) return [];
      const out: string[] = [];
      const name = `${el.dataset["ouroControl"]}/${el.dataset["ouroPart"] ?? ""}`;
      const own = getComputedStyle(el);
      if (own.borderTopLeftRadius !== "0px") {
        for (const pseudo of ["::before", "::after"] as const) {
          const layer = getComputedStyle(el, pseudo);
          if (layer.content !== "none" && layer.borderTopLeftRadius === own.borderTopLeftRadius && layer.getPropertyValue("corner-shape") !== own.getPropertyValue("corner-shape"))
            out.push(`${name} ${pseudo} is ${layer.getPropertyValue("corner-shape")}, its control ${own.getPropertyValue("corner-shape")}`);
        }
      }
      for (const round of [el, ...el.querySelectorAll<HTMLElement>("*")])
        if (round.classList.contains("[corner-shape:round]") && getComputedStyle(round).getPropertyValue("corner-shape") !== "superellipse(1)")
          out.push(`${name}: ${round.dataset["ouroPart"] ?? round.tagName.toLowerCase()} classes ask for round, drawn ${getComputedStyle(round).getPropertyValue("corner-shape")}`);
      if (el.getAttribute("role") === "switch") {
        const a = el.getBoundingClientRect();
        for (const child of el.children) {
        const b = child.getBoundingClientRect();
        if (b.width <= 1) continue;
        if (b.left < a.left - 1 || b.right > a.right + 1 || b.top < a.top - 1 || b.bottom > a.bottom + 1) out.push(`${name}: thumb leaves its track`);
        }
      }
      return out;
    },
    [selector, index] as const,
  );
}

for (const mode of ["light", "dark"] as const) {
  test(`states keep their shape on every page, ${mode}`, async ({ page }) => {
    test.setTimeout(600_000);
    page.setDefaultTimeout(5_000);
    await page.addInitScript((m) => localStorage.setItem("ouro-site-theme", JSON.stringify({ preset: "pearl", mode: m })), mode);
    const found: string[] = [];
    const selector = "[data-ouro-control]:not(a):not([href]):not([disabled]):not([aria-hidden=true]):not([data-ouro-part=hidden-input]):not([data-ouro-part=input])";
    for (const path of routes()) {
      await page.goto(path);
      await expect(page.locator("html[data-site-ready]")).toBeAttached();
      const items = await page.locator(selector).evaluateAll((els) => {
        const seen = new Set<string>();
        return els.flatMap((el, i) => {
          const r = el.getBoundingClientRect();
          const key = `${el.getAttribute("data-ouro-control")}/${el.getAttribute("data-ouro-part")}/${el.getAttribute("data-variant")}`;
          if (r.width === 0 || r.height === 0 || seen.has(key)) return [];
          seen.add(key);
          return [i];
        });
      });
      for (const i of items.slice(0, PER_PAGE)) {
        const control = page.locator(selector).nth(i);
        await control.scrollIntoViewIfNeeded();
        const box = await control.boundingBox();
        if (!box) continue;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        found.push(...(await broken(page, selector, i)).map((m) => `${path} hover: ${m}`));
        await page.mouse.down();
        found.push(...(await broken(page, selector, i)).map((m) => `${path} active: ${m}`));
        await page.mouse.move(0, 0);
        await page.mouse.up();
        await control.focus();
        found.push(...(await broken(page, selector, i)).map((m) => `${path} focus: ${m}`));
        await control.blur();
      }
    }
    expect([...new Set(found)]).toEqual([]);
  });
}
