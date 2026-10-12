import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isScreen, screensDir, type Screen } from "./screens.mts";
import { lintFindings, typeFindings, type Finding } from "./static.mts";

// The folders a fresh agent works in, and what is kept of them afterwards.
//
//   node scripts/agent-usability/workspace.mts arm-manifest <app> <arm> <info-json>
//       Records the arm app's versions, the hash of every file it starts with, and what the
//       type check and the linter find in it before any agent runs (the baseline), in
//       <app>/.agent-usability/arm.json. arms/create.sh runs it.
//   node scripts/agent-usability/workspace.mts create <arm-app> <screen> <workspace>
//       Copies the arm app (with node_modules, without its record) to <workspace> and adds
//       the screen's src/api files, the backend stand-in.
//   node scripts/agent-usability/workspace.mts collect <arm-app> <screen> <workspace> <runs/<date>> <run>
//       Copies what the agent left, without node_modules, build output or the skill, to
//       <runs/<date>>/<arm>/<screen>/<run>/, and the arm's record to <runs/<date>>/arms/<arm>.json.
//
// The agent never sees the arm's record and cannot change the copy the scorer reads.

export const metaDir = ".agent-usability";

const sha256 = (content: string | Buffer) => createHash("sha256").update(content).digest("hex");

/** Every file under `dir`, as forward-slash paths relative to it, skipping `skip` folders. */
export function listFiles(dir: string, skip: (path: string) => boolean = () => false): string[] {
  if (!existsSync(dir)) return [];
  return (readdirSync(dir, { recursive: true, withFileTypes: true }) as import("node:fs").Dirent[])
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split("\\").join("/"))
    .filter((path) => !skip(path))
    .sort();
}

export function hashFiles(dir: string, paths: string[]): Record<string, string> {
  return Object.fromEntries(paths.map((path) => [path, sha256(readFileSync(join(dir, path)))]));
}

/** The files a screen adds to an app: the shared fake backend and the screen's own src/api. */
export function screenFiles(screen: Screen): { from: string; path: string }[] {
  return ["_shared", screen].flatMap((folder) => {
    const from = join(screensDir, folder, "files");
    return listFiles(from).map((path) => ({ from: join(from, path), path }));
  });
}

/** Copies the screen's files into `dir`. */
export function addScreenFiles(dir: string, screen: Screen): void {
  for (const file of screenFiles(screen)) {
    mkdirSync(dirname(join(dir, file.path)), { recursive: true });
    cpSync(file.from, join(dir, file.path));
  }
}

/** The backend stand-in's files that are missing from `dir` or differ from this repository's. */
export function changedScreenFiles(dir: string, screen: Screen): string[] {
  return screenFiles(screen)
    .filter((file) => !existsSync(join(dir, file.path)) || sha256(readFileSync(join(dir, file.path))) !== sha256(readFileSync(file.from)))
    .map((file) => file.path);
}

/**
 * The app's configuration, which an agent may not change: the package files, and the
 * settings of the type check, the linter, the build and the component installer.
 */
const isConfig = (path: string) => /^(package\.json|package-lock\.json|components\.json|vite\.config\.[cm]?[jt]s|\.oxlintrc\.json|oxlint\.config\.[cm]?[jt]s|tsconfig[^/]*\.json)$/.test(path);

/** A config file's hash. JSON hashes by value, so a rewrite that changes no setting is not a change. */
function configHash(path: string): string {
  const content = readFileSync(path, "utf8");
  try {
    return sha256(JSON.stringify(JSON.parse(content)));
  } catch {
    return sha256(content);
  }
}

export function configHashes(dir: string): Record<string, string> {
  return Object.fromEntries(
    readdirSync(dir)
      .filter(isConfig)
      .sort()
      .map((path) => [path, configHash(join(dir, path))]),
  );
}

/** The config files that were changed, removed or added since the arm was made. */
export function changedConfig(dir: string, recorded: Record<string, string>): string[] {
  const now = configHashes(dir);
  return [...new Set([...Object.keys(recorded), ...Object.keys(now)])].filter((path) => recorded[path] !== now[path]).sort();
}

/** What arms/create.sh records about an arm app before any agent runs in it. */
export interface ArmRecord {
  arm: string;
  createdAt?: string;
  node?: string;
  shadcnCli?: string;
  init?: string;
  ouroRef?: string | null;
  llmsTxt?: { url: string; sha256: string };
  skill?: { command: string; lock: { skills: Record<string, { ref?: string; computedHash?: string }> } } | null;
  packages?: Record<string, string | null>;
  /** The hash of every file the arm starts with. */
  files: Record<string, string>;
  /** The hash of every configuration file (`configHashes`). */
  config: Record<string, string>;
  /** What the type check and the linter found before the agent ran. */
  baseline: { typecheck: Finding[]; lint: Finding[] };
}

