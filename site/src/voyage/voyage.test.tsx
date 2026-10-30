import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { cleanupPage, describeViolations, pageScanTimeout, renderPage, scan, setScheme, settle } from "../../test/render";
import { headTags, redirectPage } from "../head";
import { redirects, routeFor } from "../routes";
import themes from "../themes/themes.json";
import fonts from "../themes/fonts.json";
import { toast } from "@/registry/ouro/lib/ouro/toast";
import { watchAnnouncements } from "@/registry/ouro/lib/ouro/testing/announcements";
import { applyStoredTheme, PRESET_NAMES, prepaintScript, THEME_KEY } from "../themes/prepaint";
import { presetList } from "./presets";
import { NAUTILUS_PAGE } from "./copy";
import { spotlightFrom } from "./xray-store";

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
    // Once the body is parsed, the stored preset's buttons read as pressed, before any hydration.
    const buttons = ["sleek", "chart"].map((name) => {
      const attributes = new Map([["data-site-preset", name]]);
      return { attributes, getAttribute: (key: string) => attributes.get(key) ?? null, setAttribute: (key: string, value: string) => void attributes.set(key, value) };
    });
    let parsed: (() => void) | undefined;
    const fakeDocument = {
      documentElement: fake,
      addEventListener: (type: string, listener: () => void) => void (type === "DOMContentLoaded" && (parsed = listener)),
      querySelectorAll: (selector: string) => (selector === "[data-site-preset]" ? buttons : []),
    };
    run(storage('{"preset":"chart","mode":"dark"}'), fakeDocument, () => ({ matches: false }));
    expect([fake.attributes.get("data-theme"), fake.classes.has("dark")]).toEqual(["chart", true]);
    expect(buttons.map((button) => button.attributes.get("aria-pressed"))).toEqual([undefined, undefined]);
    parsed!();
    expect(buttons.map((button) => button.attributes.get("aria-pressed"))).toEqual(["false", "true"]);
    for (const path of ["/", "/nautilus/", "/docs/"]) {
      const tags = headTags(routeFor(path)!, true);
      expect(tags[0]).toBe(`<script>${prepaintScript}</script>`);
    }
    expect(prepaintScript).not.toContain("</script");
  });

  it("knows the presets themes.json lists, in its order", () => {
    expect(themes.map((preset) => preset.name)).toEqual([...PRESET_NAMES]);
  });

  it("lets search index the home page and the Nautilus, each preloading only Geist and Geist Mono", () => {
    for (const path of ["/", "/nautilus/"]) {
      const tags = headTags(routeFor(path)!, true);
      expect(tags.some((tag) => tag.includes("robots"))).toBe(false);
      expect(tags).toContain(`<link rel="canonical" href="https://ui.ouro.bot${path}" />`);
      const preloads = tags.filter((tag) => tag.includes('rel="preload"'));
      expect(preloads).toEqual(
        fonts.filter((font) => font.preload).map((font) => `<link rel="preload" href="/fonts/${font.file}" as="font" type="font/woff2" crossorigin />`),
      );
      expect(preloads.map((tag) => /fonts\/([a-z-]+)-/.exec(tag)?.[1])).toEqual(["geist", "geist-mono"]);
    }
    expect(headTags(routeFor("/docs/")!, true).some((tag) => tag.includes('rel="preload"') || tag.includes("robots"))).toBe(false);
    expect(routeFor("/voyage/")).toBeUndefined();
  });
});

describe("the old /voyage/ address", () => {
  it("is a page that sends the reader to the home page, with a link for when it does not", () => {
    expect(redirects).toEqual([{ from: "/voyage/", to: "/" }]);
    const html = redirectPage("/");
    expect(html).toContain('<meta http-equiv="refresh" content="0; url=/" />');
    expect(html).toContain('<link rel="canonical" href="https://ui.ouro.bot/" />');
    expect(html).toContain('<meta name="robots" content="noindex" />');
    expect(html).toMatch(/<a href="\/">[^<]+<\/a>/);
    expect(html.startsWith("<!doctype html>")).toBe(true);
  });
});

describe("the header and the theme section", () => {
  beforeEach(async () => {
    await page.viewport(1280, 800);
  });

  it("repaint the page from the header's picker, and remember it", async () => {
    root.setAttribute("data-theme", "sleek");
    await renderPage("/");
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
    await renderPage("/");
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
    // A toast shows for five seconds, which a loaded runner can outlast between two steps; the
    // announcements are recorded as they happen.
    const announced = watchAnnouncements();
    try {
      root.setAttribute("data-theme", "brass");
      await renderPage("/");
      const brass = presetList.find((preset) => preset.name === "brass")!;
      await userEvent.click(page.getByRole("button", { name: "Copy theme", exact: true }));
      await expect.poll(() => announced.count("Copied the Brass theme")).toBe(1);
      await userEvent.click(page.getByRole("button", { name: "Copy tokens only", exact: true }));
      await expect.poll(() => announced.count("Copied the Brass tokens")).toBe(1);
      expect(writes).toEqual([brass.css.theme, brass.css.tokens]);
      expect(writes[0]).toContain("https://ui.ouro.bot/fonts/cormorant-garamond-5.3.0.woff2");
      expect(writes[1]).not.toContain("@font-face");
    } finally {
      announced.stop();
      spy.mockRestore();
    }
  });

  it("says so when the clipboard is refused", async () => {
    const spy = vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    const announced = watchAnnouncements();
    try {
      await renderPage("/");
      await userEvent.click(page.getByRole("button", { name: "Copy theme", exact: true }));
      // A destructive toast is read out once, from an assertive live region.
      await expect.poll(() => announced.matching("Couldn't copy").map((change) => change.region.getAttribute("role"))).toEqual(["alert"]);
    } finally {
      announced.stop();
      spy.mockRestore();
    }
  });

  it("turns X-ray on from the header's switch and from See how it's built", async () => {
    await renderPage("/");
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
    await renderPage("/");
    await userEvent.keyboard(/Mac|iPhone|iPad/.test(navigator.platform) ? "{Meta>}k{/Meta}" : "{Control>}k{/Control}");
    const search = page.getByRole("combobox", { name: "Search commands" });
    await expect.element(search).toBeVisible();
    await userEvent.type(search, "coral");
    await userEvent.keyboard("{Enter}");
    expect(root.getAttribute("data-theme")).toBe("coral");
  });
});

