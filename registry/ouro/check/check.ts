export { BUDGETS, caption, check, dprAt, EXIT, group, HINTS, LABELS, main, merge, parseArgs, RULES, SIZES, summary };
export type { Budgets, CheckOptions, CheckResult, Finding, Gate, MergeOptions, Report };

import { realpathSync } from "node:fs";
import { appendFile, copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Browser, BrowserType, Page } from "playwright";
import { ALIASES, boxOf, decodeImages, isReady, listAllowances, listenForReady, outline, runAxe, type Allowance, type Box } from "./in-page.ts";
import { findLoadingIssues, interactionSince, listenForMeasures, markPressables, NEVER_PRESS, pressPoint } from "./measure.ts";
import { findOverlaps } from "./overlap-check.ts";
import { globToRegExp, listPages, serve } from "./serve.ts";
import { findSizeIssues, type Measure, type PageIssue } from "./size-check.ts";

// Ouro check: every page at every screen size from a 320px phone to a 3840px screen, plus the short landscape screens of
// a dual-screen phone unfolded sideways, light and dark, at density 2 up to 3072px wide and 1 above. Pass and fail come from measurement, never from
// looking at pictures; the pictures are for the person who fixes what it finds.
//
//   node lib/ouro/check/check.ts <url | built folder>… [--pages <glob>] [--out <folder>] [--sizes WxH,…]
//        [--themes light,dark] [--before <old report.json>] [--config ouro-check.json] [--no-axe]
//        [--no-measured] [--ready-event <name>] [--shard k/n]
//   node lib/ouro/check/check.ts merge <out folder>… [--out <folder>] [--config ouro-check.json]
//
// Exits as every Ouro tool does (EXIT): 0 ok, 1 error (the check could not run), 2 usage, 3 findings. Playwright comes
// from the app's playwright (or PLAYWRIGHT_MODULE), Chromium from Playwright or BROWSER_EXECUTABLE, axe-core from the app or AXE_CORE.
// The browser always runs headless.

interface Finding {
  site: string;
  page: string;
  width: number;
  height: number;
  theme: string;
  rule: string;
  element: string;
  detail: string;
  gated: boolean;
  // A measured rule's number, its budget and their unit ("ms", or "" for a score): the record a later run compares.
  value?: number;
  budget?: number;
  unit?: string;
  // inp's presses of the control, each in ms, whose 75th percentile is its value.
  samples?: number[];
  // The device pixel ratio the page was drawn at (dprAt); missing in a report written before it was recorded.
  dpr?: number;
  box?: Box;
  closeUp?: string;
  pair?: string;
}

// A finding from the --before report that this run did not find at its size: fixed, unless another size still has it.
interface Candidate extends Finding {
  before: string;
  after: string;
}

interface Shot {
  site: string;
  page: string;
  file: string;
  width: number;
  height: number;
  theme: string;
  count: number;
}

interface PageRef {
  site: string;
  page: string;
  name: string;
}

interface Report {
  targets: string[];
  sizes: [number, number][];
  themes: string[];
  shard?: string;
  pages: PageRef[];
  findings: Finding[];
  fixed: Finding[];
  candidates: Candidate[];
  // The elements a page opts out of a rule, with their reasons, once a page.
  allowances: (Allowance & { site: string; page: string })[];
  shots: Shot[];
}

interface CheckResult extends Report {
  gated: Finding[];
}

interface Budgets {
  inp: number;
  "layout-shift": number;
  "first-content": number;
}

interface Gate {
  waive?: Record<string, Record<string, string>>;
  budgets?: Partial<Budgets>;
  // The controls inp may press, as CSS selectors, besides those marked data-ouro-check-press; and how often it presses
  // each.
  press?: string[];
  pressRepeat?: number;
  // Where long lines are checked, and against what: a page glob (two stars for all pages) holds the page's prose, a
  // CSS selector ("main .chat-message") holds what it matches. Without one the rule is off.
  measure?: Record<string, string>;
}

interface CheckOptions {
  targets: string[];
  out: string;
  pages?: string;
  sizes?: [number, number][];
  themes?: string[];
  shard?: [number, number];
  before?: Finding[];
  beforeDir?: string;
  config?: Gate;
  axe?: string | false;
  measured?: boolean;
  readyEvents?: string[];
  chromium: BrowserType;
  executablePath?: string;
  readyTimeout?: number;
  log?: (line: string) => void;
}

interface MergeOptions {
  dirs: string[];
  out: string;
  config?: Gate;
  chromium: BrowserType;
  executablePath?: string;
}

interface Target extends PageRef {
  url: string;
}

