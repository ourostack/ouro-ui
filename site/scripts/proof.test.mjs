import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";
import { currentProof, deriveProof } from "./proof.mts";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const sources = () => ({
  registry: read("registry.json"),
  testProjects: read("registry/ouro/lib/ouro/testing/vitest.ts"),
  vitestConfig: read("vitest.config.ts"),
  themes: read("site/src/themes/themes.json"),
  voyageSpec: read("site/e2e/voyage.spec.ts"),
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
  assert.equal(proof.line, `${ui.length} components · 2 browser engines + touch profile · registry 100% covered · axe-clean in 6 themes`);
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
  assert.match(deriveProof({ ...files, vitestConfig }).line, /registry 92% covered/);
});

test("losing the coverage thresholds over registry/ is an error, not a quiet claim", () => {
  const files = sources();
  assert.throws(() => deriveProof({ ...files, vitestConfig: files.vitestConfig.replace(/thresholds: \{[^}]*\}/, "thresholds: {}") }), /coverage thresholds/);
});

test("a single engine, or no touch project, is said as such", () => {
  const files = sources();
  const testProjects = files.testProjects.replace('browsers = ["chromium", "webkit"]', 'browsers = ["chromium"]').replace('name: "ouro-touch"', 'name: "ouro-phone"');
  assert.match(deriveProof({ ...files, testProjects }).line, /· 1 browser engine ·/);
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
