import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { stripTypeScriptTypes } from "node:module";
import { join } from "node:path";
import { test } from "node:test";
import { chromium, webkit } from "playwright";
import { conversation, random } from "../feel/data/seed.ts";
import { cases } from "../feel/cases.ts";
import { html, judge, markdown, median, passLine, unitOf } from "../feel/report.ts";
import { BRIDGE, serveWithProbe } from "../feel/service.mts";
import { scratchDir } from "./scratch.mjs";

const run = (measures, settled = true) => ({ settled, measures, userAgent: "test", engineVersion: "1", os: "test", shot: "/out/history-prepend-webkit-1.png" });
const spec = { name: "history-prepend", component: "message-list", does: "", limits: { jumps: 0, longestFrameMs: 100 } };

test("Ouro Feel judges a count or distance on every run, and a time on the median of its runs", () => {
  const entry = judge(spec, "wkwebview", [run({ jumps: 0, longestFrameMs: 400 }), run({ jumps: 1, longestFrameMs: 50 }), run({ jumps: 0, longestFrameMs: 60 })]);
  assert.equal(entry.measures.jumps.pass, false, "one run with a jump fails, whatever the median");
  assert.deepEqual(entry.measures.jumps.runs, [0, 1, 0]);
  assert.equal(entry.measures.longestFrameMs.pass, true, "one slow run of three does not fail a time");
  assert.equal(entry.measures.longestFrameMs.median, 60);
  assert.deepEqual(entry.measures.longestFrameMs.spread, [50, 400]);
  assert.equal(entry.pass, false);
});

test("Ouro Feel judges a measure the probe reports only sometimes on the runs that reported it, and gives no verdict when none did", () => {
  const sometimes = { ...spec, limits: { lateFrames: 0, inputToMotionP95Ms: 100 } };
  const some = judge(sometimes, "webkit", [run({ lateFrames: 1, inputToMotionP95Ms: 50 }), run({})]);
  assert.deepEqual(some.measures.lateFrames.runs, [1]);
  assert.equal(some.measures.lateFrames.pass, false);
  assert.equal(some.measures.inputToMotionP95Ms.pass, true);
  const none = judge(sometimes, "webkit", [run({ jumps: 0 }), run({ jumps: 0 })]);
  assert.equal(none.measures.lateFrames.pass, undefined);
  assert.equal(none.pass, true);
  assert.match(markdown([none]), /\| `lateFrames` \| not measured \| 0 \| no verdict \|/);
  assert.equal(none.measures.lateFrames.median, undefined, "no median for a gate to read as a pass");
  assert.match(passLine(none), /no run measured lateFrames, inputToMotionP95Ms, so they have no verdict\.$/);
});

test("Ouro Feel fails a case that never came to rest, and a limit on a measure the probe does not take", () => {
  assert.equal(judge(spec, "webkit", [run({ jumps: 0, longestFrameMs: 10 }, false)]).pass, false);
  assert.throws(() => judge({ ...spec, limits: { anchorJumps: 0 } }, "webkit", [run({ jumps: 0 })]), /anchorJumps, which the probe did not measure/);
});

