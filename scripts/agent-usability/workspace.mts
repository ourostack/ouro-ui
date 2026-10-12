import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isScreen, screensDir, type Screen } from "./screens.mts";

// The folders a fresh agent works in, and what is kept of them afterwards.
//
//   node scripts/agent-usability/workspace.mts arm-manifest <app> <arm> <info-json>
//       Records the arm app's versions and the hash of every file it starts with
//       (.agent-usability/arm.json). arms/create.sh runs it.
//   node scripts/agent-usability/workspace.mts create <arm-app> <screen> <workspace>
//       Copies the arm app (with node_modules) to <workspace> and adds the screen's src/api
//       files, the backend stand-in (.agent-usability/workspace.json records their hashes).
//   node scripts/agent-usability/workspace.mts collect <workspace> <run-dir>
//       Copies what the agent left, without node_modules, build output or the skill, to
//       <run-dir> (scripts/agent-usability/runs/<date>/<arm>/<screen>/).

export const metaDir = ".agent-usability";

const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

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
  return Object.fromEntries(paths.map((path) => [path, sha256(join(dir, path))]));
}

/** The files a screen adds to an app: the shared fake backend and the screen's own src/api. */
export function screenFiles(screen: Screen): { from: string; path: string }[] {
  return ["_shared", screen].flatMap((folder) => {
    const from = join(screensDir, folder, "files");
    return listFiles(from).map((path) => ({ from: join(from, path), path }));
  });
}

/** Copies the screen's files into `dir` and returns their hashes. */
export function addScreenFiles(dir: string, screen: Screen): Record<string, string> {
  for (const file of screenFiles(screen)) {
    mkdirSync(dirname(join(dir, file.path)), { recursive: true });
    cpSync(file.from, join(dir, file.path));
  }
  return hashFiles(dir, screenFiles(screen).map((file) => file.path));
}

/** What `create` recorded, or, for an app it did not make, the screen's files as they are now. */
export function expectedFixtures(dir: string, screen: Screen): Record<string, string> {
  const recorded = join(dir, metaDir, "workspace.json");
  if (existsSync(recorded)) return JSON.parse(readFileSync(recorded, "utf8")).fixtures;
  return Object.fromEntries(screenFiles(screen).map((file) => [file.path, sha256(file.from)]));
}

/** The arm's record (arms/create.sh), if the app has one. */
export function armRecord(dir: string): { arm: string; files: Record<string, string> } | undefined {
  const path = join(dir, metaDir, "arm.json");
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined;
}

const notSource = (path: string) => /^(node_modules|dist|score|\.claude|\.agents)\//.test(path);

export function armManifest(app: string, arm: string, info: Record<string, unknown>): void {
  const files = listFiles(app, (path) => notSource(path) || path.startsWith(`${metaDir}/`));
  mkdirSync(join(app, metaDir), { recursive: true });
  writeFileSync(join(app, metaDir, "arm.json"), `${JSON.stringify({ arm, ...info, files: hashFiles(app, files) }, null, 2)}\n`);
}

export function createWorkspace(armApp: string, screen: Screen, workspace: string): void {
  const record = armRecord(armApp);
  if (!record) throw new Error(`${armApp} has no ${metaDir}/arm.json; make it with arms/create.sh`);
  if (existsSync(workspace) && readdirSync(workspace).length > 0) throw new Error(`${workspace} is not empty`);
  // verbatimSymlinks keeps node_modules/.bin links relative, so they point into the copy.
  cpSync(armApp, workspace, { recursive: true, verbatimSymlinks: true });
  const fixtures = addScreenFiles(workspace, screen);
  writeFileSync(
    join(workspace, metaDir, "workspace.json"),
    `${JSON.stringify({ arm: record.arm, screen, createdAt: new Date().toISOString(), fixtures }, null, 2)}\n`,
  );
}

/** What is kept of a finished workspace: everything the app needs to install, build and score. */
export function collect(workspace: string, runDir: string): string[] {
  const skip = (path: string) => notSource(path) || path === "llms.txt" || path === "skills-lock.json" || path.endsWith(".tsbuildinfo");
  const files = listFiles(workspace, skip);
  for (const path of files) {
    mkdirSync(dirname(join(runDir, path)), { recursive: true });
    cpSync(join(workspace, path), join(runDir, path));
  }
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  const usage = "usage: workspace.mts arm-manifest <app> <arm> <info-json> | create <arm-app> <screen> <workspace> | collect <workspace> <run-dir>";
  if (command === "arm-manifest" && args.length === 3) {
    armManifest(resolve(args[0]!), args[1]!, JSON.parse(args[2]!));
  } else if (command === "create" && args.length === 3 && isScreen(args[1]!)) {
    createWorkspace(resolve(args[0]!), args[1], resolve(args[2]!));
    console.log(resolve(args[2]!));
  } else if (command === "collect" && args.length === 2) {
    const files = collect(resolve(args[0]!), resolve(args[1]!));
    console.log(`Copied ${files.length} files to ${resolve(args[1]!)}`);
  } else {
    console.error(usage);
    process.exit(1);
  }
}
