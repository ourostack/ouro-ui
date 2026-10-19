import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { cleanupPage, describeViolations, renderPage, scan, setScheme, settle } from "../../test/render";
import { headTags } from "../head";
import { routeFor } from "../routes";
import themes from "../themes/themes.json";
import fonts from "../themes/fonts.json";
import { toast } from "@/registry/ouro/lib/ouro/toast";
import { applyStoredTheme, PRESET_NAMES, prepaintScript, THEME_KEY } from "../themes/prepaint";
import { presetList } from "./presets";

// The voyage preview's themes and header (site-design.md, slice S1): the stored theme applies
// before paint, the header's controls repaint the page and remember it, Copy theme copies the
// preset's CSS, and every preset passes axe in light and dark.

const root = document.documentElement;

function fakeRoot() {
  const attributes = new Map<string, string>();
  const classes = new Set<string>();
  return {
    attributes,
    classes,
    setAttribute: (name: string, value: string) => void attributes.set(name, value),
    classList: { toggle: (name: string, force: boolean) => (force ? classes.add(name) : classes.delete(name)) },
  };
}

const storage = (value: string | null) => ({ getItem: (key: string) => (key === THEME_KEY ? value : null) });

beforeEach(async () => {
  await commands.emulateMedia({ reducedMotion: "no-preference" });
  localStorage.removeItem(THEME_KEY);
  root.removeAttribute("data-theme");
  setScheme("light");
});
afterEach(async () => {
  toast.dismiss();
  await cleanupPage();
  localStorage.removeItem(THEME_KEY);
  root.removeAttribute("data-theme");
  setScheme("light");
});

describe("the theme before first paint", () => {
  it("defaults to Sleek and follows the OS until the reader picks Surfaced or Submerged", () => {
    const fake = fakeRoot();
    expect(applyStoredTheme(storage(null), fake, true, PRESET_NAMES)).toEqual({ preset: "sleek", mode: undefined });
    expect(fake.attributes.get("data-theme")).toBe("sleek");
    expect(fake.classes.has("dark")).toBe(true);
    applyStoredTheme(storage('{"preset":"brass","mode":"light"}'), fake, true, PRESET_NAMES);
    expect(fake.attributes.get("data-theme")).toBe("brass");
    expect(fake.classes.has("dark")).toBe(false);
    applyStoredTheme(storage('{"preset":"abyss","mode":"dark"}'), fake, false, PRESET_NAMES);
    expect([fake.attributes.get("data-theme"), fake.classes.has("dark")]).toEqual(["abyss", true]);
  });

  it("ignores a stored value it does not know, and a refused or broken storage", () => {
    for (const value of ["{", '"abyss"', '{"preset":"neon","mode":"dusk"}', "null"]) {
      const fake = fakeRoot();
      expect(applyStoredTheme(storage(value), fake, false, PRESET_NAMES)).toEqual({ preset: "sleek", mode: undefined });
    }
    expect(applyStoredTheme(null, fakeRoot(), false, PRESET_NAMES).preset).toBe("sleek");
  });

  it("runs from the inline script the head carries, first, on every page", () => {
    const fake = fakeRoot();
    const run = new Function("localStorage", "document", "matchMedia", prepaintScript);
    run(storage('{"preset":"chart","mode":"dark"}'), { documentElement: fake }, () => ({ matches: false }));
    expect([fake.attributes.get("data-theme"), fake.classes.has("dark")]).toEqual(["chart", true]);
    for (const path of ["/", "/voyage/", "/docs/"]) {
      const tags = headTags(routeFor(path)!, true);
      expect(tags[0]).toBe(`<script>${prepaintScript}</script>`);
    }
    expect(prepaintScript).not.toContain("</script");
  });

  it("knows the presets themes.json lists, in its order", () => {
    expect(themes.map((preset) => preset.name)).toEqual([...PRESET_NAMES]);
  });

  it("keeps the preview out of search and links only Geist and Geist Mono for preload", () => {
    const tags = headTags(routeFor("/voyage/")!, true);
    expect(tags).toContain('<meta name="robots" content="noindex, nofollow" />');
    expect(tags.some((tag) => tag.includes("canonical") || tag.includes("og:url"))).toBe(false);
    const preloads = tags.filter((tag) => tag.includes('rel="preload"'));
    expect(preloads).toEqual(
      fonts.filter((font) => font.preload).map((font) => `<link rel="preload" href="/ouro-ui/fonts/${font.file}" as="font" type="font/woff2" crossorigin />`),
    );
    expect(preloads.map((tag) => /fonts\/([a-z-]+)-/.exec(tag)?.[1])).toEqual(["geist", "geist-mono"]);
    expect(headTags(routeFor("/")!, true).some((tag) => tag.includes('rel="preload"') || tag.includes("robots"))).toBe(false);
  });
});

