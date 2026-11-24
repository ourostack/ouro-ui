// Which screen-reader specs (registry/ouro/e2e/screen-reader/*.sr.spec.ts) a pull request's change
// can affect, for ci.yml's screen-reader job, which calls .github/workflows/screen-reader-lane.yml with
// them. A spec is selected when the change reaches the component code it renders: the story it
// opens (through `storyIds` in stories.ts) and every file that story loads at run time, directly or
// through another. A change to anything shared, or to something the mapping cannot place, selects
// every spec (the lane fails closed); a change no spec renders selects none.
//
//   node scripts/sr-impact.mjs plan <base> <head>   writes `screen_reader` (none, all or list) and
//                                                   `screen_reader_specs` (`all`, or the spec paths)
//                                                   to $GITHUB_OUTPUT
//   node scripts/sr-impact.mjs pr <base> <head>     ci.yml's plan on a pull request: `plan`, but only
//                                                   when the change touches the lane itself (laneFiles);
//                                                   any other change waits for main's push run
//
// The selection reads the repository through `repo` (`read(path)` and `list(dir)`), so a test
// can give it files in memory; the command reads the disk.
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "./ts71.mts";
import { treeFiles } from "./tree.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
export const specDir = "registry/ouro/e2e/screen-reader";
const componentsDir = "registry/ouro/components/ouro";
const specPath = /^registry\/ouro\/e2e\/screen-reader\/[\w-]+\.sr\.spec\.ts$/;
const storyPath = /\.stories\.m?tsx?$/;

