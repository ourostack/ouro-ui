import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { cleanupPage, describeViolations, renderPage, scan, setScheme, settle } from "../test/render";
import upgrading from "../../UPGRADING.md?raw";
import { docsItems } from "./docs/items";
import { parse } from "./docs/markdown";
import { routes } from "./routes";

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
  it("renders the exact hero text", async () => {
    await renderPage("/");
    const heading = page.getByRole("heading", { level: 1 });
    await expect.element(heading).toBeVisible();
    expect(heading.element().textContent).toBe("Interfaces that feel right, built by agents that get them right.");
    await expect.element(page.getByText("shadcn/ui compliant", { exact: true })).toBeVisible();
    expect(page.getByRole("link", { name: "llms.txt" }).element().getAttribute("href")).toBe("https://ourostack.github.io/ouro-ui/llms.txt");
  });

  it("opens the live Sheet demo inside the phone frame", async () => {
    await page.viewport(1280, 800);
    const host = await renderPage("/");
    await userEvent.click(page.getByRole("button", { name: "Save to cookbook" }));
    const sheet = page.getByRole("dialog", { name: "Save to cookbook" });
    await expect.element(sheet).toBeVisible();
    // The sheet renders into the phone screen, not across the page.
    const frame = host.querySelector("[data-site-phone-screen]")!;
    expect(frame.contains(sheet.element())).toBe(true);
    await expect.element(page.getByText("Drag it. Flick it. Pull it past the edge.")).toBeVisible();
  });

  it("starts the install steps with shadcn's init, with the Base UI base", async () => {
    await renderPage("/");
    await expect.element(page.getByText(INIT, { exact: true })).toBeVisible();
    await expect.element(page.getByText("npx shadcn@latest add ourostack/ouro-ui/sheet", { exact: true })).toBeVisible();
  });
});

describe("docs", () => {
  it("has a page for every registry item at docs/<name>", () => {
    const names = ["button", "text", "heading", "sheet", "dialog", "confirm-dialog"];
    expect(docsItems.map((item) => item.name)).toEqual(names);
    for (const name of names) expect(routes.map((route) => route.path)).toContain(`/docs/${name}/`);
  });

  it.each(docsItems)("docs/$name shows a live demo, the init step, both install commands, the tests item and the guard props", async ({ name }) => {
    await renderPage(`/docs/${name}/`);
    await expect.element(page.getByText(INIT, { exact: true })).toBeVisible();
    await expect.element(page.getByText(`npx shadcn@latest add ourostack/ouro-ui/${name}`, { exact: true })).toBeVisible();
    await expect.element(page.getByText(`npx shadcn@latest add @ouro/${name}`, { exact: true })).toBeVisible();
    await expect.element(page.getByText(`npx shadcn@latest add ourostack/ouro-ui/${name} ourostack/ouro-ui/${name}-tests`, { exact: true })).toBeVisible();
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

  it("has the Switching from shadcn and Updating pages", async () => {
    await renderPage("/docs/switching-from-shadcn/");
    await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Switching from shadcn");
    await expect.element(page.getByText("components/ui/", { exact: true }).first()).toBeVisible();
    await renderPage("/docs/updating/");
    await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Updating installed components");
    await expect.element(page.getByText("npx shadcn@latest add @ouro/sheet --dry-run", { exact: true })).toBeVisible();
    await expect.element(page.getByText("npx shadcn@latest add @ouro/sheet --diff src/components/ouro/sheet/sheet.tsx", { exact: true })).toBeVisible();
    await expect.element(page.getByText("npx shadcn@latest add @ouro/sheet @ouro/sheet-tests --overwrite", { exact: true })).toBeVisible();
    await expect.element(page.getByText("npx shadcn@latest add ourostack/ouro-ui/sheet#v0.2.0", { exact: true })).toBeVisible();
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

it("the Sheet demo passes axe while open, at a phone width", async () => {
  await page.viewport(390, 844);
  await renderPage("/");
  await userEvent.click(page.getByRole("button", { name: "Save to cookbook" }));
  await expect.element(page.getByRole("dialog", { name: "Save to cookbook" })).toBeVisible();
  await settle();
  const violations = await scan();
  expect(violations, describeViolations(violations)).toEqual([]);
});
