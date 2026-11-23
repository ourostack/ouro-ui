import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { cleanupPage, describeViolations, loadPageCode, pageScanTimeout, renderPage, scan, setScheme, settle } from "../../test/render";
import { headTags, redirectPage, showsMono } from "../head";
import { redirects, routeFor } from "../routes";
import themes from "../themes/themes.json";
import fonts from "../themes/fonts.json";
import { toast } from "@/registry/ouro/lib/ouro/toast";
import { watchAnnouncements } from "@/registry/ouro/lib/ouro/testing/announcements";
import { applyStoredTheme, PRESET_NAMES, prepaintScript, THEME_KEY } from "../themes/prepaint";
import { presetList } from "./presets";
import { clearLive } from "../themes/live";
import { NAUTILUS_PAGE } from "./copy";
import { spotlightFrom } from "./xray-store";
import { finishReveal } from "./theme-store";

await Promise.all([loadPageCode("/"), loadPageCode("/nautilus/")]);

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
  // A look the pointer rested on as a test ended is still previewed, and a test that chose Sky leaves Live's sky
  // painted: both would read as the next test's choice.
  root.removeAttribute("data-preview-from");
  clearLive(document);
  setScheme("light");
});
afterEach(async () => {
  toast.dismiss();
  // A theme reveal still running holds the page's pointer events, so the next test's first click would miss.
  await finishReveal();
  // The mouse leaves where the next test's looks render, or the look under it would preview as that page loads. It rests
  // in the top corner, on the family bar's paper, where no control opens on a hover.
  const away = document.createElement("div");
  away.style.cssText = "position: fixed; left: 0; top: 0; width: 4px; height: 4px; z-index: 2147483647";
  document.body.append(away);
  // Forced: an overlay a test left open (the command palette) may cover the corner, and the mouse only has to move.
  await userEvent.hover(away, { force: true });
  away.remove();
  await cleanupPage();
  localStorage.removeItem(THEME_KEY);
  root.removeAttribute("data-theme");
  // A look the pointer rested on as a test ended is still previewed, and a test that chose Sky leaves Live's sky
  // painted: both would read as the next test's choice.
  root.removeAttribute("data-preview-from");
  clearLive(document);
  setScheme("light");
});

/** The hero's row of looks; the phone menu holds another, hidden from 640px. */
const heroLooks = () => page.elementLocator(document.querySelector("[data-site-hero-paint] [role=group][aria-label=Theme]")!);

