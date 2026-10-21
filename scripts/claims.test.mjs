import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  applyAllowed,
  checkClaims,
  isInstruction,
  lintMarkdown,
  lintPlain,
  lintTypeScript,
  readMarkdown,
  surfaces,
  testNames,
  triggers,
  verify,
} from "./claims.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(repo, "scripts/claims.mjs");

/** A throwaway repository under .tmp/ (ignored), holding `files`. */
function fixture(files) {
  mkdirSync(join(repo, ".tmp"), { recursive: true });
  const dir = mkdtempSync(join(repo, ".tmp/claims-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

const kinds = (sentence) => triggers(sentence).map((found) => found.kind);

test("triggers: numbers, versions, dates and the words that make a sentence a factual claim", () => {
  assert.deepEqual(kinds("Ships 73 components."), ["number"]);
  assert.deepEqual(kinds("Needs Node 22.18 or later."), ["version"]);
  assert.deepEqual(kinds("Released on 2026-10-15."), ["date"]);
  assert.deepEqual(kinds("Released in October 2026."), ["date"]);
  assert.deepEqual(kinds("Each tap is tested in real browsers."), ["tested"]);
  assert.deepEqual(kinds("The dialog is fully accessible."), ["accessible"]);
  assert.deepEqual(kinds("Every story passes."), ["every"]);
  assert.deepEqual(kinds("It covers everything."), ["every"]);
  assert.deepEqual(kinds("They all pass."), ["all"]);
  assert.deepEqual(kinds("Works with Next.js."), ["works with"]);
  assert.deepEqual(kinds("It supports right-to-left text."), ["supports"]);
  assert.deepEqual(kinds("The fastest sheet."), ["superlative"]);
  assert.deepEqual(kinds("Most apps need one."), ["superlative"]);
});

test("triggers: code, links, accessible names and plain descriptions are not claims", () => {
  assert.deepEqual(kinds("Pass `size=\"lg\"` to the button."), []);
  assert.deepEqual(kinds("Set the accessible name with a label."), []);
  assert.deepEqual(kinds("Shows at most this many avatars."), []);
  assert.deepEqual(kinds("The close button sits in the corner."), []);
  assert.deepEqual(kinds("Read [the guide](docs/guides/testing.md)."), []);
  assert.deepEqual(kinds("Read https://example.com/v2/page."), []);
});

test("instructions are allowed: imperatives, conditional imperatives and questions", () => {
  assert.ok(isInstruction("Run pnpm test before every push."));
  assert.ok(isInstruction("Don't add every class."));
  assert.ok(isInstruction("If a check fails, run it again with --network."));
  assert.ok(isInstruction("To refresh all baselines, run the workflow."));
  assert.ok(isInstruction("For each arm, each screen and each run, make a workspace."));
  assert.ok(isInstruction("Why not plain never?"));
  assert.ok(!isInstruction("Every check runs in CI."));
  assert.ok(!isInstruction("If a check fails, the job fails."));
});

const messages = (findings) => findings.map((finding) => `${finding.line}: ${finding.message}`);

test("Markdown: an unsourced factual sentence fails with its line and the source it needs", () => {
  const findings = lintMarkdown("# Title\n\nOuro HX ships 73 components. Install it with the CLI.\n\n- Every story passes axe.\n", { file: "README.md" });
  assert.equal(findings.length, 2);
  assert.match(findings[0].message, /^README\.md:3: "Ouro HX ships 73 components\." states a number/);
  assert.match(findings[0].message, /count\(registry:ui\)=<n>|fileLine|equals/);
  assert.match(findings[1].message, /^README\.md:5: "Every story passes axe\." makes a universal claim/);
  assert.match(findings[1].message, /testExists/);
});

test("Markdown: a source link with a verify: title makes its sentence a claim", () => {
  const text = 'Ouro HX ships [73 components](registry.json "verify:count(registry:ui)=73"). Every check runs in CI.\n';
  const findings = lintMarkdown(text, { file: "README.md" });
  assert.deepEqual(findings.map((finding) => finding.sentence), ["Every check runs in CI."]);
  const { claims } = readMarkdown(text, { file: "README.md" });
  assert.deepEqual(claims, [{ file: "README.md", line: 1, text: "Ouro HX ships [73 components](registry.json \"verify:count(registry:ui)=73\").", sources: [{ file: "registry.json" }], checks: [{ count: "registry:ui", is: 73 }] }]);
});

test("Markdown: a footnote with verify: lines covers each sentence that cites it", () => {
  const text = [
    "Every story passes axe.[^axe] It runs in Chromium and WebKit.[^axe]",
    "",
    "[^axe]: test/stories.test.tsx; https://github.com/ourostack/ouro-ui/actions/runs/1 verify:ciJob(ci) verify:fileLine(test/stories.test.tsx, /axe/)",
    "",
  ].join("\n");
  assert.deepEqual(lintMarkdown(text, { file: "AGENTS.md" }), []);
  const { claims } = readMarkdown(text, { file: "AGENTS.md" });
  assert.equal(claims.length, 2);
  assert.deepEqual(claims[0].sources, [{ file: "test/stories.test.tsx" }, { ciRun: "https://github.com/ourostack/ouro-ui/actions/runs/1" }]);
  assert.deepEqual(claims[0].checks, [{ ciJob: "ci" }, { fileLine: "test/stories.test.tsx", pattern: "axe" }]);
});

test("Markdown: a malformed or unverified claim marker is an error, not a pass", () => {
  const missing = lintMarkdown("Every story passes.[^gone]\n", { file: "a.md" });
  assert.match(messages(missing)[0], /\[\^gone\] has no definition/);
  const noCheck = lintMarkdown("Every story passes.[^a]\n\n[^a]: test/stories.test.tsx\n", { file: "a.md" });
  assert.match(messages(noCheck)[0], /\[\^a\] has no verify: check/);
  const badCheck = lintMarkdown('Ships [73 components](registry.json "verify:trust(me)").\n', { file: "a.md" });
  assert.match(messages(badCheck)[0], /"trust\(me\)" is not a check/);
});

test("Markdown: code, generated regions and tables are read; headings are labels", () => {
  const text = [
    "```sh",
    "pnpm add every 73 things",
    "```",
    "<!-- catalog:start -->",
    "Every component is listed here.",
    "<!-- catalog:end -->",
    "## Every run",
    "",
    "| Arm | Score |",
    "| --- | ---: |",
    "| shadcn/ui | 100/100 |",
    "",
  ].join("\n");
  const findings = lintMarkdown(text, { file: "README.md", skip: ["catalog"] });
  // A heading is a label (a claim marker would change its anchor), so only the table cell fails.
  assert.deepEqual(findings.map((finding) => [finding.line, finding.sentence]), [[11, "100/100"]]);
});

test("plain text (a pull request title) is linted as one paragraph", () => {
  assert.equal(lintPlain("Fix the dialog's focus", { file: "pull request title" }).length, 0);
  assert.match(lintPlain("All 73 components pass axe", { file: "pull request title" })[0].message, /^pull request title:1: "All 73 components pass axe"/);
});

test("JSDoc: an @claim tag covers its comment; an unsourced factual comment fails", () => {
  const source = [
    "export { A, B };",
    "/**",
    " * Every row is 44px tall on a coarse pointer.",
    " *",
    " * @claim registry/a.tsx verify:fileLine(registry/a.tsx, /min-h-11/)",
    " * @example",
    " * <A rows={3} />",
    " */",
    "function A() { return null; }",
    "/** Every row is 44px tall on a coarse pointer. @default 3 */",
    "function B() { return null; }",
  ].join("\n");
  const { findings, claims } = lintTypeScript(source, { file: "registry/a.tsx", jsdoc: true });
  assert.deepEqual(findings.map((finding) => finding.line), [10]);
  assert.equal(claims.length, 1);
  assert.equal(claims[0].line, 2);
  assert.deepEqual(claims[0].checks, [{ fileLine: "registry/a.tsx", pattern: "min-h-11" }]);
});

test("TypeScript copy: claim() calls are claims, unsourced prose literals and JSX text fail", () => {
  const source = [
    'import { claim } from "@/registry/ouro/lib/ouro/claims";',
    'export const LINE = claim("Every tap is tested in real browsers.", { source: { file: "test/stories.test.tsx" }, verify: [{ ciJob: "ci" }] });',
    'export const BADGE = "Works with shadcn/ui";',
    'export const LABEL = "Copy the install command";',
    'export const CLASS = "rounded-lg px-4 py-2";',
    "export function Hero() {",
    '  return <p className="text-lg">Ships 73 components.</p>;',
    "}",
    'export const BAD = claim("Every row.", { source: { file: SOURCE }, verify: [] });',
  ].join("\n");
  const { findings, claims } = lintTypeScript(source, { file: "site/src/copy.tsx", copy: true });
  assert.deepEqual(findings.map((finding) => [finding.line, finding.sentence]), [
    [3, "Works with shadcn/ui"],
    [7, "Ships 73 components."],
    [9, "Every row."],
  ]);
  assert.match(findings[2].message, /claim\(\)'s arguments must be literals/);
  assert.equal(claims.length, 1);
  assert.deepEqual(claims[0].checks, [{ ciJob: "ci" }]);
});

test("testNames: full test names, nested with ' > ', and whether each is skipped", () => {
  const names = testNames([
    'describe("Button", () => {',
    '  it("shows a spinner", () => {});',
    '  it.skip("is skipped", () => {});',
    '  describe.todo("later");',
    '  test(`plain template`, () => {});',
    '  test(`computed ${x}`, () => {});',
    "});",
    'test("top", () => {});',
  ].join("\n"), "a.test.tsx");
  assert.deepEqual(names, new Map([
    ["Button", { skipped: false }],
    ["Button > shows a spinner", { skipped: false }],
    ["Button > is skipped", { skipped: true }],
    ["Button > later", { skipped: true }],
    ["Button > plain template", { skipped: false }],
    ["top", { skipped: false }],
  ]));
});

function verifyFixture() {
  return fixture({
    "package.json": JSON.stringify({ ouro: { latestRelease: "v1.1.0" }, scripts: { "test:scripts": "node --test scripts/a.test.mjs" } }),
    "registry.json": JSON.stringify({ items: [{ type: "registry:ui" }, { type: "registry:ui" }, { type: "registry:lib" }] }),
    ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    runs-on: ubuntu-latest\n  e2e:\n    name: end to end\n    runs-on: ubuntu-latest\n",
    "registry/ouro/components/ouro/a/a.test.tsx": 'describe("A", () => { it("works", () => {}); it.skip("later", () => {}); });\n',
    "registry/ouro/e2e/screen-reader/a.sr.spec.ts": 'test("speaks", async () => {});\n',
    "scripts/a.test.mjs": 'test("script works", () => {});\n',
    "scripts/b.test.mjs": 'test("not listed", () => {});\n',
    "screens/one/task.md": "",
    "screens/two/task.md": "",
    "app.css": "@import \"ouro-base.css\";\n.a { color: red; }\n",
    "claims-urls.json": JSON.stringify({ "https://example.com/ok": { status: 200, checked: "2026-10-20" }, "https://example.com/gone": { status: 404, checked: "2026-10-20" } }),
  });
}

test("verify: each check passes on what holds and explains what does not", async () => {
  const root = verifyFixture();
  const context = { root, urlCache: "claims-urls.json", network: false };
  const failures = async (check) => (await verify([check], context)).map((failure) => failure.message);
  assert.deepEqual(await failures({ count: "registry:ui", is: 2 }), []);
  assert.match((await failures({ count: "registry:ui", is: 73 }))[0], /counts 2, not 73/);
  assert.deepEqual(await failures({ count: "registry.json#items", is: 3 }), []);
  assert.deepEqual(await failures({ count: "dir:screens", is: 2 }), []);
  assert.match((await failures({ count: "nothing", is: 1 }))[0], /registry:<type>, dir:<path> or <file>#<field path>/);
  assert.deepEqual(await failures({ equals: "package.json#ouro.latestRelease", is: "v1.1.0" }), []);
  assert.match((await failures({ equals: "package.json#ouro.latestRelease", is: "v2.0.0" }))[0], /is "v1\.1\.0", not "v2\.0\.0"/);
  assert.match((await failures({ equals: "package.json#ouro.missing", is: "x" }))[0], /has no ouro\.missing/);
  assert.deepEqual(await failures({ fileLine: "app.css", pattern: "ouro-base" }), []);
  assert.deepEqual(await failures({ fileLine: "app.css", line: 2, pattern: "color" }), []);
  assert.match((await failures({ fileLine: "app.css", line: 1, pattern: "color" }))[0], /app\.css:1 does not match \/color\//);
  assert.match((await failures({ fileLine: "gone.css", pattern: "x" }))[0], /gone\.css does not exist/);
  assert.deepEqual(await failures({ ciJob: "ci" }), []);
  assert.deepEqual(await failures({ ciJob: "end to end", workflow: "ci.yml" }), []);
  assert.match((await failures({ ciJob: "deploy" }))[0], /No workflow defines a job "deploy"; jobs: ci, e2e/);
  assert.deepEqual(await failures({ testExists: "registry/ouro/components/ouro/a/a.test.tsx::A > works" }), []);
  assert.deepEqual(await failures({ testExists: "scripts/a.test.mjs::script works" }), []);
  assert.match((await failures({ testExists: "registry/ouro/components/ouro/a/a.test.tsx::A > later" }))[0], /is skipped/);
  assert.match((await failures({ testExists: "registry/ouro/components/ouro/a/a.test.tsx::A > wroks" }))[0], /has no test "A > wroks"; it has: A, A > works/);
  assert.match((await failures({ testExists: "scripts/b.test.mjs::not listed" }))[0], /no required CI job runs scripts\/b\.test\.mjs/);
  assert.match((await failures({ testExists: "registry/ouro/e2e/screen-reader/a.sr.spec.ts::speaks" }))[0], /no required CI job runs/);
  assert.deepEqual(await failures({ urlOk: "https://example.com/ok" }), []);
  assert.match((await failures({ urlOk: "https://example.com/gone" }))[0], /answered 404/);
  assert.match((await failures({ urlOk: "https://example.com/new" }))[0], /pnpm claims:check --network/);
});

test("verify: sources must exist where they can be checked offline", async () => {
  const root = verifyFixture();
  const context = { root, urlCache: "claims-urls.json", network: false };
  const failures = async (sources) => (await verify([], context, sources)).map((failure) => failure.message);
  assert.deepEqual(await failures([{ file: "app.css", line: 2 }, { evidence: "screens/one/task.md" }, { spec: "https://www.w3.org/TR/WCAG22/" }]), []);
  assert.match((await failures([{ file: "app.css", line: 9 }]))[0], /app\.css has 2 lines, not 9/);
  assert.match((await failures([{ evidence: "gone.json" }]))[0], /gone\.json does not exist/);
  assert.match((await failures([{ test: "scripts/a.test.mjs::nope" }]))[0], /has no test "nope"/);
  assert.match((await failures([{ spec: "https://github.com/ourostack/ouro-ui/blob/main/gone.md" }]))[0], /gone\.md does not exist/);
  assert.deepEqual(await failures([{ spec: "https://github.com/ourostack/ouro-ui/blob/main/app.css#L2" }]), []);
});

test("surfaces: every tracked prose file is linted or declared generated, evidence or input with a reason", () => {
  const listed = surfaces(repo);
  for (const entry of listed) assert.ok(entry.mode === "lint" || entry.reason, `${entry.file} is ${entry.mode} with no reason`);
  const mode = (file) => listed.find((entry) => entry.file === file)?.mode;
  assert.equal(mode("README.md"), "lint");
  assert.equal(mode("AGENTS.md"), "lint");
  assert.equal(mode("site/public/llms.txt"), "lint");
  assert.equal(mode("docs/Button.md"), "generated");
  assert.equal(mode("registry/ouro/lib/ouro/claims.ts"), "lint");
  assert.equal(mode("site/src/copy.ts"), "lint");
});

test("the allow-list drops exact story sentences, and an entry that matches nothing fails", () => {
  const allowed = [{ file: "a.ts", sentence: "All stop.", reason: "story" }, { file: "a.ts", sentence: "Gone.", reason: "story" }];
  const findings = [{ file: "a.ts", sentence: "All stop.", kinds: ["all"], message: "m" }, { file: "a.ts", sentence: "All go.", kinds: ["all"], message: "n" }];
  const result = applyAllowed(findings, allowed);
  assert.deepEqual(result.findings.map((finding) => finding.sentence), ["All go."]);
  assert.match(result.unused[0].message, /"Gone\." \(a\.ts\) matches no finding any more/);
  // A malformed claim is never allowed, only an unsourced sentence.
  assert.equal(applyAllowed([{ file: "a.ts", sentence: "All stop.", message: "bad claim" }], allowed).findings.length, 1);
});

test("checkClaims over a fixture: the CLI fails on an unsourced claim, then passes once it is sourced", () => {
  const root = fixture({
    "package.json": "{}",
    "registry.json": JSON.stringify({ items: [{ type: "registry:ui" }] }),
    "README.md": "# Fixture\n\nShips 1 component.\n",
  });
  const run = () => spawnSync(process.execPath, [script, "check", "--root", root], { encoding: "utf8" });
  const failed = run();
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /README\.md:3: "Ships 1 component\." states a number/);
  writeFileSync(join(root, "README.md"), '# Fixture\n\nShips [1 component](registry.json "verify:count(registry:ui)=1").\n');
  const passed = run();
  assert.equal(passed.status, 0, passed.stderr);
  assert.match(passed.stdout, /1 claim verified/);
  writeFileSync(join(root, "README.md"), '# Fixture\n\nShips [2 components](registry.json "verify:count(registry:ui)=2").\n');
  const stale = run();
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /README\.md:3: .*counts 1, not 2/);
});

test("the lint command reads a pull request's title and body from the environment", () => {
  const run = (title, body) => spawnSync(process.execPath, [script, "lint", "--pr"], { encoding: "utf8", cwd: repo, env: { ...process.env, PR_TITLE: title, PR_BODY: body } });
  assert.equal(run("Fix the dialog's focus", "Moves focus back to the trigger.").status, 0);
  const failed = run("Fix the dialog's focus", "Every test passes now.");
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /pull request body:1: "Every test passes now\." makes a universal claim/);
});

test("checkClaims over the repository: every surface passes", async () => {
  const result = await checkClaims({ root: repo, network: false });
  assert.deepEqual(result.failures.map((failure) => failure.message).slice(0, 20), []);
});
