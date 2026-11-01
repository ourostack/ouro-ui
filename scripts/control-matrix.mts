// The control matrix: one row per component stem, mode and interactive part, from each folder's
// component.json (`modes`, `controls`; see scripts/components.mts) and the stories that render
// each mode. test/controls.test.tsx imports the written JSON, never the manifests, so the browser
// test stays free of Node modules. Beside it, the motion matrix: one row per stem, state and
// animated part from `motion` (readMotion), which test/motion.ts imports the same way. Neither file
// is committed: every Vitest run (vitest.config.ts) and `pnpm typecheck` write them first.
//
//   node scripts/control-matrix.mts           write test/generated/control-matrix.json and motion-matrix.json
//   node scripts/control-matrix.mts --check   fail when either file is missing or stale
//   --out <file>, --motion-out <file>         write or check other files
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { componentsDir, MANIFEST, pascal, readComponents, readMotion } from "./components.mts";

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
  /** Whether only a coarse pointer reaches the part, so the ouro-touch project checks it. */
  touch: boolean;
  /** The story ids (`Button/AsLink`) that render this mode. */
  stories: string[];
}

export interface StoryMode {
  /** `Button/AsLink`, as test/stories.tsx keys it. */
  id: string;
  /** The story's `parameters.mode`, or the meta's; undefined when neither names one. */
  mode?: string;
}

/** One state of a stem's motion map, for one animated part (or none, for a `none` state). */
export interface MotionRow {
  /** The registry item. */
  item: string;
  stem: string;
  /** The state attribute, `data-checked`. */
  state: string;
  kind: "motion" | "gesture-settle" | "none";
  /** The part's `data-ouro-part`; null for a `none` state, which has no parts. */
  part: string | null;
  properties: string[];
  reduced: string[];
  tests: string[];
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOut = "test/generated/control-matrix.json";
const defaultMotionOut = "test/generated/motion-matrix.json";

/** Every row of the motion matrix: each declared state of each stem, once per part. */
export function buildMotionMatrix(root: string = repoRoot): MotionRow[] {
  return readMotion(root).flatMap(({ name, stem, motion }) =>
    Object.entries(motion.states).flatMap(([state, declared]): MotionRow[] =>
      declared.parts === undefined
        ? [{ item: name, stem, state, kind: declared.kind, part: null, properties: [], reduced: [], tests: declared.tests }]
        : Object.entries(declared.parts).map(([part, { properties, reduced }]) => ({ item: name, stem, state, kind: declared.kind, part, properties, reduced, tests: declared.tests })),
    ),
  );
}

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
        .map((control) => ({
          item: component.name,
          stem: component.stem,
          mode,
          part: control.part,
          role: control.role,
          portal: control.portal,
          touch: control.touch === true,
          stories,
        }));
    });
  });
}

export interface SourceMarker {
  item: string;
  part: string;
  /** `<file>:<line>` of the part's marker. */
  where: string;
}

/** A `data-ouro-part` on an element that is no control, a part the folder's `motion` declares (Checkbox's `tick`). */
export interface AnimatedMarker {
  folder: string;
  part: string;
  where: string;
}

/** `data-ouro-control` or `data-ouro-part`, in JSX (`="x"`), a props object (`": "x"`) or `setAttribute("…", "x")`. */
const markerPattern = (name: string) => new RegExp(`${name}["']?\\s*[=:,]\\s*("[a-z-]+"|\\{[^}]*\\})`, "g");

/** The parts a folder's component.json `motion` names, read raw (readMotion checks them). */
function motionParts(file: string): Set<string> {
  const manifest = join(dirname(file), MANIFEST);
  const motion = existsSync(manifest) ? ((JSON.parse(readFileSync(manifest, "utf8")) as { motion?: Record<string, { states?: Record<string, { parts?: object }> }> }).motion ?? {}) : {};
  return new Set(Object.values(motion).flatMap((map) => Object.values(map.states ?? {}).flatMap((state) => Object.keys(state.parts ?? {}))));
}