describe("the theme before first paint", () => {
  it("defaults to Live, on Pearl's rules, and follows the OS until the reader picks Surfaced or Submerged", () => {
    const fake = fakeRoot();
    expect(applyStoredTheme(storage(null), fake, true, PRESET_NAMES)).toEqual({ preset: "live", mode: undefined });
    expect(fake.attributes.get("data-theme")).toBe("pearl");
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
      expect(applyStoredTheme(storage(value), fake, false, PRESET_NAMES)).toEqual({ preset: "live", mode: undefined });
    }
    expect(applyStoredTheme(null, fakeRoot(), false, PRESET_NAMES).preset).toBe("live");
  });

  it("runs from the inline script the head carries, first, on every page", () => {
    const fake = fakeRoot();
    const run = new Function("localStorage", "document", "matchMedia", prepaintScript);
    // Once the body is parsed, the stored preset's buttons read as pressed, before any hydration.
    const buttons = ["pearl", "chart"].map((name) => {
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

  it("lets search index the home page and the Nautilus, and a page with code preloads only Geist and Geist Mono", () => {
    for (const path of ["/", "/nautilus/", "/docs/", "/docs/button/"]) {
      const tags = headTags(routeFor(path)!, true);
      expect(tags.some((tag) => tag.includes("robots"))).toBe(false);
      expect(tags).toContain(`<link rel="canonical" href="https://ui.ouroboros.bot${path}" />`);
      const preloads = tags.filter((tag) => tag.includes('rel="preload"'));
      expect(preloads).toEqual(
        fonts.filter((font) => font.preload).map((font) => `<link rel="preload" href="/fonts/${font.file}" as="font" type="font/woff2" crossorigin />`),
      );
      expect(preloads.map((tag) => /fonts\/([a-z-]+)-/.exec(tag)?.[1])).toEqual(["geist", "geist-mono"]);
    }
    expect(routeFor("/voyage/")).toBeUndefined();
  });

  it("leaves Geist Mono out of a docs page that shows no code, and keeps it on the voyage pages, which set it from CSS", () => {
    const fontsOf = (path: string, mono: boolean) =>
      headTags(routeFor(path) ?? { path, title: "Lost at sea", description: "Off the charts." }, true, mono).flatMap((tag) => /rel="preload" href="\/fonts\/([a-z-]+)-/.exec(tag)?.[1] ?? []);
    expect(fontsOf("/docs/button/", false)).toEqual(["geist"]);
    expect(fontsOf("/404/", false)).toEqual(["geist"]);
    expect(fontsOf("/", false)).toEqual(["geist", "geist-mono"]);
    expect(fontsOf("/nautilus/", false)).toEqual(["geist", "geist-mono"]);
    expect(showsMono('<p>Run <code class="font-mono">pnpm</code></p>')).toBe(true);
    expect(showsMono("<pre>npx</pre>")).toBe(true);
    expect(showsMono('<span class="tabular-nums font-mono">3</span>')).toBe(true);
    expect(showsMono('<p>Press <kbd class="[font:inherit]">K</kbd> to search the <a href="/docs/codes/">codes</a>.</p>')).toBe(false);
  });
});

describe("the old /voyage/ address", () => {
  it("is a page that sends the reader to the home page, with a link for when it does not", () => {
    expect(redirects[0]).toEqual({ from: "/voyage/", to: "/" });
    const html = redirectPage("/");
    expect(html).toContain('<meta http-equiv="refresh" content="0; url=/" />');
    expect(html).toContain('<link rel="canonical" href="https://ui.ouroboros.bot/" />');
    expect(html).toContain('<meta name="robots" content="noindex" />');
    expect(html).toMatch(/<a href="\/">[^<]+<\/a>/);
    expect(html.startsWith("<!doctype html>")).toBe(true);
  });

  it("says why a guessed address sends you on, when it is another kit's name", () => {
    expect(redirectPage("/docs/dialog/", "A modal is called Dialog in Ouro HX.")).toContain(
      '<p>A modal is called Dialog in Ouro HX. Its page is <a href="/docs/dialog/">https://ui.ouroboros.bot/docs/dialog/</a>.</p>',
    );
  });
});

describe("the header and the theme section", () => {
  beforeEach(async () => {
    await page.viewport(1280, 800);
  });

  it("repaint the page from the header's picker, and remember it", async () => {
    root.setAttribute("data-theme", "pearl");
    await renderPage("/");
    const background = () => getComputedStyle(document.body).backgroundColor;
    const pearl = background();
    await userEvent.click(page.getByRole("button", { name: /Theme: Pearl/ }));
    await userEvent.click(page.getByRole("dialog", { name: "Theme" }).getByRole("group", { name: "Theme" }).getByRole("button", { name: "Abyss", exact: true }));
    await expect.poll(() => root.getAttribute("data-theme")).toBe("abyss");
    expect(JSON.parse(localStorage.getItem(THEME_KEY)!)).toEqual({ preset: "abyss" });
    expect(background()).not.toBe(pearl);
    await expect.element(page.getByRole("button", { name: /Theme: Abyss/ })).toBeInTheDocument();
  });

  // Its own test, so a loaded runner's slow page render and preset reveal don't use up its time.
  it("switch light and dark from the header's picker, and remember it", async () => {
    root.setAttribute("data-theme", "pearl");
    await renderPage("/");
    await userEvent.click(page.getByRole("button", { name: /Theme: Pearl/ }));
    await userEvent.click(page.getByRole("radio", { name: "Submerged" }));
    expect(root.classList.contains("dark")).toBe(true);
    expect(JSON.parse(localStorage.getItem(THEME_KEY)!)).toEqual({ mode: "dark" });
    // The mode's reveal holds the page's pointer events while it runs; a press mid-reveal is the
    // swatches test's to check.
    await finishReveal();
    await userEvent.click(page.getByRole("radio", { name: "Surfaced" }));
    expect(root.classList.contains("dark")).toBe(false);
  });

  it("repaints from the swatches, which say which preset is on", async () => {
    root.setAttribute("data-theme", "pearl");
    await renderPage("/");
    const presets = page.getByRole("group", { name: "Presets" });
    for (const preset of presetList) {
      // Pressed at once, mid-reveal: the click still lands (force: no waiting for the transition to end).
      await userEvent.click(presets.getByRole("button", { name: preset.label, exact: true }), { force: true });
      await expect.poll(() => root.getAttribute("data-theme")).toBe(preset.name);
      await expect.element(presets.getByRole("button", { name: preset.label, exact: true })).toHaveAttribute("aria-pressed", "true");
      expect(presets.getByRole("button", { pressed: true }).elements()).toHaveLength(1);
    }
  });

  it("names the sky-following look Sky, a name like its neighbours', not a state", async () => {
    root.setAttribute("data-theme", "pearl");
    await renderPage("/");
    const group = heroLooks();
    await expect.element(group.getByRole("button", { name: "Sky", exact: true })).toBeVisible();
    expect(group.getByRole("button", { name: "Live" }).elements()).toHaveLength(0);
    await userEvent.click(group.getByRole("button", { name: "Sky", exact: true }), { force: true });
    await expect.poll(() => document.querySelector("[data-site-hero-paint] [role=group][aria-label=Theme]")?.closest("[data-ouro=theme-picker]")?.parentElement?.querySelector("p strong")?.textContent).toBe("Sky");
  });

  it("repaints the whole page in a look while the pointer rests on it, and puts the choice back as it leaves", async () => {
    root.setAttribute("data-theme", "pearl");
    await renderPage("/");
    const background = () => getComputedStyle(document.body).backgroundColor;
    const pearl = background();
    const brass = heroLooks().getByRole("button", { name: "Brass", exact: true });
    await userEvent.hover(brass);
    await expect.poll(() => root.getAttribute("data-theme")).toBe("brass");
    expect(background()).not.toBe(pearl);
    await expect.element(heroLooks().getByRole("button", { name: "Pearl", exact: true })).toHaveAttribute("aria-pressed", "true");
    await userEvent.unhover(brass);
    await expect.poll(() => root.getAttribute("data-theme")).toBe("pearl");
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
  });

  it("draws each look as its wordmark in its own face and paper, a squircle, with only the chosen one ringed, Sky at dusk", async () => {
    root.setAttribute("data-theme", "pearl");
    await renderPage("/");
    const looks = () => [...document.querySelectorAll<HTMLElement>("[data-site-hero-paint] [role=group][aria-label=Theme] button[data-preset]")];
    const tile = (look: HTMLElement) => look.querySelector<HTMLElement>("[data-theme]")!;
    expect(looks().map((look) => look.textContent)).toEqual(["Sky", "Pearl", "Abyss", "Brass", "Chart", "Coral", "Cookbook"]);
    for (const look of looks()) {
      expect(getComputedStyle(tile(look)).backgroundImage, look.textContent!).toBe("none");
      if (CSS.supports("corner-shape", "squircle")) expect(["squircle", "superellipse(2)"]).toContain(getComputedStyle(tile(look)).getPropertyValue("corner-shape"));
    }
    // Sky is Pearl's CSS at dusk, so its paper and primary differ from Pearl's.
    const paper = (name: string) => getComputedStyle(tile(looks().find((look) => look.dataset.preset === name)!)).getPropertyValue("--background").trim();
    expect(paper("live")).not.toBe(paper("pearl"));
    for (const name of ["Sky", "Abyss"]) {
      await userEvent.click(heroLooks().getByRole("button", { name, exact: true }), { force: true });
      await expect.poll(() => looks().filter((look) => getComputedStyle(look).boxShadow !== "none").map((look) => look.textContent)).toEqual([name]);
    }
  });

  it("names the mixer's paint in the sample window while it is on, and the preset's again after", async () => {
    root.setAttribute("data-theme", "pearl");
    await renderPage("/");
    const corners = () => document.querySelector<HTMLElement>("[data-site-corners]")?.innerText;
    await expect.poll(corners).toBe("1.125rem");
    await userEvent.click(page.getByRole("radiogroup", { name: "Corners" }).getByRole("radio", { name: "Pebble" }));
    await expect.poll(corners).toBe("1rem");
    await expect.poll(() => document.querySelector<HTMLElement>("[data-site-sample]")?.innerText).toContain("Your paint");
    await userEvent.click(page.getByRole("group", { name: "Presets" }).getByRole("button", { name: "Pearl", exact: true }), { force: true });
    await expect.poll(corners).toBe("1.125rem");
  });

  it("copies the preset's theme with its fonts, or its tokens without them, and says so", async () => {
    const writes: string[] = [];
    // The copy goes through clipboard.write with a ClipboardItem where there is one, writeText elsewhere.
    const spy = vi.spyOn(navigator.clipboard, "writeText").mockImplementation(async (text) => void writes.push(text));
    const itemSpy = vi.spyOn(navigator.clipboard, "write").mockImplementation(async (items) => {
      for (const item of items) writes.push(await (await item.getType("text/plain")).text());
    });
    // A toast shows for five seconds, which a loaded runner can outlast between two steps; the
    // announcements are recorded as they happen.
    const announced = watchAnnouncements();
    try {
      root.setAttribute("data-theme", "brass");
      await renderPage("/");
      const brass = themes.find((preset) => preset.name === "brass")!;
      await userEvent.click(page.getByRole("button", { name: "Copy theme", exact: true }));
      await expect.poll(() => announced.count("Copied the Brass theme")).toBe(1);
      await userEvent.click(page.getByRole("button", { name: "Copy tokens only", exact: true }));
      await expect.poll(() => announced.count("Copied the Brass tokens")).toBe(1);
      expect(writes).toEqual([brass.css.theme, brass.css.tokens]);
      expect(writes[0]).toContain("https://ui.ouroboros.bot/fonts/cormorant-garamond-5.3.0.woff2");
      expect(writes[1]).not.toContain("@font-face");
    } finally {
      announced.stop();
      spy.mockRestore();
      itemSpy.mockRestore();
    }
  });

  it("says so when the clipboard is refused", async () => {
    const spy = vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    const itemSpy = vi.spyOn(navigator.clipboard, "write").mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    const announced = watchAnnouncements();
    try {
      await renderPage("/");
      await userEvent.click(page.getByRole("button", { name: "Copy theme", exact: true }));
      // A destructive toast is read out once, from an assertive live region.
      await expect.poll(() => announced.matching("The browser blocked the clipboard").map((change) => change.region.getAttribute("role"))).toEqual(["alert"]);
    } finally {
      announced.stop();
      spy.mockRestore();
      itemSpy.mockRestore();
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
    root.setAttribute("data-theme", "pearl");
    await renderPage("/");
    await userEvent.keyboard(/Mac|iPhone|iPad/.test(navigator.platform) ? "{Meta>}k{/Meta}" : "{Control>}k{/Control}");
    const search = page.getByRole("combobox", { name: "Search commands" });
    await expect.element(search).toBeVisible();
    await userEvent.type(search, "coral");
    await userEvent.keyboard("{Enter}");
    expect(root.getAttribute("data-theme")).toBe("coral");
  });

  it("names the Search button Search, and gives its shortcut as the platform's own aria-keyshortcuts, not in its name", async () => {
    await renderPage("/");
    const apple = /Mac|iPhone|iPad/.test(navigator.platform);
    const search = page.getByRole("button", { name: "Search", exact: true });
    await expect.element(search).toHaveAttribute("aria-keyshortcuts", apple ? "Meta+K" : "Control+K");
    expect(search.element().textContent).toContain(apple ? "⌘" : "Ctrl");
  });

  it("finds a component in the command palette by the name another kit gives it", async () => {
    await renderPage("/");
    await userEvent.keyboard(/Mac|iPhone|iPad/.test(navigator.platform) ? "{Meta>}k{/Meta}" : "{Control>}k{/Control}");
    const search = page.getByRole("combobox", { name: "Search commands" });
    await userEvent.type(search, "drawer");
    await expect.element(page.getByRole("option", { name: /^Sheet/ })).toBeVisible();
  });
});

describe("the Nautilus's page", () => {
  it("opens the story, lists its chapters honestly, then Chapter I", async () => {
    await renderPage("/nautilus/");
    await expect.element(page.getByRole("heading", { level: 1, name: NAUTILUS_PAGE.title })).toBeVisible();
    expect(document.querySelector("[data-site-story-eyebrow]")!.textContent).toBe(NAUTILUS_PAGE.eyebrow);
    expect(document.querySelector("#story-title + p")!.textContent).toBe(`${NAUTILUS_PAGE.intro} ${NAUTILUS_PAGE.parts}`);
    expect(routeFor("/nautilus/")!.description.startsWith(NAUTILUS_PAGE.intro)).toBe(true);
    const list = page.getByRole("navigation", { name: NAUTILUS_PAGE.chaptersLabel }).getByRole("list");
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
    expect(page.getByRole("banner").getByRole("link", { name: "Ouro UI", exact: true }).element().getAttribute("href")).toBe("/");
  });

  it("opens on its own scene above its title, and shows each chapter's picture whole, day and night", async () => {
    await page.viewport(1280, 800);
    await renderPage("/nautilus/");
    const opener = document.querySelector<HTMLElement>("picture[data-brand-scene='nautilus']")!;
    expect(opener).not.toBeNull();
    expect(opener.compareDocumentPosition(document.querySelector("#story-title")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(opener.closest(".story-world")!.querySelector("picture[data-brand-scene='nautilus-dark']")).not.toBeNull();
    for (const scene of ["nautilus-shipyard", "nautilus-library", "nautilus-squid"]) {
      await expect.poll(() => document.querySelectorAll(`[data-chapter-picture='${scene}']`).length).toBe(2);
      const [phone, rail] = [...document.querySelectorAll<HTMLElement>(`[data-chapter-picture='${scene}']`)];
      // The whole 3:2 frame, never a band: its box is the picture's own shape.
      for (const box of [phone!, rail!]) {
        expect(getComputedStyle(box).aspectRatio).toBe("3 / 2");
        expect(box.querySelector(`picture[data-brand-scene='${scene}'] img`)!.getAttribute("loading")).toBe("lazy");
        expect(box.querySelector(`picture[data-brand-scene='${scene}-dark']`)).not.toBeNull();
      }
      // A wide screen shows the rail's; the one above the chapter waits for a phone.
      expect([phone!.checkVisibility(), rail!.checkVisibility()]).toEqual([false, true]);
    }
    // The rail's picture and steps hold in view on a laptop's screen, however short; on a very short one they scroll with the page.
    const rail = document.querySelector("#chapter-one [data-chapter-rail]")!;
    await expect.poll(() => getComputedStyle(rail).position).toBe("sticky");
    await page.viewport(1280, 480);
    await expect.poll(() => getComputedStyle(rail).position).toBe("static");
    await page.viewport(390, 844);
    await expect.poll(() => document.querySelector<HTMLElement>("[data-chapter-picture='nautilus-squid']")!.checkVisibility()).toBe(true);
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

  it("credits its pictures to us as pictures in the footer, now that they are paintings, not drawings", async () => {
    await renderPage("/nautilus/");
    const footer = page.getByRole("contentinfo").element();
    expect(footer.textContent).toContain("Our pictures are our own.");
    expect(footer.textContent).not.toMatch(/drawings/i);
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