const SIZES: [number, number][] = [
  [320, 640], [360, 780], [390, 844], [480, 900], [600, 960], [720, 1000], [768, 1024], [900, 1000], [1024, 768], [1180, 820],
  [1280, 800], [1440, 900], [1680, 1050], [1920, 1080], [2560, 1440], [3200, 1800], [3840, 2160],
  // A dual-screen phone unfolded sideways, and other short landscape screens.
  [640, 360], [720, 420], [900, 500], [1000, 600],
];
// axe reads the same markup at every width, so it runs at a phone and a laptop size, or at the narrowest and widest of
// other sizes.
const AXE_SIZES = ["390x844", "1440x900"];
const LABELS: Record<string, string> = {
  overlap: "overlap",
  "sideways-scroll": "sideways scroll",
  "clipped-text": "clipped text",
  "long-lines": "long lines",
  "blurry-image": "blurry picture",
  axe: "accessibility (axe)",
  "broken-image": "broken picture",
  "http-error": "page did not load",
  "not-ready": "page not ready",
  "layout-shift": "layout shift while loading",
  "first-content": "slow first content",
  inp: "slow press",
};
const RULES = Object.keys(LABELS);
// The exit codes every Ouro tool shares (the Ouro AX kit's table: 0 ok, 1 error, 2 usage), and this tool's own 3. A
// copy rather than an import: the kit installs where the app keeps its lib, and this file runs from lib/ouro/check.
const EXIT = Object.freeze({ ok: 0, error: 1, usage: 2, findings: 3 });
// What usually causes a finding, for the person who fixes it.
const HINTS: Record<string, string> = {
  "blurry-image": "often a wrong `sizes` on a cropped, height-driven image",
};
// The measured rules' budgets, which ouro-check.json's "budgets" can change: the thresholds browsers' own field data
// calls good, a 0.1 layout shift, 2500 ms to the largest content and 200 ms from a press to its paint.
const BUDGETS: Budgets = Object.freeze({ inp: 200, "layout-shift": 0.1, "first-content": 2500 });
// inp presses at most this many controls a page, each PRESS_REPEAT times unless ouro-check.json says otherwise, at one
// size and theme: a laptop's, or the widest given.
const MAX_PRESSES = 24;
const PRESS_REPEAT = 5;
const INP_SIZE = "1440x900";
// The device pixel ratio a screen `width` CSS pixels wide is drawn at: 2 up to 3072, the widest real 2x screen (a 6K
// display), and 1 above it, so a 3840 screen asks for the pictures a 4K monitor shows, not 8K-class files.
const dprAt = (width: number) => (width <= 3072 ? 2 : 1);
const MAX_CLOSE_UPS = 40;
const TABS = 4;

// Whether a page has a control listed for pressing, as an expression run in the page; and the error for a selector the
// browser refuses.
const anyListed = (press: string[]) => `document.querySelector(${JSON.stringify([...press, "[data-ouro-check-press]"].join(", "))}) !== null`;
const refused = (problem: Error): never => {
  throw new Error(`ouro-check.json's "press" has a selector the browser refuses: ${problem.message}`);
};
// The 75th percentile of some numbers, 0 for none.
const p75 = (samples: number[]) => [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * 0.75) - 1] ?? 0;
const keyOf = (f: Finding) => `${f.site}\u0000${f.page}\u0000${f.rule}\u0000${f.element}`;
const spotOf = (f: Finding) => `${keyOf(f)}\u0000${f.width}x${f.height}\u0000${f.theme}`;
const pageOf = (f: { site: string; page: string }) => `${f.site} ${f.page}`;
const escape = (text: string) => text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const fileName = (text: string) => text.replace(/\.html$/, "").replace(/\W+/g, "-").replace(/^-|-$/g, "") || "home";
const caption = (f: Finding) =>
  `${f.page} at ${f.width}×${f.height}@${f.dpr ?? dprAt(f.width)}x ${f.theme}: ${LABELS[f.rule] ?? f.rule}, ${f.element} (${f.detail})${HINTS[f.rule] ? `: ${HINTS[f.rule]}` : ""}`;
const raw = (file: string) => file.replace(/\.png$/, "-raw.png");
// Photographs `box` (page coordinates) as far as it shows on the screen once the page is scrolled to it, and returns
// the box it took. Never a full-page shot: its size is the root scroller's, which a clipped overflow, a scroll lock or
// an app shell's own scroller makes smaller than the page, and a box outside it fails. An element above or left of the
// page, or a fix that made the page smaller, gives the nearest part of the screen instead.
async function shoot(page: Page, path: string, box: Box): Promise<Box> {
  const at = (await page.evaluate(`scrollTo(${box.x}, ${box.y}), { sx: scrollX, sy: scrollY, vw: innerWidth, vh: innerHeight }`)) as { sx: number; sy: number; vw: number; vh: number };
  const x = Math.max(0, Math.min(box.x - at.sx, at.vw - 1));
  const y = Math.max(0, Math.min(box.y - at.sy, at.vh - 1));
  const clip = { x, y, width: Math.max(1, Math.min(box.x + box.width - at.sx, at.vw) - x), height: Math.max(1, Math.min(box.y + box.height - at.sy, at.vh) - y) };
  await page.screenshot({ path, clip, scale: "css" });
  return { x: clip.x + at.sx, y: clip.y + at.sy, width: clip.width, height: clip.height };
}

// A measure key is a page glob when it starts with a slash, or is only stars (two of them for all pages); anything else
// is a CSS selector, which may hold a slash of its own, as an attribute selector on an address can.
const isPageGlob = (key: string) => key.startsWith("/") || /^\*+$/.test(key);
const MEASURE = /^\d+(?:\.\d+)?\s*(?:px|ch|chars)$/;
// The measures that hold on `page`, in the order the config lists them.
const measuresFor = (config: Gate, page: string): Measure[] =>
  Object.entries(config.measure ?? {}).flatMap(([key, measure]): Measure[] =>
    !isPageGlob(key) ? [{ selector: key, measure }] : globToRegExp(key.startsWith("/") ? key : `/${key}`).test(page) ? [{ selector: null, measure }] : [],
  );

// Whether a finding fails the check: every one does unless the config waives its rule ("*" for every rule) on a page
// glob it matches.
const isGated = (config: Gate, page: string, rule: string) =>
  !Object.entries(config.waive ?? {}).some(([glob, rules]) => Boolean(rules[rule] ?? rules["*"]) && globToRegExp(glob.startsWith("/") ? glob : `/${glob}`).test(page));

