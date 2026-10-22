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
const voyage = [...files].find((f) => /^assets\/voyage-[\w-]{8}\.js$/.test(f));
if (voyage) {
  const src = readFileSync(`site/dist/${voyage}`, "utf8");
  const deps = /__vite__mapDeps=\(i,m=__vite__mapDeps,d=\(m\.f\|\|\(m\.f=(\[[^\]]*\])/.exec(src);
  const list = deps ? JSON.parse(deps[1]) : [];
  console.log(`${label} mapDeps ${list.length} names, ${deps ? deps[1].length : 0} chars, gzip of the array alone ${deps ? gzipSync(deps[1]).byteLength : 0}; head: ${src.slice(0, 300).replace(/\n/g, " ")}`);
  for (const m of src.matchAll(/__vite__mapDeps\((\[[\d,]+\])\)/g)) console.log(`${label}   import deps ${JSON.parse(m[1]).length}: ${src.slice(Math.max(0, m.index - 60), m.index).replace(/\n/g, " ")}`);
}
