import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  applyAllowed,
  checkClaims,
  classify,
  loadConfig,
  policyProblems,
  urlCacheReview,
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
  assert.deepEqual(kinds("Each tap is tested in real browsers."), ["tested", "each"]);
  assert.deepEqual(kinds("The dialog is fully accessible."), ["accessible", "fully"]);
  assert.deepEqual(kinds("Every story passes."), ["every"]);
  assert.deepEqual(kinds("It covers everything."), ["every"]);
  assert.deepEqual(kinds("They all pass."), ["all"]);
  assert.deepEqual(kinds("Works with Next.js."), ["works with"]);
  assert.deepEqual(kinds("It supports right-to-left text."), ["supports"]);
  assert.deepEqual(kinds("The fastest sheet."), ["superlative"]);
  assert.deepEqual(kinds("Most apps need one."), ["superlative"]);
});

test("triggers: spelled-out numbers, each, no and zero, always and never, and fully", () => {
  assert.deepEqual(kinds("Three themes ship with it."), ["number"]);
  assert.deepEqual(kinds("A dozen helpers come along."), ["number"]);
  assert.deepEqual(kinds("Each component has a test."), ["each"]);
  assert.deepEqual(kinds("No component imports it."), ["no"]);
  assert.deepEqual(kinds("Zero warnings remain."), ["no"]);
  assert.deepEqual(kinds("It always restores focus."), ["always"]);
  assert.deepEqual(kinds("It never loses focus."), ["always"]);
  assert.deepEqual(kinds("Fully keyboard operable."), ["fully"]);
  // A word that only looks like one of them is not.
  assert.deepEqual(kinds("Someone noted the notice."), []);
  // A digit inside a name (e2e, h1) is not a number, but v2, x4 and 44px are.
  assert.deepEqual(kinds("The specs in e2e/ouro open the stories in an h1."), []);
  assert.deepEqual(kinds("Release v2 is x4 faster."), ["number"]);
  assert.deepEqual(kinds("Rows are 44px tall."), ["number"]);
});

test("bypasses: noun-verbs, quotations, headings and spelled-out claims are caught", () => {
  const sentences = [
    "Test coverage is 100% on every component.",
    "Release 2.0 shipped with every fix.",
    "Build time is 3 minutes on CI.",
    "Record: all 73 components pass axe.",
    "Note that everything is tested in WebKit.",
    'The README says "All 73 components pass axe in every browser".',
    "## 73 components, all tested and accessible",
    "Three themes ship with it.",
    "Each component passes axe.",
    "No story fails axe.",
    "Focus always returns to the trigger.",
  ];
  for (const sentence of sentences) assert.equal(lintMarkdown(`${sentence}\n`, { file: "a.md" }).length, 1, sentence);
  // What stays allowed: real instructions, label quotations and plain headings.
  assert.ok(isInstruction("Test the dialog in WebKit."));
  assert.ok(isInstruction("Release the lock before every push."));
  assert.ok(isInstruction("Note the version you installed."));
  assert.deepEqual(lintMarkdown('The button reads "3 days ago".\n\n## Use instead when\n', { file: "a.md" }), []);
});

