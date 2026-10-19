// Prerenders every site route to static HTML after `vite build`, so each page (and each
// docs URL a registry item points to) is complete without JavaScript, then hydrates.
//
// Reads the client build in site/dist and the server bundle in .tmp/site-ssr; writes
// site/dist/<route>/index.html, site/dist/404.html and site/dist/docs/<name>.md and
// docs/parts.md (the generated Markdown with installed paths, for agents that prefer it).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "../..");
const dist = join(repo, "site/dist");
const server = join(repo, ".tmp/site-ssr/entry-server.js");

interface Route {
  path: string;
  title: string;
  description: string;
}
const { render, routes, docsItems, docsPages, publishedMarkdown, headTags, pageKind } = (await import(pathToFileURL(server).href)) as {
  render: (path: string) => Promise<string>;
  pageKind: (path: string) => string;
  headTags: (route: Route, canonical: boolean) => string[];
  routes: Route[];
  docsItems: Array<{ name: string; title: string }>;
  docsPages: Array<{ name: string; title: string; file: string; markdown: string }>;
  publishedMarkdown: (markdown: string, from: string) => string;
};

const template = readFileSync(join(dist, "index.html"), "utf8");
if (!template.includes("<!--app-->") || !template.includes("<!--head-->")) throw new Error("site/dist/index.html has no <!--app--> or <!--head--> marker");

interface ManifestEntry {
  file: string;
  css?: string[];
  imports?: string[];
}
const manifest = JSON.parse(readFileSync(join(dist, ".vite/manifest.json"), "utf8")) as Record<string, ManifestEntry>;

/**
 * Each page kind's own chunk (site/src/app.tsx loads it before hydrating): its JavaScript closure
 * as modulepreload links, so it downloads beside the entry instead of after it, and its
 * stylesheets, so the page is styled before the chunk runs.
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
  return [
    ...[...css].filter((file) => !loaded.has(file)).map((file) => `<link rel="stylesheet" crossorigin href="/ouro-ui/${file}" />`),
    ...[...files].filter((file) => !loaded.has(file)).map((file) => `<link rel="modulepreload" crossorigin href="/ouro-ui/${file}" />`),
  ];
}

async function page(route: Route, path: string, canonical: boolean): Promise<string> {
  const head = headTags(route, canonical).join("\n    ");
  // After the entry's own stylesheet, which Vite puts in <head>: a page's theme rules must come later to win.
  const assets = pageAssets(pageKind(path)).join("\n    ");
  const html = await render(path);
  return template
    .replace("<!--head-->", () => head)
    .replace("</head>", () => `  ${assets}\n  </head>`)
    .replace("<!--app-->", () => html);
}

for (const route of routes) {
  const file = join(dist, route.path, "index.html");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, await page(route, route.path, true));
}
writeFileSync(
  join(dist, "404.html"),
  await page({ path: "/404/", title: "Page not found · Ouro UI", description: "That page isn't here." }, "/404/", false),
);
// The published Markdown shows installed paths (`@/components/ouro/...`), as the HTML pages
// do, and parts.md is published beside it so each page's link to it resolves.
// A link to another docs file names that file's published page (`Form.md` is `form.md`).
for (const item of docsItems) {
  const from = `docs/${item.title}.md`;
  writeFileSync(join(dist, "docs", `${item.name}.md`), publishedMarkdown(readFileSync(join(repo, from), "utf8"), from));
}
// The guides (docs/guides) and the exports with no item of their own (Radio, OuroProvider).
for (const page of docsPages) writeFileSync(join(dist, "docs", `${page.name}.md`), publishedMarkdown(page.markdown, page.file));
writeFileSync(join(dist, "docs", "parts.md"), publishedMarkdown(readFileSync(join(repo, "docs", "parts.md"), "utf8"), "docs/parts.md"));

// The built site must have a page at every docs URL the registry advertises.
for (const item of docsItems) {
  const file = join(dist, "docs", item.name, "index.html");
  if (!existsSync(file) || !readFileSync(file, "utf8").includes(`>${item.title}</h1>`)) throw new Error(`no docs page for ${item.name}`);
}
for (const page of docsPages) {
  const file = join(dist, "docs", page.name, "index.html");
  if (!existsSync(file) || !readFileSync(file, "utf8").includes(`>${page.title}</h1>`)) throw new Error(`no docs page for ${page.file}`);
}
for (const file of [...docsItems.map((item) => `${item.name}.md`), ...docsPages.map((page) => `${page.name}.md`), "parts.md"]) {
  if (readFileSync(join(dist, "docs", file), "utf8").includes("@/registry/")) throw new Error(`docs/${file} still has registry paths`);
}
console.log(`prerendered ${routes.length} routes, 404.html and ${docsItems.length + docsPages.length + 1} Markdown docs into site/dist`);
