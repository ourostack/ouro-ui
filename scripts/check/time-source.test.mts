import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { compileFunction } from "node:vm";
import ts from "typescript";
import type { Gate, Report } from "../../registry/ouro/check/check.ts";
import { armTime, readTime, timeFailure, type TimeObservation, type TimeReading, type TimeWindow } from "../../registry/ouro/check/time-check.ts";

// Execute only the named source closures, never their browser suite or server. This characterizes their Node contracts,
// not Playwright delivery or coverage of the original file's instrumented lines.
const source = (path: string) => ts.createSourceFile(path, readFileSync(new URL(path, new URL("../../", import.meta.url)), "utf8"), ts.ScriptTarget.Latest, true);
const one = <T extends ts.Node>(root: ts.Node, accepts: (node: ts.Node) => node is T): T => {
  const found: T[] = [];
  const visit = (node: ts.Node) => { if (accepts(node)) found.push(node); ts.forEachChild(node, visit); };
  visit(root);
  assert.equal(found.length, 1, "one named source seam");
  return found[0]!;
};
const initializer = (root: ts.Node, name: string) => {
  const declaration = one(root, (node): node is ts.VariableDeclaration => ts.isVariableDeclaration(node) && node.name.getText() === name);
  assert.ok(declaration.initializer);
  return declaration.initializer;
};
const execute = <T,>(text: string, bindings: Record<string, unknown> = {}): T =>
  Reflect.apply(compileFunction(ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, Object.keys(bindings)), undefined, Object.values(bindings)) as T;

test("the equality diagnostic preserves complete original readings and distinguishes absent, empty, incomplete and populated windows", () => {
  const file = source("scripts/check/check.test.mts");
  const serialize = execute<(whole: Report, parts: Report[], config: Gate) => string>(`return ${initializer(file, "timeComparison").getText()};`);
  const row: TimeObservation = {
    site: "fixtures", page: "/long-task-fail.html", width: 390, height: 844, theme: "dark",
    dpr: 2, viewport: { width: 390, height: 844 }, ref: "", element: "the page", phase: "loading", run: 1,
    reading: { status: "measured", expected: { document: 1000, url: "http://127.0.0.1:1234/long-task-fail.html", since: 0 },
      observed: { document: 1000, url: "http://127.0.0.1:1234/long-task-fail.html" }, until: 510, tasks: [] },
  };
  const report = (rows: TimeObservation[], shard?: string): Report => ({
    targets: ["/fixtures"], sizes: [[390, 844], [1440, 900]], themes: ["light", "dark"],
    pages: [], findings: [], fixed: [], candidates: [], shots: [], allowances: [], time: rows, ...(shard ? { shard } : {}),
  });
  const incomplete: TimeObservation = { ...row, reading: { status: "incomplete", expected: row.reading.expected!,
    observed: { document: 2000, url: "http://127.0.0.1:1234/landed.html" }, reason: "navigated" } };
  const populated: TimeObservation = { ...row, reading: { status: "measured", expected: row.reading.expected!,
    observed: { document: 1000, url: "http://127.0.0.1:1234/long-task-fail.html" }, until: 510,
    tasks: [{ startTime: 0, duration: 100.001 }, { startTime: 120, duration: 99.999 }, { startTime: 250, duration: 180.123456 }] } };
  const whole = report([row, ...[
    { site: "other" }, { page: "/other.html" }, { width: 1440 }, { height: 900 }, { theme: "light" }, { phase: "press-open" },
  ].map((change) => ({ ...row, ...change }))]);
  const parts = [report([], "1/3"), report([incomplete], "2/3"), report([populated], "3/3")];
  const config = { measure: { "**": "100 chars" } };
  const before = JSON.stringify({ whole, parts, config });
  const diagnostic = JSON.parse(serialize(whole, parts, config));
  assert.deepEqual(diagnostic.identity, { site: "fixtures", page: "/long-task-fail.html", width: 390, height: 844, theme: "dark", phase: "loading" });
  assert.deepEqual(diagnostic.configuration, { targets: ["/fixtures"], sizes: [[390, 844], [1440, 900]], themes: ["light", "dark"], config });
  assert.deepEqual(diagnostic.observations, [
    { origin: "whole", rows: [row] }, { origin: "shard", shard: "1/3", rows: [] },
    { origin: "shard", shard: "2/3", rows: [incomplete] }, { origin: "shard", shard: "3/3", rows: [populated] },
  ]);
  assert.equal(JSON.stringify({ whole, parts, config }), before, "diagnostics never mutate the original windows");
});

