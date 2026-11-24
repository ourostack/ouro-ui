// Prerenders every site route to static HTML after `vite build`, so each page (and each
// docs URL a registry item points to) is complete without JavaScript, then hydrates.
//
// Reads the client build in site/dist and the server bundle in .tmp/site-ssr; writes
// site/dist/<route>/index.html, site/dist/404.html and site/dist/docs/<name>.md and
// docs/parts.md (the generated Markdown with installed paths, for agents that prefer it).
// A docs page's head links the docs' shared Tailwind sheet and inlines its demo's classes (docs-css.mts).
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fragmentFocusScript } from "../../registry/ouro/lib/ouro/fragment-focus-script.ts";
import { docsDelta } from "./docs-css.mts";
import { pageHeadings } from "./headings.mts";

const repo = join(dirname(fileURLToPath(import.meta.url)), "../..");
const dist = join(repo, "site/dist");
const server = join(repo, ".tmp/site-ssr/entry-server.js");

interface Route {
  path: string;
  title: string;
  description: string;
}
const { render, routes, redirects, redirectPage, docsItems, docsPages, publishedMarkdown, withInstall, latestRelease, headTags, showsMono, pageKind, sitemap, SITE } = (await import(pathToFileURL(server).href)) as {
  sitemap: (routes: Route[]) => string;
  SITE: string;
  render: (path: string) => Promise<string>;
  pageKind: (path: string) => string;
  headTags: (route: Route, canonical: boolean, mono?: boolean) => string[];
  showsMono: (html: string) => boolean;
  routes: Route[];
  redirects: Array<{ from: string; to: string; note?: string }>;
  redirectPage: (to: string, note?: string) => string;
  docsItems: Array<{ name: string; title: string }>;
  docsPages: Array<{ name: string; title: string; file: string }>;
  publishedMarkdown: (markdown: string, from: string) => string;
  withInstall: (markdown: string, name: string, release: string) => string;
  latestRelease: string;
};

const template = readFileSync(join(dist, "index.html"), "utf8");
if (!template.includes("<!--app-->") || !template.includes("<!--head-->") || !template.includes("<!--fragment-focus-->")) throw new Error("site/dist/index.html has no <!--app-->, <!--head--> or <!--fragment-focus--> marker");

interface ManifestEntry {
  file: string;
  css?: string[];
  imports?: string[];
}
const manifest = JSON.parse(readFileSync(join(dist, ".vite/manifest.json"), "utf8")) as Record<string, ManifestEntry>;

/**
 * Each page kind's own chunk (site/src/app.tsx loads it before hydrating): its stylesheets, so the
 * page is styled before the chunk runs. Its JavaScript is not preloaded: the entry asks for it
 * after the first paint (entry-client.tsx), so the paint gets the bandwidth.
 */
function closure(key: string): Set<string> {
  const files = new Set<string>();
  const visit = (name: string) => {
    const entry = manifest[name]!;
    if (files.has(entry.file)) return;
    files.add(entry.file);
    for (const sheet of entry.css ?? []) files.add(sheet);
    for (const dependency of entry.imports ?? []) visit(dependency);
  };
  visit(key);
  return files;
}

function pageAssets(kind: string): string[] {
  const key = `src/pages/${kind}.tsx`;
  if (!manifest[key]) throw new Error(`The client build has no chunk for ${key}`);
  const files = new Set<string>();
  const css = new Set<string>();
  const visit = (name: string) => {
    const entry = manifest[name]!;
    if (files.has(entry.file)) return;
    files.add(entry.file);
    for (const sheet of entry.css ?? []) css.add(sheet);
    for (const dependency of entry.imports ?? []) visit(dependency);
  };
  visit(key);
  const loaded = closure("index.html");
  return [...css].filter((file) => !loaded.has(file)).map((file) => `<link rel="stylesheet" crossorigin href="/${file}" />`);
}

/**
 * The islands whose stylesheets a page links in its HTML as well, so it paints styled before they load. The Ouro AX
 * page's body and exhibit carry ax/ax.css, which the home page loads only with its own island (ax/ax.css says why).
 */
const islandSheets: Record<string, string[]> = {
  "/ax/": ["src/ax/ax-page.tsx", "src/ax/exhibit.tsx"],
  "/apple/": ["src/apple/home.tsx"],
  "/apple/hx/": ["src/apple/hx.tsx"],
  "/apple/feel/": ["src/apple/feel.tsx"],
  "/apple/ax/": ["src/apple/ax.tsx"],
  "/apple/reins/": ["src/apple/reins.tsx"],
  "/apple/start/": ["src/apple/start.tsx"],
  "/hx/": ["src/hx/hx.tsx"],
  "/windows/": ["src/platforms/windows.tsx"],
  "/windows/start/": ["src/platforms/windows-start.tsx"],
  "/android/": ["src/platforms/android.tsx"],
  "/android/start/": ["src/platforms/android-start.tsx"],
  "/adoption/": ["src/adoption/adoption.tsx"],
  "/current/": ["src/current/current.tsx"],
  "/proof/": ["src/proof/proof.tsx"],
};

function islandAssets(path: string): string[] {
  const loaded = new Set([...closure("index.html"), ...closure(`src/pages/${pageKind(path)}.tsx`)]);
  const css = new Set<string>();
  for (const key of islandSheets[path] ?? []) {
    if (!manifest[key]) throw new Error(`The client build has no chunk for ${key}`);
    for (const file of closure(key)) if (file.endsWith(".css") && !loaded.has(file)) css.add(file);
  }
  return [...css].map((file) => `<link rel="stylesheet" crossorigin href="/${file}" />`);
}

