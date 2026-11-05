import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
const manifest = JSON.parse(readFileSync("site/dist/.vite/manifest.json", "utf8"));
const entry = Object.entries(manifest).find(([key, value]) => key === "index.html" && value.isEntry);
const out = {};
for (const kind of ["voyage", "docs"]) {
  const files = new Set();
  const visit = (key) => { const item = manifest[key]; if (files.has(item.file)) return; files.add(item.file); for (const d of item.imports ?? []) visit(d); };
  visit(entry[0]);
  visit(`src/pages/${kind}.tsx`);
  out[kind] = [...files].filter((f) => f.endsWith(".js")).reduce((sum, f) => sum + gzipSync(readFileSync(`site/dist/${f}`)).length, 0);
}
console.log(JSON.stringify(out));
const css = {};
for (const kind of ["voyage", "docs"]) {
  const files = new Set();
  const visit = (key) => { const item = manifest[key]; for (const c of item.css ?? []) files.add(c); if (item.__v) return; item.__v = 1; for (const d of item.imports ?? []) visit(d); };
  visit(entry[0]);
  visit(`src/pages/${kind}.tsx`);
  css[kind] = [...files].reduce((sum, f) => sum + gzipSync(readFileSync(`site/dist/${f}`)).length, 0) + " in " + [...files].join(",");
}
console.log(JSON.stringify(css));
