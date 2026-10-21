import assert from "node:assert/strict";
import { test } from "node:test";
import { changedLines, countDisables, describeSurvivor, disableProblems, mutateRanges, runtimeSource, survivors, testFilesFor } from "./mutation.mjs";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import { ignoreReason, isClassList, testPhases } from "./mutation/plugins.mjs";

test("runtimeSource takes component and lib code, and leaves tests, stories, types and the test kit", () => {
  for (const path of ["registry/ouro/components/ouro/button/button.tsx", "registry/ouro/components/ouro/dialog/dialog-styles.ts", "registry/ouro/lib/ouro/cn.ts"]) assert.ok(runtimeSource(path), path);
  for (const path of [
    "registry/ouro/components/ouro/button/button.test.tsx",
    "registry/ouro/components/ouro/button/button.touch.test.tsx",
    "registry/ouro/components/ouro/button/button.test-d.ts",
    "registry/ouro/components/ouro/button/button.stories.tsx",
    "registry/ouro/components/ouro/button/component.json",
    "registry/ouro/lib/ouro/env.d.ts",
    "registry/ouro/lib/ouro/testing/act.ts",
    "registry/ouro/e2e/ouro/button.spec.ts",
    "test/stories.tsx",
  ]) {
    assert.ok(!runtimeSource(path), path);
  }
});

test("changedLines reads each hunk's new lines, and a hunk that only removed lines changes none", () => {
  const diff = [
    "diff --git a/registry/a.ts b/registry/a.ts",
    "--- a/registry/a.ts",
    "+++ b/registry/a.ts",
    "@@ -3,0 +4,2 @@ context",
    "+x",
    "+y",
    "@@ -10 +12 @@",
    "-old",
    "+new",
    "@@ -20,3 +22,0 @@",
    "-gone",
    "diff --git a/registry/b.ts b/registry/b.ts",
    "--- a/registry/b.ts",
    "+++ /dev/null",
    "@@ -1,2 +0,0 @@",
    "diff --git a/registry/c.tsx b/registry/c.tsx",
    "--- /dev/null",
    "+++ b/registry/c.tsx",
    "@@ -0,0 +1,5 @@",
  ].join("\n");
  assert.deepEqual(changedLines(diff), { "registry/a.ts": [[4, 5], [12, 12]], "registry/c.tsx": [[1, 5]] });
});

test("mutateRanges names each changed range of runtime source as Stryker's path:start-end", () => {
  assert.deepEqual(
    mutateRanges({
      "registry/ouro/components/ouro/button/button.tsx": [[4, 5], [12, 12]],
      "registry/ouro/components/ouro/button/button.test.tsx": [[1, 9]],
      "scripts/x.mjs": [[1, 1]],
    }),
    ["registry/ouro/components/ouro/button/button.tsx:4-5", "registry/ouro/components/ouro/button/button.tsx:12-12"],
  );
});

test("testFilesFor runs a component file's folder's tests, and a lib file's own tests, then its importers'", () => {
  const button = testFilesFor(["registry/ouro/components/ouro/button/button.tsx"]);
  assert.ok(button.own.includes("registry/ouro/components/ouro/button/button.test.tsx"));
  assert.ok(button.own.every((file) => file.startsWith("registry/ouro/components/ouro/button/")));
  assert.deepEqual(button.wider, []);
  const handoff = testFilesFor(["registry/ouro/lib/ouro/focus-handoff.ts"]);
  assert.deepEqual(handoff.own, ["registry/ouro/lib/ouro/focus-handoff.test.tsx"]);
  for (const folder of ["alert", "message", "toast"]) assert.ok(handoff.wider.some((file) => file.startsWith(`registry/ouro/components/ouro/${folder}/`)), folder);
  assert.ok(!handoff.wider.some((file) => file.startsWith("registry/ouro/components/ouro/button/")));
});

test("survivors are the mutants that survived or that no test reached, described by place, mutator and replacement", () => {
  const results = [
    { status: "Killed", fileName: "a.ts", mutatorName: "BooleanLiteral", replacement: "false", location: { start: { line: 1, column: 0 } } },
    { status: "Survived", fileName: "a.ts", mutatorName: "ConditionalExpression", replacement: "true", location: { start: { line: 3, column: 4 } } },
    { status: "NoCoverage", fileName: "b.ts", mutatorName: "BlockStatement", replacement: "{}", location: { start: { line: 9, column: 0 } } },
    { status: "Ignored", fileName: "b.ts", mutatorName: "StringLiteral", replacement: '""', location: { start: { line: 2, column: 0 } } },
    { status: "Timeout", fileName: "b.ts", mutatorName: "UpdateOperator", replacement: "i--", location: { start: { line: 5, column: 0 } } },
  ];
  assert.deepEqual(survivors(results).map(describeSurvivor), ["a.ts:3:5 ConditionalExpression: true", "b.ts:9:1 BlockStatement: {}"]);
});

test("isClassList takes a string of Tailwind classes, and leaves words, sentences and markers", () => {
  for (const text of ["m-0 box-border flex", "forced-colors:border forced-colors:border-solid", "data-[orientation=vertical]:end-0 sm:pointer-fine:text-sm", "-translate-1/2", "[--ouro-x:calc(var(--spacing)*9)]", "!px-0"]) assert.ok(isClassList(text), text);
  for (const text of ["", "Close", "Remove menu.pdf", "is not a prop", "[ouro-ui] Button: x. Fix: y.", "menu", "sheet", "Character 1 of 6"]) assert.ok(!isClassList(text), text);
});

