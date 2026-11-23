import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { cleanupPage, describeViolations, loadPageCode, pageScanTimeout, renderPage, scan, setScheme, settle } from "../test/render";
import { sliced } from "../../test/slice";
import { latestRelease, upgrading } from "./release";
import { demos } from "./docs/demos";
import { followSystemScheme, THEME_KEY } from "./themes/prepaint";
import { choiceList } from "./voyage/presets";
import { finishReveal, previewTheme, storeTheme } from "./voyage/theme-store";
import { setXray } from "./voyage/xray-store";
import { PHONE_DEMOS } from "./components/phone-demo";
import { NO_PREVIEW } from "./components/catalog-preview";
import { patternStories } from "./components/pattern-preview";
import { PhoneStatus, phoneTime } from "./components/phone-status";
import { collectControls } from "../../test/controls";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { createRoot } from "react-dom/client";
import { SURPRISES, surpriseNav } from "./components/surprise-me";
import { docsItems, itemMarkdown, summary } from "./docs/items";
import { tries } from "./docs/tries";
import { docsPages, guidePages, platformPages, publishedMarkdown, repositoryLink } from "./docs/pages";
import { unpinnedAddresses } from "../../scripts/addresses.mjs";
import { renderToStaticMarkup } from "react-dom/server";
import { checkLabel, Markdown, parse, prose, sourceHref, sourceLabel } from "./docs/markdown";
import { headTags, homeStructuredData, SITE } from "./head";
import { componentPrompt, GUIDE_TASKS, PROMPT_SITE, withInstall } from "./docs/agent-prompt";
import { headerPath } from "./components/docs-header";
import { componentGroups, docsSections, filterHint, rankedComponents } from "./components/docs-sections";
import { bare, otherNames } from "./components/other-names";
import { guessedAddresses, href, redirects, routes } from "./routes";
import { AX_SECTION, HERO_SUBLINE, HERO_TITLE, KIT, VOYAGE_HERO, WORKS_WITH } from "./copy";
import { TWO_SHIPS } from "./voyage/copy";
import { SITE_SECTIONS } from "./voyage/site-menu";
import { agentExamples } from "./agents/examples";
import { SCENES } from "./storybook";
import shipComponents from "./docs/ship-components.json";
import parity from "../../scripts/parity-data/parity.json";
import provenance from "../../scripts/parity-data/provenance.json";
import versions from "../../scripts/parity-data/versions.json";
import { SHIP_PAGES } from "./docs/ships";
import readme from "../../README.md?raw";
import registry from "../../registry.json";
import { siteGroups } from "../../scripts/catalog-groups.mts";

await loadPageCode("/");

const llmsResponse = await fetch(href("/llms.txt"));
if (!llmsResponse.ok || !llmsResponse.headers.get("content-type")?.includes("text/plain")) {
  throw new Error("The site must serve llms.txt as plain text.");
}
const llms = await llmsResponse.text();

// The site's contract (Task 11): the hero says exactly what it should, the live Sheet
// opens, every page passes axe in light and dark at a phone and a desktop width, nothing
// overflows a 390px phone, and each registry item has its docs page at docs/<name>, the
// URL its install message points to.

beforeEach(async () => {
  await commands.emulateMedia({ reducedMotion: "no-preference" });
  setScheme("light");
});
afterEach(async () => {
  // A look the mouse rests on is previewed: the preview ends with the test, putting the chosen look back, and the mouse
  // leaves the page (as test/story-axe.ts's parkPointer does), so the next test's page does not render a look under it.
  previewTheme(null);
  await cleanupPage();
  await userEvent.hover(document.documentElement, { position: { x: -8, y: -8 }, force: true });
  setScheme("light");
});

const INIT = "npx shadcn@latest init --base base --preset nova --yes --no-monorepo";
// The upgrade note is UPGRADING.md, rendered on the Updating page; every command shows.
const upgradeCommands = parse(upgrading).flatMap((block) => (block.kind === "code" ? [block.text] : []));

