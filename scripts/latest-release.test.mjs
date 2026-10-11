import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
    ...tracked("README.md", "CHANGES.md", "package.json", "docs/*.md", "site/public/*", "site/src/*.ts", "site/src/*.tsx", "site/index.html"),
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

test("unpinnedAddresses finds an item address with no ref, outside sentences for contributors", () => {
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
