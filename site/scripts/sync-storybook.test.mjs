/* global Buffer */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, readFileSync } from "node:fs";
import http from "node:http";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { scratchDir } from "../../scripts/scratch.mjs";
import { promisify } from "node:util";

// sync-storybook.mjs is what sync-brand.yml runs when ourostack/.github's brand art changes. A local server stands in
// for raw.githubusercontent.com, serving this site's own copy as "brand/" with a canonical provenance.json built from it.
const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const copy = join(here, "..", "public", "brand", "storybook");
const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const COMMIT = "b".repeat(40);
const served = JSON.parse(readFileSync(join(copy, "provenance.json"), "utf8"));

async function sync(overrides = {}, canonicalFiles = served.files) {
  const files = { ...overrides, "provenance.json": Buffer.from(JSON.stringify(canonicalFiles)) };
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url).replace(`/${COMMIT}/brand/`, "");
    const body = files[rel] ?? (existsSync(join(copy, rel)) ? readFileSync(join(copy, rel)) : null);
    res.writeHead(body ? 200 : 404).end(body ?? "");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const out = scratchDir("sync-out-");
  cpSync(copy, out, { recursive: true });
  try {
    const { stdout } = await run("node", [join(here, "sync-storybook.mjs"), COMMIT, "--out", out], {
      env: { ...process.env, BRAND_RAW_BASE: `http://127.0.0.1:${server.address().port}` },
    });
    return { out, stdout };
  } finally {
    server.close();
  }
}

test("a canonical brand identical to this site's copy leaves its provenance.json untouched", async () => {
  const { out } = await sync();
  assert.equal(readFileSync(join(out, "provenance.json"), "utf8"), readFileSync(join(copy, "provenance.json"), "utf8"));
});

test("a redrawn file is copied over and the served provenance follows it, with the new origin commit", async () => {
  const target = served.files.find((e) => e.file.startsWith("headers/"));
  const redrawn = Buffer.concat([readFileSync(join(copy, target.file)), Buffer.from("x")]);
  const next = served.files.map((e) => (e === target ? { ...e, sha256: sha(redrawn) } : e));
  const { out } = await sync({ [target.file]: redrawn }, next);
  assert.equal(sha(readFileSync(join(out, target.file))), sha(redrawn));
  const after = JSON.parse(readFileSync(join(out, "provenance.json"), "utf8"));
  assert.equal(after.files.find((e) => e.file === target.file).sha256, sha(redrawn));
  assert.equal(after.origin, `ourostack/.github@${COMMIT}:brand/`);
});

test("a file whose bytes differ from the canonical provenance fails the sync instead of shipping", async () => {
  const target = served.files.find((e) => e.file.startsWith("headers/"));
  await assert.rejects(sync({ [target.file]: Buffer.from("not the art") }), /does not match provenance/);
});
