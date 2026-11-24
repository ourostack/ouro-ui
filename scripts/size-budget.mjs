// The gzip size of the stylesheets each built page links, and the <style> it inlines in its head, against the
// ceilings site/e2e/catalog.spec.ts holds the loaded pages to (CSS_CEILINGS), read from a build with no
// browser, so fresh-main.mjs can check them on a merge of two pull requests in seconds. Judged the same way as
// site/e2e/catalog.spec.ts's own CSS sizes (scripts/size-gate.mjs): this pull request's CSS fails only for its own
// growth past budget over its base (fresh-main.mjs merges the newest main in first, so that growth includes any
// commit that landed on main since this pull request's own e2e job measured its base); a ceiling main is already
// over, or tips over only because another pull request raced this one to main, is neither's pull request to fail (it
// is size-ceilings.yml's, with an issue, after CI on main). With no base report to compare with (no CI run has fetched
// one, or this ran by hand), the ceiling alone decides, as size-gate.mjs's judgeSizes does everywhere else.
//
//   node scripts/size-budget.mjs [site/dist]
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { gateMode, judgeSizes, readBase } from "./size-gate.mjs";

/** Each page measured: its built HTML, its ceiling kind, the size-gate.mjs check it is judged with, and, for the
 * shell alone, the one sheet it links. */
export const pages = [
  { name: "home", kind: "voyage", check: "page-css", file: "index.html" },
  { name: "nautilus", kind: "voyage", check: "page-css", file: "nautilus/index.html" },
  { name: "docs", kind: "docs", check: "page-css", file: "docs/index.html" },
  { name: "badge", kind: "docsPage", check: "shell-css", file: "docs/badge/index.html" },
  { name: "docs-shell", kind: "docsShell", check: "shell-css", file: "docs/badge/index.html", sheet: /(^|\/)docs-shell-/ },
];

/** The ceilings in catalog.spec.ts's CSS_CEILINGS, in bytes. */
export function readCeilings(spec) {
  const line = spec.match(/const CSS_CEILINGS = \{([^}]*)\}/)?.[1];
  if (!line) throw new Error("catalog.spec.ts has no CSS_CEILINGS.");
  return Object.fromEntries([...line.matchAll(/(\w+):\s*(\d+)\s*\*\s*1024/g)].map(([, kind, kib]) => [kind, Number(kib) * 1024]));
}

/** The pull request's CSS growth budget, catalog.spec.ts's CSS_MARGIN, in bytes. */
export function readMargin(spec) {
  const margin = spec.match(/const CSS_MARGIN = (\d+);/)?.[1];
  if (!margin) throw new Error("catalog.spec.ts has no CSS_MARGIN.");
  return Number(margin);
}

/** The stylesheet files a page's HTML links, as paths inside the build. */
export function linkedStyles(html) {
  return [...html.matchAll(/<link\b[^>]*>/g)]
    .map(([tag]) => tag)
    .filter((tag) => /rel="?stylesheet/.test(tag))
    .map((tag) => tag.match(/href="?([^"\s>]+)/)?.[1])
    .filter(Boolean)
    .map((href) => href.replace(/^\/(ouro-ui\/)?/, ""));
}

/** The CSS a page's head inlines in <style> elements. */
export function inlineStyles(html) {
  const head = html.slice(0, html.indexOf("</head>"));
  return [...head.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(([, css]) => css).join("");
}

/** Each page's CSS in gzip bytes, with the ceiling it must stay within and whether it does. */
export function measure(dist, ceilings) {
  return pages.map(({ name, kind, file, sheet }) => {
    const html = readFileSync(resolve(dist, file), "utf8");
    const sheets = [...new Set(linkedStyles(html))].filter((path) => !sheet || sheet.test(path));
    const sheetBytes = sheets.reduce((sum, path) => sum + gzipSync(readFileSync(resolve(dist, path))).byteLength, 0);
    const inline = sheet ? "" : inlineStyles(html);
    const bytes = sheetBytes + (inline ? gzipSync(inline).byteLength : 0);
    return { name, bytes, ceiling: ceilings[kind], ok: bytes <= ceilings[kind] };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const spec = readFileSync("site/e2e/catalog.spec.ts", "utf8");
  const ceilings = readCeilings(spec);
  const budget = readMargin(spec);
  const results = measure(process.argv[2] ?? "site/dist", ceilings);
  for (const { name, bytes, ceiling, ok } of results) console.log(`${ok ? "ok  " : "FAIL"} ${name} CSS ${bytes} of ${ceiling} gzip bytes`);
  const byCheck = new Map();
  for (const { name, check } of pages) byCheck.set(check, [...(byCheck.get(check) ?? []), name]);
  let failed = false;
  for (const [check, names] of byCheck) {
    const sizes = Object.fromEntries(names.map((name) => [`${name} CSS, gzip bytes`, { ...results.find((result) => result.name === name), budget }]));
    const verdict = judgeSizes(sizes, { mode: gateMode(), base: readBase(check) });
    for (const line of verdict.lines) console.log(`css-size-gate ${line}`);
    for (const tip of verdict.tips) console.log(`::warning title=Pull request tips a size ceiling::${tip}`);
    if (!verdict.ok) failed = true;
  }
  if (failed) process.exit(1);
}
