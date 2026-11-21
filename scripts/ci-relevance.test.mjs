import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, realpathSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { classify, scoped } from "./ci-paths.mjs";
import { relevance, targets } from "./ci-relevance.mjs";
import { scratchDir } from "./scratch.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const runs = (target, files) => relevance(target, files).run;

test("the browser shards skip a change to change fragments, Node script tests, end-to-end specs, baselines and other workflows", () => {
  const files = [
    "changes/dialog.md",
    "AGENTS.md",
    "flows/sign-in.yml",
    "feel/probe/probe.ts",
    "scripts/source-rules.test.mjs",
    "scripts/agent-usability/runs/2026-10-15/results.md",
    "site/e2e/stage.spec.ts",
    "registry/ouro/e2e/ouro/dialog.spec.ts",
    "registry/ouro/e2e/screen-reader/dialog.sr.spec.ts",
    "test/__screenshots__/screenshots.visual.test.tsx/dialog-open-linux.png",
    ".github/workflows/screens.yml",
    ".github/quarantine.json",
  ];
  for (const path of files) assert.equal(runs("browser", [path]), false, path);
  const { reasons } = relevance("browser", files);
  assert.equal(reasons.length, files.length);
  assert.equal(reasons[0], "changes/dialog.md: a change fragment, which only scripts/changes.mjs reads, which the browser shards do not read");
});

test("the browser shards run for anything they may read, for a path nobody listed, and for an empty diff", () => {
  for (const path of [
    ".github/workflows/ci.yml",
    "scripts/ci-relevance.mjs",
    "scripts/source-rules.mjs",
    "scripts/vitest-shards.mts",
    "site/e2e/voyage-presets.spec.ts",
    "site/e2e/toasts.ts",
    "site/src/pages/docs.tsx",
    "docs/decisions/2026-10-30-ouro-ax/evidence/xray-adopter-main.json",
    "docs/guides/testing.md",
    "README.md",
    "UPGRADING.md",
    "registry/ouro/components/ouro/dialog/dialog.test.tsx",
    "test/stories.tsx",
    "vitest.config.ts",
    "package.json",
    "a-new-folder/file.ts",
  ]) {
    assert.equal(runs("browser", [path]), true, path);
  }
  assert.equal(runs("browser", ["changes/dialog.md", "registry/ouro/lib/ouro/cn.ts"]), true, "one file they read runs them");
  assert.deepEqual(relevance("browser", []), { run: true, reasons: ["no changed file was found, so nothing can be ruled out"] });
});

test("Screens skips a change to tests, stories, specs, the test kit and setup, and other workflows", () => {
  const files = [
    "registry/ouro/components/ouro/dialog/dialog.test.tsx",
    "registry/ouro/components/ouro/dialog/dialog.touch.test.tsx",
    "registry/ouro/components/ouro/dialog/dialog.test-d.ts",
    "registry/ouro/components/ouro/dialog/dialog.stories.tsx",
    "registry/ouro/e2e/ouro/dialog.spec.ts",
    "registry/ouro/lib/ouro/testing/motion.ts",
    "site/e2e/stage.spec.ts",
    "site/e2e/toasts.ts",
    "site/test/toast-watch.test.tsx",
    "site/src/site.test.tsx",
    "feel/fixture/cases/history-prepend.tsx",
    "scripts/workflows.test.mjs",
    "test/stories.tsx",
    "test/__screenshots__/screenshots.visual.test.tsx/dialog-open-linux.png",
    "stories/reference/sheet-feel.stories.tsx",
    ".storybook/main.ts",
    ".github/workflows/ci.yml",
    "changes/dialog.md",
    "AGENTS.md",
  ];
  for (const path of files) assert.equal(runs("screens", [path]), false, path);
});

test("Screens runs for what the site build and Ouro check read, for a path nobody listed, and for an empty diff", () => {
  for (const path of [
    "registry/ouro/components/ouro/dialog/dialog.tsx",
    "registry/ouro/lib/ouro/cn.ts",
    "registry/ouro/lib/ouro/testing/vitest.ts",
    "registry/ouro/lib/ouro/testing/axe-version.ts",
    "registry/ouro/e2e/ouro-fixtures.ts",
    "registry/ouro/check/check.ts",
    "registry/ouro/theme/ouro-base.css",
    "site/e2e/voyage-presets.spec.ts",
    "site/src/voyage/home.tsx",
    "docs/Dialog.md",
    "docs/guides/testing.md",
    "scripts/gen-docs.mts",
    "scripts/source-rules.mjs",
    "scripts/agent-usability/runs/2026-10-15/results.md",
    "vitest.config.ts",
    "README.md",
    ".github/workflows/screens.yml",
    ".github/actions/check/action.yml",
    ".github/ouro-check.json",
    "pnpm-lock.yaml",
    "a-new-folder/file.ts",
  ]) {
    assert.equal(runs("screens", [path]), true, path);
  }
  assert.equal(runs("screens", []), true);
});

