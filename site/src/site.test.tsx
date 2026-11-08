import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { cleanupPage, describeViolations, loadPageCode, pageScanTimeout, renderPage, scan, setScheme, settle } from "../test/render";
import { sliced } from "../../test/slice";
import { latestRelease, upgrading } from "./release";
import { docsItems, itemMarkdown, summary } from "./docs/items";
import { docsPages, platformPages, publishedMarkdown, repositoryLink } from "./docs/pages";
import { unpinnedAddresses } from "../../scripts/addresses.mjs";
import { parse, sourceHref } from "./docs/markdown";
import { headTags } from "./head";
import { docsSections } from "./components/docs-sections";
import { href, routes } from "./routes";
import { AX_SECTION, HERO_SUBLINE, HERO_TITLE, VOYAGE_HERO } from "./copy";
import { TWO_SHIPS } from "./voyage/copy";
import { SITE_SECTIONS } from "./voyage/site-menu";
import { agentExamples } from "./agents/examples";
import shipComponents from "./docs/ship-components.json";
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
  await cleanupPage();
  setScheme("light");
});

const INIT = "npx shadcn@latest init --base base --preset nova --yes --no-monorepo";
// The upgrade note is UPGRADING.md, rendered on the Updating page; every command shows.
const upgradeCommands = parse(upgrading).flatMap((block) => (block.kind === "code" ? [block.text] : []));

