// Part names (docs/guides/part-names.md): the elements a registry component styles carry a
// `data-slot`, a stable name an app that styles with plain CSS, a test or an agent can target, as
// shadcn/ui's parts do. A root's name is its stem (`dialog`); a part's is the stem and the part
// (`dialog-title`), or shadcn's own name where Ouro's part is the same thing (`input`, `label`).
//
// The named components (`named` in part-names-baseline.json) are strict: every styled element in
// them carries a name, and each name is a literal, kebab case, starts with its stem or is one of
// its shadcn names (`shadcnNames`). Every other component is a ratchet: `unnamed` in the baseline
// counts its styled elements with no name, and the count may only shrink. `node scripts/part-names.mts`
// lists the problems, `--list` every unnamed element, and `--write` rewrites the baseline's counts
// once a component's parts are named.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "./ts71.mts";
import { componentsDir, MANIFEST } from "./components.mts";
import { treeFiles } from "./tree.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
export const libDir = "registry/ouro/lib/ouro/";
export const baselinePath = "scripts/part-names-baseline.json";

/** shadcn's name for a part where Ouro's part is the same thing, beside the names that start with the stem. */
export const shadcnNames: Record<string, string[]> = {
  "text-field": ["input"],
  field: ["label"],
};

export interface Baseline {
  /** Components whose every styled element is named. */
  named: string[];
  /** Each other component's count of styled elements with no name, for components with any. */
  unnamed: Record<string, number>;
}

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

interface Source {
  file: string;
  stem: string | undefined;
  prefixes: Set<string>;
}

