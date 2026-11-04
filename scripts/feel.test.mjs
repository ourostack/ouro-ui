import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { conversation, random } from "../feel/data/seed.ts";
import { cases } from "../feel/cases.ts";
import { html, judge, markdown, median, unitOf } from "../feel/report.ts";
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

test("Ouro Feel fails a case that never came to rest, and a limit on a measure the probe does not take", () => {
  assert.equal(judge(spec, "webkit", [run({ jumps: 0, longestFrameMs: 10 }, false)]).pass, false);
  assert.throws(() => judge({ ...spec, limits: { anchorJumps: 0 } }, "webkit", [run({ jumps: 0 })]), /anchorJumps, which the probe did not measure/);
});

test("Ouro Feel's report names units by suffix and shows a spread only for repeated runs", () => {
  assert.equal(unitOf("anchorMovePx"), "px");
  assert.equal(unitOf("longestFrameMs"), "ms");
  assert.equal(unitOf("blankFrames"), "count");
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  const one = markdown([judge(spec, "webkit", [run({ jumps: 0, longestFrameMs: 10 })])]);
  assert.match(one, /\| `longestFrameMs` \| 10 ms \| 100 \| pass \|/);
  const three = markdown([judge(spec, "webkit", [run({ jumps: 0, longestFrameMs: 10 }), run({ jumps: 0, longestFrameMs: 30 }), run({ jumps: 0, longestFrameMs: 20 })])]);
  assert.match(three, /\| `longestFrameMs` \| 20 ms \[10–30\], 3 runs \| 100 \| pass \|/);
  assert.match(html([judge(spec, "webkit", [run({ jumps: 2, longestFrameMs: 10 })])]), /<tr class="over"><td><code>jumps<\/code><\/td><td>2<\/td><td>0<\/td><td>over<\/td><\/tr>/);
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
  const measured = new Set(["frames", "blankFrames", "blankFramesInset", "jumps", "jumpMaxPx", "jumpsStrict", "jumpStrictMaxPx", "shifts", "anchorShiftPx", "anchorMovePx", "deadInput", "wheelInputs", "forcedLayouts", "layoutReads", "layoutReadsPerFrame", "rowsMounted", "longestFrameMs"]);
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
    assert.equal((await globalThis.fetch(new globalThis.URL("../outside.txt", service.url))).status, 404);

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
