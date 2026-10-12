import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "@playwright/test";
import { chromium, type Browser, type BrowserContextOptions, type Page } from "playwright";
import { checksFor } from "./checks/index.mts";
import type { Viewport } from "./checks/helpers.mts";
import { formatPoints, formulaVersion, points, weights, type Points } from "./formula.mts";
import { armNames, isArm, type Arm } from "./prompt.mts";
import { isScreen, type Screen } from "./screens.mts";
import { armRecord, expectedFixtures, listFiles } from "./workspace.mts";

//   node scripts/agent-usability/score.mts <arm> <screen> <app-dir> [--out <dir>]
//
// Scores one agent-built screen with no model calls: tsc, oxlint, a Vite build, axe at 390px
// and 1280px in light and dark mode (with screenshots), and the screen's behavior checks
// (checks/<screen>.mts) in Chromium. Writes score.json and summary.md to --out (default
// <app-dir>/score) and prints the summary. The formula is formula.mts. When the app has a
// package-lock.json and no node_modules, it runs `npm ci` first.

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const require = createRequire(import.meta.url);

export const viewports: Record<Viewport, BrowserContextOptions> = {
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1280, height: 800 } },
};
const themes = ["light", "dark"] as const;
type Theme = (typeof themes)[number];

/** Base UI's focus guards, left out of every scan as in Ouro's own tests (lib/ouro/testing/axe.ts). */
const axeExclude = ["[data-base-ui-focus-guard]"];

export interface Violation {
  id: string;
  impact: string | null;
  help: string;
  state: string;
  targets: string[];
}

export interface AxeConfig {
  viewport: Viewport;
  width: number;
  theme: Theme;
  pass: boolean;
  states: { name: string; reached: boolean; error?: string }[];
  violations: Violation[];
}

export interface BehaviorResult {
  id: string;
  title: string;
  covers: number[];
  viewport: Viewport;
  pass: boolean;
  error?: string;
}

export interface ScoreResult {
  arm: Arm;
  screen: Screen;
  scoredAt: string;
  formulaVersion: number;
  checks: {
    typecheck: { pass: boolean; output: string };
    lint: { pass: boolean; files: string[]; output: string };
    build: { pass: boolean; output: string };
    fixtures: { pass: boolean; changed: string[] };
  };
  axe: AxeConfig[];
  behavior: BehaviorResult[];
  screenshots: string[];
  points: Points;
  /** One line for every lost point. */
  failures: string[];
}

export interface ScoreOptions {
  arm: Arm;
  screen: Screen;
  dir: string;
  out?: string;
  log?: (line: string) => void;
}

const tail = (text: string, length = 6000) => (text.length > length ? `…${text.slice(-length)}` : text).trim();
// eslint-disable-next-line no-control-regex -- strips the ANSI colors Playwright puts in messages
const plain = (text: string) => text.replace(/\u001b\[[0-9;]*m/g, "");

/** An error's first line and, when Playwright names one, the locator it was waiting for. */
function brief(error: unknown): string {
  const lines = plain(String((error as Error)?.message ?? error)).split("\n").map((line) => line.trim()).filter(Boolean);
  const locator = lines.find((line) => line.startsWith("Locator:"));
  return [lines[0] ?? "failed", locator && !lines[0]?.includes(locator) ? `(${locator})` : ""].filter(Boolean).join(" ");
}

/** The app's own copy of a tool: node_modules/.bin/<name> in the app or a folder above it. */
function bin(dir: string, name: string): string {
  for (let current = dir; ; current = dirname(current)) {
    const candidate = join(current, "node_modules/.bin", name);
    if (existsSync(candidate)) return candidate;
    if (dirname(current) === current) throw new Error(`no ${name} in ${dir} or above it; install the app first`);
  }
}

function run(command: string, args: string[], cwd: string) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" } });
  return { ok: result.status === 0, output: `${result.stdout ?? ""}${result.stderr ?? ""}${result.error ? String(result.error) : ""}` };
}

const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

