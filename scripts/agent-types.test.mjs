// Spec §4.6: the type check and the editor's hover tell an agent the fix. Runs `tsc`
// and the TypeScript language service on fixtures/agent-types/app.tsx, which makes the
// mistakes agents with shadcn/ui habits make.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDir = join(root, "scripts/fixtures/agent-types");
const app = join(fixtureDir, "app.tsx");
const text = readFileSync(app, "utf8");
const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");

/** The 1-based line of `export const <name> =` in the fixture. */
function lineOf(name) {
  const index = text.split("\n").findIndex((line) => line.startsWith(`export const ${name} =`));
  assert.notEqual(index, -1, `no ${name} in the fixture`);
  return index + 1;
}

test("tsc names the fix for guard props and for shadcn's variants and sizes", () => {
  const result = spawnSync(process.execPath, [tsc, "-p", fixtureDir, "--pretty", "false"], { cwd: root, encoding: "utf8" });
  const errors = new Map();
  for (const line of result.stdout.split("\n")) {
    const match = /^scripts\/fixtures\/agent-types\/app\.tsx\((\d+),\d+\): (error TS\d+: .*)$/.exec(line);
    if (match) errors.set(Number(match[1]), [...(errors.get(Number(match[1])) ?? []), match[2]]);
    else assert.equal(line, "", `unexpected tsc output: ${line}`);
  }
  // Union members print in the order the compiler created their types, which is not the
  // order they are written in; every member prints, because the union stays short.
  const variants = `(string & { 'From shadcn? Use tone="destructive" or tone="secondary". default is "solid"; ghost and link are "plain"': never; }) | "solid" | "soft" | "outline" | "plain" | undefined`;
  const sizes = `"sm" | "lg" | (string & { 'From shadcn? default is "md"; for icon, pass aria-label with the icon as children': never; }) | "md" | undefined`;
  const expected = new Map([
    [lineOf("button"), [`error TS2322: Type 'boolean' is not assignable to type '{ 'Use <Button loading>': never; }'.`]],
    [lineOf("sheet"), [`error TS2322: Type 'boolean' is not assignable to type '{ 'Use <Sheet open={open} onOpenChange={setOpen}>': never; }'.`]],
    [lineOf("dialog"), [`error TS2322: Type 'boolean' is not assignable to type '{ 'Use <Dialog open={open} onOpenChange={setOpen}>': never; }'.`]],
    [lineOf("confirm"), [`error TS2322: Type 'boolean' is not assignable to type '{ 'Use <ConfirmDialog open={open} onOpenChange={setOpen}>': never; }'.`]],
    ...["destructive", "default", "secondary", "ghost", "link"].map((value) => [
      lineOf(value === "default" ? "variantDefault" : value),
      [`error TS2322: Type '"${value}"' is not assignable to type '${variants}'.`],
    ]),
    [lineOf("sizeDefault"), [`error TS2322: Type '"default"' is not assignable to type '${sizes}'.`]],
    [lineOf("icon"), [`error TS2322: Type '"icon"' is not assignable to type '${sizes}'.`]],
  ]);
  assert.deepEqual(errors, expected);
});

test("hovering a prop shows its JSDoc, even on an element with a type error", () => {
  const config = ts.getParsedCommandLineOfConfigFile(join(fixtureDir, "tsconfig.json"), {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => assert.fail(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")),
  });
  const service = ts.createLanguageService(
    {
      getCompilationSettings: () => config.options,
      getScriptFileNames: () => config.fileNames,
      getScriptVersion: () => "1",
      getScriptSnapshot: (fileName) => {
        const source = ts.sys.readFile(fileName);
        return source === undefined ? undefined : ts.ScriptSnapshot.fromString(source);
      },
      getCurrentDirectory: () => fixtureDir,
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      fileExists: ts.sys.fileExists,
      readFile: ts.sys.readFile,
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      getDirectories: ts.sys.getDirectories,
    },
    ts.createDocumentRegistry(),
  );
  /** The JSDoc the editor shows when hovering `prop` in the element `name`. */
  const hover = (name, prop) => {
    const line = text.split("\n")[lineOf(name) - 1];
    const column = line.search(new RegExp(`\\s${prop}[=\\s/>]`)) + 1;
    assert.ok(column > 0, `no ${prop} in ${name}`);
    const offset = text.split("\n").slice(0, lineOf(name) - 1).join("\n").length + 1 + column;
    const info = service.getQuickInfoAtPosition(app, offset);
    return ts.displayPartsToString(info?.documentation);
  };
  const cases = [
    ["button", "loading", /^Shows a centered spinner/],
    ["button", "tone", /^Color role from the theme/],
    ["button", "isLoading", /^Not a prop\. Ouro UI uses `loading`: `<Button loading>`\.$/],
    ["destructive", "loading", /^Shows a centered spinner/],
    ["destructive", "variant", /^Visual weight/],
    ["sheet", "title", /^Names the sheet for screen readers/],
    ["sheet", "trigger", /^The element that opens the sheet/],
    ["sheet", "isOpen", /^Not a prop\. Ouro UI uses `open` with `onOpenChange`/],
    ["dialog", "title", /^Names the dialog for screen readers/],
    ["dialog", "trigger", /^The element that opens the dialog/],
    ["dialog", "isOpen", /^Not a prop\. Ouro UI uses `open` with `onOpenChange`/],
    ["confirm", "title", /^The question, which names the dialog/],
    ["confirm", "tone", /^The confirm button's color role/],
    ["confirm", "trigger", /^The element that opens the confirmation/],
    ["confirm", "isOpen", /^Not a prop\. Ouro UI uses `open` with `onOpenChange`/],
  ];
  for (const [name, prop, doc] of cases) assert.match(hover(name, prop), doc, `${name} ${prop}`);

  // The hint member accepts nothing, so completion offers only the real values.
  const line = lineOf("ghost");
  const offset = text.split("\n").slice(0, line - 1).join("\n").length + 1 + text.split("\n")[line - 1].indexOf('"ghost"') + 1;
  const completions = service.getCompletionsAtPosition(app, offset, {});
  assert.deepEqual(completions?.entries.map((entry) => entry.name).sort(), ["outline", "plain", "soft", "solid"]);
});
