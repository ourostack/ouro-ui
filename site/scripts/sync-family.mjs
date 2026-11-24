// Brings site/src/family.json up to ourostack/.github main's brand/family.json, byte for byte.
//
//   node site/scripts/sync-family.mjs [ref]      # default main; --out <file> writes there instead
//
// .github/workflows/sync-brand.yml runs it every 10 minutes, alongside sync-storybook.mjs. BRAND_RAW_BASE and
// BRAND_API_BASE replace the GitHub hosts (site/scripts/sync-family.test.mjs).
/* global fetch, Buffer, setTimeout */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const outIndex = argv.indexOf("--out");
const ref = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--out") ?? "main";
const out = outIndex >= 0 ? argv[outIndex + 1] : join(dirname(fileURLToPath(import.meta.url)), "..", "src", "family.json");
const rawBase = process.env.BRAND_RAW_BASE ?? "https://raw.githubusercontent.com/ourostack/.github";
const apiBase = process.env.BRAND_API_BASE ?? "https://api.github.com/repos/ourostack/.github";

const get = async (url, init) => {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, init);
      if (!res.ok) throw new Error(`${url} answered ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      if (attempt >= 3) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
};

const commit = /^[0-9a-f]{40}$/.test(ref)
  ? ref
  : (await get(`${apiBase}/commits/${ref}`, { headers: { accept: "application/vnd.github.sha", ...(process.env.GH_TOKEN ? { authorization: `Bearer ${process.env.GH_TOKEN}` } : {}) } })).toString().trim();
const canonical = await get(`${rawBase}/${commit}/brand/family.json`);
const before = readFileSync(out);
const changed = !before.equals(canonical);
if (changed) writeFileSync(out, canonical);
console.log(`family.json ${changed ? "synced" : "unchanged"} from ourostack/.github@${commit}`);
