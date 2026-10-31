import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { auditPage } from "./audit";
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
    // Chapter I's island loads once the page is live; wait for it, or WebKit can go network-idle
    // first and the island's files land while the next page loads, counted as that page's.
    if (name === "nautilus") {
      // PROBE (never merged): how long Chapter I takes, and what its chunks did.
      const t0 = Date.now();
      const took = await page.locator("#chapter-one[data-chapter-ready]").waitFor({ state: "attached", timeout: 30_000 }).then(() => Date.now() - t0, () => -1);
      const timing = await page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
        const chunks = performance.getEntriesByType("resource").filter((e) => /chapter-one|frame-|reorderable|checklist/.test(e.name)).map((e) => `${e.name.split("/").pop()} start ${e.startTime.toFixed(0)} end ${(e as PerformanceResourceTiming).responseEnd.toFixed(0)} ${(e as PerformanceResourceTiming).nextHopProtocol}`);
        const top = document.getElementById("chapter-one")?.getBoundingClientRect().top;
        return { dcl: nav?.domContentLoadedEventEnd.toFixed(0), load: nav?.loadEventEnd.toFixed(0), ready: performance.now().toFixed(0), top, inner: innerHeight, scrollY, chunks };
      });
      console.log(`PROBE CATALOG ch1 ${took < 0 ? "NEVER" : took > 5000 ? "SLOW" : "OK"} ${took} ms ${info.project.name} repeat ${info.repeatEachIndex} ${JSON.stringify(timing)}`);
      expect(took, "Chapter I ready within 5 s").toBeGreaterThan(-1);
      expect(took, "Chapter I ready within 5 s").toBeLessThanOrEqual(5000);
    }
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
    // The docs sidebar and the docs' header are islands too: they may load after the docs' closure, and they are not part of the ceiling.
    const island = new Set(
      name === "nautilus"
        ? islandFiles(manifest).filter((file) => !expected.includes(file))
        : kind === "docs"
          ? [...lazyFiles(manifest, "src/components/docs-sidebar.tsx", expected), ...lazyFiles(manifest, "src/components/docs-header.tsx", expected)]
          : [],
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
  // registry components and site files it never renders: it loads none of the docs' stylesheets but
  // the theme presets (themes/presets.generated.css), which the header's picker switches on both.
  const presetsOnly = (sheet: string) => {
    const css = readFileSync(resolve("site/dist", sheet), "utf8");
    return css.includes("[data-theme=sleek]") && !css.includes("--tw-") && !/\.(?:site|voyage|stage|chapter)-/.test(css);
  };
  for (const name of ["home", "nautilus"]) {
    const shared = sheets[name]!.filter((sheet) => sheets["docs"]!.includes(sheet));
    expect(shared.filter((sheet) => !presetsOnly(sheet)), `${name} shares a stylesheet with the docs`).toEqual([]);
    expect(shared.length, `${name} shares only the presets with the docs`).toBeLessThanOrEqual(1);
  }
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

/** Whether a chunk carries Recharts, by the modules the build put in it. */
const rechartsIn = (modules: readonly string[]) => modules.some((module) => module.startsWith("node_modules/recharts/"));

/**
 * The chapters, each its own island. Chapter II draws an HX Chart, so
 * its closure, and only its, holds
 * Recharts; the budget counts what the island adds without that chunk and without shared HX chunks
 * (site-design.md, Budgets: "Each chapter island ≤ 60 KB gzip excluding shared HX chunks; Chart's
 * Recharts chunk only in Chapter II's closure, never in the initial closure (asserted by module
 * name)"). A shared HX chunk holds only HX's own modules and the Base UI they are built on
 * (HX_MODULES), and is imported from outside the island too (another chapter, a docs page): an HX
 * component's chunk carries its Base UI parts with it, so it is still HX's, not the chapter's.
 */
const HX_MODULES = ["registry/", "node_modules/@base-ui/"] as const;

const ISLANDS = [
  { chapter: "Chapter I", entry: "src/voyage/chapters/chapter-one.tsx", source: "site/src/voyage/chapters/chapter-one", recharts: false },
  { chapter: "Chapter II", entry: "src/voyage/chapters/chapter-two.tsx", source: "site/src/voyage/chapters/chapter-two", recharts: true },
  { chapter: "Chapter III", entry: "src/voyage/chapters/chapter-three.tsx", source: "site/src/voyage/chapters/chapter-three", recharts: false },
] as const;

for (const island of ISLANDS) {
  test(`${island.chapter} is an island: none of it is in the voyage's first load, and what it adds stays within 60 KB gzip${island.recharts ? ", Recharts aside, which only it loads" : " without Recharts"}`, () => {
    const manifest = buildManifest();
    const moduleMap = JSON.parse(readFileSync(resolve("site/dist/.vite/chunk-modules.json"), "utf8")) as Record<string, string[]>;
    const voyage = new Set(initialFiles(manifest, "voyage"));
    const closure = new Set<string>();
    const visit = (key: string) => {
      const item = manifest[key];
      if (!item) throw new Error(`Missing build manifest entry: ${key}`);
      if (closure.has(item.file)) return;
      closure.add(item.file);
      for (const dependency of item.imports ?? []) visit(dependency);
    };
    visit(island.entry);
    const keys = new Set(Object.keys(manifest).filter((key) => closure.has(manifest[key]!.file)));
    const importedFromOutside = (file: string) =>
      Object.entries(manifest).some(([key, item]) => !keys.has(key) && (item.imports ?? []).some((dependency) => manifest[dependency]?.file === file));
    const hxOnly = (file: string) => (moduleMap[file] ?? []).length > 0 && moduleMap[file]!.every((module) => HX_MODULES.some((prefix) => module.startsWith(prefix)));
    const own = manifest[island.entry]!.file;
    expect(voyage.has(own), "the chapter's own chunk is not in the voyage's first load").toBe(false);
    expect([...voyage].flatMap((file) => moduleMap[file] ?? []).filter((module) => module.startsWith(island.source))).toEqual([]);
    expect(rechartsIn([...voyage].flatMap((file) => moduleMap[file] ?? [])), "Recharts is never in the voyage's first load").toBe(false);
    const added = [...closure].filter((file) => !voyage.has(file));
    const withRecharts = added.filter((file) => rechartsIn(moduleMap[file] ?? []));
    expect(withRecharts.length > 0, `${island.chapter} ${island.recharts ? "loads" : "never loads"} Recharts`).toBe(island.recharts);
    const sharedHx = added.filter((file) => !withRecharts.includes(file) && hxOnly(file) && importedFromOutside(file));
    const counted = added.filter((file) => !withRecharts.includes(file) && !sharedHx.includes(file));
    const size = (file: string) => gzipSync(readFileSync(resolve("site/dist", file))).byteLength;
    const sum = (files: readonly string[]) => files.reduce((total, file) => total + size(file), 0);
    const gzip = sum(counted);
    const breakdown = counted.map((file) => `${file} ${size(file)}`).join(", ");
    test.info().annotations.push({ type: island.entry, description: `${gzip} bytes gzip over ${counted.length} files (${breakdown}), plus ${sum(sharedHx)} in shared HX chunks${island.recharts ? ` and ${sum(withRecharts)} in the Recharts chunk` : ""}` });
    expect(gzip, `${island.chapter}'s island, gzip bytes: ${breakdown}`).toBeLessThanOrEqual(ISLAND_CEILING);
  });
}

test("the 404 page is lost at sea: a guess, a search and the way home, passing the strict audit", async ({ page, browserName }) => {
  test.slow(browserName === "webkit");
  const errors = diagnostics(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("404.html");
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
  await expect(page.getByRole("heading", { level: 1, name: "Lost at sea" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to the surface" })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search the docs" }).fill("button");
  await expect(page.getByRole("search").getByRole("link", { name: "Button", exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(await auditPage(page, browserName)).toBe("");
  expect(errors).toEqual([]);
});
