// Diagnostic only: the gzip bytes of the voyage's first-load JavaScript, file by file.
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
const html = readFileSync("site/dist/voyage/index.html", "utf8");
const files = [...new Set([...html.matchAll(/<(?:script[^>]*type="module"[^>]*src|link[^>]*rel="modulepreload"[^>]*href)="\/ouro-ui\/([^"]+\.js)"/g)].map((m) => m[1]))];
const rows = files.map((f) => [f, gzipSync(readFileSync(`site/dist/${f}`)).byteLength]).sort((a, b) => b[1] - a[1]);
console.log(`${process.argv[2]} total ${rows.reduce((s, r) => s + r[1], 0)} in ${rows.length} files; html ${gzipSync(html).byteLength}`);
for (const [f, n] of rows.slice(0, 25)) console.log(`${process.argv[2]}   ${n} ${f.replace(/-[\w-]{8}\.js$/, "")}`);
