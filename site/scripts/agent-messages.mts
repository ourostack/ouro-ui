// Type-checks each "Agents read the types" example (site/src/agents/examples.ts) against
// the real Button, with the repository's own compiler options, and writes what an agent
// sees to site/src/generated/agent-messages.json:
//
// - `error`: the diagnostic as `tsc` prints it (`error TS2322: …`);
// - `source`: the flagged prop's declaration and JSDoc in the installed Button source,
//   which the agent can open because the code is copied into its app. (An editor's hover
//   is not quoted: on a union of props, as Button's are, TypeScript's quick info shows no
//   JSDoc at the JSX attribute.)
//
// `--check` exits 1 when the committed file differs. `--out <file>` writes elsewhere, for tests.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { agentExamples } from "../src/agents/examples.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const out = outIndex === -1 ? join(root, "site/src/generated/agent-messages.json") : (args[outIndex + 1] ?? "");
const check = args.includes("--check");

const config = ts.getParsedCommandLineOfConfigFile(join(root, "tsconfig.json"), {}, {
  ...ts.sys,
  onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
    throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
  },
});
if (!config) throw new Error("cannot read tsconfig.json");

// One in-memory file per example, as an agent would write it in an app.
const files = new Map(
  agentExamples.map((example) => [
    join(root, "site/.agent-examples", `${example.id}.tsx`),
    `import { Button } from "@/registry/ouro/components/ouro/button/button";\n\nexport const example = (\n  ${example.code.replace(/\n/g, "\n  ")}\n);\n`,
  ]),
);
// A language service over those files gives both the diagnostics `tsc` reports and the
// quick info an editor shows on hover.
const service = ts.createLanguageService(
  {
    getCompilationSettings: () => config.options,
    getScriptFileNames: () => [...files.keys()],
    getScriptVersion: () => "1",
    getScriptSnapshot: (fileName) => {
      const text = files.get(fileName) ?? ts.sys.readFile(fileName);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => root,
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: (fileName) => files.has(fileName) || ts.sys.fileExists(fileName),
    readFile: (fileName) => files.get(fileName) ?? ts.sys.readFile(fileName),
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  },
  ts.createDocumentRegistry(),
);
const program = service.getProgram()!;

function findAttribute(node: ts.Node, name: string): ts.JsxAttribute | undefined {
  if (ts.isJsxAttribute(node) && node.name.getText() === name) return node;
  return ts.forEachChild(node, (child) => findAttribute(child, name));
}

const buttonFile = join(root, "registry/ouro/components/ouro/button/button.tsx");
const installedPath = "components/ouro/button/button.tsx";

/** The prop's declaration in Button's props interface, with its JSDoc as one line. */
function declaration(prop: string): { file: string; doc: string; code: string } {
  const file = program.getSourceFile(buttonFile)!;
  const checker = program.getTypeChecker();
  let found: ts.PropertySignature | undefined;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isInterfaceDeclaration(node) && node.name.text === "ButtonBaseProps") {
      found = node.members.find((member): member is ts.PropertySignature => ts.isPropertySignature(member) && member.name.getText(file) === prop);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (!found) throw new Error(`ButtonBaseProps has no ${prop}`);
  const doc = ts.displayPartsToString(checker.getSymbolAtLocation(found.name)!.getDocumentationComment(checker)).replace(/\s*\n\s*/g, " ").trim();
  if (!doc) throw new Error(`ButtonBaseProps.${prop} has no JSDoc`);
  return { file: installedPath, doc, code: found.getText(file) };
}

const output: Record<string, { error: string; source: { file: string; doc: string; code: string } }> = {};
for (const example of agentExamples) {
  const fileName = join(root, "site/.agent-examples", `${example.id}.tsx`);
  const source = program.getSourceFile(fileName)!;
  const diagnostics = [...service.getSyntacticDiagnostics(fileName), ...service.getSemanticDiagnostics(fileName)];
  if (diagnostics.length !== 1) {
    const text = diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")).join("\n");
    throw new Error(`${example.id}: expected exactly one type error, got ${diagnostics.length}\n${text}`);
  }
  const [diagnostic] = diagnostics as [ts.Diagnostic];
  if (!findAttribute(source, example.prop)) throw new Error(`${example.id}: no ${example.prop} attribute in the example`);
  output[example.id] = {
    error: `error TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`,
    source: declaration(example.prop),
  };
}

const text = `${JSON.stringify(output, null, 2)}\n`;
if (check) {
  let current = "";
  try {
    current = readFileSync(out, "utf8");
  } catch {
    // Missing counts as stale.
  }
  if (current !== text) {
    console.error(`${out} is stale. Run: node site/scripts/agent-messages.mts`);
    process.exit(1);
  }
} else {
  writeFileSync(out, text);
}