function checkFixtures(dir: string, screen: Screen) {
  const expected = expectedFixtures(dir, screen);
  const changed = Object.entries(expected)
    .filter(([path, hash]) => !existsSync(join(dir, path)) || sha256(join(dir, path)) !== hash)
    .map(([path]) => path);
  return { pass: changed.length === 0, changed };
}

/** The agent's source: src/ files that are new or changed since the arm was made, without src/api. */
function agentFiles(dir: string): string[] {
  const baseline = armRecord(dir)?.files ?? {};
  return listFiles(join(dir, "src"))
    .map((path) => `src/${path}`)
    .filter((path) => /\.(ts|tsx|js|jsx|mts|mjs)$/.test(path) && !path.endsWith(".d.ts") && !path.startsWith("src/api/"))
    .filter((path) => baseline[path] !== sha256(join(dir, path)));
}

function lint(dir: string) {
  const files = agentFiles(dir);
  if (files.length === 0) return { pass: true, files, output: "No files of the agent's to lint." };
  const config = join(root, "scripts/fixtures/vite-oxlint/.oxlintrc.json");
  const result = run(join(root, "node_modules/.bin/oxlint"), ["-c", config, "--format", "unix", "--no-ignore", ...files], dir);
  const problems = result.output.split("\n").filter((line) => /^\S.*:\d+:\d+: /.test(line));
  return { pass: result.ok && problems.length === 0, files, output: tail(result.output) };
}

const types: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".json": "application/json",
};

/** Serves the build on localhost, with index.html for every unknown path. */
function serve(dist: string): Promise<{ server: Server; url: string }> {
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    let file = resolve(dist, `.${path}`);
    if (!file.startsWith(dist) || !existsSync(file) || path.endsWith("/")) file = join(dist, "index.html");
    response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    response.end(readFileSync(file));
  });
  return new Promise((done) => server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    done({ server, url: `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/` });
  }));
}

async function settle(page: Page) {
  await page
    .waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running"), undefined, { timeout: 3000 })
    .catch(() => undefined);
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
}

async function newPage(browser: Browser, url: string, viewport: Viewport, theme: Theme) {
  const context = await browser.newContext({ ...viewports[viewport], colorScheme: theme, reducedMotion: "no-preference" });
  if (theme === "dark") {
    await context.addInitScript(() => {
      const apply = () => document.documentElement?.classList.add("dark");
      apply();
      document.addEventListener("readystatechange", apply);
    });
  }
  const page = await context.newPage();
  await page.goto(url);
  return { context, page };
}

const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

async function scan(page: Page, state: string): Promise<Violation[]> {
  await page.addScriptTag({ content: axeSource });
  const violations = await page.evaluate(async (exclude) => {
    const axe = (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: { id: string; impact: string | null; help: string; nodes: { target: string[] }[] }[] }> } }).axe;
    const result = await axe.run({ exclude: exclude.map((selector) => [selector]) }, { resultTypes: ["violations"] });
    return result.violations.map((violation) => ({ id: violation.id, impact: violation.impact, help: violation.help, targets: violation.nodes.map((node) => node.target.join(" ")) }));
  }, axeExclude);
  return violations.map((violation) => ({ ...violation, state }));
}

