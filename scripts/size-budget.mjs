// The gzip size of the stylesheets each built page links, and the <style> it inlines in its head, against the
// ceilings site/e2e/catalog.spec.ts holds the loaded pages to (CSS_CEILINGS), read from a build with no
// browser, so fresh-main.mjs can check them on a merge of two pull requests in seconds.
//
//   node scripts/size-budget.mjs [site/dist]
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

/** Each page measured: its built HTML, its ceiling kind, and, for the shell alone, the one sheet it links. */
export const pages = [
  { name: "home", kind: "voyage", file: "index.html" },
  { name: "nautilus", kind: "voyage", file: "nautilus/index.html" },
  { name: "docs", kind: "docs", file: "docs/index.html" },
  { name: "docs-page", kind: "docsPage", file: "docs/badge/index.html" },
  { name: "docs-shell", kind: "docsShell", file: "docs/badge/index.html", sheet: /(^|\/)docs-shell-/ },
];

/** The ceilings in catalog.spec.ts's CSS_CEILINGS, in bytes. */
export function readCeilings(spec) {
  const line = spec.match(/const CSS_CEILINGS = \{([^}]*)\}/)?.[1];
  if (!line) throw new Error("catalog.spec.ts has no CSS_CEILINGS.");
  return Object.fromEntries([...line.matchAll(/(\w+):\s*(\d+)\s*\*\s*1024/g)].map(([, kind, kib]) => [kind, Number(kib) * 1024]));
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
  const ceilings = readCeilings(readFileSync("site/e2e/catalog.spec.ts", "utf8"));
  const results = measure(process.argv[2] ?? "site/dist", ceilings);
  for (const { name, bytes, ceiling, ok } of results) console.log(`${ok ? "ok  " : "FAIL"} ${name} CSS ${bytes} of ${ceiling} gzip bytes`);
  if (results.some((result) => !result.ok)) process.exit(1);
}
