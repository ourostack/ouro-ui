import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import GotoTimeoutReporter, { gotoTimeout, probe } from "./goto-timeout-reporter.mjs";
import { scratchDir } from "./scratch.mjs";

const timedOut = {
  errors: [{ message: 'page.goto: Test timeout of 90000ms exceeded.\nCall log:\n  - navigating to "https://127.0.0.1:4179/", waiting until "load"\n' }],
};

const listen = (handler) =>
  new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });

test("gotoTimeout finds the address a page.goto timed out on, and nothing for any other failure", () => {
  assert.equal(gotoTimeout(timedOut), "https://127.0.0.1:4179/");
  assert.equal(gotoTimeout({ errors: [{ message: 'page.goto: Timeout 30000ms exceeded.\n  - navigating to "http://localhost:6006/iframe.html"' }] }), "http://localhost:6006/iframe.html");
  assert.equal(gotoTimeout({ errors: [{ message: "expect(locator).toBeVisible() failed" }] }), undefined);
  assert.equal(gotoTimeout({ errors: [] }), undefined);
});

test("probe says whether the server answered, gave no answer in time, or refused the connection", async (t) => {
  const answering = await listen((_, response) => response.end("ok"));
  const silent = await listen(() => {});
  t.after(() => {
    answering.close();
    silent.closeAllConnections();
    silent.close();
  });
  assert.match(await probe(`http://127.0.0.1:${answering.address().port}/`), /^answered 200 in \d+ ms$/);
  assert.equal(await probe(`http://127.0.0.1:${silent.address().port}/`, 300), "gave no answer in 0 s");
  const closed = await listen(() => {});
  const { port } = closed.address();
  await new Promise((resolve) => closed.close(resolve));
  assert.equal(await probe(`http://127.0.0.1:${port}/`), "refused the connection (ECONNREFUSED)");
});

test("a test whose page.goto timed out gets a line with the server's answer and the machine's load; other failures get none", async () => {
  const outputFile = join(scratchDir("ouro-goto-timeout-"), "stalls/goto-timeouts.txt");
  const asked = [];
  const reporter = new GotoTimeoutReporter({ outputFile, probe: async (url) => (asked.push(url), "gave no answer in 10 s") });
  const errors = [];
  const original = console.error;
  console.error = (line) => errors.push(line);
  try {
    reporter.onTestEnd({ titlePath: () => ["", "site-webkit", "voyage-live.spec.ts", "Live at dusk, dark"] }, timedOut);
    reporter.onTestEnd({ titlePath: () => ["", "chromium", "other.spec.ts", "passes"] }, { errors: [{ message: "expected 1 to be 2" }] });
    await reporter.onEnd();
  } finally {
    console.error = original;
  }
  assert.deepEqual(asked, ["https://127.0.0.1:4179/"]);
  const [line, ...rest] = readFileSync(outputFile, "utf8").trim().split("\n");
  assert.deepEqual(rest, []);
  assert.match(line, /site-webkit > voyage-live\.spec\.ts > Live at dusk, dark: page\.goto timed out on https:\/\/127\.0\.0\.1:4179\/; asked again, the server gave no answer in 10 s; load [\d.]+ [\d.]+ [\d.]+ \(1, 5, 15 min\) on \d+ CPUs, [\d.]+ of [\d.]+ GB free$/);
  assert.deepEqual(errors, [`[goto-timeout] ${line}`]);
});