describe("home page", () => {
  describe("the headline beside the story", () => {
    const root = document.documentElement;
    let was: string | null;
    let theme: string | null;
    beforeEach(() => {
      was = localStorage.getItem(THEME_KEY);
      theme = root.getAttribute("data-theme");
    });
    afterEach(async () => {
      await finishReveal();
      // The dot pressed keeps its preview while the mouse rests on it; ended here, it cannot paint its look back later.
      root.removeAttribute("data-preview-from");
      if (was === null) localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, was);
      if (theme === null) root.removeAttribute("data-theme");
      else root.setAttribute("data-theme", theme);
    });

    const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const lines = (heading: HTMLElement) => Math.round(heading.getBoundingClientRect().height / parseFloat(getComputedStyle(heading).lineHeight));

    // The looks are applied through the store the dots use, at once; one test below clicks a dot.
    it.each([1024, 1100, 1279])("is two lines in every look at %i px, so a look moves nothing below it", async (width) => {
      await page.viewport(width, 900);
      await renderPage("/");
      const heading = document.querySelector<HTMLElement>(".site-voyage-hero h1")!;
      const seen: [string, number][] = [];
      for (const choice of choiceList) {
        storeTheme({ preset: choice.name });
        await document.fonts.ready;
        await frame();
        seen.push([choice.name, lines(heading)]);
      }
      expect(seen).toEqual(choiceList.map((choice) => [choice.name, 2]));
    });

    it("stays two lines when a look is chosen from its dot", async () => {
      await page.viewport(1100, 900);
      await renderPage("/");
      const heading = document.querySelector<HTMLElement>(".site-voyage-hero h1")!;
      const dot = document.querySelector<HTMLElement>('[data-site-hero-paint] button[aria-label="Chart"]')!;
      await userEvent.click(dot, { force: true });
      await expect.poll(() => dot.getAttribute("aria-selected")).toBe("true");
      await finishReveal();
      await document.fonts.ready;
      await frame();
      expect(lines(heading)).toBe(2);
    });
  });

  it("opens on the Nautilus hero, and Come aboard goes to the Nautilus's page", async () => {
    await renderPage("/");
    const heading = page.getByRole("heading", { level: 1 });
    await expect.element(heading).toBeVisible();
    expect(heading.element().textContent).toBe(VOYAGE_HERO.title.join(" "));
    expect(page.getByRole("link", { name: "Come aboard", exact: true }).first().element().getAttribute("href")).toBe("/nautilus/");
    expect(document.body.innerText).not.toContain("compliant");
    expect(page.getByRole("navigation", { name: "Ouro UI" }).getByRole("link", { name: "llms.txt" }).element().getAttribute("href")).toBe("/llms.txt");
  });

  it("never breaks a source path after its first folder, so no short stub is left alone on a line", async () => {
    const host = await renderPage("/docs/dialog/");
    for (const path of host.querySelectorAll("[data-site-path]")) {
      const first = path.firstElementChild!;
      expect(first.textContent).toMatch(/^[^/]+\/$/);
      expect(first.querySelector("wbr")).toBeNull();
    }
  });

  it("shows each pattern live on the patterns guide, in a titled lazy frame with an Open full size link", async () => {
    const host = await renderPage("/docs/patterns/");
    const names = { "settings-page": "settings", "dashboard-page": "dashboard", "list-detail-page": "list-detail" };
    for (const [name, story] of Object.entries(names)) {
      const frame = host.querySelector<HTMLIFrameElement>(`iframe[title="${name} pattern, live"]`)!;
      expect(frame.loading).toBe("lazy");
      expect(frame.getAttribute("src")).toContain(`/storybook/iframe.html?id=reference-patterns--${story}&viewMode=story`);
      expect(frame.closest("figure")!.querySelector("a")!.textContent).toContain("Open full size");
      expect(host.textContent).toContain(`npx shadcn@latest add @ouro/${name} --yes`);
    }
  });

  it("points each pattern preview at a story that exists, since Ouro check waives the frame's address", async () => {
    const source = (await import("../../stories/reference/patterns.stories.tsx?raw")).default;
    const kebab = (word: string) => word.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
    const ids = [...source.matchAll(/export const (\w+): Story/g)].map((match) => `reference-patterns--${kebab(match[1]!)}`);
    expect(source).toContain('title: "Reference/Patterns"');
    // The settings preview starts from a made-up account that saves, so a first Save shows its busy and saved states.
    expect(source).toMatch(/<SettingsPage[^>]*initial=\{\{ name: "[^"]+"[^>]*onSave=/s);
    for (const story of Object.values(patternStories)) expect(ids).toContain(`reference-patterns--${story}`);
  });

  it("gives the docs page's install steps no history of v0.8.0 in running text", async () => {
    const host = await renderPage("/docs/dialog/");
    expect(host.textContent).not.toContain("From v0.8.0 it installs only");
  });

  it("shows the commands link in the hero on a phone, so the hand-off points to the install steps", async () => {
    await page.viewport(390, 844);
    const host = await renderPage("/");
    const link = host.querySelector(".site-install-more")!;
    expect(getComputedStyle(link).display).not.toBe("none");
    expect(link.getBoundingClientRect().height).toBeGreaterThan(0);
  });

  it("makes the header's theme chip as tall as the header links on a fine pointer", async () => {
    await page.viewport(1280, 800);
    const host = await renderPage("/docs/density/");
    const chip = host.querySelector(".site-theme-picker [data-ouro-part='trigger']")!.getBoundingClientRect().height;
    const heights = [...host.querySelectorAll("[data-ouro='navbar'] li a")].map((a) => a.getBoundingClientRect().height).filter((height) => height > 0);
    expect(heights.length).toBeGreaterThan(0);
    expect(heights).toEqual(heights.map(() => chip));
  });

  it("keeps the chosen look's wordmark on the header's theme chip while another look is previewed", async () => {
    await page.viewport(1280, 800);
    const host = await renderPage("/docs/density/");
    const trigger = host.querySelector<HTMLElement>(".site-theme-picker [data-ouro-part='trigger']")!;
    const shown = () =>
      [...trigger.querySelectorAll<HTMLElement>("[data-shows]")].filter((item) => (item.querySelector("[data-slot='theme-picker-wordmark']")?.getBoundingClientRect().width ?? 0) > 0).map((item) => item.dataset.shows);
    const chosen = shown();
    const width = trigger.getBoundingClientRect().width;
    expect(chosen).toHaveLength(1);
    const other = choiceList.find((preset) => preset.name !== chosen[0] && preset.name !== "live")!.name;
    previewTheme(other);
    await settle();
    expect(document.documentElement.getAttribute("data-theme")).toBe(other);
    expect(shown()).toEqual(chosen);
    expect(trigger.getBoundingClientRect().width).toBe(width);
  });

  it("breaks a source path after its slashes, and inside a name only when the name alone is too wide", async () => {
    const host = await renderPage("/docs/button/");
    const path = host.querySelector("[data-site-path]");
    expect(path?.querySelectorAll("wbr").length).toBeGreaterThan(0);
    expect(getComputedStyle(path!).overflowWrap).toBe("break-word");
  });

  it("shades the edges of a code block that scrolls sideways, and leaves a wrapped one plain", async () => {
    const host = await renderPage("/docs/button/");
    const blocks = [...host.querySelectorAll<HTMLElement>("pre[data-site-code]")];
    const scrolling = blocks.filter((pre) => getComputedStyle(pre).whiteSpace !== "pre-wrap");
    expect(scrolling.length).toBeGreaterThan(0);
    for (const pre of scrolling) {
      expect(pre.parentElement!.hasAttribute("data-site-code-frame")).toBe(true);
      expect(getComputedStyle(pre.parentElement!, "::before").animationName).toBe("site-code-shade-in");
    }
    for (const pre of blocks.filter((pre) => getComputedStyle(pre).whiteSpace === "pre-wrap")) expect(pre.parentElement!.hasAttribute("data-site-code-frame")).toBe(false);
  });

  it("moves the commands link to the next line whole, never leaving its last words alone", async () => {
    const host = await renderPage("/");
    const link = host.querySelector(".site-install-more");
    expect(getComputedStyle(link!).whiteSpace).toBe("nowrap");
  });

  it("collapses the header links behind the menu button below 1024px in the first paint, so a guide page's nav does not swap", async () => {
    const host = await renderPage("/docs/density/");
    expect(host.querySelector(".max-lg\\:hidden")).not.toBeNull();
  });

  it("shows two ships, the Nautilus and Spoonjoy, as showcases, each with its way in and its X-ray", async () => {
    await renderPage("/");
    const section = page.getByRole("region", { name: TWO_SHIPS.title });
    await expect.element(section.getByRole("heading", { level: 2, name: TWO_SHIPS.title })).toBeVisible();
    // Showcases, not the list of what is built with HX, and open on the page: no card box, no mock app.
    expect(section.element().textContent).toContain(TWO_SHIPS.eyebrow);
    expect(section.element().textContent).not.toMatch(/Built with Ouro HX/i);
    for (const article of section.element().querySelectorAll("article")) {
      expect(getComputedStyle(article).boxShadow).toBe("none");
      expect(getComputedStyle(article).borderBottomWidth).toBe("0px");
    }
    expect(section.element().querySelector("[data-theme]")).toBeNull();
    const nautilus = section.getByRole("article", { name: TWO_SHIPS.nautilus.title });
    const spoonjoy = section.getByRole("article", { name: TWO_SHIPS.spoonjoy.title });
    await expect.element(nautilus.getByText(TWO_SHIPS.nautilus.body)).toBeVisible();
    const links = (card: typeof nautilus) => card.getByRole("link").elements().map((link) => [link.textContent, link.getAttribute("href")]);
    expect(links(nautilus)).toEqual([
      ["Come aboard", "/nautilus/"],
      ["X-ray it", "/nautilus/?xray"],
    ]);
    expect(links(spoonjoy)).toEqual([
      ["Try the Test Kitchen", "https://spoonjoy.app/test-kitchen"],
      ["X-ray it", "https://spoonjoy.app/test-kitchen?xray"],
      ["Source", "https://github.com/spoonjoy/spoonjoy-v2"],
    ]);
    expect(spoonjoy.element().textContent).toContain(TWO_SHIPS.spoonjoy.body);
    // One showcase a row on a wide screen, each with its art: the Nautilus beside its words, Spoonjoy's shot across the row under them, wide enough to read its name tags.
    await page.viewport(1280, 800);
    const [a, b] = [nautilus.element().getBoundingClientRect(), spoonjoy.element().getBoundingClientRect()];
    expect(a.bottom).toBeLessThanOrEqual(b.top);
    const shot = spoonjoy.element().querySelector("picture:not([hidden]) img, img")!.getBoundingClientRect();
    expect(shot.width).toBeGreaterThan(b.width * 0.9);
  });

  it("has no live catalog of examples behind Show buttons", async () => {
    await renderPage("/");
    expect(page.getByRole("button", { name: /^Show .* example$/ }).elements()).toEqual([]);
    expect(document.querySelector("[data-site-demo]")).toBeNull();
  });

  it("titles the home page with Ouro UI's name and the six-word story, which a search result shows", () => {
    expect(routes.find((route) => route.path === "/")?.title).toBe(`Ouro UI: ${VOYAGE_HERO.title.join(" ")}`);
    expect(VOYAGE_HERO.title.join(" ").split(" ")).toHaveLength(6);
  });

  it("counts no components anywhere a visitor reads, and no longer says under construction", async () => {
    await renderPage("/");
    await expect.element(page.getByRole("heading", { level: 1 })).toBeVisible();
    const text = document.body.innerText;
    expect(text).not.toMatch(/under construction/i);
    expect(text).not.toMatch(/\b\d+\s+(?:Ouro HX |React )?components?\b/i);
    expect(text).not.toMatch(/\bone of \d+/);
    for (const route of routes.filter((entry) => entry.path === "/" || entry.path === "/nautilus/")) {
      expect(route.description).not.toMatch(/under construction/i);
    }
  });

  it("keeps Ouro UI as the parent, with Ouro HX and Ouro AX as parts of its kit, and never says AX is still being defined", async () => {
    await renderPage("/");
    // The site is Ouro UI; the bar names HX and AX side by side, and the kit row under the hero names its four parts, each
    // a link to where it lives: HX and AX among them, not the whole of it.
    await expect.element(page.getByRole("banner").getByRole("link", { name: "Ouro UI", exact: true })).toBeVisible();
    expect(SITE_SECTIONS.map((section) => [section.label, section.href]).slice(4, 6)).toEqual([
      ["Ouro HX", "/docs/"],
      ["Ouro AX", "/ax/"],
    ]);
    const kit = document.querySelector("[data-site-kit]")!;
    expect(kit.querySelector("h2")!.textContent).toBe("What's in the kit");
    expect([...kit.querySelectorAll("li")].map((item) => [item.querySelector("p")!.textContent, item.querySelector("h3")!.textContent, item.querySelector("a")!.getAttribute("href")])).toEqual([
      ["Ouro HX", "Screens people enjoy", "/docs/"],
      ["Ouro AX", "Tools agents can call", "/ax/"],
      ["MCP Apps and A2UI", "Cards agents compose", "/docs/ouro-mcp-app/"],
      ["X-ray and Ouro check", "Proof you can run", "/docs/guardrails/"],
    ]);
    expect([...kit.querySelectorAll(".site-kit-line")].map((line) => line.textContent)).toEqual(KIT.items.map((item) => item.line));
    await expect.element(page.getByRole("heading", { level: 2, name: AX_SECTION.title })).toBeVisible();
    await expect.element(page.getByText(AX_SECTION.intro, { exact: true })).toBeVisible();
    expect(page.getByRole("link", { name: "Be the agent" }).element().getAttribute("href")).toBe("/ax/#be-the-agent");
    expect(page.getByRole("link", { name: AX_SECTION.morning }).element().getAttribute("href")).toBe("/ax/");
    expect(page.getByRole("link", { name: AX_SECTION.guide }).element().getAttribute("href")).toBe("/docs/ax/");
    for (const text of [document.body.innerText, readme, llms]) {
      expect(text).not.toMatch(/still being defined|coming soon/i);
    }
    expect(document.body.innerText).toContain("Ouro UI: Ouro HX for people, Ouro AX for agents.");
    // The hero says what a person choosing it gets, consent built in included, in one lede at every width, and links the
    // benchmark, the model reviews and the platform gap.
    expect(document.querySelector("h1")!.parentElement!.parentElement!.textContent).toContain(VOYAGE_HERO.subline);
    // No line of it breaks inside a hyphenated word: "X-ray" once wrapped as "X-" / "ray".
    expect([...document.querySelectorAll("[data-site-whole-word]")].map((word) => word.textContent)).toEqual(VOYAGE_HERO.subline.match(/\S+-\S+/g) ?? []);
    expect([...document.querySelectorAll("[data-site-hero-links] a")].map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Agent benchmark", "/docs/agent-interfaces/"],
      ["Model reviews", "/docs/model-reviews/"],
      ["Android: emulators only", "/docs/platforms/"],
    ]);
    // The home page's title leads with the parent, Ouro UI, before what it is for.
    expect(routes[0]!.title).toMatch(/^Ouro UI: /);
    // The README opens with the ourostack brand mark every repository shares, then its title, Ouro UI, and what is its own;
    // MCP Apps and A2UI come after, under "Works with", as formats of Ouro's tree.
    const opening = readme.replace(/^<!-- ourostack:brand:start -->[\s\S]*?<!-- ourostack:brand:end -->\n\n/, "");
    expect(opening.startsWith("# Ouro UI\n\n**Delightful interfaces, by agents, for everyone.**[^for-everyone] Ouro UI is a complete kit for agents to build interfaces for people and for other agents. An agent composes an interface as data that Ouro draws natively")).toBe(true);
    // The composed tree leads beside the one action (core's 2026-11-17 record): it is the first point, before the formats.
    expect(opening).toContain("**Composed UI.**");
    expect(opening.indexOf("**Composed UI.**")).toBeLessThan(opening.indexOf("**One action declaration.**"));
    expect(opening).not.toMatch(/formats agents compose/);
    expect(opening.split("\n\n")[1]).not.toContain("A2UI");
    expect(opening.indexOf("**Works with**")).toBeGreaterThan(opening.indexOf("**X-ray checks.**"));
    expect(opening.indexOf("[A2UI](https://a2ui.org/)")).toBeGreaterThan(opening.indexOf("**Works with** [MCP Apps]"));
    // The site home says the same below the fold, in the Ouro AX section, with each format linked to its renderer's docs.
    const worksWith = document.querySelector("[data-site-works-with]")!;
    expect(worksWith.closest("#ax-section")).not.toBeNull();
    expect(worksWith.textContent).toContain(WORKS_WITH.lede);
    expect([...worksWith.querySelectorAll("a")].map((link) => [link.textContent, link.getAttribute("href")])).toEqual([...WORKS_WITH.formats, WORKS_WITH.guide].map((link) => [link.label, link.href]));
    // The tree is Ouro's own; MCP Apps and A2UI are formats it speaks, never "the formats agents compose interfaces in" (core's 2026-11-17 record).
    expect(worksWith.textContent).not.toMatch(/formats agents compose/);
    expect(worksWith.textContent).toContain("Ouro's own tree");
    expect(worksWith.textContent!.indexOf("Ouro's own tree")).toBeLessThan(worksWith.textContent!.indexOf("MCP Apps"));
    expect(document.querySelector("h1")!.parentElement!.parentElement!.textContent).not.toContain("A2UI");
    for (const link of ["https://ui.ouroboros.bot/docs/agent-interfaces/", "https://ui.ouroboros.bot/docs/model-reviews/", "docs/platforms/android.md"]) {
      expect(opening.indexOf(link)).toBeLessThan(opening.indexOf("## Ouro HX"));
    }
    expect(llms.startsWith("# Ouro HX\n")).toBe(true);
    for (const term of ["design system's tokens and theme", "`ouro-theme`", "A2UI messages", "MCP Apps view"]) {
      expect(llms).toContain(term);
    }
    for (const text of [readme, llms]) {
      expect(text).not.toMatch(/under construction/i);
      expect(text).toContain("Ouro UI");
    }
  });

  it("says in the README's at-a-glance list what Ouro UI is, in the words a search for it uses, without calling it a shadcn registry", () => {
    const bullet = readme.split("\n").find((line) => line.startsWith("- **What it is:**"))!;
    for (const term of ["React", "Base UI", "Tailwind CSS", "SwiftUI", "WinUI", "Jetpack Compose", "A2UI", "MCP Apps", "shadcn CLI"]) {
      expect(bullet).toContain(term);
    }
    expect(bullet).not.toMatch(/shadcn registry/i);
  });

  it("uses the approved rich HX artwork decoratively beside its accessible name", async () => {
    await renderPage("/");
    const home = page.getByRole("banner").getByRole("link", { name: "Ouro UI", exact: true }).element();
    expect(home.getAttribute("href")).toBe("/");
    const image = home.querySelector("img");
    expect(image).not.toBeNull();
    expect(image!.alt).toBe("");
    expect(image!.getAttribute("src")).toContain("ouro-hx-render-128.webp");
    expect(image!.srcset).toContain("ouro-hx-render-256.webp 256w");
    await image!.decode();
    const response = await fetch(image!.currentSrc);
    expect(response.ok).toBe(true);
    expect(response.headers.get("content-type")).toContain("image/webp");
    expect(image!.naturalWidth).toBeGreaterThan(0);
    expect(image!.naturalWidth).toBe(image!.naturalHeight);
    expect(image!.getBoundingClientRect().width).toBe(32);
    expect(image!.getBoundingClientRect().height).toBe(32);
  });

  it("keeps README and llms.txt's shared first lines, and describes the home page in a search result's length", () => {
    expect(routes[0]!.description.length).toBeLessThanOrEqual(160);
    expect(readme).toContain(`${HERO_TITLE} ${HERO_SUBLINE}`);
    expect(llms).toContain(`${HERO_TITLE} ${HERO_SUBLINE}`);
    for (const text of [readme, llms, routes[0]!.description]) {
      expect(text).not.toContain("handcrafted interactions");
      expect(text).not.toContain("built by agents that get them right");
    }
  });

  it("starts the install steps with shadcn's init, with the Base UI base, then pins the newest release", async () => {
    await renderPage("/");
    await expect.element(page.getByText(INIT, { exact: true })).toBeVisible();
    expect(latestRelease).toMatch(/^v\d+\.\d+\.\d+$/);
    await expect.element(page.getByText(`npx shadcn@latest add ourostack/ouro-ui/sheet#${latestRelease}`, { exact: true })).toBeVisible();
    await expect.element(page.getByText(/Without it the install fails: main has no registry\.json\./)).toBeVisible();
    await expect.element(page.getByText("npx shadcn@latest add @ouro/ouro-base @ouro/sheet", { exact: true })).toBeVisible();
    expect(page.getByRole("link", { name: "Switching from shadcn" }).element().getAttribute("href")).toBe("/docs/switching-from-shadcn/");
  });

  it("shows Spoonjoy's X-ray shot across its showcase row, AVIF first at each width", async () => {
    await renderPage("/");
    const showcase = document.querySelector("[data-site-ship='ship-spoonjoy']")!;
    const pictures = [...showcase.querySelectorAll("picture")];
    expect(pictures.map((picture) => picture.className)).toEqual(["site-ship-shot-light", "site-ship-shot-dark"]);
    for (const picture of pictures) {
      const sources = [...picture.querySelectorAll("source")];
      // A phone gets the phone capture, at its own size; every other width the wide one.
      expect(sources.map((source) => [source.type, source.media])).toEqual([
        ["image/avif", "(max-width: 639.98px)"],
        ["image/webp", "(max-width: 639.98px)"],
        ["image/avif", ""],
        ["image/webp", ""],
      ]);
      expect(sources[0]!.srcset).toMatch(/xray-phone-(light|dark)-640\.avif 640w, .*-780\.avif 780w$/);
      expect([sources[0]!.getAttribute("width"), sources[0]!.getAttribute("height")]).toEqual(["780", "1324"]);
      expect(sources[2]!.srcset).toMatch(/-640\.avif 640w, .*-2560\.avif 2560w$/);
      // The row's width as the root type grows on a 4K screen, so the browser picks a file with enough pixels.
      expect(sources[2]!.getAttribute("sizes")).toBe("(min-width: 200rem) 1500px, (min-width: 150rem) 1350px, (min-width: 79rem) 1200px, calc(100vw - 4rem)");
      const image = picture.querySelector("img")!;
      expect([image.getAttribute("width"), image.getAttribute("height"), image.loading]).toEqual(["2560", "1380", "lazy"]);
      expect(image.alt).toMatch(/^Spoonjoy's Crispy Lemon Chickpeas recipe/);
    }
    // Not a link of its own: the row's "X-ray it" already opens the Test Kitchen with X-ray on.
    expect(pictures[0]!.closest("a")).toBeNull();
    await expect.element(page.getByText(/Real app, real recipe, real chickpeas\.$/)).toBeVisible();
  });

  it("sizes the hero's and the band's wide sources for the box each draws in, and the phone sources at the full width", async () => {
    await renderPage("/");
    const hero = document.querySelector("picture[data-brand-scene='ouro-hx']")!;
    const band = document.querySelector("picture[data-brand-scene='ourostack']")!;
    const expected = [
      [hero, "(min-width: 200rem) min(1536px, 100rem), (min-width: 150rem) min(1536px, 90rem), (min-width: 80rem) min(1536px, 80rem), calc(100vw - 4rem)"],
      [band, "(min-width: 200rem) max(1536px, 98.75rem), (min-width: 150rem) max(1536px, 88.875rem), (min-width: 100rem) max(1536px, 79rem), 100vw"],
    ] as const;
    for (const [picture, sizes] of expected) {
      expect([...picture.querySelectorAll("source")].map((source) => [source.type, source.media, source.getAttribute("sizes")])).toEqual([
        ["image/avif", "(max-width: 640px)", "100vw"],
        ["image/webp", "(max-width: 640px)", "100vw"],
        ["image/avif", "", sizes],
        ["image/webp", "", sizes],
      ]);
    }
  });

  it("puts each opening line in the place its picture shows", () => {
    // A line under a picture that names a place the picture is not (a meadow over a train) reads as a mistake.
    const places = ["meadow", "hill", "train", "studio", "cabin", "deck", "kitchen", "library", "cove", "saloon", "sea", "park"];
    const sources = import.meta.glob<string>(["./**/*.tsx", "!./**/*.test.tsx"], { query: "?raw", import: "default", eager: true });
    const attribute = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}="([^"]+)"`))?.[1];
    const openers = Object.entries(sources).flatMap(([file, text]) => [
      // <StoryOpener scene="…" line="…" />, its props in any order and on any lines.
      ...[...text.matchAll(/<StoryOpener\b[^>]*>/g)].map(([tag]) => ({ file, scene: attribute(tag, "scene"), line: attribute(tag, "line") })),
      // A line written by hand in a StoryWorld band: <StoryWorld scene="…">…<p className="story-world-line">…</p>.
      ...[...text.matchAll(/<StoryWorld\b[^>]*>[\s\S]*?className="story-world-line"[^>]*>([^<]+)</g)].map(([tag, line]) => ({ file, scene: attribute(tag, "scene"), line: line!.trim() })),
      // StoryOpener's and StoryWorld's own source passes a line along as {line}: no words of its own.
    ].filter((opener) => !opener.line?.startsWith("{")));
    expect(openers.length).toBeGreaterThan(5);
    for (const { file, scene, line } of openers) {
      expect([scene, line], `${file}: an opening line with its scene`).not.toContain(undefined);
      const shown = SCENES[scene as keyof typeof SCENES].alt;
      // The line's place is a whole word ("seat" is no sea), and the picture's may be longer: "hill" is the "hillside".
      for (const place of places.filter((word) => new RegExp(`\\b${word}\\b`, "i").test(line!))) {
        expect(shown, `${file}: "${line}" names a ${place}, which ${scene} does not show`).toMatch(new RegExp(`\\b${place}`, "i"));
      }
    }
  });

  it("shows each storybook scene at night in dark mode, from its own files, lazily, and only the shown one is drawn or heard", async () => {
    await renderPage("/");
    for (const scene of ["ouro-hx", "ourostack"]) {
      const day = document.querySelector(`picture[data-brand-scene='${scene}']`)!;
      const night = document.querySelector(`picture[data-brand-scene='${scene}-dark']`)!;
      expect(night.parentElement).toBe(day.parentElement);
      expect([...night.querySelectorAll("source")].every((source) => source.srcset.split(", ").every((entry) => entry.includes(`/${scene}-dark`)))).toBe(true);
      const [dayImage, nightImage] = [day.querySelector("img")!, night.querySelector("img")!];
      expect([nightImage.loading, nightImage.fetchPriority === "high"]).toEqual(["lazy", false]);
      expect(nightImage.alt).toBe(SCENES[scene as keyof typeof SCENES].night.alt ?? dayImage.alt);
      expect(nightImage.alt).toMatch(/\b(night|moon|moonlit)\b/);
      const shown = () => [getComputedStyle(day).display, getComputedStyle(night).display];
      document.documentElement.classList.remove("dark");
      expect(shown()).toEqual(["block", "none"]);
      document.documentElement.classList.add("dark");
      expect(shown()).toEqual(["none", "block"]);
      document.documentElement.classList.remove("dark");
    }
  });

  it("lists what comes with every component beside the install steps, under hairlines", async () => {
    await renderPage("/");
    const install = document.getElementById("install")!;
    const names = [...install.querySelectorAll(".site-perks > li > h3")].map((heading) => heading.textContent);
    expect(names).toEqual(["Yours to keep", "Keeps your theme", "Phones get sheets", "Motion, minus the luggage", "Tests, if you want them", "Agents read the manual too"]);
    expect(install.querySelector(".site-perks a")!.getAttribute("href")).toBe("/llms.txt");
  });

  it("adds ouro-base once, before the first component", async () => {
    await renderPage("/");
    await expect.element(page.getByText(`npx shadcn@latest add ourostack/ouro-ui/ouro-base#${latestRelease}`, { exact: true })).toBeVisible();
  });

  it("keeps the agents section: each example with its type check, source and console line", async () => {
    await renderPage("/");
    await expect.element(page.getByRole("heading", { level: 2, name: "Agents read the types" })).toBeVisible();
    for (const example of agentExamples) {
      const item = page.getByTestId(`agent-example-${example.id}`);
      await expect.element(item).toBeVisible();
      await expect.element(item.getByText(example.devMessage, { exact: true })).toBeInTheDocument();
    }
  });
});

