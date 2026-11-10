import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "node:http";
import { test } from "node:test";
import { chromium } from "playwright";
import { check } from "../../registry/ouro/check/check.ts";
import { scratchDir } from "../scratch.mjs";

const root = scratchDir("ouro-time-runner-");
const options = { sizes: [[1440, 900]] as [number, number][], themes: ["light"], chromium, log: () => undefined };
const html = (body: string) => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Task observation</title><style>body{font:16px/1.5 system-ui,sans-serif;margin:0;padding:16px}</style><main><h1>Task observation</h1>${body}</main>`;
const site = (name: string, pages: Record<string, string>) => {
  const dir = join(root, name);
  mkdirSync(dir);
  for (const [file, body] of Object.entries(pages)) writeFileSync(join(dir, file), html(body));
  return dir;
};

test("records loading tasks and every separate press and walk phase without cancelling a violating first run", async () => {
  const dir = site("phases", {
    "index.html": `<button type="button" aria-expanded="false" data-ouro-check-press id="open">Show detail</button><script>
      const busy = (ms) => { const start = performance.now(); while (performance.now() - start < ms); };
      busy(160);
      let opens = 0;
      document.getElementById("open").onclick = () => { if (++opens === 1) busy(160); };
      addEventListener("keydown", (event) => { if (event.key === "Escape") busy(170); });
    </script>`,
  });
  const result = await check({ ...options, targets: [dir], out: join(root, "phases-out"), config: { pressRepeat: 3 } });
  for (const phase of ["loading", "press-open", "press-close", "walk-open", "walk-close"]) {
    const rows = result.time!.filter((row) => row.phase === phase);
    assert.equal(rows.length, phase === "loading" ? 1 : 3, phase);
    assert.ok(rows.every((row) => row.reading.status === "measured"), phase);
    assert.equal(result.findings.filter((finding) => finding.rule === "long-task" && finding.element.startsWith(`${phase} `)).length, 1, phase);
    assert.ok(rows.some((row) => row.reading.tasks?.some((entry) => entry.duration > 100)), phase);
    for (const row of rows) {
      assert.deepEqual(row.viewport, { width: 1440, height: 900 });
      assert.equal(row.dpr, 2);
      assert.ok(row.reading.tasks?.every((entry) => entry.startTime >= row.reading.expected!.since && entry.startTime < row.reading.until!));
    }
  }
  assert.match(readFileSync(join(root, "phases-out", "summary.md"), "utf8"), /Task windows:/);
  const disabled = await check({ ...options, targets: [dir], out: join(root, "disabled"), measured: false });
  assert.ok(disabled.time!.every((row) => row.reading.status === "not-run" && row.reading.reason === "measurement-disabled"));
  assert.equal(disabled.time!.length, 3);
  assert.ok(!disabled.findings.some((finding) => finding.rule === "long-task"));
  const unwalked = await check({ ...options, targets: [dir], out: join(root, "unwalked"), config: { walk: false, budgets: { "long-task": 10000 } } });
  assert.ok(unwalked.time!.some((row) => row.phase === "walk" && row.reading.reason === "walk-disabled"));
  assert.ok(!unwalked.findings.some((finding) => finding.rule === "long-task"));
});

test("keeps configured-state document replacement and missing instrumentation gated, while hash changes stay measured", async () => {
  const dir = site("navigation", {
    "index.html": `<button type="button" id="leave" onclick="location.href='/landed.html'">Another document</button>
      <button type="button" id="hash" onclick="location.hash='next'">Same document</button>
      <button type="button" id="remove" onclick="delete window.__ouroCheckTime">Remove instrumentation</button>`,
    "landed.html": "<p>Another document.</p>",
  });
  const result = await check({ ...options, targets: [dir], out: join(root, "navigation-out"), config: {
    walk: false, states: { "/": { left: ["#leave"], hash: ["#hash"], missing: ["#remove"] } },
  } });
  for (const [state, reason] of [["left", "navigated"], ["missing", "missing-instrumentation"]]) {
    const row = result.time!.find((row) => row.page.endsWith(`(${state})`) && row.phase === "loading")!;
    assert.equal(row.reading.status, "incomplete");
    assert.equal(row.reading.reason, reason);
    assert.equal(row.reading.tasks, undefined);
    const finding = result.gated.find((finding) => finding.page === row.page && finding.rule === "long-task")!;
    assert.ok(finding);
    assert.equal(finding.value, undefined);
    assert.equal(finding.closeUp, undefined);
  }
  const hash = result.time!.find((row) => row.page.endsWith("(hash)") && row.phase === "loading")!;
  assert.equal(hash.reading.status, "measured");
  assert.notEqual(hash.reading.expected!.url, hash.reading.observed!.url);
  assert.equal(hash.reading.expected!.document, hash.reading.observed!.document);
});

test("does not act after a press or walk setup load fails and records explicit not-run reasons", async () => {
  let visits = 0;
  const server = createServer((request, response) => {
    if (request.url !== "/") { response.writeHead(204).end(); return; }
    response.writeHead(++visits === 1 ? 200 : 503, { "content-type": "text/html" });
    response.end(html('<button type="button" aria-expanded="false" data-ouro-check-press>Open detail</button>'));
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const result = await check({ ...options, targets: [`http://127.0.0.1:${address.port}/`], out: join(root, "setup-out") });
    assert.equal(visits, 3, "one main reach, one press setup, and one walk setup");
    assert.deepEqual(result.time!.filter((row) => row.phase !== "loading").map((row) => [row.phase, row.reading.status, row.reading.reason]), [
      ["press", "not-run", "setup-page-load-failed"], ["walk", "not-run", "setup-page-load-failed"],
    ]);
    assert.deepEqual(result.gated.filter((finding) => finding.rule === "http-error").map((finding) => finding.element), ["press setup", "walk setup"]);
    assert.ok(!result.findings.some((finding) => finding.rule === "inp" || finding.rule === "jank"));
  } finally {
    await new Promise<void>((done, fail) => server.close((error) => error ? fail(error) : done()));
  }
});

test("never donates a replacement document's tasks to the original control's closing phase", async () => {
  const dir = site("closing-navigation", {
    "index.html": '<button type="button" aria-expanded="false" data-ouro-check-press id="away" onclick="location.href=\'/landed.html\'">Another document</button>',
    "landed.html": `<script>
      const start = performance.now(); while (performance.now() - start < 180);
      setInterval(() => { const since = performance.now(); while (performance.now() - since < 150); }, 200);
    </script><p>Another document.</p>`,
  });
  const result = await check({ ...options, targets: [dir], pages: "/", out: join(root, "closing-navigation-out") });
  for (const phase of ["press-close", "walk-close"]) {
    const rows = result.time!.filter((row) => row.phase === phase);
    assert.ok(rows.some((row) => row.reading.status === "not-run" && row.reading.reason === "page-left-after-open"), phase);
    assert.ok(rows.every((row) => row.reading.status !== "measured"), phase);
    assert.ok(!result.findings.some((finding) => finding.rule === "long-task" && finding.element.startsWith(`${phase} `)), phase);
  }
});