/** Paths whose change runs every spec, with the reason the plan prints. */
export const everything = [
  [/^registry\/ouro\/lib\//, "a shared helper, or the test kit every story loads"],
  [/^registry\/ouro\/theme\//, "the theme and tokens every story renders with"],
  [/^registry\/ouro\/e2e\/screen-reader\/(?![\w-]+\.sr\.spec\.ts$)/, "the lane's harness, phrases or story ids"],
  [/^playwright\.screen-reader\.config\.ts$/, "the lane's Playwright configuration"],
  [/^\.github\/workflows\/(screen-reader|screen-reader-lane|ci)\.yml$/, "the lane's workflows, or the ci.yml that calls it"],
  [/^scripts\/sr-/, "the lane's own scripts, which decide what runs"],
  [/^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|\.npmrc|\.node-version)$/, "the dependencies or Node the lane installs"],
  [/^(\.storybook\/|app\.css$)/, "Storybook's build and the stylesheet it compiles"],
  [/^(tsconfig[\w.-]*\.json|[\w.-]+\.config\.[cm]?[jt]s)$/, "the build or test configuration"],
];

/**
 * The lane's own files: its specs and harness, its Playwright configuration, its workflows and its scripts. A pull request
 * that changes one runs the lane before it merges, as a spec main's lane has never run can only be proven there
 * (ourostack/ouro-ui#666); any other pull request waits for main's push run, as macOS and Windows runners are scarce.
 */
export const laneFiles = /^(registry\/ouro\/e2e\/screen-reader\/|playwright\.screen-reader\.config\.ts$|\.github\/workflows\/screen-reader(-lane)?\.yml$|scripts\/sr-)/;

/** `selectLane` for a pull request: no lane unless the change touches a lane file (laneFiles), and every spec when nothing changed is known. */
export function selectPullRequestLane(changed, repo) {
  if (changed.length > 0 && !changed.some((path) => laneFiles.test(path))) return { lane: "none", specs: [], reasons: ["no file of the lane's own changed, so main's push run reads this change"] };
  return selectLane(changed, repo);
}

/** Paths no screen-reader spec can see, so a change to them selects none (unless a spec does load them). */
export const nothing = [
  [/^[^/]+\.md$/, "prose"],
  [/^(docs|contributing|changes|plugins|feel|site|test)\//, "prose, the site or the test suites the lane does not run"],
  [/^\.github\/workflows\/(?!(screen-reader|screen-reader-lane|ci)\.yml$)/, "another workflow"],
  [/^\.github\/(?!workflows\/)/, "repository settings"],
  [/^scripts\/(?!sr-)/, "a script the lane does not run"],
  [/^registry\/ouro\/e2e\/ouro\//, "an end-to-end spec the lane never runs"],
  [/^registry\/ouro\/(check|images)\//, "a Node tool Storybook never loads"],
  [/^(\.gitignore|\.gitattributes|registry\.json)$/, "repository metadata"],
];

/** Storybook's id for an export: `toId(title, storyNameFromExport(name))`. */
const sanitize = (text) => text.toLowerCase().replace(/[ ’–—―′¿'`~!@#$%^&*()_|+\-=?;:'",.<>{}[\]\\/]/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
const startCase = (name) => name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z])([A-Z][a-z])/g, "$1 $2").replace(/([a-zA-Z])(\d)/g, "$1 $2").replace(/(\d)([a-zA-Z])/g, "$1 $2");
export const storyId = (title, name) => `${sanitize(title)}--${sanitize(startCase(name))}`;

/** The file's own unwrapped expression: `{…} satisfies Meta` and `… as const` read as the object. */
const unwrap = (node) => (ts.isSatisfiesExpression(node) || ts.isAsExpression(node) || ts.isParenthesizedExpression(node) ? unwrap(node.expression) : node);

/** The story ids a story file defines: its default export's title with each named export, as Storybook names them. */
export function storyIdsOf(path, text) {
  const source = ts.createSourceFile(path, text, );
  const declared = new Map();
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) if (ts.isIdentifier(declaration.name) && declaration.initializer) declared.set(declaration.name.text, declaration.initializer);
  }
  let title = null;
  const names = [];
  for (const statement of source.statements) {
    if (ts.isExportAssignment(statement)) {
      const expression = unwrap(statement.expression);
      const meta = ts.isIdentifier(expression) ? declared.get(expression.text) : expression;
      const property = meta && ts.isObjectLiteralExpression(unwrap(meta)) ? unwrap(meta).properties.find((item) => ts.isPropertyAssignment(item) && item.name.getText(source) === "title") : undefined;
      if (property && ts.isStringLiteral(unwrap(property.initializer))) title = unwrap(property.initializer).text;
    }
    if (ts.isVariableStatement(statement) && statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      for (const declaration of statement.declarationList.declarations) if (ts.isIdentifier(declaration.name)) names.push(declaration.name.text);
    }
  }
  return title === null ? [] : names.map((name) => storyId(title, name));
}

/** `storyIds` in stories.ts: each key the specs use, and the story id it names. Null when there is no table. */
export function storyIdTable(text) {
  const block = /export const storyIds = \{([\s\S]*?)\} as const;/.exec(text)?.[1];
  if (block === undefined) return null;
  return new Map([...block.matchAll(/^\s*(\w+): "([^"]+)",?\s*$/gm)].map(([, key, id]) => [key, id]));
}

/** The import specifiers a file loads at run time: every import and re-export but those of types alone. */
function runtimeSpecifiers(path, text) {
  if (!/\.m?tsx?$/.test(path)) return [];
  const source = ts.createSourceFile(path, text, );
  const specifiers = [];
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      const bindings = clause?.namedBindings;
      const typesOnly = clause !== undefined && (clause.isTypeOnly || (!clause.name && bindings !== undefined && ts.isNamedImports(bindings) && bindings.elements.length > 0 && bindings.elements.every((element) => element.isTypeOnly)));
      if (!typesOnly) specifiers.push(statement.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && !statement.isTypeOnly) {
      specifiers.push(statement.moduleSpecifier.text);
    }
  }
  return specifiers;
}

/** The repository file an import names, or null for a package or a file that is not there. */
function resolveImport(from, specifier, repo) {
  const bare = specifier.split("?")[0];
  let target;
  if (bare.startsWith("@/")) target = bare.slice(2);
  else if (bare.startsWith(".")) target = posix.join(posix.dirname(from), bare);
  else return null;
  const stem = target.replace(/\.js$/, "");
  return [target, `${stem}.ts`, `${stem}.tsx`, `${stem}.mts`, `${stem}/index.ts`, `${stem}/index.tsx`].find((candidate) => repo.read(candidate) !== null) ?? null;
}

/** Every repository file the seeds load at run time, directly or through another. */
function closureOf(seeds, repo) {
  const seen = new Set();
  const queue = [...seeds];
  while (queue.length > 0) {
    const path = queue.shift();
    if (seen.has(path)) continue;
    seen.add(path);
    const text = repo.read(path);
    if (text === null) continue;
    for (const specifier of runtimeSpecifiers(path, text)) {
      const next = resolveImport(path, specifier, repo);
      if (next !== null && !seen.has(next)) queue.push(next);
    }
  }
  return seen;
}

/** The component folder a path lies in, or null. */
const folderOf = (path) => (path.startsWith(`${componentsDir}/`) ? path.slice(componentsDir.length + 1).split("/")[0] : null);

/**
 * What a change can reach, as a key: a component folder (every file of it, its tests and stories
 * included), or the file itself.
 */
const keyOf = (path) => (folderOf(path) ? `folder:${folderOf(path)}` : `file:${path}`);

/** The lane's spec files, sorted. */
export const laneSpecs = (repo) => repo.list(specDir).filter((file) => specPath.test(file)).sort();

/**
 * The lane's selection for a change: `{ lane, specs, reasons }`. `lane` is `none`, `all` (every spec,
 * which `specs` lists) or `list` (the specs the change reaches). Anything the mapping cannot place
 * returns `all`, with the reason.
 */
export function selectLane(changed, repo) {
  const specs = laneSpecs(repo);
  const all = (reason) => ({ lane: "all", specs, reasons: [reason] });
  if (changed.length === 0) return all("no changed file was found, so nothing can be ruled out");
  const table = storyIdTable(repo.read("registry/ouro/e2e/screen-reader/stories.ts") ?? "");
  if (table === null) return all("stories.ts has no storyIds table");
  const stories = new Map();
  for (const file of [...repo.list("registry"), ...repo.list("stories")]) {
    if (!storyPath.test(file)) continue;
    const text = repo.read(file);
    if (text === null) continue;
    for (const id of storyIdsOf(file, text)) if (!stories.has(id)) stories.set(id, file);
  }
  const reach = new Map();
  for (const spec of specs) {
    const keys = [...repo.read(spec).matchAll(/\bstoryIds\.(\w+)/g)].map((match) => match[1]);
    if (keys.length === 0) return all(`${spec} opens no story from storyIds`);
    const seeds = [];
    for (const key of keys) {
      const file = stories.get(table.get(key) ?? "");
      if (file === undefined) return all(`${spec} opens storyIds.${key}, which no story file defines`);
      seeds.push(file);
    }
    reach.set(spec, new Set([...closureOf(seeds, repo)].map(keyOf).concat(keyOf(spec))));
  }

  const reasons = [];
  const selected = new Set();
  for (const path of changed) {
    const shared = everything.find(([pattern]) => pattern.test(path));
    if (shared) return all(`${path}: ${shared[1]}, so every spec runs`);
    const folder = folderOf(path);
    if (folder && repo.read(`${componentsDir}/${folder}/component.json`) === null) return all(`${path}: ${folder} has no component.json, so every spec runs`);
    const hits = specs.filter((spec) => reach.get(spec).has(keyOf(path)));
    if (hits.length > 0) {
      for (const spec of hits) selected.add(spec);
      reasons.push(`${path}: rendered by ${hits.join(", ")}`);
    } else if (folder || path.startsWith("registry/") || path.startsWith("stories/") || nothing.some(([pattern]) => pattern.test(path))) {
      reasons.push(`${path}: no screen-reader spec renders it`);
    } else {
      return all(`${path}: not mapped to a story, so every spec runs`);
    }
  }
  if (selected.size === 0) return { lane: "none", specs: [], reasons };
  const list = specs.filter((spec) => selected.has(spec));
  return list.length === specs.length ? { lane: "all", specs, reasons } : { lane: "list", specs: list, reasons };
}

/** A repository read from the disk under `root`: the files of `list(dir)` are those a checkout holds, ignored folders aside. */
export function diskRepo(root = repoRoot) {
  return {
    read: (path) => {
      const file = join(root, path);
      return existsSync(file) && statSync(file).isFile() ? readFileSync(file, "utf8") : null;
    },
    list: (dir) => (existsSync(join(root, dir)) ? treeFiles(join(root, dir)).map((file) => `${dir}/${file}`) : []),
  };
}

/** What the plan writes for a change: the lane's value and the specs it runs (`all` for every one). */
export function outputsOf(result) {
  return { screen_reader: result.lane, screen_reader_specs: result.lane === "all" ? "all" : result.lane === "none" ? "" : result.specs.join(" ") };
}

/** The changed files between two commits, as `git diff --name-only --no-renames` lists them. */
function changedFiles(base, head) {
  const diff = spawnSync("git", ["diff", "--no-renames", "--name-only", base, head], { cwd: repoRoot, encoding: "utf8" });
  if (diff.status !== 0) throw new Error(`git diff ${base} ${head} failed: ${diff.stderr}`);
  return diff.stdout.split("\n").filter(Boolean);
}

async function main([command, ...args]) {
  if (command !== "plan" && command !== "pr") {
    console.error("Usage: node scripts/sr-impact.mjs <plan|pr> <base> <head>");
    return 2;
  }
  const [base, head] = args;
  let result;
  try {
    result = (command === "pr" ? selectPullRequestLane : selectLane)(changedFiles(base, head), diskRepo());
  } catch (error) {
    // An error means no selection: every spec runs, as a change the mapping cannot place does.
    result = { lane: "all", specs: laneSpecs(diskRepo()), reasons: [`the change could not be read (${error.message})`] };
  }
  console.log(result.lane === "none" ? "No screen-reader spec is affected." : `Screen-reader lane: ${result.lane === "all" ? "every spec" : result.specs.join(", ")}.`);
  for (const reason of result.reasons) console.log(`- ${reason}`);
  const outputs = outputsOf(result);
  if (process.env["GITHUB_OUTPUT"]) appendFileSync(process.env["GITHUB_OUTPUT"], Object.entries(outputs).map(([key, value]) => `${key}=${value}\n`).join(""));
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
