import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands, page } from "vitest/browser";
import { cleanupPage, describeViolations, renderPage, scan, setScheme, settle } from "../test/render";
import { latestRelease, upgrading } from "./release";
import { docsItems } from "./docs/items";
import { unpinnedAddresses } from "../../scripts/addresses.mjs";
import { parse } from "./docs/markdown";
import ogImage from "../public/og.png?url";
import { headTags } from "./head";
import { routes } from "./routes";
import { AGENTS_COMING_SOON, HERO_SUBLINE, HERO_TITLE, SHADCN_LINE } from "./copy";
import readme from "../../README.md?raw";
import llms from "../public/llms.txt?raw";
import registry from "../../registry.json";
import { groupOrder } from "../../scripts/catalog-groups.mts";

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

  it("announces Ouro UI for agents as coming soon, with no date", async () => {
    await renderPage("/");
    await expect.element(page.getByRole("heading", { level: 2, name: "Coming soon: Ouro UI for agents" })).toBeVisible();
    for (const text of [AGENTS_COMING_SOON.intro, AGENTS_COMING_SOON.cli, AGENTS_COMING_SOON.mcp]) {
      await expect.element(page.getByText(text, { exact: true })).toBeVisible();
    }
    expect(AGENTS_COMING_SOON.cli).toContain("--json");
    expect(AGENTS_COMING_SOON.mcp).toContain("one error shape");
    const copy = Object.values(AGENTS_COMING_SOON).join(" ");
    expect(copy).not.toMatch(/people|20\d\d|Q[1-4]/);
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
});

describe("docs", () => {
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
    await expect.element(page.getByText(`npx shadcn@latest add @ouro/${name}`, { exact: true })).toBeVisible();
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
  expect(upgrading).toContain(`ourostack/ouro-ui/ouro-lib-tests#${latestRelease}`);
});

describe("head tags", () => {
  it("give every page Open Graph and Twitter tags with the 1200x630 og.png", async () => {
    const route = { path: "/docs/sheet/", title: "Sheet · Ouro UI", description: 'Install "sheet" & go' };
    const tags = headTags(route, true);
    for (const tag of [
      '<meta property="og:title" content="Sheet · Ouro UI" />',
      '<meta property="og:description" content="Install &quot;sheet&quot; &amp; go" />',
      '<meta property="og:url" content="https://ourostack.github.io/ouro-ui/docs/sheet/" />',
      '<meta property="og:image" content="https://ourostack.github.io/ouro-ui/og.png" />',
      '<meta property="og:image:width" content="1200" />',
      '<meta property="og:image:height" content="630" />',
      '<meta name="twitter:card" content="summary_large_image" />',
      '<meta name="twitter:image" content="https://ourostack.github.io/ouro-ui/og.png" />',
    ]) {
      expect(tags).toContain(tag);
    }
    expect(headTags(route, false).some((tag) => tag.includes("og:url") || tag.includes("canonical"))).toBe(false);
    const image = new Image();
    image.src = ogImage;
    await image.decode();
    expect([image.naturalWidth, image.naturalHeight]).toEqual([1200, 630]);
  });

  it("pin each docs route's install command to the newest release", () => {
    for (const route of routes.filter((entry) => entry.description.includes("shadcn@latest add"))) {
      expect(route.description).toContain(`#${latestRelease}.`);
    }
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
