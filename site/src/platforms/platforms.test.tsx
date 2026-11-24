import { afterEach, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import platforms from "../../../scripts/parity-data/platforms.json";
import { cleanupPage, renderPage } from "../../test/render";
import { coverage, readCoverage } from "../hx/coverage";
import { PLATFORM_PATHS } from "../paths";
import { redirects, routes } from "../routes";
import kits from "./kits.json";

afterEach(async () => {
  await cleanupPage();
});

const TITLES = {
  "/hx/": /^Ouro HX, for people's\s+screens\.$/,
  "/windows/": "Same manners, now in WinUI.",
  "/windows/start/": "Add it with dotnet.",
  "/android/": "Same manners, now in Compose.",
  "/android/start/": "Add it in Gradle.",
} as const;

describe("platform pages", () => {
  // site.test.tsx runs axe over every route, these included.
  it.each(PLATFORM_PATHS)("renders %s with its title and a route", async (path) => {
    await renderPage(path);
    await expect.element(page.getByRole("heading", { level: 1, name: TITLES[path] })).toBeInTheDocument();
    expect(routes.some((route) => route.path === path)).toBe(true);
  });

  it.each([
    ["/windows/", "Ouro UI for Windows"],
    ["/android/", "Ouro UI for Android"],
  ] as const)("marks %s in its own section menu", async (path, label) => {
    await renderPage(path);
    const menu = page.getByRole("navigation", { name: label, includeHidden: true });
    expect(menu.element().querySelector('[aria-current="page"]')?.getAttribute("href")).toMatch(new RegExp(`${path}$`));
  });

  it("every component the Windows page counts is a control in the parity matrix", () => {
    const matrix = new Set(platforms.windows.components.map((component) => component.name));
    expect(kits.windows.components.filter((name) => !matrix.has(`Ouro${name}`))).toEqual([]);
  });

  it("every component the Android page counts is a composable in the parity matrix", () => {
    const matrix = new Set(platforms.android.components.map((component) => component.name));
    expect(kits.android.components.filter((name) => !matrix.has(`Ouro${name}`))).toEqual([]);
  });

  it("reads the parity matrix's component rows, and counts what each platform has", () => {
    const read = readCoverage(
      "### Components\n\n| Component | Web | Apple | Android | Windows |\n|---|---|---|---|---|\n| [button](https://ui.ouroboros.bot/docs/button/) | `button` | `OuroButton` | Not yet | `OuroButton` |\n| nav-button | Not yet | Not yet | Not yet | `OuroNavButton` |\n\n### Claims\n",
    );
    expect(read.rows).toEqual([
      { name: "button", web: "button", apple: "OuroButton", android: null, windows: "OuroButton" },
      { name: "nav-button", web: null, apple: null, android: null, windows: "OuroNavButton" },
    ]);
    expect(read.counts).toEqual({ web: 1, apple: 1, windows: 2, android: 0 });
    expect(coverage.counts.windows).toBe(platforms.windows.components.length);
    expect(coverage.counts.android).toBe(platforms.android.components.length);
  });

  it("control: coverage shows the native kits' rows, then every row once pressed", async () => {
    await renderPage("/hx/");
    const table = () => document.querySelector("#coverage ~ * table, section[aria-labelledby='coverage'] table");
    await expect.poll(() => table()?.querySelectorAll("tbody tr").length).toBe(coverage.rows.filter((row) => row.apple || row.android || row.windows).length);
    await userEvent.click(page.getByRole("button", { name: /web-only ones too/ }));
    await expect.poll(() => table()?.querySelectorAll("tbody tr").length).toBe(coverage.rows.length);
  });

  it("control: the web's buttons say which one was pressed", async () => {
    await renderPage("/hx/");
    await userEvent.click(page.getByRole("button", { name: "Destructive" }));
    await expect.poll(() => document.querySelector(".hx-four-said")?.textContent).toMatch(/^Destructive pressed\./);
  });

  it("sends /web/ to Ouro HX's web tab", () => {
    expect(redirects).toContainEqual({ from: "/web/", to: "/hx/#web" });
  });
});
