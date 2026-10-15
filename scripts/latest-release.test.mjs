import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { unpinnedAddresses } from "./addresses.mjs";
import { fillPlaceholder, latestRelease, PLACEHOLDER, releaseMismatches, withRelease } from "./latest-release.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tracked = (...globs) =>
  execFileSync("git", ["ls-files", "--", ...globs], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);

test("latestRelease reads ouro.latestRelease from package.json and refuses anything but a tag", () => {
  assert.match(latestRelease(), /^v\d+\.\d+\.\d+$/);
  const dir = mkdtempSync(join(tmpdir(), "ouro-latest-release-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ ouro: { latestRelease: "0.3.0" } }));
  assert.throws(() => latestRelease(dir), /must be a tag such as v0\.3\.0 \(got 0\.3\.0\)/);
  writeFileSync(join(dir, "package.json"), JSON.stringify({ ouro: { latestRelease: "v1.2.3" } }));
  assert.equal(latestRelease(dir), "v1.2.3");
});

test("withRelease rewrites #vX.Y.Z and @vX.Y.Z literals and nothing else", () => {
  assert.equal(
    withRelease("add ourostack/ouro-ui/dialog#v0.2.0; `@v0.2.0` fails; from v0.1.0; #upgrading-from-v010", "v0.3.0"),
    "add ourostack/ouro-ui/dialog#v0.3.0; `@v0.3.0` fails; from v0.1.0; #upgrading-from-v010",
  );
});

test("fillPlaceholder fills every placeholder", () => {
  assert.equal(fillPlaceholder(`a#${PLACEHOLDER} b#${PLACEHOLDER}`, "v1.0.0"), "a#v1.0.0 b#v1.0.0");
});

test("releaseMismatches lists each literal that names another tag, by line", () => {
  assert.deepEqual(releaseMismatches("x#v0.3.0\ny#v0.2.0 z@v0.1.0\n", "v0.3.0"), ["2: #v0.2.0", "2: @v0.1.0"]);
  assert.deepEqual(releaseMismatches("from v0.1.0\n", "v0.3.0"), []);
});

test("every #vX.Y.Z or @vX.Y.Z literal in the docs names package.json's ouro.latestRelease", () => {
  const tag = latestRelease();
  // The public docs. AGENTS.md is for contributors and names old tags on purpose (the upgrade test).
  const files = [
    ...tracked("README.md", "changes/*.md", "package.json", "docs/*.md", "site/public/*", "site/src/*.ts", "site/src/*.tsx", "site/index.html"),
  ];
  assert.ok(files.length > 20);
  const problems = files.flatMap((path) => releaseMismatches(readFileSync(join(root, path), "utf8"), tag).map((problem) => `${path}:${problem}`));
  assert.deepEqual(problems, [], `Name ${tag} (package.json ouro.latestRelease), or run pnpm run docs.`);
});

test("UPGRADING.md names no tag, only the placeholder, so each place that shows it fills in the newest", () => {
  const note = readFileSync(join(root, "UPGRADING.md"), "utf8");
  assert.deepEqual(releaseMismatches(note, "none"), []);
  assert.ok(note.includes(`#${PLACEHOLDER}`));
});

test("unpinnedAddresses finds an item address with no ref or a ref other than a release tag, outside sentences for contributors", () => {
  assert.deepEqual(unpinnedAddresses("add ourostack/ouro-ui/dialog#main and ourostack/ouro-ui/sheet#4f2c1a9."), ["ourostack/ouro-ui/dialog#main", "ourostack/ouro-ui/sheet#4f2c1a9"]);
  assert.deepEqual(unpinnedAddresses("add ourostack/ouro-ui/dialog#v0.3 ourostack/ouro-ui/sheet#"), ["ourostack/ouro-ui/dialog#v0.3", "ourostack/ouro-ui/sheet#"]);
  assert.deepEqual(unpinnedAddresses("add ourostack/ouro-ui/${item.name}#${latestRelease} and ourostack/ouro-ui/dialog#{{latestRelease}}; end with ourostack/ouro-ui/sheet#v1.2.3."), []);
  assert.deepEqual(unpinnedAddresses("To try unreleased code, which is for contributors, add ourostack/ouro-ui/dialog#main."), []);
  assert.deepEqual(unpinnedAddresses("npx shadcn@latest add ourostack/ouro-ui/dialog ourostack/ouro-ui/dialog-tests#v1.0.0"), ["ourostack/ouro-ui/dialog"]);
  assert.deepEqual(unpinnedAddresses("Update with `add ourostack/ouro-ui/<item> --dry-run`."), ["ourostack/ouro-ui/<item>"]);
  assert.deepEqual(unpinnedAddresses("add ourostack/ouro-ui/${item.name}"), ["ourostack/ouro-ui/${item.name}"]);
  assert.deepEqual(unpinnedAddresses("Pinned: ourostack/ouro-ui/dialog#v0.3.0, ourostack/ouro-ui#v0.3.0, @ouro/dialog."), []);
  assert.deepEqual(unpinnedAddresses("See https://github.com/ourostack/ouro-ui/releases and ourostack.github.io/ouro-ui/docs/."), []);
  assert.deepEqual(unpinnedAddresses("Install a release. Without a ref, ourostack/ouro-ui/dialog installs main, which is for contributors. Next."), []);
});

test("public docs give no unpinned install address", () => {
  // The rendered docs pages are checked too, in site/src/site.test.tsx.
  const files = tracked("README.md", "docs/*.md", "site/public/*", "site/src/*.ts", "site/src/*.tsx", "package.json").filter((path) => !/\.test\.tsx?$/.test(path));
  const problems = files.flatMap((path) => unpinnedAddresses(readFileSync(join(root, path), "utf8")).map((address) => `${path}: ${address}`));
  assert.deepEqual(problems, [], "Pin the address to the newest release (#v<x.y.z>, or ${latestRelease} in the site) or use @ouro/<item>.");
});

test("the release commit names only its own tag: release.yml's release-branch commands, run on a copy", () => {
  const release = readFileSync(join(root, ".github/workflows/release.yml"), "utf8");
  const step = release.slice(release.indexOf("name: Push the release branch"));
  const body = step.slice(step.indexOf('git switch -c "$BRANCH"\n') + 'git switch -c "$BRANCH"\n'.length, step.indexOf('git commit -am "Release $TAG"'));
  assert.match(body, /node scripts\/latest-release\.mjs set "\$TAG"\n\s*pnpm run docs\n\s*node scripts\/registry\.mts --release "\$VERSION"/);
  const copy = mkdtempSync(join(tmpdir(), "ouro-release-"));
  for (const path of tracked("*")) {
    mkdirSync(dirname(join(copy, path)), { recursive: true });
    copyFileSync(join(root, path), join(copy, path));
  }
  symlinkSync(join(root, "node_modules"), join(copy, "node_modules"));
  // main holds no fragments right after a release's "Prepare main" PR deletes them, so the
  // copy gets its own: this test checks the release step, not what is waiting to ship.
  mkdirSync(join(copy, "changes"), { recursive: true });
  writeFileSync(join(copy, "changes", "release-test-fixture.md"), "- A change for this test's release.\n");
  const previous = latestRelease();
  // The copy is no git repository: a stand-in git records the step's `git add`.
  const bin = mkdtempSync(join(tmpdir(), "ouro-release-bin-"));
  writeFileSync(join(bin, "git"), `#!/usr/bin/env bash\necho "$*" >> "${join(bin, "calls.log")}"\n`);
  chmodSync(join(bin, "git"), 0o755);
  const result = spawnSync("bash", ["-ec", body], { cwd: copy, encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TAG: "v9.9.9", VERSION: "9.9.9" } });
  assert.equal(result.status, 0, result.stderr);
  // The release commit holds this release's changes, assembled from changes/*.md.
  assert.match(readFileSync(join(copy, "CHANGES.md"), "utf8"), /^# Changes in this release\n\n- [^\n]*\n/);
  assert.match(readFileSync(join(copy, "CHANGES.md"), "utf8"), /^- A change for this test's release\.$/m);
  assert.equal(readFileSync(join(bin, "calls.log"), "utf8"), "add CHANGES.md\n");
  assert.equal(latestRelease(copy), "v9.9.9");
  const docs = ["README.md", "site/public/llms.txt", "package.json", "UPGRADING.md", "registry/ouro/lib/ouro/dev.ts", "registry/ouro/lib/ouro/dev.test.ts", ...tracked("docs/*.md", "site/src/*.ts", "site/src/*.tsx")];
  const stale = docs.flatMap((path) => releaseMismatches(readFileSync(join(copy, path), "utf8"), "v9.9.9").map((problem) => `${path}:${problem}`));
  assert.deepEqual(stale, [], `the release commit still names ${previous}`);
  assert.ok(readFileSync(join(copy, "README.md"), "utf8").includes("ourostack/ouro-ui/dialog#v9.9.9"));
  assert.ok(readFileSync(join(copy, "site/public/llms.txt"), "utf8").includes("ourostack/ouro-ui/dialog#v9.9.9"));
  assert.match(readFileSync(join(copy, "registry.json"), "utf8"), /"ourostack\/ouro-ui\/sheet#v9\.9\.9"/);
  const env = { ...process.env };
  // The nested runner must not inherit this test worker's reporting protocol.
  delete env.NODE_TEST_CONTEXT;
  const readmeTests = spawnSync(process.execPath, ["--test", "--test-reporter=tap", "scripts/readme-steps.test.mjs"], { cwd: copy, encoding: "utf8", env });
  assert.equal(readmeTests.status, 0, readmeTests.stdout + readmeTests.stderr);
  assert.match(readmeTests.stdout, /^ok \d+ - dialog alone does not bring OuroProvider, which is why the README adds it by name$/m);
  // Prepare main consumes these fragments; the durable upgrade contract must still pass.
  renameSync(join(copy, "changes"), join(mkdtempSync(join(tmpdir(), "ouro-consumed-changes-")), "changes"));
  const upgradeTests = spawnSync(process.execPath, ["--test", "--test-reporter=tap", "scripts/upgrade-note.test.mjs"], { cwd: copy, encoding: "utf8", env });
  assert.equal(upgradeTests.status, 0, upgradeTests.stdout + upgradeTests.stderr);
});