async function targetsOf(targets: string[], glob: string | undefined): Promise<{ list: Target[]; close: () => Promise<void> }> {
  const list: Target[] = [];
  const servers: { close: () => Promise<void> }[] = [];
  for (const target of targets) {
    if (/^https?:\/\//.test(target)) {
      const url = new URL(target);
      list.push({ site: url.host, page: `${url.pathname}${url.search}${url.hash}`, url: url.href, name: "" });
      continue;
    }
    const server = await serve(target);
    servers.push(server);
    for (const page of await listPages(target, glob)) list.push({ site: basename(resolve(target)), page, url: `${server.origin}${page}`, name: "" });
  }
  const sites = new Set(list.map((t) => t.site));
  for (const t of list) t.name = fileName(sites.size > 1 ? `${t.site}${t.page}` : t.page);
  return { list, close: async () => void (await Promise.all(servers.map((s) => s.close()))) };
}

// Opens a page and waits for it to draw. Returns why it did not load (a status other than 2xx, or no answer at all),
// and whether it said it was ready before readyTimeout ran out.
async function open(page: Page, url: string, readyTimeout: number): Promise<{ failed: string | null; ready: boolean }> {
  // Asked from Node first: a browser that gets no answer starts loading its own error page, which would pull the page
  // from under the shots.
  const answered = await fetch(url, { method: "HEAD" }).then(
    () => null,
    (problem: Error & { cause: unknown }) => `no answer: ${String(problem.cause)}`,
  );
  if (answered) {
    await page.setContent(`<p style="font:16px system-ui;padding:16px">${escape(answered)}</p>`);
    return { failed: answered, ready: true };
  }
  // goto answers null only for about:blank and a same-document move, which a check never asks for.
  const response = (await page.goto(url, { waitUntil: "load" }))!;
  if (!response.ok()) return { failed: `answered ${response.status()}`, ready: true };
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);
  const ready = await page.waitForFunction(isReady, null, { timeout: readyTimeout }).then(
    () => true,
    () => false,
  );
  await page.evaluate("document.fonts.ready.then(() => undefined)");
  return { failed: null, ready };
}

