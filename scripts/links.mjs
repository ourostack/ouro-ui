// The link check. A dead link in the docs costs an agent a wrong guess, and file systems
// and web servers disagree about letter case (docs/OuroProvider.md opens on a Mac and is a
// 404 on Pages), so every check here compares names exactly.
//
//   node scripts/links.mjs            checks the sources
//   node scripts/links.mjs site/dist  checks the built site too (after pnpm site:build)
//
// The sources: README.md, UPGRADING.md, AGENTS.md, site/public/llms.txt, docs/**/*.md and
// every registry item's install message.
// - A relative link names a tracked file, in the same letter case, and its #fragment a
//   heading of that file.
// - A https://ourostack.github.io/ouro-ui/ URL names a page the site publishes: a registry
//   item's (site/src/docs/catalog.json), a guide's or another export's
//   (site/src/docs/pages.json), or one of the fixed pages below.
// - Every registry item with a docs page of its own has one, and every docs/*.md file is
//   published somewhere: no page exists that nothing can link to.
//
// The built site: every internal href in every .html and .md file under site/dist names a
// file there, in the same letter case.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");

export const SITE = "https://ourostack.github.io/ouro-ui/";

/** Site paths that are not a docs page: fixed pages, and what Pages adds beside the site (pages.yml). */
const fixedPages = ["", "docs", "docs/", "docs/parts.md", "docs/switching-from-shadcn/", "docs/updating/", "llms.txt", "og.png", "r/registry.json", "r/{name}.json"];
const builtElsewhere = /^(storybook\/|r\/[a-z0-9-]+\.json$)/;

/** Whether `path` (relative to `root`, with `/`) names a file or folder there in exactly that letter case. */
export function existsExactly(root, path) {
  let dir = root;
  for (const part of path.split("/").filter((piece) => piece !== "" && piece !== ".")) {
    if (!existsSync(dir) || !statSync(dir).isDirectory() || !readdirSync(dir).includes(part)) return false;
    dir = join(dir, part);
  }
  return true;
}

/** GitHub's anchor for a heading: `## What the tests need` is `what-the-tests-need`. */
export function anchor(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

/** The anchors of a Markdown file's headings, outside code blocks. */
export function anchors(markdown) {
  const out = new Set();
  let inCode = false;
  for (const line of markdown.split("\n")) {
    if (line.startsWith("```")) inCode = !inCode;
    const heading = inCode ? null : /^#{1,6} (.*)$/.exec(line);
    if (heading) out.add(anchor(heading[1]));
  }
  return out;
}

/** Every Markdown link target and bare site URL in `text`, outside code blocks, with its line. */
export function links(text) {
  const out = [];
  let inCode = false;
  text.split("\n").forEach((line, index) => {
    if (line.startsWith("```")) inCode = !inCode;
    if (inCode) return;
    const prose = line.replace(/`[^`]*`/g, (code) => (code.includes(SITE) ? code : ""));
    for (const match of prose.matchAll(/\]\(([^)\s]+)\)/g)) out.push({ target: match[1], line: index + 1 });
    for (const match of prose.matchAll(/https:\/\/ourostack\.github\.io\/ouro-ui\/[^\s)"'`<>,;]*/g)) {
      const target = match[0].replace(/[.:]+$/, "");
      if (!out.some((link) => link.line === index + 1 && link.target === target)) out.push({ target, line: index + 1 });
    }
  });
  return out;
}

/** The paths under the site's base that Pages serves, from the catalog and the pages list. */
export function publishedPaths(root = repo) {
  const catalog = JSON.parse(readFileSync(join(root, "site/src/docs/catalog.json"), "utf8"));
  const pages = existsSync(join(root, "site/src/docs/pages.json")) ? JSON.parse(readFileSync(join(root, "site/src/docs/pages.json"), "utf8")) : [];
  const out = new Set(fixedPages);
  for (const { name } of [...catalog, ...pages]) for (const path of [`docs/${name}/`, `docs/${name}`, `docs/${name}.md`]) out.add(path);
  return out;
}

/** Why a site URL is dead, or null. `<item>` and `{name}` templates in prose are not links. */
export function siteUrlProblem(url, published) {
  const path = url.slice(SITE.length).split("#")[0].split("?")[0];
  if (/[<{]/.test(path) && !published.has(path)) return null;
  if (published.has(path) || builtElsewhere.test(path)) return null;
  const near = [...published].find((known) => known.toLowerCase() === path.toLowerCase());
  return near === undefined ? `${url} is not a page the site publishes` : `${url} differs in letter case from the published ${SITE}${near}`;
}

function markdownFiles(root, dir) {
  const folder = join(root, dir);
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? markdownFiles(root, `${dir}/${entry.name}`) : entry.name.endsWith(".md") ? [`${dir}/${entry.name}`] : [],
  );
}

