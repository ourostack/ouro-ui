// Ouro Feel's runner: builds the probe and the page, serves them through the probe service, opens
// the page in an engine, runs each case, and judges the measures against the cases' limits
// (feel/README.md).
//
//   node feel/run.mts --engine wkwebview      (the real engine on macOS; builds its host with swiftc)
//   node feel/run.mts --engine webkit         (Playwright's WebKit: a fast first pass, a lead only)
//
// It writes feel-report.json, feel-report.md and feel-report.html to --out (.tmp/feel/report), and
// exits 1 when a measure is over its limit or a case never came to rest.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { build } from "vite";
import { cases, type FeelCaseSpec } from "./cases.ts";
import { html, judge, markdown, type Engine, type ReportEntry, type Run } from "./report.ts";
import { serveWithProbe, type ProbeService } from "./service.mts";

const repo = fileURLToPath(new URL("..", import.meta.url));
const work = join(repo, ".tmp/feel");

const { values } = parseArgs({
  options: {
    engine: { type: "string", default: "webkit" },
    host: { type: "string", default: join(work, "ouro-feel-wkwebview") },
    case: { type: "string", multiple: true },
    runs: { type: "string", default: "1" },
    out: { type: "string", default: join(work, "report") },
    width: { type: "string", default: "1280" },
    height: { type: "string", default: "800" },
  },
});
const engine = values.engine as Engine;
if (!["wkwebview", "webkit", "chromium"].includes(engine)) throw new Error(`--engine must be wkwebview, webkit or chromium, not "${engine}".`);
const runs = Number(values.runs);
if (!Number.isInteger(runs) || runs < 1) throw new Error(`--runs must be a whole number of 1 or more, not "${values.runs}".`);
const out = resolve(values.out);
const size = { width: Number(values.width), height: Number(values.height) };
const selected = values.case?.length ? cases.filter((spec) => values.case!.includes(spec.name)) : cases;
if (selected.length === 0) throw new Error(`No case named ${values.case!.join(", ")}. Cases: ${cases.map((spec) => spec.name).join(", ")}.`);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

/** Builds the probe as one plain script any host can put first in a page, and the page the cases run in. */
async function buildAll(): Promise<string> {
  await build({
    configFile: false,
    logLevel: "warn",
    build: {
      outDir: join(work, "probe"),
      emptyOutDir: true,
      minify: false,
      lib: { entry: join(repo, "feel/probe/probe.ts"), formats: ["iife"], name: "ouroFeelProbe", fileName: () => "ouro-feel-probe.js" },
    },
  });
  await build({ configFile: join(repo, "feel/fixture/vite.config.ts"), mode: "production" });
  return join(work, "probe/ouro-feel-probe.js");
}

/** A page open in an engine: it can picture itself and close. */
interface Opened {
  engineVersion: string;
  os: string;
  shoot(path: string): Promise<void>;
  close(): Promise<void>;
}

/** Waits for `path` to appear, for the WKWebView host's picture. */
async function fileAppears(path: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!existsSync(path)) {
    if (Date.now() > deadline) throw new Error(`${path} never appeared.`);
    await new Promise((done) => setTimeout(done, 100));
  }
}

/** Opens the page in the bare WKWebView host, which knows nothing of Ouro Feel but a picture on request. */
async function openWkWebView(url: string, service: ProbeService): Promise<Opened> {
  const host = resolve(values.host);
  if (!existsSync(host)) {
    const built = spawnSync("sh", [join(repo, "feel/hosts/wkwebview/build.sh"), host], { stdio: "inherit" });
    if (built.status !== 0) throw new Error("Could not build the WKWebView host (feel/hosts/wkwebview/build.sh).");
  }
  const info = join(work, "host-info.json");
  rmSync(info, { force: true });
  const child: ChildProcess = spawn(host, ["--url", url, "--width", String(size.width), "--height", String(size.height), "--info", info], { stdio: ["ignore", "inherit", "inherit"] });
  const exited = new Promise<number | null>((done) => child.on("exit", done));
  await fileAppears(info, 30_000);
  const { engineVersion, os } = JSON.parse(readFileSync(info, "utf8")) as { engineVersion: string; os: string };
  return {
    engineVersion,
    os,
    async shoot(path) {
      // The host pictures its web view when the page's title asks it to, into the folder it names.
      const reply = await service.send({ type: "title", title: `ouro-feel:shot:${path}` });
      if (!reply.ok) throw new Error(reply.error);
      await fileAppears(path, 30_000);
    },
    async close() {
      child.kill();
      await exited;
    },
  };
}

/** Opens the page in Playwright's WebKit or Chromium. The probe comes from the service, as it does in every engine. */
async function openPlaywright(url: string): Promise<Opened> {
  const playwright = await import("playwright");
  const browser = await playwright[engine as "webkit" | "chromium"].launch();
  const page = await browser.newPage({ viewport: size });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  return {
    engineVersion: browser.version(),
    os: process.platform,
    async shoot(path) {
      await page.screenshot({ path });
      if (errors.length > 0) throw new Error(`The page threw: ${errors.join("; ")}`);
    },
    close: () => browser.close(),
  };
}

/** Runs a case once on a freshly opened page. */
async function runOnce(spec: FeelCaseSpec, service: ProbeService, shot: string): Promise<Run> {
  const hello = service.hello();
  const opened = engine === "wkwebview" ? await openWkWebView(service.url, service) : await openPlaywright(service.url);
  try {
    await hello;
    const reply = await service.send({ type: "run", case: spec.name });
    if (!reply.ok) throw new Error(`${spec.name} failed in the page: ${reply.error}`);
    const { settled, measures, userAgent } = reply.result!;
    await opened.shoot(shot);
    return { settled, measures, userAgent, engineVersion: opened.engineVersion, os: opened.os, shot };
  } finally {
    await opened.close();
  }
}

const probe = await buildAll();
const service = await serveWithProbe(join(work, "page"), probe);
const entries: ReportEntry[] = [];
try {
  for (const spec of selected) {
    const done: Run[] = [];
    for (let run = 1; run <= runs; run++) {
      const result = await runOnce(spec, service, join(out, `${spec.name}-${engine}-${run}.png`));
      console.log(`${spec.name} on ${engine}, run ${run}: ${JSON.stringify(result.measures)}`);
      done.push(result);
    }
    entries.push(judge(spec, engine, done));
  }
} finally {
  service.close();
}

writeFileSync(join(out, "feel-report.json"), `${JSON.stringify(entries, null, 2)}\n`);
writeFileSync(join(out, "feel-report.md"), markdown(entries));
writeFileSync(join(out, "feel-report.html"), html(entries));
if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, markdown(entries), { flag: "a" });
console.log(markdown(entries));
process.exitCode = entries.every((entry) => entry.pass) ? 0 : 1;
