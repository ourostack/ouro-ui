import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { comments, duplicateTestNames, leadingComment, testNames, unpreservedHints } from "./source-rules.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tracked = (...globs) =>
  execFileSync("git", ["ls-files", "--", ...globs], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
const read = (path) => ({ path, text: readFileSync(join(root, path), "utf8") });

test("leadingComment finds a header and a first export's JSDoc, and nothing after the imports", () => {
  assert.equal(leadingComment("a.ts", "// header\nimport { a } from 'a';\n"), "// header");
  assert.equal(leadingComment("a.ts", "/** Doc. */\nexport const a = 1;\n"), "/** Doc. */");
  assert.equal(leadingComment("a.ts", "import { a } from 'a';\n\n/** Doc. */\nexport const b = a;\n"), "");
  assert.equal(leadingComment("a.ts", "export { a };\n\n/** Doc. */\nconst a = 1;\n"), "");
  assert.equal(leadingComment("a.ts", "// only a comment\n"), "");
});

test("no registry file has a comment before its first statement, which the shadcn CLI drops on install", () => {
  const files = tracked("registry/**/*.ts", "registry/**/*.tsx");
  assert.ok(files.length > 40);
  const problems = files
    .map(read)
    .filter(({ path, text }) => leadingComment(path, text) !== "")
    .map(({ path, text }) => `${path}: ${leadingComment(path, text).split("\n")[0]}`);
  assert.deepEqual(problems, [], "Move the comment after the imports, as JSDoc on the first export it explains.");
});

test("comments lists every comment in order, including JSX and end-of-file comments", () => {
  const text = "// a\nimport x from 'x';\n/** b */\nexport const y = (\n  <div>{/* c */}</div>\n); // d\n// e\n";
  assert.deepEqual(comments("a.tsx", text), ["// a", "/** b */", "/* c */", "// d", "// e"]);
});

test("unpreservedHints flags an istanbul hint without @preserve", () => {
  assert.deepEqual(unpreservedHints("a\n/* istanbul ignore next @preserve -- production only */ b"), []);
  assert.deepEqual(unpreservedHints("/* istanbul ignore else @preserve */\nif (x) y();"), []);
  assert.deepEqual(unpreservedHints("x\n  /* istanbul ignore else */\n"), ["2: /* istanbul ignore else */"]);
  assert.deepEqual(unpreservedHints("/* istanbul ignore next -- production only */"), ["1: /* istanbul ignore next -- production only */"]);
});

test("every istanbul hint in registry/ carries @preserve, so it survives esbuild in an app", () => {
  const problems = tracked("registry/**/*.ts", "registry/**/*.tsx")
    .map(read)
    .flatMap(({ path, text }) => unpreservedHints(text).map((problem) => `${path}:${problem}`));
  assert.deepEqual(problems, [], "Write hints as /* istanbul ignore <next|if|else> @preserve -- reason */.");
});

test("testNames joins describe titles, follows aliases and each, and skips hooks and steps", () => {
  const text = `
    const chromiumOnly = it.skipIf(true);
    describe("menu", () => {
      it("opens", () => {});
      describe.each(["a"])("with %s", () => { test.skip("closes", () => {}); });
      chromiumOnly("drags", () => {});
      it.each(["tap"])("after a %s", () => {});
    });
    test.describe("spec", () => {
      test.describe.configure({ mode: "serial" });
      test.beforeEach(async () => {});
      test("loads", async () => { await test.step("step", async () => {}); });
    });
    expect.poll(() => 1);
  `;
  assert.deepEqual(testNames("a.test.ts", text), [
    "menu > opens",
    "menu > with %s > closes",
    "menu > drags",
    "menu > after a %s",
    "spec > loads",
  ]);
});

test("duplicateTestNames reports a full name shared by two files or repeated in one", () => {
  const dialog = { path: "dialog.test.tsx", text: 'describe("iOS backdrop rule", () => { it("covers", () => {}); });' };
  const sheet = { path: "sheet.test.tsx", text: 'describe("iOS backdrop rule", () => { it("covers", () => {}); });' };
  assert.deepEqual(duplicateTestNames([dialog, sheet]), ["iOS backdrop rule > covers (dialog.test.tsx, sheet.test.tsx)"]);
  assert.deepEqual(duplicateTestNames([{ path: "a.test.ts", text: 'it("x", f); it("x", g);' }]), ["x (a.test.ts, a.test.ts)"]);
  assert.deepEqual(duplicateTestNames([dialog]), []);
});

test("every test's full name is unique across the suite, so a name filter runs exactly one", () => {
  const files = tracked("*.test.ts", "*.test.tsx", "*.test.mjs", "registry/ouro/e2e/**/*.spec.ts").map(read);
  assert.ok(files.length > 40);
  assert.deepEqual(duplicateTestNames(files), [], "Rename the tests so each full name (describe titles and title) is unique.");
});
