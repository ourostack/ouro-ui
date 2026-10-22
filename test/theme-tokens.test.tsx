import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands, page } from "vitest/browser";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { Heading } from "@/registry/ouro/components/ouro/text/heading";
import { Kbd } from "@/registry/ouro/components/ouro/kbd/kbd";
import { cleanupStories, closeOverlay, isVisible, openOverlay, openPopup, overlayOpeners, renderStory, selectedStories, settle, story } from "./stories.tsx";
import { sliced } from "./slice.ts";
import { storyScanTimeout } from "./story-axe.ts";
import { applyThemeFixture, themeFixtures, topLevelBlocks } from "./theme-fixtures.ts";

// The components take their shadows and fonts from shadcn's standard theme tokens, so a theme
// that sets them (a tweakcn export, Spoonjoy's cookbook) restyles every surface: popovers, menus,
// selects, comboboxes and navigation menus `--shadow-lg`, dialogs `--shadow-xl`, the slider thumb
// and segmented control's indicator `--shadow-sm`, sheets `--ouro-shadow-sheet-<side>` (from
// ouro-base.css), headings and titles `--font-heading`. Kbd keeps the surrounding font, as shadcn's does. Each token is set
// to a sentinel on <html> and read back from the rendered elements; no shadow anywhere may stay
// a fixed black. test/themes/ runs axe under the fixtures this file checks the shape of.

/** Each shadow token, as a 1px ring in a color nothing else uses. */
const shadowSentinels = {
  "--shadow-2xs": "rgb(1, 2, 1)",
  "--shadow-xs": "rgb(1, 2, 2)",
  "--shadow-sm": "rgb(1, 2, 3)",
  "--shadow-md": "rgb(1, 2, 4)",
  "--shadow-lg": "rgb(1, 2, 5)",
  "--shadow-xl": "rgb(1, 2, 6)",
  "--shadow-2xl": "rgb(1, 2, 7)",
  "--ouro-shadow-sheet-bottom": "rgb(1, 3, 1)",
  "--ouro-shadow-sheet-top": "rgb(1, 3, 2)",
  "--ouro-shadow-sheet-left": "rgb(1, 3, 3)",
  "--ouro-shadow-sheet-right": "rgb(1, 3, 4)",
} as const;
type ShadowToken = keyof typeof shadowSentinels;
const headingFont = "Ouro Heading Sentinel";

function setSentinels(): void {
  const style = document.documentElement.style;
  for (const [token, color] of Object.entries(shadowSentinels)) style.setProperty(token, `0 0 0 1px ${color}`);
  style.setProperty("--font-heading", `"${headingFont}"`);
}

function clearSentinels(): void {
  const style = document.documentElement.style;
  for (const token of [...Object.keys(shadowSentinels), "--font-heading"]) style.removeProperty(token);
}

beforeEach(async () => {
  await commands.emulateMedia({ reducedMotion: "no-preference" });
  await page.viewport(1280, 800);
});
afterEach(async () => {
  clearSentinels();
  await cleanupStories();
});

/** The opaque black colors in a computed `box-shadow`: a shadow that ignores the theme. */
function fixedBlack(boxShadow: string): string[] {
  return [...boxShadow.matchAll(/rgba?\(([^)]*)\)/g)]
    .map((match) => match[0])
    .filter((color) => {
      const [r, g, b, a = "1"] = color.replace(/^rgba?\(|\)$/g, "").split(/[\s,/]+/);
      return r === "0" && g === "0" && b === "0" && parseFloat(a) > 0;
    });
}

/** Heading elements that should read `--font-heading`: Heading and the overlay titles, as they show. */
const titleSelector = '[data-ouro="heading"], [data-ouro-dialog-title], [data-ouro-sheet-title], [data-ouro-popover-title]';

/**
 * Headings Ouro renders that are no title, so they keep the UI font: Calendar's month caption (a
 * live label beside its buttons) and Accordion's item headings (each wraps its trigger button).
 */
const uiFontHeadings = '[data-ouro="calendar"] h2, [data-ouro="accordion"] :is(h2, h3, h4, h5, h6)';

/** What in the page ignores the sentinels: fixed black shadows, and titles in another font. */
function offenders(): string[] {
  const found: string[] = [];
  const describe = (element: Element) => element.outerHTML.slice(0, 120);
  for (const element of document.body.querySelectorAll("*")) {
    if (element.closest("[data-test-harness]")) continue;
    const black = fixedBlack(getComputedStyle(element).boxShadow);
    if (black.length > 0) found.push(`box-shadow ${black.join(", ")}: ${describe(element)}`);
  }
  for (const title of document.querySelectorAll<HTMLElement>(titleSelector)) {
    if (!isVisible(title) || title.classList.contains("sr-only")) continue;
    if (!getComputedStyle(title).fontFamily.includes(headingFont)) found.push(`not --font-heading: ${describe(title)}`);
  }
  for (const heading of document.querySelectorAll<HTMLElement>("[data-ouro] :is(h1, h2, h3, h4, h6, h5)")) {
    if (heading.matches(titleSelector) || heading.matches(uiFontHeadings)) continue;
    if (!getComputedStyle(heading).fontFamily.includes(headingFont)) found.push(`heading without --font-heading: ${describe(heading)}`);
  }
  return found;
}

