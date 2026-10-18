// The control matrix: one row per component stem, mode and interactive part, from each folder's
// component.json (`modes`, `controls`; see scripts/components.mts) and the stories that render
// each mode. test/controls.test.tsx imports the written JSON, never the manifests, so the browser
// test stays free of Node modules.
//
//   node scripts/control-matrix.mts           write test/generated/control-matrix.json
//   node scripts/control-matrix.mts --check   fail when the file is stale (CI)
//   --out <file>                              write or check another file
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { componentsDir, pascal, readComponents } from "./components.mts";

/** The mode of a component that declares none. */
export const defaultMode = "default";

export interface ControlRow {
  /** The registry item, the value of `data-ouro-control`. */
  item: string;
  stem: string;
  mode: string;
  /** The value of `data-ouro-part`. */
  part: string;
  role: string;
  portal: boolean;
  /** The story ids (`Button/AsLink`) that render this mode. */
  stories: string[];
}

export interface StoryMode {
  /** `Button/AsLink`, as test/stories.tsx keys it. */
  id: string;
  /** The story's `parameters.mode`, or the meta's; undefined when neither names one. */
  mode?: string;
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOut = "test/generated/control-matrix.json";

/** A property of an object literal, by name. */
function property(object: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
  for (const element of object.properties) {
    if (ts.isPropertyAssignment(element) && (ts.isIdentifier(element.name) || ts.isStringLiteral(element.name)) && element.name.text === name) return element.initializer;
  }
  return undefined;
}

/** The object literal under `satisfies`, `as` and parentheses. */
function objectLiteral(node: ts.Expression | undefined): ts.ObjectLiteralExpression | undefined {
  let current = node;
  while (current && (ts.isSatisfiesExpression(current) || ts.isAsExpression(current) || ts.isParenthesizedExpression(current))) current = current.expression;
  return current && ts.isObjectLiteralExpression(current) ? current : undefined;
}

/** `parameters.mode` of a meta or story object, when it is a string literal. */
function modeOf(node: ts.Expression | undefined, where: string): string | undefined {
  const parameters = objectLiteral(property(objectLiteral(node) ?? ts.factory.createObjectLiteralExpression(), "parameters"));
  const mode = parameters && property(parameters, "mode");
  if (mode === undefined) return undefined;
  if (!ts.isStringLiteral(mode)) throw new Error(`${where}: parameters.mode must be a string literal`);
  return mode.text;
}

/**
 * The stories of every `<folder>/<stem>.stories.tsx` in the components, by stem, with the mode
 * each names. A story's id is its file name in PascalCase and its export name, as
 * test/stories.tsx keys it.
 */
export function readStoryModes(root: string = repoRoot): Map<string, StoryMode[]> {
  const result = new Map<string, StoryMode[]>();
  const dir = join(root, componentsDir);
  const files = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => readdirSync(join(dir, entry.name)).filter((name) => name.endsWith(".stories.tsx")).map((name) => join(dir, entry.name, name)))
    .sort();
  for (const file of files) {
    const stem = file.replace(/^.*\/([\w-]+)\.stories\.tsx$/, "$1");
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const declarations = new Map<string, ts.Expression | undefined>();
    let metaMode: string | undefined;
    const exported: string[] = [];
    for (const statement of source.statements) {
      if (ts.isVariableStatement(statement)) {
        const isExported = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
        for (const declaration of statement.declarationList.declarations) {
          if (!ts.isIdentifier(declaration.name)) continue;
          declarations.set(declaration.name.text, declaration.initializer);
          if (isExported) exported.push(declaration.name.text);
        }
      }
      if (ts.isExportAssignment(statement)) {
        const meta = ts.isIdentifier(statement.expression) ? declarations.get(statement.expression.text) : statement.expression;
        metaMode = modeOf(meta, `${relative(root, file)} meta`);
      }
    }
    result.set(
      stem,
      exported.map((name) => {
        const mode = modeOf(declarations.get(name), `${relative(root, file)} ${name}`) ?? metaMode;
        return { id: `${pascal(stem)}/${name}`, ...(mode === undefined ? {} : { mode }) };
      }),
    );
  }
  return result;
}

/** Every row: each stem's declared parts in each mode they render in, with the stories of that mode. */
export function buildMatrix(root: string = repoRoot): ControlRow[] {
  const storyModes = readStoryModes(root);
  return readComponents(root).flatMap((component) => {
    const modes = component.modes ?? [defaultMode];
    const entries = storyModes.get(component.stem) ?? [];
    return modes.flatMap((mode) => {
      const stories = entries.filter((entry) => (entry.mode ?? modes[0]) === mode).map((entry) => entry.id);
      return (component.controls ?? [])
        .filter((control) => control.modes === undefined || control.modes.includes(mode))
        .map((control) => ({ item: component.name, stem: component.stem, mode, part: control.part, role: control.role, portal: control.portal, stories }));
    });
  });
}

function main(argv: string[]): number {
  const outIndex = argv.indexOf("--out");
  const out = resolve(outIndex >= 0 ? argv[outIndex + 1]! : join(repoRoot, defaultOut));
  const text = JSON.stringify(buildMatrix(), null, 2) + "\n";
  if (argv.includes("--check")) {
    const current = existsSync(out) ? readFileSync(out, "utf8") : "";
    if (current !== text) {
      process.stderr.write(`${relative(process.cwd(), out)} is stale. Run pnpm controls:matrix and commit the result.\n`);
      return 1;
    }
    return 0;
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, text);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
