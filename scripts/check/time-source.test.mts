import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { compileFunction } from "node:vm";
import ts from "typescript";
import { armTime, readTime, timeFailure, type TimeReading, type TimeWindow } from "../../registry/ouro/check/time-check.ts";

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
