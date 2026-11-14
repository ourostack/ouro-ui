import assert from "node:assert/strict";
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";

import { join } from "node:path";
import { describe, test } from "node:test";

import { chromium } from "playwright";
import { BUDGETS, check, merge, RULES, type Finding, type Gate, type Report } from "../../registry/ouro/check/check.ts";


import { axe, browser, dir, fixtures, page, quiet, site, spots, two } from "./kit.mts";

// Part of Ouro check's Node side tests; scripts/check.test.mjs runs every file here under Node's coverage.

describe("Ouro check", () => {
  test("finds each rule on its fail page and nothing on any pass page, with a report, a contact sheet and close-ups", async () => {
    const out = dir("rules");
    // long-lines is checked only against a declared measure; "**" with "100 chars" is the rule as it always counted.
    const result = await check({ targets: [fixtures], out, sizes: two, themes: ["light"], axe, config: { measure: { "**": "100 chars" } }, chromium, log: quiet });
    // http-error and not-ready are about the page, not its content, and https about a site on the web: each has tests
    // of its own.
    for (const rule of RULES.filter((r) => r !== "http-error" && r !== "not-ready" && r !== "https")) {
      assert.ok(result.findings.some((f) => f.page === `/${rule}-fail.html` && f.rule === rule), `${rule} fires on its fail page`);
      assert.deepEqual(result.findings.filter((f) => f.page === `/${rule}-pass.html`), [], `nothing fires on the ${rule} pass page`);
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
    assert.deepEqual(spots(merged.findings), spots(whole.findings));
    assert.equal(merged.shots.length, whole.shots.length);
    assert.equal(merged.pages.length, 33);
    assert.equal(merged.findings.filter((f) => f.closeUp).length, whole.findings.filter((f) => f.closeUp).length);
    assert.equal(merged.gated.length, merged.findings.length);
    const waived = await merge({ dirs: shards, out: dir("merged"), config: { waive: { "axe-*": { "*": "an axe fixture" }, "/overlap-fail.html": { overlap: "an overlap fixture" } } }, chromium, executablePath: browser });
    assert.ok(waived.gated.length > 0 && waived.gated.every((f) => !f.page.startsWith("/axe-") && !(f.page === "/overlap-fail.html" && f.rule === "overlap")));
    assert.ok(waived.findings.some((f) => !f.gated && f.rule === "overlap"));
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
    // Over budget on the second load too, so each is reported once, at the lower of its two loads.
    for (const f of measured.filter((f) => f.rule === "first-content")) {
      assert.equal(f.samples?.length, 2, f.detail);
      assert.ok(f.samples!.every((s) => s > BUDGETS["first-content"]), f.detail);
      assert.equal(f.value, Math.min(...f.samples!));
      assert.match(f.detail, /^\d+ ms to its largest content at best of two loads \(\d+ ms, then \d+ ms\), over the budget of 2500 ms$/);
    }
    for (const f of measured.filter((f) => f.closeUp)) assert.ok(existsSync(join(out, f.closeUp!)), f.closeUp);
    const report = JSON.parse(readFileSync(join(out, "report.json"), "utf8")) as Report;
    assert.ok(report.findings.some((f) => f.rule === "inp" && f.value === pressed[0]!.value && f.budget === 200 && f.unit === "ms" && f.samples!.length === 5));
    assert.ok(report.findings.filter((f) => f.rule !== "inp" && f.rule !== "first-content").every((f) => !("samples" in f)));
    assert.ok(report.findings.filter((f) => f.rule === "overlap" || f.rule === "axe").every((f) => !("value" in f)));
    assert.ok(result.shots.some((s) => s.page === "/inp-fail.html" && s.width === 1280 && s.theme === "dark" && s.count === 1));

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
    const config = { budgets: { inp: 5000, "layout-shift": 5, "first-content": 60000 } };
    const relaxed = await check({ targets: [folder], out: dir("measured"), pages: "*-fail.html", sizes: [[1440, 900]], themes: ["light"], config, chromium, log: quiet });
    assert.deepEqual(relaxed.findings.filter((f) => f.value !== undefined), []);
    const off = await check({ targets: [folder], out: dir("measured"), pages: "*-fail.html", sizes: [[1440, 900]], themes: ["light"], measured: false, chromium, log: quiet });
    assert.deepEqual(off.findings, []);
  });

  test("drops a first content over budget when its second load is within budget, since one slow response is the runner", async () => {
    const picture = readFileSync(join(fixtures, "picture-960.png"));
    const held: string[] = [];
    const server = createServer((request, response) => {
      if (request.url !== "/slow.png") {
        return response.writeHead(200, { "content-type": "text/html" }).end('<!doctype html><html lang="en"><meta charset="utf-8"><title>Slow picture</title><main><h1>Slow picture</h1><img src="/slow.png" width="960" height="540" alt="A wide field" style="display:block;width:100%;height:auto"></main>');
      }
      // Held for three seconds on the first request only, as a busy runner holds one load.
      held.push(request.url);
      const send = () => response.writeHead(200, { "content-type": "image/png" }).end(picture);
      if (held.length === 1) setTimeout(send, 3000);
      else send();
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const { port } = server.address() as { port: number };
    try {
      const result = await check({ targets: [`http://127.0.0.1:${port}/`], out: dir("second-load"), sizes: [[390, 844]], themes: ["light"], config: { walk: false }, chromium, log: quiet });
      assert.deepEqual(result.findings.filter((f) => f.rule === "first-content"), []);
      assert.equal(held.length, 2);
    } finally {
      await new Promise((done) => server.close(done));
    }
  });

  test("keeps a first content over budget when its second load does not reach the page", async () => {
    // The first load's two requests for the page (the check's HEAD and the browser's GET) answer; each later one fails.
    let asked = 0;
    const server = createServer((request, response) => {
      if (request.url !== "/") return response.writeHead(404).end();
      asked++;
      if (asked > 2) return response.writeHead(500).end("gone");
      response.writeHead(200, { "content-type": "text/html" }).end(readFileSync(join(fixtures, "first-content-fail.html")));
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const { port } = server.address() as { port: number };
    try {
      const result = await check({ targets: [`http://127.0.0.1:${port}/`], out: dir("second-fails"), sizes: [[390, 844]], themes: ["light"], chromium, log: quiet });
      const found = result.findings.filter((f) => f.rule === "first-content");
      assert.equal(found.length, 1);
      assert.ok(found[0]!.value! >= 3000 && found[0]!.samples === undefined, found[0]!.detail);
    } finally {
      await new Promise((done) => server.close(done));
    }
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

});
