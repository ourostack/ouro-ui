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
import { bin, describeFinding, lintFindings, newFindings, run, typeFindings, type Finding, type StaticResult } from "./static.mts";
import { agentConfigDir, changedScreenFiles, readArmRecord, restoreConfig } from "./workspace.mts";

//   node scripts/agent-usability/score.mts <arm> <screen> <app-dir> [--arm-record <arm.json>] [--out <dir>]
//
// Scores one agent-built screen with no model calls: tsc, oxlint, a Vite build, axe at 390px
// and 1280px in light and dark mode, and the screen's behavior checks (checks/<screen>.mts) in
// Chromium. Writes score.json, summary.md and screenshots (evidence only) to --out (default
// <app-dir>/score) and prints the summary. The formula is formula.mts.
//
// --arm-record is the arm's record from arms/create.sh: the baseline the type check and the
// linter are compared with, and the original config files, which the scorer puts back before
// it scores (the agent's versions move to <app-dir>/.agent-config/). Give the copy the agent
// never saw (<arm-app>/.agent-usability/arm.json, or runs/<date>/arms/<arm>.json). Without
// it nothing is excused and the config is scored as the agent left it.
// When the app has a package-lock.json and no node_modules, it runs `npm ci` first.

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

/** The axe-core rules that earn or cost points: WCAG 2.0, 2.1 and 2.2 at levels A and AA. */
const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

export interface Violation {
  id: string;
  impact: string | null;
  help: string;
  state: string;
  targets: string[];
}

/** A static check's result against the arm's baseline. */
export interface StaticCheck {
  pass: boolean;
  /** The findings the agent is charged for. */
  new: Finding[];
  /** How many findings the baseline excused. */
  excused: number;
  output: string;
}

export interface AxeConfig {
  viewport: Viewport;
  width: number;
  theme: Theme;
  pass: boolean;
  states: { name: string; reached: boolean; error?: string }[];
  /** WCAG A and AA violations, which cost the configuration its points. */
  violations: Violation[];
  /** axe-core's other findings (its best-practice rules), listed and not scored. */
  advisories: Violation[];
}

export interface BehaviorResult {
  id: string;
  title: string;
  covers: number[];
  viewport: Viewport;
  /** False for a check a near-empty page passes (formula.mts, rule 1). */
  gate: boolean;
  pass: boolean;
  error?: string;
}

