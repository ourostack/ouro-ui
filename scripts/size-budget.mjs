// The gzip size of the stylesheets each built page links, against the ceilings
// site/e2e/catalog.spec.ts holds the loaded pages to (CSS_CEILINGS), read from a build with no
// browser, so fresh-main.mjs can check them on a merge of two pull requests in seconds.
//
//   node scripts/size-budget.mjs [site/dist]
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

const pages = [["home", "voyage", "index.html"], ["nautilus", "voyage", "nautilus/index.html"], ["docs", "docs", "docs/index.html"]];

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

/** Each page's linked CSS in gzip bytes, with the ceiling it must stay within and whether it does. */
export function measure(dist, ceilings) {
  return pages.map(([name, kind, file]) => {
    const html = readFileSync(resolve(dist, file), "utf8");
    const bytes = [...new Set(linkedStyles(html))].reduce((sum, sheet) => sum + gzipSync(readFileSync(resolve(dist, sheet))).byteLength, 0);
    return { name, bytes, ceiling: ceilings[kind], ok: bytes <= ceilings[kind] };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ceilings = readCeilings(readFileSync("site/e2e/catalog.spec.ts", "utf8"));
  const results = measure(process.argv[2] ?? "site/dist", ceilings);
  for (const { name, bytes, ceiling, ok } of results) console.log(`${ok ? "ok  " : "FAIL"} ${name} CSS ${bytes} of ${ceiling} gzip bytes`);
  if (results.some((result) => !result.ok)) process.exit(1);
}