async function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} took longer than ${ms / 1000}s`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function axeConfigs(browser: Browser, url: string, screen: Screen, out: string, screenshots: string[]): Promise<AxeConfig[]> {
  const { ready, states } = checksFor(screen);
  const configs: AxeConfig[] = [];
  for (const viewport of ["phone", "desktop"] as const) {
    for (const theme of themes) {
      const config: AxeConfig = { viewport, width: viewports[viewport].viewport!.width, theme, pass: false, states: [], violations: [] };
      const all = [{ name: "initial", reach: async () => undefined }, ...states.filter((state) => !state.viewport || state.viewport === viewport)];
      for (const state of all) {
        const { context, page } = await newPage(browser, url, viewport, theme);
        try {
          await withTimeout(
            (async () => {
              await ready(page);
              await state.reach(page);
              await settle(page);
            })(),
            30_000,
            `reaching ${state.name}`,
          );
          config.states.push({ name: state.name, reached: true });
        } catch (error) {
          config.states.push({ name: state.name, reached: false, error: brief(error) });
        }
        const shot = `screenshots/${config.width}-${theme}-${state.name}.png`;
        await page.screenshot({ path: join(out, shot), fullPage: true }).catch(() => undefined);
        screenshots.push(shot);
        if (config.states.at(-1)!.reached) config.violations.push(...(await scan(page, state.name)));
        await context.close();
      }
      config.pass = config.states.every((state) => state.reached) && config.violations.length === 0;
      configs.push(config);
    }
  }
  return configs;
}

async function behaviors(browser: Browser, url: string, screen: Screen): Promise<BehaviorResult[]> {
  const { ready, checks } = checksFor(screen);
  const results: BehaviorResult[] = [];
  for (const check of checks) {
    const { context, page } = await newPage(browser, url, check.viewport, "light");
    const result: BehaviorResult = { id: check.id, title: check.title, covers: check.covers, viewport: check.viewport, pass: false };
    try {
      await withTimeout(
        (async () => {
          await ready(page);
          await check.run(page);
        })(),
        45_000,
        check.id,
      );
      result.pass = true;
    } catch (error) {
      result.error = tail(plain(String((error as Error).message ?? error)), 1500);
    }
    results.push(result);
    await context.close();
  }
  return results;
}

function failures(result: Omit<ScoreResult, "failures" | "points">): string[] {
  const lines: string[] = [];
  const { typecheck, lint, build, fixtures } = result.checks;
  if (!typecheck.pass) lines.push(`typecheck: tsc -b failed (-${weights.typecheck})`);
  if (!lint.pass) lines.push(`lint: oxlint reported problems in the agent's files (-${weights.lint})`);
  if (!build.pass) lines.push("build: vite build failed, so axe and the behavior checks could not run");
  if (!fixtures.pass) lines.push(`fixtures: the agent changed ${fixtures.changed.join(", ")}, so axe and the behavior checks don't count`);
  const perConfig = weights.axe / Math.max(result.axe.length, 1);
  for (const config of result.axe.filter((config) => !config.pass)) {
    const reasons = [
      ...config.states.filter((state) => !state.reached).map((state) => `${state.name} not reached: ${state.error}`),
      ...config.violations.map((violation) => `${violation.id} in ${violation.state} (${violation.targets.slice(0, 3).join(", ")})`),
    ];
    lines.push(`axe ${config.width}px ${config.theme}: ${reasons.join("; ") || "not run"} (-${formatPoints(perConfig)})`);
  }
  const perCheck = weights.behavior / Math.max(result.behavior.length, 1);
  for (const check of result.behavior.filter((check) => !check.pass)) {
    lines.push(`behavior ${check.id}: ${brief(check.error ?? "")} (-${formatPoints(perCheck)})`);
  }
  return lines;
}

