// Diagnostic only (branch diag/webkit-frames): where the voyage's server HTML weighs, gzip.
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
const label = process.argv[2];
const html = readFileSync("site/dist/voyage/index.html", "utf8");
const gz = (text) => gzipSync(text, { level: 9 }).length;
const parts = html.split(/(?=<section\b)/);
const sizes = parts.map((part) => `${(/<section[^>]*\bid="([^"]+)"/.exec(part)?.[1] ?? /<section[^>]*class="([^"]+)"/.exec(part)?.[1]?.slice(0, 20) ?? "head")}:${part.length}/${gz(part)}`);
const count = (pattern) => (html.match(pattern) ?? []).length;
console.log(`${label} html ${html.length}/${gz(html)} · ${sizes.join(" · ")} · foreignObject ${count(/<foreignObject/g)} text ${count(/<text\b/g)} style= ${count(/ style="/g)} svg ${count(/<svg\b/g)}`);