/**
 * Every control marker written in the components' runtime source: each `data-ouro-part` with the
 * `data-ouro-control` written just before it on the same element (in JSX, a props object or
 * `setAttribute`), and each call of a marker helper, `controlRef(item, part)` or a component's own
 * `…Marker(item, part)`. A part in braces (`{high ? "alert" : "toast"}`) counts each string
 * after `?` or `:`. A part with no item beside it is `animated` when the folder's `motion` declares
 * it, and otherwise one of the `problems`.
 */
export function sourceMarkers(root: string = repoRoot): { markers: SourceMarker[]; animated: AnimatedMarker[]; problems: string[] } {
  const markers: SourceMarker[] = [];
  const animated: AnimatedMarker[] = [];
  const problems: string[] = [];
  const dir = join(root, componentsDir);
  const files = readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name) && !/\.(test|test-d|stories)\.tsx?$|\.touch\.test\.tsx?$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const where = (index: number) => `${relative(root, file)}:${source.slice(0, index).split("\n").length}`;
    const controls = [...source.matchAll(markerPattern("data-ouro-control"))].map((match) => ({ index: match.index, item: match[1]!.slice(1, -1) }));
    for (const match of source.matchAll(markerPattern("data-ouro-part"))) {
      const value = match[1]!;
      const parts = value.startsWith("{") ? [...value.matchAll(/[?:]\s*"([a-z-]+)"/g)].map((part) => part[1]!) : [value.slice(1, -1)];
      // Beside it: before it, and on the same element, with no JSX element opened in between.
      const control = controls.filter((entry) => entry.index < match.index && match.index - entry.index < 400 && !/<[A-Za-z]/.test(source.slice(entry.index, match.index))).at(-1);
      if (!control) {
        const declared = motionParts(file);
        if (parts.every((part) => declared.has(part))) {
          for (const part of parts) animated.push({ folder: relative(join(root, componentsDir), dirname(file)), part, where: where(match.index) });
        } else {
          problems.push(`${where(match.index)} writes data-ouro-part ${parts.join(", ")} with no data-ouro-control beside it, and its component.json "motion" declares no such animated part`);
        }
        continue;
      }
      for (const part of parts) markers.push({ item: control.item, part, where: where(match.index) });
    }
    for (const match of source.matchAll(/\b(?:controlRef|\w+Marker)\(\s*"([a-z-]+)",\s*"([a-z-]+)"\s*\)/g)) markers.push({ item: match[1]!, part: match[2]!, where: where(match.index) });
  }
  return { markers, animated, problems };
}

/**
 * Writes both matrices from the manifests and the source, as the tests read them. They are not
 * committed (.gitignore): vitest.config.ts and `pnpm typecheck` write them before anything reads
 * them, so two pull requests that add components never edit the same file. A file whose text is
 * already right is left alone, and a changed one is replaced whole, so a test run that starts
 * beside another never reads half a file.
 */
export function writeMatrices(out = join(repoRoot, defaultOut), motionOut = join(repoRoot, defaultMotionOut)): void {
  for (const { file, text } of matrixFiles(out, motionOut)) {
    if (existsSync(file) && readFileSync(file, "utf8") === text) continue;
    mkdirSync(dirname(file), { recursive: true });
    const partial = `${file}.${process.pid}.tmp`;
    writeFileSync(partial, text);
    renameSync(partial, file);
  }
}

function matrixFiles(out: string, motionOut: string) {
  return [
    { file: out, text: JSON.stringify(buildMatrix(), null, 2) + "\n" },
    { file: motionOut, text: JSON.stringify(buildMotionMatrix(), null, 2) + "\n" },
  ];
}

function main(argv: string[]): number {
  const option = (name: string, fallback: string) => resolve(argv.includes(name) ? argv[argv.indexOf(name) + 1]! : join(repoRoot, fallback));
  const out = option("--out", defaultOut);
  const motionOut = option("--motion-out", defaultMotionOut);
  if (argv.includes("--check")) {
    const stale = matrixFiles(out, motionOut).filter(({ file, text }) => (existsSync(file) ? readFileSync(file, "utf8") : "") !== text);
    for (const { file } of stale) process.stderr.write(`${relative(process.cwd(), file)} is stale. Run pnpm controls:matrix to write it again.\n`);
    return stale.length > 0 ? 1 : 0;
  }
  writeMatrices(out, motionOut);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
