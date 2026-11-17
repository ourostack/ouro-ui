// Brings the storybook art this site serves (site/public/brand/storybook/) up to ourostack/.github main, byte for
// byte. The files to copy are the ones its provenance.json lists now; the sha256 of each comes from the canonical
// brand/provenance.json at one commit, and a download whose bytes differ is an error, never written.
//
//   node site/scripts/sync-storybook.mjs [ref]      # default main; --out <dir> writes there instead
//
// .github/workflows/sync-brand.yml runs it every 10 minutes. BRAND_RAW_BASE and BRAND_API_BASE replace the GitHub
// hosts (site/scripts/sync-storybook.test.mjs).
/* global fetch, Buffer, setTimeout */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const outIndex = argv.indexOf("--out");
const ref = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--out") ?? "main";
const out = outIndex >= 0 ? argv[outIndex + 1] : join(dirname(fileURLToPath(import.meta.url)), "..", "public", "brand", "storybook");
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
const canonical = JSON.parse((await get(`${rawBase}/${commit}/brand/provenance.json`)).toString());
const shaOf = new Map(canonical.map((entry) => [entry.file, entry.sha256]));
const served = JSON.parse(readFileSync(join(out, "provenance.json"), "utf8"));

const shipped = [];
const queue = served.files.map((entry) => entry.file);
await Promise.all(
  Array.from({ length: 8 }, async () => {
    for (let file; (file = queue.shift()); ) {
      const expected = shaOf.get(file);
      if (!expected) throw new Error(`${file} is no longer in the canonical provenance.json`);
      const bytes = await get(`${rawBase}/${commit}/brand/${file}`);
      const actual = createHash("sha256").update(bytes).digest("hex");
      if (actual !== expected) throw new Error(`${file}: sha256 ${actual} does not match provenance ${expected}`);
      mkdirSync(dirname(join(out, file)), { recursive: true });
      writeFileSync(join(out, file), bytes);
      shipped.push({ file, sha256: expected });
    }
  }),
);
const order = new Map(served.files.map((entry, i) => [entry.file, i]));
shipped.sort((a, b) => order.get(a.file) - order.get(b.file));
// The origin commit moves only with the art, so a brand merge that changes none of these files opens no pull request.
const changed = shipped.some((entry, i) => entry.sha256 !== served.files[i].sha256);
if (changed) writeFileSync(join(out, "provenance.json"), `${JSON.stringify({ ...served, origin: `ourostack/.github@${commit}:brand/`, files: shipped }, null, 2)}\n`);
console.log(`synced ${shipped.length} files into ${out} from ourostack/.github@${commit}`);
