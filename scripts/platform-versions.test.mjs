import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { drift, factsOf, gatherApple, gatherCore, pinnedProblems, render, renderApple, renderPlatforms, renderWindows } from "./platform-versions.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const real = (path) => readFileSync(join(root, path), "utf8");
const VERSIONS = "scripts/parity-data/versions.json";
const PROVENANCE = "scripts/parity-data/provenance.json";
const PARITY = "scripts/parity-data/parity.json";
const PLATFORMS = "docs/platforms/README.md";
const APPLE_PAGE = "docs/platforms/apple.md";
const WINDOWS_PAGE = "docs/platforms/windows.md";

const facts = {
  core: { tag: "v0.10.0", commit: "c".repeat(40) },
  web: { tag: "v1.3.24" },
  apple: { tag: "v0.5.1", commit: "a".repeat(40), coreTag: "v0.8.0", treeCoreTag: "v0.9.0" },
  windows: { tag: "v0.2.0", commit: "b".repeat(40), coreTag: "v0.10.0", treeCoreTag: "v0.10.0" },
};

/** A stand-in for GitHub's API and raw files, answering only what gather asks. */
function fakeGitHub(answers) {
  return async (url) => {
    if (!(url in answers)) return new globalThis.Response(`no ${url}`, { status: 404 });
    const body = answers[url];
    return new globalThis.Response(typeof body === "string" ? body : JSON.stringify(body), { status: 200 });
  };
}

test("the platform pages state what the committed data records, and the checked-in pages are rendered from it", () => {
  assert.deepEqual(drift(JSON.parse(real(VERSIONS)), real), []);
});

test("the pages' core and web come from the parity copies, and the Apple pin from versions.json", () => {
  const provenance = JSON.parse(real(PROVENANCE));
  const parity = JSON.parse(real(PARITY));
  const pages = factsOf(JSON.parse(real(VERSIONS)), real);
  assert.deepEqual(pages.core, { tag: provenance.coreTag, commit: provenance.coreCommit });
  assert.equal(pages.web.tag, parity.webTag);
  assert.deepEqual(pages.apple, JSON.parse(real(VERSIONS)).apple);
});

