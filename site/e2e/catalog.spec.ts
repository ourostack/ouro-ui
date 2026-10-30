import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { diagnostics } from "./diagnostics";

interface BuildEntry {
  file: string;
  src?: string;
  isEntry?: boolean;
  imports?: string[];
}

function buildManifest(): Record<string, BuildEntry> {
  return JSON.parse(readFileSync(resolve("site/dist/.vite/manifest.json"), "utf8")) as Record<string, BuildEntry>;
}

/**
 * The JavaScript a page needs before it is interactive: the client entry's static closure and its
 * page module's (site/src/app.tsx loads the module after the first paint, then hydrates).
 */
/**
 * The files a lazily loaded module adds after a page's own closure: its chunk and the imports that
 * closure does not already hold. The docs sidebar loads this way (site/src/components/docs-shell.tsx).
 */
function lazyFiles(manifest: Record<string, BuildEntry>, key: string, initial: string[]): string[] {
  const files = new Set<string>();
  const visit = (name: string) => {
    const item = manifest[name];
    if (!item) throw new Error(`Missing build manifest dependency: ${name}`);
    if (files.has(item.file) || initial.includes(item.file)) return;
    files.add(item.file);
    for (const dependency of item.imports ?? []) visit(dependency);
  };
  visit(key);
  return [...files];
}

function initialFiles(manifest: Record<string, BuildEntry>, kind: "voyage" | "docs"): string[] {
  const entry = Object.entries(manifest).find(([key, value]) => key === "index.html" && value.isEntry);
  if (!entry) throw new Error("No production client entry in the build manifest");
  const files = new Set<string>();
  const visit = (key: string) => {
    const item = manifest[key];
    if (!item) throw new Error(`Missing build manifest dependency: ${key}`);
    if (files.has(item.file)) return;
    files.add(item.file);
    for (const dependency of item.imports ?? []) visit(dependency);
  };
  visit(entry[0]);
  visit(`src/pages/${kind}.tsx`);
  return [...files].sort();
}

/**
 * Initial JavaScript ceilings, gzip bytes (site-design.md, Budgets). The docs may not grow: they
 * are what they loaded at 7c13bd6a (#141 on main at bf855de4, after the docs stopped loading every
 * page's Markdown first and after #138's claims), 167,396 bytes, plus 1 KiB. The voyage pages (the
 * home page and the Nautilus's) get 270 KB.
 */
const CEILINGS = { voyage: 270 * 1024, docs: 167_396 + 1024 } as const;

/** The CSS each page loads before it paints, gzip bytes: every stylesheet together (site-design.md, Budgets). */
const CSS_CEILINGS = { voyage: 36 * 1024, docs: 40 * 1024 } as const;

