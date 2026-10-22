import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { compile } from "tailwindcss";
import postcss from "postcss";
import { viewportClass } from "../registry/ouro/components/ouro/toast/toaster-styles.ts";
import { cn } from "../registry/ouro/lib/ouro/cn.ts";
import { alarmingFileName, alarmingTestTitle, comments, directTabPresses, duplicateTestNames, hasClientDirective, leadingComment, needsClientDirective, physicalAllowed, physicalUtilities, testNames, timerBoundReads, unpreservedHints } from "./source-rules.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tracked = (...globs) =>
  execFileSync("git", ["ls-files", "--", ...globs], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
const read = (path) => ({ path, text: readFileSync(join(root, path), "utf8") });
const viewportTokens = () => cn(viewportClass).split(/\s+/);

test("Toaster emits the original named-only spacing scale without requiring a universal token", async () => {
  const compiler = await compile("@theme { --spacing: initial; --spacing-4: 1rem; --spacing-6: 1.5rem; --spacing-90: 22.5rem; --breakpoint-sm: 40rem; } @tailwind utilities;");
  const css = postcss.parse(compiler.build([...viewportTokens(), "start-4", "end-4", "end-6", "bottom-6", "w-90"]));
  const values = new Map();
  css.walkDecls((decl) => values.set(decl.prop, [...(values.get(decl.prop) ?? []), decl.value]));
  for (const [originalProperty, viewportProperty, token] of [
    ["inset-inline-start", "--ouro-toaster-start", "--spacing-4"],
    ["inset-inline-end", "--ouro-toaster-end", "--spacing-4"],
    ["inset-inline-end", "--ouro-toaster-end", "--spacing-6"],
    ["bottom", "--ouro-toaster-bottom", "--spacing-6"],
    ["width", "--ouro-toaster-width", "--spacing-90"],
  ]) {
    assert.ok(values.get(originalProperty).includes(`var(${token})`), `original utility consumes ${token}`);
    assert.ok(values.get(viewportProperty)?.some((value) => value.includes(`var(${token}`)), `${viewportProperty} must still emit for ${token} when --spacing is absent`);
  }
});

test("Toaster omits unavailable responsive spacing in sparse and absent scales, preserving the phone fallback", async () => {
  const original = "fixed start-4 end-4 bottom-[max(1rem,env(safe-area-inset-bottom))] outline-none sm:start-auto sm:end-6 sm:bottom-6 sm:w-90";
  const declarations = (css) => {
    const rows = [];
    postcss.parse(css).walkDecls((decl) => {
      let responsive = false;
      for (let parent = decl.parent; parent; parent = parent.parent) {
        if (parent.type === "atrule" && parent.name === "media") responsive = true;
      }
      rows.push({ property: decl.prop, value: decl.value, responsive });
    });
    return rows;
  };
  for (const named of [true, false]) {
    const theme = `@theme { --spacing: initial; ${named ? "--spacing-4: 1rem; --spacing-90: 22.5rem;" : ""} --breakpoint-sm: 40rem; } @tailwind utilities;`;
    const stock = declarations((await compile(theme)).build(original.split(/\s+/)));
    const candidate = declarations((await compile(theme)).build(viewportTokens()));
    for (const property of ["inset-inline-end", "bottom"]) {
      assert.deepEqual(stock.filter((row) => row.responsive && row.property === property), [], `08 omits unavailable sm ${property}`);
    }
    assert.ok(stock.some((row) => !row.responsive && row.property === "bottom" && row.value.includes("env(safe-area-inset-bottom)")));
    for (const property of ["--ouro-toaster-end", "--ouro-toaster-bottom"]) {
      assert.deepEqual(candidate.filter((row) => row.responsive && row.property === property), [], `${property} must omit unavailable sm spacing, not invalidate its phone fallback`);
    }
    const phoneEnd = candidate.filter((row) => !row.responsive && row.property === "--ouro-toaster-end");
    const desktopWidth = candidate.filter((row) => row.responsive && row.property === "--ouro-toaster-width");
    if (named) {
      assert.ok(phoneEnd.some((row) => row.value.includes("var(--spacing-4")));
      assert.ok(desktopWidth.some((row) => row.value.includes("var(--spacing-90")));
    } else {
      assert.deepEqual(phoneEnd, [], "missing named and universal spacing emits no phone end declaration");
      assert.deepEqual(candidate.filter((row) => !row.responsive && row.property === "--ouro-toaster-start"), []);
      assert.deepEqual(desktopWidth, [], "missing named and universal spacing emits no desktop width declaration");
    }
    assert.deepEqual(candidate.filter((row) => row.property === "--spacing"), [], "no global spacing default introduced");
  }
});

test("Toaster preserves named spacing tokens when Tailwind compiles an app's spacing scale", async () => {
  const compiler = await compile("@theme { --spacing: 0.25rem; --spacing-4: 1.125rem; --spacing-6: 1.75rem; --spacing-90: 25rem; --breakpoint-sm: 40rem; } @tailwind utilities;");
  const css = postcss.parse(compiler.build([...viewportTokens(), "start-4", "end-6", "w-90"]));
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

test("Toaster named candidates do not outrank later responsive universal defaults after cn", async () => {
  const compiler = await compile("@theme { --spacing: 0.25rem; --spacing-4: 1.125rem; --breakpoint-sm: 40rem; } @tailwind utilities;");
  const values = new Map();
  postcss.parse(compiler.build(viewportTokens())).walkDecls((decl) => {
    values.set(decl.prop, [...(values.get(decl.prop) ?? []), decl.value]);
  });
  assert.equal(values.get("--ouro-toaster-start").at(-1), "auto", "desktop start must override the named phone inset");
  assert.ok(values.get("--ouro-toaster-end").at(-1).includes("calc(var(--spacing) * 6)"), "desktop universal end wins over named phone end");
});

test("Toaster keeps inline spacing aliases evaluated at the viewport, like the original utilities", async () => {
  const compiler = await compile("@theme inline { --spacing: 0.25rem; --spacing-4: var(--app-gap-4); --spacing-6: var(--app-gap-6); --spacing-90: var(--app-width); --breakpoint-sm: 40rem; } @tailwind utilities;");
  const css = postcss.parse(compiler.build([...viewportTokens(), "start-4", "end-6", "w-90"]));
  const values = new Map();
  const phoneValues = new Map();
  css.walkDecls((decl) => {
    values.set(decl.prop, [...(values.get(decl.prop) ?? []), decl.value]);
    let responsive = false;
    for (let parent = decl.parent; parent; parent = parent.parent) {
      if (parent.type === "atrule" && parent.name === "media") responsive = true;
    }
    if (!responsive) phoneValues.set(decl.prop, [...(phoneValues.get(decl.prop) ?? []), decl.value]);
  });
  for (const [originalProperty, viewportProperty, alias] of [
    ["inset-inline-start", "--ouro-toaster-start", "--app-gap-4"],
    ["inset-inline-end", "--ouro-toaster-end", "--app-gap-6"],
    ["width", "--ouro-toaster-width", "--app-width"],
  ]) {
    assert.ok(values.get(originalProperty).includes(`var(${alias})`));
    const applicable = viewportProperty === "--ouro-toaster-start" ? phoneValues : values;
    assert.ok(applicable.get(viewportProperty).at(-1).startsWith(`var(${alias}`), `${viewportProperty} must evaluate ${alias} at the viewport after the universal candidate, not inherit a pre-resolved theme alias`);
  }
});

test("Toaster preserves an inline universal spacing multiplier instead of introducing a live global dependency", async () => {
  const compiler = await compile("@theme inline { --spacing: 0.3rem; --breakpoint-sm: 40rem; } @tailwind utilities;");
  const css = postcss.parse(compiler.build([...viewportTokens(), "start-4", "end-6", "w-90"]));
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

test("timerBoundReads finds a wait for a state that lasts a set time, in a test that holds no clock", () => {
  const vitest = (body) => timerBoundReads("a.test.tsx", `import { toast } from "@/registry/ouro/lib/ouro/toast";\nit("t", async () => {\n${body}\n});`);
  assert.deepEqual(vitest('await expect.poll(() => button.textContent).toBe("Link copied");'), ['t: await expect.poll(() => button.textContent).toBe("Link copied");']);
  assert.equal(vitest('await expect.element(page.getByRole("button", { name: "Copied" })).toBeVisible();').length, 1);
  // A label the file gives the component counts too.
  assert.equal(timerBoundReads("a.test.tsx", 'it("t", async () => {\nrender(<CopyButton copiedLabel="Key copied" />);\nawait expect.poll(() => text()).toBe("Key copied");\n});').length, 1);
  // A toast that counts down: no duration, or a finite one; one with an action and no duration stays.
  assert.deepEqual(vitest('toast("Saved");\ntoast("Brief", { duration: 100 });\nawait show("Plain", options);'), ['t: toast("Saved")', 't: toast("Brief", { duration: 100 })', 't: show("Plain", options)']);
  assert.deepEqual(vitest('toast("Kept", { duration: 0 });\ntoast("Forever", { duration: Infinity });\ntoast("Undo", { action: { label: "Undo", onClick } });'), []);
  // Held clocks, recorded states and a stated reason pass; so do a sync read and a label in a name.
  for (const body of [
    'vi.useFakeTimers({ toFake: ["setTimeout"] });\nawait expect.poll(() => text()).toBe("Copied");\ntoast("Saved");',
    'fakeClock();\ntoast("Saved");',
    '// real clock: nothing here ends on a timer.\ntoast("Saved");',
    'expect(button.textContent).toBe("Copied");',
    'await expect.poll(() => announced.count("Copied the theme")).toBe(1);',
  ])
    assert.deepEqual(vitest(body), [], body);
  // In a spec: Playwright's waits, a busy or saving state, and a toast's box.
  const spec = (body) => timerBoundReads("a.spec.ts", `test("s", async ({ page }) => {\n${body}\n});`);
  assert.equal(spec('await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();').length, 1);
  assert.equal(spec('await expect(save).toHaveAttribute("aria-busy", "true");').length, 1);
  assert.equal(spec('await expect(status).toHaveAttribute("data-status", "saving");').length, 1);
  assert.equal(spec(`const box = await page.locator('[data-ouro="toast"]').first().boundingBox();`).length, 1);
  assert.equal(spec(`const toast = page.locator('[data-ouro="toast"]').first();\nawait expect(toast).toBeVisible();`).length, 1);
  // A count of what a watch recorded is no wait on the label itself.
  assert.deepEqual(vitest('await expect.poll(() => announced.count("Link copied")).toBe(1);'), []);
  assert.deepEqual(spec('await page.clock.install();\nawait holdClock(page);\nawait expect(save).toHaveAttribute("aria-busy", "true");'), []);
  assert.deepEqual(spec('const toasts = await watchToasts(page);\nawait expect.poll(toasts.titles).toContain("Saved");'), []);
  // describe titles name the test.
  assert.deepEqual(timerBoundReads("a.spec.ts", 'test.describe("d", () => {\ntest("s", async ({ page }) => {\nawait expect(b).toHaveAttribute("aria-busy", "true");\n});\n});'), ['d > s: await expect(b).toHaveAttribute("aria-busy", "true");']);
});

test("no test or spec waits for a state that lasts a set time on the real clock", () => {
  const files = tracked("registry/**/*.test.ts", "registry/**/*.test.tsx", "registry/ouro/e2e/**/*.spec.ts", "test/**/*.test.tsx", "site/src/**/*.test.tsx", "site/e2e/**/*.spec.ts");
  const reads = files.map(read).flatMap(({ path, text }) => timerBoundReads(path, text).map((line) => `${path}: ${line}`));
  assert.deepEqual(reads, [], "Hold the page's clock (vi.useFakeTimers, holdClock) or record the state as it happens (watchAnnouncements, watchToasts); see timerBoundReads in scripts/source-rules.mjs.");
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

/**
 * The class tokens in a file whose shadow ignores the theme: a standard shadow class, which
 * Tailwind compiles to its fixed value (`shadow-lg`, not `shadow-(--shadow-lg)`), or a shadow
 * written with a color of its own (`[box-shadow:0_8px_24px_rgb(0_0_0/0.12)]`).
 */
const fixedShadows = (text) =>
  [
    ...new Set(
      text.split(/[\s"'`]+/).filter((token) => {
        const base = token.replace(/^(?:[^[\]:]+:|\[[^\]]*\]:)*/, "");
        if (/^!?(?:inset-)?shadow-(?:2xs|xs|sm|md|lg|xl|2xl)!?$/.test(base)) return true;
        return /^(?:shadow-\[|\[box-shadow:)/.test(base) && /rgba?\(|hsla?\(|oklch\(|#[0-9a-f]{3,8}\b|\b(?:black|white)\b/i.test(base);
      }),
    ),
  ];

test("fixedShadows finds a shadow that does not read the theme's tokens", () => {
  assert.deepEqual(fixedShadows('"shadow-lg data-dragging:shadow-md [box-shadow:0_8px_24px_rgb(0_0_0/0.12)] shadow-[0_1px_#000]"'), [
    "shadow-lg",
    "data-dragging:shadow-md",
    "[box-shadow:0_8px_24px_rgb(0_0_0/0.12)]",
    "shadow-[0_1px_#000]",
  ]);
  assert.deepEqual(fixedShadows('"shadow-(--shadow-lg) data-dragging:shadow-(--shadow-lg) [box-shadow:var(--ouro-shadow-sheet-left)] shadow-[inset_0_-1px_0_0_var(--border)] shadow-none"'), []);
});

test("every shadow reads the theme: shadcn's --shadow-* tokens or --ouro-shadow-sheet-*, never a fixed color", () => {
  const runtime = tracked("registry/**/*.ts", "registry/**/*.tsx").filter(
    (path) => !/\.(test|test-d|stories)\.tsx?$|\.d\.ts$|\/lib\/ouro\/testing\/|\/e2e\/|\/theme\//.test(path),
  );
  const offenders = runtime.map(read).flatMap(({ path, text }) => fixedShadows(text).map((token) => `${path}: ${token}`));
  assert.deepEqual(offenders, [], "Write shadow-(--shadow-lg), so a theme's --shadow-lg applies; a sheet reads --ouro-shadow-sheet-<side>.");
});

test("physicalUtilities finds a class on a physical side, after its variants, and leaves logical sides, words and allowed classes", () => {
  const source = [
    'const a = "ml-2 pr-[env(safe-area-inset-right)] -left-1/2 sm:right-0 data-[side=x]:border-l rounded-tr-xl text-left float-right !pl-4";',
    'const b = `ms-2 pe-4 start-0 end-0 border-s rounded-e-xl text-start border-r-border ${x} right-click scroll-mr-2`;',
    'const c = "left right border-ring rounded-lg text-lefty";',
  ].join("\n");
  assert.deepEqual(physicalUtilities("x.ts", source, {}), [
    "1: ml-2",
    "1: pr-[env(safe-area-inset-right)]",
    "1: -left-1/2",
    "1: sm:right-0",
    "1: data-[side=x]:border-l",
    "1: rounded-tr-xl",
    "1: text-left",
    "1: float-right",
    "1: !pl-4",
    "2: border-r-border",
    "2: scroll-mr-2",
  ]);
  assert.deepEqual(physicalUtilities("x.ts", 'const a = "ml-2 left-1/2";', { "left-1/2": "centred" }), ["1: ml-2"]);
});

test("physicalUtilities finds a horizontal translate, a transform origin, a background or object position on a side, unless the same classes reverse it for right to left", () => {
  const source = [
    'const a = "translate-x-2 -translate-x-full data-open:translate-x-0 origin-left origin-top-right bg-left object-right-bottom bg-right-top";',
    'const b = "-translate-x-[calc(100%-var(--p))] rtl:translate-x-[calc(100%-var(--p))] origin-left rtl:origin-right object-left ltr:object-left rtl:object-right";',
    'const c = "translate-y-2 origin-center origin-top bg-center object-cover object-top bg-local translate-x";',
  ].join("\n");
  assert.deepEqual(physicalUtilities("x.ts", source, {}), [
    "1: translate-x-2",
    "1: -translate-x-full",
    "1: data-open:translate-x-0",
    "1: origin-left",
    "1: origin-top-right",
    "1: bg-left",
    "1: object-right-bottom",
    "1: bg-right-top",
  ]);
});

test("no component places, pads, borders or rounds a part by a physical side unless physicalAllowed says why, and every allowance is still used", () => {
  const runtime = tracked("registry/**/*.ts", "registry/**/*.tsx").filter(
    (path) => !/\.(test|test-d|stories)\.tsx?$|\.d\.ts$|\/lib\/ouro\/testing\/|\/e2e\/|\/theme\//.test(path),
  );
  const offenders = runtime.map(read).flatMap(({ path, text }) => physicalUtilities(path, text).map((found) => `${path}:${found}`));
  assert.deepEqual(offenders, [], "Use the logical side, which follows the text in a right-to-left page: start-*/end-*, ms-*/me-*, ps-*/pe-*, border-s/border-e, rounded-s/rounded-e (rounded-ss/se/es/ee), text-start/text-end. A class that must follow the screen goes in physicalAllowed (scripts/source-rules.mjs) with its reason.");
  for (const [path, allowed] of Object.entries(physicalAllowed)) {
    for (const [token, reason] of Object.entries(allowed)) {
      assert.ok(reason.length > 0, `${path}: ${token} needs a reason`);
      assert.ok(physicalUtilities(path, read(path).text, {}).some((found) => found.endsWith(`: ${token}`)), `${path} no longer uses ${token}: remove it from physicalAllowed`);
    }
  }
});