describe("docs", () => {
  it("sends a newcomer from the components index to the installing guide's first steps", async () => {
    await renderPage("/docs/");
    await expect.element(page.getByRole("link", { name: "Start a new app", exact: true })).toHaveAttribute("href", "/docs/installing/#start-a-new-app");
  });

  it("opens a random component with a trick to try from the docs index, rolling the names past first", async () => {
    await renderPage("/docs/");
    const link = page.getByRole("link", { name: "Surprise me", exact: true });
    // Without script it opens the first one.
    await expect.element(link).toHaveAttribute("href", href(`/docs/${SURPRISES[0]!.name}/`));
    expect(SURPRISES.length).toBeGreaterThan(5);
    for (const item of SURPRISES) expect(tries, item.name).toHaveProperty(item.name);
    const pages = SURPRISES.map((item) => href(`/docs/${item.name}/`));
    const went: string[] = [];
    const go = surpriseNav.go;
    surpriseNav.go = (url) => void went.push(new URL(url).pathname);
    try {
      await userEvent.click(link);
      const roll = page.getByText(/^ → /);
      await expect.element(roll).toBeInTheDocument();
      await expect.poll(() => went.length).toBe(1);
      expect(pages).toContain(went[0]);
      // It stops on the one it opens.
      expect(roll.element().textContent).toBe(` → ${SURPRISES[pages.indexOf(went[0]!)]!.title}`);
      // A load that never happens (stopped, or this test) leaves the link working.
      await userEvent.click(link);
      await expect.poll(() => went.length).toBe(2);
      // With reduced motion nothing rolls: the link goes straight there.
      await commands.emulateMedia({ reducedMotion: "reduce" });
      await renderPage("/docs/");
      const still = page.getByRole("link", { name: "Surprise me", exact: true });
      let opened = "";
      still.element().ownerDocument.addEventListener("click", (event) => {
        opened = (event.target as Element).closest("a")!.pathname;
        event.preventDefault();
      }, { once: true });
      await userEvent.click(still);
      expect(pages).toContain(opened);
      expect(document.querySelector("[data-site-surprise]")).toBeNull();
      expect(went).toHaveLength(2);
    } finally {
      surpriseNav.go = go;
      await commands.emulateMedia({ reducedMotion: "no-preference" });
    }
  });

  it("draws each component small beside its name on the index, a picture the row's link covers, filled as it nears the screen", async () => {
    await page.viewport(1280, 900);
    await renderPage("/docs/");
    const frames = [...document.querySelectorAll<HTMLElement>("[data-site-preview]")];
    expect(frames.map((frame) => frame.dataset["sitePreview"])).toEqual(docsItems.map((item) => item.name));
    for (const name of NO_PREVIEW) expect(Object.hasOwn(demos, name), `${name} has a demo`).toBe(true);
    // A picture: hidden from screen readers, out of the tab order and the reach of a press.
    for (const frame of frames) {
      expect(frame.getAttribute("aria-hidden")).toBe("true");
      expect(frame.inert).toBe(true);
    }
    // The first row's frame fills with its component's own demo.
    const first = frames[0]!;
    await expect.poll(() => first.querySelector("[data-ouro]") !== null).toBe(true);
    // A press on the picture lands on the row's link.
    first.scrollIntoView({ block: "center" });
    const box = first.getBoundingClientRect();
    expect(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest("a")?.getAttribute("href")).toBe(href(`/docs/${docsItems[0]!.name}/`));
    // X-ray tells what the page is made of: the pictures step out of its sight while it is on.
    setXray(true);
    try {
      await expect.poll(() => getComputedStyle(first.firstElementChild!).visibility).toBe("hidden");
    } finally {
      setXray(false);
    }
    await expect.poll(() => getComputedStyle(first.firstElementChild!).visibility).toBe("visible");
    // A row far down the page is drawn only once it nears the screen.
    const last = frames.findLast((frame) => !NO_PREVIEW.has(frame.dataset["sitePreview"]!))!;
    expect(last.children).toHaveLength(0);
    last.scrollIntoView({ block: "center" });
    // Its turn has come: the attribute is set when the frame is told to draw, before its demo's chunk has loaded, which on a
    // cold cache can take longer than a poll (the demo's own drawing is the first row's check above).
    await expect.poll(() => last.hasAttribute("data-site-preview-drawn")).toBe(true);
    // A demo that runs something for the whole page stays a plain frame.
    const at = frames.findIndex((frame) => NO_PREVIEW.has(frame.dataset["sitePreview"]!) && frames[frames.indexOf(frame) + 1] && !NO_PREVIEW.has(frames[frames.indexOf(frame) + 1]!.dataset["sitePreview"]!));
    frames[at]!.scrollIntoView({ block: "center" });
    // Its neighbour, drawn with it, says the frames there have had their turn.
    await expect.poll(() => frames[at + 1]!.hasAttribute("data-site-preview-drawn")).toBe(true);
    expect(frames[at]!.children).toHaveLength(0);
  });

  it("fades a preview in, and with reduced motion only fades it, faster: nothing moves", async () => {
    await commands.emulateMedia({ reducedMotion: "reduce" });
    try {
      await page.viewport(1280, 900);
      await renderPage("/docs/");
      const first = document.querySelector<HTMLElement>("[data-site-preview]")!;
      first.scrollIntoView({ block: "center" });
      await expect.poll(() => first.firstElementChild).not.toBeNull();
      const style = getComputedStyle(first.firstElementChild!);
      expect(style.transitionProperty).toBe("opacity");
      const seconds = (time: string) => (time.endsWith("ms") ? parseFloat(time) / 1000 : parseFloat(time));
      expect(seconds(style.transitionDuration)).toBe(seconds(getComputedStyle(document.documentElement).getPropertyValue("--ouro-duration-fast").trim()));
    } finally {
      await commands.emulateMedia({ reducedMotion: "no-preference" });
    }
  });

  it("keeps linked guide summaries as text inside their catalog links", async () => {
    expect(summary("# Guide\n\nRead [the `Form` guide](form.md). More detail.")).toBe("Read the `Form` guide.");
    const host = await renderPage("/docs/");
    expect(host.querySelector("a a")).toBeNull();
    const comparison = host.querySelector<HTMLAnchorElement>('section[aria-labelledby="group-guides"] a[href$="/docs/why-no-skill-settings-form/"]');
    expect(comparison?.textContent).toContain("Comparison overview, scores, protocol and limits");
  });

  it("opens a docs page on the registry Hero: its scene contained, by day and at night, a band on a component page and the whole scene on a platform page", async () => {
    await page.viewport(1440, 900);
    await renderPage("/docs/button/");
    const opener = document.querySelector<HTMLElement>('section[aria-labelledby="page-title"]')!;
    expect(opener.querySelector('[data-ouro="hero"]')).not.toBeNull();
    expect(getComputedStyle(opener).backgroundImage).toBe("none");
    const shown = () => [...opener.querySelectorAll<HTMLElement>("picture[data-scheme]")].filter((picture) => getComputedStyle(picture).display !== "none").map((picture) => picture.dataset.scheme);
    expect(shown()).toEqual(["light"]);
    const media = opener.querySelector<HTMLElement>('[data-slot="media"]')!;
    const { width, height } = media.getBoundingClientRect();
    expect(width).toBeLessThanOrEqual(1280);
    expect(width / height).toBeCloseTo(3, 1);
    const [day, night] = [...opener.querySelectorAll<HTMLImageElement>('img[data-slot="image"]')];
    expect(night!.getAttribute("src")).not.toBe(day!.getAttribute("src"));
    setScheme("dark");
    expect(shown()).toEqual(["dark"]);
    await renderPage("/docs/platforms/apple/");
    const whole = document.querySelector<HTMLElement>('section[aria-labelledby="page-title"] [data-slot="media"]')!.getBoundingClientRect();
    const art = document.querySelector<HTMLImageElement>('section[aria-labelledby="page-title"] img[data-slot="image"]')!;
    expect(whole.width / whole.height).toBeCloseTo(Number(art.getAttribute("width")) / Number(art.getAttribute("height")), 1);
  });

  it("marks a docs page's opener with its brand scene, and on a phone shows the scene's phone crop at its own shape", async () => {
    await page.viewport(390, 844);
    await renderPage("/docs/");
    const opener = document.querySelector<HTMLElement>('section[aria-labelledby="page-title"]')!;
    expect(opener.dataset.brandScene).toBe("ouro-ui-core");
    const [day, night] = [...opener.querySelectorAll<HTMLImageElement>('img[data-slot="image"]')];
    await expect.poll(() => day!.currentSrc).toMatch(/\/brand\/storybook\/phone\/ouro-ui-core-\d+\.(avif|webp)$/);
    // The box takes the phone source's shape once the browser lays it out, which can come a frame after currentSrc (#2353).
    const shape = () => {
      const media = opener.querySelector<HTMLElement>('[data-slot="media"]')!.getBoundingClientRect();
      return Math.round((media.width / media.height) * 10) / 10;
    };
    await expect.poll(shape).toBe(Math.round((768 / SCENES["ouro-ui-core"].phoneHeight) * 10) / 10);
    const nightPhone = night!.closest("picture")!.querySelector<HTMLSourceElement>('source[media="(max-width: 640px)"]')!;
    expect(nightPhone.srcset).toContain("phone/ouro-ui-core-dark-768.");
  });

  it("on a phone, the home page's hand-off sits above the scene, with its Copy button on the first screen", async () => {
    await page.viewport(390, 844);
    await renderPage("/");
    const hero = document.querySelector<HTMLElement>(".site-voyage-hero")!;
    const more = hero.querySelector<HTMLElement>('[data-slot="more"]')!;
    const media = hero.querySelector<HTMLElement>('[data-slot="media"]')!;
    await expect.poll(() => more.getBoundingClientRect().bottom).toBeLessThanOrEqual(844);
    expect(more.getBoundingClientRect().bottom).toBeLessThanOrEqual(media.getBoundingClientRect().top);
    expect(getComputedStyle(hero.querySelector("h1")!).fontSize).toBe("32px");
  });

  it("on a phone, the menu's search says what another kit's name is called here", async () => {
    await page.viewport(390, 844);
    await renderPage("/docs/button/");
    await userEvent.click(document.querySelector<HTMLElement>("[data-ouro-navbar-menu]")!);
    const search = page.getByRole("searchbox", { name: "Find a page or component" });
    await userEvent.fill(search, "modal");
    await expect.element(page.getByRole("status").filter({ hasText: "Looking for" })).toHaveTextContent("Looking for a modal? Here it's Dialog.");
    await expect.element(page.getByRole("link", { name: "Dialog", exact: true })).toBeVisible();
    // A page's own name: the count, for a screen reader only. "panel" is Card elsewhere, but ResizablePanel holds it.
    for (const own of ["dialog", "panel"]) {
      await userEvent.fill(search, own);
      await expect.element(page.getByRole("status").filter({ hasText: /\d+ found/ })).toBeInTheDocument();
      expect(document.body.textContent).not.toContain("Looking for");
    }
  });

  it("lists the components in the sidebar under a label per catalog group, with Start first, then Guides, and Platforms last", async () => {
    await page.viewport(1280, 900);
    await renderPage("/docs/checklist/");
    // The sidebar is an island of its own (components/docs-shell.tsx), drawn once its chunk loads.
    await expect.poll(() => document.querySelector("aside [data-ouro-sidebar-scroll]")).not.toBeNull();
    const nav = page.getByRole("navigation", { name: "Docs" });
    const groups = siteGroups.filter((group) => docsItems.some((item) => item.group === group));
    for (const group of groups) {
      const list = nav.getByRole("list", { name: group, exact: true });
      expect(list.getByRole("link").elements().map((link) => link.textContent), group).toEqual(docsItems.filter((item) => item.group === group).map((item) => item.title));
    }
    const labels = docsSections().map((section) => section.label);
    expect(labels).toEqual(["Start", ...groups, "Guides", "Platforms"]);
    await expect.element(nav.getByRole("link", { name: "Checklist", exact: true })).toHaveAttribute("aria-current", "page");
    // The sidebar scrolls on its own, opened where the current page shows: within its box, and above the window's foot.
    const scroller = nav.element().querySelector<HTMLElement>("[data-ouro-sidebar-scroll]")!;
    expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight);
    const shows = () => {
      const box = scroller.getBoundingClientRect();
      return (element: Element) => {
        const rect = element.getBoundingClientRect();
        return rect.top >= box.top && rect.bottom <= Math.min(box.bottom, innerHeight);
      };
    };
    expect(shows()(nav.getByRole("link", { name: "Checklist", exact: true }).element())).toBe(true);
  });

  it("on a window too short for the whole sidebar, opens it on the current page's group, never past its top", async () => {
    await page.viewport(1280, 640);
    await renderPage("/docs/platforms/windows/");
    await expect.poll(() => document.querySelector("aside [data-ouro-sidebar-scroll]")).not.toBeNull();
    const nav = page.getByRole("navigation", { name: "Docs" });
    const scroller = nav.element().querySelector<HTMLElement>("[data-ouro-sidebar-scroll]")!;
    await expect.poll(() => scroller.scrollTop).toBeGreaterThan(0);
    const box = scroller.getBoundingClientRect();
    for (const element of [nav.getByText("Platforms", { exact: true }).element(), nav.getByRole("link", { name: "For Windows", exact: true }).element()]) {
      const rect = element.getBoundingClientRect();
      expect(rect.top, element.textContent ?? "").toBeGreaterThanOrEqual(box.top);
      expect(rect.bottom, element.textContent ?? "").toBeLessThanOrEqual(box.bottom);
    }
  });

  it("starts a filtered sidebar at its first match, without the room the current page's group needed", async () => {
    await page.viewport(1280, 800);
    await renderPage("/docs/platforms/windows/");
    await expect.poll(() => document.querySelector("aside [data-ouro-sidebar-scroll]")).not.toBeNull();
    const nav = page.getByRole("navigation", { name: "Docs" });
    const scroller = nav.element().querySelector<HTMLElement>("[data-ouro-sidebar-scroll]")!;
    await expect.poll(() => scroller.scrollTop).toBeGreaterThan(0);
    await userEvent.fill(nav.getByRole("searchbox", { name: "Filter components" }), "in");
    await expect.poll(() => scroller.scrollTop).toBe(0);
    expect(scroller.style.paddingBottom).toBe("");
    const first = nav.getByRole("link").elements()[0]!;
    expect(first.getBoundingClientRect().top).toBeGreaterThanOrEqual(scroller.getBoundingClientRect().top);
  });

  it("opens the sidebar with the current page's group label in view too, where the window leaves room for the whole group", async () => {
    await page.viewport(1280, 1100);
    await renderPage("/docs/checklist/");
    await expect.poll(() => document.querySelector("aside [data-ouro-sidebar-scroll]")).not.toBeNull();
    const nav = page.getByRole("navigation", { name: "Docs" });
    const box = nav.element().querySelector<HTMLElement>("[data-ouro-sidebar-scroll]")!.getBoundingClientRect();
    for (const element of [nav.getByText("Lists", { exact: true }).element(), nav.getByRole("link", { name: "Checklist", exact: true }).element()]) {
      const rect = element.getBoundingClientRect();
      expect(rect.top, element.textContent ?? "").toBeGreaterThanOrEqual(box.top);
      expect(rect.bottom, element.textContent ?? "").toBeLessThanOrEqual(Math.min(box.bottom, innerHeight));
    }
  });

  it("opens the sidebar with the current page in view on a platform page, the last group in it", async () => {
    await page.viewport(1280, 800);
    await renderPage("/docs/platforms/windows/");
    await expect.poll(() => document.querySelector("aside [data-ouro-sidebar-scroll]")).not.toBeNull();
    const nav = page.getByRole("navigation", { name: "Docs" });
    const current = nav.getByRole("link", { name: "For Windows", exact: true });
    await expect.element(current).toHaveAttribute("aria-current", "page");
    // Platforms is the sidebar's last group, so only room under the list lets it scroll up into the part that shows.
    const scroller = nav.element().querySelector<HTMLElement>("[data-ouro-sidebar-scroll]")!;
    await expect.poll(() => current.element().getBoundingClientRect().bottom).toBeLessThanOrEqual(innerHeight);
    expect(current.element().getBoundingClientRect().top).toBeGreaterThanOrEqual(scroller.getBoundingClientRect().top);
  });

  it("narrows the sidebar to the components a filter names, and says when none is called that", async () => {
    await page.viewport(1280, 900);
    await renderPage("/docs/");
    const nav = page.getByRole("navigation", { name: "Docs" });
    await userEvent.fill(nav.getByRole("searchbox", { name: "Filter components" }), "text field");
    expect(nav.getByRole("link").elements().map((link) => link.textContent)).toEqual(["TextField"]);
    await expect.element(nav.getByRole("list", { name: "Forms", exact: true })).toBeVisible();
    await userEvent.fill(nav.getByRole("searchbox", { name: "Filter components" }), "zzz");
    // No component's link; the line under the filter offers to ask for one.
    expect(nav.getByRole("link").elements().filter((link) => !link.closest('[role="status"]'))).toHaveLength(0);
    await expect.poll(() => nav.getByRole("status").query()?.textContent?.replace(/\s+/g, " ")).toMatch(/^No component is called that\. Want one\? Ask for “zzz”/);
  });

  it("turns a filter that finds nothing into a request for it, filled in on GitHub", async () => {
    await page.viewport(1280, 900);
    await renderPage("/docs/");
    const nav = page.getByRole("navigation", { name: "Docs" });
    await userEvent.fill(nav.getByRole("searchbox", { name: "Filter components" }), "  zzz   gizmo ");
    const ask = nav.getByRole("status").getByRole("link", { name: /^Ask for “zzz gizmo”/ });
    await expect.element(ask).toBeVisible();
    const url = new URL(ask.element().getAttribute("href")!);
    expect(`${url.origin}${url.pathname}`).toBe("https://github.com/ourostack/ouro-ui/issues/new");
    expect(url.searchParams.get("title")).toBe("Component request: zzz gizmo");
    expect(url.searchParams.get("body")).toContain('"zzz gizmo"');
    await expect.element(ask).toHaveAttribute("target", "_blank");
    // A long one is cut short in the sentence, never in the request.
    const long = "a component that does a great many things at once";
    await userEvent.fill(nav.getByRole("searchbox", { name: "Filter components" }), long);
    const cut = nav.getByRole("status").getByRole("link", { name: /^Ask for “.{31}…”/ });
    await expect.element(cut).toBeVisible();
    expect(new URL(cut.element().getAttribute("href")!).searchParams.get("title")).toBe(`Component request: ${long}`);
  });

  it("forgives one slip in a filter of four letters or more, after the names that hold it", async () => {
    await page.viewport(1280, 900);
    await renderPage("/docs/");
    const nav = page.getByRole("navigation", { name: "Docs" });
    const filter = nav.getByRole("searchbox", { name: "Filter components" });
    for (const typed of ["dialg", "dailog"]) {
      await userEvent.fill(filter, typed);
      expect(nav.getByRole("link").elements().map((link) => link.textContent)).toContain("Dialog");
    }
    // A slip of "sheet".
    await userEvent.fill(filter, "shet");
    expect(nav.getByRole("link").elements().map((link) => link.textContent)).toContain("Sheet");
    // Three letters must be exact.
    await userEvent.fill(filter, "dlg");
    // No component's link: only the line that offers to ask for one.
    expect(nav.getByRole("link").elements().filter((link) => !link.closest('[role="status"]'))).toHaveLength(0);
  });

  it("finds a component by the name another kit gives it, and says what it is called here", async () => {
    await page.viewport(1280, 900);
    await renderPage("/docs/");
    const nav = page.getByRole("navigation", { name: "Docs" });
    const filter = nav.getByRole("searchbox", { name: "Filter components" });
    const found = () => nav.getByRole("link").elements().map((link) => link.textContent);
    await userEvent.fill(filter, "modal");
    expect(found()).toEqual(["Dialog"]);
    await expect.element(nav.getByRole("status")).toHaveTextContent("Looking for a modal? Here it's Dialog.");
    // Half a word is enough, and a name two components share names both.
    await userEvent.fill(filter, "dropd");
    expect(found()).toEqual(["Select", "Menu"]);
    await expect.element(nav.getByRole("status")).toHaveTextContent("Looking for a dropdown? Here it's Select or Menu.");
    // A later word of another name finds it too, after the components whose own name holds the filter.
    await userEvent.fill(filter, "picker");
    expect(found()).toEqual(expect.arrayContaining(["DatePicker", "Select", "ColorField", "EmojiPicker"]));
    expect(found().indexOf("DatePicker")).toBeLessThan(found().indexOf("Select"));
    // A component's own name wins: no line sends you past Select to another kit's "multi-select".
    for (const own of ["picker", "select", "button"]) {
      await userEvent.fill(filter, own);
      await expect.element(nav.getByRole("status")).not.toBeInTheDocument();
    }
    // An export's name (ResizablePanel) is not in the sidebar, so it doesn't hide the line.
    await userEvent.fill(filter, "panel");
    await expect.element(nav.getByRole("status")).toHaveTextContent("Looking for a panel? Here it's Card.");
    // Never from the middle of a word: "own" is in "dropdown", but nobody means Menu by it.
    await userEvent.fill(filter, "own");
    expect(found()).not.toContain("Menu");
  });

  it("lists the components whose own name holds the search first in the header's search, whatever their group", () => {
    const labels = rankedComponents("list").map((link) => link.label);
    // Select is a listbox elsewhere, but Enter should open a list.
    expect(labels.slice(0, 2)).not.toContain("Select");
    expect(labels).toContain("Select");
    expect(labels.indexOf("Select")).toBeGreaterThan(labels.indexOf("ConversationList"));
  });

  it("names only components that exist by another name, and none by a name that already finds it", () => {
    const names = new Set(docsItems.map((item) => item.name));
    for (const [name, phrases] of Object.entries(otherNames)) {
      expect(names.has(name), `${name} is a component`).toBe(true);
      const item = docsItems.find((entry) => entry.name === name)!;
      for (const phrase of phrases) {
        expect(componentGroups(bare(phrase)).flatMap((group) => group.links).map((link) => link.label), `"${phrase}" finds ${item.title}`).toContain(item.title);
        // The line names it, unless another page's own name holds the phrase ("picker" is DatePicker's), when no line shows.
        const hint = filterHint(bare(phrase));
        if (hint !== undefined) expect(hint, `"${phrase}"'s line`).toContain(item.title);
      }
    }
  });

  it("sends the addresses agents guess on to the page they meant, an export's own name included", () => {
    const pages = new Set(routes.map((route) => route.path));
    expect(guessedAddresses).toContainEqual({ from: "/docs/A2UISurface/", to: "/docs/a2ui-surface/" });
    expect(guessedAddresses).toContainEqual({ from: "/docs/ouro-ax/", to: "/docs/ax/" });
    expect(guessedAddresses).toContainEqual({ from: "/docs/composed/", to: "/docs/composed-ui/" });
    // Another kit's name for one component, with a line that says so for an agent that reads the page.
    expect(guessedAddresses).toContainEqual({ from: "/docs/modal/", to: "/docs/dialog/", note: "A modal is called Dialog in Ouro HX." });
    expect(guessedAddresses).toContainEqual({ from: "/docs/input-otp/", to: "/docs/otp-field/", note: "shadcn's InputOTP is called OtpField in Ouro HX." });
    // A name two components share is left to the lost page, which names both.
    expect(guessedAddresses.some(({ from }) => from === "/docs/dropdown/")).toBe(false);
    for (const { from, to } of guessedAddresses) {
      expect(pages.has(to), `${from} goes to ${to}, a page`).toBe(true);
      // A case-insensitive file system would write the redirect over the page itself.
      expect([...pages].some((path) => path.toLowerCase() === from.toLowerCase()), `${from} is no page in any letter case`).toBe(false);
      expect(guessedAddresses.filter((other) => other.from.toLowerCase() === from.toLowerCase()), `${from} is no other redirect in any letter case`).toHaveLength(1);
    }
    expect(redirects).toEqual(expect.arrayContaining(guessedAddresses));
  });

  it("jumps to the filter on /, and Enter opens the closest match", async () => {
    await page.viewport(1280, 900);
    await renderPage("/docs/button/");
    const nav = page.getByRole("navigation", { name: "Docs" });
    const filter = nav.getByRole("searchbox", { name: "Filter components" });
    expect(filter.element().getAttribute("aria-keyshortcuts")).toBe("/");
    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.keyboard("/");
    expect(document.activeElement).toBe(filter.element());
    // The "/" moved focus; it typed nothing, and inside the field it is just a character.
    expect(filter.element()).toHaveValue("");
    await userEvent.keyboard("a/b");
    expect(filter.element()).toHaveValue("a/b");
    const opened: string[] = [];
    const keep = (event: MouseEvent) => {
      const link = (event.target as Element).closest("a");
      if (link) {
        event.preventDefault();
        opened.push(link.getAttribute("href")!);
      }
    };
    document.addEventListener("click", keep, true);
    try {
      await userEvent.fill(filter, "modal");
      await userEvent.keyboard("{Enter}");
      // A component's own name wins over another kit's, even from a later group: "list" opens a list, not Select.
      await userEvent.fill(filter, "list");
      await userEvent.keyboard("{Enter}");
      await userEvent.fill(filter, "zzz");
      await userEvent.keyboard("{Enter}");
      // A second "/" is typed into the field: it filters nothing, so Enter opens nothing.
      await userEvent.fill(filter, "/");
      await userEvent.keyboard("{Enter}");
    } finally {
      document.removeEventListener("click", keep, true);
    }
    expect(opened).toEqual(["/docs/dialog/", "/docs/description-list/"]);
  });

  it("says what to try under a demo whose best trick is hidden, and nothing under one whose trick shows", async () => {
    for (const name of Object.keys(tries)) expect(Object.hasOwn(demos, name) && docsItems.some((item) => item.name === name), `${name} has a demo`).toBe(true);
    await renderPage("/docs/sheet/");
    const demo = page.getByRole("region", { name: "Live demo" }).element();
    const line = document.querySelector("[data-site-try]")!;
    expect(line.textContent).toBe(`Try it: ${tries.sheet}`);
    // Right under the demo it is about.
    expect(demo.nextElementSibling).toBe(line);
    await renderPage("/docs/card/");
    expect(document.querySelector("[data-site-try]")).toBeNull();
  });

  it("says what to try under the Timer, Celebrate, Combobox and Carousel demos: a reload, the confetti, the phone sheet and the keys", async () => {
    for (const [name, words] of [["timer", "reload the page"], ["celebrate", "Confetti"], ["combobox", "sheet"], ["carousel", "arrow keys"]] as const) {
      await renderPage(`/docs/${name}/`);
      const line = document.querySelector("[data-site-try]");
      expect(line?.textContent, name).toBe(`Try it: ${tries[name]}`);
      expect(line?.textContent, name).toContain(words);
    }
  });

  it("makes a row of looks one Tab stop, moves between them with the arrow keys, and rings focus as it rings the chosen look", async () => {
    await page.viewport(1280, 900);
    await renderPage("/docs/button/");
    const looks = page.getByRole("group", { name: "Try a look" });
    await expect.element(looks).toBeVisible();
    const dots = looks.getByRole("button").elements() as HTMLElement[];
    expect(dots.filter((dot) => dot.tabIndex === 0)).toHaveLength(1);
    const stop = dots.find((dot) => dot.tabIndex === 0)!;
    stop.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(dots[(dots.indexOf(stop) + 1) % dots.length]);
    await userEvent.keyboard("{End}");
    expect(document.activeElement).toBe(dots.at(-1));
    await userEvent.keyboard("{Home}{ArrowLeft}");
    expect(document.activeElement).toBe(dots.at(-1));
    const ring = (dot: HTMLElement) => {
      const swatch = getComputedStyle(dot.querySelector("[data-theme]")!);
      return [swatch.outlineWidth, swatch.outlineOffset];
    };
    const chosen = dots.find((dot) => dot.getAttribute("aria-pressed") === "true")!;
    const chosenRing = ring(chosen);
    chosen.focus();
    await userEvent.keyboard("{ArrowRight}{ArrowLeft}");
    expect(getComputedStyle(chosen).outlineStyle).toBe("none");
    expect(ring(chosen)).toEqual([chosenRing[0], "3px"]);
  });

  it("repaints the page, demo and all, from a look under the demo, and keeps its room so nothing moves", async () => {
    await page.viewport(1280, 900);
    const root = document.documentElement;
    const was = localStorage.getItem(THEME_KEY);
    const attributes = ["data-theme", "data-preview-from", "data-live", "data-sky", "data-season", "data-weather"].map((name) => [name, root.getAttribute(name)] as const);
    const live = document.getElementById("ouro-live")?.textContent;
    try {
      await renderPage("/docs/button/");
      const looks = page.getByRole("group", { name: "Try a look" });
      await expect.element(looks).toBeVisible();
      expect(looks.getByRole("button").elements().map((dot) => dot.getAttribute("aria-label"))).toEqual(choiceList.map((item) => `${item.label} look`));
      // In the box's own room, under the demo, so it moved nothing when it arrived.
      const box = page.getByRole("region", { name: "Live demo" }).element().getBoundingClientRect();
      const demo = document.querySelector("[data-site-demo]")!.getBoundingClientRect();
      const row = looks.element().getBoundingClientRect();
      expect(row.top).toBeGreaterThanOrEqual(demo.bottom);
      expect(row.bottom).toBeLessThanOrEqual(box.bottom);
      // Flicked through, each pressed mid-reveal: every press lands (force: no waiting for the reveal to end).
      for (const name of ["Coral", "Abyss", "Brass"]) {
        await userEvent.click(looks.getByRole("button", { name: `${name} look` }), { force: true });
        await expect.poll(() => root.getAttribute("data-theme")).toBe(name.toLowerCase());
        await expect.element(looks.getByRole("button", { name: `${name} look` })).toHaveAttribute("aria-pressed", "true");
      }
    } finally {
      await finishReveal();
      if (was === null) localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, was);
      for (const [name, value] of attributes) {
        if (value === null) root.removeAttribute(name);
        else root.setAttribute(name, value);
      }
      if (live !== undefined && !document.getElementById("ouro-live")) {
        const style = document.createElement("style");
        style.id = "ouro-live";
        style.textContent = live;
        document.head.append(style);
      }
    }
  });

  it("shows a demo on a phone's width at the press of Phone, where the phone's layout differs", async () => {
    await page.viewport(1280, 900);
    await renderPage("/docs/dialog/");
    const phone = page.getByRole("button", { name: "Phone" });
    await userEvent.click(phone);
    await expect.element(phone).toHaveAttribute("aria-pressed", "true");
    const frame = page.getByTitle("Dialog on a phone").element() as HTMLIFrameElement;
    expect(frame.getAttribute("src")).toBe("/docs/demo/?name=dialog");
    // A phone's width, so the demo's media queries see a phone.
    expect(frame.getBoundingClientRect().width).toBeCloseTo(390, -1);
    await userEvent.click(phone);
    await expect.poll(() => document.querySelector('[data-site-demo="dialog"]')).not.toBeNull();
    // Nothing to show where the phone's layout is the same, nor on a phone itself.
    await renderPage("/docs/card/");
    expect(page.getByRole("button", { name: "Phone" }).elements()).toHaveLength(0);
    await page.viewport(390, 844);
    await renderPage("/docs/dialog/");
    expect(getComputedStyle(document.querySelector("[data-site-phone]")!).display).toBe("none");
  });

  it("tops the phone's frame with a status bar: the reader's own time, and under Live their own sky", async () => {
    expect(phoneTime(new Date(2026, 10, 18, 21, 41), "en-US")).toBe("9:41");
    expect(phoneTime(new Date(2026, 10, 18, 21, 41), "en-GB")).toBe("21:41");
    const root = document.documentElement;
    const attributes = ["data-live", "data-sky"].map((name) => [name, root.getAttribute(name)] as const);
    try {
      root.removeAttribute("data-live");
      await page.viewport(1280, 900);
      await renderPage("/docs/dialog/");
      await userEvent.click(page.getByRole("button", { name: "Phone" }));
      const bar = () => document.querySelector<HTMLElement>("[data-site-phone-status]")!;
      await expect.poll(() => bar()?.textContent).toMatch(/^\d{1,2}:\d{2}$/);
      expect([phoneTime(new Date(Date.now() - 60_000)), phoneTime(new Date())]).toContain(bar().textContent);
      expect(bar().getAttribute("aria-hidden")).toBe("true");
      // The frame's screen is a phone's width, under the bar.
      expect((page.getByTitle("Dialog on a phone").element() as HTMLIFrameElement).getBoundingClientRect().width).toBeCloseTo(390, -1);
      // No sky but Live's.
      expect(bar().querySelector("svg")).toBeNull();
      root.setAttribute("data-live", "");
      root.setAttribute("data-sky", "night");
      await expect.poll(() => bar().dataset["sitePhoneStatus"]).toBe("night");
      expect(bar().querySelector("svg")).not.toBeNull();
      root.setAttribute("data-sky", "dawn");
      await expect.poll(() => bar().dataset["sitePhoneStatus"]).toBe("dawn");
    } finally {
      for (const [name, value] of attributes) {
        if (value === null) root.removeAttribute(name);
        else root.setAttribute(name, value);
      }
    }
  });

  it("reads the phone bar's time once a minute, so a render as the reader's clock turns over reads one time throughout (#2679)", async () => {
    // A clock that moves on a minute each time it is read: the worst case of a render that crosses a minute boundary.
    const RealDate = Date;
    let now = new RealDate(2026, 10, 18, 21, 41, 59, 999).getTime();
    class Ticking extends RealDate {
      constructor(...args: [] | [number]) {
        if (args.length === 0) {
          super(now);
          now += 60_000;
        } else super(args[0]);
      }
      static override now() {
        return now;
      }
    }
    globalThis.Date = Ticking as DateConstructor;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => root.render(<PhoneStatus />));
      expect(host.querySelector("[data-site-phone-status]")!.textContent).toMatch(/^\d{1,2}:\d{2}$/);
    } finally {
      globalThis.Date = RealDate;
      await act(async () => root.unmount());
      host.remove();
    }
  });

  it("follows a look chosen in another page of the site, as the phone's frame follows the page around it", async () => {
    const root = document.documentElement;
    const was = localStorage.getItem(THEME_KEY);
    const attributes = ["data-theme", "data-live", "data-sky", "data-season", "data-weather"].map((name) => [name, root.getAttribute(name)] as const);
    const dark = root.classList.contains("dark");
    const live = document.getElementById("ouro-live")?.textContent;
    const stop = followSystemScheme();
    try {
      localStorage.setItem(THEME_KEY, JSON.stringify({ preset: "coral", mode: "dark" }));
      dispatchEvent(new StorageEvent("storage", { key: THEME_KEY }));
      expect([root.getAttribute("data-theme"), root.classList.contains("dark"), root.hasAttribute("data-live")]).toEqual(["coral", true, false]);
      localStorage.setItem(THEME_KEY, JSON.stringify({ preset: "live", mode: "light" }));
      dispatchEvent(new StorageEvent("storage", { key: THEME_KEY }));
      expect([root.classList.contains("dark"), root.hasAttribute("data-live")]).toEqual([false, true]);
    } finally {
      stop();
      if (was === null) localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, was);
      for (const [name, value] of attributes) {
        if (value === null) root.removeAttribute(name);
        else root.setAttribute(name, value);
      }
      if (live === undefined) document.getElementById("ouro-live")?.remove();
      else document.getElementById("ouro-live")!.textContent = live;
      root.classList.toggle("dark", dark);
    }
  });

  it("has a page for one component's demo alone, named by the address, for the phone's frame", async () => {
    const was = location.pathname + location.search;
    history.replaceState(null, "", "/docs/demo/?name=edit-sheet");
    try {
      await renderPage("/docs/demo/");
      await expect.element(page.getByRole("heading", { level: 1, name: "EditSheet live demo" })).toBeInTheDocument();
      await expect.poll(() => document.querySelector('[data-site-demo="edit-sheet"]')).not.toBeNull();
      expect(document.querySelector("[data-site-brand]")).toBeNull();
      expect(routes.find((route) => route.path === "/docs/demo/")?.noindex).toBe(true);
    } finally {
      history.replaceState(null, "", was);
    }
    for (const name of PHONE_DEMOS) expect(Object.hasOwn(demos, name), `${name} has a demo`).toBe(true);
  });

  it("hands a component to the reader's agent first under Install, pointing it at the page's own Markdown", async () => {
    await page.viewport(1280, 900);
    await renderPage("/docs/dialog/");
    const handoff = [...document.querySelectorAll("figure")].find((figure) => figure.querySelector("figcaption")?.textContent?.startsWith("Hand it to your agent"))!;
    expect(handoff.querySelector("code")!.textContent).toBe("Add Dialog from Ouro UI to this app. Read https://ui.ouroboros.bot/docs/dialog.md first and follow it.");
    await expect.element(page.getByRole("button", { name: "Copy Hand it to your agent" })).toBeVisible();
    // On a phone the address breaks after a "/", never inside a name.
    expect(handoff.querySelectorAll("code wbr").length).toBeGreaterThan(2);
    // First under Install, before the commands a person runs.
    const byHand = page.getByText(/^Or by hand\./).element();
    expect(document.getElementById("install")!.compareDocumentPosition(handoff) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(handoff.compareDocumentPosition(byHand) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The address is the site's, and every component's Markdown is published there (site/scripts/prerender.mts).
    expect(PROMPT_SITE).toBe(SITE);
    for (const item of docsItems) expect(componentPrompt(item.title, item.name)).toContain(`${SITE}/docs/${item.name}.md `);
    // The page it follows says how to install the component, before it imports it.
    const published = withInstall(publishedMarkdown(itemMarkdown(docsItems.find((item) => item.name === "dialog")!), "docs/Dialog.md"), "dialog", "v9.9.9");
    expect(published).toMatch(/## Install[\s\S]*ouro-ui\/ouro-base#v9\.9\.9[\s\S]*ouro-ui\/dialog#v9\.9\.9[\s\S]*```tsx\nimport \{ Dialog \}/);
  });

  it("hands a guide's task to the reader's agent under its lead, and gives a guide that only explains none", async () => {
    await page.viewport(1280, 900);
    for (const name of Object.keys(GUIDE_TASKS)) expect(guidePages.some((guide) => guide.name === name), `${name} is a guide`).toBe(true);
    await renderPage("/docs/theming/");
    const handoff = () => [...document.querySelectorAll("figure")].find((figure) => figure.querySelector("figcaption")?.textContent?.startsWith("Hand it to your agent"));
    expect(handoff()!.querySelector("code")!.textContent).toBe("Give this app its own Ouro UI theme. Read https://ui.ouroboros.bot/docs/theming.md first and follow it.");
    await expect.element(page.getByRole("button", { name: "Copy Hand it to your agent" })).toBeVisible();
    // Right under the lead, before the guide's own words.
    const lead = document.querySelector("main p")!;
    expect(lead.compareDocumentPosition(handoff()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await renderPage("/docs/why-no-skill/");
    expect(handoff()).toBeUndefined();
  });

  it("has a page for every registry item at docs/<name>", () => {
    const names = registry.items.filter((item) => item.type === "registry:ui").map((item) => item.name);
    expect(names).toEqual(expect.arrayContaining(["button", "text", "heading", "link", "field", "fieldset", "text-field", "text-area", "sheet", "dialog", "confirm-dialog"]));
    expect(docsItems.map((item) => item.name).sort()).toEqual([...names].sort());
    // By catalog group, in registry order within a group.
    const groups: readonly string[] = siteGroups;
    for (const item of docsItems) expect(groups, item.name).toContain(item.group);
    expect(docsItems.map((item) => groups.indexOf(item.group))).toEqual(docsItems.map((item) => groups.indexOf(item.group)).sort((a, b) => a - b));
    for (const name of names) expect(routes.map((route) => route.path)).toContain(`/docs/${name}/`);
  });

  it.each(sliced(docsItems, "site: docs items"))("docs/$name shows a live demo, the init step, the add commands, the tests item in a closed More ways, and the guard props", async ({ name }) => {
    await renderPage(`/docs/${name}/`);
    await expect.element(page.getByText(INIT, { exact: true })).toBeVisible();
    await expect.element(page.getByText(`npx shadcn@latest add ourostack/ouro-ui/${name}#${latestRelease}`, { exact: true })).toBeVisible();
    const more = page.getByRole("button", { name: "More ways" });
    await expect.element(more).toHaveAttribute("aria-expanded", "false");
    const namespace = page.getByText(`npx shadcn@latest add @ouro/ouro-base @ouro/${name}`, { exact: true });
    const tests = page.getByText(`npx shadcn@latest add ourostack/ouro-ui/${name}#${latestRelease} ourostack/ouro-ui/${name}-tests#${latestRelease}`, { exact: true });
    expect(namespace.element()).toBeTruthy();
    await expect.element(namespace).not.toBeVisible();
    await expect.element(tests).not.toBeVisible();
    more.element().focus();
    await userEvent.keyboard("{Enter}");
    await expect.element(more).toHaveAttribute("aria-expanded", "true");
    await expect.element(namespace).toBeVisible();
    await expect.element(tests).toBeVisible();
    await expect.element(page.getByRole("region", { name: "Live demo" })).toBeVisible();
    await expect.element(page.getByRole("heading", { name: "Props", level: 2 })).toBeVisible();
    await expect.element(page.getByRole("heading", { name: "Use instead when", level: 2 })).toBeVisible();
  });

  it("draws the More ways trigger the same on every docs page: one box, colour and padding", async () => {
    const seen: string[] = [];
    for (const name of ["badge", "dialog", "button", "tabs", "text-field"]) {
      await renderPage(`/docs/${name}/`);
      const trigger = page.getByRole("button", { name: "More ways" }).element() as HTMLElement;
      const box = trigger.getBoundingClientRect();
      const cs = getComputedStyle(trigger);
      seen.push([Math.round(box.width), Math.round(box.height), cs.color, cs.paddingInline, cs.textDecorationLine].join("|"));
    }
    expect(new Set(seen).size, seen.join("\n")).toBe(1);
  });

  it("is lost at sea at an address with no page: the way home, a guess at what it meant, and a search", async () => {
    const before = location.href;
    history.replaceState(null, "", "/docs/buton/");
    try {
      await renderPage("/docs/buton/");
      await expect.element(page.getByRole("heading", { level: 1, name: "Lost at sea" })).toBeVisible();
      await expect.element(page.getByRole("link", { name: "Back to the surface" })).toHaveAttribute("href", href("/"));
      await expect.element(page.getByRole("link", { name: "Button", exact: true }).last()).toHaveAttribute("href", href("/docs/button/"));
      const main = page.getByRole("search");
      const field = main.getByRole("searchbox", { name: "Find a page or component" });
      await userEvent.fill(field, "text field");
      await expect.element(main.getByRole("status")).toHaveTextContent("One page by that name.");
      await expect.element(main.getByRole("link", { name: "TextField", exact: true })).toHaveAttribute("href", href("/docs/text-field/"));
      await userEvent.fill(field, "zzz");
      await expect.poll(() => main.getByRole("status").query()?.textContent?.replace(/\s+/g, " ")).toMatch(/^Nothing on our charts by that name\. Want one\? Ask for “zzz”/);
      // The lost page asks for what it can't find, as the docs' searches do.
      expect(new URL(main.getByRole("status").getByRole("link").element().getAttribute("href")!).searchParams.get("title")).toBe("Component request: zzz");
    } finally {
      history.replaceState(null, "", before);
    }
  });

  it("opens X-ray on a docs page whose address asks for it", async () => {
    const before = location.href;
    history.replaceState(null, "", "/docs/button/?xray");
    try {
      await renderPage("/docs/button/");
      await expect.poll(() => document.querySelector('[data-ouro="inspector"]') !== null).toBe(true);
    } finally {
      setXray(false);
      history.replaceState(null, "", before);
    }
  });

  it("links a component on the ship pages and in Spoonjoy, each opening X-ray pointed at it", async () => {
    await renderPage("/docs/switch/");
    const ship = page.getByRole("region", { name: "On this site" });
    expect(ship.getByRole("link").elements().map((link) => [link.textContent, link.getAttribute("href")])).toEqual(
      shipComponents.items.switch!.map((path) => [SHIP_PAGES.find((ship) => ship.path === path)!.label, href(`${path}?xray=switch`)]),
    );
    const live = page.getByRole("region", { name: "In Spoonjoy" }).getByRole("link").elements().filter((link) => link.getAttribute("href")!.startsWith("https://spoonjoy.app/") && link.textContent !== "Spoonjoy");
    expect(live.length).toBeGreaterThan(0);
    for (const link of live) expect(link.getAttribute("href")).toMatch(/\?xray=switch$/);
    // A component the ship pages do not show has no line for them.
    const absent = docsItems.find((item) => !(item.name in shipComponents.items))!;
    await renderPage(`/docs/${absent.name}/`);
    await expect.element(page.getByRole("heading", { name: absent.title, level: 1 })).toBeVisible();
    expect(page.getByRole("region", { name: "On this site" }).elements()).toEqual([]);
  });

  it("shows the parts nesting on the Sheet and Dialog pages", async () => {
    for (const name of ["sheet", "dialog"]) {
      await renderPage(`/docs/${name}/`);
      await expect.element(page.getByRole("heading", { name: "Required nesting" })).toBeVisible();
    }
  });

  it("documents toast() on the Toaster page, after the component", async () => {
    await renderPage("/docs/toaster/");
    await expect.element(page.getByRole("heading", { name: "toast()", level: 2 })).toBeVisible();
    const toaster = itemMarkdown(docsItems.find((item) => item.name === "toaster")!);
    expect(toaster.indexOf("## toast()")).toBeGreaterThan(toaster.indexOf("# Toaster"));
    expect(toaster).not.toMatch(/^# toast$/m);
  });

  it("keeps the header out of the way of the sidebar, which stays put as the page scrolls", async () => {
    // The docs sidebar sticks to the top of the window, so a header that stuck there too would cover its filter.
    await page.viewport(1280, 800);
    await renderPage("/docs/composer/");
    await expect.poll(() => document.querySelector('input[placeholder="Filter components"]')).not.toBeNull();
    window.scrollTo({ top: 600, behavior: "instant" });
    const field = document.querySelector<HTMLInputElement>('input[placeholder="Filter components"]')!;
    await expect.poll(() => field.getBoundingClientRect().top).toBeLessThan(60);
    const box = field.getBoundingClientRect();
    expect(document.elementFromPoint(box.left + 20, box.top + box.height / 2)).toBe(field);
    window.scrollTo({ top: 0, behavior: "instant" });
  });

  it("has the Switching from shadcn and Updating pages", async () => {
    await renderPage("/docs/switching-from-shadcn/");
    await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Switching from shadcn");
    await expect.element(page.getByText("components/ui/", { exact: true }).first()).toBeVisible();
    await renderPage("/docs/updating/");
    await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Updating components");
    await expect.element(page.getByText("npx shadcn@latest add @ouro/sheet --dry-run", { exact: true })).toBeVisible();
    await expect.element(page.getByText("npx shadcn@latest add @ouro/sheet --diff src/components/ouro/sheet/sheet.tsx", { exact: true })).toBeVisible();
    await expect.element(page.getByText("npx shadcn@latest add @ouro/sheet @ouro/sheet-tests --overwrite", { exact: true })).toBeVisible();
    await expect.element(page.getByText(`npx shadcn@latest add ourostack/ouro-ui/sheet#${latestRelease}`, { exact: true })).toBeVisible();
    await expect.element(page.getByRole("heading", { name: "Upgrading from v0.1.0", level: 2 })).toBeVisible();
    expect(upgradeCommands.length).toBeGreaterThanOrEqual(3);
    for (const command of upgradeCommands) await expect.element(page.getByText(command, { exact: true })).toBeVisible();
    await expect.element(page.getByRole("heading", { name: "1. Update every Ouro component, with its tests", level: 3 })).toBeVisible();
    await expect.element(page.getByText("useOuro", { exact: true })).toBeVisible();
  });
});

describe.each([
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
])("at $width px", ({ width, height }) => {
  beforeEach(async () => {
    await page.viewport(width, height);
  });

  describe.each(["light", "dark"] as const)("%s", (scheme) => {
    it.each(sliced(routes, "site: axe"))("$path has zero axe violations", async ({ path }) => {
      setScheme(scheme);
      await renderPage(path);
      await settle();
      const violations = await scan();
      // A scrollable region with no tab stop: what each ScrollArea viewport looked like when the scan ended (#1620).
      const viewports = violations.some((violation) => violation.rule === "scrollable-region-focusable")
        ? [...document.querySelectorAll<HTMLElement>("[data-scroll-viewport]")].map((viewport) => `\nviewport: tabindex ${viewport.tabIndex}, scroll ${viewport.scrollHeight}×${viewport.scrollWidth} in ${viewport.clientHeight}×${viewport.clientWidth}, ${viewport.hasAttribute("data-ouro-scroll-fade-y") ? "marked" : "unmarked"}, fonts ${document.fonts.status}`).join("")
        : "";
      expect(violations, describeViolations(violations) + viewports).toEqual([]);
    }, pageScanTimeout);
  });

  it.each(sliced(routes, "site: overflow"))("$path does not overflow horizontally", async ({ path }) => {
    await renderPage(path);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
  });
});

it("the Updating page's note has the tag filled in and no raw-file hint", () => {
  expect(upgrading).not.toContain("{{latestRelease}}");
  expect(upgrading).not.toContain("Reading this file on GitHub");
  expect(upgrading).toContain(`ourostack/ouro-ui/ouro-base#${latestRelease}`);
});

describe("the header's current section on a docs page", () => {
  it("is Ouro HX for the catalog and a component, Ouro AX for its guide and parts, Guides for another guide, and none on the lost page", () => {
    expect(headerPath("/docs/")).toBe("/docs/");
    expect(headerPath("/docs/button/")).toBe("/docs/");
    expect(headerPath("/docs/ax/")).toBe("/ax/");
    expect(headerPath("/docs/ax-cli/")).toBe("/ax/");
    expect(headerPath("/docs/installing/")).toBe("/docs/installing/");
    expect(headerPath("/docs/switching-from-shadcn/")).toBe("/docs/installing/");
    expect(headerPath("")).toBe("");
  });
});

describe("head tags", () => {
  it("give the home page, and only the home page, schema.org data naming the repository and licence", () => {
    const home = routes.find((route) => route.path === "/")!;
    const tag = headTags(home, true).find((t) => t.startsWith('<script type="application/ld+json">'))!;
    const data = JSON.parse(tag.slice(tag.indexOf(">") + 1, -"</script>".length));
    expect(data["@type"]).toBe("SoftwareSourceCode");
    expect(data.codeRepository).toBe("https://github.com/ourostack/ouro-ui");
    expect(data.keywords).toContain("shadcn registry");
    expect(homeStructuredData({ path: "/", title: "t", description: "a </script> b" })).not.toContain("</script>");
    expect(headTags(routes.find((route) => route.path === "/ax/")!, true).some((t) => t.includes("ld+json"))).toBe(false);
  });
  it("give the home page's description the words a search for it would use, without calling it a shadcn registry", () => {
    const { description } = routes.find((route) => route.path === "/")!;
    for (const term of ["React", "Base UI", "Tailwind", "SwiftUI", "A2UI", "MCP"]) {
      expect(description).toContain(term);
    }
    expect(description).not.toMatch(/shadcn registry/i);
  });
  it("end a card's title with a full stop before its scene in the alt text, when the title has none", () => {
    const tags = headTags({ path: "/ax/", title: "Ouro AX", description: "A morning with an agent" }, true).join("\n");
    expect(tags).toContain('<meta property="og:image:alt" content="Ouro AX: A morning with an agent. Inside a sleek high-speed train in low golden morning sun, ');
    expect(tags).not.toContain("agent..");
  });
  it("give a component page Open Graph and Twitter tags with the docs card, a 1200x630 storybook scene", async () => {
    const route = { path: "/docs/sheet/", title: "Sheet · Ouro HX", description: 'Install "sheet" & go' };
    const tags = headTags(route, true);
    const alt = "Ouro HX docs: Every component, with a live demo to poke. In a skylit design studio, a small robot and Ouro, a smiling emerald snake curled into an O, rest on a towel at a long worktable with fabric swatches.";
    for (const tag of [
      '<meta property="og:title" content="Sheet · Ouro HX" />',
      '<meta property="og:description" content="Install &quot;sheet&quot; &amp; go" />',
      '<meta property="og:url" content="https://ui.ouroboros.bot/docs/sheet/" />',
      '<meta property="og:image" content="https://ui.ouroboros.bot/og/docs.jpg" />',
      '<meta property="og:image:width" content="1200" />',
      '<meta property="og:image:height" content="630" />',
      '<meta name="twitter:card" content="summary_large_image" />',
      '<meta name="twitter:image" content="https://ui.ouroboros.bot/og/docs.jpg" />',
      '<meta property="og:site_name" content="Ouro UI" />',
      `<meta property="og:image:alt" content="${alt}" />`,
      `<meta name="twitter:image:alt" content="${alt}" />`,
    ]) {
      expect(tags).toContain(tag);
    }
    expect(headTags(route, false).some((tag) => tag.includes("og:url") || tag.includes("canonical"))).toBe(false);
    const image = new Image();
    image.src = href("/og/docs.jpg");
    await image.decode();
    expect([image.naturalWidth, image.naturalHeight]).toEqual([1200, 630]);
  });

  it("give every route a storybook card under og/, never the old landing-page screenshot", () => {
    for (const route of routes) {
      const image = headTags(route, true).find((tag) => tag.startsWith('<meta property="og:image" '));
      expect(image, route.path).toMatch(/content="https:\/\/ui\.ouroboros\.bot\/og\/[a-z-]+\.jpg"/);
      expect(headTags(route, true), route.path).toContain(image!.replace('<meta property="og:image"', '<meta name="twitter:image"'));
    }
  });

  it("pin each docs route's install command to the newest release", () => {
    for (const route of routes.filter((entry) => entry.description.includes("shadcn@latest add"))) {
      expect(route.description).toContain(`#${latestRelease}.`);
    }
  });
});

describe("guides and exports without an item", () => {
  it("has a page for every guide and for each documented export that ships in another item", () => {
    const names = docsPages.map((doc) => doc.name);
    for (const name of ["installing", "testing", "forms", "radio", "ouro-provider"]) expect(names).toContain(name);
    for (const doc of docsPages) expect(routes.some((route) => route.path === `/docs/${doc.name}/`)).toBe(true);
    // No page shares an address with a registry item's.
    expect(names.filter((name) => docsItems.some((item) => item.name === name))).toEqual([]);
  });

  it("renders the OuroProvider page with the React Router adapter and the Next.js provider file", async () => {
    await renderPage("/docs/ouro-provider/");
    await expect.element(page.getByRole("heading", { level: 1, name: "OuroProvider" })).toBeVisible();
    expect(document.body.innerText).toContain("return <Link to={href} {...props} />;");
    expect(document.body.innerText).toContain("<OuroProvider linkComponent={Link}>{children}</OuroProvider>");
  });

  it("renders the Testing guide, and its links go to the site's pages", async () => {
    await renderPage("/docs/testing/");
    await expect.element(page.getByRole("heading", { level: 1, name: "Testing" })).toBeVisible();
    await expect.element(page.getByRole("heading", { name: "Finding fields in tests" })).toBeVisible();
    await renderPage("/docs/forms/");
    const hrefs = [...document.querySelectorAll<HTMLAnchorElement>("a[href]")].map((link) => link.getAttribute("href")!);
    // "../Alert.md" and "testing.md#…" in docs/guides/forms.md, as site pages under the base.
    expect(hrefs.filter((link) => link.endsWith("/docs/alert/")).length).toBeGreaterThan(0);
    expect(hrefs).toContain(href("/docs/testing/") + "#finding-fields-in-tests");
    expect(hrefs.filter((link) => link.endsWith(".md") && !link.startsWith("http") && !link.includes("/docs/forms.md"))).toEqual([]);
  });

  it("draws a code span that holds backticks, between double backticks, as one code element, and a function default as code", async () => {
    await renderPage("/docs/table/");
    const codes = [...document.querySelectorAll("code")].map((code) => code.textContent);
    expect(codes).toContain("<Table rowHref={(row) => `/recipes/${row.id}`}>");
    await renderPage("/docs/show-more/");
    const shown = [...document.querySelectorAll("code")].map((code) => code.textContent);
    expect(shown).toEqual(expect.arrayContaining(["(count) => `Showing ${count} items`", "(count) => `Showing ${count} recipes`"]));
  });

  it("gathers a page's claim footnotes into a Claim sources list, each source a link to the file or test it names", async () => {
    const blocks = parse("A claim.[^a] Another.[^b]\n\n[^a]: scripts/claims.mjs#L12; test:scripts/claims.test.mjs::lint verify:count(registry:ui)=1\n[^b]: https://example.com/spec\n  verify:urlOk(https://example.com/spec)");
    expect(blocks).toEqual([
      { kind: "paragraph", text: "A claim.[^a] Another.[^b]" },
      {
        kind: "sources",
        items: [
          { id: "a", text: "scripts/claims.mjs#L12; test:scripts/claims.test.mjs::lint verify:count(registry:ui)=1" },
          { id: "b", text: "https://example.com/spec verify:urlOk(https://example.com/spec)" },
        ],
      },
    ]);
    expect(sourceHref("scripts/claims.mjs#L12@abc123")).toBe("https://github.com/ourostack/ouro-ui/blob/abc123/scripts/claims.mjs#L12");
    expect(sourceHref("test:scripts/claims.test.mjs::lint > a name")).toBe("https://github.com/ourostack/ouro-ui/blob/main/scripts/claims.test.mjs");
    expect(sourceHref("evidence:docs/agent-usability/runs/a.json")).toBe("https://github.com/ourostack/ouro-ui/blob/main/docs/agent-usability/runs/a.json");
    expect(sourceHref("https://example.com/spec")).toBe("https://example.com/spec");
    expect(repositoryLink("../../scripts/claims.mjs#L5", "docs/guides/claims.md")).toBe("https://github.com/ourostack/ouro-ui/blob/main/scripts/claims.mjs#L5");
    expect(repositoryLink("https://example.com", "docs/guides/claims.md")).toBeUndefined();

    await renderPage("/docs/claims/");
    await expect.element(page.getByRole("region", { name: "Claim sources" })).toBeVisible();
    const sources = document.getElementById("claim-sources")!.parentElement!;
    const first = sources.querySelector<HTMLAnchorElement>("li a[href]")!;
    // A source names its test or file as written, which may hold words the text rules look for.
    expect(first.getAttribute("data-ouro-allow")).toBe("leaked-value odd-timestamp");
    expect(first.href).toMatch(/^https:\/\/github\.com\/ourostack\/ouro-ui\/blob\/main\//);
    // The checks sit behind a "Checks" summary, so a source reads as a link, not as machine text.
    const checks = sources.querySelector("li details")!;
    expect(checks.querySelector("summary")!.textContent).toBe("Checks");
    expect(checks.hasAttribute("open")).toBe(false);
    expect([...sources.querySelectorAll("code")].filter((code) => code.textContent!.startsWith("verify:") && !code.closest("details"))).toHaveLength(0);
    const ref = document.querySelector<HTMLAnchorElement>("sup a[href^='#source-']")!;
    expect(document.getElementById(ref.getAttribute("href")!.slice(1))).not.toBeNull();
  });

  it("reads a claim source and its checks as words, keeps the raw form in the title, and sets a footnote mark apart from its sentence", async () => {
    expect(sourceLabel("test:scripts/claims.test.mjs::lint > a name")).toBe("The test that proves it: lint > a name");
    expect(sourceLabel("scripts/claims.mjs#L12")).toBe("The source file claims.mjs");
    expect(sourceLabel("https://example.com/spec")).toBe("The page at example.com");
    expect(checkLabel("testExists(a/b.test.ts::x > y)")).toBe("A test with this name exists: x > y");
    expect(checkLabel("fileLine(a/b.css, /--x: 1;/)")).toBe("A line matching /--x: 1;/ is in b.css");
    expect(checkLabel("urlOk(https://github.com/o/r/blob/99491ba2c96f39df5ad36cc7ebbd53b7dabf5064/a.md)")).toBe("The page it cites opens");
    const page = document.createElement("div");
    page.innerHTML = renderToStaticMarkup(<Markdown blocks={parse("Held.[^a]\n\n[^a]: test:a/b.test.ts::it works verify:testExists(a/b.test.ts::it works)")} />);
    expect(page.querySelector("sup")!.className).toContain("ms-1");
    expect(page.querySelector("li a")!.textContent).toBe("The test that proves it: it works");
    expect(page.querySelector("li a")!.getAttribute("title")).toBe("test:a/b.test.ts::it works");
    expect(page.querySelector("li")!.textContent).not.toMatch(/verify:|\.test\.ts/);
  });
});

describe("docs running text", () => {
  it("draws **bold** as strong text without its asterisks, with code and links inside it, and leaves asterisks in code alone", async () => {
    const container = document.createElement("p");
    container.innerHTML = renderToStaticMarkup(<>{prose("A **Browser driving (Playwright, `aria`):** 90, [see](x.md), and `**kept**` as written.")}</>);
    const strong = container.querySelector("strong")!;
    expect(strong.textContent).toBe("Browser driving (Playwright, aria):");
    expect(strong.querySelector("code")?.textContent).toBe("aria");
    expect(container.textContent).toBe("A Browser driving (Playwright, aria): 90, see, and **kept** as written.");
    // A guide's list item and paragraph, as the docs pages draw them.
    const page = document.createElement("div");
    page.innerHTML = renderToStaticMarkup(<Markdown blocks={parse("- **Browser driving:** 90 of 120\n\nThen **read it** again.")} />);
    expect(page.textContent).not.toContain("**");
    expect([...page.querySelectorAll("li strong, p strong")].map((strong) => strong.textContent)).toEqual(["Browser driving:", "read it"]);
  });

  it("holds a paragraph's and a lead's last two words on one line, a hyphenated word whole, and leaves code, links and a long last word free", async () => {
    const tail = (text: string) => {
      const last = prose(text).at(-1);
      return typeof last === "object" && last !== null && "props" in last ? (last.props as { className: string; children: string }) : null;
    };
    expect(tail("A helper is unused.")).toEqual({ className: "whitespace-nowrap", children: "is unused." });
    expect(tail("Moving code pairs one-to-one.")).toEqual({ className: "whitespace-nowrap", children: "pairs one-to-one." });
    expect(["Run `pnpm test`", "See lib/ouro/check/wrap-check.ts", "Read [the guide](form.md)", "Alone"].map((text) => tail(text)?.className === "whitespace-nowrap")).toEqual([false, false, false, false]);
    await renderPage("/docs/updating/");
    const paragraph = [...document.querySelectorAll("p")].find((p) => p.textContent!.startsWith("Before deleting anything"))!;
    expect(paragraph.querySelector(":scope > span.whitespace-nowrap:last-child")?.textContent).toBe("is unused.");
    await renderPage("/docs/sidebar-layout/");
    expect(document.querySelector("main p span.whitespace-nowrap:last-child")?.textContent).toBe('content" link.');
  });
});

describe("platforms", () => {
  it("has a page per file in docs/platforms at docs/platforms/<name>, the index at docs/platforms", () => {
    expect(platformPages.map((doc) => doc.name)).toEqual(["platforms", "platforms/apple", "platforms/android", "platforms/proof", "platforms/windows", "platforms/parity", "platforms/your-platform", "platforms/contributing"]);
    for (const doc of platformPages) {
      expect(doc.group).toBe("Platforms");
      expect(routes.find((route) => route.path === `/docs/${doc.name}/`)?.title).toBe(`${doc.title} · Ouro UI`);
    }
  });

  it("lists the platforms last in the docs sidebar, a platform only ever after for", () => {
    const platforms = docsSections().find((section) => section.label === "Platforms")!;
    expect(platforms.items.map((item) => ("label" in item ? item.label : ""))).toEqual(["Overview", "For Apple", "For Android", "What is proven on a device", "For Windows", "Parity across platforms", "For your platform", "A guide for platform builders"]);
    expect(platforms.items.map((item) => ("href" in item ? item.href : ""))).toEqual(platformPages.map((doc) => href(`/docs/${doc.name}/`)));
  });

  it("sets the platform after for in smaller, quieter type than the products' names, which each stay whole", async () => {
    await page.viewport(1280, 900);
    await renderPage("/docs/platforms/apple/");
    const heading = page.getByRole("heading", { level: 1 });
    await expect.element(heading).toHaveTextContent("Ouro HX & AX for Apple");
    const platform = heading.element().querySelector<HTMLElement>("[data-platform-for]")!;
    expect(platform.textContent).toBe("for Apple");
    expect(parseFloat(getComputedStyle(platform).fontSize)).toBeLessThan(parseFloat(getComputedStyle(heading.element()).fontSize));
    // Each product's name stays on one line: a narrow column (a laptop at 200% zoom) breaks between "Ouro HX" and
    // "& AX", never inside a name, and "AX" keeps its "&".
    const names = [...heading.element().querySelectorAll<HTMLElement>(":scope span")].filter((span) => getComputedStyle(span).whiteSpace === "nowrap");
    expect(names.map((name) => name.textContent)).toEqual(["Ouro HX", "& AX"]);
    await renderPage("/docs/platforms/contributing/");
    expect(page.getByRole("heading", { level: 1 }).element().querySelector("[data-platform-for]")).toBeNull();
  });

  it("shows which core release each platform meets, in a table on the Platforms page", async () => {
    await renderPage("/docs/platforms/");
    // Each cell's text without its footnote marks.
    const text = (cell: Element) => {
      const copy = cell.cloneNode(true) as Element;
      for (const mark of copy.querySelectorAll("sup")) mark.remove();
      return copy.textContent!.trim();
    };
    const rows = [...document.querySelectorAll("main table tbody tr")].map((row) => [...row.querySelectorAll("td")].slice(0, 3).map(text));
    expect(rows).toEqual([
      ["For web", parity.webTag, `core ${provenance.coreTag}, for its tokens`],
      ["For Apple", versions.apple.tag, versions.apple.treeCoreTag === versions.apple.coreTag ? `core ${versions.apple.coreTag}` : `core ${versions.apple.coreTag}, and ${versions.apple.treeCoreTag} for its A2UI conformance cases`],
      ["For Android", versions.android.tag, versions.android.treeCoreTag === versions.android.coreTag ? `core ${versions.android.coreTag}` : `core ${versions.android.coreTag}, and ${versions.android.treeCoreTag} for its A2UI conformance cases`],
      ["For Windows", versions.windows.tag, versions.windows.treeCoreTag === versions.windows.coreTag ? `core ${versions.windows.coreTag}` : `core ${versions.windows.coreTag}, and ${versions.windows.treeCoreTag} for its A2UI conformance cases`],
    ]);
  });

  it("gives the Apple page its install line, and what is coming with Siri AI", async () => {
    await renderPage("/docs/platforms/apple/");
    expect(document.body.innerText).toContain(`.package(url: "https://github.com/ourostack/ouro-ui-apple.git", from: "${versions.apple.tag.replace(/^v/, "")}")`);
    for (const name of ["What ships today", "What is coming"]) await expect.element(page.getByRole("heading", { level: 2, name })).toBeVisible();
    for (const words of ["Tool intents.", "App skills.", "SiriEvaluations.", "The App Intents X-ray."]) expect(document.body.innerText).toContain(words);
  });

  it.each([
    ["your-platform", "MCP server", "docs/platforms/<platform>.md", "ouro-ui-<platform>"],
  ])("gives the %s page its agent door, the contract and the way to propose it", async (name, door, file, repository) => {
    await renderPage(`/docs/platforms/${name}/`);
    const text = document.body.innerText;
    expect(text).toContain(door);
    await expect.element(page.getByRole("heading", { level: 2, name: "The contract" })).toBeVisible();
    for (const part of ["Take its tokens from a pinned core release", "Meet Ouro HX's bar", "Pass Ouro AX's X-ray"]) expect(text).toContain(part);
    await expect.element(page.getByRole("heading", { level: 2, name: "Propose it" })).toBeVisible();
    expect(text).toContain(file);
    expect(text).toContain(`we create ${repository}, import your work with its history, and make you a contributor`);
  });

  it("reads a numbered list as an ordered list, not as one paragraph", () => {
    expect(parse("Steps:\n1. Take the tokens.\n2. Meet the bar.\n10. Pass the X-ray.\n\nAfter.")).toEqual([
      { kind: "paragraph", text: "Steps:" },
      { kind: "list", ordered: true, items: ["Take the tokens.", "Meet the bar.", "Pass the X-ray."] },
      { kind: "paragraph", text: "After." },
    ]);
  });

  it("shows what the Windows kit ships, and what it still lacks", async () => {
    await renderPage("/docs/platforms/windows/");
    const text = document.body.innerText;
    for (const name of ["OuroButton", "OuroBadge", "OuroCard", "OuroItem", "Ouro.Actions", "On-device Agent Registry"]) expect(text).toContain(name);
    for (const name of ["What ships today", "What is still missing", "Contribute next"]) await expect.element(page.getByRole("heading", { level: 2, name })).toBeVisible();
    expect(text).toContain("ourostack/ouro-ui-windows");
  });

  it("shows what the Android kit ships, what it still lacks, and that it is checked on emulators only", async () => {
    await renderPage("/docs/platforms/android/");
    const text = document.body.innerText;
    for (const name of ["OuroButton", "OuroBadge", "OuroCard", "OuroItem", "ouro-actions", "AppFunctions", "emulators"]) expect(text).toContain(name);
    for (const name of ["What ships today", "What is still missing", "Contribute next"]) await expect.element(page.getByRole("heading", { level: 2, name })).toBeVisible();
    expect(text).toContain("ourostack/ouro-ui-android");
  });

  it.each(["/docs/platforms/your-platform/", "/docs/platforms/contributing/", "/docs/ax-eval/", "/docs/testing/"])(
    "renders %s's numbered steps as list items, with no step run into a paragraph",
    async (path) => {
      await renderPage(path);
      expect(document.querySelectorAll("main ol > li").length).toBeGreaterThan(1);
      const runOn = [...document.querySelectorAll("main p")].filter((paragraph) => /(^|\s)\d+\. \S/.test(paragraph.textContent!) && /(^|\s)1\. /.test(paragraph.textContent!));
      expect(runOn.map((paragraph) => paragraph.textContent)).toEqual([]);
    },
  );

  it("publishes each platform page's Markdown with its links relative to where it is published", () => {
    const apple = platformPages.find((doc) => doc.name === "platforms/apple")!;
    const index = platformPages.find((doc) => doc.name === "platforms")!;
    // docs/platforms/apple.md is published at docs/platforms/apple.md, the index at docs/platforms.md.
    expect(publishedMarkdown("[up](README.md) [it](android.md) [guide](../guides/claims.md)", apple.file)).toBe("[up](../platforms.md) [it](android.md) [guide](../claims.md)");
    expect(publishedMarkdown("[it](apple.md) [guide](../guides/claims.md)", index.file)).toBe("[it](platforms/apple.md) [guide](claims.md)");
  });
});

describe("install addresses", () => {
  // The page scan reads the rendered text, and the commands under a closed disclosure too: innerText leaves those out.
  const textNodes = (root: Node): string[] => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const found: string[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) found.push(node.textContent ?? "");
    return found;
  };
  const pageText = () => [document.body.innerText, ...[...document.querySelectorAll("[data-ouro=\"collapsible\"]")].flatMap(textNodes)].join("\n");

  it.each(sliced(routes, "site: pins"))("$path pins each ourostack/ouro-ui address to a release, or says it is for contributors", async ({ path }) => {
    await renderPage(path);
    expect(unpinnedAddresses(pageText())).toEqual([]);
  });

  it("finds the install addresses on an item's docs page", async () => {
    await renderPage("/docs/dialog/");
    expect(pageText().split("ourostack/ouro-ui/").length - 1).toBeGreaterThan(2);
  });

  it("marks every control on a docs page with its Ouro item, so X-ray names it", async () => {
    await page.viewport(1100, 900);
    for (const path of ["/docs/", "/docs/dialog/", "/docs/radio/", "/docs/density/", "/docs/button/"]) {
      await renderPage(path);
      const unmarked = collectControls().filter((element) => !element.closest("[data-ouro-control]"));
      expect(unmarked.map((element) => `${path} ${element.tagName.toLowerCase()} ${element.getAttribute("href") ?? element.textContent?.trim().slice(0, 30)}`)).toEqual([]);
    }
  });
});