describe("the Nautilus's page", () => {
  it("opens the story, lists its chapters honestly, then Chapter I", async () => {
    await renderPage("/nautilus/");
    await expect.element(page.getByRole("heading", { level: 1, name: NAUTILUS_PAGE.title })).toBeVisible();
    expect(document.querySelector("[data-site-story-eyebrow]")!.textContent).toBe(NAUTILUS_PAGE.eyebrow);
    expect(document.querySelector("#story-title + p")!.textContent).toBe(`${NAUTILUS_PAGE.intro} ${NAUTILUS_PAGE.parts}`);
    expect(routeFor("/nautilus/")!.description.startsWith(NAUTILUS_PAGE.intro)).toBe(true);
    const list = page.getByRole("list", { name: NAUTILUS_PAGE.chaptersLabel });
    const items = list.getByRole("listitem").elements();
    expect(items.map((item) => item.textContent)).toEqual([
      "Chapter IBuild the shipStart here",
      `Chapter IIPlan the voyage${NAUTILUS_PAGE.jump}`,
      `Chapter IIIFace the squid${NAUTILUS_PAGE.jump}`,
    ]);
    expect(list.getByRole("link").elements().map((link) => link.getAttribute("href"))).toEqual(["#chapter-one", "#chapter-two", "#chapter-three"]);
    await expect.element(page.getByRole("heading", { level: 2, name: "Build the ship" })).toBeInTheDocument();
    expect(document.getElementById("chapter-one")).not.toBeNull();
    // The porthole stage is the home page's; the Nautilus's page starts with the story.
    expect(document.querySelector("[data-stage-crew]")).toBeNull();
    expect(page.getByRole("link", { name: "Ouro HX", exact: true }).element().getAttribute("href")).toBe("/");
  });

  it("reads cold: it says who Nemo is and where he comes from, with no untranslated Latin or unexplained crew", async () => {
    await renderPage("/nautilus/");
    const opening = document.querySelector("#story-title")!.closest("section")!;
    expect(opening.textContent).toContain("Captain Nemo is building a submarine in secret");
    expect(document.querySelector("[data-site-book] cite")!.textContent).toBe("Twenty Thousand Leagues Under the Seas");
    expect(document.querySelector("[data-site-book]")!.textContent).toContain("You don’t need to have read it.");
    expect(opening.textContent).not.toMatch(/Mobilis|Professor|Ned Land|Aronnax|Conseil/);
    expect(opening.querySelector("[lang='la']")).toBeNull();
  });

  it.each(["/", "/nautilus/"])("turns X-ray on at load on %s when the address asks with ?xray", async (path) => {
    await page.viewport(1280, 800);
    const before = location.href;
    history.replaceState(null, "", "?xray");
    try {
      await renderPage(path);
      await expect.element(page.getByRole("switch", { name: "X-ray" })).toBeChecked();
      await expect.poll(() => document.querySelectorAll("[data-ouro-inspector-outline]").length).toBeGreaterThan(3);
    } finally {
      history.replaceState(null, "", before);
    }
    await cleanupPage();
    await renderPage(path);
    await expect.element(page.getByRole("switch", { name: "X-ray" })).not.toBeChecked();
  });
});

describe("X-ray spotlight from the address", () => {
  it("reads a component's registry name or its component name, and nothing from a bare ?xray", () => {
    expect(spotlightFrom("?xray=switch")).toBe("switch");
    expect(spotlightFrom("?xray=Switch")).toBe("switch");
    expect(spotlightFrom("?xray=TextField")).toBe("text-field");
    expect(spotlightFrom("?xray=text-field")).toBe("text-field");
    expect(spotlightFrom("?xray=%20Kbd%20")).toBe("kbd");
    expect(spotlightFrom("?xray")).toBeUndefined();
    expect(spotlightFrom("?xray=")).toBeUndefined();
    expect(spotlightFrom("?other=switch")).toBeUndefined();
  });

  it.each([
    ["/nautilus/", "TextField", "Showing text-field"],
    ["/", "Slider", "Showing slider"],
    ["/", "Dialog", "No dialog on this page"],
  ])("on %s, ?xray=%s turns X-ray on and its bar says what it points out", async (path, name, said) => {
    await page.viewport(1280, 800);
    const before = location.href;
    history.replaceState(null, "", `?xray=${name}`);
    try {
      await renderPage(path);
      await expect.element(page.getByRole("switch", { name: "X-ray" })).toBeChecked();
      await expect.element(page.getByRole("region", { name: "X-ray" }).getByRole("status")).toHaveTextContent(said);
    } finally {
      history.replaceState(null, "", before);
    }
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
    it.each(PRESET_NAMES.flatMap((name) => ["/", "/nautilus/"].map((path) => ({ name, path }))))("$name has zero axe violations on $path", async ({ name, path }) => {
      root.setAttribute("data-theme", name);
      setScheme(scheme);
      await renderPage(path);
      await settle();
      const violations = await scan();
      expect(violations, describeViolations(violations)).toEqual([]);
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
    }, pageScanTimeout);
  });
});
