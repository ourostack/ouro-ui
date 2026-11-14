import { expect, test, type Page } from "@playwright/test";
import { describe, LOOK_SELECTOR, Looks, picture, quiet, routes, settled } from "./looks";

// Every control, as each page shows it, is put through hover, keyboard focus and press, in both engines and
// both themes. Controls are deduped by component, part, variant, size and checked or disabled state, and a
// look is taken from at most SAMPLES pages, so the cost stays flat as pages are added. In every state a
// layer drawn on ::before or ::after that takes its control's radius keeps the control's corner shape, an
// element whose classes ask for round corners is drawn round, a switch's thumb stays inside its track, and
// the control's look (shape, box, padding, gap, colours, font, shadow, opacity, transform and its children's
// geometry, and a picture of it) is the one the other pages give it in the same state.

const SAMPLES = 3;
const CONTROL = "[data-ouro-control]:not(a):not([href]):not([disabled]):not([aria-hidden=true]):not([data-ouro-part=hidden-input]):not([data-ouro-part=input])";

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
  test(`states keep their look on every page, ${mode}`, async ({ page, browserName }) => {
    test.setTimeout(1_500_000);
    page.setDefaultTimeout(5_000);
    await page.addInitScript((m) => localStorage.setItem("ouro-site-theme", JSON.stringify({ preset: "pearl", mode: m })), mode);
    const found: string[] = [];
    const looks = new Looks();
    const taken = new Map<string, number>();
    for (const path of routes()) {
      await page.goto(path);
      await settled(page);
      await quiet(page);
      const { looks: rest } = await page.evaluate(describe, { selector: LOOK_SELECTOR });
      const candidates = await page.evaluate(
        ([all, control]) =>
          [...document.querySelectorAll<HTMLElement>(all as string)].flatMap((el, i) => {
            const r = el.getBoundingClientRect();
            return el.matches(control as string) && r.width > 0 && r.height > 0 ? [i] : [];
          }),
        [LOOK_SELECTOR, CONTROL] as const,
      );
      for (const i of candidates) {
        const key = rest.find((l) => l.index === i)?.key;
        if (!key || (taken.get(key) ?? 0) >= SAMPLES) continue;
        taken.set(key, (taken.get(key) ?? 0) + 1);
        const control = page.locator(LOOK_SELECTOR).nth(i);
        await control.evaluate((el) => el.scrollIntoView({ block: "center", inline: "center" }));
        const box = await control.boundingBox();
        if (!box) continue;
        const record = async (state: string, pseudo: string) => {
          if (!(await control.evaluate((el, p) => el.matches(p), pseudo))) return;
          found.push(...(await broken(page, LOOK_SELECTOR, i)).map((m) => `${path} ${state}: ${m}`));
          const { looks: now } = await page.evaluate(describe, { selector: LOOK_SELECTOR, only: i });
          const look = now[0];
          if (!look) return;
          const tagged = { ...look, key: `${look.key}|${state}` };
          looks.add(path, tagged, tagged.pictured && looks.wants(tagged) ? await picture(page, i) : null);
        };
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await record("hover", ":hover");
        await page.mouse.down();
        await record("active", ":active");
        await page.mouse.move(0, 0);
        await page.mouse.up();
        await page.keyboard.press("Shift");
        await control.focus();
        await record("focus", ":focus-visible");
        await control.blur();
      }
    }
    console.log(`${browserName} ${mode}: ${looks.keys} control states, ${looks.crops} pictures`);
    expect.soft([...new Set(found)], "a control leaves its shape in a state").toEqual([]);
    expect.soft(looks.differences(), "a control's properties differ from page to page in a state").toEqual([]);
    expect.soft(looks.pixelDifferences(), "a control's picture differs from page to page in a state").toEqual([]);
  });
}