describe("home page", () => {
  it("opens on the Nautilus hero, and Come aboard goes to the Nautilus's page", async () => {
    await renderPage("/");
    const heading = page.getByRole("heading", { level: 1 });
    await expect.element(heading).toBeVisible();
    expect(heading.element().textContent).toBe(VOYAGE_HERO.title.join(" "));
    expect(page.getByRole("link", { name: "Come aboard", exact: true }).first().element().getAttribute("href")).toBe("/nautilus/");
    expect(document.body.innerText).not.toContain("compliant");
    expect(page.getByRole("navigation", { name: "Footer" }).getByRole("link", { name: "llms.txt" }).element().getAttribute("href")).toBe("/llms.txt");
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

  it("keeps Ouro UI as the parent, with Ouro AX as the other half and its own page, and never says AX is still being defined", async () => {
    await renderPage("/");
    // The site is Ouro UI; the bar names its two halves side by side, and the hero says so under the install, each name a link to its half.
    await expect.element(page.getByRole("link", { name: "Ouro UI", exact: true })).toBeVisible();
    expect(SITE_SECTIONS.map((section) => [section.label, section.href]).slice(4, 6)).toEqual([
      ["Ouro HX", "/docs/"],
      ["Ouro AX", "/ax/"],
    ]);
    const halves = document.querySelector("[data-site-halves]")!;
    expect([...halves.querySelectorAll("dt")].map((name) => name.textContent)).toEqual(["HXOuro HX · human experience", "AXOuro AX · agent experience"]);
    expect(halves.querySelector("p")!.textContent).toBe("Ouro UI has a half for people and a half for agents");
    expect([...halves.querySelectorAll("dt a")].map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Ouro HX", "/docs/"],
      ["Ouro AX", "/ax/"],
    ]);
    await expect.element(page.getByRole("heading", { level: 2, name: AX_SECTION.title })).toBeVisible();
    await expect.element(page.getByText(AX_SECTION.intro, { exact: true })).toBeVisible();
    expect(page.getByRole("link", { name: "Be the agent" }).element().getAttribute("href")).toBe("/ax/#be-the-agent");
    expect(page.getByRole("link", { name: AX_SECTION.morning }).element().getAttribute("href")).toBe("/ax/");
    expect(page.getByRole("link", { name: AX_SECTION.guide }).element().getAttribute("href")).toBe("/docs/ax/");
    for (const text of [document.body.innerText, readme, llms]) {
      expect(text).not.toMatch(/still being defined|coming soon/i);
    }
    expect(document.body.innerText).toContain("Ouro UI: Ouro HX for people, Ouro AX for agents.");
    expect(routes[0]!.title).toBe("Ouro UI");
    // The README opens with the ourostack brand mark every repository shares, then its title.
    expect(readme.replace(/^<!-- ourostack:brand:start -->[\s\S]*?<!-- ourostack:brand:end -->\n\n/, "").startsWith("# Ouro HX\n")).toBe(true);
    expect(llms.startsWith("# Ouro HX\n")).toBe(true);
    for (const text of [readme, llms]) {
      expect(text).not.toMatch(/under construction/i);
      expect(text).toContain("Ouro UI");
    }
  });

  it("uses the approved rich HX artwork decoratively beside its accessible name", async () => {
    await renderPage("/");
    const home = page.getByRole("link", { name: "Ouro UI", exact: true }).element();
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

  it("describes itself with the hero's words, and README and llms.txt keep their shared first lines", () => {
    expect(routes[0]!.description.startsWith(VOYAGE_HERO.title.join(" "))).toBe(true);
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
      expect(sources[2]!.srcset).toMatch(/-640\.avif 640w, .*-1600\.avif 1600w$/);
      const image = picture.querySelector("img")!;
      expect([image.getAttribute("width"), image.getAttribute("height"), image.loading]).toEqual(["1600", "863", "lazy"]);
      expect(image.alt).toMatch(/^Spoonjoy's Crispy Lemon Chickpeas recipe/);
    }
    // Not a link of its own: the row's "X-ray it" already opens the Test Kitchen with X-ray on.
    expect(pictures[0]!.closest("a")).toBeNull();
    await expect.element(page.getByText(/Real app, real recipe, real chickpeas\.$/)).toBeVisible();
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
  it("keeps linked guide summaries as text inside their catalog links", async () => {
    expect(summary("# Guide\n\nRead [the `Form` guide](form.md). More detail.")).toBe("Read the `Form` guide.");
    const host = await renderPage("/docs/");
    expect(host.querySelector("a a")).toBeNull();
    const comparison = host.querySelector<HTMLAnchorElement>('section[aria-labelledby="group-guides"] a[href$="/docs/why-no-skill-settings-form/"]');
    expect(comparison?.textContent).toContain("Comparison overview, scores, protocol and limits");
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
    // The sidebar scrolls on its own, opened where the current page and its group's label show.
    const scroller = nav.element().querySelector<HTMLElement>("[data-ouro-sidebar-scroll]")!;
    expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight);
    const box = scroller.getBoundingClientRect();
    for (const element of [nav.getByText("Lists", { exact: true }).element(), nav.getByRole("link", { name: "Checklist", exact: true }).element()]) {
      const rect = element.getBoundingClientRect();
      expect(rect.top).toBeGreaterThanOrEqual(box.top);
      expect(rect.bottom).toBeLessThanOrEqual(box.bottom);
    }
  });

  it("narrows the sidebar to the components a filter names, and says when none is called that", async () => {
    await page.viewport(1280, 900);
    await renderPage("/docs/");
    const nav = page.getByRole("navigation", { name: "Docs" });
    await userEvent.fill(nav.getByRole("searchbox", { name: "Filter components" }), "text field");
    expect(nav.getByRole("link").elements().map((link) => link.textContent)).toEqual(["TextField"]);
    await expect.element(nav.getByRole("list", { name: "Forms", exact: true })).toBeVisible();
    await userEvent.fill(nav.getByRole("searchbox", { name: "Filter components" }), "zzz");
    expect(nav.getByRole("link").elements()).toHaveLength(0);
    await expect.element(nav.getByRole("status")).toHaveTextContent("No component is called that.");
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

  it.each(sliced(docsItems, "site: docs items"))("docs/$name shows a live demo, the init step, both install commands, the tests item and the guard props", async ({ name }) => {
    await renderPage(`/docs/${name}/`);
    await expect.element(page.getByText(INIT, { exact: true })).toBeVisible();
    await expect.element(page.getByText(`npx shadcn@latest add ourostack/ouro-ui/${name}#${latestRelease}`, { exact: true })).toBeVisible();
    await expect.element(page.getByText(`npx shadcn@latest add @ouro/ouro-base @ouro/${name}`, { exact: true })).toBeVisible();
    await expect.element(page.getByText(`npx shadcn@latest add ourostack/ouro-ui/${name}#${latestRelease} ourostack/ouro-ui/${name}-tests#${latestRelease}`, { exact: true })).toBeVisible();
    await expect.element(page.getByRole("region", { name: "Live demo" })).toBeVisible();
    await expect.element(page.getByRole("heading", { name: "Props", level: 2 })).toBeVisible();
    await expect.element(page.getByRole("heading", { name: "Use instead when", level: 2 })).toBeVisible();
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
      const field = main.getByRole("searchbox", { name: "Search the docs" });
      await userEvent.fill(field, "text field");
      await expect.element(main.getByRole("status")).toHaveTextContent("One page by that name.");
      await expect.element(main.getByRole("link", { name: "TextField", exact: true })).toHaveAttribute("href", href("/docs/text-field/"));
      await userEvent.fill(field, "zzz");
      await expect.element(main.getByRole("status")).toHaveTextContent("Nothing on our charts by that name. Try a component, like Button.");
    } finally {
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
    await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Updating installed components");
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
      expect(violations, describeViolations(violations)).toEqual([]);
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

describe("head tags", () => {
  it("give every page Open Graph and Twitter tags with the 1200x630 og.png", async () => {
    const route = { path: "/docs/sheet/", title: "Sheet · Ouro HX", description: 'Install "sheet" & go' };
    const tags = headTags(route, true);
    for (const tag of [
      '<meta property="og:title" content="Sheet · Ouro HX" />',
      '<meta property="og:description" content="Install &quot;sheet&quot; &amp; go" />',
      '<meta property="og:url" content="https://ui.ouroboros.bot/docs/sheet/" />',
      '<meta property="og:image" content="https://ui.ouroboros.bot/og.png" />',
      '<meta property="og:image:width" content="1200" />',
      '<meta property="og:image:height" content="630" />',
      '<meta name="twitter:card" content="summary_large_image" />',
      '<meta name="twitter:image" content="https://ui.ouroboros.bot/og.png" />',
      '<meta property="og:site_name" content="Ouro UI" />',
      '<meta property="og:image:alt" content="Ouro UI: Ouro HX for the screens people use, Ouro AX for the tools agents use." />',
      '<meta name="twitter:image:alt" content="Ouro UI: Ouro HX for the screens people use, Ouro AX for the tools agents use." />',
    ]) {
      expect(tags).toContain(tag);
    }
    expect(headTags(route, false).some((tag) => tag.includes("og:url") || tag.includes("canonical"))).toBe(false);
    const image = new Image();
    image.src = href("/og.png");
    await image.decode();
    expect([image.naturalWidth, image.naturalHeight]).toEqual([1200, 630]);
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
    expect(first.href).toMatch(/^https:\/\/github\.com\/ourostack\/ouro-ui\/blob\/main\//);
    const ref = document.querySelector<HTMLAnchorElement>("sup a[href^='#source-']")!;
    expect(document.getElementById(ref.getAttribute("href")!.slice(1))).not.toBeNull();
  });
});

describe("platforms", () => {
  it("has a page per file in docs/platforms at docs/platforms/<name>, the index at docs/platforms", () => {
    expect(platformPages.map((doc) => doc.name)).toEqual(["platforms", "platforms/apple", "platforms/android", "platforms/windows", "platforms/your-platform", "platforms/contributing"]);
    for (const doc of platformPages) {
      expect(doc.group).toBe("Platforms");
      expect(routes.find((route) => route.path === `/docs/${doc.name}/`)?.title).toBe(`${doc.title} · Ouro UI`);
    }
  });

  it("lists the platforms last in the docs sidebar, a platform only ever after for", () => {
    const platforms = docsSections().find((section) => section.label === "Platforms")!;
    expect(platforms.items.map((item) => ("label" in item ? item.label : ""))).toEqual(["Overview", "For Apple", "For Android", "For Windows", "For your platform", "A guide for platform builders"]);
    expect(platforms.items.map((item) => ("href" in item ? item.href : ""))).toEqual(platformPages.map((doc) => href(`/docs/${doc.name}/`)));
  });

  it("sets the platform after for in smaller, quieter type than the products' names", async () => {
    await page.viewport(1280, 900);
    await renderPage("/docs/platforms/apple/");
    const heading = page.getByRole("heading", { level: 1 });
    await expect.element(heading).toHaveTextContent("Ouro HX & AX for Apple");
    const platform = heading.element().querySelector<HTMLElement>("[data-platform-for]")!;
    expect(platform.textContent).toBe("for Apple");
    expect(parseFloat(getComputedStyle(platform).fontSize)).toBeLessThan(parseFloat(getComputedStyle(heading.element()).fontSize));
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
      ["For web", "v1.3.3", "core v0.3.0, for its tokens"],
      ["For Apple", "v0.3.4", "core v0.3.0"],
      ["For Android", "none yet", "none yet"],
      ["For Windows", "none yet", "none yet"],
    ]);
  });

  it("gives the Apple page its install line, and what is coming with Siri AI", async () => {
    await renderPage("/docs/platforms/apple/");
    expect(document.body.innerText).toContain('.package(url: "https://github.com/ourostack/ouro-ui-apple.git", from: "0.3.4")');
    for (const name of ["What ships today", "What is coming"]) await expect.element(page.getByRole("heading", { level: 2, name })).toBeVisible();
    for (const words of ["Tool intents.", "App skills.", "SiriEvaluations.", "The App Intents X-ray."]) expect(document.body.innerText).toContain(words);
  });

  it.each([
    ["android", "AppFunctions", "docs/platforms/android.md", "ouro-ui-android"],
    ["windows", "On-device Agent Registry", "docs/platforms/windows.md", "ouro-ui-windows"],
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

  it.each(["/docs/platforms/android/", "/docs/platforms/windows/", "/docs/platforms/your-platform/", "/docs/platforms/contributing/", "/docs/ax-eval/", "/docs/testing/"])(
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
  it.each(sliced(routes, "site: pins"))("$path pins each ourostack/ouro-ui address to a release, or says it is for contributors", async ({ path }) => {
    await renderPage(path);
    expect(unpinnedAddresses(document.body.innerText)).toEqual([]);
  });

  // The page scan reads the rendered text: an item's docs page names its install addresses there.
  it("finds the install addresses on an item's docs page", async () => {
    await renderPage("/docs/dialog/");
    expect(document.body.innerText.split("ourostack/ouro-ui/").length - 1).toBeGreaterThan(2);
  });
});

