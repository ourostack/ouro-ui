// Part names: every element a registry component styles carries `data-slot`, a stable name an app
// that styles with plain CSS (no Tailwind), a test or an agent can target, as shadcn/ui's parts do
// (docs/guides/part-names.md). A root's name is its stem (`dialog`); a part's is the stem and the
// part (`dialog-title`), so two components' own parts never share a name.
//
// `partNames` reads the components' runtime source (and `lib/ouro`'s components) with the TypeScript
// compiler and returns every name, by stem, and the problems:
// - an HTML or SVG element, or a package's component (Base UI's parts), with a `className` and no
//   `data-slot`, or the props object of a `createElement` root with a `className` and none (an Ouro
//   component such as Button names its own root, so a name on it is optional);
// - an Ouro Heading or Text with no `data-slot`: their own names say what they are, not which part;
// - a `data-slot` that is not a string literal, that comes after a `{...spread}` (it would override
//   a parent's name for the part), or a name that is not kebab case or does not start with its stem;
// - a runtime file that belongs to no stem.
// Field's root writes `data-slot={owner.data}`, the same expression as its `data-ouro`, which is
// allowed; each owner's `{ name: "FileField", data: "file-field" }` registers that name for its own
// file. `pnpm run docs` lists each component's names on its page from here, and
// scripts/part-names.test.mjs fails on any problem.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { componentsDir, MANIFEST } from "./components.mts";
import { treeFiles } from "./tree.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
export const libDir = "registry/ouro/lib/ouro/";

/** One `data-slot` written in the source. */
export interface PartName {
  /** The stem whose files write it: `dialog` for dialog.tsx, dialog-parts.tsx and dialog-styles.ts. */
  stem: string;
  /** The name: `dialog-title`. */
  name: string;
  /** `<file>:<line>`, repository-relative. */
  where: string;
}

/** A part name: kebab case, lower-case letters and digits. */
export const partNamePattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

const runtimeFile = (file: string) => file.endsWith(".tsx") && !/\.(test|test-d|stories)\.tsx$|\.[a-z-]+\.test\.tsx$/.test(file);

/** The stem a component file belongs to: the longest of its folder's stems that names it (`checkbox-group.tsx` is `checkbox-group`'s). */
function stemOf(file: string, stems: string[]): string | undefined {
  const name = basename(file);
  return [...stems].sort((a, b) => b.length - a.length).find((stem) => name === `${stem}.tsx` || name.startsWith(`${stem}-`));
}

/** The literal `data-ouro` values a folder's runtime files write: names a part may also start with (Toaster's `toast`). */
function rootNames(files: string[]): Set<string> {
  const names = new Set<string>();
  for (const file of files) for (const match of readFileSync(file, "utf8").matchAll(/data-ouro="([a-z0-9-]+)"/g)) names.add(match[1]!);
  return names;
}

/** The files to read, each with its stem and the prefixes its names may start with. */
function sources(root: string): { file: string; stem: string | undefined; prefixes: Set<string> }[] {
  const found: { file: string; stem: string | undefined; prefixes: Set<string> }[] = [];
  const components = join(root, componentsDir);
  for (const folder of readdirSync(components)) {
    const manifest = join(components, folder, MANIFEST);
    if (!existsSync(manifest)) continue;
    const stems = (JSON.parse(readFileSync(manifest, "utf8")) as { components: string[] }).components;
    const files = treeFiles(join(components, folder))
      .filter((file: string) => runtimeFile(basename(file)))
      .map((file: string) => join(components, folder, file));
    const roots = rootNames(files);
    for (const file of files) {
      const stem = stemOf(file, stems);
      found.push({ file, stem, prefixes: new Set(stem ? [stem, ...roots] : []) });
    }
  }
  const lib = join(root, libDir);
  for (const file of readdirSync(lib).filter(runtimeFile)) {
    const stem = file.replace(/\.tsx$/, "");
    found.push({ file: join(lib, file), stem, prefixes: new Set([stem]) });
  }
  return found;
}

/** The value of a JSX attribute, when it is a string literal (`="x"` or `={"x"}`). */
function literal(attribute: ts.JsxAttribute): string | undefined {
  const value = attribute.initializer;
  if (!value) return undefined;
  if (ts.isStringLiteral(value)) return value.text;
  if (ts.isJsxExpression(value) && value.expression && ts.isStringLiteral(value.expression)) return value.expression.text;
  return undefined;
}

/** The names a file imports from packages (`@base-ui/react/dialog`, `recharts`), not from the registry (`@/…`) or a relative path. */
function packageImports(source: ts.SourceFile): Set<string> {
  const found = new Set<string>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const from = statement.moduleSpecifier.text;
    if (from.startsWith("@/") || from.startsWith(".")) continue;
    const clause = statement.importClause;
    if (clause?.name) found.add(clause.name.text);
    const bindings = clause?.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) found.add(bindings.name.text);
    if (bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements) found.add(element.name.text);
  }
  return found;
}

/** Ouro's type components, whose own names (`heading`, `text`) say what they are, not which part: a component that draws one names it (`card-title`). */
const typography = new Set(["Heading", "Text"]);

/**
 * Whether an element's classes land on an element this file must name: an HTML or SVG element
 * (`div`, `svg`), or a package's component (`BaseDialog.Popup`), which names nothing itself. An
 * Ouro component (`Button`, a local `Bar`) names its own root where it is written, so a
 * `data-slot` on it is optional: a parent gives one only to rename that part (`<Button
 * data-slot="carousel-next">`), and only where the component passes it on.
 */
