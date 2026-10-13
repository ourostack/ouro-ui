import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { comments, duplicateTestNames, hasClientDirective, leadingComment, needsClientDirective, testNames, unpreservedHints } from "./source-rules.mjs";

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

test("hasClientDirective finds \"use client\" only as the first statement", () => {
  assert.equal(hasClientDirective("a.tsx", '"use client";\n\nimport { a } from "a";\n'), true);
  assert.equal(hasClientDirective("a.ts", "'use client'\nexport { a };\n"), true);
  assert.equal(hasClientDirective("a.ts", 'import { a } from "a";\n"use client";\n'), false);
  assert.equal(hasClientDirective("a.ts", '"use strict";\n'), false);
  assert.equal(hasClientDirective("a.ts", ""), false);
});

test("needsClientDirective requires the directive in every component and lib .tsx file unless it is listed as pure", () => {
  assert.equal(needsClientDirective("registry/ouro/components/ouro/text/text.tsx", "export { Text };\n"), true);
  assert.equal(needsClientDirective("registry/ouro/components/ouro/text/new-part.ts", "export const a = 'b';\n"), true);
  assert.equal(needsClientDirective("registry/ouro/lib/ouro/ouro-provider.tsx", "export { OuroProvider };\n"), true);
  assert.equal(needsClientDirective("registry/ouro/lib/ouro/badge.tsx", "export const Badge = () => null;\n"), true);
  assert.equal(needsClientDirective("registry/ouro/components/ouro/sheet/sheet-styles.ts", "export const a = 'b';\n"), false);
  // Every component's -styles.ts is pure by its name, unless it calls a hook.
  assert.equal(needsClientDirective("registry/ouro/components/ouro/select/select-styles.ts", "export const a = 'b';\n"), false);
  assert.equal(needsClientDirective("registry/ouro/components/ouro/select/select-styles.ts", "import { useId } from 'react';\nexport const a = () => useId();\n"), true);
  assert.equal(needsClientDirective("registry/ouro/lib/ouro/touch-target.tsx", "export function TouchTarget() { return null; }\n"), false);
});

test("needsClientDirective finds hooks in other modules, also under another name or as React 19's use()", () => {
  const lib = (text) => needsClientDirective("registry/ouro/lib/ouro/a.ts", text);
  assert.equal(lib("import { useRef } from 'react';\nexport function useA() { return useRef(0); }\n"), true);
  assert.equal(lib("import { useEffect as effect } from 'react';\nexport function a() { effect(() => {}); }\n"), true);
  assert.equal(lib("import { use } from 'react';\nexport function a(p) { return use(p); }\n"), true);
  assert.equal(lib("import * as React from 'react';\nexport function a(p) { return React.use(p); }\n"), true);
  assert.equal(lib("export const C = React.createContext(null);\n"), true);
  assert.equal(lib("import { Component } from 'react';\nexport class A extends Component {}\n"), true);
  assert.equal(lib("/** useEffect(() => {}) in a comment */\nexport const cn = () => '';\n"), false);
  assert.equal(lib("import { memo as m } from 'react';\nexport const a = m(() => null);\n"), false);
});

test("every runtime registry file that renders or calls hooks starts with \"use client\", so a Next.js Server Component can render it", () => {
  const runtime = tracked("registry/**/*.ts", "registry/**/*.tsx").filter(
    (path) => !/\.(test|test-d|stories)\.tsx?$|\.d\.ts$|\/lib\/ouro\/testing\/|\/e2e\/|\/theme\//.test(path),
  );
  assert.ok(runtime.length > 20);
  const files = runtime.map(read);
  const missing = files.filter(({ path, text }) => needsClientDirective(path, text) && !hasClientDirective(path, text)).map(({ path }) => path);
  assert.deepEqual(missing, [], 'Start these files with "use client"; (before the imports).');
  const extra = files.filter(({ path, text }) => !needsClientDirective(path, text) && hasClientDirective(path, text)).map(({ path }) => path);
  assert.deepEqual(extra, [], 'These files need no "use client": a Server Component may import their values directly.');
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

test("testNames reads Playwright's test.skip, fixme, fail and slow with a condition as a condition, not a test", () => {
  const text = `
    test.describe("on a phone", () => {
      test.skip(({ browserName }) => browserName !== "chromium", "coarse pointer emulation is Chromium's");
      test.fixme(true, "flaky");
      test.slow(isCI);
      test.fail(({ isMobile }) => isMobile);
      test.skip("skipped by title", async () => {});
      test("opens", async () => {});
    });
  `;
  assert.deepEqual(testNames("a.spec.ts", text), ["on a phone > skipped by title", "on a phone > opens"]);
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

/** The class tokens in a file that use a hover variant without `pointer-fine:` before it. */
const ungatedHover = (text) =>
  [
    ...new Set(
      text.split(/[\s"'`]+/).filter((token) => {
        const parts = token.split(":");
        const at = parts.findIndex((part) => /^(group-|peer-)?hover(\/.+)?$/.test(part));
        return at !== -1 && at < parts.length - 1 && !parts.slice(0, at).includes("pointer-fine");
      }),
    ),
  ];

// Files whose hover styles belong to the overlay and gesture fix PRs. Remove a file from this
// list in the PR that gates its hover; the test below fails while a listed file is already clean.
const hoverGatedLater = [
  "registry/ouro/components/ouro/combobox/combobox-styles.ts",
  "registry/ouro/components/ouro/dialog/dialog.tsx",
  "registry/ouro/components/ouro/resizable/resizable-styles.ts",
  "registry/ouro/components/ouro/select/native-select.tsx",
  "registry/ouro/components/ouro/select/select-styles.ts",
  "registry/ouro/components/ouro/toast/toaster-styles.ts",
];

test("ungatedHover finds a hover variant with no pointer-fine before it", () => {
  assert.deepEqual(ungatedHover('"hover:bg-accent pointer-fine:hover:bg-accent not-disabled:hover:text-x group-hover/tab:underline"'), [
    "hover:bg-accent",
    "not-disabled:hover:text-x",
    "group-hover/tab:underline",
  ]);
  assert.deepEqual(ungatedHover("'hover:bg-accent' `peer-hover/x:flex` 'pointer-fine:hover:flex'"), ["hover:bg-accent", "peer-hover/x:flex"]);
  assert.deepEqual(ungatedHover('"not-data-disabled:pointer-fine:hover:before:opacity-8 data-hovering:opacity-100 hover"'), []);
});

test("every hover style is gated on a fine pointer (pointer-fine:hover:), so a tap on a phone leaves no hover state behind", () => {
  const runtime = tracked("registry/**/*.ts", "registry/**/*.tsx").filter(
    (path) => !/\.(test|test-d|stories)\.tsx?$|\.d\.ts$|\/lib\/ouro\/testing\/|\/e2e\/|\/theme\//.test(path),
  );
  const offenders = runtime.map(read).filter(({ text }) => ungatedHover(text).length > 0).map(({ path }) => path);
  assert.deepEqual(
    offenders.filter((path) => !hoverGatedLater.includes(path)),
    [],
    "Write hover as pointer-fine:hover:…; Tailwind's hover: checks (hover: hover) only.",
  );
  assert.deepEqual(
    hoverGatedLater.filter((path) => !offenders.includes(path)),
    [],
    "These files are gated now: remove them from hoverGatedLater.",
  );
});