/** A stand-in for Babel's NodePath, enough for ignoreReason. */
function path(node, { binary, parent } = {}) {
  return {
    node,
    parentPath: parent ?? null,
    isStringLiteral: () => node.type === "StringLiteral",
    isTemplateLiteral: () => node.type === "TemplateLiteral",
    isBinaryExpression: () => node.type === "BinaryExpression",
    isStatement: () => node.type === "ExpressionStatement",
    toString: () => binary ?? "",
  };
}

test("the ouro-classes ignorer leaves out the development check, and mutates the rest", () => {
  assert.equal(ignoreReason(path({ type: "StringLiteral", value: "m-0 flex gap-2" })), undefined);
  assert.equal(ignoreReason(path({ type: "TemplateLiteral", quasis: [{ value: { cooked: "" } }, { value: { cooked: "" } }] })), undefined);
  assert.equal(ignoreReason(path({ type: "StringLiteral", value: "Close" })), undefined);
  const check = path({ type: "BinaryExpression" }, { binary: 'process.env.NODE_ENV !== "production"' });
  assert.match(ignoreReason(path({ type: "StringLiteral", value: "production" }, { parent: check })), /development check/);
  const statement = path({ type: "ExpressionStatement" });
  assert.equal(ignoreReason(path({ type: "Identifier" }, { parent: statement })), undefined);
  assert.equal(ignoreReason(path({ type: "BinaryExpression" }, { binary: "a !== b" })), undefined);
});

test("testPhases runs a mutant against its own file's tests, then its importers', and an unannounced file against every file's once", () => {
  const spec = (moduleId) => ({ moduleId });
  const byFile = new Map([
    ["registry/ouro/lib/ouro/focus-handoff.ts", { own: [spec("focus-handoff.test.tsx")], wider: [spec("alert.test.tsx"), spec("toaster.test.tsx")] }],
    ["registry/ouro/components/ouro/alert/alert.tsx", { own: [spec("alert.test.tsx")], wider: [] }],
  ]);
  assert.deepEqual(testPhases(byFile, "registry/ouro/components/ouro/alert/alert.tsx"), [[spec("alert.test.tsx")], []]);
  assert.deepEqual(testPhases(byFile, "registry/ouro/lib/ouro/focus-handoff.ts"), [[spec("focus-handoff.test.tsx")], [spec("alert.test.tsx"), spec("toaster.test.tsx")]]);
  assert.deepEqual(testPhases(byFile, ""), [[spec("focus-handoff.test.tsx"), spec("alert.test.tsx")], [spec("toaster.test.tsx")]]);
});

/** Each string in `source` (TSX) with whether the ouro-classes ignorer leaves it out. */
function strings(source) {
  const found = [];
  const ast = parse(source, { sourceType: "module", plugins: ["typescript", "jsx"] });
  (traverse.default ?? traverse)(ast, {
    "StringLiteral|TemplateLiteral"(path) {
      const text = path.isStringLiteral() ? path.node.value : path.node.quasis.map((quasi) => quasi.value.cooked).join("${}");
      found.push([text, ignoreReason(path) !== undefined]);
    },
  });
  return Object.fromEntries(found);
}

test("the ouro-classes ignorer leaves out only strings in class positions: className, cn() and cva() arguments, and *Class constants", () => {
  const found = strings(`
    const rootClass = "m-0 flex gap-2 " + "rounded-md";
    const sizes = { sm: "h-9 px-3" };
    const variants = cva("inline-flex items-center", { variants: { size: { sm: "h-8 px-2" } } });
    function Part({ open }) {
      const input = document.querySelector("a[href]");
      input.setAttribute("aria-invalid", "true");
      input.removeAttribute("aria-busy");
      input.closest("[inert]");
      return (
        <div className={cn("grid gap-1", open && "data-open:block")} data-ouro-part="thumb-label" iconClassName="size-4 shrink-0" aria-describedby="field-description">
          <span className={\`flex \${open ? "ring-2" : ""}\`} />
        </div>
      );
    }
  `);
  for (const text of ["m-0 flex gap-2 ", "rounded-md", "inline-flex items-center", "grid gap-1", "data-open:block", "size-4 shrink-0", "ring-2", "h-8 px-2"]) assert.equal(found[text], true, text);
  for (const text of ["a[href]", "aria-invalid", "aria-busy", "[inert]", "thumb-label", "field-description", "h-9 px-3"]) assert.equal(found[text], false, text);
});

test("disableProblems fails every Stryker comment a change adds to runtime source that is not next-line <Mutator>: <reason>", () => {
  const diff = [
    "+++ b/registry/ouro/components/ouro/button/button.tsx",
    "@@ -10,0 +11,6 @@",
    "+// Stryker disable all",
    "+// Stryker disable next-line ConditionalExpression: the server snapshot never changes",
    "+// Stryker disable next-line StringLiteral,ConditionalExpression: the label is decorative",
    "+// Stryker disable next-line ConditionalExpression",
    "+  // Stryker restore all",
    "+const plain = 1;",
    "+++ b/registry/ouro/components/ouro/button/button.test.tsx",
    "@@ -1,0 +1,1 @@",
    "+// Stryker disable all",
  ].join("\n");
  assert.deepEqual(disableProblems(diff), [
    "registry/ouro/components/ouro/button/button.tsx:11: // Stryker disable all",
    "registry/ouro/components/ouro/button/button.tsx:14: // Stryker disable next-line ConditionalExpression",
    "registry/ouro/components/ouro/button/button.tsx:15: // Stryker restore all",
  ]);
  assert.equal(countDisables("a // Stryker disable next-line X: y\nb /* Stryker disable all */\n"), 2);
});