function styledHere(tag: string, outside: Set<string>): boolean {
  return /^[a-z]/.test(tag) || outside.has(tag.split(".")[0]!);
}

/**
 * Every `data-slot` name the registry's runtime source writes, and the problems: an HTML or SVG
 * element, or a package's component, with a `className` and no `data-slot`, a `data-slot` that is not a string literal, and a name
 * that is not kebab case or does not start with its stem (or a `data-ouro` value its folder writes).
 */
export function partNames(root: string = repoRoot): { names: PartName[]; problems: string[] } {
  const names: PartName[] = [];
  const problems: string[] = [];
  for (const { file, stem, prefixes } of sources(root)) {
    if (stem === undefined) {
      problems.push(`${relative(root, file)} belongs to no component its folder's component.json lists, so its parts have no stem. Fix: name the file <stem>.tsx or <stem>-<part>.tsx.`);
      continue;
    }
    const text = readFileSync(file, "utf8");
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const outside = packageImports(source);
    const check = (where: string, label: string, name: string): void => {
      if (!partNamePattern.test(name)) problems.push(`${where} ${label}: a part name is kebab case. Fix: data-slot="${stem}-<part>".`);
      else if (![...prefixes].some((prefix) => name === prefix || name.startsWith(`${prefix}-`))) problems.push(`${where} ${label}: a part name starts with its stem. Fix: data-slot="${stem}-${name}".`);
      else names.push({ stem, name, where });
    };
    const visit = (node: ts.Node): void => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const where = `${relative(root, file)}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`;
        const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
        const named = (name: string) => attributes.find((attribute) => attribute.name.getText(source) === name);
        const slot = named("data-slot");
        const tag = node.tagName.getText(source);
        const spread = node.attributes.properties.findIndex(ts.isJsxSpreadAttribute);
        if (slot && spread !== -1 && spread < node.attributes.properties.indexOf(slot)) problems.push(`${where} <${tag}>'s data-slot comes after a spread, so it overrides a parent's name for the part. Fix: write data-slot first.`);
        if (slot) {
          const name = literal(slot);
          // A shared root that writes its owner's `data-ouro` (Field's `owner.data`) is named the same.
          const sameAsRoot = name === undefined && slot.initializer !== undefined && named("data-ouro")?.initializer?.getText(source) === slot.initializer.getText(source);
          if (sameAsRoot) {
            // Its names are the owners' literal `data-slot`s where they render it.
          } else if (name === undefined) problems.push(`${where} <${tag}>'s data-slot is not a string literal. Fix: data-slot="${stem}-<part>".`);
          else check(where, `<${tag} data-slot="${name}">`, name);
        } else if (named("className") && styledHere(tag, outside)) {
          problems.push(`${where} <${tag}> carries classes but no part name. Fix: data-slot="${stem}-<part>" (docs/guides/part-names.md).`);
        } else if (typography.has(tag) && !outside.has(tag)) {
          problems.push(`${where} <${tag}> draws a part with no name of its own. Fix: data-slot="${stem}-<part>", such as "${stem}-title" (docs/guides/part-names.md).`);
        }
      }
      // A Field owner (`{ name: "FileField", data: "file-field" }`) names the Field root it renders: Field writes `data-slot={owner.data}`.
      if (ts.isObjectLiteralExpression(node)) {
        const entry = (name: string) => node.properties.find((property): property is ts.PropertyAssignment => ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) && property.name.text === name);
        const [ownerName, data] = [entry("name")?.initializer, entry("data")?.initializer];
        if (ownerName && data && ts.isStringLiteral(ownerName) && ts.isStringLiteral(data)) {
          prefixes.add(data.text);
          check(`${relative(root, file)}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`, `{ data: "${data.text}" }`, data.text);
        }
      }
      // A root built with `createElement(element, { "data-slot": "card", ...rest, className })` is held the same way.
      if (ts.isCallExpression(node) && node.expression.getText(source) === "createElement" && node.arguments[1] && ts.isObjectLiteralExpression(node.arguments[1])) {
        const where = `${relative(root, file)}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`;
        const property = (name: string) => node.arguments[1]!.properties.find((entry): entry is ts.PropertyAssignment => ts.isPropertyAssignment(entry) && (ts.isStringLiteral(entry.name) || ts.isIdentifier(entry.name)) && entry.name.text === name);
        const slot = property("data-slot");
        const name = slot && ts.isStringLiteral(slot.initializer) ? slot.initializer.text : undefined;
        if (slot && name === undefined) problems.push(`${where} createElement's data-slot is not a string literal. Fix: "data-slot": "${stem}-<part>".`);
        else if (name !== undefined) check(where, `createElement({ "data-slot": "${name}" })`, name);
        else if (property("className")) problems.push(`${where} createElement carries classes but no part name. Fix: "data-slot": "${stem}" (docs/guides/part-names.md).`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return { names, problems };
}

/** Each stem's names, sorted and without repeats. */
export function namesByStem(root: string = repoRoot): Map<string, string[]> {
  const byStem = new Map<string, Set<string>>();
  for (const { stem, name } of partNames(root).names) byStem.set(stem, (byStem.get(stem) ?? new Set()).add(name));
  return new Map([...byStem].map(([stem, set]) => [stem, [...set].sort()]));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const only = process.argv.slice(2);
  const { problems } = partNames();
  const shown = only.length > 0 ? problems.filter((problem) => only.some((path) => problem.startsWith(path))) : problems;
  for (const problem of shown) console.log(problem);
  console.log(`${shown.length} element(s) without a part name or with a bad one.`);
  process.exitCode = shown.length > 0 ? 1 : 0;
}