/** The files to read, each with its stem and the prefixes its names may start with. */
function sources(root: string): Source[] {
  const found: Source[] = [];
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

/** Whether a name is valid for its stem: kebab case, and its stem (or a prefix a folder's roots add), or one of its shadcn names. */
function nameProblem(name: string, stem: string, prefixes: Set<string>): string | undefined {
  if (!partNamePattern.test(name)) return "a part name is kebab case";
  if ([...prefixes].some((prefix) => name === prefix || name.startsWith(`${prefix}-`))) return undefined;
  if ((shadcnNames[stem] ?? []).includes(name)) return undefined;
  return "a part name starts with its stem";
}

export interface PartScan {
  names: PartName[];
  /** Problems in the named components: an unnamed styled element, or a name that is not valid. */
  problems: string[];
  /** Each unnamed styled element of the other components, by stem: `<file>:<line>`. */
  unnamed: Map<string, string[]>;
}

/**
 * Every `data-slot` name the registry's runtime source writes, the problems in the named
 * components, and each other component's unnamed styled elements.
 */
export function partNames(root: string = repoRoot): PartScan {
  const { named } = readBaseline(root);
  const strict = new Set(named);
  const names: PartName[] = [];
  const problems: string[] = [];
  const unnamed = new Map<string, string[]>();
  for (const { file, stem, prefixes } of sources(root)) {
    if (stem === undefined) {
      problems.push(`${relative(root, file)} belongs to no component its folder's component.json lists, so its parts have no stem. Fix: name the file <stem>.tsx or <stem>-<part>.tsx.`);
      continue;
    }
    const isStrict = strict.has(stem);
    const text = readFileSync(file, "utf8");
    const source = ts.createSourceFile(file, text, ts.ScriptKind.TSX);
    const outside = packageImports(source);
    const at = (node: ts.Node) => `${relative(root, file)}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`;
    const missing = (where: string, message: string): void => {
      if (isStrict) problems.push(`${where} ${message}`);
      else unnamed.set(stem, [...(unnamed.get(stem) ?? []), where]);
    };
    const check = (where: string, label: string, name: string): void => {
      const problem = nameProblem(name, stem, prefixes);
      if (problem && isStrict) problems.push(`${where} ${label}: ${problem}. Fix: data-slot="${stem}-<part>".`);
      else names.push({ stem, name, where });
    };
    const visit = (node: ts.Node): void => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const where = at(node);
        const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
        const named = (name: string) => attributes.find((attribute) => attribute.name.getText(source) === name);
        const slot = named("data-slot");
        const tag = node.tagName.getText(source);
        const spread = node.attributes.properties.findIndex(ts.isJsxSpreadAttribute);
        if (slot && spread !== -1 && spread < node.attributes.properties.indexOf(slot) && isStrict) {
          problems.push(`${where} <${tag}>'s data-slot comes after a spread, so it overrides a parent's name for the part. Fix: write data-slot first.`);
        }
        if (slot) {
          const name = literal(slot);
          // A shared root that writes its owner's `data-ouro` (Field's `owner.data`) is named the same.
          const sameAsRoot = name === undefined && slot.initializer !== undefined && named("data-ouro")?.initializer?.getText(source) === slot.initializer.getText(source);
          if (sameAsRoot) {
            // Its names are the owners' literal `data-slot`s where they render it.
          } else if (name === undefined) {
            if (isStrict) problems.push(`${where} <${tag}>'s data-slot is not a string literal. Fix: data-slot="${stem}-<part>".`);
          } else check(where, `<${tag} data-slot="${name}">`, name);
        } else if (named("className") && styledHere(tag, outside)) {
          missing(where, `<${tag}> carries classes but no part name. Fix: data-slot="${stem}-<part>" (docs/guides/part-names.md).`);
        } else if (typography.has(tag) && !outside.has(tag)) {
          missing(where, `<${tag}> draws a part with no name of its own. Fix: data-slot="${stem}-<part>", such as "${stem}-title" (docs/guides/part-names.md).`);
        }
      }
      // A Field owner (`{ name: "FileField", data: "file-field" }`) names the Field root it renders: Field writes `data-slot={owner.data}`.
      if (ts.isObjectLiteralExpression(node)) {
        const entry = (name: string) => node.properties.find((property): property is ts.PropertyAssignment => ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) && property.name.text === name);
        const [ownerName, data] = [entry("name")?.initializer, entry("data")?.initializer];
        if (ownerName && data && ts.isStringLiteral(ownerName) && ts.isStringLiteral(data)) {
          prefixes.add(data.text);
          check(at(node), `{ data: "${data.text}" }`, data.text);
        }
      }
      // A root built with `createElement(element, { "data-slot": "card", ...rest, className })` is held the same way.
      if (ts.isCallExpression(node) && node.expression.getText(source) === "createElement" && node.arguments[1] && ts.isObjectLiteralExpression(node.arguments[1])) {
        const where = at(node);
        const property = (name: string) => node.arguments[1]!.properties.find((entry): entry is ts.PropertyAssignment => ts.isPropertyAssignment(entry) && (ts.isStringLiteral(entry.name) || ts.isIdentifier(entry.name)) && entry.name.text === name);
        const slot = property("data-slot");
        const name = slot && ts.isStringLiteral(slot.initializer) ? slot.initializer.text : undefined;
        if (slot && name === undefined) {
          if (isStrict) problems.push(`${where} createElement's data-slot is not a string literal. Fix: "data-slot": "${stem}-<part>".`);
        } else if (name !== undefined) check(where, `createElement({ "data-slot": "${name}" })`, name);
        else if (property("className")) missing(where, `createElement carries classes but no part name. Fix: "data-slot": "${stem}" (docs/guides/part-names.md).`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return { names, problems, unnamed };
}

/** The baseline: the named components and each other component's unnamed count. */
export function readBaseline(root: string = repoRoot): Baseline {
  return JSON.parse(readFileSync(join(root, baselinePath), "utf8")) as Baseline;
}

/** The ratchet: a count that rose, fell (the baseline must shrink) or names a component that is not there or is already named. */
export function ratchetProblems(root: string = repoRoot, scan: PartScan = partNames(root)): string[] {
  const baseline = readBaseline(root);
  const stems = new Set(sources(root).map((source) => source.stem).filter((stem): stem is string => stem !== undefined));
  const problems: string[] = [];
  for (const stem of [...baseline.named, ...Object.keys(baseline.unnamed)]) {
    if (!stems.has(stem)) problems.push(`${baselinePath} names "${stem}", which no component writes. Fix: remove it from the baseline.`);
  }
  for (const stem of baseline.named) {
    if (stem in baseline.unnamed) problems.push(`${baselinePath} lists "${stem}" as named and unnamed. Fix: remove its unnamed count.`);
  }
  const counts = new Map<string, number>();
  for (const [stem, where] of scan.unnamed) counts.set(stem, where.length);
  const keys = new Set([...counts.keys(), ...Object.keys(baseline.unnamed)]);
  for (const stem of [...keys].sort()) {
    if (baseline.named.includes(stem)) continue;
    const actual = counts.get(stem) ?? 0;
    const recorded = baseline.unnamed[stem] ?? 0;
    if (actual > recorded) {
      problems.push(`${stem} has ${actual} styled element(s) with no part name, ${recorded} in ${baselinePath}. Fix: name the new ones data-slot="${stem}-<part>" (docs/guides/part-names.md).`);
    } else if (actual < recorded) {
      problems.push(`${stem} has ${actual} styled element(s) with no part name, down from ${recorded} in ${baselinePath}. Fix: node scripts/part-names.mts --write, so the baseline shrinks to ${actual}.`);
    }
  }
  return problems;
}

/** Rewrites the baseline's unnamed counts from the source, keeping the named list. */
export function writeBaseline(root: string = repoRoot): void {
  const { named } = readBaseline(root);
  const unnamed: Record<string, number> = {};
  for (const [stem, where] of partNames(root).unnamed) if (!named.includes(stem)) unnamed[stem] = where.length;
  const sorted = Object.fromEntries(Object.entries(unnamed).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(join(root, baselinePath), `${JSON.stringify({ named: [...named].sort(), unnamed: sorted }, null, 2)}\n`);
}

/** Each stem's names, sorted and without repeats. */
export function namesByStem(root: string = repoRoot): Map<string, string[]> {
  const byStem = new Map<string, Set<string>>();
  for (const { stem, name } of partNames(root).names) byStem.set(stem, (byStem.get(stem) ?? new Set()).add(name));
  return new Map([...byStem].map(([stem, set]) => [stem, [...set].sort()]));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  if (args.includes("--write")) writeBaseline();
  const scan = partNames();
  if (args.includes("--list")) {
    for (const [stem, where] of [...scan.unnamed].sort(([a], [b]) => a.localeCompare(b))) for (const place of where) console.log(`${stem}\t${place}`);
  }
  const problems = [...scan.problems, ...ratchetProblems(repoRoot, scan)];
  for (const problem of problems) console.log(problem);
  console.log(`${problems.length} part-name problem(s).`);
  process.exitCode = problems.length > 0 ? 1 : 0;
}