test("Ouro Feel's report leads with a pass line, names units by suffix and shows a spread only for repeated runs", () => {
  assert.equal(unitOf("anchorMovePx"), "px");
  assert.equal(unitOf("longestFrameMs"), "ms");
  assert.equal(unitOf("blankFrames"), "count");
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  const one = markdown([judge(spec, "webkit", [run({ jumps: 0, longestFrameMs: 10, rowsMounted: 4 })])], { "history-prepend": "Older messages arrive." });
  assert.match(one, /\*\*✓ Pass: history-prepend in Playwright's WebKit 1, test, 1 run\. Every judged measure is within its limit\.\*\*/);
  assert.match(one, /\nOlder messages arrive\.\n/);
  assert.match(one, /\| The longest frame \| `longestFrameMs` \| 10 ms \| 100 ms \| ✓ pass \|/);
  assert.match(one, /\| Rows added to the page \| `rowsMounted` \| 4 \|/);
  const three = markdown([judge(spec, "webkit", [run({ jumps: 0, longestFrameMs: 10 }), run({ jumps: 0, longestFrameMs: 30 }), run({ jumps: 0, longestFrameMs: 20 })])]);
  assert.match(three, /\| `longestFrameMs` \| 20 ms \[10–30\] \| 100 ms \| ✓ pass \|/);
  const failed = judge(spec, "wkwebview", [run({ jumps: 2, longestFrameMs: 10 }), run({ jumps: 0, longestFrameMs: 10 }), run({ jumps: 0, longestFrameMs: 10 })]);
  assert.equal(passLine(failed), "✗ Fail: history-prepend in WKWebView 1, test, 3 runs. jumps 2 (limit 0).");
  const page = html([failed], { "history-prepend": "Older messages arrive." });
  assert.match(page, /<p class="verdict fail">✗ Fail: history-prepend in WKWebView 1, test, 3 runs\. jumps 2 \(limit 0\)\.<\/p>/);
  assert.match(page, /<tr class="over"><td>Jumps: the reader's row moved 100 px or more in a frame<br><code>jumps<\/code><\/td><td>0 \[0–2\]<\/td><td>0<\/td><td>✗ over<\/td><\/tr>/);
  assert.match(page, /<figcaption>WKWebView at the end of run 3\. Older messages arrive\.<\/figcaption>/);
});

test("Ouro Feel's data is the same for the same seed, and made up", () => {
  const next = random(7);
  const again = random(7);
  assert.deepEqual([next(), next(), next()], [again(), again(), again()]);
  assert.deepEqual(conversation(1, 50, 200), conversation(1, 50, 200));
  assert.notDeepEqual(conversation(1, 50, 200), conversation(2, 50, 200));
  const older = conversation(1, 50, 0);
  assert.deepEqual(older.map((message) => message.id).slice(0, 2), ["m0", "m1"]);
  assert.deepEqual(new Set([...older, ...conversation(1, 50, 200)].filter((message) => message.role === "assistant").map((message) => message.name)).size, 1, "one agent across pages");
  for (const message of older) if (message.role === "assistant") assert.match(message.name, /^[a-z]+-agent$/);
});

test("Ouro Feel's cases each name a component and limit only measures the probe takes", () => {
  const measured = new Set(["frames", "blankFrames", "blankFramesInset", "jumps", "jumpMaxPx", "jumpsStrict", "jumpStrictMaxPx", "shifts", "anchorShiftPx", "anchorMovePx", "deadInput", "wheelInputs", "forcedLayouts", "layoutReads", "layoutReadsPerFrame", "rowsMounted", "longestFrameMs", "refreshMs", "lateFrames", "longFrames", "over16Share", "inputToMotionP95Ms", "inputToMotionMaxMs", "inputToMotionP95Frames", "inputToMotionMaxFrames", "inputNeverMoved", "inputAtEdge"]);
  for (const { name, component, limits } of cases) {
    assert.match(name, /^[a-z]+(-[a-z]+)*$/);
    assert.match(component, /^[a-z]+(-[a-z]+)*$/);
    for (const measure of Object.keys(limits)) assert.ok(measured.has(measure), `${name}: ${measure}`);
  }
});

test("Ouro Feel's probe service puts the probe first in the page's head and drives the page by long-poll, page after page", async () => {
  const dir = scratchDir("feel-service");
  writeFileSync(join(dir, "index.html"), "<!doctype html><html><head><title>t</title></head><body></body></html>");
  writeFileSync(join(dir, "probe.js"), "window.probe = 1;");
  const service = await serveWithProbe(dir, join(dir, "probe.js"));
  try {
    const page = await (await globalThis.fetch(service.url)).text();
    assert.match(page, new RegExp(`<head><script src="${BRIDGE}probe\\.js" data-ouro-feel-bridge="${BRIDGE}"></script><title>`));
    assert.equal(await (await globalThis.fetch(new globalThis.URL(`${BRIDGE}probe.js`, service.url))).text(), "window.probe = 1;");
    // A sibling folder whose name starts with the root's is outside the root.
    mkdirSync(`${dir}-sibling`, { recursive: true });
    writeFileSync(`${dir}-sibling/secret.txt`, "no");
    const sibling = `/..${dir.slice(dir.lastIndexOf("/"))}-sibling/secret.txt`;
    assert.equal((await globalThis.fetch(new globalThis.URL(sibling, service.url))).status, 404);
    assert.equal((await globalThis.fetch(new globalThis.URL(`${BRIDGE}result`, service.url), { method: "POST", body: "not json" })).status, 400);

    // The page's side, as the probe's bridge plays it: hello, take a command, answer it.
    const hello = service.hello();
    await globalThis.fetch(new globalThis.URL(`${BRIDGE}hello`, service.url), { method: "POST", body: JSON.stringify({ userAgent: "page" }) });
    assert.deepEqual(await hello, { userAgent: "page" });
    const reply = service.send({ type: "run", case: "history-prepend" });
    const command = await (await globalThis.fetch(new globalThis.URL(`${BRIDGE}next`, service.url))).json();
    assert.deepEqual(command, { id: 1, type: "run", case: "history-prepend" });
    const result = { case: "history-prepend", settled: true, measures: { jumps: 0 }, userAgent: "page" };
    await globalThis.fetch(new globalThis.URL(`${BRIDGE}result`, service.url), { method: "POST", body: JSON.stringify({ id: 1, ok: true, result }) });
    assert.deepEqual(await reply, { ok: true, result });

    // A page that closes while it polls takes nothing with it: the next page gets the next command.
    const closing = new globalThis.AbortController();
    const abandoned = globalThis.fetch(new globalThis.URL(`${BRIDGE}next`, service.url), { signal: closing.signal }).catch(() => "closed");
    await new Promise((resolve) => globalThis.setTimeout(resolve, 50));
    closing.abort();
    assert.equal(await abandoned, "closed");
    await new Promise((resolve) => globalThis.setTimeout(resolve, 50));
    const second = service.send({ type: "run", case: "history-prepend" });
    assert.deepEqual(await (await globalThis.fetch(new globalThis.URL(`${BRIDGE}next`, service.url))).json(), { id: 2, type: "run", case: "history-prepend" });
    await globalThis.fetch(new globalThis.URL(`${BRIDGE}result`, service.url), { method: "POST", body: JSON.stringify({ id: 2, ok: false, error: "x" }) });
    assert.deepEqual(await second, { ok: false, error: "x" });
  } finally {
    service.close();
  }
});

test("Ouro Feel's probe counts a blank frame by the rows' boxes, so a list that turns off pointer events while it scrolls is not blank, and a gap is", async () => {
  const probe = stripTypeScriptTypes(readFileSync(new globalThis.URL("../feel/probe/probe.ts", import.meta.url), "utf8"));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 400, height: 600 } });
    // Rows that take no pointer events, as a list does while it scrolls; then a gap of 2000 px with no rows in it.
    const rows = Array.from({ length: 40 }, (_, i) => `<div class="row" style="height:48px;pointer-events:none">Row ${i}</div>`).join("");
    await page.setContent(`<div id="list" style="height:400px;overflow:auto"><div style="pointer-events:none">${rows}</div><div style="height:2000px"></div></div>`);
    await page.addScriptTag({ content: probe });
    const scroll = (to) =>
      page.evaluate(async (to) => {
        const { document, ouroFeel } = globalThis;
        const list = document.getElementById("list");
        ouroFeel.watch({ case: "scroll", scroller: list, rows: ".row" });
        for (let y = list.scrollTop; y !== to; ) {
          y += Math.sign(to - y) * Math.min(Math.abs(to - y), 40);
          list.scrollTop = y;
          await ouroFeel.painted();
        }
        await ouroFeel.rest(5);
        return ouroFeel.stop(true).measures;
      }, to);
    const rowsOnly = await scroll(1200);
    assert.ok(rowsOnly.frames > 10, `${rowsOnly.frames} frames`);
    assert.equal(rowsOnly.blankFrames, 0);
    const intoTheGap = await scroll(2600);
    assert.ok(intoTheGap.blankFrames > 0, `${intoTheGap.blankFrames} blank frames scrolled into the gap`);
  } finally {
    await browser.close();
  }
});