export async function score({ arm, screen, dir: given, out: outGiven, log = () => undefined }: ScoreOptions): Promise<ScoreResult> {
  const dir = resolve(given);
  const out = resolve(outGiven ?? join(dir, "score"));
  mkdirSync(join(out, "screenshots"), { recursive: true });
  const record = armRecord(dir);
  if (record && record.arm !== arm) throw new Error(`${dir} was made for the ${record.arm} arm, not ${arm}`);

  if (existsSync(join(dir, "package-lock.json")) && !existsSync(join(dir, "node_modules"))) {
    log("npm ci");
    const install = run("npm", ["ci", "--no-audit", "--no-fund"], dir);
    if (!install.ok) throw new Error(`npm ci failed in ${dir}:\n${tail(install.output)}`);
  }

  log("fixtures");
  const fixtures = checkFixtures(dir, screen);
  log("tsc -b");
  const tsc = run(bin(dir, "tsc"), ["-b", "--force"], dir);
  const typecheck = { pass: tsc.ok, output: tail(tsc.output) || "tsc -b passed." };
  log("oxlint");
  const linted = lint(dir);
  log("vite build");
  const dist = mkdtempSync(join(tmpdir(), "agent-usability-dist-"));
  const built = run(bin(dir, "vite"), ["build", "--outDir", dist, "--emptyOutDir", "--logLevel", "warn"], dir);
  const build = { pass: built.ok && existsSync(join(dist, "index.html")), output: tail(built.output) || "vite build passed." };

  const screenshots: string[] = [];
  const { checks } = checksFor(screen);
  let axe: AxeConfig[];
  let behavior: BehaviorResult[];
  if (build.pass) {
    const { server, url } = await serve(dist);
    const browser = await chromium.launch();
    expect.configure({ timeout: 5000 });
    try {
      log("axe and screenshots");
      axe = await axeConfigs(browser, url, screen, out, screenshots);
      log("behavior checks");
      behavior = await behaviors(browser, url, screen);
    } finally {
      await browser.close();
      server.close();
    }
  } else {
    axe = (["phone", "desktop"] as const).flatMap((viewport) =>
      themes.map((theme) => ({ viewport, width: viewports[viewport].viewport!.width, theme, pass: false, states: [], violations: [] })),
    );
    behavior = checks.map((check) => ({ id: check.id, title: check.title, covers: check.covers, viewport: check.viewport, pass: false, error: "the app did not build" }));
  }
  rmSync(dist, { recursive: true, force: true });

  const counted = build.pass && fixtures.pass;
  const partial: Omit<ScoreResult, "failures" | "points"> = {
    arm,
    screen,
    scoredAt: new Date().toISOString(),
    formulaVersion,
    checks: { typecheck, lint: linted, build, fixtures },
    axe,
    behavior,
    screenshots,
  };
  const result: ScoreResult = {
    ...partial,
    points: points({
      typecheck: typecheck.pass,
      lint: linted.pass,
      axe: axe.map((config) => counted && config.pass),
      behavior: behavior.map((check) => counted && check.pass),
    }),
    failures: failures(partial),
  };
  writeFileSync(join(out, "score.json"), `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(join(out, "summary.md"), summary(result, relative(dir, out) || "."));
  return result;
}

const mark = (pass: boolean) => (pass ? "pass" : "**fail**");

/** The markdown summary of one score. */
export function summary(result: ScoreResult, outPath = "score"): string {
  const { points: p } = result;
  const lines = [
    `## ${result.screen}, ${armNames[result.arm]}: ${formatPoints(p.score)}/${p.max}`,
    "",
    "| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
    `| ${result.screen} | ${result.arm} | ${formatPoints(p.score)} | ${formatPoints(p.typecheck)}/${weights.typecheck} | ${formatPoints(p.lint)}/${weights.lint} | ${formatPoints(p.axe)}/${weights.axe} | ${formatPoints(p.behavior)}/${weights.behavior} |`,
    "",
    result.failures.length === 0 ? "Every check passed." : result.failures.map((line) => `- ${line}`).join("\n"),
    "",
    "| Behavior check | Acceptance items | Viewport | Result |",
    "| --- | --- | --- | --- |",
    ...result.behavior.map((check) => `| ${check.title} | ${check.covers.join(", ")} | ${check.viewport} | ${mark(check.pass)} |`),
    "",
    "| Axe | Result |",
    "| --- | --- |",
    ...result.axe.map((config) => `| ${config.width}px ${config.theme} | ${mark(config.pass)} |`),
    "",
    `Screenshots: ${result.screenshots.length} in ${outPath}/screenshots.`,
    "",
  ];
  return lines.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf("--out");
  const out = outIndex === -1 ? undefined : args.splice(outIndex, 2)[1];
  const [arm, screen, dir] = args;
  if (!arm || !isArm(arm) || !screen || !isScreen(screen) || !dir) {
    console.error("usage: score.mts <shadcn|shadcn-skill|ouro> <screen> <app-dir> [--out <dir>]");
    process.exit(1);
  }
  const result = await score({ arm, screen, dir, ...(out ? { out } : {}), log: (line) => console.error(`[score] ${line}`) });
  process.stdout.write(summary(result));
}