test("the delegating fault adapter selects one temporal evaluation and leaves other calls and receivers unchanged", async () => {
  const file = source("scripts/check/check.test.mts");
  const window = { document: 1000, url: "https://example.test/", since: 10 };
  const frameWait = "new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))";
  for (const point of ["armTime", "readTime", "frame-wait"] as const) {
    let closed = 0;
    const calls: unknown[] = [];
    const page = {
      url() { assert.equal(this, page); return window.url; },
      async evaluate(fn: unknown, argument?: unknown): Promise<unknown> {
        assert.equal(this, page);
        calls.push(fn);
        return fn === armTime ? window : fn === readTime ? argument : "delegated";
      },
    };
    const context = { async newPage() { assert.equal(this, context); return page; } };
    const browser = { async newContext() { assert.equal(this, browser); return context; }, async close() { assert.equal(this, browser); closed++; } };
    const chromium = { async launch() { assert.equal(this, chromium); return browser; } };
    const problem = new Error("Execution context was destroyed");
    const make = execute<(point: string, problem: unknown) => {
      chromium: typeof chromium; receipt: () => { point: string; url: string; expected?: TimeWindow }; close: () => Promise<void>;
    }>(`return ${initializer(file, "timeFault").getText()};`, { assert, chromium, armTime, readTime });
    const adapter = make(point, problem);
    try {
      assert.throws(adapter.receipt, /not consumed/);
      const tab = await (await (await adapter.chromium.launch()).newContext()).newPage();
      assert.equal(tab.url(), window.url);
      assert.equal(await tab.evaluate("unrelated"), "delegated");
      if (point === "armTime") {
        await assert.rejects(tab.evaluate(armTime), (error) => error === problem);
      } else {
        await tab.evaluate(armTime);
        if (point === "readTime") await assert.rejects(tab.evaluate(readTime, window), (error) => error === problem);
        else {
          assert.equal(await tab.evaluate(frameWait), "delegated", "a first-window frame wait is not the selected press window");
          await tab.evaluate(armTime);
          await assert.rejects(tab.evaluate(frameWait), (error) => error === problem);
        }
      }
      assert.deepEqual(adapter.receipt(), { point, url: window.url, ...(point === "armTime" ? {} : { expected: window }) });
      assert.equal(await tab.evaluate(frameWait), "delegated", "the fault is one-shot");
      assert.equal(await tab.evaluate(readTime, window), window);
      assert.ok(calls.includes("unrelated"));
    } finally {
      await adapter.close();
    }
    assert.equal(closed, 1, "cleanup delegates to the original browser");
  }
});

test("the pass-fixture oracle accepts only the identified, gated, nonnumeric navigation failure", () => {
  const file = source("scripts/check/check.test.mts");
  const loop = one(file, (node): node is ts.ForOfStatement => ts.isForOfStatement(node) && node.expression.getText().startsWith("RULES.filter("));
  const finding = {
    site: "fixtures", page: "/inp-pass.html", width: 1440, height: 900, theme: "light", dpr: 2,
    rule: "long-task", element: 'press-open button#away "Leave the page" (incomplete)', gated: true,
    detail: "Task measurement incomplete: navigated. No clean measurement is established.",
  };
  const reading = {
    status: "incomplete", reason: "navigated",
    expected: { document: 1000, url: "http://127.0.0.1:1234/inp-pass.html", since: 500 },
    observed: { document: 2000, url: "http://127.0.0.1:1234/inp-pass.html?moved" },
  };
  const row = {
    site: "fixtures", page: "/inp-pass.html", width: 1440, height: 900, theme: "light", dpr: 2,
    viewport: { width: 1440, height: 900 }, ref: "control-10", element: 'button#away "Leave the page"',
    phase: "press-open", run: 1, reading,
  };
  const check = (found = finding, observed = row) => execute(loop.getText(), {
    assert, RULES: ["inp"], result: { findings: [{ page: "/inp-fail.html", rule: "inp" }, found], time: [observed] },
  });
  check();
  for (const changed of [{ ...finding, gated: false }, { ...finding, value: 0 }, { ...finding, element: "another control" }]) {
    assert.throws(() => check(changed));
  }
  for (const changed of [
    { ...row, phase: "walk-open" }, { ...row, run: 2 }, { ...row, ref: "" },
    { ...row, reading: { ...reading, status: "measured" } },
    { ...row, reading: { ...reading, tasks: [] } },
  ]) {
    assert.throws(() => check(finding, changed));
  }
  assert.throws(() => check(finding, { ...row, reading: { ...reading, observed: { ...reading.observed, document: 1000 } } }));
  assert.throws(() => check(finding, { ...row, reading: { ...reading, observed: { ...reading.observed, url: reading.expected.url } } }));
});