export interface ScoreResult {
  arm: Arm;
  screen: Screen;
  scoredAt: string;
  formulaVersion: number;
  /** What scored it, so a table can say exactly what its numbers came from. */
  versions: { harness: string | null; node: string; axeCore: string; playwright: string; chromium: string | null };
  /** The arm record the baseline came from, or null when none was given. */
  armRecord: string | null;
  checks: {
    typecheck: StaticCheck;
    lint: StaticCheck;
    build: { pass: boolean; output: string };
    /** The backend stand-in, src/api/. */
    fixtures: { pass: boolean; changed: string[] };
    /** The config files the agent changed. They cost nothing: the run is scored with the originals. */
    config: { changed: string[] };
  };
  axe: AxeConfig[];
  behavior: BehaviorResult[];
  /** Evidence for people; they earn nothing. */
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
  /** The arm's record (arm.json), from outside the agent's reach. */
  record?: string;
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

/** A static check's findings without the ones the arm started with. */
function charge(result: StaticResult, baseline: Finding[], clean: string): StaticCheck {
  const fresh = newFindings(result.findings, baseline);
  return { pass: fresh.length === 0, new: fresh, excused: result.findings.length - fresh.length, output: tail(result.output) || clean };
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

/**
 * One axe-core run with its default rules. WCAG A and AA violations are scored. The rest are
 * best-practice rules such as `region`, which a correct menu rendered in a portal on the body
 * breaks, so they are listed and cost nothing.
 */
async function scan(page: Page, state: string): Promise<{ violations: Violation[]; advisories: Violation[] }> {
  await page.addScriptTag({ content: axeSource });
  const violations = await page.evaluate(async (exclude) => {
    const axe = (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: { id: string; impact: string | null; help: string; tags: string[]; nodes: { target: string[] }[] }[] }> } }).axe;
    const result = await axe.run({ exclude: exclude.map((selector) => [selector]) }, { resultTypes: ["violations"] });
    return result.violations.map((violation) => ({ id: violation.id, impact: violation.impact, help: violation.help, tags: violation.tags, targets: violation.nodes.map((node) => node.target.join(" ")) }));
  }, axeExclude);
  const found = violations.map(({ tags, ...violation }) => ({ violation: { ...violation, state }, scored: tags.some((tag) => wcagTags.includes(tag)) }));
  return {
    violations: found.filter((entry) => entry.scored).map((entry) => entry.violation),
    advisories: found.filter((entry) => !entry.scored).map((entry) => entry.violation),
  };
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
      const config: AxeConfig = { viewport, width: viewports[viewport].viewport!.width, theme, pass: false, states: [], violations: [], advisories: [] };
      const all = [{ name: "initial", reach: async () => undefined }, ...states.filter((state) => !state.viewport || state.viewport === viewport)];
      for (const state of all) {
        // A screen that never loaded can't reach a later state; don't wait for each one.
        if (config.states[0]?.reached === false) {
          config.states.push({ name: state.name, reached: false, error: "the screen never loaded" });
          continue;
        }
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
        if (config.states.at(-1)!.reached) {
          const found = await scan(page, state.name);
          config.violations.push(...found.violations);
          config.advisories.push(...found.advisories);
        }
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
    const result: BehaviorResult = { id: check.id, title: check.title, covers: check.covers, viewport: check.viewport, gate: check.gate !== false, pass: false };
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

function failures(result: Omit<ScoreResult, "failures" | "points">, earned: Points): string[] {
  const lines: string[] = [];
  const { typecheck, lint, build, fixtures, config } = result.checks;
  if (!build.pass) lines.push("build: vite build failed, so no behavior check counts");
  if (!fixtures.pass) lines.push(`backend stand-in: the agent changed ${fixtures.changed.join(", ")}, so no behavior check counts`);
  if (config.changed.length > 0) lines.push(`configuration: the agent changed ${config.changed.join(", ")}; scored with the arm's originals, which costs nothing (the agent's files are in ${agentConfigDir}/)`);
  if (earned.score === 0) lines.push("nothing works: no behavior check that exercises the task passed and counted, so no point is earned");
  for (const [name, check] of [["typecheck", typecheck], ["lint", lint]] as const) {
    if (!check.pass) lines.push(`${name}: ${check.new.length} new ${check.new.length === 1 ? "error" : "errors"}, the first in ${describeFinding(check.new[0]!)} (-${weights[name]})`);
  }
  const perConfig = weights.axe / Math.max(result.axe.length, 1);
  for (const axeConfig of result.axe.filter((candidate) => !candidate.pass)) {
    const reasons = [
      ...axeConfig.states.filter((state) => !state.reached).map((state) => `${state.name} not reached: ${state.error}`),
      ...axeConfig.violations.map((violation) => `${violation.id} in ${violation.state} (${violation.targets.slice(0, 3).join(", ")})`),
    ];
    lines.push(`axe ${axeConfig.width}px ${axeConfig.theme}: ${reasons.join("; ") || "not run"} (-${formatPoints(perConfig)})`);
  }
  const perCheck = weights.behavior / Math.max(result.behavior.length, 1);
  for (const check of result.behavior.filter((candidate) => !candidate.pass)) {
    lines.push(`behavior ${check.id}: ${brief(check.error ?? "")} (-${formatPoints(perCheck)})`);
  }
  return lines;
}

const version = (name: string): string => JSON.parse(readFileSync(require.resolve(`${name}/package.json`), "utf8")).version;

export async function score({ arm, screen, dir: given, out: outGiven, record: recordPath, log = () => undefined }: ScoreOptions): Promise<ScoreResult> {
  const dir = resolve(given);
  const out = resolve(outGiven ?? join(dir, "score"));
  mkdirSync(join(out, "screenshots"), { recursive: true });
  const record = recordPath ? readArmRecord(resolve(recordPath)) : undefined;
  if (record && record.arm !== arm) throw new Error(`${recordPath} is the record of the ${record.arm} arm, not ${arm}`);

  // Before anything reads them, so the install, the type check, the linter and the build all
  // run with the config the arm was made with.
  const config = { changed: record ? restoreConfig(dir, record) : [] };

  if (existsSync(join(dir, "package-lock.json")) && !existsSync(join(dir, "node_modules"))) {
    // Without install scripts: this is code an agent wrote, and the build needs none.
    log("npm ci");
    const install = await run("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], dir);
    if (!install.ok) throw new Error(`npm ci failed in ${dir}:\n${tail(install.output)}`);
  }

  log("protected files");
  const changedApi = changedScreenFiles(dir, screen);
  const fixtures = { pass: changedApi.length === 0, changed: changedApi };
  log("tsc -b");
  const typecheck = charge(await typeFindings(dir), record?.baseline.typecheck ?? [], "tsc -b reported no error.");
  log("oxlint");
  const lint = charge(await lintFindings(dir), record?.baseline.lint ?? [], "oxlint reported no error.");
  log("vite build");
  const dist = mkdtempSync(join(tmpdir(), "agent-usability-dist-"));
  const built = await run(bin(dir, "vite"), ["build", "--outDir", dist, "--emptyOutDir", "--logLevel", "warn"], dir);
  const build = { pass: built.ok && existsSync(join(dist, "index.html")), output: tail(built.output) || "vite build passed." };

  const screenshots: string[] = [];
  const { checks } = checksFor(screen);
  let axe: AxeConfig[];
  let behavior: BehaviorResult[];
  let chromiumVersion: string | null = null;
  if (build.pass) {
    const { server, url } = await serve(dist);
    const browser = await chromium.launch();
    chromiumVersion = browser.version();
    expect.configure({ timeout: 5000 });
    try {
      log("axe and screenshots");
      axe = await axeConfigs(browser, url, screen, out, screenshots);
      log("behavior checks");
      const dead = axe.every((axeConfig) => axeConfig.states[0]?.reached === false);
      // Every check starts by waiting for the screen. When it loaded in none of the four
      // configurations, that wait has already failed four times.
      behavior = dead
        ? checks.map((check) => ({ id: check.id, title: check.title, covers: check.covers, viewport: check.viewport, gate: check.gate !== false, pass: false, error: `the screen never loaded: ${axe[0]!.states[0]!.error}` }))
        : await behaviors(browser, url, screen);
    } finally {
      await browser.close();
      server.close();
    }
  } else {
    axe = (["phone", "desktop"] as const).flatMap((viewport) =>
      themes.map((theme) => ({ viewport, width: viewports[viewport].viewport!.width, theme, pass: false, states: [], violations: [], advisories: [] })),
    );
    behavior = checks.map((check) => ({ id: check.id, title: check.title, covers: check.covers, viewport: check.viewport, gate: check.gate !== false, pass: false, error: "the app did not build" }));
  }
  rmSync(dist, { recursive: true, force: true });

  const harness = await run("git", ["-C", root, "rev-parse", "HEAD"], root);
  const counted = build.pass && fixtures.pass;
  const partial: Omit<ScoreResult, "failures" | "points"> = {
    arm,
    screen,
    scoredAt: new Date().toISOString(),
    formulaVersion,
    versions: { harness: harness.ok ? harness.stdout.trim() : null, node: process.version, axeCore: version("axe-core"), playwright: version("playwright"), chromium: chromiumVersion },
    armRecord: recordPath ?? null,
    checks: { typecheck, lint, build, fixtures, config },
    axe,
    behavior,
    screenshots,
  };
  const earned = points({
    typecheck: typecheck.pass,
    lint: lint.pass,
    axe: axe.map((axeConfig) => axeConfig.pass),
    behavior: behavior.map((check) => counted && check.pass),
    gates: behavior.map((check) => check.gate),
  });
  const result: ScoreResult = { ...partial, points: earned, failures: failures(partial, earned) };
  writeFileSync(join(out, "score.json"), `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(join(out, "summary.md"), summary(result, relative(dir, out) || "."));
  return result;
}

const mark = (pass: boolean) => (pass ? "pass" : "**fail**");

/** The markdown summary of one score. */
export function summary(result: ScoreResult, outPath = "score"): string {
  const { points: p } = result;
  const advisories = [...new Set(result.axe.flatMap((config) => config.advisories.map((advisory) => `${advisory.id} in ${advisory.state}`)))];
  const lines = [
    `## ${result.screen}, ${armNames[result.arm]}: ${formatPoints(p.score)}/${p.max}`,
    "",
    "| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
    `| ${result.screen} | ${result.arm} | ${formatPoints(p.score)} | ${formatPoints(p.typecheck)}/${weights.typecheck} | ${formatPoints(p.lint)}/${weights.lint} | ${formatPoints(p.axe)}/${weights.axe} | ${formatPoints(p.behavior)}/${weights.behavior} |`,
    "",
    result.failures.length === 0 ? "Every check passed." : result.failures.map((line) => `- ${line}`).join("\n"),
    "",
    `Problems the app had before the agent ran, which cost nothing: ${result.checks.typecheck.excused} type errors, ${result.checks.lint.excused} lint errors.`,
    ...(advisories.length > 0 ? [`axe-core's best-practice findings, which cost nothing: ${advisories.join(", ")}.`] : []),
    "",
    "| Behavior check | Acceptance items | Viewport | Result |",
    "| --- | --- | --- | --- |",
    ...result.behavior.map((check) => `| ${check.title} | ${check.covers.join(", ")} | ${check.viewport} | ${mark(check.pass)} |`),
    "",
    "| Axe | Result |",
    "| --- | --- |",
    ...result.axe.map((config) => `| ${config.width}px ${config.theme} | ${mark(config.pass)} |`),
    "",
    `Screenshots, as evidence only: ${result.screenshots.length} in ${outPath}/screenshots.`,
    "",
  ];
  return lines.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const option = (name: string) => {
    const index = args.indexOf(name);
    return index === -1 ? undefined : args.splice(index, 2)[1];
  };
  const out = option("--out");
  const record = option("--arm-record");
  const [arm, screen, dir] = args;
  if (!arm || !isArm(arm) || !screen || !isScreen(screen) || !dir) {
    console.error("usage: score.mts <shadcn|shadcn-skill|ouro> <screen> <app-dir> [--arm-record <arm.json>] [--out <dir>]");
    process.exit(1);
  }
  const result = await score({ arm, screen, dir, ...(out ? { out } : {}), ...(record ? { record } : {}), log: (line) => console.error(`[score] ${line}`) });
  process.stdout.write(summary(result));
}
