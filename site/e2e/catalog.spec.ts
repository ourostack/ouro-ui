import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { auditPage } from "./audit";
import { assetHashes, distGzip, distHashes, stableGzip } from "./bytes";
import { diagnostics } from "./diagnostics";
import { gateMode, judgeSizes, readBase, type Sizes, writeReport } from "../../scripts/size-gate.mjs";

interface BuildEntry {
  file: string;
  src?: string;
  isEntry?: boolean;
  imports?: string[];
  dynamicImports?: string[];
}

function buildManifest(): Record<string, BuildEntry> {
  return JSON.parse(readFileSync(resolve("site/dist/.vite/manifest.json"), "utf8")) as Record<string, BuildEntry>;
}

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

/**
 * The JavaScript a page needs before it is interactive: the client entry's static closure and its
 * page module's (site/src/app.tsx loads the module after the first paint, then hydrates).
 */
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
 * home page and the Nautilus's) get 274 KiB: 270 KiB, and 4 KiB more for the Ouro family's bar and footer (FamilyBar and
 * FamilyFooter over the header and in the footer, Ari, 2026-11-08: "make everything feel like one big happy family"),
 * with which the home page measured 278,992 bytes, over the family-bar branch at bffc14e3. Then 1 KiB more (275 KiB):
 * by v1.3.10 the components the voyage pages load (the family bar's fade without script, the Navbar's one current
 * mark) had brought the home page within 200 bytes of 274 KiB, 280,398 bytes at 2495a54e, and the bar's section mark
 * on a page with its own navigation crossed it on CI. Then 2 KiB more (277 KiB) for the registry Hero at the top of every
 * page (Ari, 2026-11-13: one official Ouro component behind every hero): the home page measured 280,331 bytes on the
 * hero-media branch at e9f68765 and 282,379 with the voyage hero on Hero, 2,048 bytes for the component itself, its
 * development checks already stripped. Then 1 KiB more (278 KiB) for night art behind every hero (Ari, 2026-11-14: every
 * hero has the same scene at night, swapped with the site's theme): each scene's night sky, its night crop's height and,
 * where the day's alt names the time of day, its own alt, with which the home page measured 283,771 bytes on CI at 08f7bc91.
 * Then 1 KiB more (279 KiB) for Button's data-tone, which the sameness sweep keys looks by (home measured 284,720 bytes).
 * Then 1 KiB more (280 KiB) for the hand-off's Copy as HX's CopyButton, which says "Copied" on itself instead of a toast
 * in the corner (critics' D10): home measured 285,795 bytes with it, on CI at 0d69280b.
 * Then 1 KiB more (281 KiB) for the hand-off as HX's AgentHandoff (#2356; Ari: the site's improvements reach every app
 * through Ouro), whose look moved from the voyage's stylesheet into the component's classes: home measured 286,820 bytes
 * with it, on CI at 372a0256.
 * Then 1 KiB more (282 KiB) for the disabled reason: Button now carries Tooltip's wrapper for a button with a reason (#1953),
 * with which home measured 288,389 bytes on CI.
 * Then 1 KiB more (283 KiB) for MessageList's post marks, which draw the hairline between posts with no `:has()` or sibling
 * rule over the slots, which WebKit restyled every slot drawn for (#2714): home measured 288,775 bytes on CI with them.
 * The docs pages take 23,777 bytes more (191,197 on CI) plus 1 KiB: Button carries Tooltip for a button with a reason, so
 * Tooltip and its popup code come with every page that has a Button (#1953).
 *
 * From #2724 on, each ceiling is what CI measured plus one margin, not a round number: a whole-KiB step left up to a
 * kilobyte that later growth could hide in. CI's e2e log prints `script-size <page> <bytes> of <ceiling>` on every run, and
 * a raise records the new measurement there with its reason. Measured on CI at 1791bc71: home and the Nautilus's page
 * 288,772 bytes, the docs 191,491.
 *
 * The docs' measurement set again 2026-11-21 at 191,884 bytes, what CI measured on #2752's last run (44907852279, e2e job
 * 136857298173), the tree main has at af01ed5b. Main had grown 393 bytes past 191,491 over several merges, so it sat
 * 119 bytes under its ceiling, and component changes of under 200 bytes that do not touch site/ failed it (#2747 at
 * 192,051, #2749 at 192,073).
 *
 * Raised to 192,559 by Avatar's `markPicturesReady` (#2741), which every docs page with an Avatar loads: CI measured it on
 * #2749 (run 44912817700, e2e job 136872174945), on a main that had grown again since af01ed5b.
 *
 * The voyage's set again 2026-11-21 at 289,304 bytes, what CI measured on main at 75df9a066 (run 44925774214), after
 * density's height floors (`h-[max(var(--ouro-button-h),var(--ouro-size-6))]` on Button and Toggle, #2771) added about 20
 * bytes to the home page's first script (#2781).
 *
 * The docs' set again 2026-11-21 at 193,168 bytes, what CI measured on main at 22c2e5038 (run 44951374420), after
 * PreviewBar joined the catalog (#2803): its demo and page code load with the docs' first script (#2814).
 *
 * The home page's set again 2026-11-21 at 289,844 bytes, what CI measured on main at 8ec35db91 (run 44962422523), after the
 * header's Search button took its name and a longer hidden label (#2839): about 540 bytes more of the first script (#2845).
 *
 * The docs' set again 2026-11-21 at 193,959 bytes, what CI measured on main at 402e2c637 (run 44986937531), after the
 * ConversationFind catalog entry (#2829), the Sidebar fixes (#2871, #2882) and the code block's scroll shading (#2864)
 * reached the docs' first script (#2883).
 *
 * The docs' set again 2026-11-22 at 195,244 bytes, what CI measured on this pull request's run 44990113977 (e2e job
 * 137109213382), after a component page's install section put its namespace and tests commands under Collapsible's "More
 * ways": Collapsible and its code now load with every docs page's first script.
 *
 * The home page's set again 2026-11-22 at 292,756 bytes, what CI measured on #2987's run 45064226062 (e2e job
 * 137337038721), 2,777 over its base at 434214b: the hero's looks and the header's picker became Ouro HX's ThemePicker
 * (each look's name in its own face, the whole page previewed while a look is pointed at or focused, arrow keys across
 * one Tab stop), which replaced the site's own dots, so every app that installs it gets the same picker.
 *
 * The docs' set again 2026-11-23 at 196,004 bytes, measured on main at 536bb6d8f by Size ceilings' run 45111456606
 * (#2883), after the chat-demo guide's route and nav door (#2978) reached the docs' first script. Its own demo was
 * already behind a lazy chunk, but its shell call and lead text were not; #2883's fix moved the whole page behind that
 * chunk, leaving only the route entry and nav door in the shared script, which a guide page cannot avoid.
 */
const MEASURED = { voyage: 292_756, docs: 196_004 } as const;
/**
 * How far a page may grow past what CI measured before its ceiling is raised, and how much one pull request may add to
 * it: on a pull request the check judges that pull request's growth over its base, so a ceiling main has nearly reached
 * fails only the change that crosses it by more than this (scripts/size-gate.mjs). The ceiling itself is enforced on main.
 */
const MARGIN = 512;
const CEILINGS = { voyage: MEASURED.voyage + MARGIN, docs: MEASURED.docs + MARGIN } as const;

/**
 * The CSS each page loads before it paints, gzip bytes: every stylesheet together (site-design.md, Budgets). The voyage's
 * ceiling also pays for the component classes its pages reach (site/src/voyage/voyage-sources.generated.css).
 */
// The voyage's rose by 512 bytes for the phone's one menu (voyage/site-menu.tsx: its close button, X-ray beside it, a
// heading you jump to landing below the sticky header, the fish waiting under the open menu) and for the layers that make
// the stage's switch to still water cheap (stage.css, #667): together 489 bytes over main at d6059dc6, 37,834 there.
// It rose to 40.5 KiB for the storybook world (components/story-world.css: the dawn sky, the feathered scene, the sunrise)
// and the home page's showcase pictures and list of what comes with every component, which took over ouroboros.bot/ouro-hx/
// (Ari, 2026-11-07: "let's unify"): 39,809 bytes with them, over main at a2b06627. The docs' rose with it, to 40.5 KiB:
// its Tailwind build reads the same site files, and its heaviest page measured 41,047 bytes with them.
// The docs' rose to 41 KiB for Porthole (registry/ouro/components/ouro/porthole and its docs demo, #556), whose classes
// the docs' Tailwind build carries for every page: 41,719 bytes with it, over main at c9c06923 (the voyage leaves it out).
// The docs' rose to 41.5 KiB when every docs page opened in the storybook world without boxes (Ari, 2026-11-08: "let
// content BREATHE"): the title's sky and band, a scroll shadow for a table without its frame, and edges that Windows High
// Contrast still draws where outlines went: 42,104 bytes with them, over main at 8459a4d8.
// The voyage's rose to 41 KiB for the skip link every page opens with (registry/ouro/components/ouro/skip-link, whose
// classes the voyage used to leave out): 41,532 bytes with it, over main at 8b8d4701.
// The docs' rose to 43 KiB for Hero (registry/ouro/components/ouro/hero and its docs demo, #880), whose classes the
// docs' Tailwind build carries for every page: 43,652 bytes with it, over main at ca7114f0 (the voyage leaves it out).
// The voyage's rose to 41.5 KiB when its heroes moved onto that Hero (Ari, 2026-11-13: one official Ouro component behind
// every hero), whose classes its Tailwind build now carries: the home page measured 42,029 bytes with them, on CI at 7fce58d0.
// The voyage's rose to 42 KiB for the Quiet switch's glass (Ari, 2026-11-13: the switch as Liquid Glass), whose classes
// the home page's switch carries: 42,616 bytes with them, on CI at 952542bd.
// The docs' rose to 45 KiB for Carousel's pager of links (#1483), which a slide deck driven by the address needs and
// whose classes the docs' Tailwind build carries: 45,087 bytes with them, on CI merged with main at 1f5b9ec4.
// The voyage's rose to 44 KiB for ouro-base's disclosure for pages without a script (#1594), which every page's
// stylesheet carries with ouro-base: 44,171 bytes with it, on CI merged with main at e7570178.
// The docs' rose to 46 KiB for the theme's control and check shapes (#1915: the rounded-ouro-control utilities, and the
// style query that clips a round control's surface where corner-shape is missing), whose rules every page's stylesheet
// carries with ouro-base: 46,104 bytes with them, built locally over main at f34408a1.
// The voyage's rose to 45 KiB when the home page's first screen took a look to try and the hand-off to a person's agent
// (Ari, 2026-11-17: "a human will never do that npx"): round paint dots ringed from the page's own theme before it hydrates,
// and the hand-off's line and Copy, less the install command's rules: 45,107 bytes with them, built locally over main at dc800391.
// The docs' rose to 47 KiB for X-ray's opening scan (Ari, 2026-11-18: the "oh, nice" moment a first visitor tries): the
// band that sweeps down the screen and the outlines it shows as it passes, whose rules the docs' Tailwind build carries:
// 47,158 bytes with them, built locally over main at ca591b4f.
// The docs' rose to 48 KiB for the pieces a group chat needs (ChatHeader, TypingIndicator and ReadReceipt), whose classes
// the docs' Tailwind build carries: 48,160 bytes with them, on CI merged with main at 95a472ce.
// The voyage pages' rose to 46 KiB for the row and state token defaults in ouro-base: 46,117 bytes with them, on CI merged with main at 753056c3.
// The docs' rose to 49 KiB for TimeGrid's selected-event fills, whose classes the docs' Tailwind build carries: 49,488 bytes with them, on CI merged with main at ebebc75f.
// The voyage pages' rose to 47 KiB for ouro-base's text-wrap rules (pretty body copy, balanced headings): 47,147 bytes with them, on CI merged with main at 7c23ca8f.
// The docs' rose to 50 KiB for Card's backdrop (a picture behind the whole card, its own corner clip and a linked card's
// tint inside it), whose classes the docs' Tailwind build carries: 50,210 bytes with them, built locally over main at c7d1a1ad.
// The docs' CSS is split (#2491). The components index and the live demo page link the whole Tailwind build, which they
// always did: their previews, and the demo's ?name=, show any component. Every other docs page links the shared shell
// (docs-shell, which the browser keeps across the docs) and inlines in its head only the classes its own demo adds
// (site/scripts/docs-css.mts), so a new component moves its own page and the index, never the rest. CI prints each page's
// bytes as `css-size <page> <bytes> of <ceiling>`, and a raise records its measurement there with its reason. Measured on
// the split at 29751c13: the index 50,374 bytes with the theme presets, the shell alone 24,407, the badge page 29,424 and
// the heaviest component page (composed-surface) 34,346.
// Raised a KiB each (voyage 48,143 and docs 51,207 bytes measured in CI, 15 and 7 over the old ceilings) for the look
// swatches' focus ring: the picker is on every page, so the rule that gives a chosen swatch its own focus ring is
// paid by every page that shows it (#2836, per #2728).
// Raised a KiB each again (voyage 49,364 and docs 52,327 bytes measured in CI run 45052165035, 212 and 103 over) for the
// wordmark ThemePicker (#2987): its tiles, page-token ring and squircle square, and the phone menu's and the theming guide's rows.
const CSS_CEILINGS = { voyage: 49 * 1024, docs: 52 * 1024, docsShell: 26 * 1024, docsPage: 36 * 1024 } as const;

/**
 * What the components index's previews load once it is live, gzip bytes, on top of its first load: the demos of the
 * components on its first screen and a screen ahead, drawn small beside their names (site/src/components/catalog-preview.tsx;
 * Ari, 2026-11-18: the catalog a first visitor shows someone). They are their own budget, not the docs' first load, which
 * they never join: each draws as it nears the screen, one at a time when the browser is idle. The first screen's measured
 * 14,779 bytes over 13 files at 1440 by 900, built locally over main at e4a295a5; 24 KiB leaves room for the rows a slower
 * network idle lets draw first. It stays a round number with room: how many rows draw before the check depends on the
 * network's idle, so what it measures moves from run to run, unlike a page's first load.
 */
const PREVIEWS_CEILING = 24 * 1024;

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
    // Never shown disabled: a tap or text before the chunk arrives is kept and answered then (early-input.spec.ts).
    await expect(name).toBeEnabled();
    await expect(page.getByRole("combobox", { name: "Course", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Save recipe", exact: true })).toBeEnabled();
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

test("a chunk measures the same in builds that differ only in the hash of a chunk it imports, and more when its code grows", () => {
  const build = (hash: string, extra = "") => {
    const files = [`assets/message-list-${hash}.js`, "assets/stage-Q1w2E3r4.js", "assets/entry-Zx9_Yv8-.js"];
    const source = `import{M as e}from"./message-list-${hash}.js";import"./entry-Zx9_Yv8-.js";const t=["assets/message-list-${hash}.js"];export function s(){${extra}return e(t)}`;
    return stableGzip(source, assetHashes(files));
  };
  expect(assetHashes(["assets/message-list-8xipXzQa.js", "assets/Accordion-O-CKa_p-.js", "fonts/geist.woff2"])).toEqual(["8xipXzQa", "O-CKa_p-"]);
  expect(build("8xipXzQa")).toBe(build("Ab3_dE-9"));
  expect(build("8xipXzQa", "if(e.gap>320)return null;")).toBeGreaterThan(build("Ab3_dE-9"));
});

test("each page loads only its own JavaScript closure, within its ceiling, and never Recharts first", async ({ page }, info) => {
  const errors = diagnostics(page);
  const manifest = buildManifest();
  const moduleMap = JSON.parse(readFileSync(resolve("site/dist/.vite/chunk-modules.json"), "utf8")) as Record<string, string[]>;
  const hashes = distHashes();
  const report: Record<string, unknown> = {};
  const sheets: Record<string, string[]> = {};
  const sizes: Sizes = {};
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
    if (name === "nautilus") await expect(page.locator("#chapter-one[data-chapter-ready]")).toBeAttached();
    await page.waitForLoadState("networkidle");
    // The index's previews draw once it is live, one at a time when the browser is idle, which can come after the network
    // goes quiet (WebKit has no requestIdleCallback): wait for the first to fill, so the budget below measures them.
    if (kind === "docs") await expect(page.locator("[data-site-preview-drawn] > *").first()).toBeAttached({ timeout: 15_000 });
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
    // The index's previews load the demos they draw, and the components those use, once it is live: within their own
    // budget. Only the frames that drew count, so any other chunk the page fetches still fails the closure check below.
    const drew = kind === "docs" ? await page.locator("[data-site-preview-drawn]").evaluateAll((frames) => frames.map((frame) => frame.getAttribute("data-site-preview")!)) : [];
    const previews = new Set(drew.flatMap((demo) => lazyFiles(manifest, `src/docs/demos/${demo}.demo.tsx`, expected)).filter((file) => !island.has(file)));
    if (kind === "docs") {
      const drawn = [...new Set(reads)].filter((file) => previews.has(file));
      const previewGzip = drawn.reduce((sum, file) => sum + distGzip(file, hashes), 0);
      report["docs previews"] = { gzip: previewGzip, ceiling: PREVIEWS_CEILING, files: drawn.length };
      // In the job's log on every run, so a ceiling is set from what CI measures, not from a local build's gzip (#2724).
      console.log(`script-size docs-previews ${previewGzip} of ${PREVIEWS_CEILING}`);
      expect(drew.length, "the index draws previews once it is live").toBeGreaterThan(0);
      expect(previewGzip, `the index's previews, gzip bytes: ${drawn.join(", ")}`).toBeLessThanOrEqual(PREVIEWS_CEILING);
    }
    // OuroProvider loads the squircle polyfill after mount, in a chunk of its own that is no part of the first load.
    const isPolyfill = (file: string) => (moduleMap[file] ?? []).length > 0 && (moduleMap[file] ?? []).every((module) => module.startsWith("registry/ouro/lib/ouro/squircle"));
    const loaded = [...new Set(reads)].filter((file) => !file.includes(".demo-") && !island.has(file) && !previews.has(file) && !isPolyfill(file));
    expect(loaded.sort(), `${name} loads its closure and nothing else`).toEqual(expected);
    // Chunk hashes are measured as one placeholder, so a module renamed by another's change costs nothing (bytes.ts).
    const gzip = expected.reduce((sum, file) => sum + distGzip(file, hashes), 0);
    const css = [...new Set(styles)].reduce((sum, file) => sum + gzipSync(readFileSync(resolve("site/dist", file))).byteLength, 0);
    report[name] = { gzip, ceiling: CEILINGS[kind], files: expected.length, css, cssCeiling: CSS_CEILINGS[kind] };
    console.log(`script-size ${name} ${gzip} of ${CEILINGS[kind]}`);
    sizes[`${name} initial JavaScript, gzip bytes`] = { bytes: gzip, ceiling: CEILINGS[kind], budget: MARGIN };
    expect(styles.length, `${name} loads its stylesheets`).toBeGreaterThan(0);
    sheets[name] = [...new Set(styles)];
    expect(css, `${name} CSS, gzip bytes`).toBeLessThanOrEqual(CSS_CEILINGS[kind]);
  }
  // On a pull request, each page's JavaScript is judged by what the pull request added over its base (scripts/size-gate.mjs).
  writeReport("closure", sizes);
  const verdict = judgeSizes(sizes, { mode: gateMode(), base: readBase("closure") });
  for (const line of verdict.lines) console.log(`script-size-gate ${line}`);
  for (const tip of verdict.tips) console.log(`::warning title=Pull request tips a size ceiling::${tip}`);
  expect(verdict.failures, "each page's initial JavaScript, gzip bytes").toEqual([]);
  // The voyage has a Tailwind build of its own (site/src/voyage/voyage-tailwind.css), without the
  // registry components and site files it never renders: it loads none of the docs' stylesheets but
  // the theme presets (themes/presets.generated.css), which the header's picker switches on both, and
  // the storybook world both open on (components/story-world.css), which Vite bundles with them.
  const storyClasses = new Set(readFileSync(resolve("site/src/components/story-world.css"), "utf8").match(/\.(?:site|voyage|stage|chapter)-[\w-]+/g));
  const presetsOnly = (sheet: string) => {
    const css = readFileSync(resolve("site/dist", sheet), "utf8");
    const own = (css.match(/\.(?:site|voyage|stage|chapter)-[\w-]+/g) ?? []).filter((name) => !storyClasses.has(name));
    return css.includes("[data-theme=pearl]") && !css.includes("--tw-") && own.length === 0;
  };
  for (const name of ["home", "nautilus"]) {
    const shared = sheets[name]!.filter((sheet) => sheets["docs"]!.includes(sheet));
    expect(shared.filter((sheet) => !presetsOnly(sheet)), `${name} shares a stylesheet with the docs`).toEqual([]);
    expect(shared.length, `${name} shares only the presets with the docs`).toBeLessThanOrEqual(1);
  }
  await info.attach("initial-js-by-page", { body: JSON.stringify(report, null, 2), contentType: "application/json" });
  expect(errors).toEqual([]);
});

/**
 * The docs' stylesheets, read from the built pages (site/scripts/prerender.mts): each docs page links one Tailwind sheet first,
 * the shared shell or, for the components index and the live demo page, the whole build; a component's page then inlines in its
 * head the classes its own demo adds (site/scripts/docs-css.mts). Each such page renders only classes the shell or its inline
 * block styles, its inline block repeats no declaration of the shell's, and no utility of its own sorts before a shell utility it
 * shares a property with, so the split resolves every element as the whole build does.
 */
test("each docs page links the shared shell or the whole build, and inlines only its own demo's classes, within its budget", () => {
  const built = (path: string) => readFileSync(resolve("site/dist", path), "utf8");
  const gzip = (text: string) => gzipSync(text).byteLength;
  const head = (html: string) => html.slice(0, html.indexOf("</head>"));
  const sheetsOf = (html: string) => [...head(html).matchAll(/<link rel="stylesheet"[^>]*href="\/([^"]+)"/g)].map(([, file]) => file!);
  const inlineOf = (html: string) => [...head(html).matchAll(/<style>([\s\S]*?)<\/style>/g)].map(([, css]) => css).join("");
  // The class names a stylesheet's rules select, from its selectors (the at-rules' headers excluded).
  const classNames = (css: string) => {
    const names = new Set<string>();
    for (const [, selector] of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{/g)) {
      if (selector!.trimStart().startsWith("@")) continue;
      for (const [, name] of selector!.matchAll(/\.((?:\\.|[\w-])+)/g)) names.add(name!.replace(/\\(.)/g, "$1"));
    }
    return names;
  };
  // Each declaration of a stylesheet keyed by the blocks it is in (their headers joined), as the build wrote them.
  const declarationsOf = (css: string) => {
    const blocks = new Map<string, Set<string>>();
    const stack: string[] = [];
    let text = "";
    let quote = "";
    for (let index = 0; index < css.length; index++) {
      const char = css[index]!;
      if (quote) {
        text += char;
        if (char === quote && css[index - 1] !== "\\") quote = "";
      } else if (char === '"' || char === "'") {
        quote = char;
        text += char;
      } else if (char === "{") {
        stack.push(text.trim());
        text = "";
      } else if (char === "}") {
        stack.pop();
        text = "";
      } else if (char === ";") {
        const declaration = text.trim();
        text = "";
        // A descriptor (@property, @font-face) is not a declaration of a rule: the shell's copy of one is not a repeat.
        if (declaration && !/^@(property|font-face|page)\b/.test(stack.at(-1) ?? "")) {
          const key = stack.join("\n");
          blocks.set(key, (blocks.get(key) ?? new Set()).add(declaration));
        }
      } else text += char;
    }
    return blocks;
  };
  const wholeSheet = sheetsOf(built("docs/index.html"))[0]!;
  expect(wholeSheet, "the components index links the whole build").toMatch(/(^|\/)docs-full-/);
  const shellSheet = sheetsOf(built("docs/badge/index.html"))[0]!;
  expect(shellSheet, "a component's page links the shared shell first").toMatch(/(^|\/)docs-shell-/);
  const shellCss = built(shellSheet);
  const shellClasses = classNames(shellCss);
  const shellDeclarations = declarationsOf(shellCss);
  const shellGzip = gzip(shellCss);
  console.log(`css-size docs-shell ${shellGzip} of ${CSS_CEILINGS.docsShell}`);
  expect(shellGzip, "the docs' shared shell, gzip bytes").toBeLessThanOrEqual(CSS_CEILINGS.docsShell);
  const wholeCss = built(wholeSheet);
  const wholeClasses = classNames(wholeCss);
  // The properties each plain one-class utility of a stylesheet sets, and where the whole build places each one.
  const propertiesOf = (css: string) => {
    const map = new Map<string, Set<string>>();
    for (const [, name, body] of css.matchAll(/\.([A-Za-z][\w-]*)\{([^{}]*)\}/g)) {
      const set = map.get(name!) ?? new Set<string>();
      for (const declaration of body!.split(";")) {
        const prop = declaration.split(":")[0]!.trim();
        if (prop) set.add(prop);
      }
      map.set(name!, set);
    }
    return map;
  };
  const wholeProperties = propertiesOf(wholeCss);
  const orderOf = (cls: string) => wholeCss.search(new RegExp(`(^|[{}])\\.${cls}\\{`));
  const pages = [
    { name: "docs", path: "docs/", kind: "docs", whole: true },
    { name: "docs-demo", path: "docs/demo/", kind: "docs", whole: true },
    { name: "badge", path: "docs/badge/", kind: "docsPage", whole: false },
    { name: "message-list", path: "docs/message-list/", kind: "docsPage", whole: false },
    { name: "composed-surface", path: "docs/composed-surface/", kind: "docsPage", whole: false },
    { name: "accessibility-evidence", path: "docs/accessibility-evidence/", kind: "docsPage", whole: false },
  ] as const;
  for (const { name, path, kind, whole } of pages) {
    const html = built(`${path}index.html`);
    const sheets = sheetsOf(html);
    const inline = inlineOf(html);
    expect(sheets[0], `${name} links its Tailwind sheet first`).toMatch(whole ? /(^|\/)docs-full-/ : /(^|\/)docs-shell-/);
    const bytes = sheets.reduce((sum, file) => sum + gzip(built(file)), 0) + (inline ? gzip(inline) : 0);
    // In the job's log on every run, so a raise is set from what CI measures (#2724).
    console.log(`css-size ${name} ${bytes} of ${CSS_CEILINGS[kind]}`);
    expect(bytes, `${name} CSS, gzip bytes`).toBeLessThanOrEqual(CSS_CEILINGS[kind]);
    if (whole) continue;
    const own = declarationsOf(inline);
    const repeated = [...own].flatMap(([block, declarations]) => [...declarations].filter((d) => shellDeclarations.get(block)?.has(d)).map((d) => `${block} { ${d} }`));
    expect(repeated, `${name}'s inline CSS repeats declarations of the shell`).toEqual([]);
    // Every class the page renders that the whole build styles, the shell or the page's own block styles.
    const ownClasses = classNames(inline);
    const ownProperties = propertiesOf(inline);
    const rendered = new Set([...html.matchAll(/class="([^"]*)"/g)].flatMap(([, value]) => value!.split(/\s+/)).filter(Boolean));
    const missing = [...rendered].filter((cls) => wholeClasses.has(cls) && !shellClasses.has(cls) && !ownClasses.has(cls));
    expect(missing, `${name} renders classes its stylesheets lack`).toEqual([]);
    // Utilities that set one property on one element resolve by their order in the build. The shell's come first here, so a
    // page's utility that the whole build sorts before a shell utility it shares a property with would win in the build and lose here.
    const reversed = [...html.matchAll(/class="([^"]*)"/g)].flatMap(([, value]) => {
      const names = value!.split(/\s+/).filter(Boolean);
      const fromShell = names.filter((cls) => shellClasses.has(cls) && wholeProperties.has(cls));
      const fromPage = names.filter((cls) => !shellClasses.has(cls) && ownProperties.has(cls));
      return fromShell.flatMap((shelled) =>
        fromPage
          .filter((own) => [...wholeProperties.get(shelled)!].some((prop) => wholeProperties.get(own)?.has(prop)) && orderOf(own) < orderOf(shelled))
          .map((own) => `${own} before ${shelled}`),
      );
    });
    expect(reversed, `${name}: a page utility the build sorts before a shell utility it shares a property with`).toEqual([]);
  }
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
 * The chapters, each its own island. Chapter II draws an HX Chart with `type`, which draws its own SVG, so no island
 * loads Recharts (an island that did would mark it `recharts: true`, and the budget would count what it adds without
 * that chunk); the budget leaves out shared HX chunks (site-design.md, Budgets: "Each chapter island ≤ 60 KB gzip
 * excluding shared HX chunks"). Recharts is never in the initial closure (asserted by module name). A shared HX chunk holds only HX's own modules and the Base UI they are built on
 * (HX_MODULES), and is imported from outside the island too (another chapter, a docs page): an HX
 * component's chunk carries its Base UI parts with it, so it is still HX's, not the chapter's.
 */
const HX_MODULES = ["registry/", "node_modules/@base-ui/"] as const;

const ISLANDS = [
  { chapter: "Chapter I", entry: "src/voyage/chapters/chapter-one.tsx", source: "site/src/voyage/chapters/chapter-one", recharts: false },
  { chapter: "Chapter II", entry: "src/voyage/chapters/chapter-two.tsx", source: "site/src/voyage/chapters/chapter-two", recharts: false },
  { chapter: "Chapter III", entry: "src/voyage/chapters/chapter-three.tsx", source: "site/src/voyage/chapters/chapter-three", recharts: false },
  // The Ouro UI for Apple pages (site/src/apple/), each an island of its own.
  { chapter: "Apple's overview", entry: "src/apple/home.tsx", source: "site/src/apple/", recharts: false },
  { chapter: "Ouro HX for Apple", entry: "src/apple/hx.tsx", source: "site/src/apple/", recharts: false },
  { chapter: "Ouro Feel", entry: "src/apple/feel.tsx", source: "site/src/apple/", recharts: false },
  { chapter: "Ouro AX for Apple", entry: "src/apple/ax.tsx", source: "site/src/apple/", recharts: false },
  { chapter: "Ouro Reins", entry: "src/apple/reins.tsx", source: "site/src/apple/", recharts: false },
  { chapter: "Apple's get started", entry: "src/apple/start.tsx", source: "site/src/apple/", recharts: false },
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
    // What the island's own chunks load later, by a dynamic import (Chart's Recharts), with what that imports: no part of
    // its first load, so not counted against its budget, but the island's, so it is where Recharts may be. Only the
    // chunks the island adds: the voyage's own chunks import every page and island lazily.
    const later = new Set<string>();
    const visitLater = (key: string) => {
      const item = manifest[key];
      if (!item || closure.has(item.file) || voyage.has(item.file) || later.has(item.file)) return;
      later.add(item.file);
      for (const dependency of item.imports ?? []) visitLater(dependency);
    };
    for (const key of keys) if (!voyage.has(manifest[key]!.file)) for (const dependency of manifest[key]!.dynamicImports ?? []) visitLater(dependency);
    const withRecharts = [...added, ...later].filter((file) => rechartsIn(moduleMap[file] ?? []));
    expect(withRecharts.length > 0, `${island.chapter} ${island.recharts ? "loads" : "never loads"} Recharts`).toBe(island.recharts);
    const sharedHx = added.filter((file) => !withRecharts.includes(file) && hxOnly(file) && importedFromOutside(file));
    const counted = added.filter((file) => !withRecharts.includes(file) && !sharedHx.includes(file));
    const hashes = distHashes();
    const size = (file: string) => distGzip(file, hashes);
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
  await page.getByRole("searchbox", { name: "Find a page or component" }).fill("button");
  await expect(page.getByRole("search").getByRole("link", { name: "Button", exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(await auditPage(page, browserName)).toBe("");
  expect(errors).toEqual([]);
});