for (const [layout, style, hidden] of [
  ["drawn top to bottom", "", false],
  ["drawn bottom to top", "display:flex;flex-direction:column-reverse;", false],
  ["holding a row that draws nothing", "", true],
]) {
  test(`Ouro Feel's probe reads only the rows in view each frame, and still follows the reader's row, in a list ${layout}`, async () => {
    const probe = stripTypeScriptTypes(readFileSync(new globalThis.URL("../feel/probe/probe.ts", import.meta.url), "utf8"));
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 400, height: 600 } });
      const rows = Array.from({ length: 200 }, (_, i) => `<div class="row" style="height:48px;flex:none${hidden && i === 100 ? ";display:none" : ""}">Row ${i}</div>`).join("");
      await page.setContent(`<div id="list" style="${style}height:400px;overflow:auto">${rows}</div>`);
      // Every read of a row's box, from before the probe loads, so the probe's own reads are counted too.
      await page.evaluate(() => {
        const read = globalThis.Element.prototype.getBoundingClientRect;
        globalThis.rowReads = 0;
        globalThis.Element.prototype.getBoundingClientRect = function () {
          if (this.classList.contains("row")) globalThis.rowReads++;
          return read.call(this);
        };
      });
      await page.addScriptTag({ content: probe });
      const { measures, reads } = await page.evaluate(async () => {
        const { document, ouroFeel } = globalThis;
        const list = document.getElementById("list");
        // Away from either end: the reader is in the middle of the conversation.
        list.scrollTop = list.scrollTop + Math.sign(list.scrollTop || 1) * 4000;
        ouroFeel.watch({ case: "rows", scroller: list, rows: ".row" });
        const from = globalThis.rowReads;
        for (let step = 0; step < 20; step++) {
          list.scrollTop += 40;
          ouroFeel.inputMoved(40);
          await ouroFeel.painted();
        }
        const reads = (globalThis.rowReads - from) / 20;
        // A row between the reader's row and where the list starts grows: the reader's row moves with no input.
        const view = list.getBoundingClientRect();
        const middle = view.top + view.height / 2;
        const visible = [...list.querySelectorAll(".row")].filter((row) => {
          const box = row.getBoundingClientRect();
          return box.height > 0 && box.bottom > view.top && box.top < view.bottom;
        });
        const reversed = globalThis.getComputedStyle(list).flexDirection === "column-reverse";
        const grow = reversed ? visible.find((row) => row.getBoundingClientRect().top > middle) : visible.findLast((row) => row.getBoundingClientRect().bottom < middle);
        grow.style.height = "148px";
        await ouroFeel.painted();
        await ouroFeel.painted();
        return { measures: ouroFeel.stop(true).measures, reads };
      });
      assert.equal(measures.blankFrames, 0);
      assert.ok(measures.jumps >= 1, `the reader's row moved 100 px, and the probe saw ${measures.jumps} jumps`);
      // About 9 rows are in a 400 px view of 48 px rows; reading every row would be 200 a frame.
      if (!hidden) assert.ok(reads < 40, `${reads} row boxes read a frame`);
    } finally {
      await browser.close();
    }
  });
}

test("Ouro Feel's probe takes the list as a selector and finds it again each frame, so a list put in another's place is measured", async () => {
  const probe = stripTypeScriptTypes(readFileSync(new globalThis.URL("../feel/probe/probe.ts", import.meta.url), "utf8"));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 400, height: 600 } });
    const list = (rows) => `<div id="list" style="height:400px;overflow:auto">${Array.from({ length: rows }, (_, i) => `<div class="row" style="height:48px">Row ${i}</div>`).join("")}<div style="height:2000px"></div></div>`;
    await page.setContent(`<main>${list(10)}</main>`);
    await page.addScriptTag({ content: probe });
    const measures = await page.evaluate(
      async ([next]) => {
        const { document, ouroFeel } = globalThis;
        ouroFeel.watch({ case: "switch", scroller: "#list", rows: ".row" });
        await ouroFeel.painted();
        // Another conversation opens: the list is a new element in the old one's place.
        document.querySelector("main").innerHTML = next;
        await ouroFeel.painted();
        const list = document.getElementById("list");
        for (let y = 0; y < 2400; y += 40) {
          list.scrollTop = y;
          await ouroFeel.painted();
        }
        await ouroFeel.rest(5);
        return ouroFeel.stop(true).measures;
      },
      [list(40)],
    );
    assert.ok(measures.blankFrames > 0, `${measures.blankFrames} blank frames scrolled into the new list's gap`);
    // Only the frames scrolled into the gap: the removed list, measured, would make every frame blank.
    assert.ok(measures.blankFrames < measures.frames / 2, `${measures.blankFrames} blank frames of ${measures.frames}`);
    assert.equal(measures.rowsMounted, 40, "the new list's rows");
  } finally {
    await browser.close();
  }
});

