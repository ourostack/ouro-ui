import { mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { after } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { main, type Finding } from "../../registry/ouro/check/check.ts";

// Shared setup of the Ouro check's node:test files: a scratch folder of its own per process, and fixture builders.

// Ouro check's Node side (check.ts and serve.ts) against the fixture pages, one pass and one fail page per rule, in
// headless Chromium. scripts/check.test.mjs runs this file under Node's coverage and holds both files to 100%.

export const here = dirname(fileURLToPath(import.meta.url));
export const root = join(here, "../..");
export const fixtures = join(here, "fixtures");
export const scratch = join(root, ".tmp", `check-${process.pid}`);
mkdirSync(scratch, { recursive: true });
after(() => rmSync(scratch, { recursive: true, force: true }));

export const require = createRequire(import.meta.url);
export const axe = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
export const playwrightModule = require.resolve("playwright");
// The Chromium Playwright would launch, unless BROWSER_EXECUTABLE names another (a local run without Playwright's full
// Chromium points it at the headless shell).
export const browser = process.env.BROWSER_EXECUTABLE ?? chromium.executablePath();
export const two: [number, number][] = [[390, 844], [1440, 900]];
export const quiet = () => undefined;
let made = 0;
export const dir = (name: string) => {
  const path = join(scratch, `${name}-${++made}`);
  mkdirSync(path, { recursive: true });
  return path;
};
export const page = (body: string, head = "") =>
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Page</title><style>body{font:16px/1.5 system-ui,sans-serif;margin:0;padding:16px}</style>${head}<main>${body}</main>`;
export const site = (name: string, pages: Record<string, string>) => {
  const folder = join(dir("sites"), name);
  mkdirSync(folder);
  for (const [file, html] of Object.entries(pages)) {
    mkdirSync(dirname(join(folder, file)), { recursive: true });
    writeFileSync(join(folder, file), html);
  }
  return folder;
};
export const spots = (findings: Finding[]) => findings.map((f) => `${f.page} ${f.width}x${f.height} ${f.theme} ${f.rule} ${f.element}`).sort();
export const run = async (argv: string[], options: { cwd?: string; env?: Record<string, string | undefined>; from?: string[] } = {}) => {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(argv, { cwd: options.cwd ?? scratch, env: options.env ?? {}, log: (line) => out.push(line), error: (line) => err.push(line), ...(options.from ? { from: options.from } : {}) });
  return { code, out: out.join("\n"), err: err.join("\n") };
};

