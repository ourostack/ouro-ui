import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The checks that need no browser: the type check and the linter. arms/create.sh runs them on
// an arm before any agent touches it and records what they find (the baseline). The scorer
// runs them again and charges only what is not in the baseline, so a library pays nothing for
// problems it shipped with and an agent pays only for its own.

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

/** One problem, named so it still matches after the agent moves lines around it. */
export interface Finding {
  file: string;
  /** The TypeScript error code or the lint rule. */
  rule: string;
  message: string;
}

export interface StaticResult {
  /** False when the tool itself broke; `findings` then holds one finding that says so. */
  ran: boolean;
  findings: Finding[];
  output: string;
}

/** The app's own copy of a tool: node_modules/.bin/<name> in the app or a folder above it. */
export function bin(dir: string, name: string): string {
  for (let current = dir; ; current = dirname(current)) {
    const candidate = join(current, "node_modules/.bin", name);
    if (existsSync(candidate)) return candidate;
    if (dirname(current) === current) throw new Error(`no ${name} in ${dir} or above it; install the app first`);
  }
}

/**
 * Runs a tool and collects its output. Asynchronous on purpose: a blocking call would stall
 * every other score running in this process, and a stalled tap reads as a long press.
 */
export function run(command: string, args: string[], cwd: string): Promise<{ ok: boolean; stdout: string; output: string }> {
  return new Promise((done) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" } });
    let stdout = "";
    let output = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      output += chunk;
    });
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("error", (error) => done({ ok: false, stdout, output: `${output}${String(error)}` }));
    child.on("close", (code) => done({ ok: code === 0, stdout, output }));
  });
}

const firstLine = (text: string) => text.trim().split("\n")[0] ?? "";

/** `tsc -b` over the app, with the app's own TypeScript and tsconfig files. */
export async function typeFindings(dir: string): Promise<StaticResult> {
  const result = await run(bin(dir, "tsc"), ["-b", "--force", "--pretty", "false"], dir);
  const findings: Finding[] = [];
  for (const line of result.output.split("\n")) {
    const located = /^(.+?)\(\d+,\d+\): error (TS\d+): (.*)$/.exec(line);
    const global = /^error (TS\d+): (.*)$/.exec(line);
    if (located) findings.push({ file: located[1]!.split("\\").join("/"), rule: located[2]!, message: located[3]!.split(dir).join(".") });
    else if (global) findings.push({ file: "", rule: global[1]!, message: global[2]!.split(dir).join(".") });
  }
  const ran = result.ok || findings.length > 0;
  if (!ran) findings.push({ file: "", rule: "tsc", message: `tsc -b did not run: ${firstLine(result.output)}` });
  return { ran, findings, output: result.output.trim() };
}

/** The lint config the app was created with, or the stock Vite one for an app that has none. */
export function lintConfig(dir: string): string {
  const own = join(dir, ".oxlintrc.json");
  return existsSync(own) ? own : join(root, "scripts/fixtures/vite-oxlint/.oxlintrc.json");
}

/** The source files oxlint reads: everything under src/ except src/api, the harness's own files. */
function lintFiles(dir: string): string[] {
  const src = join(dir, "src");
  if (!existsSync(src)) return [];
  return (readdirSync(src, { recursive: true }) as string[])
    .map((path) => `src/${path.split("\\").join("/")}`)
    .filter((path) => /\.(ts|tsx|js|jsx|mts|mjs)$/.test(path) && !path.endsWith(".d.ts") && !path.startsWith("src/api/"))
    .sort();
}

/**
 * oxlint over src/ without src/api, with the app's config. Only errors are findings; warnings
 * are advice and cost nothing. The files are named one by one with --no-ignore, so a
 * .gitignore above the app can't hide them.
 */
export async function lintFindings(dir: string): Promise<StaticResult> {
  const files = lintFiles(dir);
  if (files.length === 0) return { ran: true, findings: [], output: "" };
  const result = await run(bin(dir, "oxlint"), ["-c", lintConfig(dir), "--format", "json", "--no-ignore", ...files], dir);
  try {
    const report: { diagnostics: { message: string; code?: string; severity: string; filename?: string }[] } = JSON.parse(result.stdout);
    const errors = report.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
    return {
      ran: true,
      findings: errors.map((diagnostic) => ({ file: (diagnostic.filename ?? "").split("\\").join("/"), rule: diagnostic.code ?? "", message: diagnostic.message })),
      output: errors.map((diagnostic) => `${diagnostic.filename}: ${diagnostic.code} ${diagnostic.message}`).join("\n"),
    };
  } catch {
    return { ran: false, findings: [{ file: "", rule: "oxlint", message: `oxlint did not run: ${firstLine(result.output)}` }], output: result.output.trim() };
  }
}

const key = (finding: Finding) => `${finding.file}\n${finding.rule}\n${finding.message}`;

/**
 * The findings that are not in the baseline. A finding matches by file, rule and message,
 * never by line, and each baseline entry excuses one finding.
 */
export function newFindings(now: Finding[], baseline: Finding[]): Finding[] {
  const excused = new Map<string, number>();
  for (const finding of baseline) excused.set(key(finding), (excused.get(key(finding)) ?? 0) + 1);
  return now.filter((finding) => {
    const left = excused.get(key(finding)) ?? 0;
    if (left > 0) excused.set(key(finding), left - 1);
    return left === 0;
  });
}

export const describeFinding = (finding: Finding) => `${finding.file || "(no file)"}: ${finding.rule} ${finding.message}`;
