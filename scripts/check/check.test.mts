import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { caption, check, dprAt, EXIT, group, LABELS, main, merge, parseArgs, RULES, SIZES, summary, type Finding, type Report } from "../../registry/ouro/check/check.ts";
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
const run = async (argv: string[], options: { cwd?: string; env?: Record<string, string | undefined>; from?: string[] } = {}) => {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(argv, { cwd: options.cwd ?? scratch, env: options.env ?? {}, log: (line) => out.push(line), error: (line) => err.push(line), ...(options.from ? { from: options.from } : {}) });
  return { code, out: out.join("\n"), err: err.join("\n") };
};

describe("Ouro check", () => {
  test("finds each rule on its fail page and nothing on any pass page, with a report, a contact sheet and close-ups", async () => {
    const out = dir("rules");
    const result = await check({ targets: [fixtures], out, sizes: two, themes: ["light"], axe, chromium, log: quiet });
    // http-error and not-ready are about the page, not its content, and have tests of their own.
    for (const rule of RULES.filter((r) => r !== "http-error" && r !== "not-ready")) {
      assert.ok(result.findings.some((f) => f.page === `/${rule}-fail.html` && f.rule === rule), `${rule} fires on its fail page`);
      assert.deepEqual(result.findings.filter((f) => f.page === `/${rule}-pass.html`), [], `nothing fires on the ${rule} pass page`);
    }
    // axe runs only at the phone and laptop sizes.
    assert.ok(result.findings.some((f) => f.rule === "axe" && f.width === 390) && result.findings.some((f) => f.rule === "axe" && f.width === 1440));
    assert.equal(result.gated.length, result.findings.length);
    assert.equal(result.shots.length, 14 * 2);
    const report = JSON.parse(readFileSync(join(out, "report.json"), "utf8")) as Report;
    assert.equal(report.pages.length, 14);
    assert.match(readFileSync(join(out, "summary.md"), "utf8"), /^### Ouro check: 14 pages at 2 sizes, light, density 2 \(1 above 3072px wide\)$/m);
    for (const ref of report.pages) assert.ok(existsSync(join(out, "sheets", `${ref.name}.png`)), ref.name);
    for (const f of result.findings.filter((f) => f.closeUp)) {
      assert.ok(existsSync(join(out, f.closeUp!)) && existsSync(join(out, f.closeUp!.replace(/\.png$/, "-raw.png"))), f.closeUp);
      assert.ok(f.box && f.box.width > 0);
    }
    assert.deepEqual(readdirSync(join(out, "findings")).filter((file) => file.endsWith(".html")), [], "the composites' pages are removed");
  });

  test("a sharded run, merged, finds what one run does, with every shot, and a config gates the merge again", async () => {
    const sizes: [number, number][] = [[320, 640], [390, 844], [1440, 900]];
    const options = { targets: [fixtures], pages: "*-fail.html", sizes, themes: ["light", "dark"], axe, chromium, log: quiet };
    const whole = await check({ ...options, out: dir("whole") });
    const shards = [dir("shard"), dir("shard"), dir("shard")];
    const parts = [];
    for (const [i, out] of shards.entries()) parts.push(await check({ ...options, out, shard: [i + 1, 3] }));
    assert.ok(parts.every((part) => part.shard && part.findings.length < whole.findings.length));
    assert.match(readFileSync(join(shards[0]!, "summary.md"), "utf8"), /, shard 1\/3$/m);
    const merged = await merge({ dirs: shards, out: dir("merged"), chromium });
    assert.deepEqual(spots(merged.findings), spots(whole.findings));
    assert.equal(merged.shots.length, whole.shots.length);
    assert.equal(merged.pages.length, 7);
    assert.equal(merged.findings.filter((f) => f.closeUp).length, whole.findings.filter((f) => f.closeUp).length);
    assert.equal(merged.gated.length, merged.findings.length);
    const waived = await merge({ dirs: shards, out: dir("merged"), config: { waive: { "axe-*": { "*": "an axe fixture" }, "/overlap-fail.html": { overlap: "an overlap fixture" } } }, chromium, executablePath: browser });
    assert.ok(waived.gated.length > 0 && waived.gated.every((f) => !f.page.startsWith("/axe-") && !(f.page === "/overlap-fail.html" && f.rule === "overlap")));
    assert.ok(waived.findings.some((f) => !f.gated && f.rule === "overlap"));
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
  });

  test("fails a page that answers an error or does not answer, and checks nothing else on it", async () => {
    const server = await serve(fixtures);
    const closed = await serve(fixtures);
    const refused = `${closed.origin}/overlap-fail.html`;
    await closed.close();
    try {
      const result = await check({ targets: [`${server.origin}/nope.html`, refused], out: dir("http"), sizes: [[390, 844]], themes: ["light"], chromium, log: quiet });
      // The two pages load side by side, so in either order.
      const gated = [...result.gated].sort((x, y) => x.detail.localeCompare(y.detail));
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
    const busy = site("busy", { "index.html": page("<p>Still loading.</p>", '<script type="module">setInterval(() => fetch(`/poll?${Math.random()}`), 100);</script>') });
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
    const result = await check({ targets: [many], out, sizes: [[1440, 900]], themes: ["light", "dark"], chromium, log: quiet });
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
    assert.deepEqual(parseArgs(["site", "--pages", "docs/**", "--out", "o", "--sizes", " 390x844 ,1440x900", "--themes", "dark", "--shard", "2/4", "--before", "b.json", "--config", "c.json", "--no-axe", "--ready-event", "a", "--ready-event", "b"]), {
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
    assert.match(regated.err, /^Could not read .*none\.json/);
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
    assert.match(crash.err, /^Ouro check could not run: /);
    const noPlaywright = await run([folder], { from: ["/"] });
    assert.equal(noPlaywright.code, 2);
    assert.match(noPlaywright.err, /needs Playwright/);
    const noAxe = await run([folder], { from: ["/"], env: { PLAYWRIGHT_MODULE: playwrightModule } });
    assert.equal(noAxe.code, 2);
    assert.match(noAxe.err, /runs axe-core/);
    const withAxe = await run([folder, ...fast, "--out", "axe", "--before", "missing.json"], { from: ["/", root], env: { AXE_CORE: require.resolve("axe-core/axe.min.js") } });
    assert.equal(withAxe.code, 2);
    assert.match(withAxe.err, /^Could not read .*missing\.json/);
    const badConfig = await run([folder, "--config", "missing.json"]);
    assert.equal(badConfig.code, 2);
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