test("Ouro Feel's probe asks for no frames while it watches nothing and nothing waits on a paint, so a page with it loaded idles as without it", async () => {
  const probe = stripTypeScriptTypes(readFileSync(new globalThis.URL("../feel/probe/probe.ts", import.meta.url), "utf8"));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<div id="list" style="height:200px;overflow:auto">${Array.from({ length: 20 }, (_, i) => `<div class="row" style="height:48px">Row ${i}</div>`).join("")}</div>`);
    // Every frame the page asks for, counted from before the probe loads.
    await page.evaluate(() => {
      const ask = globalThis.requestAnimationFrame.bind(globalThis);
      globalThis.asked = 0;
      globalThis.requestAnimationFrame = (callback) => (globalThis.asked++, ask(callback));
    });
    await page.addScriptTag({ content: probe });
    const counts = await page.evaluate(async () => {
      const { ouroFeel } = globalThis;
      const idleFor = async () => {
        const from = globalThis.asked;
        await new Promise((resolve) => globalThis.setTimeout(resolve, 300));
        return globalThis.asked - from;
      };
      const loaded = await idleFor();
      ouroFeel.watch({ case: "idle", scroller: "#list", rows: ".row" });
      await ouroFeel.painted();
      await ouroFeel.painted();
      ouroFeel.stop(true);
      await ouroFeel.painted();
      const stopped = await idleFor();
      return { loaded, stopped };
    });
    assert.deepEqual(counts, { loaded: 0, stopped: 0 });
  } finally {
    await browser.close();
  }
});

test("Ouro Feel's probe waits before polling again when its bridge answers at once with no command", async () => {
  const probe = stripTypeScriptTypes(readFileSync(new globalThis.URL("../feel/probe/probe.ts", import.meta.url), "utf8"));
  let polls = 0;
  // A service that has no command and says so at once, as an app's own probe service may.
  const service = createServer((request, response) => {
    if (request.url === "/") return response.writeHead(200, { "content-type": "text/html" }).end("<!doctype html><html><head></head><body></body></html>");
    if (request.url === "/feel/next") polls++;
    response.writeHead(request.url === "/feel/next" ? 204 : 200).end();
  }).listen(0);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${service.address().port}/`);
    await page.addScriptTag({ content: probe.replace("document.currentScript", '({ dataset: { ouroFeelBridge: "/feel/" } })') });
    await page.waitForTimeout(2000);
    assert.ok(polls <= 3, `${polls} polls in 2 s`);
  } finally {
    await browser.close();
    service.close();
  }
});

test("Ouro Feel's probe, watching a scroll, adds no layout a frame and under half a millisecond of script", async () => {
  const probe = stripTypeScriptTypes(readFileSync(new globalThis.URL("../feel/probe/probe.ts", import.meta.url), "utf8"));
  // A page that does what a chat list does each frame it scrolls: it reads where its rows are and writes their styles.
  const rows = Array.from({ length: 200 }, (_, i) => `<div class="row" id="r${i}" style="height:48px">Row ${i}</div>`).join("");
  const app = `<div id="list" style="height:600px;overflow:auto">${rows}</div><script>
    const list = document.getElementById("list");
    list.addEventListener("scroll", () => {
      for (const row of list.querySelectorAll(".row")) {
        const box = row.getBoundingClientRect();
        if (box.bottom > 0 && box.top < 800) row.style.setProperty("--seen", String(Math.round(box.top)));
      }
    }, { passive: true });
  </script>`;
  const browser = await chromium.launch();
  try {
    /** The script time and layouts of 120 frames of scrolling, a step a frame, with the probe watching or without it. */
    const scroll = async (watched) => {
      const page = await browser.newPage({ viewport: { width: 400, height: 800 } });
      await page.setContent(app);
      if (watched) await page.addScriptTag({ content: probe });
      const cdp = await page.context().newCDPSession(page);
      // The time on the page's own thread, not the wall's, so a busy machine does not count against the probe.
      await cdp.send("Performance.enable", { timeDomain: "threadTicks" });
      const read = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(({ name, value }) => [name, value]));
      const before = await read();
      await page.evaluate(async (watched) => {
        const { document, ouroFeel } = globalThis;
        const list = document.getElementById("list");
        const frame = () => new Promise((resolve) => globalThis.requestAnimationFrame(() => globalThis.setTimeout(resolve)));
        if (watched) ouroFeel.watch({ case: "cost", scroller: list, rows: ".row" });
        for (let step = 0; step < 120; step++) {
          list.scrollTop = step * 40;
          await frame();
        }
        if (watched) ouroFeel.stop(true);
      }, watched);
      const after = await read();
      await page.close();
      return { scriptMs: (after.ScriptDuration - before.ScriptDuration) * 1000, layouts: after.LayoutCount - before.LayoutCount };
    };
    const without = [];
    const watched = [];
    for (let pair = 0; pair < 3; pair++) {
      without.push(await scroll(false));
      watched.push(await scroll(true));
    }
    const added = median(watched.map(({ scriptMs }) => scriptMs)) - median(without.map(({ scriptMs }) => scriptMs));
    assert.ok(added / 120 < 0.5, `the probe added ${(added / 120).toFixed(3)} ms of script a frame`);
    assert.ok(Math.abs(median(watched.map(({ layouts }) => layouts)) - median(without.map(({ layouts }) => layouts))) <= 2, JSON.stringify({ without, watched }));
  } finally {
    await browser.close();
  }
});