/**
 * The literal paths a file names, as repository paths: relative ones from its folder, `@/` ones
 * from the root, and bare ones as they are; a glob's wildcards stand for one name.
 */
function namedPaths(file, text) {
  const paths = [];
  for (const [, literal] of text.matchAll(/["'`]([\w@.*/-]+\/[\w@.*/-]+)["'`]/g)) {
    const path = literal.startsWith(".") ? posix.join(posix.dirname(file), literal) : literal.startsWith("@/") ? literal.slice(2) : literal;
    paths.push({ literal, path: path.replaceAll("**/", "").replaceAll("*", "x") });
  }
  return paths;
}

/**
 * The paths a reader names that its target's list says it never reads, and why that is sound:
 * a claim's source or check is read by the claims check, not by the site or the tests.
 */
const namedButUnread = {
  installs: {},
  heavy: {},
  browser: {
    "registry/ouro/lib/ouro/claims.test.ts scripts/agent-usability/runs/2026-10-15/results.md": "a claim source the test parses as text",
    "site/src/voyage/stage/copy.ts site/e2e/stage.spec.ts": "a claim's source and check, read by the claims check",
    "site/src/copy.ts site/e2e/stage.spec.ts": "a claim's source and check, read by the claims check",
    ...Object.fromEntries(
      ["chapter-one", "chapter-three", "chapter-two", "stage"].map((spec) => [`site/scripts/stage-census.mts site/e2e/${spec}.spec.ts`, "the control census, which only its Node test runs"]),
    ),
    "test/screenshots.visual.test.tsx ./__screenshots__/screenshots.visual.test.tsx/*-linux.png": "the visual project, which runs only with CI_VISUAL=1, in the visual job",
  },
  screens: {
    ...Object.fromEntries(
      ["registry/ouro/e2e/ouro/", "registry/ouro/e2e/screen-reader/", "registry/ouro/lib/ouro/testing/", "registry/ouro/theme/theme.test.tsx", "registry/ouro/theme/round-parts.test.tsx", "registry/ouro/theme/radius-fallback.test.tsx", "registry/ouro/theme/squircle-surface.test.tsx", "registry/ouro/theme/control-shape.test.tsx", "registry/ouro/theme/hover-tokens.test.tsx", "registry/ouro/theme/plain-classes.touch.test.tsx"].map((path) => [
        `scripts/registry.mts ${path}`,
        "which item ships a test file, in registry.json's -tests items, whose files no page shows",
      ]),
    ),
    "scripts/registry.mts registry/ouro/e2e/mcp-app-host/": "the repository-only specs, which no item ships and no page shows",
    "scripts/registry.mts registry/ouro/e2e/probes/": "the repository-only probes, which no item ships and no page shows",
    "scripts/registry.mts feel/probe/probe.ts": "the source of the ouro-feel-probe item's script, which no page shows",
    ...Object.fromEntries(
      ["chapter-one", "chapter-three", "chapter-two", "stage"].map((spec) => [`site/scripts/stage-census.mts site/e2e/${spec}.spec.ts`, "the control census, which only its Node test runs, not the site build"]),
    ),
    "site/src/pages/docs.tsx site/src/site.test.tsx": "a claim's source and check, read by the claims check",
    "site/src/storybook.ts site/src/site.test.tsx": "a claim's source and check, read by the claims check",
    "site/src/routes.ts site/src/site.test.tsx": "a claim's source and check, read by the claims check",
    "site/src/routes.ts test/stories.test.tsx": "a claim's source and check, read by the claims check",
    "site/src/voyage/stage/copy.ts site/e2e/stage.spec.ts": "a claim's source and check, read by the claims check",
    "site/src/copy.ts site/e2e/stage.spec.ts": "a claim's source and check, read by the claims check",
    "site/src/docs/agent-prompt.ts test/install-fixture/package.json": "a claim's source and check, read by the claims check",
    "site/src/pages/docs.tsx test/install-fixture/package.json": "a claim's source and check, read by the claims check",
    "site/src/voyage/home-reference.tsx test/install-fixture/package.json": "a claim's source and check, read by the claims check",
  },
};

test("no reader of a target names a path its list says that target never reads, unless the exception says why", () => {
  const tracked = spawnSync("git", ["ls-files"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).stdout.split("\n").filter(Boolean);
  for (const [target, { readers, unread }] of Object.entries(targets)) {
    const found = new Set();
    for (const file of tracked.filter((path) => readers.some((reader) => reader.test(path)) && !unread.some(([pattern]) => pattern.test(path)))) {
      for (const { literal, path } of namedPaths(file, readFileSync(join(root, file), "utf8"))) {
        if (unread.some(([pattern]) => pattern.test(path))) found.add(`${file} ${literal}`);
      }
    }
    assert.deepEqual([...found].sort(), Object.keys(namedButUnread[target]).sort(), `${target}: a reader names a path the list skips; take it off the list, or say in namedButUnread why it is not read`);
  }
});

test("the command writes run=false only when it read the diff and every file is unread, and run=true on any failure", () => {
  const dir = scratchDir("ci-relevance-");
  const run = (args) => {
    const output = join(dir, `output-${Math.random()}`);
    const result = spawnSync(process.execPath, [join(root, "scripts/ci-relevance.mjs"), ...args], { cwd: root, encoding: "utf8", env: { ...process.env, GITHUB_OUTPUT: output } });
    return { status: result.status, out: result.stdout + result.stderr, output: readFileSync(output, "utf8") };
  };
  const empty = run(["browser", "HEAD", "HEAD"]);
  assert.equal(empty.status, 0);
  assert.equal(empty.output, "run=true\n");
  const unreadable = run(["screens", "no-such-commit", "HEAD"]);
  assert.equal(unreadable.status, 0);
  assert.equal(unreadable.output, "run=true\n");
  assert.match(unreadable.out, /^git diff no-such-commit HEAD failed, so Screens run/);
  const unknown = run(["storybook", "HEAD^", "HEAD"]);
  assert.equal(unknown.status, 1);
  assert.equal(unknown.output, "run=true\n");
  assert.match(unknown.out, /^\[ouro-ui\] ci-relevance: unknown target or missing commits \(storybook HEAD\^ HEAD\)\. Fix: node scripts\/ci-relevance\.mjs <installs\|heavy\|browser\|screens> <base> <head>\.$/m);
});

test("the install test and the heavy tier run for every risky path, and skip only prose, fragments and script tests", () => {
  const risky = [
    "registry/ouro/components/ouro/button/button.tsx",
    "registry/ouro/theme/ouro-base.css",
    "package.json",
    "pnpm-lock.yaml",
    "site/src/styles.css",
    "scripts/install-test.sh",
    "scripts/registry.mts",
    ".github/workflows/ci.yml",
    "docs/button.md",
    "README.md",
    "some/unmapped/file.txt",
    "playwright.config.ts",
    "vitest.config.ts",
    "tsconfig.json",
    "app.css",
    ".github/ouro-check.json",
    "site/e2e/looks.ts",
    "registry/ouro/e2e/ouro/button.spec.ts",
  ];
  for (const target of ["installs", "heavy"]) {
    for (const file of risky) assert.equal(runs(target, [file]), true, `${target} must run for ${file}`);
    assert.equal(runs(target, ["changes/x.md", risky[0]]), true, `${target} runs when any file is risky`);
    assert.equal(runs(target, []), true, `${target} runs on an empty diff`);
    assert.equal(runs(target, ["changes/x.md", "AGENTS.md", "scripts/ci-budget.test.mjs", ".github/workflows/pages.yml"]), false, `${target} skips a quiet change`);
  }
});

test("every file under scripts/, test/ and .github/ is scoped to the tiers it reaches or explicitly runs everything", () => {
  const files = spawnSync("git", ["ls-files", "-z", "scripts", "test", ".github"], { cwd: root, encoding: "utf8" }).stdout.split("\0").filter(Boolean);
  assert.ok(files.length > 100);
  assert.deepEqual(files.filter((path) => !classify(path)), [], "put each new file in scoped or runsAll in scripts/ci-paths.mjs");
  for (const rule of scoped) assert.ok(files.some((path) => rule.pattern.test(path)), `${rule.pattern} matches no file`);
});

test("a change to a CI helper, a Node script test or another workflow starts no browser, install or heavy tier, and a path that reaches them still does", () => {
  for (const path of ["scripts/main-green.mjs", "scripts/workflows.test.mjs", ".github/workflows/release.yml", "test/__screenshots__/a/b-linux.png"]) {
    assert.equal(runs("browser", [path]), false, path);
    assert.equal(runs("installs", [path]), false, path);
  }
  assert.equal(runs("heavy", ["scripts/main-green.mjs"]), false);
  assert.equal(runs("heavy", ["scripts/latency-shards.mjs"]), true);
  assert.equal(runs("browser", ["scripts/shard.mjs"]), true);
  assert.equal(runs("installs", ["scripts/install-test.sh"]), true);
  assert.equal(runs("browser", ["scripts/gen-docs.mts"]), true);
});

test("Ouro Current reaches the install test and no browser, design or heavy tier", () => {
  for (const path of ["scripts/current/pins.mjs", "scripts/current/stylesheet.mjs", "scripts/current/current.mjs", "scripts/current/README.md", "scripts/current/fixtures/ouro-base-v1.3.244.json"]) {
    assert.equal(runs("installs", [path]), true, path);
    for (const target of ["browser", "screens", "heavy"]) assert.equal(runs(target, [path]), false, `${target} ${path}`);
  }
});

test("the platform parity data reaches the site and the heavy tier but no install and no component's tests", () => {
  for (const path of ["scripts/parity-data/versions.json", "scripts/parity-data/platforms.json", "scripts/parity-data/provenance.json", "scripts/parity-data/components.claims.json"]) {
    assert.equal(runs("installs", [path]), false, path);
    assert.equal(runs("browser", [path]), true, path);
    assert.equal(runs("screens", [path]), true, path);
    assert.equal(runs("heavy", [path]), true, path);
  }
});

test("the heavy tier skips a docs pin and runs for a pin that changes anything else", () => {
  const dir = realpathSync(scratchDir("ci-pin-"));
  mkdirSync(join(dir, "scripts"), { recursive: true });
  for (const file of ["ci-relevance.mjs", "ci-paths.mjs", "pin-only.mjs", "latest-release.mjs"]) copyFileSync(join(root, "scripts", file), join(dir, "scripts", file));
  const git = (...args) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd: dir, encoding: "utf8" });
  git("init", "-q");
  writeFileSync(join(dir, "package.json"), JSON.stringify({ description: "x v1.0.0", ouro: { latestRelease: "v1.0.0" } }));
  writeFileSync(join(dir, "README.md"), "npm i ouro#v1.0.0\n");
  git("add", ".");
  git("commit", "-q", "-m", "base");
  const heavy = (base, head) => {
    const output = join(dir, "out");
    rmSync(output, { force: true });
    const res = spawnSync(process.execPath, [join(dir, "scripts/ci-relevance.mjs"), "heavy", base, head], { cwd: dir, encoding: "utf8", env: { ...process.env, GITHUB_OUTPUT: output } });
    return existsSync(output) ? readFileSync(output, "utf8") : res.stderr + res.stdout;
  };
  writeFileSync(join(dir, "package.json"), JSON.stringify({ description: "x v1.1.0", ouro: { latestRelease: "v1.1.0" } }));
  writeFileSync(join(dir, "README.md"), "npm i ouro#v1.1.0\n");
  git("commit", "-q", "-am", "pin");
  assert.equal(heavy("HEAD~1", "HEAD"), "run=false\n");
  writeFileSync(join(dir, "README.md"), "npm i ouro#v1.1.0\nand more words\n");
  git("commit", "-q", "-am", "prose");
  assert.equal(heavy("HEAD~1", "HEAD"), "run=true\n", "a README edit is not a pin");
  writeFileSync(join(dir, "package.json"), JSON.stringify({ description: "x v1.2.0", ouro: { latestRelease: "v1.2.0" }, scripts: { a: "b" } }));
  git("commit", "-q", "-am", "pin plus script");
  assert.equal(heavy("HEAD~1", "HEAD"), "run=true\n", "a pin that also changes package.json's other fields runs the heavy tier");
});