test("triggers: code, links, accessible names and plain descriptions are not claims", () => {
  assert.deepEqual(kinds("Pass `size=\"lg\"` to the button."), []);
  assert.deepEqual(kinds("Set the accessible name with a label."), []);
  assert.deepEqual(kinds("Shows at most this many avatars."), []);
  assert.deepEqual(kinds("The close button sits in the corner."), []);
  assert.deepEqual(kinds("Read [the guide](docs/guides/testing.md)."), []);
  assert.deepEqual(kinds("Read https://example.com/v2/page."), []);
  // A quotation mentions text (a label, an example of output); it asserts nothing.
  assert.deepEqual(kinds('Shows "3 days ago" or "in 5 minutes".'), []);
  assert.deepEqual(kinds('Shows "3 days ago" for every date.'), ["every"]);
  // A quotation that is itself a claim is read.
  assert.deepEqual(kinds('It says "every story passes".'), ["every"]);
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
  assert.ok(!isInstruction("Test coverage is 100% on every component."));
  assert.ok(!isInstruction("Release 2.0 shipped with every fix."));
  assert.ok(!isInstruction("Build time is 3 minutes on CI."));
  assert.ok(!isInstruction("Record: all 73 components pass axe."));
  assert.ok(!isInstruction("Note that everything is tested in WebKit."));
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

test("Markdown: code is not read; generated regions, headings and tables are", () => {
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
    "| Prop | Default | Description |",
    "| --- | --- | --- |",
    "| `max` | none | Shows every avatar. |",
    "| `size` | every one | Tested in every browser |",
    "",
  ].join("\n");
  const findings = lintMarkdown(text, { file: "README.md" });
  // A table cell of a word or two is a value ("none"); a longer one, or one with a number, is read.
  assert.deepEqual(findings.map((finding) => [finding.line, finding.sentence]), [
    [5, "Every component is listed here."],
    [7, "Every run"],
    [11, "100/100"],
    [15, "Shows every avatar."],
    [16, "Tested in every browser"],
  ]);
});

test("a list item labelled with a name in code may be an instruction, and carry-over ignores a link's padding", () => {
  assert.deepEqual(lintMarkdown("- `pageCount`: Leave it out when the list has no count.\n", { file: "a.md" }), []);
  assert.equal(lintMarkdown("- `pageCount`: Every page has a count.\n", { file: "a.md" }).length, 1);
});

test("plain text (a pull request title) is linted as one paragraph", () => {
  assert.equal(lintPlain("Fix the dialog's focus", { file: "pull request title" }).length, 0);
  assert.match(lintPlain("All 73 components pass axe", { file: "pull request title" })[0].message, /^pull request title:1: "All 73 components pass axe"/);
});

test("JSDoc: a default's prose is a sentence the docs table shows, and its value is code", () => {
  const source = [
    "export { A };",
    "interface P {",
    '  /** The role in a form. @default "button" (never submits a form by accident) */',
    "  type?: string;",
    "  /** Days to wait. @default 14 */",
    "  days?: number;",
    "  /** The open item. @default none */",
    "  open?: string;",
    '  /** What it says. @default (count) => `${count} more, each one tested` */',
    "  say?: (count: number) => string;",
    "  /**",
    "   * The size.",
    "   * @default derived from `level` (1 is `2xl`, 2 is `xl`)",
    '   * @claim "1 is" registry/a.tsx verify:fileLine(registry/a.tsx, /level/)',
    "   */",
    "  size?: string;",
    "}",
    "function A(props: P) { return null; }",
  ].join("\n");
  const { findings, claims } = lintTypeScript(source, { file: "registry/a.tsx", jsdoc: true });
  assert.deepEqual(findings.map((finding) => [finding.line, finding.sentence]), [[3, "(never submits a form by accident)"]]);
  assert.equal(claims.length, 1);
  assert.match(claims[0].text, /^derived from `level` \(1 is `2xl`/);
});

test("JSDoc: an @claim tag covers the sentence it quotes, not the whole comment", () => {
  const source = [
    "export { A, B, C };",
    "/**",
    " * Every row is 44px tall on a coarse pointer. All rows are tested in WebKit.",
    " *",
    ' * @claim "44px tall on a coarse pointer" registry/a.tsx verify:fileLine(registry/a.tsx, /min-h-11/)',
    " * @example",
    " * <A rows={3} />",
    " */",
    "function A() { return null; }",
    "/** Every row is 44px tall on a coarse pointer. @default 3 */",
    "function B() { return null; }",
    "/**",
    " * Every row is 44px tall.",
    " *",
    " * @claim registry/a.tsx verify:fileLine(registry/a.tsx, /min-h-11/)",
    ' * @claim "not in the comment" registry/a.tsx verify:fileLine(registry/a.tsx, /min-h-11/)',
    " */",
    "function C() { return null; }",
  ].join("\n");
  const { findings, claims } = lintTypeScript(source, { file: "registry/a.tsx", jsdoc: true });
  assert.deepEqual(findings.map((finding) => [finding.line, finding.sentence]), [
    [3, "All rows are tested in WebKit."],
    [10, "Every row is 44px tall on a coarse pointer."],
    [15, "@claim"],
    [16, "@claim"],
    [13, "Every row is 44px tall."],
  ]);
  assert.match(findings[2].message, /quote the words of the sentence it backs/);
  assert.match(findings[3].message, /"not in the comment" is in no sentence of this comment/);
  assert.equal(claims.length, 1);
  assert.equal(claims[0].text, "Every row is 44px tall on a coarse pointer.");
  assert.equal(claims[0].line, 3);
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

test("TypeScript copy: Markdown templates, lowercase and unpunctuated strings and comma templates are read", () => {
  const source = [
    "const n = 73;",
    "export const COEXIST = `",
    "## Both live in one app",
    "",
    'Ouro HX adds \\`--ouro-layer\\` in \\`ouro-base.css\\`: the z-index of its overlays, 50, as in shadcn\'s.',
    "`;",
    'export const ITEM = { label: "tested in every browser" };',
    'export const NOTE = "accessible in every theme";',
    "export const LINE = `Ships ${n} components, all tested.`;",
    'export const MODE = "all";',
    'if (MODE === "every") console.log("x");',
  ].join("\n");
  const { findings } = lintTypeScript(source, { file: "site/src/pages/docs.tsx", copy: true });
  assert.deepEqual(findings.map((finding) => [finding.line, finding.sentence]), [
    [5, 'Ouro HX adds `--ouro-layer` in `ouro-base.css`: the z-index of its overlays, 50, as in shadcn\'s.'],
    [7, "tested in every browser"],
    [8, "accessible in every theme"],
    [9, "Ships ${n} components, all tested."],
  ]);
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
    // A table of cases is one test named as written, %s and all, as Vitest's filter matches it.
    'describe.each([["a"]])("%s parts", () => {',
    '  it.each([["b"]])("throws for %s outside its root", () => {});',
    '  it.skip.each([["c"]])("skips %s", () => {});',
    "});",
  ].join("\n"), "a.test.tsx");
  assert.deepEqual(names, new Map([
    ["Button", { skipped: false }],
    ["Button > shows a spinner", { skipped: false }],
    ["Button > is skipped", { skipped: true }],
    ["Button > later", { skipped: true }],
    ["Button > plain template", { skipped: false }],
    ["top", { skipped: false }],
    ["%s parts", { skipped: false }],
    ["%s parts > throws for %s outside its root", { skipped: false }],
    ["%s parts > skips %s", { skipped: true }],
  ]));
});

function verifyFixture() {
  return fixture({
    "package.json": JSON.stringify({ ouro: { latestRelease: "v1.1.0" }, scripts: { "test:scripts": "node --test scripts/a.test.mjs" } }),
    "registry.json": JSON.stringify({ items: [{ type: "registry:ui" }, { type: "registry:ui" }, { type: "registry:lib" }] }),
    ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    runs-on: ubuntu-latest\n  e2e:\n    name: end to end\n    runs-on: ubuntu-latest\n  lane:\n    runs-on: ubuntu-latest\n",
    "registry/ouro/components/ouro/a/a.test.tsx": 'describe("A", () => { it("works", () => {}); it.skip("later", () => {}); });\n',
    "registry/ouro/e2e/screen-reader/a.sr.spec.ts": 'test("speaks", async () => {});\n',
    "scripts/a.test.mjs": 'test("script works", () => {});\n',
    "scripts/b.test.mjs": 'test("not listed", () => {});\n',
    "screens/one/task.md": "",
    "screens/two/task.md": "",
    "app.css": "@import \"ouro-base.css\";\n.a { color: red; }\n",
    "claims.config.json": JSON.stringify({
      urlCache: "claims-urls.json",
      requiredTests: [
        { match: "^(registry|test|site)/.*\\.test\\.tsx?$", job: "ci" },
        { match: "\\.test\\.m[jt]s$", job: "ci", listedIn: "package.json#scripts.test:scripts" },
      ],
    }),
    ".github/required-checks.json": JSON.stringify(["ci", "end to end"]),
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
  assert.match((await failures({ ciJob: "deploy" }))[0], /No workflow defines a job "deploy"; jobs: ci, e2e, lane/);
  // A job that is defined but not required proves nothing on a green main.
  assert.match((await failures({ ciJob: "lane" }))[0], /"lane" is not a required check \(\.github\/required-checks\.json: ci, end to end\)/);
  assert.deepEqual(await failures({ testExists: "registry/ouro/components/ouro/a/a.test.tsx::A > works" }), []);
  assert.deepEqual(await failures({ testExists: "scripts/a.test.mjs::script works" }), []);
  assert.match((await failures({ testExists: "registry/ouro/components/ouro/a/a.test.tsx::A > later" }))[0], /is skipped/);
  assert.match((await failures({ testExists: "registry/ouro/components/ouro/a/a.test.tsx::A > wroks" }))[0], /has no test "A > wroks"; it has: A, A > works/);
  assert.match((await failures({ testExists: "scripts/b.test.mjs::not listed" }))[0], /no required CI job runs scripts\/b\.test\.mjs/);
  assert.match((await failures({ testExists: "registry/ouro/e2e/screen-reader/a.sr.spec.ts::speaks" }))[0], /no required CI job runs/);
  assert.deepEqual(await failures({ urlOk: "https://example.com/ok" }), []);
  assert.match((await failures({ urlOk: "https://example.com/gone" }))[0], /answered 404/);
  assert.match((await failures({ urlOk: "https://example.com/new" }))[0], /has not been checked\. Run the check with --network/);
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
  assert.equal(mode("docs/Button.md"), "lint");
  assert.equal(mode("registry.json"), "lint");
  assert.equal(mode("docs/guides/why-no-skill.md"), "generated");
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

test("the lint command reads a draft from stdin under the name it is given", () => {
  const run = (input) => spawnSync(process.execPath, [script, "lint", "--stdin", "--name", "pull request body"], { encoding: "utf8", cwd: repo, input });
  assert.equal(run("Moves focus back to the trigger.").status, 0);
  const failed = run("Every test passes now.");
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /^pull request body:1: "Every test passes now\." makes a universal claim/);
});

test("checkClaims over the repository: every surface passes", async () => {
  const result = await checkClaims({ root: repo, network: false });
  assert.deepEqual(result.failures.map((failure) => failure.message).slice(0, 20), []);
});

test("ciJob reads the required checks at the base ref, so a pull request cannot add its own", async () => {
  const root = verifyFixture();
  const git = (...args) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
  git("init", "-q");
  git("-c", "user.email=a@b.c", "-c", "user.name=a", "add", ".");
  git("-c", "user.email=a@b.c", "-c", "user.name=a", "commit", "-qm", "base");
  writeFileSync(join(root, ".github/required-checks.json"), JSON.stringify(["ci", "end to end", "lane"]));
  const failures = async (context) => (await verify([{ ciJob: "lane" }], { root, urlCache: "claims-urls.json", ...context })).map((failure) => failure.message);
  assert.match((await failures({ baseRef: "HEAD" }))[0], /"lane" is not a required check/);
  assert.deepEqual(await failures({}), []);
});

test("generated surfaces are linted: registry.json, README regions and llms.txt items, with claims carried from their sources", async () => {
  const root = fixture({
    "package.json": "{}",
    "claims.config.json": JSON.stringify({
      surfaces: [{ match: "\\.(md|txt)$", mode: "markdown" }, { match: "^registry\\.json$", mode: "registry" }, { match: "^registry/.*\\.tsx?$", mode: "jsdoc" }],
      generated: ["^registry\\.json$", "^README\\.md$", "^llms\\.txt$"],
      generators: ["scripts/gen.mts"],
    }),
    "vitest.config.ts": "export default { thresholds: { lines: 100 } };\n",
    "lib/claims.ts": readFileSync(join(repo, "registry/ouro/lib/ouro/claims.ts"), "utf8"),
    "registry/a.tsx": '/**\n * Every row is 44px tall.\n *\n * @claim "Every row is 44px tall" registry/a.tsx verify:fileLine(registry/a.tsx, /44px/)\n */\nexport function A() {}\n',
    // A part's JSDoc says "Part: …"; the parts page drops the label and capitalizes the rest.
    "registry/b.tsx": '/**\n * Part: the panel, 18rem wide.\n *\n * @claim "the panel, 18rem wide" registry/b.tsx verify:fileLine(registry/b.tsx, /18rem/)\n */\nexport function B() {}\n',
    "scripts/gen.mts": 'import { claim } from "../lib/claims.ts";\nexport const docs = `Its tests make ${claim("the installed files reach 100% coverage", { source: { file: "vitest.config.ts" }, verify: { fileLine: "vitest.config.ts", pattern: "lines: 100" } })}.`;\n',
    "registry.json": JSON.stringify({
      items: [
        { name: "a", type: "registry:ui", description: "Every row is 44px tall.", docs: "Its tests make the installed files reach 100% coverage." },
        { name: "b", type: "registry:lib", description: "Its tests make the installed files reach 99% coverage.", docs: "--- vite.config.ts\nexport default { server: { port: 5173 } };\n\nEvery helper ships." },
      ],
    }),
    "README.md": "# R\n\n<!-- items:start -->\nEvery row is 44px tall.\n\nAll items are tested.\n<!-- items:end -->\n",
    "llms.txt": "# R\n\n## Items\n\n- a: Every row is 44px tall.\n- b: It supports every theme.\n- c: The panel, 18rem wide.\n",
  });
  const { failures } = await checkClaims({ root });
  const found = failures.map((failure) => failure.message.split(" (It reads")[0].replace(/ (states|makes|says|claims)[^"]*$/, ""));
  assert.deepEqual(found.sort(), [
    'README.md:6: "All items are tested."',
    'llms.txt:6: "b: It supports every theme."',
    'registry.json:items[1].description:1: "Its tests make the installed files reach 99% coverage."',
    'registry.json:items[1].docs:4: "Every helper ships."',
  ]);
});

test("exemptions ratchet against the base ref: a new one must carry a reason and be named in the pull request", () => {
  const base = { allowed: [{ file: "a.ts", sentence: "All stop.", reason: "story" }], notLinted: [{ match: "^docs/", mode: "generated", reason: "gen-docs" }], instructionVerbs: ["run", "add"] };
  const head = {
    allowed: [...base.allowed, { file: "a.ts", sentence: "All good.", reason: "story" }],
    notLinted: [...base.notLinted, { match: "^site/", mode: "input", reason: "" }],
    instructionVerbs: [...base.instructionVerbs, "record"],
  };
  const problems = policyProblems({ base, head, body: 'Allows "All good." in the story.' }).map((problem) => problem.message);
  assert.deepEqual(problems, [
    'claims.config.json: notLinted adds "^site/" with no reason. Give it one.',
    'claims.config.json: notLinted adds "^site/"; name it in the pull request\'s description, so a reviewer sees the exemption.',
    'claims.config.json: instructionVerbs adds "record"; name it in the pull request\'s description, so a reviewer sees the exemption.',
  ]);
  assert.deepEqual(policyProblems({ base, head: base, body: "" }), []);
});

test("the URL cache: new or changed entries are fetched again, and an entry no claim cites fails", () => {
  const base = { "https://a.example/": { status: 200, checked: "2026-10-01" }, "https://b.example/": { status: 200, checked: "2026-10-01" } };
  const head = { ...base, "https://b.example/": { status: 200, checked: "2026-10-02" }, "https://c.example/": { status: 200, checked: "2026-10-02" }, "https://old.example/": { status: 200, checked: "2026-10-01" } };
  const review = urlCacheReview(base, head, new Set(["https://a.example/", "https://b.example/", "https://c.example/"]));
  assert.deepEqual(review.refresh, ["https://b.example/", "https://c.example/", "https://old.example/"]);
  assert.deepEqual(review.uncited, ["https://old.example/"]);
});

test("verify --network fails when an address no longer answers as the cache says", async () => {
  const server = createServer((request, response) => {
    response.statusCode = 404;
    response.end();
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const url = `http://127.0.0.1:${server.address().port}/spec`;
  const root = fixture({ "claims-urls.json": JSON.stringify({ [url]: { status: 200, checked: "2026-10-01" } }) });
  try {
    const failures = (await verify([{ urlOk: url }], { root, urlCache: "claims-urls.json", network: true })).map((failure) => failure.message);
    assert.match(failures[0], /answered 404, where the cache had 200/);
  } finally {
    server.close();
  }
});

test("the repository's exemptions are narrow: a fixtures folder in shipped code is linted, the install fixtures are not", () => {
  const config = loadConfig(repo);
  assert.equal(classify("registry/ouro/components/ouro/fixtures/a.tsx", config).mode, "lint");
  assert.equal(classify("site/src/fixture/copy.ts", config).mode, "lint");
  assert.equal(classify("test/install-fixture/README.md", config).mode, "input");
  assert.equal(classify("registry.json", config).mode, "lint");
});

test("the claims checker ships in lib-claims and runs in an app", () => {
  const registry = JSON.parse(readFileSync(join(repo, "registry.json"), "utf8"));
  const item = registry.items.find((entry) => entry.name === "lib-claims");
  assert.deepEqual(item.files.map((file) => file.target).sort(), ["@lib/ouro/claims-check.mjs", "@lib/ouro/claims.ts"]);
  const app = fixture({
    "package.json": JSON.stringify({ name: "app", type: "module" }),
    "README.md": "# App\n\nOur checkout passes axe in every theme.\n",
    "src/checkout.test.tsx": 'import { test } from "vitest";\ntest("checkout passes axe", () => {});\n',
    "src/copy.ts": 'import { claim } from "./lib/ouro/claims";\nexport const LINE = claim("Checkout passes axe in every theme.", { source: { test: "src/checkout.test.tsx::checkout passes axe" }, verify: { testExists: "src/checkout.test.tsx::checkout passes axe" } });\nexport const NOTE = "Every page loads fast.";\n',
  });
  mkdirSync(join(app, "src/lib/ouro"), { recursive: true });
  copyFileSync(join(repo, "registry/ouro/lib/ouro/claims.ts"), join(app, "src/lib/ouro/claims.ts"));
  copyFileSync(join(repo, "registry/ouro/lib/ouro/claims-check.mjs"), join(app, "src/lib/ouro/claims-check.mjs"));
  const run = () => spawnSync(process.execPath, ["src/lib/ouro/claims-check.mjs", "check"], { cwd: app, encoding: "utf8" });
  const failed = run();
  assert.equal(failed.status, 1, failed.stderr);
  assert.match(failed.stderr, /README\.md:3: "Our checkout passes axe in every theme\." makes a universal claim/);
  assert.match(failed.stderr, /src\/copy\.ts:3: "Every page loads fast\."/);
  writeFileSync(join(app, "README.md"), '# App\n\nOur checkout passes axe in [every theme](src/checkout.test.tsx "verify:testExists(src/checkout.test.tsx::checkout passes axe)").\n');
  writeFileSync(join(app, "src/copy.ts"), readFileSync(join(app, "src/copy.ts"), "utf8").replace('export const NOTE = "Every page loads fast.";\n', ""));
  const passed = run();
  assert.equal(passed.status, 0, passed.stderr);
  assert.match(passed.stdout, /2 claims verified/);
});