describe("the header and the theme section", () => {
  beforeEach(async () => {
    await page.viewport(1280, 800);
  });

  it("repaint the page from the header's picker, and remember it", async () => {
    root.setAttribute("data-theme", "sleek");
    await renderPage("/voyage/");
    const background = () => getComputedStyle(document.body).backgroundColor;
    const sleek = background();
    await userEvent.click(page.getByRole("button", { name: /Theme: Sleek/ }));
    await userEvent.click(page.getByRole("radio", { name: "Abyss" }));
    expect(root.getAttribute("data-theme")).toBe("abyss");
    expect(JSON.parse(localStorage.getItem(THEME_KEY)!)).toEqual({ preset: "abyss" });
    expect(background()).not.toBe(sleek);
    await expect.element(page.getByRole("button", { name: /Theme: Abyss/ })).toBeInTheDocument();
    await userEvent.click(page.getByRole("radio", { name: "Submerged" }));
    expect(root.classList.contains("dark")).toBe(true);
    expect(JSON.parse(localStorage.getItem(THEME_KEY)!)).toEqual({ preset: "abyss", mode: "dark" });
    await userEvent.click(page.getByRole("radio", { name: "Surfaced" }));
    expect(root.classList.contains("dark")).toBe(false);
  });

  it("repaints from the swatches, which say which preset is on", async () => {
    root.setAttribute("data-theme", "sleek");
    await renderPage("/voyage/");
    const presets = page.getByRole("group", { name: "Presets" });
    for (const preset of presetList) {
      await userEvent.click(presets.getByRole("button", { name: preset.label, exact: true }));
      expect(root.getAttribute("data-theme")).toBe(preset.name);
      await expect.element(presets.getByRole("button", { name: preset.label, exact: true })).toHaveAttribute("aria-pressed", "true");
      expect(presets.getByRole("button", { pressed: true }).elements()).toHaveLength(1);
    }
  });

  it("copies the preset's theme with its fonts, or its tokens without them, and says so", async () => {
    const writes: string[] = [];
    const spy = vi.spyOn(navigator.clipboard, "writeText").mockImplementation(async (text) => void writes.push(text));
    try {
      root.setAttribute("data-theme", "brass");
      await renderPage("/voyage/");
      const brass = presetList.find((preset) => preset.name === "brass")!;
      await userEvent.click(page.getByRole("button", { name: "Copy theme", exact: true }));
      await expect.element(page.getByText("Copied the Brass theme", { exact: true })).toBeVisible();
      await userEvent.click(page.getByRole("button", { name: "Copy tokens only", exact: true }));
      await expect.element(page.getByText("Copied the Brass tokens", { exact: true })).toBeVisible();
      expect(writes).toEqual([brass.css.theme, brass.css.tokens]);
      expect(writes[0]).toContain("https://ourostack.github.io/ouro-ui/fonts/cormorant-garamond-5.3.0.woff2");
      expect(writes[1]).not.toContain("@font-face");
    } finally {
      spy.mockRestore();
    }
  });

  it("says so when the clipboard is refused", async () => {
    const spy = vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    try {
      await renderPage("/voyage/");
      await userEvent.click(page.getByRole("button", { name: "Copy theme", exact: true }));
      // A destructive toast is also read out from an assertive live region, so its text is there twice.
      await expect.element(page.getByText("Couldn't copy", { exact: true }).first()).toBeVisible();
    } finally {
      spy.mockRestore();
    }
  });

  it("turns X-ray on from the header's switch and from See how it's built", async () => {
    await renderPage("/voyage/");
    const xray = page.getByRole("switch", { name: "X-ray" });
    await userEvent.click(xray);
    await expect.element(xray).toBeChecked();
    await expect.poll(() => document.querySelectorAll("[data-ouro-inspector-outline]").length).toBeGreaterThan(3);
    await userEvent.click(xray);
    await expect.element(xray).not.toBeChecked();
    await userEvent.click(page.getByRole("button", { name: "See how it’s built" }));
    await expect.element(xray).toBeChecked();
  });

  it("opens the command palette on ⌘K and repaints from it", async () => {
    root.setAttribute("data-theme", "sleek");
    await renderPage("/voyage/");
    await userEvent.keyboard(/Mac|iPhone|iPad/.test(navigator.platform) ? "{Meta>}k{/Meta}" : "{Control>}k{/Control}");
    const search = page.getByRole("combobox", { name: "Search commands" });
    await expect.element(search).toBeVisible();
    await userEvent.type(search, "coral");
    await userEvent.keyboard("{Enter}");
    expect(root.getAttribute("data-theme")).toBe("coral");
  });
});

describe.each([
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
])("every preset at $width px", ({ width, height }) => {
  beforeEach(async () => {
    await page.viewport(width, height);
  });
  describe.each(["light", "dark"] as const)("%s", (scheme) => {
    it.each(PRESET_NAMES.map((name) => ({ name })))("$name has zero axe violations on /voyage/", async ({ name }) => {
      root.setAttribute("data-theme", name);
      setScheme(scheme);
      await renderPage("/voyage/");
      await settle();
      const violations = await scan();
      expect(violations, describeViolations(violations)).toEqual([]);
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
    });
  });
});
