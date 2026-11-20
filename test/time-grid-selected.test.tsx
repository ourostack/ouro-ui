import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { commands, userEvent } from "vitest/browser";
import { TimeGrid, type TimeGridEvent } from "@/registry/ouro/components/ouro/time-grid/time-grid";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { pressTab } from "@/registry/ouro/lib/ouro/testing/tab";
import { applyThemeFixture, themeFixtures } from "./theme-fixtures.ts";

// The selected event is a deeper fill of its own colour, in every theme: the Ouro look sets the colours, and the
// shadcn themes set their own, so each fill is measured as a colour in OKLab over the page. A theme whose selected
// event blurs into the plain, hovered or pressed fill fails here.

const canvas = document.createElement("canvas");
canvas.width = canvas.height = 1;
const context = canvas.getContext("2d", { willReadFrequently: true })!;

/** Lightness in OKLab, 0 to 1, of a computed colour laid over `page`. */
function lightness(color: string, page: string): number {
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = page;
  context.fillRect(0, 0, 1, 1);
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b] = [...context.getImageData(0, 0, 1, 1).data].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
}

const zone = "America/New_York";
const at = (time: string) => `2026-03-12T${time}:00-04:00`;
const events: TimeGridEvent[] = [
  { id: "plain", title: "Plain meeting", start: at("09:00"), end: at("10:00") },
  { id: "open", title: "Open meeting", start: at("11:00"), end: at("12:00") },
];

const roots: Root[] = [];
const mounted: Element[] = [];
afterEach(async () => {
  await commands.emulateMedia({ forcedColors: "none" });
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted.splice(0)) node.remove();
  document.documentElement.classList.remove("dark");
});

async function mount() {
  const host = document.createElement("div");
  host.style.cssText = "width: 800px; background: var(--background)";
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(<TimeGrid label="Calendar" date="2026-03-12" view="day" events={events} selectedId="open" timeZone={zone} now={at("08:00")} className="h-[30rem]" />));
  const find = (name: string) => host.querySelector<HTMLElement>(`[data-ouro-event-key][aria-label^="${name}"]`)!;
  return { host, page: getComputedStyle(host).backgroundColor, plain: find("Plain meeting"), open: find("Open meeting") };
}

const settled = async (element: HTMLElement) => {
  await Promise.allSettled(element.getAnimations().map((animation) => animation.finished));
  return getComputedStyle(element).backgroundColor;
};

const themes: Array<[string, (() => () => void) | undefined]> = [["Ouro", undefined], ...Object.keys(themeFixtures).map((name): [string, () => () => void] => [name, () => applyThemeFixture(name)])];

describe.each(themes)("selected event under the %s theme", (_name, apply) => {
  it.each(["light", "dark"] as const)("is a deeper fill than the plain, hovered and pressed event in %s, with no outline", async (scheme) => {
    const remove = apply?.();
    try {
      document.documentElement.classList.toggle("dark", scheme === "dark");
      const { page, plain, open } = await mount();
      const paint = (color: string) => lightness(color, page);
      const resting = paint(await settled(plain));
      const selected = paint(await settled(open));
      await userEvent.hover(plain);
      const hover = paint(await settled(plain));
      await userEvent.hover(open);
      const selectedHover = paint(await settled(open));
      // Deeper means further from the page, in the event's own colour.
      const page_ = lightness(page, page);
      expect(Math.abs(selected - page_), "selected against the page").toBeGreaterThan(Math.abs(hover - page_));
      expect(Math.abs(selected - resting), "selected against the plain fill").toBeGreaterThanOrEqual(0.03);
      expect(Math.abs(selected - hover), "selected against hover").toBeGreaterThanOrEqual(0.015);
      expect(Math.abs(selectedHover - hover), "selected hovered against hover").toBeGreaterThanOrEqual(0.015);
      expect(getComputedStyle(open).boxShadow, "no heavy outline inside the event").toBe("none");
    } finally {
      remove?.();
    }
  });
});

describe("selected event focus and forced colours", () => {
  it("shows the keyboard ring on the selected event apart from its fill", async () => {
    const { plain, open } = await mount();
    const resting = getComputedStyle(open).backgroundColor;
    plain.focus();
    await pressTab();
    open.focus();
    const style = getComputedStyle(open);
    expect([style.outlineStyle, style.outlineOffset]).toEqual(["solid", "2px"]);
    expect(style.backgroundColor).toBe(resting);
  });

  it("keeps selected visible under forced colours, in the highlight colour", async () => {
    await commands.emulateMedia({ forcedColors: "active" });
    const { plain, open } = await mount();
    const probe = document.createElement("span");
    probe.style.backgroundColor = "Highlight";
    document.body.append(probe);
    mounted.push(probe);
    expect(getComputedStyle(open).backgroundColor).toBe(getComputedStyle(probe).backgroundColor);
    expect(getComputedStyle(plain).backgroundColor).not.toBe(getComputedStyle(open).backgroundColor);
  });
});

describe("selected background event", () => {
  const background: TimeGridEvent[] = [
    { id: "quiet", title: "Quiet block", start: at("13:00"), end: at("14:00") },
    { id: "chosen", title: "Chosen block", start: at("15:00"), end: at("16:00") },
  ];

  async function mountBackground(view: "day" | "week") {
    const host = document.createElement("div");
    host.style.cssText = "width: 800px; background: var(--background)";
    document.body.append(host);
    mounted.push(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => root.render(<TimeGrid label="Calendar" date="2026-03-12" view={view} events={[]} backgroundEvents={background} selectedId="chosen" timeZone={zone} now={at("08:00")} className="h-[30rem]" />));
    const find = (name: string) => host.querySelector<HTMLElement>(`[data-ouro-event-key][aria-label*="${name}"]`)!;
    return { page: getComputedStyle(host).backgroundColor, quiet: find("Quiet block"), chosen: find("Chosen block") };
  }

  it.each(["light", "dark"] as const)("is a deeper fill than the other background event in %s", async (scheme) => {
    document.documentElement.classList.toggle("dark", scheme === "dark");
    const { page, quiet, chosen } = await mountBackground("day");
    const gap = Math.abs(lightness(await settled(chosen), page) - lightness(await settled(quiet), page));
    expect(gap).toBeGreaterThanOrEqual(0.015);
  });

  it("widens the selected bar in a week beyond the others", async () => {
    const { quiet, chosen } = await mountBackground("week");
    const width = (element: HTMLElement) => element.querySelector<HTMLElement>("[data-ouro-time-grid-bar]")!.getBoundingClientRect().width;
    expect(width(chosen)).toBeGreaterThan(width(quiet));
  });
});
