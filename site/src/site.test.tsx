import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands, page } from "vitest/browser";
import { cleanupPage, describeViolations, renderPage, scan, setScheme, settle } from "../test/render";
import { latestRelease, upgrading } from "./release";
import { docsItems, summary } from "./docs/items";
import { docsPages } from "./docs/pages";
import { unpinnedAddresses } from "../../scripts/addresses.mjs";
import { parse } from "./docs/markdown";
import { headTags } from "./head";
import { href, routes } from "./routes";
import { AGENTS_COMING_SOON, HERO_SUBLINE, HERO_TITLE, SHADCN_LINE } from "./copy";
import readme from "../../README.md?raw";
import registry from "../../registry.json";
import { groupOrder } from "../../scripts/catalog-groups.mts";

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

describe("landing page", () => {
  it("renders the exact hero text and the shadcn wording", async () => {
    await renderPage("/");
    const heading = page.getByRole("heading", { level: 1 });
    await expect.element(heading).toBeVisible();
    expect(heading.element().textContent).toBe(HERO_TITLE);
    expect(HERO_TITLE).toBe("Designed down to the last tap and the last prop.");
    expect(HERO_SUBLINE).toBe(
      "Interactions that feel right to the humans using them. Code that's obvious to the agents building with them.",
    );
    await expect.element(page.getByText(HERO_SUBLINE, { exact: true })).toBeVisible();
    await expect.element(page.getByText("Works with shadcn/ui", { exact: true })).toBeVisible();
    await expect.element(page.getByText(SHADCN_LINE, { exact: true })).toBeVisible();
    expect(SHADCN_LINE).toBe(
      "Installs with the shadcn CLI, uses shadcn's theme tokens, and sits alongside the shadcn/ui components you already have.",
    );
    expect(document.body.innerText).not.toContain("compliant");
    expect(page.getByRole("link", { name: "llms.txt" }).element().getAttribute("href")).toBe("https://ourostack.github.io/ouro-ui/llms.txt");
  });

  it("has no phone mockup", async () => {
    const host = await renderPage("/");
    expect(host.querySelector("[data-site-phone-screen]")).toBeNull();
    expect(page.getByRole("button", { name: "Save to cookbook" }).elements()).toEqual([]);
  });

  it("keeps Ouro UI as the parent, HX under construction and AX scope undefined", async () => {
    await renderPage("/");
    await expect.element(page.getByRole("link", { name: "Ouro HX", exact: true })).toBeVisible();
    await expect.element(page.getByText("Under construction", { exact: true })).toBeVisible();
    await expect.element(page.getByRole("heading", { level: 2, name: "Coming soon: Ouro AX" })).toBeVisible();
    await expect.element(page.getByText(AGENTS_COMING_SOON.intro, { exact: true })).toBeVisible();
    const copy = Object.values(AGENTS_COMING_SOON).join(" ");
    expect(copy).toContain("scope is still being defined");
    expect(copy).not.toMatch(/CLI|MCP|--json|registry|20\d\d|Q[1-4]/);
    expect(document.body.innerText).toContain("Ouro HX is part of Ouro UI");
    expect(routes[0]!.title).toBe("Ouro HX");
    expect(readme.startsWith("# Ouro HX\n")).toBe(true);
    expect(llms.startsWith("# Ouro HX\n")).toBe(true);
    for (const text of [readme, llms]) {
      expect(text).toContain("Under construction");
      expect(text).toContain("Ouro UI");
    }
  });

  it("uses the approved rich HX artwork decoratively beside its accessible name", async () => {
    await renderPage("/");
    const home = page.getByRole("link", { name: "Ouro HX", exact: true }).element();
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
    expect(image!.getBoundingClientRect().width).toBe(40);
    expect(image!.getBoundingClientRect().height).toBe(40);
  });

  it("keeps the hero copy the same in the head tags, README and llms.txt", () => {
    expect(routes[0]!.description.startsWith(`${HERO_TITLE} ${HERO_SUBLINE}`)).toBe(true);
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
    await expect.element(page.getByText(/Without it, the address installs/)).toBeVisible();
  });

  it("adds ouro-base once, before the first component", async () => {
    await renderPage("/");
    await expect.element(page.getByText(`npx shadcn@latest add ourostack/ouro-ui/ouro-base#${latestRelease}`, { exact: true })).toBeVisible();
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

  it("has a page for every registry item at docs/<name>", () => {
    const names = registry.items.filter((item) => item.type === "registry:ui").map((item) => item.name);
    expect(names).toEqual(expect.arrayContaining(["button", "text", "heading", "link", "field", "fieldset", "text-field", "text-area", "sheet", "dialog", "confirm-dialog"]));
    expect(docsItems.map((item) => item.name).sort()).toEqual([...names].sort());
    // By catalog group, in registry order within a group.
    const groups: readonly string[] = groupOrder;
    for (const item of docsItems) expect(groups, item.name).toContain(item.group);
    expect(docsItems.map((item) => groups.indexOf(item.group))).toEqual(docsItems.map((item) => groups.indexOf(item.group)).sort((a, b) => a - b));
    for (const name of names) expect(routes.map((route) => route.path)).toContain(`/docs/${name}/`);
  });

  it.each(docsItems)("docs/$name shows a live demo, the init step, both install commands, the tests item and the guard props", async ({ name }) => {
    await renderPage(`/docs/${name}/`);
    await expect.element(page.getByText(INIT, { exact: true })).toBeVisible();
    await expect.element(page.getByText(`npx shadcn@latest add ourostack/ouro-ui/${name}#${latestRelease}`, { exact: true })).toBeVisible();
    await expect.element(page.getByText(`npx shadcn@latest add @ouro/ouro-base @ouro/${name}`, { exact: true })).toBeVisible();
    await expect.element(page.getByText(`npx shadcn@latest add ourostack/ouro-ui/${name}#${latestRelease} ourostack/ouro-ui/${name}-tests#${latestRelease}`, { exact: true })).toBeVisible();
    await expect.element(page.getByRole("region", { name: "Live demo" })).toBeVisible();
    await expect.element(page.getByRole("heading", { name: "Props", level: 2 })).toBeVisible();
    await expect.element(page.getByRole("heading", { name: "Use instead when", level: 2 })).toBeVisible();
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
    const toaster = docsItems.find((item) => item.name === "toaster")!;
    expect(toaster.markdown.indexOf("## toast()")).toBeGreaterThan(toaster.markdown.indexOf("# Toaster"));
    expect(toaster.markdown).not.toMatch(/^# toast$/m);
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
    it.each(routes)("$path has zero axe violations", async ({ path }) => {
      setScheme(scheme);
      await renderPage(path);
      await settle();
      const violations = await scan();
      expect(violations, describeViolations(violations)).toEqual([]);
    });
  });

  it.each(routes)("$path does not overflow horizontally", async ({ path }) => {
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
      '<meta property="og:url" content="https://ourostack.github.io/ouro-ui/docs/sheet/" />',
      '<meta property="og:image" content="https://ourostack.github.io/ouro-ui/og.png" />',
      '<meta property="og:image:width" content="1200" />',
      '<meta property="og:image:height" content="630" />',
      '<meta name="twitter:card" content="summary_large_image" />',
      '<meta name="twitter:image" content="https://ourostack.github.io/ouro-ui/og.png" />',
      '<meta property="og:site_name" content="Ouro HX" />',
      '<meta property="og:image:alt" content="Ouro HX, part of Ouro UI. Under construction. Designed down to the last tap and the last prop." />',
      '<meta name="twitter:image:alt" content="Ouro HX, part of Ouro UI. Under construction. Designed down to the last tap and the last prop." />',
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
});

describe("install addresses", () => {
  it("every page pins each ourostack/ouro-ui address to a release, or says it is for contributors", async () => {
    const problems: string[] = [];
    let seen = 0;
    for (const route of routes) {
      await renderPage(route.path);
      seen += document.body.innerText.split("ourostack/ouro-ui/").length - 1;
      for (const address of unpinnedAddresses(document.body.innerText)) problems.push(`${route.path}: ${address}`);
    }
    expect(seen).toBeGreaterThan(10);
    expect(problems).toEqual([]);
  });
});