export function readArmRecord(path: string): ArmRecord {
  if (!existsSync(path)) throw new Error(`no arm record at ${path}; arms/create.sh writes it and workspace.mts collect copies it`);
  const record: ArmRecord = JSON.parse(readFileSync(path, "utf8"));
  if (!record.baseline || !record.config) throw new Error(`${path} has no baseline; make the arm again with arms/create.sh`);
  return record;
}

export const armRecordPath = (app: string) => join(app, metaDir, "arm.json");

const notSource = (path: string) => /^(node_modules|dist|score|\.claude|\.agents|\.agent-usability)\//.test(path);

export async function armManifest(app: string, arm: string, info: Record<string, unknown>): Promise<ArmRecord> {
  const [typecheck, lint] = [await typeFindings(app), await lintFindings(app)];
  for (const result of [typecheck, lint]) if (!result.ran) throw new Error(`the baseline could not be taken:\n${result.output}`);
  const files = listFiles(app, (path) => notSource(path) || path.endsWith(".tsbuildinfo"));
  const record: ArmRecord = {
    arm,
    ...info,
    baseline: { typecheck: typecheck.findings, lint: lint.findings },
    config: configHashes(app),
    files: hashFiles(app, files),
  };
  mkdirSync(join(app, metaDir), { recursive: true });
  writeFileSync(armRecordPath(app), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

export function createWorkspace(armApp: string, screen: Screen, workspace: string): void {
  readArmRecord(armRecordPath(armApp));
  if (existsSync(workspace) && readdirSync(workspace).length > 0) throw new Error(`${workspace} is not empty`);
  // verbatimSymlinks keeps node_modules/.bin links relative, so they point into the copy.
  cpSync(armApp, workspace, { recursive: true, verbatimSymlinks: true, filter: (source) => relative(armApp, source) !== metaDir });
  addScreenFiles(workspace, screen);
}

/**
 * Keeps a finished workspace: everything the app needs to install, build and score goes to
 * <runs>/<arm>/<screen>/<run>/, and the arm's record, read from the arm app the agent never
 * saw, to <runs>/arms/<arm>.json. Fails when that record differs from the one already kept,
 * because every run of an arm must start from the same app.
 */
export function collect(armApp: string, screen: Screen, workspace: string, runs: string, run: string): string {
  const source = readFileSync(armRecordPath(armApp), "utf8");
  const { arm } = readArmRecord(armRecordPath(armApp));
  const kept = join(runs, "arms", `${arm}.json`);
  if (existsSync(kept) && readFileSync(kept, "utf8") !== source) {
    throw new Error(`${kept} is the record of a different ${arm} app than ${armApp}; every run of an arm must start from the same app`);
  }
  const runDir = join(runs, arm, screen, run);
  if (existsSync(runDir) && readdirSync(runDir).length > 0) throw new Error(`${runDir} is not empty`);
  const skip = (path: string) => notSource(path) || path === "llms.txt" || path === "skills-lock.json" || path.endsWith(".tsbuildinfo");
  for (const path of listFiles(workspace, skip)) {
    mkdirSync(dirname(join(runDir, path)), { recursive: true });
    cpSync(join(workspace, path), join(runDir, path));
  }
  mkdirSync(dirname(kept), { recursive: true });
  writeFileSync(kept, source);
  return runDir;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  const usage =
    "usage: workspace.mts arm-manifest <app> <arm> <info-json> | create <arm-app> <screen> <workspace> | collect <arm-app> <screen> <workspace> <runs/<date>> <run>";
  if (command === "arm-manifest" && args.length === 3) {
    const record = await armManifest(resolve(args[0]!), args[1]!, JSON.parse(args[2]!));
    console.log(`Baseline: ${record.baseline.typecheck.length} type errors, ${record.baseline.lint.length} lint errors`);
  } else if (command === "create" && args.length === 3 && isScreen(args[1]!)) {
    createWorkspace(resolve(args[0]!), args[1], resolve(args[2]!));
    console.log(resolve(args[2]!));
  } else if (command === "collect" && args.length === 5 && isScreen(args[1]!) && /^[1-9]\d*$/.test(args[4]!)) {
    console.log(`Kept the run in ${collect(resolve(args[0]!), args[1], resolve(args[2]!), resolve(args[3]!), args[4]!)}`);
  } else {
    console.error(usage);
    process.exit(1);
  }
}
