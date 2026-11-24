import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { scratchDir } from "../../scripts/scratch.mjs";
import { promisify } from "node:util";

// sync-family.mjs is what sync-brand.yml runs when ourostack/.github's brand/family.json changes. A local server
// stands in for raw.githubusercontent.com, serving the canonical bytes this test chooses.
const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const copy = join(here, "..", "src", "family.json");
const COMMIT = "c".repeat(40);

async function sync(canonical) {
  const server = http.createServer((req, res) => {
    res.writeHead(200).end(req.url === `/${COMMIT}/brand/family.json` ? canonical : "not found");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const out = join(scratchDir("sync-family-"), "family.json");
  writeFileSync(out, readFileSync(copy));
  try {
    const { stdout } = await run("node", [join(here, "sync-family.mjs"), COMMIT, "--out", out], {
      env: { ...process.env, BRAND_RAW_BASE: `http://127.0.0.1:${server.address().port}` },
    });
    return { out, stdout };
  } finally {
    server.close();
  }
}

test("a canonical family.json identical to this site's copy is left untouched, and says so", async () => {
  const { out, stdout } = await sync(readFileSync(copy));
  assert.equal(readFileSync(out, "utf8"), readFileSync(copy, "utf8"));
  assert.match(stdout, /unchanged/);
});

test("a canonical family.json that differs is copied over byte for byte, and says so", async () => {
  const redrawn = Buffer.concat([readFileSync(copy), Buffer.from(" ")]);
  const { out, stdout } = await sync(redrawn);
  assert.equal(readFileSync(out).toString(), redrawn.toString());
  assert.match(stdout, /synced/);
});