async function check(options: CheckOptions): Promise<CheckResult> {
  const { out, chromium, executablePath, sizes = SIZES, themes = ["light", "dark"], shard = [1, 1], before = [], config = {}, axe = false, measured = true, readyEvents = [], readyTimeout = 15000, log = console.log } = options;
  const budgets: Budgets = { ...BUDGETS, ...config.budgets };
  const repeats = config.pressRepeat ?? PRESS_REPEAT;
  const { list, close } = await targetsOf(options.targets, options.pages);
  // --shard k/n: the kth of every n (page, size) pairs, taken along the diagonal so each job gets a share of the pages
  // at every size and a share of the sizes of every page, whatever the counts.
  const [k, n] = shard;
  const unit = (size: number, page: number) => (size + page) % n === k - 1;
  const swept = list.filter((_, p) => sizes.some((_, s) => unit(s, p)));
  const report: Report = { targets: options.targets, sizes, themes, ...(n > 1 ? { shard: `${k}/${n}` } : {}), pages: swept.map(({ site, page, name }) => ({ site, page, name })), findings: [], fixed: [], candidates: [], shots: [], allowances: [] };
  if (!swept.length) {
    await close();
    // A shard with nothing to sweep still writes its report, so a merge of every shard's folder works.
    await mkdir(out, { recursive: true });
    await write(out, report);
    return { ...report, gated: [] };
  }
  // A browser that does not start leaves no server running behind it.
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) }).catch(async (problem: unknown) => {
    await close();
    throw problem;
  });
  // A measure's selector the browser cannot read is a mistake in the config, found once before the sweep.
  const probe = await browser.newPage();
  const selectors = Object.keys(config.measure ?? {}).filter((key) => !isPageGlob(key));
  const unreadable = (await probe.evaluate(`${JSON.stringify(selectors)}.filter((s) => { try { document.querySelector(s); return false; } catch { return true; } })`)) as string[];
  await probe.close();
  if (unreadable.length) {
    await browser.close();
    await close();
    throw Object.assign(new Error(`the measure for "${unreadable[0]}" names no CSS selector a browser reads; write a valid selector, or a page glob that starts with "/".`), { usage: true });
  }
  const { findings, shots, candidates } = report;
  const pictured = new Set<string>();
  const allowed = new Set<string>();
  const closeUps = new Map(list.map((t) => [t, 0]));
  const sizeKeys = sizes.map(([w, h]) => `${w}x${h}`);
  const axeAt = new Set(sizeKeys.some((key) => AXE_SIZES.includes(key)) ? AXE_SIZES : [sizeKeys[0], sizeKeys.at(-1)]);
  const inpAt = `${sizeKeys.includes(INP_SIZE) ? INP_SIZE : sizeKeys.at(-1)} ${themes[0]}`;
  for (const dir of ["sheets/shots", "findings", "pairs/raw"]) await mkdir(join(out, dir), { recursive: true });
  // The earlier close-ups, read before this run writes its own, which take the same names when --out is the earlier
  // report's folder.
  const earlier = new Map<string, Buffer>();
  for (const f of before) {
    if (!f.closeUp || earlier.has(f.closeUp)) continue;
    const shot = await readFile(join(options.beforeDir ?? ".", raw(f.closeUp))).catch(() => undefined);
    if (shot) earlier.set(f.closeUp, shot);
  }

  const contextFor = async (width: number, height: number, theme: string) => {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dprAt(width), colorScheme: theme as "light" | "dark", reducedMotion: "reduce" });
    await context.addInitScript(listenForReady, ["ouro:ready", ...readyEvents]);
    if (measured) await context.addInitScript(listenForMeasures);
    return context;
  };
  // A finding, recorded, and photographed with its element outlined unless the page already has one of it or 40.
  const record = async (page: Page, target: Target, issue: PageIssue, width: number, height: number, theme: string) => {
    const { ref, rule, element, detail, value, budget, unit, samples } = issue;
    const measured = value === undefined ? {} : { value, budget: budget!, unit: unit!, ...(samples ? { samples } : {}) };
    const f: Finding = { site: target.site, page: target.page, width, height, theme, rule, element, detail, ...measured, gated: isGated(config, target.page, rule), dpr: dprAt(width) };
    findings.push(f);
    const key = keyOf(f);
    if (pictured.has(key) || closeUps.get(target)! >= MAX_CLOSE_UPS) return;
    pictured.add(key);
    closeUps.set(target, closeUps.get(target)! + 1);
    const box = await page.evaluate(boxOf, { ref, width, height });
    await page.evaluate(outline, { ref, on: true });
    f.closeUp = `findings/${target.name}-${closeUps.get(target)}.png`;
    f.box = await shoot(page, join(out, raw(f.closeUp)), box);
    await page.evaluate(outline, { ref, on: false });
  };
  // inp: presses each listed control in turn, a few times, and Escape after each press, to close what it opened. A
  // press that leaves the page opens it again and ends that control's presses. The finding is the presses' 75th
  // percentile, so one slow press on a busy machine does not make one; its photograph is the page after the presses.
  const press = async (page: Page, target: Target, width: number, height: number, theme: string) => {
    let found = 0;
    let at = page.url();
    const mark = () => page.evaluate(markPressables, { limit: MAX_PRESSES, press: config.press ?? [], never: NEVER_PRESS });
    let controls = await mark();
    // By index: a page opened again is marked again, in the same order.
    for (let i = 0; i < controls.length; i++) {
      const { ref, element } = controls[i]!;
      const samples: number[] = [];
      for (let n = 0; n < repeats; n++) {
        const point = await page.evaluate(pressPoint, { ref, never: NEVER_PRESS });
        if (!point) break;
        const since = (await page.evaluate("performance.now()")) as number;
        await page.mouse.click(point.x, point.y);
        /* node:coverage ignore next */
        const ms = await page.evaluate(interactionSince, since).catch(() => 0);
        await page.keyboard.press("Escape");
        if (page.url() !== at) {
          await open(page, target.url, readyTimeout);
          at = page.url();
          controls = await mark();
          break;
        }
        samples.push(ms);
      }
      const value = p75(samples);
      if (value > budgets.inp) {
        found++;
        const detail = `${value} ms from the press to its paint at the 75th percentile of ${samples.length} presses, over the budget of ${budgets.inp} ms`;
        await record(page, target, { ref, rule: "inp", element, detail, value, budget: budgets.inp, unit: "ms", samples }, width, height, theme);
      }
    }
    return found;
  };
  const checkPage = async (page: Page, target: Target, width: number, height: number, theme: string) => {
    const { failed, ready } = await open(page, target.url, readyTimeout);
    const issues: PageIssue[] = [];
    if (failed) issues.push({ ref: "", rule: "http-error", element: "the page", detail: failed });
    else {
      // Checked as it is, but never a pass: on a slower machine the same page could draw something else in time.
      if (!ready) issues.push({ ref: "", rule: "not-ready", element: "the page", detail: `no ready signal in ${readyTimeout / 1000} s (ouro:ready, data-app-ready or a drawn h1)` });
      // axe first: it names an element by its rarest attribute, which would otherwise be the other rules' marks, a new
      // one at each size.
      if (axe && axeAt.has(`${width}x${height}`)) {
        await page.evaluate(axe);
        issues.push(...(await page.evaluate(runAxe)));
      }
      issues.push(...(await page.evaluate(findOverlaps, {})));
      await page.evaluate(decodeImages);
      issues.push(...(await page.evaluate(findSizeIssues, { measures: measuresFor(config, target.page) })));
      if (measured) issues.push(...(await page.evaluate(findLoadingIssues, budgets)));
      for (const a of await page.evaluate(listAllowances, ALIASES)) {
        const key = JSON.stringify([target.site, target.page, a.rules, a.element, a.reason]);
        if (allowed.has(key)) continue;
        allowed.add(key);
        report.allowances.push({ site: target.site, page: target.page, ...a });
      }
    }
    for (const issue of issues) await record(page, target, issue, width, height, theme);
    const file = `${target.name}-${width}x${height}-${theme}.jpg`;
    await page.evaluate("window.scrollTo(0, 0)");
    await page.screenshot({ path: join(out, "sheets/shots", file), type: "jpeg", quality: 70, scale: "css" });
    // Pressed in a context of its own, so what a press saves (a theme, a dismissed banner) reaches no other page.
    // Only on a page with a control listed for pressing: pressing is opt-in.
    let pressed = 0;
    const listed = measured && !failed && inpAt === `${width}x${height} ${theme}` && ((await page.evaluate(anyListed(config.press ?? [])).catch(refused)) as boolean);
    if (listed) {
      const own = await contextFor(width, height, theme);
      const tab = await own.newPage();
      await open(tab, target.url, readyTimeout);
      pressed = await press(tab, target, width, height, theme);
      await own.close();
    }
    const count = issues.length + pressed;
    log(`${count ? "✗" : "✓"} ${`${width}×${height}`.padEnd(9)} ${theme.padEnd(5)} ${pageOf(target)}${count ? `: ${count}` : ""}`);
    shots.push({ site: target.site, page: target.page, file, width, height, theme, count });
  };

  try {
    for (const [s, [width, height]] of sizes.entries()) {
      const active = list.filter((_, p) => unit(s, p));
      for (const theme of themes) {
        if (!active.length) continue;
        const context = await contextFor(width, height, theme);
        const queue = [...active];
        // A few pages at once, each in its own tab.
        await Promise.all(
          Array.from({ length: Math.min(TABS, active.length) }, async () => {
            const page = await context.newPage();
            for (let target = queue.shift(); target; target = queue.shift()) await checkPage(page, target, width, height, theme);
            await page.close();
          }),
        );
        await context.close();
      }
    }

    // Findings in the earlier report that this run swept the same spot of and did not find there: the same spot, at
    // the same size, after. Whether each is fixed depends on every size, which a merge of shards decides.
    const found = new Set(findings.map(spotOf));
    for (const f of before) {
      const target = list.find((t) => t.site === f.site && t.page === f.page);
      const s = sizes.findIndex(([w, h]) => w === f.width && h === f.height);
      if (!f.closeUp || !f.box || !target || s < 0 || !themes.includes(f.theme) || !unit(s, list.indexOf(target)) || found.has(spotOf(f))) continue;
      const i = candidates.length + 1;
      const candidate: Candidate = { ...f, before: `pairs/raw/${i}-before.png`, after: `pairs/raw/${i}-after.png` };
      delete candidate.pair;
      const shot = earlier.get(f.closeUp);
      if (!shot) {
        log(`No close-up for "${caption(f)}" beside the earlier report; it gets no before and after.`);
        continue;
      }
      await writeFile(join(out, candidate.before), shot);
      const context = await contextFor(f.width, f.height, f.theme);
      const page = await context.newPage();
      await open(page, target.url, readyTimeout);
      await shoot(page, join(out, candidate.after), f.box);
      await context.close();
      candidates.push(candidate);
    }
    report.fixed = await compose(browser, out, report);
  } finally {
    await browser.close();
    await close();
  }
  await write(out, report);
  return { ...report, gated: findings.filter((f) => f.gated) };
}