test("Ouro Feel's probe counts late frames against the refresh it measures, as a chat app's frame meter does, and long ones over 50 ms", async () => {
  const probe = stripTypeScriptTypes(readFileSync(new globalThis.URL("../feel/probe/probe.ts", import.meta.url), "utf8"));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<div id="list" style="height:200px;overflow:auto">${Array.from({ length: 20 }, (_, i) => `<div class="row" style="height:48px">Row ${i}</div>`).join("")}</div>`);
    await page.addScriptTag({ content: probe });
    const [few, many] = await page.evaluate(async () => {
      const { ouroFeel, performance } = globalThis;
      const busy = (ms) => {
        for (const end = performance.now() + ms; performance.now() < end; );
      };
      // Too few frames to tell the refresh: no late frames are judged.
      ouroFeel.watch({ case: "few", scroller: "#list", rows: ".row" });
      for (let frame = 0; frame < 5; frame++) await ouroFeel.painted();
      const few = ouroFeel.stop(true).measures;
      // Forty frames, two of which the page holds up for 250 ms: late at any refresh up to 166 ms.
      ouroFeel.watch({ case: "many", scroller: "#list", rows: ".row" });
      for (let frame = 0; frame < 40; frame++) {
        if (frame === 20 || frame === 30) busy(250);
        await ouroFeel.painted();
      }
      return [few, ouroFeel.stop(true).measures];
    });
    assert.equal(few.lateFrames, undefined);
    assert.ok(few.longFrames >= 0);
    assert.ok(many.refreshMs > 0, `refresh ${many.refreshMs} ms`);
    assert.ok(many.lateFrames >= 2, `${many.lateFrames} late frames`);
    assert.ok(many.longFrames >= 2, `${many.longFrames} long frames`);
    assert.ok(many.over16Share > 0 && many.over16Share <= 1);
  } finally {
    await browser.close();
  }
});

test("Ouro Feel's probe times each wheel event to the first frame that moved the list its way, and counts those it never moved", async () => {
  const probe = stripTypeScriptTypes(readFileSync(new globalThis.URL("../feel/probe/probe.ts", import.meta.url), "utf8"));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 400, height: 600 } });
    await page.setContent(`<div id="list" style="height:400px;overflow:auto">${Array.from({ length: 60 }, (_, i) => `<div class="row" style="height:48px">Row ${i}</div>`).join("")}</div>`);
    await page.addScriptTag({ content: probe });
    await page.mouse.move(200, 200);
    // Watching starts just before the wheel turns, so the probe may not have sampled a frame yet.
    await page.evaluate(() => globalThis.ouroFeel.watch({ case: "wheel", scroller: "#list", rows: ".row" }));
    // Up at the top, which moves nothing; then down, which does.
    await page.mouse.wheel(0, -200);
    await page.mouse.wheel(0, 200);
    const measures = await page.evaluate(async () => {
      const { ouroFeel } = globalThis;
      for (let frame = 0; frame < 10; frame++) await ouroFeel.painted();
      return ouroFeel.stop(true).measures;
    });
    // The wheel up at the top, which the list cannot move that way, is neither a motion nor dead input.
    assert.equal(measures.inputAtEdge, 1);
    assert.equal(measures.inputNeverMoved, 0);
    // The wheel that moved the list is no dead input, though the engine moved the list before it dispatched the event.
    assert.equal(measures.deadInput, 0);
    assert.ok(measures.inputToMotionMaxFrames >= 1, `${measures.inputToMotionMaxFrames} frames`);
    assert.ok(measures.inputToMotionMaxMs >= 0 && measures.inputToMotionMaxMs < 1000, `${measures.inputToMotionMaxMs} ms`);
    assert.equal(measures.inputToMotionP95Ms, measures.inputToMotionMaxMs);
    // A list that cannot scroll by the wheel (overflow hidden), though it has room to: the wheel never moves it.
    await page.evaluate(() => {
      const { document, ouroFeel } = globalThis;
      document.getElementById("list").style.overflow = "hidden";
      ouroFeel.watch({ case: "stuck", scroller: "#list", rows: ".row" });
    });
    await page.mouse.wheel(0, 200);
    const stuck = await page.evaluate(async () => {
      const { ouroFeel } = globalThis;
      for (let frame = 0; frame < 10; frame++) await ouroFeel.painted();
      return ouroFeel.stop(true).measures;
    });
    assert.equal(stuck.inputNeverMoved, 1);
    assert.equal(stuck.deadInput, 1);
    // Timed to the last frame in ms, and never in frames, as the frame meter takes them.
    assert.ok(stuck.inputToMotionMaxMs > 0);
    assert.equal(stuck.inputToMotionMaxFrames, undefined);
  } finally {
    await browser.close();
  }
});

test("Ouro Feel's probe counts a blank frame as a chat app's frame meter does: no row with height in the view less 40 px at its top and bottom, or a placeholder anywhere in view, rows or none", async () => {
  const probe = stripTypeScriptTypes(readFileSync(new globalThis.URL("../feel/probe/probe.ts", import.meta.url), "utf8"));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 400, height: 600 } });
    await page.addScriptTag({ content: probe });
    const blank = (content) =>
      page.evaluate(async (content) => {
        const { document, ouroFeel } = globalThis;
        document.body.innerHTML = `<div id="list" style="height:400px;width:300px;overflow:auto">${content}</div>`;
        ouroFeel.watch({ case: "blank", scroller: "#list", rows: ".row" });
        for (let frame = 0; frame < 5; frame++) await ouroFeel.painted();
        const { frames, blankFramesInset } = ouroFeel.stop(true).measures;
        return blankFramesInset === frames ? "blank" : blankFramesInset === 0 ? "content" : "mixed";
      }, content);
    // No rows at all: nothing to read.
    assert.equal(await blank(""), "blank");
    // A narrow row in the middle of the view, away from its sides: content, as only the top and bottom are inset.
    assert.equal(await blank(`<div style="height:180px"></div><div class="row" style="height:40px;width:20px"></div>`), "content");
    // A placeholder in the view's top 40 px, above the rows: still loading.
    assert.equal(await blank(`<div data-ouro="skeleton" style="height:20px"></div>${'<div class="row" style="height:48px"></div>'.repeat(10)}`), "blank");
  } finally {
    await browser.close();
  }
});

test("Ouro Feel's probe follows the reader's row by its id, or the attribute watch names, so a row drawn again as a new element that moved is still a jump", async () => {
  const probe = stripTypeScriptTypes(readFileSync(new globalThis.URL("../feel/probe/probe.ts", import.meta.url), "utf8"));
  const browser = await chromium.launch();
  try {
    const rows = (gap, name) => `<div style="height:${gap}px"></div>${Array.from({ length: 40 }, (_, i) => `<div class="row" ${name}="r${i}" style="height:48px">Row ${i}</div>`).join("")}`;
    // 150 px keeps the reader's row in the list's 400 px view; 600 px moves it out of the rows the probe reads each frame.
    for (const [name, gap] of [["id", 150], ["data-message-id", 150], ["data-message-id", 600]]) {
      const page = await browser.newPage({ viewport: { width: 400, height: 600 } });
      await page.setContent(`<div id="list" style="height:400px;overflow:auto">${rows(0, name)}</div>`);
      await page.addScriptTag({ content: probe });
      const measures = await page.evaluate(
        async ([moved, rowId]) => {
          const { document, ouroFeel } = globalThis;
          const list = document.getElementById("list");
          list.scrollTop = 480;
          await ouroFeel.painted();
          ouroFeel.watch({ case: "redraw", scroller: list, rows: ".row", rowId });
          await ouroFeel.painted();
          // Every row drawn again as a new element with the same name, further down, with no input.
          list.innerHTML = moved;
          await ouroFeel.rest(5);
          return ouroFeel.stop(true).measures;
        },
        [rows(gap, name), name === "id" ? undefined : name],
      );
      assert.equal(measures.jumps, 1, `${name}, ${gap} px`);
      assert.equal(measures.anchorShiftPx, gap, `${name}, ${gap} px`);
    }
  } finally {
    await browser.close();
  }
});

test("Ouro Feel's probe leaves out a wheel event no frame began after, as a chat app's frame meter does", async () => {
  const probe = stripTypeScriptTypes(readFileSync(new globalThis.URL("../feel/probe/probe.ts", import.meta.url), "utf8"));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 400, height: 600 } });
    await page.setContent(`<div id="list" style="height:400px;overflow:auto">${Array.from({ length: 60 }, (_, i) => `<div class="row" style="height:48px">Row ${i}</div>`).join("")}</div>`);
    await page.addScriptTag({ content: probe });
    const result = await page.evaluate(async () => {
      const { document, ouroFeel, WheelEvent } = globalThis;
      ouroFeel.watch({ case: "late wheel", scroller: "#list", rows: ".row" });
      for (let frame = 0; frame < 3; frame++) await ouroFeel.painted();
      // A wheel down the list, then the case stops in the same task, before any frame begins after it.
      document.getElementById("list").dispatchEvent(new WheelEvent("wheel", { deltaY: 100, bubbles: true }));
      return ouroFeel.stop(true);
    });
    const { measures, unmeasured } = result;
    assert.equal(measures.wheelInputs, 1);
    // Counted in no input measure: with no other wheel, they read as unmeasured, not 0.
    assert.equal(measures.inputNeverMoved, undefined);
    assert.equal(measures.deadInput, undefined);
    assert.equal(measures.inputToMotionMaxMs, undefined);
    assert.equal(unmeasured.deadInput, "no frame began after a wheel event");
  } finally {
    await browser.close();
  }
});

test("Ouro Feel's probe counts a wheel event's frames from the first frame that began after it, as a chat app's frame meter does", async () => {
  const probe = stripTypeScriptTypes(readFileSync(new globalThis.URL("../feel/probe/probe.ts", import.meta.url), "utf8"));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 400, height: 600 } });
    await page.setContent(`<div id="list" style="height:400px;overflow:auto">${Array.from({ length: 60 }, (_, i) => `<div class="row" style="height:48px">Row ${i}</div>`).join("")}</div>`);
    await page.addScriptTag({ content: probe });
    const measures = await page.evaluate(async () => {
      const { document, ouroFeel, requestAnimationFrame, WheelEvent } = globalThis;
      const list = document.getElementById("list");
      ouroFeel.watch({ case: "wheel in a frame", scroller: list, rows: ".row" });
      for (let frame = 0; frame < 3; frame++) await ouroFeel.painted();
      // A wheel down the list after this frame began, so the next frame is the first after it, and that frame moves the list.
      await new Promise((resolve) => requestAnimationFrame(resolve));
      list.dispatchEvent(new WheelEvent("wheel", { deltaY: 100, bubbles: true }));
      await ouroFeel.painted();
      list.scrollTop += 100;
      for (let frame = 0; frame < 3; frame++) await ouroFeel.painted();
      return ouroFeel.stop(true).measures;
    });
    assert.equal(measures.inputNeverMoved, 0);
    assert.equal(measures.inputToMotionMaxFrames, 1);
  } finally {
    await browser.close();
  }
});

test("Ouro Feel's probe times a wheel event dispatched after the frame it came before, to that frame's move, as a chat app's frame meter does", async () => {
  const probe = stripTypeScriptTypes(readFileSync(new globalThis.URL("../feel/probe/probe.ts", import.meta.url), "utf8"));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 400, height: 600 } });
    await page.setContent(`<div id="list" style="height:400px;overflow:auto">${Array.from({ length: 60 }, (_, i) => `<div class="row" style="height:48px">Row ${i}</div>`).join("")}</div>`);
    await page.addScriptTag({ content: probe });
    const measures = await page.evaluate(async () => {
      const { document, ouroFeel, requestAnimationFrame, WheelEvent } = globalThis;
      const list = document.getElementById("list");
      ouroFeel.watch({ case: "late dispatch", scroller: list, rows: ".row" });
      for (let frame = 0; frame < 3; frame++) await ouroFeel.painted();
      // The list moves before the next frame begins, as an engine that scrolls off the main thread moves it, so the meter (which
      // reads the scroll as the frame begins) and the probe (once it is painted) both see the move in that frame. The wheel that
      // moved it is dispatched only after the frame is sampled, with its own time from before the frame began.
      list.scrollTop += 100;
      const began = await new Promise((resolve) => requestAnimationFrame(resolve));
      await ouroFeel.painted();
      const wheel = new WheelEvent("wheel", { deltaY: 100, bubbles: true });
      Object.defineProperty(wheel, "timeStamp", { value: began - 1 });
      list.dispatchEvent(wheel);
      for (let frame = 0; frame < 3; frame++) await ouroFeel.painted();
      return ouroFeel.stop(true).measures;
    });
    assert.equal(measures.inputNeverMoved, 0);
    assert.equal(measures.deadInput, 0);
    assert.equal(measures.inputToMotionMaxFrames, 1);
    assert.equal(measures.inputToMotionMaxMs, 1);
  } finally {
    await browser.close();
  }
});

test("Ouro Feel's probe counts a wheel event while no list is on the page as at the list's end, as a chat app's frame meter does", async () => {
  const probe = stripTypeScriptTypes(readFileSync(new globalThis.URL("../feel/probe/probe.ts", import.meta.url), "utf8"));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 400, height: 600 } });
    await page.setContent(`<main></main>`);
    await page.addScriptTag({ content: probe });
    const measures = await page.evaluate(async () => {
      const { document, ouroFeel, WheelEvent } = globalThis;
      ouroFeel.watch({ case: "no list", scroller: "#list", rows: ".row" });
      for (let frame = 0; frame < 2; frame++) await ouroFeel.painted();
      document.querySelector("main").dispatchEvent(new WheelEvent("wheel", { deltaY: 100, bubbles: true }));
      for (let frame = 0; frame < 2; frame++) await ouroFeel.painted();
      return ouroFeel.stop(true).measures;
    });
    assert.equal(measures.wheelInputs, 1);
    assert.equal(measures.inputAtEdge, 1);
    assert.equal(measures.inputNeverMoved, 0);
    assert.equal(measures.deadInput, 0);
  } finally {
    await browser.close();
  }
});

test("Ouro Feel's probe judges no jump on the frame a list comes back to the page, after a wheel turned while it was gone", async () => {
  const probe = stripTypeScriptTypes(readFileSync(new globalThis.URL("../feel/probe/probe.ts", import.meta.url), "utf8"));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 400, height: 600 } });
    await page.setContent(`<main><div id="list" style="height:400px;overflow:auto">${Array.from({ length: 40 }, (_, i) => `<div class="row" id="r${i}" style="height:48px">Row ${i}</div>`).join("")}</div></main>`);
    await page.addScriptTag({ content: probe });
    // The list given as a selector, and as the element itself.
    for (const byElement of [false, true]) {
    const measures = await page.evaluate(async (byElement) => {
      const { document, ouroFeel, WheelEvent } = globalThis;
      const main = document.querySelector("main");
      const list = document.getElementById("list");
      ouroFeel.watch({ case: "list away", scroller: byElement ? list : "#list", rows: ".row" });
      for (let frame = 0; frame < 2; frame++) await ouroFeel.painted();
      list.remove();
      await ouroFeel.painted();
      main.dispatchEvent(new WheelEvent("wheel", { deltaY: 150, bubbles: true }));
      await ouroFeel.painted();
      main.append(list);
      for (let frame = 0; frame < 3; frame++) await ouroFeel.painted();
      return ouroFeel.stop(true).measures;
    }, byElement);
    assert.equal(measures.wheelInputs, 1, `by element: ${byElement}`);
    assert.equal(measures.jumps, 0, `by element: ${byElement}`);
    assert.equal(measures.shifts, 0, `by element: ${byElement}`);
    assert.equal(measures.anchorMovePx, 0, `by element: ${byElement}`);
    }
  } finally {
    await browser.close();
  }
});

test("Ouro Feel's report reads a measure the probe found unmeasured as unmeasured, with why, never as 0 or an error", () => {
  const blindRun = { ...run({ jumps: 0, longestFrameMs: 10 }), unmeasured: { deadInput: "no wheel event reached the probe, though the list scrolled (3 scroll events)" } };
  const entry = judge({ ...spec, limits: { ...spec.limits, deadInput: 0 } }, "webkit", [blindRun]);
  assert.deepEqual(entry.measures.deadInput.runs, []);
  assert.equal(entry.measures.deadInput.pass, undefined);
  assert.equal(entry.measures.deadInput.unmeasured, "no wheel event reached the probe, though the list scrolled (3 scroll events)");
  assert.match(markdown([entry]), /\| `deadInput` \| unmeasured: no wheel event reached the probe, though the list scrolled \(3 scroll events\) \|/);
  assert.match(passLine(entry), /Unmeasured, as its source saw nothing: deadInput \(no wheel event reached the probe, though the list scrolled \(3 scroll events\)\)\.$/);
});

test("Ouro Feel's probe reads a measure as unmeasured, never 0, when its source sees nothing that a second source saw, in Chromium and WebKit", async () => {
  for (const [name, engine] of [["Chromium", chromium], ["WebKit", webkit]]) {
    const probe = stripTypeScriptTypes(readFileSync(new globalThis.URL("../feel/probe/probe.ts", import.meta.url), "utf8"));
    const browser = await engine.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 400, height: 600 } });
      await page.setContent(`<div id="list" style="height:400px;overflow:auto">${Array.from({ length: 60 }, (_, i) => `<div class="row" style="height:48px">Row ${i}</div>`).join("")}</div>`);
      await page.addScriptTag({ content: probe });
      const [noWheel, noRows] = await page.evaluate(async () => {
        const { document, ouroFeel } = globalThis;
        const list = document.getElementById("list");
        // The list moves by script, as keys or the page's own code move it: no wheel event reaches the probe.
        ouroFeel.watch({ case: "no wheel", scroller: "#list", rows: ".row" });
        for (let step = 0; step < 3; step++) {
          list.scrollTop += 120;
          ouroFeel.inputMoved(120);
          await ouroFeel.painted();
          await ouroFeel.painted();
        }
        const noWheel = ouroFeel.stop(true);
        // rows matches no row: no reader's row to follow, and no row for the first gate's blank frames.
        ouroFeel.watch({ case: "no rows", scroller: "#list", rows: ".no-such-row" });
        for (let frame = 0; frame < 4; frame++) await ouroFeel.painted();
        return [noWheel, ouroFeel.stop(true)];
      });
      assert.equal(noWheel.measures.deadInput, undefined, `${name}: dead input is not 0 when no wheel was seen`);
      assert.match(noWheel.unmeasured.deadInput, /^no wheel event reached the probe, though the list scrolled \(\d+ scroll events\)$/);
      assert.equal(noWheel.unmeasured.inputAtEdge, noWheel.unmeasured.deadInput);
      assert.ok(noWheel.measures.jumps === 0 && noWheel.unmeasured.jumps === undefined, "the reader's row was followed");
      assert.equal(noRows.measures.jumps, undefined);
      assert.match(noRows.unmeasured.jumps, /never followed/);
      assert.equal(noRows.measures.blankFrames, undefined);
      assert.match(noRows.unmeasured.blankFrames, /no frame held a row/);
      // The strict count needs no row to count every frame blank, so it stays measured.
      assert.ok(noRows.measures.blankFramesInset > 0);
    } finally {
      await browser.close();
    }
  }
});

test("Ouro Feel's probe times a wheel event that waited behind a long task as the page's own frames do, in Chromium and WebKit", async () => {
  for (const [name, engine] of [["Chromium", chromium], ["WebKit", webkit]]) {
    const probe = stripTypeScriptTypes(readFileSync(new globalThis.URL("../feel/probe/probe.ts", import.meta.url), "utf8"));
    const browser = await engine.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 400, height: 600 } });
      await page.setContent(`<div id="list" style="height:400px;overflow:auto">${Array.from({ length: 60 }, (_, i) => `<div class="row" style="height:48px">Row ${i}</div>`).join("")}</div>`);
      await page.addScriptTag({ content: probe });
      await page.mouse.move(200, 200);
      await page.evaluate(async () => {
        const { addEventListener, document, ouroFeel, performance, requestAnimationFrame, setTimeout } = globalThis;
        // A second, independent record: each frame's start and the list's scroll then, and the wheel event's own time.
        const list = document.getElementById("list");
        const own = (globalThis.own = { frames: [], wheel: undefined });
        const tick = (at) => {
          own.frames.push([at, list.scrollTop]);
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        addEventListener("wheel", (event) => (own.wheel = event.timeStamp), { capture: true, passive: true });
        ouroFeel.watch({ case: "long task", scroller: list, rows: ".row" });
        await ouroFeel.painted();
        // The page holds the main thread for 300 ms, as a list that renders a long conversation at once.
        setTimeout(() => {
          for (const end = performance.now() + 300; performance.now() < end; );
        }, 20);
      });
      // A wheel turned while the long task runs. Chromium stamps it then, and the list moves only once the task ends; Playwright's
      // WebKit stamps it when it dispatches it, after the task, so there it waits for nothing.
      await new Promise((resolve) => globalThis.setTimeout(resolve, 120));
      await page.mouse.wheel(0, 120);
      const [measures, own] = await page.evaluate(async () => {
        const { ouroFeel } = globalThis;
        for (let frame = 0; frame < 10; frame++) await ouroFeel.painted();
        return [ouroFeel.stop(true).measures, globalThis.own];
      });
      const moved = own.frames.findIndex(([at, top], index) => index > 0 && at >= own.wheel && top > own.frames[index - 1][1]);
      const expected = own.frames[moved][0] - own.wheel;
      assert.equal(measures.wheelInputs, 1);
      assert.ok(Math.abs(measures.inputToMotionMaxMs - expected) <= 1, `the probe read ${measures.inputToMotionMaxMs} ms; the page's own frames, ${expected.toFixed(1)} ms`);
      assert.equal(measures.deadInput, expected >= 100 ? 1 : 0);
      if (name === "Chromium") assert.ok(expected >= 100, `the wheel waited ${expected.toFixed(1)} ms`);
    } finally {
      await browser.close();
    }
  }
});