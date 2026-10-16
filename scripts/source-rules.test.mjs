import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { compile } from "tailwindcss";
import postcss from "postcss";
import { viewportClass } from "../registry/ouro/components/ouro/toast/toaster-styles.ts";
import { alarmingFileName, alarmingTestTitle, comments, directTabPresses, duplicateTestNames, hasClientDirective, leadingComment, needsClientDirective, testNames, unpreservedHints } from "./source-rules.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tracked = (...globs) =>
  execFileSync("git", ["ls-files", "--", ...globs], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
const read = (path) => ({ path, text: readFileSync(join(root, path), "utf8") });

test("Toaster preserves named spacing tokens when Tailwind compiles an app's spacing scale", async () => {
  const compiler = await compile("@theme { --spacing: 0.25rem; --spacing-4: 1.125rem; --spacing-6: 1.75rem; --spacing-90: 25rem; --breakpoint-sm: 40rem; } @tailwind utilities;");
  const css = postcss.parse(compiler.build([...viewportClass.split(/\s+/), "start-4", "end-6", "w-90"]));
  const values = new Map();
  css.walkDecls((decl) => values.set(decl.prop, [...(values.get(decl.prop) ?? []), decl.value]));
  // The original utilities read the named token, not just the universal spacing multiplier.
  assert.ok(values.get("inset-inline-start").includes("var(--spacing-4)"));
  assert.ok(values.get("inset-inline-end").includes("var(--spacing-6)"));
  assert.ok(values.get("width").includes("var(--spacing-90)"));
  for (const [property, token] of [
    ["--ouro-toaster-start", "--spacing-4"],
    ["--ouro-toaster-end", "--spacing-4"],
    ["--ouro-toaster-end", "--spacing-6"],
    ["--ouro-toaster-bottom", "--spacing-6"],
    ["--ouro-toaster-width", "--spacing-90"],
  ]) {
    assert.ok(values.get(property).some((value) => value.includes(`var(${token}`)), `${property} must consume ${token}, as the original spacing utility does`);
  }
});

test("Toaster keeps inline spacing aliases evaluated at the viewport, like the original utilities", async () => {
  const compiler = await compile("@theme inline { --spacing: 0.25rem; --spacing-4: var(--app-gap-4); --spacing-6: var(--app-gap-6); --spacing-90: var(--app-width); --breakpoint-sm: 40rem; } @tailwind utilities;");
  const css = postcss.parse(compiler.build([...viewportClass.split(/\s+/), "start-4", "end-6", "w-90"]));
  const values = new Map();
  css.walkDecls((decl) => values.set(decl.prop, [...(values.get(decl.prop) ?? []), decl.value]));
  for (const [originalProperty, viewportProperty, alias] of [
    ["inset-inline-start", "--ouro-toaster-start", "--app-gap-4"],
    ["inset-inline-end", "--ouro-toaster-end", "--app-gap-6"],
    ["width", "--ouro-toaster-width", "--app-width"],
  ]) {
    assert.ok(values.get(originalProperty).includes(`var(${alias})`));
    assert.ok(values.get(viewportProperty).some((value) => value.startsWith(`var(${alias}`)), `${viewportProperty} must evaluate ${alias} at the viewport, not inherit a pre-resolved theme alias`);
  }
});

test("Toaster preserves an inline universal spacing multiplier instead of introducing a live global dependency", async () => {
  const compiler = await compile("@theme inline { --spacing: 0.3rem; --breakpoint-sm: 40rem; } @tailwind utilities;");
  const css = postcss.parse(compiler.build([...viewportClass.split(/\s+/), "start-4", "end-6", "w-90"]));
  const values = new Map();
  css.walkDecls((decl) => values.set(decl.prop, [...(values.get(decl.prop) ?? []), decl.value]));
  for (const [originalProperty, viewportProperty, multiplier] of [
    ["inset-inline-start", "--ouro-toaster-start", 4],
    ["inset-inline-end", "--ouro-toaster-end", 6],
    ["width", "--ouro-toaster-width", 90],
  ]) {
    const expected = `calc(0.3rem * ${multiplier})`;
    assert.ok(values.get(originalProperty).includes(expected));
    assert.ok(values.get(viewportProperty).some((value) => value.includes(expected)), `${viewportProperty} must preserve the inline spacing multiplier`);
  }
});

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

// An app's CI often fails on any output line that reads as a warning or an error. A test
// runner prints file names (the coverage table) and test titles (a slow or failed test), so
// a shipped module named use-dev-warnings.ts or a test titled "warn for …" fails such a run
// though nothing is wrong.

test("alarmingFileName flags a shipped file whose name has a word a log filter reads as trouble", () => {
  assert.equal(alarmingFileName("registry/ouro/lib/ouro/use-dev-warnings.ts"), "warnings");
  assert.equal(alarmingFileName("registry/ouro/lib/ouro/error.test.tsx"), "error");
  assert.equal(alarmingFileName("registry/ouro/components/ouro/x/x-deprecated.tsx"), "deprecated");
  assert.equal(alarmingFileName("registry/ouro/lib/ouro/use-dev-messages.ts"), null);
  // Only the file's own name counts, and only whole words in it.
  assert.equal(alarmingFileName("registry/ouro/components/ouro/failover/terror.tsx"), null);
});

test("alarmingTestTitle flags a title that starts with such a word, and allows the verb forms", () => {
  assert.equal(alarmingTestTitle("Field > warn for appearance classes on parts"), "warn for appearance classes on parts");
  assert.equal(alarmingTestTitle("Errors > shows one"), "Errors");
  assert.equal(alarmingTestTitle("Field > Warning: the label is missing"), "Warning: the label is missing");
  assert.equal(alarmingTestTitle("Field > warns about appearance classes on parts"), null);
  assert.equal(alarmingTestTitle("Form > fails a submit while a field is empty"), null);
  assert.equal(alarmingTestTitle("Form > shows the error under its field"), null);
});

test("no shipped file's name reads as a warning or an error in an app's test output", () => {
  const named = tracked("registry/**").flatMap((path) => (alarmingFileName(path) ? [path] : []));
  assert.deepEqual(named, [], "Rename the file: a log filter that fails on these words fails the app's run when the name is printed.");
});

test("no test or describe title starts with a word that reads as a warning or an error", () => {
  const files = tracked("registry/**/*.test.ts", "registry/**/*.test.tsx", "registry/ouro/e2e/**/*.spec.ts").map(read);
  const titles = files.flatMap(({ path, text }) => testNames(path, text).flatMap((name) => (alarmingTestTitle(name) ? [`${path}: ${alarmingTestTitle(name)}`] : [])));
  assert.deepEqual([...new Set(titles)], [], 'Start the title with what the component does ("warns about …", "shows an error …").');
});

test("directTabPresses finds a Tab pressed by hand, in Vitest and in Playwright", () => {
  assert.deepEqual(directTabPresses('await userEvent.keyboard("{Tab}");\nawait pressTab();'), ['1: await userEvent.keyboard("{Tab}");']);
  assert.equal(directTabPresses('await userEvent.keyboard("{Shift>}{Tab}{/Shift}");').length, 1);
  assert.equal(directTabPresses('await press("{Tab}");').length, 1);
  assert.equal(directTabPresses('await page.keyboard.press("Tab");').length, 1);
  assert.equal(directTabPresses('await page.keyboard.press("Shift+Tab");').length, 1);
  assert.equal(directTabPresses("await userEvent.tab();").length, 1);
  // Other keys, a tab in a word, and comments are fine.
  assert.deepEqual(directTabPresses('await page.keyboard.press("Enter");\nconst tabs = page.getByRole("tab");\n// press("{Tab}") skips buttons\n * userEvent.keyboard("{Tab}")'), []);
});

// The forms pull request converts these two files; until it merges they are listed here.
const tabPressPending = new Set(["registry/ouro/components/ouro/sheet/sheet.test.tsx", "registry/ouro/components/ouro/text-field/text-field.test.tsx"]);

test("no test or spec presses Tab itself: they use pressTab(), which works in WebKit on a Mac", () => {
  const files = tracked("registry/**/*.test.ts", "registry/**/*.test.tsx", "registry/ouro/e2e/**/*.spec.ts", "test/**/*.test.tsx", "site/src/**/*.test.tsx").filter((path) => !tabPressPending.has(path));
  const presses = files.map(read).flatMap(({ path, text }) => directTabPresses(text).map((line) => `${path}:${line}`));
  assert.deepEqual(presses, [], "Use pressTab() from lib/ouro/testing/tab (Vitest) or e2e/ouro/story (Playwright).");
  for (const path of tabPressPending) assert.ok(directTabPresses(read(path).text).length > 0, `${path} no longer presses Tab itself: remove it from tabPressPending`);
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
  assert.deepEqual(offenders, [], "Write hover as pointer-fine:hover:…; Tailwind's hover: checks (hover: hover) only.");
});
