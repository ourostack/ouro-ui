import { test } from "node:test";
import { deepEqual, equal, ok } from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CHECKER_FILES, checkerHash } from "./census.mts";
import { censusManifest, runManifest, VENDORED_FILES } from "./manifest.mts";

const here = dirname(fileURLToPath(import.meta.url));
const sha256 = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");

test("the committed manifest pins every vendored file by hash and names the checker's hash", async () => {
  const committed = JSON.parse(readFileSync(join(here, "dist-manifest.json"), "utf8"));
  deepEqual(committed, await censusManifest(here), "run node scripts/ouro-census/manifest.mts --write and commit dist-manifest.json");
  equal(committed.checker, await checkerHash(here));
  for (const file of VENDORED_FILES) equal(committed.files[file], sha256(join(here, file)), file);
  for (const file of CHECKER_FILES) ok(VENDORED_FILES.includes(file), `${file} is part of the checker, so it is vendored`);
});

test("every built-in walker's file is part of the checker, so its hash vouches for each one", () => {
  const walkers = readdirSync(join(here, "walkers")).filter((f) => f.endsWith(".mts") && !f.endsWith(".node-test.mts")).map((f) => `walkers/${f}`);
  for (const file of walkers) ok(CHECKER_FILES.includes(file), `${file} is a built-in walker's code, so it is in CHECKER_FILES`);
});

test("--check fails when a vendored file changed, and --write brings the manifest back", async () => {
  // The real path: macOS keeps tmpdir behind a symlink.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "ouro-census-manifest-")));
  try {
    cpSync(here, dir, { recursive: true, filter: (src) => !src.includes("fixtures") });
    equal((await runManifest("--check", dir)).code, 0);
    writeFileSync(join(dir, "report.mts"), `${readFileSync(join(dir, "report.mts"), "utf8")}\n// edited\n`);
    deepEqual(await runManifest("--check", dir), { code: 1, message: "ouro-census: dist-manifest.json is out of date. Fix: node scripts/ouro-census/manifest.mts --write" });
    deepEqual(await runManifest("--write", dir), { code: 0 });
    deepEqual(await runManifest("--check", dir), { code: 0 });
    rmSync(join(dir, "dist-manifest.json"));
    equal((await runManifest("--check", dir)).code, 1);
    deepEqual(await runManifest("--nope", dir), { code: 2, message: "usage: node scripts/ouro-census/manifest.mts --check | --write" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("run from the command line, --check passes on the committed manifest and a missing flag is a usage error", () => {
  // NODE_TEST_CONTEXT would make the child report to this runner instead of exiting with its own code.
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== "NODE_TEST_CONTEXT"));
  const result = spawnSync(process.execPath, [join(here, "manifest.mts"), "--check"], { encoding: "utf8", env });
  equal(result.status, 0, result.stderr);
  const usage = spawnSync(process.execPath, [join(here, "manifest.mts")], { encoding: "utf8", env });
  equal(usage.status, 2);
  ok(usage.stderr.includes("usage: node scripts/ouro-census/manifest.mts --check | --write"), usage.stderr);
}
);
