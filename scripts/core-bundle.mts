// Core's A2UI module, vendored as one file. Core (ourostack/ouro-ui-core) splits it into src/composed.mts (Ouro's own
// composed-UI tree), src/mcp-app.mts and src/a2ui.mts, which import each other with relative `.mts` paths. An app
// that adds a registry item must not need `allowImportingTsExtensions`, so web ships them joined into one file
// with no relative imports: each module's text in order, with the imports and re-exports between them taken out.
// Nothing else changes, so every line is still core's.
//
//   node scripts/core-bundle.mts --update <tag>   fetch core's files at <tag>, write them and pin them in core.json
//   node scripts/core-bundle.mts --check          fetch the pinned tag again and fail if a vendored file differs
//
// test/fixtures/a2ui/core.json pins the tag, each source's SHA-256 and each written file's; test/a2ui.test.ts checks
// the written files against those pins on every run.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "./ts71.mts";

export type Module = { path: string; source: string };

/** The names a module declares at its top level. */
function declared(file: ts.SourceFile): string[] {
  const names: string[] = [];
  for (const statement of file.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) if (ts.isIdentifier(declaration.name)) names.push(declaration.name.text);
    } else if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement) || ts.isEnumDeclaration(statement)) && statement.name) {
      names.push(statement.name.text);
    }
  }
  return names;
}

const relative = (node: ts.Statement): boolean =>
  (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && !!node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text.startsWith(".");

/**
 * Joins modules, each after the ones it imports, into one: every import and re-export between them is taken out, since
 * the names are then declared and exported in the same file. Throws when two modules declare the same name, when a
 * module imports one that is not given, or when a re-export renames (which joining cannot keep).
 */
export function bundleCore(modules: Module[], banner: string): string {
  const seen = new Map<string, string>();
  const given = new Set(modules.map((module) => module.path.split("/").at(-1)));
  const parts = modules.map((module, index) => {
    const file = ts.createSourceFile(module.path, module.source, ts.ScriptKind.TS);
    for (const name of declared(file)) {
      const other = seen.get(name);
      if (other) throw new Error(`${module.path} and ${other} both declare ${name}; they cannot share one file.`);
      seen.set(name, module.path);
    }
    let text = module.source;
    const cuts = file.statements.filter(relative).reverse();
    for (const statement of cuts) {
      const specifier = ((statement as ts.ImportDeclaration | ts.ExportDeclaration).moduleSpecifier as ts.StringLiteral).text;
      if (!given.has(specifier.split("/").at(-1))) throw new Error(`${module.path} imports ${specifier}, which is not bundled.`);
      if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause) && statement.exportClause.elements.some((element) => element.propertyName)) {
        throw new Error(`${module.path} re-exports ${specifier} under another name; joining cannot keep that.`);
      }
      let end = statement.getEnd();
      if (text[end] === "\n") end += 1;
      // A blank line on both sides of the cut becomes one.
      if (text[end] === "\n" && text.slice(0, statement.getStart()).endsWith("\n\n")) end += 1;
      text = text.slice(0, statement.getStart()) + text.slice(end);
    }
    if (index > 0) return text;
    // No comment goes before the first statement (shadcn's CLI drops it when the registry installs the file), so the
    // banner follows it.
    const first = file.statements[0]!;
    const end = first.getEnd() + (text[first.getEnd()] === "\n" ? 1 : 0);
    return `${text.slice(0, end)}\n${banner}\n${text.slice(end)}`;
  });
  return parts.map((part) => part.replace(/\n+$/, "\n")).join("\n");
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

type Pin = { from: string; sha256: string; bundled?: Record<string, string> };
type Core = { repository: string; coreTag: string; note: string; files: Record<string, Pin> };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const corePath = join(root, "test/fixtures/a2ui/core.json");

async function fetchCore(repository: string, tag: string, path: string): Promise<string> {
  const url = `https://raw.githubusercontent.com/${repository}/${tag}/${path}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.text();
}

/** The modules a bundled file joins, in order: core's composed tree, its MCP Apps helpers, then the A2UI adapter. */
export const A2UI_MODULES = ["src/composed.mts", "src/mcp-app.mts", "src/a2ui.mts"];

const bannerFor = (repository: string, tag: string) =>
  [
    `// Vendored from ${repository} ${tag}: ${A2UI_MODULES.join(", ")}, joined into one file by scripts/core-bundle.mts`,
    "// with the imports between them taken out. Never edit it: run `node scripts/core-bundle.mts --update <tag>`.",
  ].join("\n");

/** Every file core.json pins, as core's release at `tag` writes it. */
async function build(core: Core, tag: string): Promise<{ files: Record<string, string>; pins: Record<string, Pin> }> {
  const files: Record<string, string> = {};
  const pins: Record<string, Pin> = {};
  for (const [path, pin] of Object.entries(core.files)) {
    if (path === "registry/ouro/lib/ouro/a2ui-core.ts") {
      const modules = await Promise.all(A2UI_MODULES.map(async (from) => ({ path: from, source: await fetchCore(core.repository, tag, from) })));
      files[path] = bundleCore(modules, bannerFor(core.repository, tag));
      pins[path] = { from: "src/a2ui.mts", bundled: Object.fromEntries(modules.map((module) => [module.path, sha256(module.source)])), sha256: sha256(files[path]) };
    } else {
      files[path] = await fetchCore(core.repository, tag, pin.from);
      pins[path] = { from: pin.from, sha256: sha256(files[path]) };
    }
  }
  return { files, pins };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const core = JSON.parse(readFileSync(corePath, "utf8")) as Core;
  const [mode, tag] = process.argv.slice(2);
  if (mode === "--update" && tag) {
    const { files, pins } = await build(core, tag);
    for (const [path, text] of Object.entries(files)) writeFileSync(join(root, path), text);
    writeFileSync(corePath, `${JSON.stringify({ ...core, coreTag: tag, files: pins }, null, 2)}\n`);
    console.log(`Vendored ${Object.keys(files).length} files from ${core.repository} ${tag}.`);
  } else if (mode === "--check") {
    const { files } = await build(core, core.coreTag);
    const differ = Object.entries(files).filter(([path, text]) => readFileSync(join(root, path), "utf8") !== text).map(([path]) => path);
    if (differ.length > 0) {
      console.error(`${differ.join(", ")} differ from ${core.repository} ${core.coreTag}. Fix: node scripts/core-bundle.mts --update ${core.coreTag}`);
      process.exit(1);
    }
    console.log(`${Object.keys(files).length} vendored files match ${core.repository} ${core.coreTag}.`);
  } else {
    console.error("Usage: node scripts/core-bundle.mts --update <tag> | --check");
    process.exit(2);
  }
}