test("the version table is generated: each row names its release and the core it meets, with checked sources", () => {
  const page = renderPlatforms(real("docs/platforms/README.md"), facts);
  assert.match(page, /^\| For web \| \[v1\.3\.24\]\(https:\/\/github\.com\/ourostack\/ouro-ui\/releases\/tag\/v1\.3\.24\)\[\^web-release\] \| core v0\.10\.0, for its tokens\[\^web-core\] \|/m);
  assert.match(page, /^\| For Apple \| \[v0\.5\.1\]\(https:\/\/github\.com\/ourostack\/ouro-ui-apple\/releases\/tag\/v0\.5\.1\)\[\^apple-release\] \| core v0\.8\.0, and v0\.9\.0 for its A2UI conformance cases\[\^apple-core\] \|/m);
  assert.match(page, /^Core's newest release is v0\.10\.0\.\[\^core-latest\]/m);
  assert.match(page, /^\[\^apple-core\]: https:\/\/github\.com\/ourostack\/ouro-ui-apple\/blob\/a{40}\/core-provenance\.json;.*verify:equals\(scripts\/parity-data\/versions\.json#apple\.coreTag\)=v0\.8\.0/m);
  assert.match(page, /^\[\^web-core\]: https:\/\/github\.com\/ourostack\/ouro-ui-core\/blob\/c{40}\/parity\.json;.*verify:equals\(scripts\/parity-data\/parity\.json#webTag\)=v1\.3\.24 verify:equals\(scripts\/parity-data\/provenance\.json#coreTag\)=v0\.10\.0/m);
  assert.match(page, /^\[\^core-latest\]: .*verify:equals\(scripts\/parity-data\/provenance\.json#coreTag\)=v0\.10\.0$/m);
  assert.doesNotMatch(page, /v0\.4\.0|v0\.5\.0/);
  // Rendering again changes nothing.
  assert.equal(renderPlatforms(page, facts), page);
});

test("the Windows row names its release and the core it meets, with checked sources", () => {
  const page = renderPlatforms(real(PLATFORMS), facts);
  assert.match(page, /^\| For Windows \| \[v0\.2\.0\]\(https:\/\/github\.com\/ourostack\/ouro-ui-windows\/releases\/tag\/v0\.2\.0\)\[\^windows-release\] \| core v0\.10\.0\[\^windows-core\] \|/m);
  assert.match(page, /^\[\^windows-core\]: https:\/\/github\.com\/ourostack\/ouro-ui-windows\/blob\/b{40}\/core-provenance\.json;.*verify:equals\(scripts\/parity-data\/versions\.json#windows\.coreTag\)=v0\.10\.0$/m);
  assert.match(page, /^\[\^windows-release\]: .*verify:equals\(scripts\/parity-data\/versions\.json#windows\.tag\)=v0\.2\.0$/m);
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

test("the Windows page's release line names the core its release meets", () => {
  const page = renderWindows(real(WINDOWS_PAGE), facts);
  assert.match(page, /^Release \[v0\.2\.0\]\(https:\/\/github\.com\/ourostack\/ouro-ui-windows\/releases\/tag\/v0\.2\.0\) meets core v0\.10\.0:/m);
  assert.match(page, /^\[\^core\]: https:\/\/github\.com\/ourostack\/ouro-ui-windows\/releases\/tag\/v0\.2\.0; https:\/\/github\.com\/ourostack\/ouro-ui-windows\/blob\/b{40}\/core-provenance\.json;.*verify:equals\(scripts\/parity-data\/versions\.json#windows\.coreTag\)=v0\.10\.0$/m);
  assert.equal(renderWindows(page, facts), page);
});

test("a page that disagrees with the parity copies' release is drift, named by file, with the command that fixes it", () => {
  const provenance = JSON.parse(real(PROVENANCE));
  const read = (path) => (path === PROVENANCE ? JSON.stringify({ ...provenance, coreTag: "v9.9.9" }) : real(path));
  const problems = drift(JSON.parse(real(VERSIONS)), read);
  assert.ok(problems.some((problem) => problem.startsWith(PLATFORMS)));
  assert.ok(problems.every((problem) => /node scripts\/platform-versions\.mjs --render/.test(problem)));
});

test("a pinned Apple release that versions.json no longer matches is drift in the pages that state it", () => {
  const versions = JSON.parse(real(VERSIONS));
  const problems = drift({ ...versions, apple: { ...versions.apple, tag: "v9.9.9" } }, real);
  assert.ok(problems.some((problem) => problem.startsWith(PLATFORMS)));
  assert.ok(problems.some((problem) => problem.startsWith(APPLE_PAGE)));
});

test("the parity tables' copies are the release the Platforms pages name, which the Pages build sets to core's newest", () => {
  const provenance = JSON.parse(real(PROVENANCE));
  const parity = JSON.parse(real(PARITY));
  const pages = factsOf(JSON.parse(real(VERSIONS)), real);
  assert.equal(pages.core.tag, provenance.coreTag);
  assert.equal(pages.web.tag, parity.webTag);
  assert.deepEqual(Object.keys(provenance.files).sort(), ["actions.claims.json", "components.claims.json", "parity.json"]);
});

test("core's newest release is read from GitHub with the copies at it: the claim files from the release, parity.json from its commit", async () => {
  const commit = "c".repeat(40);
  const fetch = fakeGitHub({
    "https://api.github.com/repos/ourostack/ouro-ui-core/releases/latest": { tag_name: "v0.10.0" },
    "https://api.github.com/repos/ourostack/ouro-ui-core/commits/v0.10.0": { sha: commit },
    "https://github.com/ourostack/ouro-ui-core/releases/download/v0.10.0/components.claims.json": '{"claims":[]}',
    "https://github.com/ourostack/ouro-ui-core/releases/download/v0.10.0/actions.claims.json": '{"claims":[]}',
    [`https://raw.githubusercontent.com/ourostack/ouro-ui-core/${commit}/parity.json`]: { webTag: "v1.3.24" },
  });
  const { core, copies } = await gatherCore({ fetch, delayMs: 0 });
  assert.deepEqual(core, facts.core);
  assert.deepEqual(Object.keys(copies).sort(), ["actions.claims.json", "components.claims.json", "parity.json"]);
  assert.equal(JSON.parse(copies["parity.json"].toString("utf8")).webTag, "v1.3.24");
});

test("the pinned Apple release is read from GitHub: its tag's commit and the cores its provenance names", async () => {
  const fetch = fakeGitHub({
    "https://api.github.com/repos/ourostack/ouro-ui-apple/commits/v0.5.1": { sha: "a".repeat(40) },
    [`https://raw.githubusercontent.com/ourostack/ouro-ui-apple/${"a".repeat(40)}/core-provenance.json`]: { coreTag: "v0.8.0", tree: { coreTag: "v0.9.0" } },
  });
  assert.deepEqual(await gatherApple("v0.5.1", { fetch, delayMs: 0 }), facts.apple);
});

test("a pinned kit release is drift when GitHub names another commit or core for its tag, with the command that pins it again", async () => {
  const versions = JSON.parse(real(VERSIONS));
  const repos = { apple: "ourostack/ouro-ui-apple", windows: "ourostack/ouro-ui-windows" };
  const kitAnswers = (kit, commit, coreTag) => ({
    [`https://api.github.com/repos/${repos[kit]}/commits/${versions[kit].tag}`]: { sha: commit },
    [`https://raw.githubusercontent.com/${repos[kit]}/${commit}/core-provenance.json`]: { coreTag, tree: { coreTag: versions[kit].treeCoreTag } },
  });
  const github = ({ apple, windows }) => fakeGitHub({
    ...kitAnswers("apple", apple?.commit ?? versions.apple.commit, apple?.coreTag ?? versions.apple.coreTag),
    ...kitAnswers("windows", windows?.commit ?? versions.windows.commit, windows?.coreTag ?? versions.windows.coreTag),
  });
  assert.deepEqual(await pinnedProblems(versions, { fetch: github({}), delayMs: 0 }), []);
  const appleMoved = await pinnedProblems(versions, { fetch: github({ apple: { commit: "d".repeat(40), coreTag: "v9.0.0" } }), delayMs: 0 });
  assert.equal(appleMoved.length, 1);
  assert.match(appleMoved[0], new RegExp(`--apple ${versions.apple.tag.replace(/\./g, "\\.")} and commit`));
  const windowsMoved = await pinnedProblems(versions, { fetch: github({ windows: { commit: "e".repeat(40), coreTag: "v0.12.1" } }), delayMs: 0 });
  assert.equal(windowsMoved.length, 1);
  assert.match(windowsMoved[0], new RegExp(`--windows ${versions.windows.tag.replace(/\./g, "\\.")} and commit`));
});

test("GitHub failing to answer is an error to retry, not drift", async () => {
  await assert.rejects(gatherCore({ fetch: fakeGitHub({}), attempts: 1, delayMs: 0 }), { name: "VersionsUnreadable" });
  await assert.rejects(gatherApple("v0.5.1", { fetch: fakeGitHub({}), attempts: 1, delayMs: 0 }), { name: "VersionsUnreadable" });
});

test("render writes versions.json with both kit pins, and every page from the same facts", () => {
  const files = render(facts, real);
  assert.deepEqual(Object.keys(files).sort(), [APPLE_PAGE, PLATFORMS, VERSIONS, WINDOWS_PAGE].sort());
  const written = JSON.parse(files[VERSIONS]);
  assert.deepEqual(Object.keys(written), ["$comment", "apple", "windows"]);
  assert.deepEqual(written.apple, facts.apple);
  assert.deepEqual(written.windows, facts.windows);
});