// The composites: a captioned close-up per pictured finding, a captioned before and after per fixed finding, and a
// contact sheet per page. Returns the fixed findings.
async function compose(browser: Browser, out: string, report: Report): Promise<Finding[]> {
  const now = new Set(report.findings.map(keyOf));
  const fixed: Finding[] = [];
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();
  const render = async (html: string, file: string) => {
    await writeFile(
      join(out, `${file}.html`),
      `<!doctype html><meta charset=utf-8><style>body{font:14px system-ui,sans-serif;margin:0;padding:16px;background:#f4f2ee;color:#1b1b1b;width:max-content;max-width:3000px}h1{font-size:16px;font-weight:600;margin:0 0 12px;max-width:1400px}.row{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end}figure{margin:0}img{display:block;border:1px solid #bbb;background:#fff;max-width:1400px}figcaption{margin-top:4px}b{color:#b3261e}</style>${html}`,
    );
    await page.goto(pathToFileURL(join(out, `${file}.html`)).href);
    await page.evaluate(decodeImages);
    const { width, height } = (await page.evaluate("({ width: document.body.scrollWidth, height: document.body.scrollHeight })")) as { width: number; height: number };
    await page.screenshot({ path: join(out, `${file}.png`), fullPage: true, clip: { x: 0, y: 0, width, height } });
    await rm(join(out, `${file}.html`));
  };
  const src = (file: string) => pathToFileURL(join(out, file)).href;
  const nameOf = (f: { site: string; page: string }) => report.pages.find((p) => p.site === f.site && p.page === f.page)!.name;
  try {
    for (const f of report.findings.filter((f) => f.closeUp)) await render(`<h1>${escape(caption(f))}</h1><img src="${src(raw(f.closeUp!))}">`, f.closeUp!.replace(/\.png$/, ""));
    for (const c of report.candidates.filter((c) => !now.has(keyOf(c)))) {
      const { before, after, ...f } = c;
      f.pair = `pairs/${nameOf(f)}-${fixed.length + 1}.png`;
      fixed.push(f);
      await render(
        `<h1>Fixed: ${escape(caption(f))}</h1><div class="row"><figure><img src="${src(before)}"><figcaption>Before</figcaption></figure><figure><img src="${src(after)}"><figcaption>After</figcaption></figure></div>`,
        f.pair.replace(/\.png$/, ""),
      );
    }
    for (const ref of report.pages) {
      const tiles = report.shots
        .filter((s) => s.site === ref.site && s.page === ref.page)
        .map((s) => `<figure><img src="${src(`sheets/shots/${s.file}`)}" style="height:260px"><figcaption>${s.width}×${s.height}@${dprAt(s.width)}x ${s.theme}${s.count ? ` · <b>${s.count} finding${s.count > 1 ? "s" : ""}</b>` : " · ✓"}</figcaption></figure>`)
        .join("");
      await render(`<h1>${escape(pageOf(ref))} at every size${report.shard ? ` in shard ${report.shard}` : ""}</h1><div class="row" style="max-width:2900px">${tiles}</div>`, `sheets/${ref.name}`);
    }
  } finally {
    await context.close();
  }
  return fixed;
}

