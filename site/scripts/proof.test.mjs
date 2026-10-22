import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { URL } from "node:url";
import { execFileSync } from "node:child_process";
import { currentInstall, currentProof, deriveProof, EVIDENCE, pickInstall, PREFERRED_INSTALL, proofPlugin, registryAt, WHERE } from "./proof.mts";
import { release } from "../../scripts/registry.mts";
import { scratchDir } from "../../scripts/scratch.mjs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const sources = () => ({
  registry: read("registry.json"),
  testProjects: read("registry/ouro/lib/ouro/testing/vitest.ts"),
  vitestConfig: read("vitest.config.ts"),
  themes: read("site/src/themes/themes.json"),
  voyageSpec: read("site/e2e/voyage.spec.ts"),
  stage: read("site/src/voyage/stage/stage.tsx"),
});

test("each claim on the hero's proof line comes from its source", () => {
  const files = sources();
  const proof = currentProof();
  const ui = JSON.parse(files.registry).items.filter((item) => item.type === "registry:ui");
  assert.equal(proof.components, ui.length);
  assert.deepEqual(proof.engines, ["chromium", "webkit"]);
  assert.equal(proof.touch, true);
  assert.equal(proof.coverage, 100);
  assert.equal(proof.themes, JSON.parse(files.themes).length);
  assert.equal(proof.typescript, true);
  assert.equal(proof.stage, true);
  assert.equal(proof.line, `${ui.length} React components · TypeScript · Chromium + WebKit + touch tested · axe-clean in 6 themes · every line covered · This stage is built with HX`);
  assert.deepEqual(
    proof.claims.map((claim) => claim.href.replace(/#L\d+$/, "")),
    [EVIDENCE.components, EVIDENCE.typescript, EVIDENCE.engines, EVIDENCE.themes, EVIDENCE.coverage, EVIDENCE.stage],
  );
  assert.deepEqual(
    proof.claims.map((claim) => claim.where),
    [WHERE.components, WHERE.typescript, WHERE.engines, WHERE.themes, WHERE.coverage, WHERE.stage],
  );
});

test("a line link lands on the line that makes its claim", () => {
  const files = sources();
  const line = (source, href) => source.split("\n")[Number(/#L(\d+)$/.exec(href)[1]) - 1];
  const [, , , themes, coverage] = currentProof().claims;
  assert.match(line(files.voyageSpec, themes.href), /test\.describe\("every preset, light and dark"/);
  assert.match(line(files.vitestConfig, coverage.href), /thresholds: \{ lines: 100/);
});

test("the stage claim needs the stage built from registry components", () => {
  const files = sources();
  const stage = files.stage.replaceAll("@/registry/ouro/components/ouro/", "@/elsewhere/");
  assert.equal(deriveProof({ ...files, stage }).stage, false);
  assert.doesNotMatch(deriveProof({ ...files, stage }).line, /This stage/);
});

test("each claim links to evidence that exists in this repository", () => {
  for (const href of Object.values(EVIDENCE)) {
    const path = /github\.com\/ourostack\/ouro-ui\/(?:tree|blob)\/main\/([^#?]+)/.exec(href)?.[1];
    if (path) assert.ok(existsSync(new URL(`../../${path}`, import.meta.url)), href);
    else if (!href.includes("/actions/workflows/")) assert.equal(href, "/ouro-ui/docs/");
  }
  assert.ok(existsSync(new URL("../../.github/workflows/ci.yml", import.meta.url)));
});

test("a component in a file that isn't TypeScript drops the TypeScript claim", () => {
  const files = sources();
  const registry = JSON.parse(files.registry);
  const item = registry.items.find((entry) => entry.type === "registry:ui");
  item.files = [...item.files, { path: "registry/ouro/components/ouro/extra.js", type: "registry:ui" }];
  assert.doesNotMatch(deriveProof({ ...files, registry: JSON.stringify(registry) }).line, /TypeScript/);
});

test("the install command adds a component the latest release has", () => {
  const install = currentInstall();
  const release = JSON.parse(read("package.json")).ouro.latestRelease;
  assert.equal(install.release, release);
  const names = JSON.parse(registryAt(release)).items.filter((entry) => entry.type === "registry:ui").map((entry) => entry.name);
  assert.ok(names.includes(install.item), `${install.item} is not in ${release}'s registry.json`);
  assert.equal(install.count, names.length);
  assert.equal(install.item, PREFERRED_INSTALL.find((name) => names.includes(name)));
  // The same answer as git itself gives at that tag, or, on the release commit for it, whose tag CI
  // there runs before, the commit's own registry.json, released at that version.
  const own = read("registry.json");
  const expected = `v${JSON.parse(own).version}` === release ? own : execFileSync("git", ["show", `${release}:registry.json`], { encoding: "utf8" });
  assert.equal(registryAt(release), expected);
});

/**
 * A checkout of a release commit as release.yml makes it, before its tag exists: registry.json
 * released at `version` (scripts/registry.mts --release), package.json's ouro.latestRelease naming
 * that tag, the proof's other sources as they are here, and an origin that has no such tag.
 */
function releaseCheckout(version) {
  const origin = scratchDir("ouro-proof-origin-");
  const dir = scratchDir("ouro-proof-release-");
  const git = (cwd, ...args) => execFileSync("git", args, { cwd, stdio: "ignore" });
  git(origin, "init", "--quiet", "--bare");
  for (const path of ["registry/ouro/lib/ouro/testing/vitest.ts", "vitest.config.ts", "site/src/themes/themes.json", "site/e2e/voyage.spec.ts", "site/src/voyage/stage/stage.tsx"]) {
    mkdirSync(join(dir, dirname(path)), { recursive: true });
    writeFileSync(join(dir, path), read(path));
  }
  writeFileSync(join(dir, "registry.json"), `${JSON.stringify(release(JSON.parse(read("registry.json")), version), null, 2)}\n`);
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "ouro-ui", ouro: { latestRelease: `v${version}` } }));
  git(dir, "init", "--quiet");
  git(dir, "add", ".");
  git(dir, "-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "--quiet", "-m", `Release v${version}`);
  git(dir, "remote", "add", "origin", origin);
  return dir;
}

test("a release commit's site build takes the install line from its own registry.json, before its tag exists", () => {
  const dir = releaseCheckout("9.9.9");
  const names = JSON.parse(readFileSync(join(dir, "registry.json"), "utf8")).items.filter((entry) => entry.type === "registry:ui").map((entry) => entry.name);
  const expected = { item: PREFERRED_INSTALL.find((name) => names.includes(name)), release: "v9.9.9", count: names.length };
  // No fetch of the tag that CI on this commit has to pass before it can exist.
  assert.equal(registryAt("v9.9.9", dir), readFileSync(join(dir, "registry.json"), "utf8"));
  assert.deepEqual(currentInstall(dir), expected);
  // What the site build loads as virtual:site-proof (site/vite.config.ts).
  const plugin = proofPlugin(dir);
  const module = plugin.load(plugin.resolveId("virtual:site-proof"));
  assert.ok(module.includes(`export const install = ${JSON.stringify(expected)};`), module);
  // Another tag still comes from git, and one that origin lacks fails.
  assert.throws(() => registryAt("v9.9.8", dir), /git fetch/);
});

test("the install command switches to Checklist once a release has it", () => {
  const registry = (names) => JSON.stringify({ items: names.map((name) => ({ name, type: "registry:ui" })) });
  assert.deepEqual(pickInstall("v1.0.2", registry(["button", "switch"])), { item: "switch", release: "v1.0.2", count: 2 });
  assert.deepEqual(pickInstall("v1.1.0", registry(["button", "switch", "checklist"])), { item: "checklist", release: "v1.1.0", count: 3 });
  assert.throws(() => pickInstall("v0.1.0", registry(["button"])), /has none of checklist, switch/);
});

test("counting components counts only what an app installs", () => {
  const files = sources();
  const registry = JSON.parse(files.registry);
  registry.items.push({ name: "extra-lib", type: "registry:lib" }, { name: "extra-ui", type: "registry:ui" });
  assert.equal(deriveProof({ ...files, registry: JSON.stringify(registry) }).components, currentProof().components + 1);
});

test("a lower coverage threshold lowers the claim to the lowest of the four", () => {
  const files = sources();
  const vitestConfig = files.vitestConfig.replace("thresholds: { lines: 100, branches: 100,", "thresholds: { lines: 100, branches: 92,");
  assert.notEqual(vitestConfig, files.vitestConfig);
  assert.match(deriveProof({ ...files, vitestConfig }).line, /92% of lines covered/);
});

test("losing the coverage thresholds over registry/ is an error, not a quiet claim", () => {
  const files = sources();
  assert.throws(() => deriveProof({ ...files, vitestConfig: files.vitestConfig.replace(/thresholds: \{[^}]*\}/, "thresholds: {}") }), /coverage thresholds/);
  assert.throws(() => deriveProof({ ...files, vitestConfig: files.vitestConfig.replace('include: ["registry/**/*.{ts,tsx}"', 'include: ["registry/ouro/lib/**/*.ts"') }), /coverage thresholds/);
});

test("coverage that also names files beyond registry/'s sources still claims every line", () => {
  const files = sources();
  const vitestConfig = files.vitestConfig.replace(/include: \["registry\/\*\*\/\*\.\{ts,tsx\}"[^\]]*\]/, 'include: ["registry/**/*.{ts,tsx}", "a.mjs", "b.mjs"]');
  assert.match(vitestConfig, /"a\.mjs", "b\.mjs"/);
  assert.match(deriveProof({ ...files, vitestConfig }).line, /every line covered/);
});

test("a single engine, or no touch project, is said as such", () => {
  const files = sources();
  const testProjects = files.testProjects.replace('browsers = ["chromium", "webkit"]', 'browsers = ["chromium"]').replace('name: "ouro-touch"', 'name: "ouro-phone"');
  assert.match(deriveProof({ ...files, testProjects }).line, /· Chromium tested ·/);
});

test("browsers overridden in vitest.config.ts are refused rather than miscounted", () => {
  const files = sources();
  const vitestConfig = files.vitestConfig.replace(/ouroTestProjects\(\{/, 'ouroTestProjects({ browsers: ["firefox"], ');
  assert.notEqual(vitestConfig, files.vitestConfig);
  assert.throws(() => deriveProof({ ...files, vitestConfig }), /overrides the browsers/);
});

test("the theme claim needs the axe loop over every preset in light and dark", () => {
  const files = sources();
  const voyageSpec = files.voyageSpec.replace('for (const mode of ["light", "dark"]', 'for (const mode of ["light"]');
  assert.notEqual(voyageSpec, files.voyageSpec);
  const proof = deriveProof({ ...files, voyageSpec });
  assert.equal(proof.themes, 0);
  assert.doesNotMatch(proof.line, /axe-clean/);
});

test("the page's proof module holds only the claims the hero shows", () => {
  const plugin = proofPlugin();
  const module = plugin.load(plugin.resolveId("virtual:site-proof"));
  const proof = JSON.parse(/^export default (.*);$/m.exec(module)[1]);
  assert.deepEqual(Object.keys(proof), ["claims"]);
  assert.deepEqual(proof.claims, currentProof().claims);
});
