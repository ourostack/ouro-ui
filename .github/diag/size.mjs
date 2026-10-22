// Diagnostic only: the gzip bytes of the voyage's first-load JavaScript (catalog.spec.ts's closure), file by file.
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
const manifest = JSON.parse(readFileSync("site/dist/.vite/manifest.json", "utf8"));
const modules = JSON.parse(readFileSync("site/dist/.vite/chunk-modules.json", "utf8"));
const files = new Set();
const visit = (key) => { const item = manifest[key]; if (!item || files.has(item.file)) return; files.add(item.file); for (const d of item.imports ?? []) visit(d); };
visit("index.html");
visit("src/pages/voyage.tsx");
const rows = [...files].map((f) => [f, gzipSync(readFileSync(`site/dist/${f}`)).byteLength]).sort((a, b) => b[1] - a[1]);
const label = process.argv[2];
console.log(`${label} total ${rows.reduce((s, r) => s + r[1], 0)} in ${rows.length} files`);
for (const [f, n] of rows) console.log(`${label}   ${n} ${f.replace(/-[\w-]{8}\.js$/, "")} :: ${(modules[f] ?? []).filter((m) => m.startsWith("site/")).join(" ").slice(0, 160)}`);