test("every built docs demo has resolved static content, and native example content is visible without JS", async ({ browser, request, baseURL }) => {
  const names = Object.keys(buildManifest())
    .map((name) => /\/docs\/demos\/(.+)\.demo\.tsx$/.exec(name)?.[1])
    .filter((name): name is string => name !== undefined);
  expect(names.length).toBeGreaterThan(5);
  for (const name of names) {
    const response = await request.get(`docs/${name}/`);
    expect(response.ok(), name).toBe(true);
    const html = await response.text();
    expect(html, name).toContain(`data-site-demo="${name}"`);
    expect(html, name).not.toContain("data-site-demo-loading");
    expect(html, name).not.toContain('data-msg="');
    expect(html, name).not.toContain("<!--app-->");
    expect(html, name).not.toContain("<!--head-->");
  }
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    const errors = diagnostics(page);
    for (const name of ["form", "sheet", "menu", "swipe-actions", "table", "text-field"]) {
      await page.goto(new URL(`docs/${name}/`, baseURL).href);
      await expect(page.locator(`[data-site-demo="${name}"] > *`).first()).toBeVisible();
      await expect(page.locator("[data-site-demo-loading]")).toHaveCount(0);
      if (name === "form") {
        await expect(page.getByRole("textbox", { name: "Recipe name", exact: true })).toHaveValue("Pasta");
        await expect(page.getByRole("combobox", { name: "Course", exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "Save recipe", exact: true })).toBeVisible();
      }
      if (name === "sheet") await expect(page.getByRole("button", { name: "Save to cookbook", exact: true })).toBeVisible();
      if (name === "menu") await expect(page.getByRole("button", { name: "Actions", exact: true })).toBeVisible();
      if (name === "swipe-actions") await expect(page.getByRole("button", { name: "Actions for Shakshuka", exact: true })).toBeVisible();
      if (name === "table") {
        const table = page.getByRole("table", { name: "Recipes", exact: true });
        await expect(table).toBeVisible();
        await expect(table.getByRole("row")).toHaveCount(4);
      }
      if (name === "text-field") {
        await expect(page.locator("pre code").filter({ hasText: 'startAdornment="$"' }).first()).toBeVisible();
      }
    }
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("literal dollar examples survive template serialization and real hydration", async ({ page }) => {
  const errors = diagnostics(page);
  await page.goto("docs/text-field/");
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
  await expect(page.locator("pre code").filter({ hasText: 'startAdornment="$"' }).first()).toBeVisible();
  const input = page.getByRole("textbox", { name: "Price", exact: true });
  await input.fill("7.25");
  await expect(input).toHaveValue("7.25");
  expect(errors).toEqual([]);
});

test("real production hydration keeps label/control IDs while the uncached selected demo chunk is delayed", async ({ page }) => {
  const errors = diagnostics(page);
  let release!: () => void;
  let requested!: () => void;
  const gate = new Promise<void>((done) => { release = done; });
  const pending = new Promise<void>((done) => { requested = done; });
  await page.route("**/assets/form.demo-*.js", async (route) => {
    requested();
    await gate;
    await route.continue();
  });
  try {
    await page.goto("docs/form/", { waitUntil: "domcontentloaded" });
    await pending;
    const name = page.getByRole("textbox", { name: "Recipe name", exact: true });
    await expect(name).toHaveValue("Pasta");
    const before = await name.getAttribute("id");
    expect(before).not.toBeNull();
    await expect(page.locator(`label[for="${before}"]`)).toHaveText("Recipe name");
    await expect(page.locator("[data-site-demo-loading]")).toHaveCount(0);
    await expect(name).toBeDisabled();
    await expect(page.getByRole("combobox", { name: "Course", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Save recipe", exact: true })).toBeDisabled();
    await expect(page.locator("[data-site-demo-ready]")).toHaveCount(0);
    release();
    // The demo goes live a render after its chunk arrives, and says so once its handlers are attached.
    await expect(page.locator('[data-site-demo="form"][data-site-demo-ready]')).toBeAttached();
    const course = page.getByRole("combobox", { name: "Course", exact: true });
    await course.click();
    // The popup scales in; on a busy machine a click during that can press one option and release
    // on another, which picks the wrong one or none. Pick once it is open and still.
    const popup = page.locator('[data-ouro="select-popup"]');
    await expect(popup).toHaveAttribute("data-open", "");
    await expect(popup).not.toHaveAttribute("data-starting-style");
    await popup.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
    await page.getByRole("option", { name: "Main", exact: true }).click();
    await expect(course).toHaveText(/Main/);
    // While it closes, its backdrop still takes the page's clicks; press Save once it has gone.
    await expect(popup).toBeHidden();
    await page.getByRole("button", { name: "Save recipe", exact: true }).click();
    // real clock: the field's error, which stays until the next save.
    await expect(page.getByText("A recipe called Pasta already exists.", { exact: true })).toBeVisible();
    await expect(name).toHaveAttribute("id", before!);
    await expect(name).toHaveAttribute("aria-invalid", "true");
    const describedBy = await name.getAttribute("aria-describedby");
    expect(describedBy).not.toBeNull();
    const messages = await page.locator("body").evaluate((_body, ids) =>
      ids.split(/\s+/).map((id) => document.getElementById(id)?.textContent),
    describedBy!);
    expect(messages).toContain("A recipe called Pasta already exists.");
    expect(errors).toEqual([]);
  } finally {
    release();
  }
});

test("each page loads only its own JavaScript closure, within its ceiling, and never Recharts first", async ({ page }, info) => {
  const errors = diagnostics(page);
  const manifest = buildManifest();
  const moduleMap = JSON.parse(readFileSync(resolve("site/dist/.vite/chunk-modules.json"), "utf8")) as Record<string, string[]>;
  const report: Record<string, unknown> = {};
  const sheets: Record<string, string[]> = {};
  for (const [name, kind, path, ready] of [
    ["home", "voyage", "./", page.locator("html[data-site-ready]")],
    ["nautilus", "voyage", "nautilus/", page.locator("html[data-site-ready]")],
    ["docs", "docs", "docs/", page.locator("html[data-site-ready]")],
  ] as const) {
    const reads: string[] = [];
    const styles: string[] = [];
    const listener = (response: { url(): string }) => {
      const file = new URL(response.url()).pathname.replace(/^\//, "");
      if (file.endsWith(".js")) reads.push(file);
      if (file.endsWith(".css")) styles.push(file);
    };
    page.on("response", listener);
    await page.goto(path);
    await expect(ready.first()).toBeAttached();
    await page.waitForLoadState("networkidle");
    page.off("response", listener);
    const expected = initialFiles(manifest, kind);
    const modules = expected.flatMap((file) => moduleMap[file] ?? []);
    expect(modules.some((module) => module.startsWith("node_modules/recharts/")), `${kind} loads Recharts first`).toBe(false);
    expect(modules.some((module) => /\/demos\/.*\.demo\.tsx$/.test(module)), `${kind} loads a docs demo first`).toBe(false);
    if (kind === "voyage") {
      // The voyage pages never pull the docs' generated Markdown or the docs page.
      expect(modules.filter((module) => /site\/src\/(docs\/|pages\/docs\.tsx)/.test(module))).toEqual([]);
    }
    if (kind === "docs") expect(modules).not.toContain("site/src/pages/voyage.tsx");
    // Each docs page loads only its own Markdown, so the docs do not grow with every page they add.
    if (kind === "docs") expect(modules.filter((module) => /^(?:docs\/.*\.md|UPGRADING\.md)\?raw$/.test(module)), `${kind} loads the docs' Markdown first`).toEqual([]);
    // The Nautilus's page asks for Chapter I's island as soon as it is live, the chapter being near the top.
    // The docs sidebar is an island too: it may load after the docs' closure, and it is not part of the ceiling.
    const island = new Set(
      name === "nautilus" ? islandFiles(manifest).filter((file) => !expected.includes(file)) : kind === "docs" ? lazyFiles(manifest, "src/components/docs-sidebar.tsx", expected) : [],
    );
    const loaded = [...new Set(reads)].filter((file) => !file.includes(".demo-") && !island.has(file));
    expect(loaded.sort(), `${name} loads its closure and nothing else`).toEqual(expected);
    const gzip = expected.reduce((sum, file) => sum + gzipSync(readFileSync(resolve("site/dist", file))).byteLength, 0);
    const css = [...new Set(styles)].reduce((sum, file) => sum + gzipSync(readFileSync(resolve("site/dist", file))).byteLength, 0);
    report[name] = { gzip, ceiling: CEILINGS[kind], files: expected.length, css, cssCeiling: CSS_CEILINGS[kind] };
    expect(gzip, `${name} initial JavaScript, gzip bytes`).toBeLessThanOrEqual(CEILINGS[kind]);
    expect(styles.length, `${name} loads its stylesheets`).toBeGreaterThan(0);
    sheets[name] = [...new Set(styles)];
    expect(css, `${name} CSS, gzip bytes`).toBeLessThanOrEqual(CSS_CEILINGS[kind]);
  }
  // The voyage has a Tailwind build of its own (site/src/voyage/voyage-tailwind.css), without the
  // registry components and site files it never renders: it loads none of the docs' stylesheets.
  for (const name of ["home", "nautilus"]) expect(sheets[name]!.filter((sheet) => sheets["docs"]!.includes(sheet)), `${name} shares a stylesheet with the docs`).toEqual([]);
  await info.attach("initial-js-by-page", { body: JSON.stringify(report, null, 2), contentType: "application/json" });
  expect(errors).toEqual([]);
});

/** Chapter I's island: its chunk and everything it imports. */
function islandFiles(manifest: Record<string, BuildEntry>): string[] {
  const files = new Set<string>();
  const visit = (key: string) => {
    const item = manifest[key];
    if (!item) throw new Error(`Missing build manifest entry: ${key}`);
    if (files.has(item.file)) return;
    files.add(item.file);
    for (const dependency of item.imports ?? []) visit(dependency);
  };
  visit("src/voyage/chapters/chapter-one.tsx");
  return [...files];
}

/** What a lazy island adds to its page when it loads, gzip bytes (site-design.md, Budgets: each chapter ≤ 60 KB). */
const ISLAND_CEILING = 60 * 1024;

test("Chapter I is an island: none of it is in the voyage's first load, and what it adds stays within 60 KB gzip without Recharts", () => {
  const manifest = buildManifest();
  const moduleMap = JSON.parse(readFileSync(resolve("site/dist/.vite/chunk-modules.json"), "utf8")) as Record<string, string[]>;
  const voyage = new Set(initialFiles(manifest, "voyage"));
  const island = new Set<string>();
  const visit = (key: string) => {
    const item = manifest[key];
    if (!item) throw new Error(`Missing build manifest entry: ${key}`);
    if (island.has(item.file)) return;
    island.add(item.file);
    for (const dependency of item.imports ?? []) visit(dependency);
  };
  visit("src/voyage/chapters/chapter-one.tsx");
  const own = manifest["src/voyage/chapters/chapter-one.tsx"]!.file;
  expect(voyage.has(own), "the chapter's own chunk is not in the voyage's first load").toBe(false);
  expect([...voyage].flatMap((file) => moduleMap[file] ?? []).filter((module) => module.startsWith("site/src/voyage/chapters/chapter-one"))).toEqual([]);
  const added = [...island].filter((file) => !voyage.has(file));
  const modules = added.flatMap((file) => moduleMap[file] ?? []);
  expect(modules.some((module) => module.startsWith("node_modules/recharts/"))).toBe(false);
  const gzip = added.reduce((sum, file) => sum + gzipSync(readFileSync(resolve("site/dist", file))).byteLength, 0);
  test.info().annotations.push({ type: "chapter-one", description: `${gzip} bytes gzip over ${added.length} files` });
  expect(gzip, "Chapter I's island, gzip bytes").toBeLessThanOrEqual(ISLAND_CEILING);
});
