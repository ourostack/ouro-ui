import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { stripTypeScriptTypes } from "node:module";
import { join } from "node:path";
import { test } from "node:test";
import { chromium } from "playwright";
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
  const measured = new Set(["frames", "blankFrames", "blankFramesInset", "jumps", "jumpMaxPx", "jumpsStrict", "jumpStrictMaxPx", "shifts", "anchorShiftPx", "anchorMovePx", "deadInput", "wheelInputs", "forcedLayouts", "layoutReads", "layoutReadsPerFrame", "rowsMounted", "longestFrameMs", "refreshMs", "lateFrames", "longFrames", "over16Share", "inputToMotionP95Ms", "inputToMotionMaxMs", "inputToMotionP95Frames", "inputToMotionMaxFrames", "inputNeverMoved"]);
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
      await cdp.send("Performance.enable");
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
    assert.equal(measures.inputNeverMoved, 1);
    // The wheel that moved the list is no dead input, though the engine moved the list before it dispatched the event.
    assert.equal(measures.deadInput, 0);
    assert.ok(measures.inputToMotionMaxFrames >= 1, `${measures.inputToMotionMaxFrames} frames`);
    assert.ok(measures.inputToMotionMaxMs >= 0 && measures.inputToMotionMaxMs < 1000, `${measures.inputToMotionMaxMs} ms`);
    assert.equal(measures.inputToMotionP95Ms, measures.inputToMotionMaxMs);
  } finally {
    await browser.close();
  }
});