async function write(out: string, report: Report) {
  await writeFile(join(out, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(out, "summary.md"), summary(report));
}

// Merges the out folders of a sharded run into one: every finding, the first close-up of each (at most 40 a page), the
// before and afters, and a contact sheet per page with every size the shards swept. A config gates the findings again.
async function merge({ dirs, out, config, chromium, executablePath }: MergeOptions): Promise<CheckResult> {
  const reports: (Report & { dir: string })[] = [];
  for (const dir of dirs) reports.push({ ...(JSON.parse(await readFile(join(dir, "report.json"), "utf8")) as Report), dir });
  const first = reports[0]!;
  const { sizes, themes } = first;
  const pages = new Map<string, PageRef>();
  for (const r of reports) for (const p of r.pages) pages.set(pageOf(p), p);
  const order = [...pages.keys()].sort();
  const merged: Report = { targets: [...new Set(reports.flatMap((r) => r.targets))], sizes, themes, pages: order.map((key) => pages.get(key)!), findings: [], fixed: [], candidates: [], shots: [], allowances: [] };
  const allowed = new Set<string>();
  for (const a of reports.flatMap((r) => r.allowances)) {
    const key = JSON.stringify([a.site, a.page, a.rules, a.element, a.reason]);
    if (allowed.has(key)) continue;
    allowed.add(key);
    merged.allowances.push(a);
  }
  for (const dir of ["sheets/shots", "findings", "pairs/raw"]) await mkdir(join(out, dir), { recursive: true });
  const rank = (f: Finding) => [sizes.findIndex(([w, h]) => w === f.width && h === f.height), themes.indexOf(f.theme), order.indexOf(pageOf(f))];
  const byRank = (a: Finding, b: Finding) => {
    const [x, y] = [rank(a), rank(b)];
    return x[0]! - y[0]! || x[1]! - y[1]! || x[2]! - y[2]!;
  };
  const all = reports.flatMap((r) => r.findings.map((f) => ({ f: { ...f, gated: config ? isGated(config, f.page, f.rule) : f.gated }, dir: r.dir })));
  all.sort((a, b) => byRank(a.f, b.f));
  const pictured = new Set<string>();
  const counts = new Map<string, number>();
  for (const { f, dir } of all) {
    const from = f.closeUp;
    delete f.closeUp;
    const count = counts.get(pageOf(f)) ?? 0;
    if (from && !pictured.has(keyOf(f)) && count < MAX_CLOSE_UPS) {
      pictured.add(keyOf(f));
      counts.set(pageOf(f), count + 1);
      f.closeUp = `findings/${pages.get(pageOf(f))!.name}-${count + 1}.png`;
      await copyFile(join(dir, raw(from)), join(out, raw(f.closeUp)));
    } else delete f.box;
    merged.findings.push(f);
  }
  for (const r of reports) {
    for (const c of r.candidates) {
      const i = merged.candidates.length + 1;
      const moved = { ...c, before: `pairs/raw/${i}-before.png`, after: `pairs/raw/${i}-after.png` };
      await copyFile(join(r.dir, c.before), join(out, moved.before));
      await copyFile(join(r.dir, c.after), join(out, moved.after));
      merged.candidates.push(moved);
    }
    for (const s of r.shots) {
      await copyFile(join(r.dir, "sheets/shots", s.file), join(out, "sheets/shots", s.file));
      merged.shots.push(s);
    }
  }
  merged.shots.sort((a, b) => byRank(a as unknown as Finding, b as unknown as Finding));
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  try {
    merged.fixed = await compose(browser, out, merged);
  } finally {
    await browser.close();
  }
  await write(out, merged);
  return { ...merged, gated: merged.findings.filter((f) => f.gated) };
}

// Findings grouped by site, page, rule and element, with the sizes each shows at.
function group(findings: Finding[]): (Finding & { sizes: string[] })[] {
  const rows = new Map<string, Finding & { sizes: string[] }>();
  for (const f of findings) {
    const row = rows.get(keyOf(f)) ?? { ...f, sizes: [] };
    if (!row.closeUp && f.closeUp) row.closeUp = f.closeUp;
    const size = `${f.width}×${f.height} ${f.theme}`;
    if (!row.sizes.includes(size)) row.sizes.push(size);
    rows.set(keyOf(f), row);
  }
  return [...rows.values()];
}

// The Markdown report: a row per page with each rule's count, then every finding with the sizes it shows at.
function summary({ findings, fixed, pages, sizes, themes, shard, allowances }: Report): string {
  const rows = group(findings);
  const lines = [
    `### Ouro check: ${pages.length} page${pages.length === 1 ? "" : "s"} at ${sizes.length} size${sizes.length === 1 ? "" : "s"}, ${themes.join(" and ")}, density 2 (1 above 3072px wide)${shard ? `, shard ${shard}` : ""}`,
    "",
    `| | Page | ${RULES.map((rule) => LABELS[rule]).join(" | ")} |`,
    `|---|---|${RULES.map(() => "---").join("|")}|`,
  ];
  for (const ref of pages) {
    const mine = rows.filter((r) => pageOf(r) === pageOf(ref));
    const count = (rule: string) => mine.filter((r) => r.rule === rule).length || "";
    lines.push(`| ${!mine.length ? "✓" : mine.some((r) => r.gated) ? "✗" : "·"} | \`${pageOf(ref)}\` | ${RULES.map(count).join(" | ")} |`);
  }
  lines.push("", "✗ fails; · is waived in ouro-check.json. Each finding has a captioned close-up in `findings/`, and each page a contact sheet in `sheets/`.", "");
  if (fixed.length) lines.push(`Fixed since the earlier report: ${fixed.length}, each with a before and after in \`pairs/\`.`, "");
  if (allowances.length) lines.push(`Opted out on purpose: ${allowances.length}, each with its reason in \`report.json\` (\`allowances\`).`, "");
  if (rows.length) {
    lines.push("<details><summary>Every finding</summary>", "", "| | Page | Rule | Element | At | Example |", "|---|---|---|---|---|---|");
    const cell = (text: string) => text.replaceAll("|", "\\|");
    for (const r of rows) {
      const at = r.sizes.length > 4 ? `${r.sizes.length} sizes, ${r.sizes[0]} to ${r.sizes.at(-1)}` : r.sizes.join(", ");
      lines.push(`| ${r.gated ? "✗" : "·"} | \`${pageOf(r)}\` | ${LABELS[r.rule] ?? r.rule} | ${cell(r.element)} | ${at} | ${cell(r.detail)} |`);
    }
    lines.push("", "</details>");
  }
  return `${lines.join("\n")}\n`;
}

interface Args {
  merge: boolean;
  targets: string[];
  out: string;
  pages?: string;
  sizes: [number, number][];
  themes: string[];
  shard: [number, number];
  before?: string;
  config?: string;
  axe: boolean;
  measured: boolean;
  readyEvents: string[];
  help: boolean;
}

const USAGE = `Usage: node lib/ouro/check/check.ts <url | built folder>… [options]
       node lib/ouro/check/check.ts merge <out folder>… [--out <folder>] [--config <file>]

Checks every page at every screen size, light and dark, for overlap, sideways scroll, clipped text, broken and blurry
pictures, pages that fail to load or draw, and serious accessibility problems, and long lines only where ouro-check.json
declares a measure. It measures layout shift, first content and the presses the app lists against their budgets, and
writes report.json, summary.md, a contact sheet per page and a captioned close-up per finding. merge joins the out
folders of a sharded run into one.

  --pages <glob>           only the built folder's pages the glob matches, such as "docs/**"
  --out <folder>           where the report goes (default ouro-check)
  --sizes WxH,…            the screen sizes (default: from a phone to a wide desktop, and short landscape screens)
  --themes light,dark      the colour schemes (default both)
  --shard k/n              this job's share, the kth of n parallel jobs; merge their out folders after
  --before <report.json>   an earlier report, to show a before and after of what was fixed since
  --config <file>          the waivers and budgets (default ouro-check.json, when it exists)
  --no-axe                 skip axe-core
  --no-measured            skip the measured rules, and press nothing
  --ready-event <name>     an event the page fires once it has drawn, besides ouro:ready

Exit codes: 0 ok, 1 error (the check stopped before it finished, as when the browser would not start), 2 usage, 3 findings to fix.`;

// The command line, or the usage problem as a thrown Error.
function parseArgs(argv: string[]): Args {
  const args: Args = { merge: argv[0] === "merge", targets: [], out: "ouro-check", sizes: SIZES, themes: ["light", "dark"], shard: [1, 1], axe: true, measured: true, readyEvents: [], help: false };
  for (let i = args.merge ? 1 : 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const value = () => {
      const next = argv[++i];
      if (next === undefined || next.startsWith("--")) throw new Error(`${arg} needs a value.`);
      return next;
    };
    const flag = args.merge && !["--help", "-h", "--out", "--config"].includes(arg) && arg.startsWith("-");
    if (flag) throw new Error(`merge takes --out and --config, not ${arg}.`);
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--no-axe") args.axe = false;
    else if (arg === "--no-measured") args.measured = false;
    else if (arg === "--out") args.out = value();
    else if (arg === "--pages") args.pages = value();
    else if (arg === "--before") args.before = value();
    else if (arg === "--config") args.config = value();
    else if (arg === "--ready-event") args.readyEvents.push(value());
    else if (arg === "--themes") {
      args.themes = value().split(",").map((t) => t.trim());
      const bad = args.themes.find((t) => t !== "light" && t !== "dark");
      if (bad !== undefined) throw new Error(`--themes takes light, dark or both, not "${bad}".`);
    } else if (arg === "--shard") {
      const text = value();
      const match = /^(\d+)\/(\d+)$/.exec(text);
      const [k, n] = match ? [Number(match[1]), Number(match[2])] : [0, 0];
      if (!(n >= 1 && k >= 1 && k <= n)) throw new Error(`--shard takes k/n, such as 1/4, not "${text}".`);
      args.shard = [k, n];
    } else if (arg === "--sizes") {
      args.sizes = value()
        .split(",")
        .map((size) => {
          const match = /^\s*(\d+)x(\d+)\s*$/.exec(size);
          if (!match) throw new Error(`--sizes takes WxH pairs such as 390x844,1440x900, not "${size}".`);
          return [Number(match[1]), Number(match[2])] as [number, number];
        });
    } else if (arg.startsWith("-")) throw new Error(`Unknown option ${arg}.`);
    else args.targets.push(arg);
  }
  if (!args.help && !args.targets.length) throw new Error(args.merge ? "Name the out folders to merge." : "Name a URL or a built folder to check.");
  return args;
}

interface Env {
  cwd: string;
  env: Record<string, string | undefined>;
  log: (line: string) => void;
  error: (line: string) => void;
  /** The folders Playwright and axe-core are found from: the app's folder, then this kit's, unless given. */
  from?: string[];
}

// A module the app has (resolved from its folder) or this kit's own; null when neither has it.
function load(name: string, from: string[]): string | null {
  for (const base of from) {
    try {
      return createRequire(join(base, "noop.js")).resolve(name);
    } catch {
      // Not there; try the next folder.
    }
  }
  return null;
}

async function readJson<T>(file: string, error: (line: string) => void): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (problem) {
    error(`Reading ${file} stopped the check: ${(problem as Error).message}. Fix the file or its path, then run the check again.`);
    return null;
  }
}

