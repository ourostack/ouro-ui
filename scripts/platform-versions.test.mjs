import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { drift, gather, render, renderApple, renderPlatforms } from "./platform-versions.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const real = (path) => readFileSync(join(root, path), "utf8");

const facts = {
  core: { tag: "v0.10.0", commit: "c".repeat(40) },
  web: { tag: "v1.3.24" },
  apple: { tag: "v0.5.1", commit: "a".repeat(40), coreTag: "v0.8.0", treeCoreTag: "v0.9.0" },
};

/** A stand-in for GitHub's API and raw files, answering only what gather asks. */
function fakeGitHub(answers) {
  return async (url) => {
    if (!(url in answers)) return new globalThis.Response(`no ${url}`, { status: 404 });
    const body = answers[url];
    return new globalThis.Response(typeof body === "string" ? body : JSON.stringify(body), { status: 200 });
  };
}

test("the platform pages state what versions.json records, and the checked-in pages are rendered from it", () => {
  const versions = JSON.parse(real("scripts/parity-data/versions.json"));
  const read = (path) => real(path);
  assert.deepEqual(drift(versions, read), []);
});

test("the version table is generated: each row names its release and the core it meets, with checked sources", () => {
  const page = renderPlatforms(real("docs/platforms/README.md"), facts);
  assert.match(page, /^\| For web \| \[v1\.3\.24\]\(https:\/\/github\.com\/ourostack\/ouro-ui\/releases\/tag\/v1\.3\.24\)\[\^web-release\] \| core v0\.10\.0, for its tokens\[\^web-core\] \|/m);
  assert.match(page, /^\| For Apple \| \[v0\.5\.1\]\(https:\/\/github\.com\/ourostack\/ouro-ui-apple\/releases\/tag\/v0\.5\.1\)\[\^apple-release\] \| core v0\.8\.0, and v0\.9\.0 for its A2UI conformance cases\[\^apple-core\] \|/m);
  assert.match(page, /^Core's newest release is v0\.10\.0\.\[\^core-latest\]/m);
  assert.match(page, /^\[\^apple-core\]: https:\/\/github\.com\/ourostack\/ouro-ui-apple\/blob\/a{40}\/core-provenance\.json;.*verify:equals\(scripts\/parity-data\/versions\.json#apple\.coreTag\)=v0\.8\.0/m);
  assert.match(page, /^\[\^web-core\]: https:\/\/github\.com\/ourostack\/ouro-ui-core\/blob\/c{40}\/parity\.json;.*verify:equals\(scripts\/parity-data\/versions\.json#web\.tag\)=v1\.3\.24/m);
  assert.doesNotMatch(page, /v0\.4\.0|v0\.5\.0/);
  // Rendering again changes nothing.
  assert.equal(renderPlatforms(page, facts), page);
});

test("an Apple release that takes all of core from one tag names that tag alone", () => {
  const page = renderPlatforms(real("docs/platforms/README.md"), { ...facts, apple: { ...facts.apple, treeCoreTag: "v0.8.0" } });
  assert.match(page, /\| core v0\.8\.0\[\^apple-core\] \|/);
});

test("the Apple page's release line names the core its release meets", () => {
  const page = renderApple(real("docs/platforms/apple.md"), facts);
  assert.match(page, /^Release \[v0\.5\.1\]\(https:\/\/github\.com\/ourostack\/ouro-ui-apple\/releases\/tag\/v0\.5\.1\) meets core v0\.8\.0, and v0\.9\.0 for its A2UI conformance cases:/m);
  assert.match(page, /^\[\^core\]: https:\/\/github\.com\/ourostack\/ouro-ui-apple\/releases\/tag\/v0\.5\.1; https:\/\/github\.com\/ourostack\/ouro-ui-apple\/blob\/a{40}\/core-provenance\.json/m);
  assert.equal(renderApple(page, facts), page);
});

test("a page left on an old core is drift, named by file, with the command that fixes it", () => {
  const versions = JSON.parse(real("scripts/parity-data/versions.json"));
  const stale = { ...versions, core: { ...versions.core, tag: "v9.9.9" } };
  const problems = drift(stale, (path) => real(path));
  assert.ok(problems.some((problem) => /docs\/platforms\/README\.md/.test(problem)));
  assert.ok(problems.every((problem) => /node scripts\/platform-versions\.mjs --write/.test(problem)));
});

test("the parity tables' copies are at core's newest release", () => {
  const versions = JSON.parse(real("scripts/parity-data/versions.json"));
  const provenance = JSON.parse(real("scripts/parity-data/provenance.json"));
  assert.equal(provenance.coreTag, versions.core.tag);
  const old = (path) => (path === "scripts/parity-data/provenance.json" ? JSON.stringify({ ...provenance, coreTag: "v0.5.0" }) : real(path));
  assert.ok(drift(versions, old).some((problem) => /provenance\.json says core v0\.5\.0/.test(problem)));
});

test("the facts come from the releases: core's newest tag, the web tag its parity check reads, Apple's newest release and its provenance", async () => {
  const fetch = fakeGitHub({
    "https://api.github.com/repos/ourostack/ouro-ui-core/releases/latest": { tag_name: "v0.10.0" },
    "https://api.github.com/repos/ourostack/ouro-ui-core/commits/v0.10.0": { sha: "c".repeat(40) },
    [`https://raw.githubusercontent.com/ourostack/ouro-ui-core/${"c".repeat(40)}/parity.json`]: { webTag: "v1.3.24" },
    "https://api.github.com/repos/ourostack/ouro-ui-apple/releases/latest": { tag_name: "v0.5.1" },
    "https://api.github.com/repos/ourostack/ouro-ui-apple/commits/v0.5.1": { sha: "a".repeat(40) },
    [`https://raw.githubusercontent.com/ourostack/ouro-ui-apple/${"a".repeat(40)}/core-provenance.json`]: { coreTag: "v0.8.0", tree: { coreTag: "v0.9.0" } },
  });
  assert.deepEqual(await gather({ fetch, delayMs: 0 }), facts);
});

test("GitHub failing to answer is an error to retry, not drift", async () => {
  await assert.rejects(gather({ fetch: fakeGitHub({}), attempts: 1, delayMs: 0 }), { name: "VersionsUnreadable" });
});

test("render writes versions.json and every page from the same facts", () => {
  const files = render(facts, (path) => real(path));
  assert.deepEqual(Object.keys(files).sort(), ["docs/platforms/README.md", "docs/platforms/apple.md", "scripts/parity-data/versions.json"]);
  assert.deepEqual(JSON.parse(files["scripts/parity-data/versions.json"]).core, facts.core);
});
