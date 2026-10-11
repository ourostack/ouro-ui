// Spec §4.6: the type check and the editor's hover tell an agent the fix. Runs `tsc` and the
// TypeScript language service on fixtures/agent-types/app.tsx, which makes the mistakes
// agents make, and checks them against fixtures/agent-types/cases.ts. The development
// messages, the third channel, are checked in test/agent-types.test.tsx.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { agentCases, validSnippets } from "./fixtures/agent-types/cases.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDir = join(root, "scripts/fixtures/agent-types");
const app = join(fixtureDir, "app.tsx");
const lines = readFileSync(app, "utf8").split("\n");
const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");

/** The 1-based line of `export const <id> =` in the fixture. */
function lineOf(id) {
  const index = lines.findIndex((line) => line.startsWith(`export const ${id} =`));
  assert.notEqual(index, -1, `no ${id} in the fixture`);
  return index + 1;
}

/** Top-level members of a printed union, ignoring `|` inside parentheses and braces. */
function members(union) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < union.length; i++) {
    const char = union[i];
    if (char === "(" || char === "{") depth++;
    else if (char === ")" || char === "}") depth--;
    else if (depth === 0 && union.startsWith(" | ", i)) {
      parts.push(union.slice(start, i));
      start = i + 3;
    }
  }
  return [...parts, union.slice(start)].sort();
}

/** Compares two `tsc` messages; a union target is compared as a set of members. */
function assertSameMessage(actual, expected, label) {
  assert.doesNotMatch(actual, /\.\.\. \d+ more/, `${label}: tsc truncated the type`);
  const pattern = /^(error TS\d+: Type '.*?' is not assignable to type ')(.*)('\.)$/s;
  const [a, e] = [pattern.exec(actual), pattern.exec(expected)];
  if (a && e && e[2].includes(" | ") && !e[2].startsWith("{")) {
    assert.equal(a[1], e[1], label);
    assert.deepEqual(members(a[2]), members(e[2]), label);
  } else {
    assert.equal(actual, expected, label);
  }
}

test("every snippet names the fix in at least one channel", () => {
  for (const item of agentCases) {
    assert.ok(item.names.length > 0, item.id);
    assert.equal(item.names.includes("dev"), item.dev !== undefined, `${item.id}: dev`);
    assert.equal(item.names.includes("hover"), item.hover !== undefined, `${item.id}: hover`);
  }
  const ids = lines.flatMap((line) => /^export const (\w+) =/.exec(line)?.[1] ?? []);
  assert.deepEqual(ids, [...agentCases.map((item) => item.id), ...validSnippets]);
});

test("tsc reports exactly the expected errors, naming the fix where the case says so", () => {
  const result = spawnSync(process.execPath, [tsc, "-p", fixtureDir, "--pretty", "false"], { cwd: root, encoding: "utf8" });
  // Each error starts with `file(line,col): `; continuation lines are indented.
  const errors = new Map();
  let last;
  for (const line of result.stdout.split("\n")) {
    const match = /^scripts\/fixtures\/agent-types\/app\.tsx\((\d+),\d+\): (error TS\d+: .*)$/.exec(line);
    if (match) {
      last = [...(errors.get(Number(match[1])) ?? []), match[2]];
      errors.set(Number(match[1]), last);
    } else if (line.startsWith(" ") && last) {
      last[last.length - 1] += `\n${line}`;
    } else {
      assert.equal(line, "", `unexpected tsc output: ${line}`);
    }
  }
  for (const id of validSnippets) assert.equal(errors.get(lineOf(id)), undefined, `${id} is valid`);
  for (const item of agentCases) {
    const actual = errors.get(lineOf(item.id)) ?? [];
    assert.equal(actual.length, item.tsc.length, `${item.id}: ${actual.join("\n")}`);
    item.tsc.forEach((expected, index) => assertSameMessage(actual[index], expected, item.id));
  }
  assert.equal(errors.size, agentCases.length);
});

test("hovering any prop shows its JSDoc, including on elements with a type error", () => {
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
  const source = service.getProgram().getSourceFile(app);
  /** The hover JSDoc of each attribute on the snippet's outer element. */
  const hovers = (id) => {
    const statement = source.statements.find(
      (node) => ts.isVariableStatement(node) && node.declarationList.declarations[0].name.getText(source) === id,
    );
    const element = statement.declarationList.declarations[0].initializer;
    const attributes = ts.isJsxSelfClosingElement(element) ? element.attributes : element.openingElement.attributes;
    return new Map(
      attributes.properties.map((attribute) => [
        attribute.name.getText(source),
        ts.displayPartsToString(service.getQuickInfoAtPosition(app, attribute.name.getStart(source))?.documentation),
      ]),
    );
  };
  for (const id of [...agentCases.filter((item) => !item.hoverLost).map((item) => item.id), ...validSnippets]) {
    for (const [prop, doc] of hovers(id)) assert.notEqual(doc, "", `${id}: hover on ${prop} shows no JSDoc`);
  }
  for (const item of agentCases.filter((item) => item.hoverLost)) {
    assert.ok([...hovers(item.id).values()].every((doc) => doc === ""), `${item.id} has hover now; drop hoverLost`);
  }
  for (const item of agentCases.filter((item) => item.hover)) {
    assert.ok(hovers(item.id).get(item.hover.prop).includes(item.hover.doc), `${item.id}: hover on ${item.hover.prop}`);
  }
  // Guard props carry their redirect text.
  assert.equal(hovers("s04").get("asChild"), "Not a prop. To render a link, pass `href`: `<Button href=\"/recipes\">`. For other elements, use parts.");
  assert.equal(hovers("s08").get("variant"), "Not a prop. Text has no variants; use `size` and `tone`: `<Text size=\"sm\" tone=\"muted\">`.");

  // A hint member accepts nothing, so completion offers only the real values.
  const line = lineOf("s01");
  const offset = lines.slice(0, line - 1).join("\n").length + 1 + lines[line - 1].indexOf('"ghost"') + 1;
  const completions = service.getCompletionsAtPosition(app, offset, {});
  assert.deepEqual(completions?.entries.map((entry) => entry.name).sort(), ["outline", "plain", "soft", "solid"]);
});
