import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { URL } from "node:url";
import { execFileSync } from "node:child_process";
import { currentInstall, currentProof, deriveProof, EVIDENCE, pickInstall, PREFERRED_INSTALL, proofPlugin, registryAt } from "./proof.mts";
import { release } from "../../scripts/registry.mts";
import { scratchDir } from "../../scripts/scratch.mjs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const sources = () => ({
  registry: read("registry.json"),
  testProjects: read("registry/ouro/lib/ouro/testing/vitest.ts"),
  vitestConfig: read("vitest.config.ts"),
  themes: read("site/src/themes/themes.json"),
  voyageSpec: read("site/e2e/voyage-presets.spec.ts"),
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
  assert.equal(
    proof.line,
    "From buttons and forms to calendars and chat · Typed, so editors and agents see every prop · Tested in Chrome and Safari engines, by mouse and by touch · Passes accessibility checks in all six looks, light and dark · Every line of code runs in a test",
  );
  // No count of components: the line says what the kit covers.
  assert.doesNotMatch(proof.line, new RegExp(`\\b${ui.length}\\b`));
  assert.deepEqual(
    proof.claims.map((claim) => claim.href.replace(/#L\d+$/, "")),
    [EVIDENCE.components, EVIDENCE.typescript, EVIDENCE.engines, EVIDENCE.themes, EVIDENCE.coverage],
  );
});