/** Dead links in the sources, as "file:line: problem". */
export function sourceProblems(root = repo) {
  const published = publishedPaths(root);
  const files = ["README.md", "UPGRADING.md", "AGENTS.md", "site/public/llms.txt", ...markdownFiles(root, "docs")].filter((file) => existsSync(join(root, file)));
  const problems = [];
  for (const file of files) {
    const text = readFileSync(join(root, file), "utf8");
    for (const { target, line } of links(text)) {
      const at = `${file}:${line}`;
      if (target.startsWith(SITE)) {
        const problem = siteUrlProblem(target, published);
        if (problem) problems.push(`${at}: ${problem}`);
      } else if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith("//")) {
        continue; // another site
      } else {
        const [path, fragment] = target.split("#");
        const to = path === "" ? file : normalize(join(dirname(file), path)).split(sep).join("/");
        if (to.startsWith("..")) problems.push(`${at}: ${target} leaves the repository`);
        else if (!existsExactly(root, to)) {
          problems.push(`${at}: ${target} names no file${existsSync(join(root, to)) ? " in that letter case" : ""} (${to})`);
        } else if (fragment && to.endsWith(".md") && !anchors(readFileSync(join(root, to), "utf8")).has(fragment)) {
          problems.push(`${at}: ${target} names no heading of ${to}`);
        }
      }
    }
  }
  const registry = JSON.parse(readFileSync(join(root, "registry.json"), "utf8"));
  for (const item of registry.items) {
    for (const { target } of links(item.docs ?? "")) {
      const problem = target.startsWith(SITE) ? siteUrlProblem(target, published) : null;
      if (problem) problems.push(`registry.json: ${item.name}'s install message: ${problem}`);
    }
  }
  return problems;
}

/** Docs pages nothing publishes, and registry items without the page their message would name. */
export function coverageProblems(root = repo) {
  const catalog = JSON.parse(readFileSync(join(root, "site/src/docs/catalog.json"), "utf8"));
  const pages = existsSync(join(root, "site/src/docs/pages.json")) ? JSON.parse(readFileSync(join(root, "site/src/docs/pages.json"), "utf8")) : [];
  const problems = [];
  const shown = new Set([
    ...catalog.flatMap((item) => [`docs/${item.title}.md`, ...(item.functions ?? []).map((name) => `docs/${name}.md`)]),
    ...pages.map((page) => page.markdown),
    "docs/parts.md",
  ]);
  for (const file of markdownFiles(root, "docs")) {
    if (!shown.has(file)) problems.push(`${file} has no page on the site: no registry item, guide or export page publishes it.`);
  }
  const registry = JSON.parse(readFileSync(join(root, "registry.json"), "utf8"));
  const published = publishedPaths(root);
  for (const item of registry.items) {
    if (item.type !== "registry:ui") continue;
    if (!published.has(`docs/${item.name}.md`)) problems.push(`The ${item.name} item has no docs page (docs/${item.name}/).`);
  }
  return problems;
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]));
}

/** Dead internal links in the built site (`dist`), served under `base`. */
export function builtProblems(dist, base = "/ouro-ui/") {
  const problems = [];
  const check = (file, target) => {
    if (/^[a-z][a-z\d+.-]*:/i.test(target) && !target.startsWith(SITE)) return;
    if (target.startsWith("//") || target.startsWith("#") || target === "") return;
    let path;
    if (target.startsWith(SITE)) path = target.slice(SITE.length);
    else if (target.startsWith(base)) path = target.slice(base.length);
    else if (target.startsWith("/")) return void problems.push(`${relative(dist, file)}: ${target} is outside ${base}`);
    else path = normalize(join(dirname(relative(dist, file)), target)).split(sep).join("/");
    path = path.split("#")[0].split("?")[0];
    if (builtElsewhere.test(path) || path === "r/registry.json" || /[<{]/.test(path)) return;
    const resolved = path === "" || path.endsWith("/") ? `${path}index.html` : path;
    if (existsExactly(dist, resolved) && statSync(join(dist, resolved)).isFile()) return;
    // Pages redirects docs/button to docs/button/.
    if (existsExactly(dist, `${path}/index.html`)) return;
    problems.push(`${relative(dist, file)}: ${target} names no file in the built site${existsSync(join(dist, resolved)) ? " in that letter case" : ""}`);
  };
  for (const file of walk(dist)) {
    if (file.endsWith(".html")) {
      const html = readFileSync(file, "utf8").replace(/<pre[\s\S]*?<\/pre>/g, "").replace(/<code[\s\S]*?<\/code>/g, "");
      for (const match of html.matchAll(/\s(?:href|src)="([^"]*)"/g)) check(file, match[1].replace(/&amp;/g, "&"));
    } else if (file.endsWith(".md") || file.endsWith("llms.txt")) {
      for (const { target } of links(readFileSync(file, "utf8"))) check(file, target);
    }
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = process.argv[2];
  const problems = [...sourceProblems(), ...coverageProblems(), ...(dist ? builtProblems(join(process.cwd(), dist)) : [])];
  for (const problem of problems) console.log(`::error::${problem}`);
  if (problems.length > 0) process.exit(1);
  console.log(`Every link in the docs${dist ? " and the built site" : ""} names a page that exists.`);
}