// What is wrong with a config's press settings, which JSON leaves unchecked: a string would read as its letters.
function configProblem({ press, pressRepeat }: Gate): string | null {
  if (press !== undefined && !(Array.isArray(press) && press.every((selector) => typeof selector === "string" && selector.trim() !== ""))) return '"press" takes a list of CSS selectors, such as ["[role=tab]"].';
  if (pressRepeat !== undefined && !(Number.isInteger(pressRepeat) && pressRepeat >= 1)) return '"pressRepeat" takes a whole number of presses, 1 or more.';
  return null;
}

// The command: returns the exit code.
async function main(argv: string[], { cwd, env, log, error, from = [cwd, dirname(fileURLToPath(import.meta.url))] }: Env): Promise<number> {
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (problem) {
    error(`${(problem as Error).message}\n\n${USAGE}`);
    return EXIT.usage;
  }
  if (args.help) {
    log(USAGE);
    return EXIT.ok;
  }
  const playwright = env.PLAYWRIGHT_MODULE ?? ["playwright", "playwright-core"].map((name) => load(name, from)).find(Boolean);
  if (!playwright) {
    error("Ouro check needs Playwright: install playwright (npm i -D playwright), or set PLAYWRIGHT_MODULE to it.");
    return EXIT.usage;
  }
  const chromium = (createRequire(import.meta.url)(playwright) as { chromium: BrowserType }).chromium;
  const executable = env.BROWSER_EXECUTABLE ? { executablePath: env.BROWSER_EXECUTABLE } : {};
  const configFile = resolve(cwd, args.config ?? "ouro-check.json");
  const hasConfig = args.config !== undefined || (await readFile(configFile).then(() => true, () => false));
  const config = hasConfig ? await readJson<Gate>(configFile, error) : {};
  if (!config) return EXIT.usage;
  const wrong = configProblem(config);
  if (wrong) {
    error(`${configFile}: ${wrong}`);
    return EXIT.usage;
  }
  if (config.measure !== undefined && (typeof config.measure !== "object" || config.measure === null || Array.isArray(config.measure))) {
    error(`${configFile}: "measure" maps page globs and CSS selectors to measures, such as { "**": "100 chars" }.`);
    return EXIT.usage;
  }
  const unreadable = Object.entries(config.measure ?? {}).find(([, measure]) => typeof measure !== "string" || !MEASURE.test(measure.trim()));
  if (unreadable) {
    error(`${configFile}: the measure for "${unreadable[0]}" is ${JSON.stringify(unreadable[1])}; give a number of px, ch or chars, such as "800px", "75ch" or "100 chars".`);
    return EXIT.usage;
  }
  // The check itself failing (no browser, a full disk) is no finding: it exits 3, never 1, which means "fix these".
  try {
    const out = resolve(cwd, args.out);
    let result: CheckResult;
    if (args.merge) {
      const dirs = args.targets.map((dir) => resolve(cwd, dir));
      for (const dir of dirs) if (!(await readJson<Report>(join(dir, "report.json"), error))) return EXIT.usage;
      result = await merge({ dirs, out, ...(hasConfig ? { config } : {}), chromium, ...executable });
    } else {
      const folders = args.targets.filter((t) => !/^https?:\/\//.test(t));
      for (const folder of folders) {
        if (!(await stat(resolve(cwd, folder)).then((s) => s.isDirectory(), () => false))) {
          error(`${folder} is not a folder or an http(s) URL.\n\n${USAGE}`);
          return EXIT.usage;
        }
      }
      let axe: string | false = false;
      if (args.axe) {
        const file = env.AXE_CORE ?? load("axe-core/axe.min.js", from);
        if (!file) {
          error("Ouro check runs axe-core: install it (npm i -D axe-core), set AXE_CORE to axe.min.js, or pass --no-axe.");
          return EXIT.usage;
        }
        axe = await readFile(file, "utf8");
      }
      const before = args.before === undefined ? { findings: [] } : await readJson<{ findings: Finding[] }>(resolve(cwd, args.before), error);
      if (!before) return EXIT.usage;
      result = await check({
        targets: args.targets.map((t) => (/^https?:\/\//.test(t) ? t : resolve(cwd, t))),
        out,
        ...(args.pages === undefined ? {} : { pages: args.pages }),
        sizes: args.sizes,
        themes: args.themes,
        shard: args.shard,
        before: before.findings,
        ...(args.before === undefined ? {} : { beforeDir: dirname(resolve(cwd, args.before)) }),
        config,
        axe,
        measured: args.measured,
        readyEvents: args.readyEvents,
        chromium,
        ...executable,
        log,
      });
      if (!result.pages.length && args.shard[1] === 1) {
        error(`No pages to check in ${args.targets.join(", ")}${args.pages === undefined ? "" : ` matching ${args.pages}`}.`);
        return EXIT.usage;
      }
    }
    if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, summary(result));
    const failing = group(result.gated);
    log(`\n${group(result.findings).length} finding(s), ${failing.length} gated, ${result.fixed.length} fixed since --before. Report: ${relative(cwd, join(out, "report.json"))}`);
    return failing.length ? EXIT.findings : EXIT.ok;
  } catch (problem) {
    if ((problem as { usage?: boolean }).usage) {
      error(`${configFile}: ${(problem as Error).message}`);
      return EXIT.usage;
    }
    error(`Ouro check stopped before it finished: ${(problem as Error).message}`);
    return EXIT.error;
  }
}

/* node:coverage disable */
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = await main(process.argv.slice(2), { cwd: process.cwd(), env: process.env, log: console.log, error: console.error });
}
/* node:coverage enable */
