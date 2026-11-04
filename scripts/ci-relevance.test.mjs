import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { relevance, targets } from "./ci-relevance.mjs";
import { scratchDir } from "./scratch.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const runs = (target, files) => relevance(target, files).run;

test("the browser shards skip a change to change fragments, Node script tests, end-to-end specs, baselines and other workflows", () => {
  const files = [
    "changes/dialog.md",
    "AGENTS.md",
    "flows/sign-in.yml",
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
  browser: {
    "registry/ouro/lib/ouro/claims.test.ts scripts/agent-usability/runs/2026-10-15/results.md": "a claim source the test parses as text",
    "site/src/voyage/stage/copy.ts site/e2e/stage.spec.ts": "a claim's source and check, read by the claims check",
    ...Object.fromEntries(
      ["chapter-one", "chapter-three", "chapter-two", "stage"].map((spec) => [`site/scripts/stage-census.mts site/e2e/${spec}.spec.ts`, "the control census, which only its Node test runs"]),
    ),
    "test/screenshots.visual.test.tsx ./__screenshots__/screenshots.visual.test.tsx/*-linux.png": "the visual project, which runs only with CI_VISUAL=1, in the visual job",
  },
  screens: {
    ...Object.fromEntries(
      ["registry/ouro/e2e/ouro/", "registry/ouro/e2e/screen-reader/", "registry/ouro/lib/ouro/testing/", "registry/ouro/theme/theme.test.tsx"].map((path) => [
        `scripts/registry.mts ${path}`,
        "which item ships a test file, in registry.json's -tests items, whose files no page shows",
      ]),
    ),
    ...Object.fromEntries(
      ["chapter-one", "chapter-three", "chapter-two", "stage"].map((spec) => [`site/scripts/stage-census.mts site/e2e/${spec}.spec.ts`, "the control census, which only its Node test runs, not the site build"]),
    ),
    "site/src/pages/docs.tsx site/src/site.test.tsx": "a claim's source and check, read by the claims check",
    "site/src/routes.ts site/src/site.test.tsx": "a claim's source and check, read by the claims check",
    "site/src/voyage/stage/copy.ts site/e2e/stage.spec.ts": "a claim's source and check, read by the claims check",
    "site/src/pages/docs.tsx test/install-fixture/package.json": "a claim's source and check, read by the claims check",
    "site/src/voyage/home-reference.tsx test/install-fixture/package.json": "a claim's source and check, read by the claims check",
  },
};

test("no reader of a target names a path its list says that target never reads, unless the exception says why", () => {
  const tracked = spawnSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).stdout.split("\n").filter(Boolean);
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
  assert.match(unknown.out, /^\[ouro-ui\] ci-relevance: unknown target or missing commits \(storybook HEAD\^ HEAD\)\. Fix: node scripts\/ci-relevance\.mjs <browser\|screens> <base> <head>\.$/m);
});