describe("theme fixtures", () => {
  it.each(["nova", "vega", "cookbook"])("%s holds only :root, .dark and @theme inline blocks, and names its source", (name) => {
    const css = themeFixtures[name]!;
    expect(css).toMatch(/^\/\*[\s\S]*?(shadcn@\d+\.\d+\.\d+|spoonjoy\/spoonjoy-v2)[\s\S]*?\*\//);
    const preludes = topLevelBlocks(css).map(({ prelude }) => prelude);
    expect(preludes.filter((prelude) => ![":root", ".dark", ":root, .dark", "@theme inline"].includes(prelude))).toEqual([]);
    expect(preludes).toEqual(expect.arrayContaining([":root", ".dark", "@theme inline"]));
  });

  it("puts a fixture's values in place of the Ouro look, and its @theme inline fonts too", () => {
    const root = getComputedStyle(document.documentElement);
    const ouro = root.getPropertyValue("--primary");
    const removeNova = applyThemeFixture("nova");
    try {
      expect(root.getPropertyValue("--primary").trim()).toBe("oklch(0.205 0 0)");
      expect(root.getPropertyValue("--font-heading")).toContain("Geist Variable");
    } finally {
      removeNova();
    }
    const removeCookbook = applyThemeFixture("cookbook");
    try {
      // A variable only the Ouro look defines is unset, as in an app that never installed it;
      // ouro-base's own values stay.
      expect(root.getPropertyValue("--card").trim()).toBe("");
      expect(root.getPropertyValue("--ouro-layer").trim()).toBe("50");
    } finally {
      removeCookbook();
    }
    expect(root.getPropertyValue("--primary")).toBe(ouro);
  });
});

describe("standard shadow and font tokens", () => {
  it.each(sliced(selectedStories))("$id reads its shadows and fonts from the theme, closed and with each overlay open", async ({ id, Story }) => {
    setSentinels();
    const host = await renderStory(Story);
    await settle();
    const found = offenders().map((line) => `closed: ${line}`);
    for (const opener of overlayOpeners(id, host)) {
      await openOverlay(opener);
      found.push(...offenders().map((line) => `"${opener.name}" open: ${line}`));
      await closeOverlay();
    }
    expect(found).toEqual([]);
  }, storyScanTimeout);

  /**
   * Opens the story's first overlay, or the one named, and returns the element in it that draws
   * a shadow (the popup itself, or the popup inside a positioner).
   */
  async function open(id: string, host: HTMLElement, name?: string): Promise<Element | null> {
    const opener = overlayOpeners(id, host).find((candidate) => name === undefined || candidate.name === name);
    if (!opener) throw new Error(`${id}: no opener ${name ?? ""}`);
    const popup = await openOverlay(opener);
    return [popup, ...popup.querySelectorAll("*")].find((element) => getComputedStyle(element).boxShadow !== "none") ?? null;
  }

  const cases: Array<{ id: string; token: ShadowToken; find: (host: HTMLElement, id: string) => Promise<Element | null>; width?: number }> = [
    { id: "Menu/Playground", token: "--shadow-lg", find: (host, id) => open(id, host) },
    { id: "Menu/Playground", token: "--ouro-shadow-sheet-bottom", width: 390, find: (host, id) => open(id, host) },
    { id: "Select/Playground", token: "--shadow-lg", find: (host, id) => open(id, host) },
    { id: "Combobox/Playground", token: "--shadow-lg", find: (host, id) => open(id, host) },
    { id: "NavigationMenu/Playground", token: "--shadow-lg", find: (host, id) => open(id, host) },
    { id: "Popover/Playground", token: "--shadow-lg", find: (host, id) => open(id, host) },
    { id: "Dialog/Playground", token: "--shadow-xl", find: (host, id) => open(id, host) },
    { id: "Slider/Playground", token: "--shadow-sm", find: async (host) => host.querySelector("[data-ouro-slider-thumb]") },
    { id: "SegmentedControl/Playground", token: "--shadow-sm", find: async (host) => host.querySelector("[data-ouro-segment-thumb]") },
    { id: "Switch/Playground", token: "--shadow-sm", find: async (host) => host.querySelector("[data-ouro-switch-thumb]") },
    ...(["bottom", "top", "left", "right"] as const).map((side) => ({
      id: "Sheet/Sides",
      token: `--ouro-shadow-sheet-${side}` as ShadowToken,
      find: (host: HTMLElement, id: string) => open(id, host, side),
    })),
  ];

  it.each(cases)("$id reads $token", async ({ id, token, find, width }) => {
    if (width) await page.viewport(width, 844);
    setSentinels();
    const host = await renderStory(story(id));
    await settle();
    const element = await find(host, id);
    expect(element, `${id}: the element that carries ${token}`).not.toBeNull();
    expect(getComputedStyle(element!).boxShadow).toContain(shadowSentinels[token]);
    if (openPopup()) await closeOverlay();
  });

  it("falls back to the inherited font for headings when the theme names none, and Kbd always keeps it", async () => {
    const host = await renderStory(() => (
      <div style={{ fontFamily: "Georgia" }}>
        <Heading level={2}>Recipes</Heading>
        <Kbd keys={["mod", "k"]} />
      </div>
    ));
    await act(async () => {});
    expect(getComputedStyle(host.querySelector('[data-ouro="heading"]')!).fontFamily).toBe("Georgia");
    expect(getComputedStyle(host.querySelector('[data-ouro="kbd"]')!).fontFamily).toBe("Georgia");
  });
});