test("a line link lands on the line that makes its claim", () => {
  const files = sources();
  const line = (source, href) => source.split("\n")[Number(/#L(\d+)$/.exec(href)[1]) - 1];
  const [, , , themes, coverage] = currentProof().claims;
  assert.match(line(files.voyageSpec, themes.href), /test\.describe\("every preset, light and dark"/);
  assert.match(line(files.vitestConfig, coverage.href), /thresholds: \{ lines: 100/);
});

test("the stage check needs the stage built from registry components, and the line never claims it (the console does)", () => {
  const files = sources();
  const stage = files.stage.replaceAll("@/registry/ouro/components/ouro/", "@/elsewhere/");
  assert.equal(deriveProof({ ...files, stage }).stage, false);
  assert.doesNotMatch(deriveProof({ ...files, stage }).line, /porthole/);
});

test("each claim links to evidence that exists in this repository", () => {
  for (const href of Object.values(EVIDENCE)) {
    const path = /github\.com\/ourostack\/ouro-ui\/(?:tree|blob)\/main\/([^#?]+)/.exec(href)?.[1];
    if (path) assert.ok(existsSync(new URL(`../../${path}`, import.meta.url)), href);
    else if (!href.includes("/actions/workflows/")) assert.equal(href, "/docs/");
  }
  assert.ok(existsSync(new URL("../../.github/workflows/ci.yml", import.meta.url)));
});

test("a component in a file that isn't TypeScript drops the TypeScript claim", () => {
  const files = sources();
  const registry = JSON.parse(files.registry);
  const item = registry.items.find((entry) => entry.type === "registry:ui");
  item.files = [...item.files, { path: "registry/ouro/components/ouro/extra.js", type: "registry:ui" }];
  assert.doesNotMatch(deriveProof({ ...files, registry: JSON.stringify(registry) }).line, /Typed/);
});

test("the first claim names buttons, forms, calendars and chat only while the registry has each", () => {
  const files = sources();
  const registry = JSON.parse(files.registry);
  registry.items = registry.items.filter((entry) => entry.name !== "calendar");
  const line = deriveProof({ ...files, registry: JSON.stringify(registry) }).line;
  assert.doesNotMatch(line, /calendars/);
  assert.match(line, /^React components for whole apps · /);
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
  for (const path of ["registry/ouro/lib/ouro/testing/vitest.ts", "vitest.config.ts", "site/src/themes/themes.json", "site/e2e/voyage-presets.spec.ts", "site/src/voyage/stage/stage.tsx", "docs/guides/agent-interfaces.md", "site/src/apple/kit.json", "docs/platforms/windows.md", "docs/platforms/android.md"]) {
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
  // Computed when Vite starts, outside the module runner's 60 s for a module, and served from there.
  plugin.buildStart();
  const own = readFileSync(join(dir, "registry.json"));
  rmSync(join(dir, "registry.json"));
  const module = plugin.load(plugin.resolveId("virtual:site-proof"));
  assert.ok(module.includes(`export const install = ${JSON.stringify(expected)};`), module);
  writeFileSync(join(dir, "registry.json"), own);
  // Another tag still comes from git, and one that origin lacks fails.
  // One that origin lacks fails after its tries, naming what git said first and last.
  assert.throws(() => registryAt("v9.9.8", dir, 0), /git fetch of v9\.9\.8 failed 3 times, 0 ms apart, each within 16000 ms\. First: .*refs\/tags\/v9\.9\.8.*\. Last: .*refs\/tags\/v9\.9\.8/s);
});

test("a tag another process fetched while this one's fetch lost the shallow lock is read, not fetched again", () => {
  const dir = releaseCheckout("9.9.9");
  // A stand-in git whose fetch does what the winning process's fetch does (the tag arrives) and then fails as the
  // loser's does on the held .git/shallow.lock; every other command is the real git.
  const bin = scratchDir("ouro-proof-git-");
  const realGit = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
  const calls = join(bin, "fetches");
  writeFileSync(join(bin, "git"), `#!/bin/sh
for arg in "$@"; do
  if [ "$arg" = fetch ]; then
    echo x >> "${calls}"
    "${realGit}" tag v9.9.7 >/dev/null 2>&1
    echo "fatal: Unable to create '.git/shallow.lock': File exists." >&2
    exit 128
  fi
done
exec "${realGit}" "$@"
`, { mode: 0o755 });
  const path = process.env.PATH;
  process.env.PATH = `${bin}:${path}`;
  try {
    assert.equal(registryAt("v9.9.7", dir, 0), readFileSync(join(dir, "registry.json"), "utf8"));
  } finally {
    process.env.PATH = path;
  }
  assert.equal(readFileSync(calls, "utf8"), "x\n");
});


test("a tag fetch that stalls is ended within its time limit and tried again, so the tries end inside Vite's 60 s", () => {
  const dir = releaseCheckout("9.9.9");
  // A stand-in git whose first fetch hangs, as a stalled network fetch does, and whose second brings the tag in.
  const bin = scratchDir("ouro-proof-git-");
  const realGit = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
  const calls = join(bin, "fetches");
  writeFileSync(join(bin, "git"), `#!/bin/sh
for arg in "$@"; do
  if [ "$arg" = fetch ]; then
    echo x >> "${calls}"
    [ "$(wc -l < "${calls}")" -gt 1 ] || exec sleep 30
    exec "${realGit}" tag v9.9.6
  fi
done
exec "${realGit}" "$@"
`, { mode: 0o755 });
  const path = process.env.PATH;
  process.env.PATH = `${bin}:${path}`;
  const started = Date.now();
  try {
    assert.equal(registryAt("v9.9.6", dir, 0, 4, 500), readFileSync(join(dir, "registry.json"), "utf8"));
  } finally {
    process.env.PATH = path;
  }
  assert.ok(Date.now() - started < 10_000, `took ${Date.now() - started} ms`);
  assert.equal(readFileSync(calls, "utf8"), "x\nx\n");
});

test("a fetch slower than the old 10 s bound but inside the new default of 16 s still brings the tag in, as v1.3.506's would have (#3375)", () => {
  const dir = releaseCheckout("9.9.9");
  // A stand-in git whose fetch takes 1.2 s, scaled from the real runner's fetch of v1.3.506 that kept missing the old
  // 10 s bound by seconds, not milliseconds: 1,000 ms stands for the old bound, 1,600 ms for the new one, and this
  // fetch's 1.2 s falls between them, so it fails at the old scaled bound and succeeds at the new one.
  const bin = scratchDir("ouro-proof-git-");
  const realGit = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
  writeFileSync(join(bin, "git"), `#!/bin/sh
for arg in "$@"; do
  if [ "$arg" = fetch ]; then sleep 1.2; exec "${realGit}" tag v9.9.2; fi
done
exec "${realGit}" "$@"
`, { mode: 0o755 });
  const path = process.env.PATH;
  process.env.PATH = `${bin}:${path}`;
  try {
    assert.throws(() => registryAt("v9.9.2", dir, 0, 1, 1_000), /git fetch of v9\.9\.2 failed 1 times/);
    assert.equal(registryAt("v9.9.2", dir, 0, 1, 1_600), readFileSync(join(dir, "registry.json"), "utf8"));
  } finally {
    process.env.PATH = path;
  }
});

test("the default tries, fetchTimeout and retryAfter still end inside Vite's 60 s module budget", () => {
  // 3 tries of 16 s plus 2 waits of 2 s is 52 s, 8 s short of the 60 s ourostack/ouro-ui#2469 gives this module; a
  // change to any of the three defaults must keep recomputing this true, so the test reads them from a real failure
  // rather than repeating the numbers by hand.
  const dir = releaseCheckout("9.9.9");
  let message;
  try {
    registryAt("v9.9.1", dir, undefined, undefined, undefined);
    assert.fail("expected registryAt to throw");
  } catch (error) {
    message = error.message;
  }
  const [, tries, retryAfter, fetchTimeout] = /failed (\d+) times, (\d+) ms apart, each within (\d+) ms/.exec(message).map(Number);
  assert.ok(tries * fetchTimeout + (tries - 1) * retryAfter < 60_000, `${tries} tries of ${fetchTimeout} ms and ${tries - 1} waits of ${retryAfter} ms do not end inside 60 s`);
});

test("a shallow.lock left by a fetch its time limit ended is cleared before the next try, not hit by every one (#1781)", () => {
  const dir = releaseCheckout("9.9.9");
  // A stand-in git whose first fetch takes .git/shallow.lock and hangs, and is ended without removing it, as a killed
  // git leaves it; each later fetch fails on a held lock, as git does, or brings the tag in.
  const bin = scratchDir("ouro-proof-git-");
  const realGit = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
  const calls = join(bin, "fetches");
  const lock = join(dir, ".git", "shallow.lock");
  writeFileSync(join(bin, "git"), `#!/bin/sh
for arg in "$@"; do
  if [ "$arg" = fetch ]; then
    echo x >> "${calls}"
    if [ "$(wc -l < "${calls}")" -eq 1 ]; then touch "${lock}"; exec sleep 30; fi
    if [ -e "${lock}" ]; then echo "fatal: Unable to create '.git/shallow.lock': File exists." >&2; exit 128; fi
    exec "${realGit}" tag v9.9.5
  fi
done
exec "${realGit}" "$@"
`, { mode: 0o755 });
  const path = process.env.PATH;
  process.env.PATH = `${bin}:${path}`;
  try {
    assert.equal(registryAt("v9.9.5", dir, 100, 4, 500), readFileSync(join(dir, "registry.json"), "utf8"));
  } finally {
    process.env.PATH = path;
  }
  assert.equal(readFileSync(calls, "utf8"), "x\nx\n");
  assert.equal(existsSync(lock), false);
});

test("a shallow.lock younger than the fetch time limit is another fetch's, and is left for it", () => {
  const dir = releaseCheckout("9.9.9");
  const lock = join(dir, ".git", "shallow.lock");
  // Another process holds the lock throughout: every fetch fails on it, and it stays.
  const bin = scratchDir("ouro-proof-git-");
  const realGit = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
  writeFileSync(join(bin, "git"), `#!/bin/sh
for arg in "$@"; do
  if [ "$arg" = fetch ]; then touch "${lock}"; echo "fatal: Unable to create '.git/shallow.lock': File exists." >&2; exit 128; fi
done
exec "${realGit}" "$@"
`, { mode: 0o755 });
  const path = process.env.PATH;
  process.env.PATH = `${bin}:${path}`;
  try {
    assert.throws(() => registryAt("v9.9.4", dir, 0, 4, 10_000), /Last: fatal: Unable to create '\.git\/shallow\.lock'/);
  } finally {
    process.env.PATH = path;
  }
  assert.equal(existsSync(lock), true);
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
  assert.match(deriveProof({ ...files, vitestConfig }).line, /92% of lines run in a test/);
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
  assert.match(deriveProof({ ...files, vitestConfig }).line, /Every line of code runs in a test/);
});

test("a single engine, or no touch project, is said as such", () => {
  const files = sources();
  const testProjects = files.testProjects.replace('browsers = ["chromium", "webkit"]', 'browsers = ["chromium"]').replace('name: "ouro-touch"', 'name: "ouro-phone"');
  assert.match(deriveProof({ ...files, testProjects }).line, /· Tested in Chrome engine ·/);
});

test("browsers overridden in vitest.config.ts are refused rather than miscounted", () => {
  const files = sources();
  const vitestConfig = files.vitestConfig.replace(/ouroTestProjects\(\{/, 'ouroTestProjects({ browsers: ["firefox"], ');
  assert.notEqual(vitestConfig, files.vitestConfig);
  assert.throws(() => deriveProof({ ...files, vitestConfig }), /overrides the browsers/);
});

test("the theme claim needs each scan to pass the audit kit's strict audit", () => {
  const files = sources();
  const voyageSpec = files.voyageSpec.replace('expect(await auditPage(page, browserName)).toBe("")', "await auditPage(page, browserName)");
  assert.notEqual(voyageSpec, files.voyageSpec);
  const proof = deriveProof({ ...files, voyageSpec });
  assert.equal(proof.themes, 0);
  assert.doesNotMatch(proof.line, /accessibility/);
});

test("the theme claim needs the axe loop over every preset in light and dark", () => {
  const files = sources();
  const voyageSpec = files.voyageSpec.replace('for (const mode of ["light", "dark"]', 'for (const mode of ["light"]');
  assert.notEqual(voyageSpec, files.voyageSpec);
  const proof = deriveProof({ ...files, voyageSpec });
  assert.equal(proof.themes, 0);
  assert.doesNotMatch(proof.line, /accessibility/);
});