test("HEAD probes do not consume the setup fixture's three document-GET responses", () => {
  const file = source("scripts/check/time-runner.test.mts");
  const server = initializer(file, "server");
  assert.ok(ts.isCallExpression(server) && server.arguments[0]);
  type Reply = { writeHead: (status: number) => Reply; end: (body?: string) => void };
  const fixture = execute<{ handle: (request: { url: string; method: string }, response: Reply) => void; visits: () => number }>(
    `let visits = 0; const html = ${initializer(file, "html").getText()}; return { handle: ${server.arguments[0].getText()}, visits: () => visits };`,
  );
  const ask = (method: string, url = "/") => {
    let status: number | undefined;
    const response: Reply = { writeHead: (value) => { status = value; return response; }, end: () => undefined };
    fixture.handle({ method, url }, response);
    return status;
  };
  assert.equal(ask("GET", "/favicon.ico"), 204);
  for (const [i, expected] of [200, 503, 503].entries()) {
    assert.equal(ask("HEAD"), 200);
    assert.equal(fixture.visits(), i, "a probe is not a document visit");
    assert.equal(ask("GET"), expected);
    assert.equal(fixture.visits(), i + 1);
  }
  assert.equal(fixture.visits(), 3, "one main reach, one press setup, and one walk setup");
});

test("both real temporal wrappers retain context-loss identity and propagate unrelated exceptions", async () => {
  const file = source("registry/ouro/check/check.ts");
  type Page = { evaluate: (fn: unknown, argument?: unknown) => Promise<unknown>; url: () => string };
  const begin = execute<(page: Page) => Promise<TimeWindow | TimeReading>>(`return ${initializer(file, "beginTime").getText()};`, { armTime, timeFailure });
  const finish = execute<(page: Page, start: TimeWindow | TimeReading, frames?: boolean) => Promise<TimeReading>>(`return ${initializer(file, "finishTime").getText()};`, { readTime, timeFailure });
  const window = { document: 1000, url: "https://example.test/", since: 10 };
  for (const message of ["Execution context was destroyed", "Cannot find context with specified id"]) {
    const page: Page = { evaluate: async () => { throw new Error(message); }, url: () => `${window.url}next` };
    const failed = await begin(page);
    assert.deepEqual(failed, { status: "incomplete", observed: { url: page.url() }, reason: "execution-context-destroyed" });
    assert.deepEqual(await finish(page, failed), failed, "a failed arm is not converted into an empty measurement");
    for (const frames of [false, true]) {
      assert.deepEqual(await finish(page, window, frames), { ...failed, expected: window });
    }
  }
  for (const problem of [new Error("application bug"), "not an Error"]) {
    const page: Page = { evaluate: async () => { throw problem; }, url: () => window.url };
    await assert.rejects(begin(page), (error) => error === problem);
    await assert.rejects(finish(page, window), (error) => error === problem);
  }
});

test("the real loading reach uses the loaded document and since zero before reading startup tasks", async () => {
  const file = source("registry/ouro/check/check.ts");
  const order: string[] = [];
  const window = { document: 1000, url: "https://example.test/", since: 500 };
  const reach = execute<(page: object, target: { url: string }) => Promise<{ failed: string | null; ready: boolean; time: TimeReading }>>(
    `return ${initializer(file, "reach").getText()};`, {
      measured: true, readyTimeout: 15000,
      open: async (_page: object, url: string) => {
        order.push("open");
        assert.equal(url, window.url);
        return { failed: null, ready: true };
      },
      beginTime: async () => { order.push("arm"); return { ...window }; },
      finishTime: async (_page: object, start: TimeWindow): Promise<TimeReading> => {
        order.push("read");
        assert.deepEqual(start, { document: 1000, url: "https://example.test/", since: 0 });
        return { status: "measured", expected: start, observed: { document: 1000, url: start.url }, until: 510, tasks: [] };
      },
    },
  );
  const result = await reach({}, { url: window.url });
  assert.deepEqual(order, ["open", "arm", "read"]);
  assert.equal(result.time.status, "measured");
  assert.equal(result.time.expected?.since, 0);
});
