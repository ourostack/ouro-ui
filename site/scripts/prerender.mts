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
const SITE = "https://ourostack.github.io/ouro-ui";

interface Route {
  path: string;
  title: string;
  description: string;
}
const { render, routes, docsItems, installedPaths } = (await import(pathToFileURL(server).href)) as {
  render: (path: string) => string;
  installedPaths: (markdown: string) => string;
  routes: Route[];
  docsItems: Array<{ name: string; title: string }>;
};

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const template = readFileSync(join(dist, "index.html"), "utf8");
if (!template.includes("<!--app-->") || !template.includes("<!--head-->")) throw new Error("site/dist/index.html has no <!--app--> or <!--head--> marker");

function page(route: Route, path: string, canonical: boolean): string {
  const head = [
    `<title>${escape(route.title)}</title>`,
    `<meta name="description" content="${escape(route.description)}" />`,
    canonical ? `<link rel="canonical" href="${SITE}${route.path}" />` : "",
    `<link rel="icon" href="/ouro-ui/favicon.svg" type="image/svg+xml" />`,
  ]
    .filter(Boolean)
    .join("\n    ");
  return template.replace("<!--head-->", head).replace("<!--app-->", render(path));
}

for (const route of routes) {
  const file = join(dist, route.path, "index.html");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, page(route, route.path, true));
}
writeFileSync(
  join(dist, "404.html"),
  page({ path: "/404/", title: "Page not found · Ouro UI", description: "That page isn't here." }, "/404/", false),
);
// The published Markdown shows installed paths (`@/components/ouro/...`), as the HTML pages
// do, and parts.md is published beside it so each page's link to it resolves.
for (const item of docsItems) {
  writeFileSync(join(dist, "docs", `${item.name}.md`), installedPaths(readFileSync(join(repo, "docs", `${item.title}.md`), "utf8")));
}
writeFileSync(join(dist, "docs", "parts.md"), installedPaths(readFileSync(join(repo, "docs", "parts.md"), "utf8")));

// The built site must have a page at every docs URL the registry advertises.
for (const item of docsItems) {
  const file = join(dist, "docs", item.name, "index.html");
  if (!existsSync(file) || !readFileSync(file, "utf8").includes(`>${item.title}</h1>`)) throw new Error(`no docs page for ${item.name}`);
}
for (const file of [...docsItems.map((item) => `${item.name}.md`), "parts.md"]) {
  if (readFileSync(join(dist, "docs", file), "utf8").includes("@/registry/")) throw new Error(`docs/${file} still has registry paths`);
}
console.log(`prerendered ${routes.length} routes, 404.html and ${docsItems.length + 1} Markdown docs into site/dist`);
