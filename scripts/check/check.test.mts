import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type BrowserContext, type BrowserType } from "playwright";
import { BUDGETS, caption, check, dprAt, EXIT, group, LABELS, main, merge, parseArgs, RULES, SIZES, summary, transportIssues, type Finding, type Gate, type Report } from "../../registry/ouro/check/check.ts";
import { armTime, readTime, type TimeWindow } from "../../registry/ouro/check/time-check.ts";
import { BASE_EXIT_CODES } from "../../registry/ouro/ax/exit-codes.ts";
import { globToRegExp, listPages, serve } from "../../registry/ouro/check/serve.ts";

// Ouro check's Node side (check.ts and serve.ts) against the fixture pages, one pass and one fail page per rule, in
// headless Chromium. scripts/check.test.mjs runs this file under Node's coverage and holds both files to 100%.

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const fixtures = join(here, "fixtures");
const scratch = join(root, ".tmp", `check-${process.pid}`);
mkdirSync(scratch, { recursive: true });
after(() => rmSync(scratch, { recursive: true, force: true }));

const require = createRequire(import.meta.url);
const axe = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const playwrightModule = require.resolve("playwright");
// The Chromium Playwright would launch, unless BROWSER_EXECUTABLE names another (a local run without Playwright's full
// Chromium points it at the headless shell).
const browser = process.env.BROWSER_EXECUTABLE ?? chromium.executablePath();
const two: [number, number][] = [[390, 844], [1440, 900]];
const quiet = () => undefined;
let made = 0;
const dir = (name: string) => {
  const path = join(scratch, `${name}-${++made}`);
  mkdirSync(path, { recursive: true });
  return path;
};
const page = (body: string, head = "") =>
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Page</title><style>body{font:16px/1.5 system-ui,sans-serif;margin:0;padding:16px}</style>${head}<main>${body}</main>`;
const site = (name: string, pages: Record<string, string>) => {
  const folder = join(dir("sites"), name);
  mkdirSync(folder);
  for (const [file, html] of Object.entries(pages)) {
    mkdirSync(dirname(join(folder, file)), { recursive: true });
    writeFileSync(join(folder, file), html);
  }
  return folder;
};
const spots = (findings: Finding[]) => findings.map((f) => `${f.page} ${f.width}x${f.height} ${f.theme} ${f.rule} ${f.element}`).sort();
const timeComparison = (whole: Report, parts: Report[], config: Gate) => {
  const identity = { site: "fixtures", page: "/long-task-fail.html", width: 390, height: 844, theme: "dark", phase: "loading" };
  const rows = (report: Report) => (report.time ?? []).filter((row) =>
    row.site === identity.site && row.page === identity.page && row.width === identity.width
    && row.height === identity.height && row.theme === identity.theme && row.phase === identity.phase);
  return JSON.stringify({
    identity, configuration: { targets: whole.targets, sizes: whole.sizes, themes: whole.themes, config },
    observations: [{ origin: "whole", rows: rows(whole) }, ...parts.map((part) => ({ origin: "shard", shard: part.shard, rows: rows(part) }))],
  }, null, 2);
};
const timeFault = (point: "armTime" | "readTime" | "frame-wait", problem: unknown) => {
  let consumed: { point: typeof point; url: string; expected?: TimeWindow } | undefined;
  const browsers = new Set<Browser>();
  const delegate = <T extends object, K extends keyof T>(target: T, key: K, replacement: T[K]): T => new Proxy(target, {
    get(owner, property) {
      if (property === key) return replacement;
      const value = Reflect.get(owner, property, owner);
      return typeof value === "function" ? value.bind(owner) : value;
    },
  });
  const windowOf = (value: unknown): TimeWindow => {
    assert.ok(value && typeof value === "object" && "document" in value && typeof value.document === "number"
      && "url" in value && typeof value.url === "string" && "since" in value && typeof value.since === "number");
    return { document: value.document, url: value.url, since: value.since };
  };
  const launch: BrowserType["launch"] = async (options) => {
    const browser = await chromium.launch(options);
    browsers.add(browser);
    const newContext: Browser["newContext"] = async (options) => {
      const context = await browser.newContext(options);
      const newPage: BrowserContext["newPage"] = async () => {
        const page = await context.newPage();
        let arms = 0;
        let armed: TimeWindow | undefined;
        const evaluate = new Proxy(page.evaluate, {
          async apply(method, _receiver, args: unknown[]) {
            const [fn, argument] = args;
            // This fixture has no state presses: the second arm on its isolated press page opens the listed control.
            const frame = arms === 2 && fn === "new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))";
            if (!consumed && (point === "armTime" ? fn === armTime : point === "readTime" ? fn === readTime : frame)) {
              const expected = point === "readTime" ? windowOf(argument) : point === "frame-wait" ? armed : undefined;
              if (point !== "armTime") assert.ok(expected);
              consumed = { point, url: page.url(), ...(expected ? { expected } : {}) };
              throw problem;
            }
            const result: unknown = await Reflect.apply(method, page, args);
            if (fn === armTime) { arms++; armed = windowOf(result); }
            return result;
          },
        });
        return delegate(page, "evaluate", evaluate);
      };
      return delegate(context, "newPage", newPage);
    };
    return delegate(browser, "newContext", newContext);
  };
  return {
    chromium: delegate(chromium, "launch", launch),
    receipt: () => { assert.ok(consumed, "the selected temporal fault was not consumed"); return consumed; },
    close: async () => { await Promise.all([...browsers].map((browser) => browser.close())); },
  };
};
const run = async (argv: string[], options: { cwd?: string; env?: Record<string, string | undefined>; from?: string[] } = {}) => {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(argv, { cwd: options.cwd ?? scratch, env: options.env ?? {}, log: (line) => out.push(line), error: (line) => err.push(line), ...(options.from ? { from: options.from } : {}) });
  return { code, out: out.join("\n"), err: err.join("\n") };
};

describe("Ouro check", () => {
  test("finds each rule on its fail page and exact expected findings on pass pages, with a report, a contact sheet and close-ups", async () => {
    const out = dir("rules");
    // long-lines is checked only against a declared measure; "**" with "100 chars" is the rule as it always counted.
    const result = await check({ targets: [fixtures], out, sizes: two, themes: ["light"], axe, config: { measure: { "**": "100 chars" } }, chromium, log: quiet });
    // http-error and not-ready are about the page, not its content, and https about a site on the web: each has tests
    // of its own.
    for (const rule of RULES.filter((r) => r !== "http-error" && r !== "not-ready" && r !== "https")) {
      assert.ok(result.findings.some((f) => f.page === `/${rule}-fail.html` && f.rule === rule), `${rule} fires on its fail page`);
      // The INP fixture deliberately leaves its document: no numeric task reading may stand in for that lost window.
      assert.deepEqual(result.findings.filter((f) => f.page === `/${rule}-pass.html`), rule === "inp" ? [{
        site: "fixtures", page: "/inp-pass.html", width: 1440, height: 900, theme: "light", dpr: 2,
        rule: "long-task", element: 'press-open button#away "Leave the page" (incomplete)', gated: true,
        detail: "Task measurement incomplete: navigated. No clean measurement is established.",
      }] : [], `only expected findings on the ${rule} pass page`);
      if (rule === "inp") {
        const rows = result.time!.filter((row) => row.page === "/inp-pass.html" && row.phase === "press-open" && row.element === 'button#away "Leave the page"');
        assert.equal(rows.length, 1);
        const row = rows[0]!;
        assert.deepEqual([row.site, row.width, row.height, row.theme, row.dpr, row.viewport, row.run], [
          "fixtures", 1440, 900, "light", 2, { width: 1440, height: 900 }, 1,
        ]);
        assert.ok(row.ref);
        const reading = row.reading;
        assert.equal(reading.status, "incomplete");
        assert.equal(reading.reason, "navigated");
        assert.equal(reading.tasks, undefined);
        assert.equal(reading.until, undefined);
        assert.ok(reading.expected && reading.observed?.document !== undefined);
        assert.notEqual(reading.expected.document, reading.observed.document);
        assert.equal(new URL(reading.expected.url).pathname, "/inp-pass.html");
        assert.equal(reading.observed.url, `${reading.expected.url}?moved`);
      }
    }
    // axe runs only at the phone and laptop sizes.
    assert.ok(result.findings.some((f) => f.rule === "axe" && f.width === 390) && result.findings.some((f) => f.rule === "axe" && f.width === 1440));
    assert.equal(result.gated.length, result.findings.length);
    assert.equal(result.shots.length, 66 * 2);
    const report = JSON.parse(readFileSync(join(out, "report.json"), "utf8")) as Report;
    assert.equal(report.pages.length, 66);
    assert.match(readFileSync(join(out, "summary.md"), "utf8"), /^### Ouro check: 66 pages at 2 sizes, light, density 2 \(1 above 3072px wide\)$/m);
    for (const ref of report.pages) assert.ok(existsSync(join(out, "sheets", `${ref.name}.png`)), ref.name);
    for (const f of result.findings.filter((f) => f.closeUp)) {
      assert.ok(existsSync(join(out, f.closeUp!)) && existsSync(join(out, f.closeUp!.replace(/\.png$/, "-raw.png"))), f.closeUp);
      assert.ok(f.box && f.box.width > 0);
    }
    assert.deepEqual(readdirSync(join(out, "findings")).filter((file) => file.endsWith(".html")), [], "the composites' pages are removed");
  });

  test("a sharded run, merged, finds what one run does, with every shot, and a config gates the merge again", async () => {
    const sizes: [number, number][] = [[320, 640], [390, 844], [1440, 900]];
    const options = { targets: [fixtures], pages: "*-fail.html", sizes, themes: ["light", "dark"], axe, config: { measure: { "**": "100 chars" } }, chromium, log: quiet };
    const whole = await check({ ...options, out: dir("whole") });
    const shards = [dir("shard"), dir("shard"), dir("shard")];
    const parts = [];
    for (const [i, out] of shards.entries()) parts.push(await check({ ...options, out, shard: [i + 1, 3] }));
    assert.ok(parts.every((part) => part.shard && part.findings.length < whole.findings.length));
    assert.match(readFileSync(join(shards[0]!, "summary.md"), "utf8"), /, shard 1\/3$/m);
    const merged = await merge({ dirs: shards, out: dir("merged"), chromium });
    assert.deepEqual(spots(merged.findings), spots(whole.findings), timeComparison(whole, parts, options.config));
    assert.equal(merged.shots.length, whole.shots.length);
    assert.equal(merged.pages.length, 33);
    assert.equal(merged.findings.filter((f) => f.closeUp).length, whole.findings.filter((f) => f.closeUp).length);
    assert.equal(merged.gated.length, merged.findings.length);
    const waived = await merge({ dirs: shards, out: dir("merged"), config: { waive: { "axe-*": { "*": "an axe fixture" }, "/overlap-fail.html": { overlap: "an overlap fixture" } } }, chromium, executablePath: browser });
    assert.ok(waived.gated.length > 0 && waived.gated.every((f) => !f.page.startsWith("/axe-") && !(f.page === "/overlap-fail.html" && f.rule === "overlap")));
    assert.ok(waived.findings.some((f) => !f.gated && f.rule === "overlap"));
  });

  test("actual temporal evaluate failures remain precisely incomplete and nonnumeric in loading and the framed press window", async () => {
    const folder = site("time-fault", {
      "index.html": page('<button type="button" aria-expanded="false" data-ouro-check-press>Open detail</button>'),
    });
    for (const point of ["armTime", "readTime", "frame-wait"] as const) {
      const adapter = timeFault(point, new Error(point === "readTime" ? "Cannot find context with specified id" : "Execution context was destroyed"));
      try {
        const result = await check({ targets: [folder], out: dir("time-fault"), sizes: [[1440, 900]], themes: ["light"],
          chromium: adapter.chromium, config: { walk: false, pressRepeat: 1 }, log: quiet });
        const receipt = adapter.receipt();
        const phase = point === "frame-wait" ? "press-open" : "loading";
        const rows = result.time!.filter((row) => row.phase === phase);
        assert.equal(rows.length, 1);
        const row = rows[0]!;
        assert.deepEqual(row.reading, { status: "incomplete", ...(receipt.expected ? { expected: receipt.expected } : {}),
          observed: { url: receipt.url }, reason: "execution-context-destroyed" });
        if (point === "readTime") assert.equal(receipt.expected!.since, 0);
        if (point === "frame-wait") assert.ok(receipt.expected!.since > 0);
        const findings = result.gated.filter((finding) => finding.rule === "long-task" && finding.element === `${phase} ${row.element} (incomplete)`);
        assert.equal(findings.length, 1);
        for (const key of ["value", "budget", "unit", "samples", "closeUp"] as const) assert.equal(findings[0]![key], undefined, key);
      } finally {
        await adapter.close();
      }
    }
  });

  test("actual loading and reach propagate unrelated Error and non-Error temporal evaluation failures", async () => {
    const folder = site("time-unknown", { "index.html": page("<p>Loaded document.</p>") });
    for (const point of ["armTime", "readTime"] as const) {
      for (const problem of [new Error("unrelated application failure"), "not an Error"]) {
        const adapter = timeFault(point, problem);
        try {
          await assert.rejects(check({ targets: [folder], out: dir("time-unknown"), sizes: [[1440, 900]], themes: ["light"],
            chromium: adapter.chromium, config: { walk: false }, log: quiet }), (error) => error === problem);
          assert.equal(adapter.receipt().point, point);
        } finally {
          await adapter.close();
        }
      }
    }
  });

  test("measures layout shift, first content and each press against their budgets, presses at one size and theme, and records each number", async () => {
    const out = dir("measured");
    const sizes: [number, number][] = [[390, 844], [1280, 800]];
    const pages = ["inp", "layout-shift", "first-content"].flatMap((rule) => ["fail", "pass"].map((kind) => `${rule}-${kind}.html`));
    const folder = site("measured", Object.fromEntries(pages.map((file) => [file, readFileSync(join(fixtures, file), "utf8")])));
    const result = await check({ targets: [folder], out, sizes, themes: ["dark", "light"], chromium, log: quiet });
    const measured = result.findings.filter((f) => f.rule === "inp" || f.rule === "layout-shift" || f.rule === "first-content");
    assert.deepEqual(new Set(measured.map((f) => f.page)), new Set(["/inp-fail.html", "/layout-shift-fail.html", "/first-content-fail.html"]));
    // Pressed at the widest size given, without 1440×900, in the first theme only.
    const pressed = measured.filter((f) => f.rule === "inp");
    assert.deepEqual(pressed.map((f) => `${f.width}x${f.height} ${f.theme} ${f.element}`), ['1280x800 dark button#slow "Save"']);
    assert.ok(pressed[0]!.value! >= 400 && pressed[0]!.budget === BUDGETS.inp && pressed[0]!.unit === "ms", pressed[0]!.detail);
    assert.match(pressed[0]!.detail, /^\d+ ms from the press to its paint at the 75th percentile of 5 presses, over the budget of 200 ms$/);
    // Pressed five times, and gated on the 75th percentile of the five.
    const samples = pressed[0]!.samples!;
    assert.equal(samples.length, 5);
    assert.equal(pressed[0]!.value, [...samples].sort((a, b) => a - b)[3]);
    const shifted = measured.find((f) => f.rule === "layout-shift")!;
    assert.ok(shifted.value! > BUDGETS["layout-shift"] && shifted.budget === BUDGETS["layout-shift"] && shifted.unit === "", shifted.detail);
    assert.equal(shifted.element, "div#board");
    const late = measured.find((f) => f.rule === "first-content")!;
    assert.ok(late.value! >= 3000 && late.unit === "ms" && late.element.startsWith('p#late "This paragraph'), late.detail);
    for (const f of measured.filter((f) => f.closeUp)) assert.ok(existsSync(join(out, f.closeUp!)), f.closeUp);
    const report = JSON.parse(readFileSync(join(out, "report.json"), "utf8")) as Report;
    assert.ok(report.findings.some((f) => f.rule === "inp" && f.value === pressed[0]!.value && f.budget === 200 && f.unit === "ms" && f.samples!.length === 5));
    assert.ok(report.findings.filter((f) => f.rule !== "inp" && f.rule !== "long-task").every((f) => !("samples" in f)));
    assert.ok(report.findings.filter((f) => f.rule === "overlap" || f.rule === "axe").every((f) => !("value" in f)));
    assert.ok(result.shots.some((s) => s.page === "/inp-fail.html" && s.width === 1280 && s.theme === "dark" && s.count === 2));

    // First content is what the page drew on arrival, read before any rule scrolls it: this page draws a large block
    // whenever it scrolls, which the corner rule does to reach the rounded picture far down, once the page has settled
    // (a 1.6 s fade holds it). A script's scroll doesn't end largest-contentful-paint as a person's does.
    const below = site("below", {
      "below.html": page(`<h1>Arrived</h1><p style="animation:fade 1.6s">Here at once.</p><style>@keyframes fade{from{opacity:.5}}</style><div style="height:3000px"></div><div style="border-radius:16px;overflow:hidden"><img src="picture-960.png" alt="A wide field" width="960" height="540" style="display:block;width:100%;height:auto"></div><script>addEventListener("scroll", () => { if (document.getElementById("late")) return; const p = document.createElement("p"); p.id = "late"; p.style.cssText = "position:fixed;inset:20px;margin:0;font-size:48px;background:#fff"; p.textContent = "Drawn on a scroll. ".repeat(40); document.body.append(p); }, { once: true });</script>`),
    });
    copyFileSync(join(fixtures, "picture-960.png"), join(below, "picture-960.png"));
    const quick = await check({ targets: [below], out: dir("below"), sizes: [[1440, 900]], themes: ["light"], config: { budgets: { "first-content": 1500 } }, chromium, log: quiet });
    assert.deepEqual(quick.findings.filter((f) => f.rule === "first-content").map((f) => f.element), []);

    // Budgets from the config, and none with the measured rules off.
    const config = { budgets: { inp: 5000, "layout-shift": 5, "first-content": 60000, "long-task": 5000 } };
    const relaxed = await check({ targets: [folder], out: dir("measured"), pages: "*-fail.html", sizes: [[1440, 900]], themes: ["light"], config, chromium, log: quiet });
    assert.deepEqual(relaxed.findings.filter((f) => f.value !== undefined), []);
    const off = await check({ targets: [folder], out: dir("measured"), pages: "*-fail.html", sizes: [[1440, 900]], themes: ["light"], measured: false, chromium, log: quiet });
    assert.deepEqual(off.findings, []);
  });

  test("presses only what a page or the config lists, never a destructive control, as often as the config says", async () => {
    const slow = '<script>for (const b of document.querySelectorAll("button")) b.addEventListener("click", () => { const t = performance.now(); while (performance.now() - t < 400); });</script>';
    const folder = site("opt-in", {
      "page.html": page(`<h1>Opt in</h1><button id="save" type="button">Save</button><button id="delete" type="button" class="bg-destructive">Delete</button><button id="buy" type="button" data-ouro-check-no-press>Buy</button>${slow}`),
    });
    const run = (config: Gate) => check({ targets: [folder], out: dir("opt-in"), sizes: [[1440, 900]], themes: ["light"], config, chromium, log: quiet });
    const inp = (result: { findings: Finding[] }) => result.findings.filter((f) => f.rule === "inp");
    // Nothing is listed: nothing is pressed.
    assert.deepEqual(inp(await run({})), []);
    // A listed control is pressed, as often as pressRepeat says.
    const listed = inp(await run({ press: ["#save"], pressRepeat: 3 }));
    assert.deepEqual(listed.map((f) => f.element), ['button#save "Save"']);
    assert.equal(listed[0]!.samples!.length, 3);
    // A destructive or opted-out control is never pressed, even when listed.
    assert.deepEqual(inp(await run({ press: ["#delete", "#buy", ".bg-destructive"] })), []);
    await assert.rejects(run({ press: ["[unclosed"] }), /ouro-check.json's "press" has a selector the browser refuses: /);
  });

  test("presses in a context of its own, so what a press saves reaches no other page", async () => {
    // The pages after the pressed one load slowly, so the tab that pressed takes the last page next.
    const slow = page("<h1>Slow</h1>", '<script>document.documentElement.setAttribute("data-app-ready", "false"); setTimeout(() => document.documentElement.setAttribute("data-app-ready", "true"), 2500);</script>');
    const folder = site("pressed", {
      "a-press.html": page('<h1>Press</h1><button type="button" data-ouro-check-press onclick="localStorage.setItem(\'pressed\', \'1\')">Remember</button>'),
      "b-slow.html": slow,
      "c-slow.html": slow,
      "d-slow.html": slow,
      "e-reads.html": page('<h1>Reads</h1><div id="wide" style="height:8px"></div>', '<script>addEventListener("DOMContentLoaded", () => { if (localStorage.getItem("pressed")) document.getElementById("wide").style.width = "3000px"; });</script>'),
    });
    const result = await check({ targets: [folder], out: dir("pressed"), sizes: [[1440, 900]], themes: ["light"], chromium, log: quiet });
    assert.deepEqual(result.findings, []);
    assert.equal(result.shots.length, 5);
  });

  test("gives a finding gone since --before a captioned before and after, and none to one still there at another size", async () => {
    const wide = (width: number) => `<h1>Fixes</h1><div id="w" style="width:${width}px;height:8px"></div>`;
    const overlap = '<section style="position:relative"><p>Text under a label.</p><p class="tag" style="position:absolute;top:0;left:0;margin:0">A label</p></section>';
    const folder = site("fixes", { "page.html": page(`${wide(2000)}${overlap}`) });
    const first = dir("before");
    const before = await check({ targets: [folder], out: first, sizes: two, themes: ["light"], axe: false, chromium, log: quiet });
    assert.ok(before.findings.some((f) => f.rule === "overlap") && before.findings.filter((f) => f.rule === "sideways-scroll").length === 2);
    writeFileSync(join(folder, "page.html"), page(wide(1000)));
    const logged: string[] = [];
    const [overlap390, sideways390] = ["overlap", "sideways-scroll"].map((rule) => before.findings.find((f) => f.rule === rule && f.width === 390)!);
    const extra: Finding[] = [
      // Pictured at 390 only; at 1440 it would be fixed, but it still sticks out at 390.
      { ...sideways390!, width: 1440, height: 900 },
      // Gone, from a place the page no longer reaches: its after picture is kept inside the page.
      { ...sideways390!, width: 1440, height: 900, element: "div#gone", box: { x: 5000, y: 9000, width: 300, height: 200 } },
      { ...overlap390!, page: "/gone.html" },
      { ...overlap390!, width: 999 },
      { ...overlap390!, theme: "dark" },
      { ...overlap390!, closeUp: undefined } as unknown as Finding,
      { ...overlap390!, box: undefined } as unknown as Finding,
    ];
    // Into the earlier report's own folder, whose close-ups this run's take the names of.
    const out = first;
    const original = readFileSync(join(first, overlap390!.closeUp!.replace(/\.png$/, "-raw.png")));
    const after = await check({ targets: [folder], out, sizes: two, themes: ["light"], before: [...before.findings, ...extra], beforeDir: first, chromium, executablePath: browser, log: (line) => logged.push(line) });
    assert.deepEqual(after.fixed.map((f) => f.element).sort(), ["div#gone", overlap390!.element].sort());
    for (const f of after.fixed) assert.ok(existsSync(join(out, f.pair!)), f.pair);
    assert.deepEqual(readFileSync(join(out, after.candidates.find((c) => c.rule === "overlap")!.before)), original);
    // The strip still sticks out at 390, so its candidate at 1440 is not fixed.
    assert.ok(after.candidates.some((c) => c.element === "div#w") && !after.fixed.some((f) => f.element === "div#w"));
    assert.match(readFileSync(join(out, "summary.md"), "utf8"), /Fixed since the earlier report: \d+, each with a before and after in `pairs\/`\./);
    assert.ok(logged.some((line) => line.startsWith("✓ 1440×900  light fixes /page.html")));
    const joined = await merge({ dirs: [out], out: dir("joined"), chromium });
    assert.deepEqual(joined.fixed.map((f) => f.rule), after.fixed.map((f) => f.rule));

    // A shard sweeps only its share of the earlier findings, and an earlier finding without its close-up gets no pair.
    const sharded = await check({ targets: [folder], out: dir("after"), sizes: two, themes: ["light"], shard: [2, 2], before: [...before.findings, { ...overlap390!, width: 1440, height: 900 }], chromium, log: (line) => logged.push(line) });
    assert.deepEqual(sharded.candidates, []);
    assert.ok(logged.some((line) => line.startsWith("No close-up for ") && line.includes("1440×900")));
    assert.ok(!logged.some((line) => line.startsWith("No close-up for ") && line.includes("390×844")));
  });

  test("names a page by site and path across several sites, a URL by its host and path, and the home page home", async () => {
    const server = await serve(fixtures);
    try {
      const first = site("first", { "index.html": page("<h1>Home</h1>"), "x.html": page("<h1>X</h1>") });
      const other = site("other", { "index.html": page("<h1>Home</h1>") });
      const url = `${server.origin}/overlap-pass.html?x=1#y`;
      const out = dir("sites");
      const result = await check({ targets: [first, other, url], out, sizes: [[390, 844]], themes: ["light"], chromium, log: quiet });
      assert.deepEqual(
        result.pages.map((p) => [p.site, p.page, p.name]),
        [
          ["first", "/", "first"],
          ["first", "/x.html", "first-x"],
          ["other", "/", "other"],
          [new URL(server.origin).host, "/overlap-pass.html?x=1#y", `${new URL(server.origin).host}-overlap-pass-html-x-1-y`.replace(/\W+/g, "-")],
        ],
      );
      const home = site("one", { "index.html": page("<h1>Home</h1>") });
      const alone = await check({ targets: [home], out: dir("home"), sizes: [[390, 844]], themes: ["light"], chromium, log: quiet });
      assert.equal(alone.pages[0]!.name, "home");
      // A URL with a long query, as an app's route can be: its start and a hash, short enough for a file name, and apart.
      const long = (n: number) => `${server.origin}/overlap-pass.html#/meeting?link=${encodeURIComponent(`https://example.test/l/meetup-join/${"a".repeat(300)}${n}`)}`;
      const named = await check({ targets: [long(1), long(2)], out: dir("long"), sizes: [[390, 844]], themes: ["light"], chromium, log: quiet });
      const names = named.pages.map((p) => p.name);
      assert.ok(names.every((name) => /^overlap-pass-html-meeting-link-https-3A-2F-2Fexample-test-2F-[0-9a-f]{8}$/.test(name)), names.join(" "));
      assert.notEqual(names[0], names[1]);
      assert.equal(named.shots.length, 2);
      // The same page twice, the second by a route in its hash, a same-document move from the first: each loads afresh.
      const routes = await check({ targets: [`${server.origin}/overlap-pass.html`, `${server.origin}/overlap-pass.html#/route`], out: dir("routes"), sizes: [[390, 844]], themes: ["light"], chromium, log: quiet });
      assert.deepEqual(routes.findings, []);
      assert.equal(routes.shots.length, 2);
    } finally {
      await server.close();
    }
  });

  test("draws a screen wider than 3072px at density 1, holds its pictures to that, and records the density of each finding", async () => {
    const wide = site("wide", { "page.html": page('<h1>Wide</h1><img src="picture-960.png" alt="A picture" style="width:900px;height:auto">') });
    copyFileSync(join(fixtures, "picture-960.png"), join(wide, "picture-960.png"));
    const result = await check({ targets: [wide], out: dir("wide"), sizes: [[3072, 1728], [3200, 1800]], themes: ["light"], chromium, log: quiet });
    assert.deepEqual(result.findings.map((f) => [f.rule, f.width, f.dpr]), [["blurry-image", 3072, 2]]);
  });

  // How many pure blue pixels a picture has, read in the browser.
  const bluePixels = async (file: string) => {
    const reader = await chromium.launch({ executablePath: browser });
    try {
      const tab = await reader.newPage();
      return await tab.evaluate(async (src) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const canvas = document.createElement("canvas");
        [canvas.width, canvas.height] = [img.naturalWidth, img.naturalHeight];
        const pen = canvas.getContext("2d")!;
        pen.drawImage(img, 0, 0);
        const data = pen.getImageData(0, 0, canvas.width, canvas.height).data;
        let blue = 0;
        for (let i = 0; i < data.length; i += 4) if (data[i]! < 40 && data[i + 1]! < 40 && data[i + 2]! > 215) blue++;
        return blue;
      }, `data:image/png;base64,${readFileSync(file).toString("base64")}`);
    } finally {
      await reader.close();
    }
  };

  test("judges a page once its animations have run, as a person sees it after a moment", async () => {
    // A label that slides over the words in a second and a half: still on its way when the page has loaded.
    const sliding = site("sliding", {
      "page.html": page('<h1>Sliding</h1><section style="position:relative"><p style="margin:0">Words under a label</p><p style="position:absolute;top:0;left:0;margin:0;animation:in 1.5s ease-out">A label</p></section>', "<style>@keyframes in { from { transform: translateY(600px) } }</style>"),
    });
    const result = await check({ targets: [sliding], out: dir("sliding"), sizes: [[390, 844]], themes: ["light"], config: { walk: false }, chromium, log: quiet });
    assert.deepEqual(result.findings.map((f) => [f.rule, f.element]), [["overlap", 'p "Words under a label" × p "A label"']]);
  });

  test("checks a state a page reaches by presses as a page of its own, and fails one whose press finds nothing", async () => {
    // A view with no address: the cut-off text is there only once Open is pressed.
    const app = site("states", {
      "page.html": page('<h1>States</h1><button onclick="document.getElementById(\'view\').hidden=false">Open</button><p id="view" hidden style="width:60px;overflow:hidden;white-space:nowrap">Text cut off by its box, in a view</p>'),
    });
    const config: Gate = { walk: false, states: { "/page.html": { "a view open": ["text=Open"], missing: ["text=Nowhere"] }, "/other.html": { never: ["text=Open"] } } };
    const result = await check({ targets: [app], out: dir("states"), sizes: [[390, 844]], themes: ["light"], config, chromium, log: quiet });
    assert.deepEqual(
      result.pages.map((p) => [p.page, p.name]),
      [
        ["/page.html", "page"],
        ["/page.html (a view open)", "page-a-view-open"],
        ["/page.html (missing)", "page-missing"],
      ],
    );
    assert.deepEqual(
      result.findings.map((f) => [f.page, f.rule]),
      [
        ["/page.html (a view open)", "clipped-text"],
        ["/page.html (missing)", "http-error"],
      ],
    );
    assert.match(result.findings[1]!.detail, /^the state's press "text=Nowhere" found nothing to press \(/);
    // An app that opens on the view it last showed: each state starts from the page as a new visitor sees it, the last
    // one too, which starts once an earlier one has saved its view.
    const remembering = site("remembering", {
      "page.html": page(
        '<h1>Views</h1><button id="cal">Calendar</button><div id="chat"><button>Open row</button></div><div id="calendar" hidden>Days</div><script>const show = (v) => { chat.hidden = v !== "chat"; calendar.hidden = v !== "calendar"; }; show(localStorage.getItem("view") ?? "chat"); cal.onclick = () => { localStorage.setItem("view", "calendar"); show("calendar"); };</script>',
      ),
    });
    const views = await check({ targets: [remembering], out: dir("remembering"), sizes: [[390, 844], [1440, 900]], themes: ["light", "dark"], config: { walk: false, states: { "/page.html": { calendar: ["text=Calendar"], "calendar again": ["text=Calendar"], "calendar a third time": ["text=Calendar"], "calendar a fourth time": ["text=Calendar"], "a row open": ["text=Open row"] } } }, chromium, log: quiet });
    assert.deepEqual(views.findings, []);
  });

  test("photographs a finding on the screen, wherever on or off the page it sits", async () => {
    // Clipped sideways by the root, so a full-page shot ends at the screen's right edge; the screen scrolls to it.
    const right = site("right", { "page.html": page('<h1>Right</h1><p style="position:absolute;left:1500px;top:20px;width:60px;overflow:hidden;white-space:nowrap">Text cut off by its box, off to the right</p>', "<style>html{overflow-x:clip}</style>") });
    const rightOut = dir("right");
    const shot = await check({ targets: [right], out: rightOut, sizes: [[390, 844]], themes: ["light"], chromium, log: quiet });
    const far = shot.findings.find((f) => f.rule === "clipped-text")!;
    assert.ok(far.box!.x > 1000 && existsSync(join(rightOut, far.closeUp!)), JSON.stringify(far.box));
    const off = site("off", { "page.html": page('<h1>Off</h1><p style="position:absolute;left:-400px;top:-300px;width:60px;overflow:hidden;white-space:nowrap">Text cut off by its box, out of sight</p>') });
    const out = dir("off");
    const result = await check({ targets: [off], out, sizes: [[390, 844]], themes: ["light"], chromium, log: quiet });
    const cut = result.findings.find((f) => f.rule === "clipped-text")!;
    assert.deepEqual([cut.box!.x, cut.box!.y], [0, 0]);
    assert.ok(existsSync(join(out, cut.closeUp!)));
    // Far down a page with a bar stuck to the top of the screen: the close-up is of the text, not the bar over it.
    const barred = site("barred", {
      "page.html": page('<h1>Barred</h1><div style="height:3000px"></div><p style="width:60px;overflow:hidden;white-space:nowrap">Text cut off by its box, far down</p><div style="height:3000px"></div>').replace("<main>", '<div style="position:sticky;top:0;z-index:1"><header style="height:120px;background:#00f"></header></div><main>'),
    });
    const barredOut = dir("barred");
    const down = await check({ targets: [barred], out: barredOut, sizes: [[390, 844]], themes: ["light"], chromium, log: quiet });
    const deep = down.findings.find((f) => f.rule === "clipped-text")!;
    assert.ok(deep.box!.y > 3000 && deep.box!.height > 10, JSON.stringify(deep.box));
    assert.equal(await bluePixels(join(barredOut, deep.closeUp!.replace(/\.png$/, "-raw.png"))), 0);
  });

  test("finds a request to the page's own origin that gets no answer, once, by its path without the server's address or its query", async () => {
    // The server hangs up on /data.json without a word, as a crashed handler does.
    const server = createServer((request, response) => {
      if (request.url!.startsWith("/data.json")) return request.socket.destroy();
      response.writeHead(200, { "content-type": "text/html" }).end('<!doctype html><html lang="en"><title>Drop</title><main><h1>Drop</h1><p>Asks for data.</p></main><script>for (const n of [1, 2, 3]) fetch(`/data.json?try=${n}`).catch(() => undefined)</script>');
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const { port } = server.address() as { port: number };
    try {
      const result = await check({ targets: [`http://127.0.0.1:${port}/page`], out: dir("drop"), sizes: [[390, 844], [1440, 900]], themes: ["light"], measured: false, chromium, log: quiet });
      const failed = result.findings.filter((f) => f.rule === "failed-request");
      assert.deepEqual(failed.map((f) => [f.element, f.width]), [["GET /data.json", 390], ["GET /data.json", 1440]]);
      assert.match(failed[0]!.detail, /^no answer \(net::ERR_[A-Z_]+\)$/);
    } finally {
      await new Promise((done) => server.close(done));
    }
  });

  test("fails an unanswered or error page and records incomplete task measurement without scanning it", async () => {
    const server = await serve(fixtures);
    const closed = await serve(fixtures);
    const refused = `${closed.origin}/overlap-fail.html`;
    await closed.close();
    try {
      const result = await check({ targets: [`${server.origin}/nope.html`, refused], out: dir("http"), sizes: [[390, 844]], themes: ["light"], chromium, log: quiet });
      // The two pages load side by side, so in either order.
      const incomplete = result.gated.filter((finding) => finding.rule === "long-task");
      assert.equal(incomplete.length, 2);
      assert.ok(incomplete.every((finding) => finding.value === undefined && finding.closeUp === undefined));
      assert.ok(result.time!.filter((row) => row.phase === "loading").every((row) => row.reading.status === "incomplete" && row.reading.reason === "page-load-failed"));
      assert.ok(result.time!.filter((row) => row.phase !== "loading").every((row) => row.reading.status === "not-run" && row.reading.reason === "page-load-failed"));
      const gated = result.gated.filter((finding) => finding.rule !== "long-task").sort((x, y) => x.detail.localeCompare(y.detail));
      assert.deepEqual(gated.map((f) => [f.rule, f.element]), [["http-error", "the page"], ["http-error", "the page"]]);
      assert.equal(gated[0]!.detail, "answered 404");
      assert.match(gated[1]!.detail, /^no answer: Error: connect ECONNREFUSED/);
    } finally {
      await server.close();
    }
  });

  test("records each opt-out once a page with its reason, plain aliases included, and keeps them through a merge", async () => {
    const opted = site("opted", {
      "page.html": page(
        '<h1>Opted</h1><div data-scroll-x="a timeline people pan sideways" style="overflow-x:auto"><div style="width:2000px;height:8px"></div></div><p data-clip-ok="">An alias without a reason counts for nothing</p><p data-ouro-allow="long-lines" data-ouro-allow-why="a ticker">Ticker</p>',
      ),
    });
    const out = dir("opted");
    const result = await check({ targets: [opted], out, sizes: two, themes: ["light", "dark"], chromium, log: quiet });
    const expected = [
      { site: "opted", page: "/page.html", rules: "long-lines", element: 'p "Ticker"', reason: "a ticker" },
      { site: "opted", page: "/page.html", rules: "sideways-scroll", element: "div [data-scroll-x]", reason: "a timeline people pan sideways" },
    ];
    assert.deepEqual(result.allowances, expected);
    assert.deepEqual(result.gated, []);
    assert.deepEqual((JSON.parse(readFileSync(join(out, "report.json"), "utf8")) as Report).allowances, expected);
    assert.deepEqual((await merge({ dirs: [out, out], out: dir("opted-merged"), chromium })).allowances, expected);
  });

  test("checks long lines only against a measure the project declares: none without one, a page glob's prose, or a selector's elements", async () => {
    const options = { targets: [fixtures], pages: "long-lines-*", sizes: [[1440, 900]] as [number, number][], themes: ["light"], chromium, log: quiet };
    const none = await check({ ...options, out: dir("measure-none") });
    assert.deepEqual(none.findings.filter((f) => f.rule === "long-lines"), []);
    const everywhere = await check({ ...options, out: dir("measure-all"), config: { measure: { "**": "100 chars" } } });
    assert.deepEqual(
      everywhere.findings.filter((f) => f.rule === "long-lines").map((f) => [f.page, f.detail.replace(/\d+ characters/, "N characters")]),
      [["/long-lines-fail.html", "about N characters a line (keep to 100)"]],
    );
    const elsewhere = await check({ ...options, out: dir("measure-glob"), config: { measure: { "/docs/**": "100 chars" } } });
    assert.deepEqual(elsewhere.findings.filter((f) => f.rule === "long-lines"), []);
    // A selector may hold a "/" of its own; only a leading "/" or a key of stars makes a page glob.
    const selected = await check({ ...options, out: dir("measure-selector"), config: { measure: { 'main p:not([data-x="/"])': "800px" } } });
    assert.deepEqual(selected.findings.filter((f) => f.rule === "long-lines").map((f) => f.page), ["/long-lines-fail.html"]);
    assert.match(selected.findings.find((f) => f.rule === "long-lines")!.detail, /^lines up to \d+px wide \(measure 800px\)$/);
  });

  test("names an axe finding the same at every size, whatever the other rules marked on the page", async () => {
    const faint = '<p style="width:60px;overflow:hidden;white-space:nowrap;color:#999;background:#aaa">Faint text cut off by its box</p>';
    const folder = site("faint", { "page.html": page(`<h1>Faint</h1>${faint}${faint}`) });
    const result = await check({ targets: [folder], out: dir("faint"), sizes: two, themes: ["light"], axe, chromium, log: quiet });
    const named = result.findings.filter((f) => f.rule === "axe");
    assert.deepEqual(named.map((f) => f.width).sort(), [1440, 390]);
    assert.equal(new Set(named.map((f) => f.element)).size, 1, named.map((f) => f.element).join(" | "));
    assert.doesNotMatch(named[0]!.element, /data-ouro-check-ref/);
    assert.ok(result.findings.some((f) => f.rule === "clipped-text"));
  });

  test("checks a page that never settles once its waits run out", async () => {
    const busy = site("busy", { "index.html": page("<p>Still loading.</p>", '<script type="module">setInterval(() => fetch(`/index.html?${Math.random()}`), 100);</script>') });
    // axe runs at the narrowest and widest of sizes without the phone and laptop ones.
    const result = await check({ targets: [busy], out: dir("busy"), sizes: [[400, 800]], themes: ["light"], readyTimeout: 200, readyEvents: ["app:drawn"], axe, chromium, log: quiet });
    assert.equal(result.shots.length, 1);
    // Checked as it is, but never a pass.
    assert.deepEqual(result.gated.map((f) => [f.rule, f.element]), [["not-ready", "the page"]]);
    assert.match(result.gated[0]!.detail, /^no ready signal in 0\.2 s/);
  });

  test("stops its servers and says why when the browser does not start", async () => {
    const missing = join(scratch, "no-browser");
    await assert.rejects(check({ targets: [fixtures], out: dir("no-browser"), sizes: [[390, 844]], themes: ["light"], chromium, executablePath: missing, log: quiet }), /no-browser/);
  });

  test("takes at most 40 close-ups a page, the first of each finding, in a run and in a merge", async () => {
    const prose = "Words that run on and on across the whole width of a wide screen, far past a hundred characters a line, and on.";
    const many = site("many", { "page.html": page(Array.from({ length: 45 }, (_, i) => `<p id="p${i}">${prose} ${prose}</p>`).join(""), "<style>main{max-width:none}</style>") });
    const out = dir("many");
    const result = await check({ targets: [many], out, sizes: [[1440, 900]], themes: ["light", "dark"], config: { measure: { "/**": "100 chars" } }, chromium, log: quiet });
    assert.equal(result.findings.length, 90);
    assert.equal(result.findings.filter((f) => f.closeUp).length, 40);
    const merged = await merge({ dirs: [out], out: dir("many-merged"), chromium });
    assert.equal(merged.findings.filter((f) => f.closeUp).length, 40);
    assert.equal(merged.findings.filter((f) => f.box).length, 40);
  });
});

describe("Ouro check's command", () => {
  const folder = site("command", { "overlap.html": readFileSync(join(fixtures, "overlap-fail.html"), "utf8"), "fine.html": readFileSync(join(fixtures, "overlap-pass.html"), "utf8") });
  const fast = ["--sizes", "390x844", "--themes", "light"];

  test("reads every option, and refuses what it cannot run", () => {
    assert.deepEqual(parseArgs(["site", "--pages", "docs/**", "--out", "o", "--sizes", " 390x844 ,1440x900", "--themes", "dark", "--shard", "2/4", "--before", "b.json", "--config", "c.json", "--no-axe", "--no-measured", "--ready-event", "a", "--ready-event", "b"]), {
      merge: false,
      targets: ["site"],
      out: "o",
      pages: "docs/**",
      sizes: [[390, 844], [1440, 900]],
      themes: ["dark"],
      shard: [2, 4],
      before: "b.json",
      config: "c.json",
      axe: false,
      measured: false,
      readyEvents: ["a", "b"],
      help: false,
    });
    assert.deepEqual(parseArgs(["merge", "a", "b", "--out", "o", "--config", "c.json"]), { ...parseArgs(["a"]), merge: true, targets: ["a", "b"], out: "o", config: "c.json" });
    assert.equal(parseArgs(["--help"]).help, true);
    assert.equal(parseArgs(["merge", "-h"]).help, true);
    assert.equal(parseArgs(["a"]).sizes, SIZES);
    for (const [argv, message] of [
      [["a", "--out"], /--out needs a value/],
      [["a", "--out", "--no-axe"], /--out needs a value/],
      [["a", "--themes", "light,sepia"], /not "sepia"/],
      [["a", "--shard", "3/2"], /--shard takes k\/n, such as 1\/4, not "3\/2"/],
      [["a", "--shard", "0/2"], /not "0\/2"/],
      [["a", "--shard", "half"], /not "half"/],
      [["a", "--sizes", "390x844,wide"], /not "wide"/],
      [["a", "--wat"], /Unknown option --wat/],
      [["merge", "a", "--shard", "1/2"], /merge takes --out and --config, not --shard/],
      [[], /Name a URL or a built folder/],
      [["merge"], /Name the out folders to merge/],
    ] as [string[], RegExp][]) {
      assert.throws(() => parseArgs(argv), message, argv.join(" "));
    }
  });

  test("prints its usage for --help, and with a usage problem exits 2", async () => {
    const help = await run(["--help"]);
    assert.equal(help.code, 0);
    assert.match(help.out, /^Usage: node lib\/ouro\/check\/check\.ts/);
    const wrong = await run(["--wat"]);
    assert.equal(wrong.code, 2);
    assert.match(wrong.err, /^Unknown option --wat\.\n\nUsage:/);
  });

  test("exits 3 on gated findings, writes the step summary, and exits 0 when the config waives them", async () => {
    const cwd = dir("cwd");
    const stepSummary = join(cwd, "step-summary.md");
    const failing = await run([folder, ...fast], { cwd, env: { GITHUB_STEP_SUMMARY: stepSummary, BROWSER_EXECUTABLE: browser } });
    assert.equal(failing.code, 3, failing.err);
    assert.match(failing.out, /✗ 390×844 {3}light command \/overlap\.html: \d+/);
    assert.match(failing.out, /\n\d+ finding\(s\), \d+ gated, 0 fixed since --before\. Report: ouro-check\/report\.json$/);
    assert.match(readFileSync(stepSummary, "utf8"), /^### Ouro check: 2 pages at 1 size, light/);
    const unwaived = await run(["merge", "ouro-check", "--out", "unwaived"], { cwd });
    assert.equal(unwaived.code, 3, unwaived.err);
    const server = await serve(folder);
    try {
      const url = await run([`${server.origin}/fine.html`, ...fast, "--out", "url"], { cwd });
      assert.equal(url.code, 0, url.err);
    } finally {
      await server.close();
    }
    // ouro-check.json in the app's folder is read without --config.
    writeFileSync(join(cwd, "ouro-check.json"), JSON.stringify({ waive: { "overlap.html": { "*": "a fixture" } } }));
    const waived = await run([folder, ...fast, "--out", "second"], { cwd });
    assert.equal(waived.code, 0, waived.out);
    assert.match(waived.out, /0 gated/);
    const before = await run([folder, ...fast, "--out", "third", "--before", "second/report.json"], { cwd });
    assert.equal(before.code, 0, before.err);
    const merged = await run(["merge", "second", "third", "--out", "merged"], { cwd });
    assert.equal(merged.code, 0, merged.err);
    const regated = await run(["merge", "second", "--out", "merged", "--config", join(cwd, "none.json")], { cwd });
    assert.equal(regated.code, 2);
    assert.match(regated.err, /^Reading .*none\.json stopped the check: /);
  });

  test("exits 2 when Playwright, axe-core, the config, the earlier report, a shard's report or the pages are missing, and 1 when it cannot run", async () => {
    const empty = dir("empty");
    // The file system's root has no node_modules, so nothing resolves from it.
    const noFolder = await run([join(scratch, "no-such-folder"), ...fast]);
    assert.equal(noFolder.code, 2);
    assert.match(noFolder.err, /no-such-folder is not a folder or an http\(s\) URL\./);
    // The check itself failing is no finding: 1, an error, not 3.
    const crash = await run([folder, ...fast, "--no-axe", "--out", "crash"], { env: { BROWSER_EXECUTABLE: join(scratch, "no-browser") } });
    assert.equal(crash.code, 1);
    assert.match(crash.err, /^Ouro check stopped before it finished: /);
    const noPlaywright = await run([folder], { from: ["/"] });
    assert.equal(noPlaywright.code, 2);
    assert.match(noPlaywright.err, /needs Playwright/);
    const noAxe = await run([folder], { from: ["/"], env: { PLAYWRIGHT_MODULE: playwrightModule } });
    assert.equal(noAxe.code, 2);
    assert.match(noAxe.err, /runs axe-core/);
    const withAxe = await run([folder, ...fast, "--out", "axe", "--before", "missing.json"], { from: ["/", root], env: { AXE_CORE: require.resolve("axe-core/axe.min.js") } });
    assert.equal(withAxe.code, 2);
    assert.match(withAxe.err, /^Reading .*missing\.json stopped the check: /);
    writeFileSync(join(scratch, "wide.json"), JSON.stringify({ measure: { "**": "wide" } }));
    const badMeasure = await run([folder, "--config", "wide.json"]);
    assert.equal(badMeasure.code, 2);
    assert.match(badMeasure.err, /wide\.json: the measure for "\*\*" is "wide"; give a number of px, ch or chars, such as "800px", "75ch" or "100 chars"\.$/);
    writeFileSync(join(scratch, "number.json"), JSON.stringify({ measure: { "main p": 800 } }));
    assert.equal((await run([folder, "--config", "number.json"])).code, 2);
    writeFileSync(join(scratch, "list.json"), JSON.stringify({ measure: ["100 chars"] }));
    const list = await run([folder, "--config", "list.json"]);
    assert.equal(list.code, 2);
    assert.match(list.err, /list\.json: "measure" maps page globs and CSS selectors to measures/);
    writeFileSync(join(scratch, "null.json"), JSON.stringify({ measure: null }));
    assert.equal((await run([folder, "--config", "null.json"])).code, 2);
    writeFileSync(join(scratch, "selector.json"), JSON.stringify({ measure: { "main >": "800px" } }));
    const selector = await run([folder, ...fast, "--no-axe", "--out", "selector", "--config", "selector.json"]);
    assert.equal(selector.code, 2, selector.err);
    assert.match(selector.err, /selector\.json: the measure for "main >" names no CSS selector a browser reads/);
    const badConfig = await run([folder, "--config", "missing.json"]);
    assert.equal(badConfig.code, 2);
    // A press setting JSON leaves unchecked: a string would read as its letters, and 0 presses would turn inp off.
    for (const [config, message] of [
      [{ press: "button" }, /"press" takes a list of CSS selectors/],
      [{ press: ["[role=tab]", " "] }, /"press" takes a list of CSS selectors/],
      [{ pressRepeat: 0 }, /"pressRepeat" takes a whole number of presses, 1 or more/],
      [{ pressRepeat: 2.5 }, /"pressRepeat" takes a whole number/],
      [{ states: ["text=Open"] }, /"states" takes pages, each with its states' names/],
      [{ states: { "/": ["text=Open"] } }, /"states" takes pages/],
      [{ states: { "/": { open: "text=Open" } } }, /"states" takes pages/],
      [{ states: { "/": { open: [] } } }, /"states" takes pages/],
      [{ states: { "/": { open: [" "] } } }, /"states" takes pages/],
      [{ states: { "/": null } }, /"states" takes pages/],
    ] as [object, RegExp][]) {
      writeFileSync(join(scratch, "press.json"), JSON.stringify(config));
      const wrong = await run([folder, "--config", "press.json"]);
      assert.equal(wrong.code, 2, JSON.stringify(config));
      assert.match(wrong.err, message);
    }
    const noReport = await run(["merge", empty]);
    assert.equal(noReport.code, 2);
    assert.match(noReport.err, /report\.json/);
    const noPages = await run([folder, ...fast, "--pages", "nothing/**"]);
    assert.equal(noPages.code, 2);
    assert.match(noPages.err, /^No pages to check in .* matching nothing\/\*\*\.$/);
    const empties = site("empties", {});
    const none = await run([empties, ...fast, "--no-axe"]);
    assert.match(none.err, /^No pages to check in [^ ]*empties\.$/);
    // A shard with nothing to sweep is not a problem: the merge needs its report.
    const share = await run([folder, "--sizes", "390x844", "--themes", "light", "--pages", "fine.html", "--shard", "2/2", "--out", "share"]);
    assert.equal(share.code, 0, share.err);
    assert.ok(existsSync(join(scratch, "share", "report.json")));
  });

  test("exits as every Ouro tool does: the Ouro AX kit's 0 ok, 1 error and 2 usage, then 3 for findings", () => {
    assert.deepEqual(BASE_EXIT_CODES.map(({ code, name }) => [name, code]), Object.entries(EXIT).slice(0, 3));
    assert.equal(EXIT.findings, BASE_EXIT_CODES.length);
  });

  test("words the summary and the captions for every count", () => {
    const f: Finding = { site: "s", page: "/a.html", width: 390, height: 844, theme: "light", rule: "overlap", element: "p.a|b", detail: "over | under", gated: false };
    const rows = [f, { ...f, theme: "dark" }, { ...f, theme: "dark" }, { ...f, width: 600 }, { ...f, width: 720 }, { ...f, width: 900, closeUp: "findings/a-1.png" }, { ...f, rule: "made-up", gated: true }];
    assert.equal(group(rows)[0]!.sizes.length, 5);
    assert.equal(group(rows)[0]!.closeUp, "findings/a-1.png");
    assert.equal(caption({ ...f, rule: "made-up" }), "/a.html at 390×844@2x light: made-up, p.a|b (over | under)");
    assert.equal(caption(f), `/a.html at 390×844@2x light: ${LABELS.overlap}, p.a|b (over | under)`);
    assert.equal(caption({ ...f, width: 3840, height: 2160, rule: "blurry-image", dpr: 1 }), "/a.html at 3840×2160@1x light: blurry picture, p.a|b (over | under): often a wrong `sizes` on a cropped, height-driven image");
    assert.deepEqual([dprAt(320), dprAt(3072), dprAt(3200), dprAt(3840)], [2, 2, 1, 1]);
    const text = summary({ targets: [], sizes: [[390, 844]], themes: ["light"], pages: [{ site: "s", page: "/a.html", name: "a" }, { site: "s", page: "/b.html", name: "b" }], findings: rows, fixed: [f], candidates: [], shots: [], allowances: [{ site: "s", page: "/a.html", rules: "overlap", element: "p", reason: "a stamp" }] });
    assert.match(text, /^### Ouro check: 2 pages at 1 size, light, density 2 \(1 above 3072px wide\)$/m);
    assert.match(text, /^\| ✗ \| `s \/a\.html` \| 1 \| {2}\|/m);
    assert.match(text, /^\| ✓ \| `s \/b\.html` \|/m);
    assert.match(text, /^Fixed since the earlier report: 1,/m);
    assert.match(text, /^Opted out on purpose: 1, each with its reason in `report\.json` \(`allowances`\)\.$/m);
    assert.match(text, /^\| · \| `s \/a\.html` \| overlap \| p\.a\\\|b \| 5 sizes, 390×844 light to 900×844 light \| over \\\| under \|$/m);
    assert.match(text, /^\| ✗ \| `s \/a\.html` \| made-up \| p\.a\\\|b \| 390×844 light \|/m);
    const one = summary({ targets: [], sizes: two, themes: ["light", "dark"], pages: [{ site: "s", page: "/a.html", name: "a" }], findings: [f], fixed: [], candidates: [], shots: [], allowances: [] });
    assert.match(one, /^### Ouro check: 1 page at 2 sizes, light and dark, density 2 \(1 above 3072px wide\)$/m);
    assert.match(one, /^\| · \| `s \/a\.html` \|/m);
    assert.doesNotMatch(one, /Fixed since/);
    assert.doesNotMatch(summary({ targets: [], sizes: two, themes: ["light"], pages: [], findings: [], fixed: [], candidates: [], shots: [], allowances: [] }), /Every finding/);
  });
});

describe("Ouro check's server", () => {
  test("serves a built folder as a host would, and nothing outside it", async () => {
    const folder = site("served", { "index.html": "<h1>Home</h1>", "docs/index.html": "<h1>Docs</h1>", "data.bin": "x", "style.CSS": "p{}" });
    const server = await serve(folder);
    try {
      const get = async (path: string) => {
        const response = await fetch(`${server.origin}${path}`);
        return [response.status, response.headers.get("content-type"), await response.text()];
      };
      assert.deepEqual(await get("/"), [200, "text/html", "<h1>Home</h1>"]);
      assert.deepEqual(await get("/docs"), [200, "text/html", "<h1>Docs</h1>"]);
      assert.deepEqual(await get("/docs/"), [200, "text/html", "<h1>Docs</h1>"]);
      assert.deepEqual(await get("/data.bin"), [200, "application/octet-stream", "x"]);
      assert.deepEqual(await get("/style.CSS"), [200, "text/css", "p{}"]);
      assert.equal((await get("/missing.html"))[0], 404);
      assert.equal((await get("/..%2f..%2fpackage.json"))[0], 403);
      assert.equal((await get("/50%off.png"))[0], 400);
    } finally {
      await server.close();
    }
  });

  test("lists a folder's pages, sorted, without hidden folders or node_modules, and matches a glob", async () => {
    const folder = site("listed", { "index.html": "", "b.html": "", "docs/index.html": "", "docs/deep/x.html": "", "docs/a.css": "", ".hidden/x.html": "", "node_modules/x/index.html": "" });
    assert.deepEqual(await listPages(folder), ["/", "/b.html", "/docs/", "/docs/deep/x.html"]);
    assert.deepEqual(await listPages(folder, "docs/**"), ["/docs/", "/docs/deep/x.html"]);
    assert.deepEqual(await listPages(folder, "/docs/*"), ["/docs/"]);
    assert.ok(globToRegExp("/**/x.html").test("/x.html") && globToRegExp("/**/x.html").test("/docs/deep/x.html"));
    assert.ok(globToRegExp("/?.html").test("/b.html") && !globToRegExp("/?.html").test("/bb.html"));
    assert.ok(globToRegExp("/a+(b).html").test("/a+(b).html") && !globToRegExp("/a.html").test("/aXhtml"));
  });
});

describe("Ouro check's design rules", () => {
  // Ari's findings of 2026-11-09, each as a fixture page that reproduces it: the check fails on each and passes once it
  // is fixed (each rule's pass page, in the test above).
  test("fails each seed case where a person saw it, with numbers that say why", async () => {
    const pages = ["giant-picture", "cramped-heading", "baked-corner", "jank", "type-scale"].map((rule) => `${rule}-fail.html`);
    const folder = site("seeds", Object.fromEntries(pages.map((file) => [file, readFileSync(join(fixtures, file), "utf8")])));
    for (const file of ["picture-960.png", "picture-160.png"]) copyFileSync(join(fixtures, file), join(folder, file));
    const result = await check({ targets: [folder], out: dir("seeds"), sizes: two, themes: ["light"], chromium, log: quiet });
    const of = (rule: string) => result.findings.filter((f) => f.rule === rule);
    // mendelow.me's giant photo: a banner leading a work entry fails on a laptop, not on a phone, where it is small.
    assert.deepEqual(of("giant-picture").map((f) => `${f.width} ${f.element}`), ['1440 img "A scene of a workshop at dawn" in article.card "Ouro UI"']);
    assert.match(of("giant-picture")[0]!.detail, /^the picture is \d+×\d+, \d+% of its item's height and [\d.]+ times its words'$/);
    // Ouro MD's header: the title row 6px under the hero art.
    assert.deepEqual(of("cramped-heading").map((f) => f.detail), ["6px below img.hero; a 48px heading needs 24px", "6px below img.hero; a 48px heading needs 24px"]);
    // Ouro MD's recording: the window's own dark corners inside the page's rounded frame.
    assert.ok(of("baked-corner").length > 0 && of("baked-corner").every((f) => /^the (top left|top right|bottom left|bottom right)(, (top right|bottom left|bottom right))+ corners draw a colour/.test(f.detail)), JSON.stringify(of("baked-corner")));
    // The plan map's jank: walked at one size and theme, each step three times.
    const jank = of("jank");
    assert.deepEqual(jank.map((f) => `${f.width} ${f.element}`).sort(), ['1440 hovering a#growing "Grows on hover"', '1440 hovering a#thrash "Measures every card on hover"', '1440 opening and closing button#open "Show the plan"']);
    assert.match(jank.find((f) => f.element.includes("thrash"))!.detail, /it forced \d+ layouts in its best run \(keep to 50\)/);
    assert.match(jank.find((f) => f.element.includes("growing"))!.detail, /it moved the page by a layout shift of [\d.]+ in its best run \(keep to 0.01\)/);
    const slow = jank.find((f) => f.element.includes("open"))!;
    assert.match(slow.detail, /^its longest frame took \d+ ms \(median of 3; budget 250 ms\)$/);
    assert.ok(slow.value! > BUDGETS.jank && slow.budget === BUDGETS.jank && slow.unit === "ms" && slow.samples!.length === 3, slow.detail);
    assert.ok(jank.every((f) => f.closeUp));
    // Refactoring UI's limited type scale: eleven sizes and five weights.
    assert.deepEqual(of("type-scale").map((f) => f.element), ["the page's text sizes", "the page's font weights", "the page's text sizes", "the page's font weights"]);
    // The walk is off with walk: false, and with the measured rules.
    const quietly = await check({ targets: [folder], out: dir("unwalked"), sizes: [[1440, 900]], themes: ["light"], config: { walk: false }, chromium, log: quiet });
    assert.deepEqual(quietly.findings.filter((f) => f.rule === "jank"), []);
  });

  test("https: a site moves http:// to https:// with a 301 and asks for HSTS for a year, and so does its www. name", async () => {
    const calls: string[] = [];
    // A stand-in for the web: each address answers with a status and headers, or throws as fetch does when a name
    // doesn't resolve or a certificate fails.
    const web = (answers: Record<string, [number, Record<string, string>] | Error>) =>
      (async (url: string | URL | Request) => {
        calls.push(String(url));
        const answer = answers[String(url)];
        if (answer === undefined) throw Object.assign(new TypeError("fetch failed"), { cause: new Error("getaddrinfo ENOTFOUND") });
        if (answer instanceof Error) throw answer;
        return new Response(null, { status: answer[0], headers: answer[1] });
      }) as typeof fetch;
    const year = { "strict-transport-security": "max-age=31536000; includeSubDomains" };
    assert.deepEqual(await transportIssues("127.0.0.1:5173", web({})), []);
    assert.deepEqual(await transportIssues("app.localhost", web({})), []);
    assert.deepEqual(calls, []);
    const good = web({
      "http://good.test/": [301, { location: "https://good.test/" }],
      "https://good.test/": [200, year],
      "http://www.good.test/": [308, { location: "https://good.test/" }],
      "https://www.good.test/": [301, { location: "https://good.test/" }],
    });
    assert.deepEqual(await transportIssues("good.test", good), []);
    const bad = web({
      "http://bad.test/": [200, {}],
      "https://bad.test/": [200, {}],
      "http://www.bad.test/": [301, { location: "http://bad.test" }],
      "https://www.bad.test/": Object.assign(new TypeError("fetch failed"), { cause: new Error("certificate has expired") }),
    });
    assert.deepEqual(await transportIssues("bad.test", bad), [
      { element: "http://bad.test/", detail: "answers 200 over plain HTTP instead of moving to https://" },
      { element: "https://bad.test/", detail: "sends no Strict-Transport-Security" },
      { element: "http://www.bad.test/", detail: "moves to http://bad.test with 301, not to https:// with a 301" },
      { element: "https://www.bad.test/", detail: "does not answer over HTTPS: Error: certificate has expired" },
    ]);
    // A www. site's twin is its bare name; a site that doesn't listen on http:// serves nothing over it; a subdomain has
    // no twin.
    calls.length = 0;
    const short = web({ "http://short.test/": [302, {}], "https://www.short.test/": [200, { "strict-transport-security": "max-age=300" }], "https://ui.short.test/": new Error("refused") });
    assert.deepEqual(await transportIssues("www.short.test", short), [
      { element: "https://www.short.test/", detail: "Strict-Transport-Security max-age=300, under a year" },
      { element: "http://short.test/", detail: "moves to nowhere with 302, not to https:// with a 301" },
      { element: "https://short.test/", detail: "does not answer over HTTPS: Error: getaddrinfo ENOTFOUND" },
    ]);
    calls.length = 0;
    assert.deepEqual(await transportIssues("ui.short.test", short), [{ element: "https://ui.short.test/", detail: "does not answer over HTTPS: refused" }]);
    assert.deepEqual(calls, ["http://ui.short.test/", "https://ui.short.test/"]);

    // In a run: once a site, at the first size and theme, in the first shard only, gated as any finding is.
    const out = dir("https");
    const result = await check({ targets: ["https://bad.test/"], out, sizes: two, themes: ["dark", "light"], fetch: bad, chromium, log: quiet });
    assert.deepEqual(result.findings.filter((f) => f.rule === "https").map((f) => `${f.site} ${f.width}x${f.height} ${f.theme} ${f.element}`), [
      "bad.test 390x844 dark http://bad.test/",
      "bad.test 390x844 dark https://bad.test/",
      "bad.test 390x844 dark http://www.bad.test/",
      "bad.test 390x844 dark https://www.bad.test/",
    ]);
    assert.ok(result.findings.filter((f) => f.rule === "https").every((f) => f.gated && !f.closeUp));
    assert.match(summary(JSON.parse(readFileSync(join(out, "report.json"), "utf8")) as Report), /no HTTPS/);
    const second = await check({ targets: ["https://bad.test/"], out: dir("https-2"), sizes: two, themes: ["light"], shard: [2, 2], fetch: bad, chromium, log: quiet });
    assert.deepEqual(second.findings.filter((f) => f.rule === "https"), []);
    const waived = await check({ targets: ["https://bad.test/"], out: dir("https-3"), sizes: [[390, 844]], themes: ["light"], fetch: bad, config: { waive: { "/": { https: "a staging site" } } }, chromium, log: quiet });
    assert.ok(waived.findings.some((f) => f.rule === "https") && waived.gated.every((f) => f.rule !== "https"));
  });
});
