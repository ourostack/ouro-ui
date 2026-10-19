import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";

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
 * page module's (site/src/app.tsx loads the module before hydrating; prerender.mts preloads it).
 */
function initialFiles(manifest: Record<string, BuildEntry>, kind: "landing" | "voyage" | "docs"): string[] {
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
 * Initial JavaScript ceilings, gzip bytes (site-design.md, Budgets). The landing page may not
 * grow from 274,131 bytes, what it loaded on main at fdbaa9d2 before each page got its own chunk;
 * the voyage preview gets 270 KB.
 */
const CEILINGS = { landing: 274_131, voyage: 270 * 1024, docs: 274_131 } as const;

function diagnostics(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") errors.push(message.text());
  });
  return errors;
}

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
    release();
    await page.getByRole("combobox", { name: "Course", exact: true }).click();
    await page.getByRole("option", { name: "Main", exact: true }).click();
    await page.getByRole("button", { name: "Save recipe", exact: true }).click();
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

test("initial landing JS excludes demos and each opened example requests only its own module closure", async ({ page }, info) => {
  const errors = diagnostics(page);
  const reads: Array<Promise<{ file: string; bytes: number; encoding: string | undefined }>> = [];
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (path.endsWith(".js")) {
      reads.push(response.body().then((body) => ({
        file: path.replace(/^\/ouro-ui\//, ""),
        bytes: body.byteLength,
        encoding: response.headers()["content-encoding"],
      })));
    }
  });
  await page.goto("./");
  for (const name of ["Form", "Sheet", "Menu", "Swipe actions", "Table"]) {
    await expect(page.getByRole("button", { name: `Show ${name} example`, exact: true })).toHaveAttribute("aria-expanded", "false");
  }
  const initial = await Promise.all(reads);
  const expectedFiles = initialFiles(buildManifest(), "landing");
  const moduleMap = JSON.parse(readFileSync(resolve("site/dist/.vite/chunk-modules.json"), "utf8")) as Record<string, string[]>;
  const initiallyLoadedModules = expectedFiles.flatMap((file) => {
    const modules = moduleMap[file];
    if (!modules) throw new Error(`No module attribution for ${file}`);
    return modules;
  });
  expect(initiallyLoadedModules.some((module) => /\/demos\/.*\.demo\.tsx|node_modules\/recharts\//.test(module))).toBe(false);
  expect(initial.map((item) => item.file).sort()).toEqual(expectedFiles);
  expect(initial.some((item) => item.file.includes(".demo-") || /recharts|chart-/i.test(item.file))).toBe(false);
  const metrics = expectedFiles.map((file) => {
    const bytes = readFileSync(resolve("site/dist", file));
    return { file, raw: bytes.byteLength, gzip: gzipSync(bytes).byteLength };
  });
  expect(initial.map((item) => item.bytes).reduce((sum, size) => sum + size, 0))
    .toBe(metrics.reduce((sum, item) => sum + item.raw, 0));
  const increments = [];
  for (const [title, name, control] of [
    ["Form", "form", "Save recipe"],
    ["Sheet", "sheet", "Save to cookbook"],
    ["Menu", "menu", "Actions"],
    ["Swipe actions", "swipe-actions", "Actions for Shakshuka"],
    ["Table", "table", undefined],
  ] as const) {
    const start = reads.length;
    await page.getByRole("button", { name: `Show ${title} example`, exact: true }).click();
    if (control) await expect(page.getByRole("button", { name: control, exact: true })).toBeVisible();
    else await expect(page.getByRole("table", { name: "Recipes", exact: true })).toBeVisible();
    const added = await Promise.all(reads.slice(start));
    expect(added.filter((item) => item.file.includes(".demo-")).map((item) => item.file))
      .toEqual([expect.stringMatching(new RegExp(`^assets/${name}\\.demo-`))]);
    const loadedModules = added.flatMap((item) => {
      const modules = moduleMap[item.file];
      if (!modules) throw new Error(`No module attribution for ${item.file}`);
      return modules;
    });
    expect(loadedModules.filter((module) => /\/demos\/.*\.demo\.tsx/.test(module)))
      .toEqual([`site/src/docs/demos/${name}.demo.tsx`]);
    increments.push({ name, requested: added, modules: loadedModules });
    await page.getByRole("button", { name: `Hide ${title} example`, exact: true }).click();
    const reopen = reads.length;
    await page.getByRole("button", { name: `Show ${title} example`, exact: true }).click();
    await expect(page.locator(`[data-site-demo="${name}"] > *`).first()).toBeVisible();
    expect(reads.length).toBe(reopen);
    await page.getByRole("button", { name: `Hide ${title} example`, exact: true }).click();
  }
  await info.attach("built-js-transfer", {
    body: JSON.stringify({ initial, metrics, modules: initiallyLoadedModules, increments }, null, 2),
    contentType: "application/json",
  });
  expect(errors).toEqual([]);
});

test("each page loads only its own JavaScript closure, within its ceiling, and never Recharts first", async ({ page }, info) => {
  const errors = diagnostics(page);
  const manifest = buildManifest();
  const moduleMap = JSON.parse(readFileSync(resolve("site/dist/.vite/chunk-modules.json"), "utf8")) as Record<string, string[]>;
  const report: Record<string, unknown> = {};
  for (const [kind, path, ready] of [
    ["landing", "./", page.getByRole("button", { name: "Show Form example", exact: true })],
    ["voyage", "voyage/", page.locator("html[data-site-ready]")],
    ["docs", "docs/", page.getByRole("heading", { level: 1 })],
  ] as const) {
    const reads: string[] = [];
    const listener = (response: { url(): string }) => {
      const file = new URL(response.url()).pathname.replace(/^\/ouro-ui\//, "");
      if (file.endsWith(".js")) reads.push(file);
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
      // The preview never pulls the docs' generated Markdown or the landing page.
      expect(modules.filter((module) => /site\/src\/(docs\/|pages\/(landing|docs)\.tsx)/.test(module))).toEqual([]);
    }
    if (kind === "landing") expect(modules).not.toContain("site/src/pages/voyage.tsx");
    const loaded = [...new Set(reads)].filter((file) => !file.includes(".demo-"));
    expect(loaded.sort(), `${kind} loads its closure and nothing else`).toEqual(expected);
    const gzip = expected.reduce((sum, file) => sum + gzipSync(readFileSync(resolve("site/dist", file))).byteLength, 0);
    report[kind] = { gzip, ceiling: CEILINGS[kind], files: expected.length };
    expect(gzip, `${kind} initial JavaScript, gzip bytes`).toBeLessThanOrEqual(CEILINGS[kind]);
  }
  await info.attach("initial-js-by-page", { body: JSON.stringify(report, null, 2), contentType: "application/json" });
  expect(errors).toEqual([]);
});