/**
 * The docs pages that show any component, so link the whole Tailwind build: the components index (its previews draw as
 * they near the screen) the live demo page (its ?name= picks any demo) and the chat app page (it composes the chat components). Every other docs page links the shared shell.
 */
const WHOLE_BUILD = new Set(["/docs/", "/docs/demo/", "/docs/chat-demo/", "/docs/call-demo/"]);
const demoDir = join(repo, "site/src/docs/demos");
const demoNames = new Set(readdirSync(demoDir).flatMap((file) => (file.endsWith(".demo.tsx") ? [file.slice(0, -".demo.tsx".length)] : [])));

/** A component's page is `/docs/<name>/` with a demo of that name: its head inlines the classes that demo adds to the shell. */
function demoFile(path: string): string | undefined {
  const name = /^\/docs\/([^/]+)\/$/.exec(path)?.[1];
  return name && demoNames.has(name) ? join(demoDir, `${name}.demo.tsx`) : undefined;
}

/**
 * A docs page's stylesheets, in the order a page imports them: the Tailwind sheet first (the shared shell, or the whole build),
 * then the classes its own demo adds to the shell in a <style> (docs-css.mts), then its theme presets, so a page's theme rules come later and win.
 */
async function docsAssets(path: string): Promise<string[]> {
  const whole = WHOLE_BUILD.has(path);
  const sheet = manifest[whole ? "src/docs/full.css" : "src/docs/shell.css"];
  if (!sheet) throw new Error(`The client build has no stylesheet for ${whole ? "src/docs/full.css" : "src/docs/shell.css"}`);
  const inline = whole ? "" : await docsDelta(demoFile(path));
  return [`<link rel="stylesheet" crossorigin href="/${sheet.file}" />`, ...(inline ? [`<style>${inline}</style>`] : []), ...pageAssets("docs")];
}

async function page(route: Route, path: string, canonical: boolean): Promise<string> {
  const html = await render(path);
  const head = headTags(route, canonical, showsMono(html)).join("\n    ");
  const kind = pageKind(path);
  // Each page imports its own stylesheets (the entry has none), Tailwind's first, so a page's theme rules come later and win.
  const assets = (kind === "docs" ? await docsAssets(path) : [...pageAssets(kind), ...islandAssets(path)]).join("\n    ");
  return template
    .replace("<!--head-->", () => head)
    .replace("</head>", () => `  ${assets}\n  </head>`)
    .replace("<!--fragment-focus-->", () => `<script>${fragmentFocusScript()}</script>`)
    .replace("<!--app-->", () => html);
}

for (const route of routes) {
  const file = join(dist, route.path, "index.html");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, await page(route, route.path, true));
}
// Old addresses: GitHub Pages is static, so each is a page that refreshes to the new one.
for (const { from, to, note } of redirects) {
  if (routes.some((route) => route.path.toLowerCase() === from.toLowerCase())) throw new Error(`${from} is both a page and a redirect, or differs from a page only in letter case`);
  if (redirects.some((other) => other.from !== from && other.from.toLowerCase() === from.toLowerCase())) throw new Error(`${from} differs from another redirect only in letter case`);
  const file = join(dist, from, "index.html");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, redirectPage(to, note));
}
writeFileSync(
  join(dist, "404.html"),
  await page({ path: "/404/", title: "Lost at sea · Ouro UI", description: "This page has drifted off our charts. Head back to the surface, or search the docs." }, "/404/", false),
);
// Every page for crawlers, and robots.txt pointing to it (the routes, as built above).
writeFileSync(join(dist, "sitemap.xml"), sitemap(routes));
writeFileSync(join(dist, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
// The published Markdown shows installed paths (`@/components/ouro/...`), as the HTML pages
// do, and parts.md is published beside it so each page's link to it resolves.
// A link to another docs file names that file's published page (`Form.md` is `form.md`). A component's page also says how
// to install it, as its HTML page does, since the hand-off on that page tells an agent to follow it (docs/agent-prompt.ts).
for (const item of docsItems) {
  const from = `docs/${item.title}.md`;
  writeFileSync(join(dist, "docs", `${item.name}.md`), withInstall(publishedMarkdown(readFileSync(join(repo, from), "utf8"), from), item.name, latestRelease));
}
// The guides (docs/guides) and the exports with no item of their own (Radio, OuroProvider).
for (const page of docsPages) writeFileSync(join(dist, "docs", `${page.name}.md`), publishedMarkdown(readFileSync(join(repo, page.file), "utf8"), page.file));
writeFileSync(join(dist, "docs", "parts.md"), publishedMarkdown(readFileSync(join(repo, "docs", "parts.md"), "utf8"), "docs/parts.md"));

// The built site must have a page at every docs URL the registry advertises.
for (const item of docsItems) {
  const file = join(dist, "docs", item.name, "index.html");
  if (!existsSync(file) || !pageHeadings(readFileSync(file, "utf8")).includes(item.title)) throw new Error(`no docs page for ${item.name}`);
}
for (const page of docsPages) {
  const file = join(dist, "docs", page.name, "index.html");
  if (!existsSync(file) || !pageHeadings(readFileSync(file, "utf8")).includes(page.title)) throw new Error(`no docs page for ${page.file}`);
}
for (const file of [...docsItems.map((item) => `${item.name}.md`), ...docsPages.map((page) => `${page.name}.md`), "parts.md"]) {
  if (readFileSync(join(dist, "docs", file), "utf8").includes("@/registry/")) throw new Error(`docs/${file} still has registry paths`);
}
console.log(`prerendered ${routes.length} routes, ${redirects.length} redirects, 404.html and ${docsItems.length + docsPages.length + 1} Markdown docs into site/dist`);
