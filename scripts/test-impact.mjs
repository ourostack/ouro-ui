// Which tests a change can affect, for CI's pull request runs (.github/workflows/ci.yml). A pull
// request runs the tests of the components it changed and of every component that imports them;
// main, the merge queue, dispatched runs (how release.yml runs CI on its release branch) and
// release branches always run everything, and so does any change this cannot map to components.
//
//   node scripts/test-impact.mjs plan <base> <head>   the plan job: prints the plan and writes
//                                                     `full` and `components` to $GITHUB_OUTPUT
//   node scripts/test-impact.mjs vitest <components>  the ci job: the browser tests of those
//                                                     components (see runBrowserTests)
//   node scripts/test-impact.mjs e2e <components>     the e2e job's Playwright arguments
//   node scripts/test-impact.mjs stories <components> OURO_STORIES for the themes job
//
// <components> is the plan's comma-separated list of component stems (item names), maybe empty.
import { spawn as spawnChild, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import ts from "typescript";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const componentsDir = "registry/ouro/components/ouro/";
const e2eDir = "registry/ouro/e2e/ouro/";

/** Paths whose change runs everything, with the reason the plan prints. */
const everything = [
  [/^registry\/ouro\/theme\//, "the theme every component reads"],
  [/^registry\/ouro\/lib\//, "a shared helper or the test kit"],
  [/^registry\/ouro\/e2e\/(?!ouro\/[\w-]+\.spec\.ts$)/, "the shared end-to-end setup"],
  [/^scripts\//, "a generator or check"],
  [/^test\//, "the shared test setup, fixtures and matrices"],
  [/^vitest[^/]*\.config\.[cm]?[jt]s$/, "the Vitest configuration"],
  [/^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml)$/, "the dependencies"],
  [/^\.github\//, "a workflow"],
  // test/text-size.touch.test.tsx reads it with every demo.
  [/^site\/src\/styles\.css$/, "the site's stylesheet, which the text-size scan reads with every demo"],
];

const demosDir = "site/src/docs/demos/";

/**
 * Paths no component's tests read: prose and generated files, which `pnpm run docs --check`,
 * `pnpm registry --check`, the links check and the install jobs check in full on every run, and
 * the site, whose tests (the Vitest `site` project and the site's end-to-end specs) every
 * reduced run includes.
 */
const noComponent = [
  [/^[^/]+\.md$/, "prose"],
  [/^docs\//, "the generated docs and the guides"],
  [/^changes\/[^/]+\.md$/, "a change fragment"],
  [/^registry\.json$/, "the generated registry"],
  [/^site\//, "the site, whose tests every run includes"],
];

/** Every component folder with its component stems, from each folder's component.json. */
function readFolders(root) {
  const dir = join(root, componentsDir);
  const folders = new Map();
  for (const folder of readdirSync(dir).sort()) {
    const manifest = join(dir, folder, "component.json");
    if (existsSync(manifest)) folders.set(folder, JSON.parse(readFileSync(manifest, "utf8")).components);
  }
  return folders;
}

/** A component's tests, type tests, stories and specs: files that ship in its `-tests` item, not in the component. */
const devFile = /\.test\.tsx?$|\.test-d\.ts$|\.stories\.tsx$|\.spec\.ts$/;

/** A docs demo, named after its component: test/text-size.touch.test.tsx scans it with the component's stories. */
const demo = /^site\/src\/docs\/demos\/(?:.*\/)?([\w-]+)\.demo\.tsx$/;

/** Every docs demo, as a repository path. */
const demoFiles = (root) =>
  (existsSync(join(root, demosDir)) ? readdirSync(join(root, demosDir), { recursive: true }) : [])
    .map(String)
    .filter((file) => file.endsWith(".demo.tsx"))
    .map((file) => `${demosDir}${file.split(sep).join("/")}`);

/**
 * Each component folder's imports of other component folders, from the TypeScript source of every
 * file in it: `runtime` through the component's own files, `all` through any file, its tests,
 * stories and docs demo (site/src/docs/demos/<stem>.demo.tsx) included.
 */
function importGraph(root, folders) {
  const graph = new Map();
  const demos = new Map();
  for (const file of demoFiles(root)) {
    const folder = folderOf(folders, demo.exec(file)[1]);
    if (folder) demos.set(folder, [...(demos.get(folder) ?? []), file]);
  }
  for (const folder of folders.keys()) {
    const runtime = new Set();
    const all = new Set();
    const base = join(root, componentsDir, folder);
    const files = readdirSync(base, { recursive: true })
      .map(String)
      .filter((file) => /\.(ts|tsx|mts)$/.test(file))
      .map((file) => ({ path: join(base, file), dev: devFile.test(file) }));
    for (const file of demos.get(folder) ?? []) files.push({ path: join(root, file), dev: true });
    for (const { path, dev } of files) {
      for (const { fileName } of ts.preProcessFile(readFileSync(path, "utf8"), true, true).importedFiles) {
        const target = fileName.startsWith("@/") ? join(root, fileName.slice(2)) : fileName.startsWith(".") ? resolve(dirname(path), fileName) : null;
        if (!target) continue;
        const inside = relative(join(root, componentsDir), target).split(/[\\/]/);
        if (!inside[0] || inside[0] === ".." || inside[0] === folder || !folders.has(inside[0])) continue;
        all.add(inside[0]);
        if (!dev) runtime.add(inside[0]);
      }
    }
    graph.set(folder, { runtime, all });
  }
  return graph;
}

/** The folder that holds a component stem, or undefined. */
const folderOf = (folders, stem) => [...folders].find(([, stems]) => stems.includes(stem))?.[0];

/**
 * The site's files, other than the demos themselves, that the docs demos load at run time,
 * directly or through another: test/text-size.touch.test.tsx renders them with every demo.
 */
function siteFilesDemosLoad(root) {
  const site = join(root, "site");
  const asSiteFile = (target) =>
    target.startsWith(site) ? (["", ".ts", ".tsx", ".mts", "/index.ts", "/index.tsx"].map((ending) => `${target}${ending}`).find((file) => /\.m?tsx?$/.test(file) && existsSync(file)) ?? null) : null;
  const found = new Set();
  const queue = demoFiles(root).map((file) => join(root, file));
  while (queue.length > 0) {
    for (const file of runtimeImports(queue.shift(), root).map(asSiteFile)) {
      if (file === null || found.has(file)) continue;
      found.add(file);
      queue.push(file);
    }
  }
  return new Set([...found].map((file) => relative(root, file).split(sep).join("/")).filter((file) => !demo.test(file)));
}

/**
 * What a change can affect. `full` is true when a changed file is shared by every component (the
 * theme, lib/, the test setup, scripts, configuration, dependencies, workflows) or cannot be
 * mapped; otherwise `components` is the stem of every component whose folder or end-to-end spec
 * changed, plus every component that imports one of them: through its own code, directly or
 * through another component, or from its tests, stories and docs demo. With
 * `full`, `components` lists every component. `reasons` says why, one line per file or importer.
 */
export function testImpact(changedFiles, root = repoRoot) {
  const folders = readFolders(root);
  const all = [...folders.values()].flat().sort();
  const reasons = [];
  let full = changedFiles.length === 0;
  if (full) reasons.push("no changed file was found, so nothing can be ruled out");
  const changed = new Set();
  const demoLoads = siteFilesDemosLoad(root);
  for (const path of changedFiles) {
    const shared = everything.find(([pattern]) => pattern.test(path));
    const none = noComponent.find(([pattern]) => pattern.test(path));
    if (shared) {
      full = true;
      reasons.push(`${path}: ${shared[1]}, so everything runs`);
    } else if (path.startsWith(componentsDir)) {
      const folder = path.slice(componentsDir.length).split("/")[0];
      if (folders.has(folder)) {
        changed.add(folder);
        reasons.push(`${path}: the ${folder} folder (${folders.get(folder).join(", ")})`);
      } else {
        full = true;
        reasons.push(`${path}: ${folder} has no component.json at this commit, so everything runs`);
      }
    } else if (demo.test(path)) {
      const stem = demo.exec(path)[1];
      if (folderOf(folders, stem)) {
        changed.add(folderOf(folders, stem));
        reasons.push(`${path}: ${stem}'s docs demo`);
      } else {
        full = true;
        reasons.push(`${path}: a demo named after no component, so everything runs`);
      }
    } else if (demoLoads.has(path)) {
      full = true;
      reasons.push(`${path}: loaded by the docs demos the text-size scan renders, so everything runs`);
    } else if (path.startsWith(e2eDir) && folderOf(folders, path.slice(e2eDir.length).replace(/\.spec\.ts$/, ""))) {
      const stem = path.slice(e2eDir.length).replace(/\.spec\.ts$/, "");
      changed.add(folderOf(folders, stem));
      reasons.push(`${path}: ${stem}'s end-to-end spec`);
    } else if (none) {
      reasons.push(`${path}: ${none[1]}, no component's tests`);
    } else {
      full = true;
      reasons.push(`${path}: not mapped to components, so everything runs`);
    }
  }
  if (full) return { full: true, reasons, components: all };

  // A component whose own code imports a changed one changes with it, and so on outward; a
  // component whose tests or stories render any of those is affected too, but no further: its
  // own code did not change.
  const graph = importGraph(root, folders);
  const changing = new Set(changed);
  const queue = [...changed];
  while (queue.length > 0) {
    const folder = queue.shift();
    for (const [importer, { runtime }] of graph) {
      if (changing.has(importer) || !runtime.has(folder)) continue;
      changing.add(importer);
      queue.push(importer);
      reasons.push(`${importer}: imports ${folder}`);
    }
  }
  const selected = new Set(changing);
  for (const [importer, { all }] of graph) {
    if (selected.has(importer)) continue;
    const used = [...all].filter((folder) => changing.has(folder)).sort();
    if (used.length === 0) continue;
    selected.add(importer);
    reasons.push(`${importer}: its tests, stories or docs demo import ${used.join(", ")}`);
  }
  return { full: false, reasons, components: [...selected].flatMap((folder) => folders.get(folder)).sort() };
}

/** The folders that hold `components` (stems), sorted. */
function foldersFor(components, root) {
  const folders = readFolders(root);
  return [...new Set(components.map((stem) => folderOf(folders, stem) ?? stem))].sort();
}

/** OURO_STORIES: the folders whose stories the shared suites in test/ render (test/stories.tsx). */
export const storyFolders = (components, root = repoRoot) => foldersFor(components, root).join(",");

/** The Vitest projects every run has (vitest.config.ts; scripts/workflows.test.mjs checks the list). */
const projects = ["ouro-chromium", "ouro-webkit", "ouro-touch", "site"];

/**
 * `folders`, every folder their tests, stories or docs demos import, and every folder the code of
 * any of those imports, directly or through another.
 */
function withImports(folders, root) {
  const graph = importGraph(root, readFolders(root));
  // What their tests, stories and docs demos import, one step out: those run and reach that code.
  const all = new Set([...folders, ...folders.flatMap((folder) => [...(graph.get(folder)?.all ?? [])])]);
  const queue = [...all];
  while (queue.length > 0) {
    for (const imported of graph.get(queue.shift())?.runtime ?? []) {
      if (all.has(imported)) continue;
      all.add(imported);
      queue.push(imported);
    }
  }
  return [...all].sort();
}

const libDir = "registry/ouro/lib/ouro/";

/** The modules `path` loads at run time: every import and re-export but those of types alone. */
function runtimeImports(path, root) {
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest);
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
  return specifiers.map((name) => (name.startsWith("@/") ? join(root, name.slice(2)) : name.startsWith(".") ? resolve(dirname(path), name) : null)).filter(Boolean);
}

/**
 * The lib/ files (the test kit aside) that any file in `folders` (code, tests or stories) loads at
 * run time, directly or through another lib/ file, as repository paths.
 */
function libFilesLoadedBy(folders, root) {
  const lib = join(root, libDir);
  const asLibFile = (target) => {
    if (!target.startsWith(lib) || target.startsWith(join(lib, "testing"))) return null;
    return [".ts", ".tsx"].map((extension) => `${target}${extension}`).find((file) => existsSync(file)) ?? null;
  };
  const found = new Set();
  const queue = [];
  const visit = (targets) => {
    for (const file of targets.map(asLibFile)) {
      if (file === null || found.has(file)) continue;
      found.add(file);
      queue.push(file);
    }
  };
  for (const folder of folders) {
    const base = join(root, componentsDir, folder);
    for (const file of readdirSync(base, { recursive: true }).map(String)) if (/\.(ts|tsx|mts)$/.test(file)) visit(runtimeImports(join(base, file), root));
  }
  while (queue.length > 0) visit(runtimeImports(queue.shift(), root));
  return [...found].map((file) => relative(root, file).split(sep).join("/")).sort();
}

/**
 * The reduced Vitest run's arguments: every project, so each still writes its motion partition;
 * the tests of the selected folders, of every folder their tests, stories or docs demos import
 * and of every folder the code of any of those imports, directly or through another; the own
 * tests of the lib/ files all those folders load; the shared suites in test/ (which
 * render only the selected folders' stories and the reference stories, given OURO_STORIES) and
 * the site's tests. Coverage is measured over those folders and lib/ files at the repository's
 * thresholds: a changed test may have been the only one to reach a branch in what it or its
 * component imports, so that code is measured too. When a line there is reached only by an unselected
 * component's tests, the full suite decides (runBrowserTests). The rest of lib/ is left out, as
 * nothing the change touches loads it: measuring all of it would send every reduced run to the
 * full suite (lib/ouro/toast.ts, for one, is reached only by the toast component's tests).
 */
export function vitestArgs(components, root = repoRoot) {
  const folders = withImports(foldersFor(components, root), root);
  const libFiles = libFilesLoadedBy(folders, root);
  const libTests = libFiles.filter((file) => /\.tsx?$/.test(file) && [".test.ts", ".test.tsx"].some((suffix) => existsSync(join(root, file.replace(/\.tsx?$/, suffix)))));
  const measured = folders.length > 0;
  return [
    ...projects.map((project) => `--project=${project}`),
    ...(measured ? ["--coverage", ...folders.map((folder) => `--coverage.include=${componentsDir}${folder}/**`), ...libFiles.map((file) => `--coverage.include=${file}`)] : []),
    ...folders.map((folder) => `${componentsDir}${folder}/`),
    ...libTests.map((file) => file.replace(/\.tsx?$/, ".")),
    "test/",
    "site/",
  ];
}

/** The reduced end-to-end run's arguments: the selected components' specs and the site's. */
export function e2eArgs(components, root = repoRoot) {
  return [...components.map((stem) => `${e2eDir}${stem}.spec.ts`).filter((path) => existsSync(join(root, path))), "site/e2e/"];
}

const plain = (text) => stripVTControlCharacters(text);

/** Whether a Vitest run failed on a coverage threshold alone: every test passed and nothing else went wrong. */
export function coverageOnlyFailure(log) {
  const text = plain(log);
  return /does not meet (the )?global threshold/.test(text) && /Test Files\s+\d+ passed/.test(text) && !/\d+ failed/.test(text) && !/Unhandled (Errors?|Rejection)/i.test(text);
}

/** Runs a command, streaming its output and keeping it. */
function spawnAndKeep(command, args, env) {
  return new Promise((done) => {
    const child = spawnChild(command, args, { cwd: repoRoot, env, stdio: ["inherit", "pipe", "pipe"] });
    let log = "";
    child.stdout.on("data", (chunk) => {
      log += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      log += chunk;
      process.stderr.write(chunk);
    });
    child.on("close", (status) => done({ status: status ?? 1, log }));
  });
}

/**
 * The ci job's browser tests on a reduced pull request: the selected components' tests and the
 * shared suites over their stories (vitestArgs). A component can reach 100% only through another
 * component's tests, so when every test passed and only coverage failed, the full `pnpm test`
 * decides instead. Writes `reduced` (whether the reduced run stands) and `stems` (the components
 * whose motion maps the motion-coverage job checks) as step outputs.
 */
export async function runBrowserTests(components, { root = repoRoot, spawn = spawnAndKeep, output = (line) => appendFileSync(process.env["GITHUB_OUTPUT"] ?? "/dev/null", `${line}\n`), log = console.log } = {}) {
  const env = { ...process.env, OURO_STORIES: storyFolders(components, root) };
  log(`Reduced run: the tests of ${components.join(", ") || "no component"}, the shared suites over the stories in ${env.OURO_STORIES || "no folder"}, and the site's tests.`);
  const reduced = await spawn("pnpm", ["exec", "vitest", "run", ...vitestArgs(components, root)], env);
  if (reduced.status === 0 || !coverageOnlyFailure(reduced.log)) {
    const stems = [...new Set([...components, ...foldersFor(components, root).flatMap((folder) => readFolders(root).get(folder) ?? [])])].sort();
    output("reduced=true");
    output(`stems=${stems.join(",")}`);
    return reduced.status;
  }
  log("::warning::Every selected test passed but coverage fell short: a line may be covered only by another component's tests. Running the full suite to decide.");
  const fullEnv = { ...process.env };
  delete fullEnv.OURO_STORIES;
  const all = await spawn("pnpm", ["test"], fullEnv);
  output("reduced=false");
  output("stems=");
  return all.status;
}

const list = (text = "") => text.split(",").map((entry) => entry.trim()).filter(Boolean);

async function main([command, ...args]) {
  if (command === "plan") {
    const [base, head] = args;
    const diff = spawnSync("git", ["diff", "--no-renames", "--name-only", base, head], { cwd: repoRoot, encoding: "utf8" });
    if (diff.status !== 0) throw new Error(`git diff ${base} ${head} failed: ${diff.stderr}`);
    const impact = testImpact(diff.stdout.split("\n").filter(Boolean));
    console.log(impact.full ? "Everything runs:" : `Reduced run: ${impact.components.join(", ") || "no component"}`);
    for (const reason of impact.reasons) console.log(`- ${reason}`);
    if (process.env["GITHUB_OUTPUT"]) appendFileSync(process.env["GITHUB_OUTPUT"], `full=${impact.full}\ncomponents=${impact.full ? "" : impact.components.join(",")}\n`);
    return 0;
  }
  if (command === "vitest") return runBrowserTests(list(args[0]));
  if (command === "e2e") {
    console.log(e2eArgs(list(args[0])).join(" "));
    return 0;
  }
  if (command === "stories") {
    console.log(storyFolders(list(args[0])));
    return 0;
  }
  console.error("Usage: node scripts/test-impact.mjs plan <base> <head> | vitest <components> | e2e <components> | stories <components>");
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
