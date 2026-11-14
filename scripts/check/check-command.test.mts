import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";


import { join } from "node:path";
import { describe, test } from "node:test";


import { caption, dprAt, EXIT, group, LABELS, parseArgs, SIZES, summary, type Finding } from "../../registry/ouro/check/check.ts";
import { BASE_EXIT_CODES } from "../../registry/ouro/ax/exit-codes.ts";
import { serve } from "../../registry/ouro/check/serve.ts";
import { browser, dir, fixtures, playwrightModule, require, root, run, scratch, site, two } from "./kit.mts";

// Part of Ouro check's Node side tests; scripts/check.test.mjs runs every file here under Node's coverage.

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
      imagesReport: undefined,
    });
    assert.deepEqual(parseArgs(["merge", "a", "b", "--out", "o", "--config", "c.json"]), { ...parseArgs(["a"]), merge: true, targets: ["a", "b"], out: "o", config: "c.json" });
    assert.equal(parseArgs(["a", "--images-report", "images.json"]).imagesReport, "images.json");
    assert.equal(parseArgs(["merge", "a", "--images-report", "images.json"]).imagesReport, "images.json");
    assert.deepEqual(parseArgs(["--help"]).targets, []);
    assert.deepEqual(parseArgs(["merge", "-h"]).targets, []);
    assert.equal(parseArgs(["a"]).sizes, SIZES);
    for (const [argv, message] of [
      [["a", "--out"], /--out needs a value/],
      [["a", "--out", "--no-axe"], /--out needs a value/],
      [["a", "--themes", "light,sepia"], /not "sepia"/],
      [["a", "--themes", ""], /takes light, dark or both/],
      [["a", "--shard", "3/2"], /takes k\/n, such as 1\/4, not "3\/2"/],
      [["a", "--shard", "0/2"], /not "0\/2"/],
      [["a", "--shard", "half"], /not "half"/],
      [["a", "--sizes", "390x844,wide"], /not "wide"/],
      [["a", "--sizes", ""], /takes WxH pairs/],
      [["a", "--wat"], /there is no --wat/],
      [["merge", "a", "--shard", "1/2"], /there is no --shard/],
      [["a", "--images-report"], /--images-report needs a value/],
      [["a", "--out", "x", "--out", "y"], /--out is given twice/],
      [[], /Name a URL or a built folder/],
      [["merge"], /Name the out folders to merge/],
    ] as [string[], RegExp][]) {
      assert.throws(() => parseArgs(argv), message, argv.join(" "));
    }
  });

  test("prints the kit's help for --help, and refuses an unknown flag in one line that names its fix, with exit 2", async () => {
    const help = await run(["--help"]);
    assert.equal(help.code, 0);
    assert.match(help.out, /^ouro-check: checks every page/);
    assert.match(help.out, /--ready-event <name>\.\.\./);
    const wrong = await run(["--wat"]);
    assert.equal(wrong.code, 2);
    assert.match(wrong.err, /^ouro-check: check: there is no --wat; its flags are --pages, /);
    assert.equal(wrong.err.split("\n").length, 1);
  });

  test("refuses a target that is no folder or URL in one line that names the fix, and a mistyped merge names merge", async () => {
    const chek = await run(["chek", ...fast]);
    assert.equal(chek.code, 2);
    assert.equal(chek.err, `ouro-check: check: "chek" is not a folder or an http(s) URL. Fix: ouro-check <built folder or URL>.`);
    const mrege = await run(["mrege", ...fast]);
    assert.equal(mrege.code, 2);
    assert.equal(mrege.err, `ouro-check: check: "mrege" is not a folder or an http(s) URL. Fix: ouro-check merge <out folders>.`);
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
    assert.match(regated.err, /reading .*none\.json stopped the check: /);
  });

  test("--json prints the outcome alone and exits 3 on gated findings, with the progress lines on stderr", async () => {
    const cwd = dir("json");
    const failing = await run([folder, ...fast, "--json"], { cwd, env: { BROWSER_EXECUTABLE: browser } });
    assert.equal(failing.code, 3, failing.err);
    const outcome = JSON.parse(failing.out) as { action: string; state: string; summary: string };
    assert.equal(outcome.action, "check");
    assert.equal(outcome.state, "needs-human");
    assert.match(outcome.summary, /\d+ finding\(s\), \d+ gated/);
    assert.match(failing.err, /✗ 390×844/);
  });

  test("exits 2 when Playwright, axe-core, the config, the earlier report, a shard's report or the pages are missing, and 1 when it cannot run", async () => {
    const empty = dir("empty");
    // The file system's root has no node_modules, so nothing resolves from it.
    const noFolder = await run([join(scratch, "no-such-folder"), ...fast]);
    assert.equal(noFolder.code, 2);
    assert.match(noFolder.err, /no-such-folder" is not a folder or an http\(s\) URL\. Fix: ouro-check <built folder or URL>\./);
    // The check itself failing is no finding: 1, an error, not 3.
    const crash = await run([folder, ...fast, "--no-axe", "--out", "crash"], { env: { BROWSER_EXECUTABLE: join(scratch, "no-browser") } });
    assert.equal(crash.code, 1);
    assert.match(crash.err, /^ouro-check: check: stopped before it finished: /);
    const noPlaywright = await run([folder], { from: ["/"] });
    assert.equal(noPlaywright.code, 2);
    assert.match(noPlaywright.err, /needs Playwright/);
    const noAxe = await run([folder], { from: ["/"], env: { PLAYWRIGHT_MODULE: playwrightModule } });
    assert.equal(noAxe.code, 2);
    assert.match(noAxe.err, /runs axe-core/);
    const withAxe = await run([folder, ...fast, "--out", "axe", "--before", "missing.json"], { from: ["/", root], env: { AXE_CORE: require.resolve("axe-core/axe.min.js") } });
    assert.equal(withAxe.code, 2);
    assert.match(withAxe.err, /reading .*missing\.json stopped the check: /);
    writeFileSync(join(scratch, "wide.json"), JSON.stringify({ measure: { "**": "wide" } }));
    const badMeasure = await run([folder, "--config", "wide.json"]);
    assert.equal(badMeasure.code, 2);
    assert.match(badMeasure.err, /wide\.json: the measure for "\*\*" is "wide"\. Fix: give a number of px, ch or chars, such as "800px", "75ch" or "100 chars"\.$/);
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
      [{ waive: { "/art/**": { "blurry-image": "soft on purpose" } } }, /"waive" > "\/art\/\*\*" waives blurry-image, which cannot be waived: remove it, and give each picture it reports a larger source/],
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
    assert.match(noPages.err, /No pages to check in .* matching nothing\/\*\*\.$/);
    const empties = site("empties", {});
    const none = await run([empties, ...fast, "--no-axe"]);
    assert.match(none.err, /No pages to check in [^ ]*empties\.$/);
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
