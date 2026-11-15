import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { test } from "node:test";
import { fileURLToPath, URL } from "node:url";
import { withRetry } from "./raw-fetch-retry.mjs";

const { AbortController, DOMException, Response } = globalThis;

const RAW = "https://raw.githubusercontent.com/ourostack/ouro-ui/v1/registry.json";
const notFound = () => new Response("gone", { status: 404 });
const ok = () => new Response("ok", { status: 200 });
const status = (code) => () => new Response("", { status: code });
const dropped = () => {
  throw new TypeError("fetch failed", { cause: Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }) });
};

/** A fake fetch that answers each call with the next step: a Response, or a function that throws. */
function scripted(steps) {
  const calls = [];
  const fetchImpl = async (input, init) => {
    calls.push({ url: String(input), init });
    const step = steps[calls.length - 1];
    if (!step) throw new Error(`unexpected call ${calls.length}`);
    return step();
  };
  return { fetchImpl, calls };
}

function harness(steps, options = {}) {
  const { fetchImpl, calls } = scripted(steps);
  const lines = [];
  const sleeps = [];
  const fetch = withRetry(fetchImpl, { log: (line) => lines.push(line), sleep: async (ms) => sleeps.push(ms), ...options });
  return { fetch, calls, lines, sleeps };
}

test("a dropped raw fetch is tried again and then succeeds", async () => {
  const { fetch, calls, lines, sleeps } = harness([dropped, ok]);
  const response = await fetch(RAW);
  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  assert.deepEqual(sleeps, [500]);
  assert.deepEqual(lines, ["raw-fetch-retry: /ourostack/ouro-ui/v1/registry.json failed (ECONNRESET); try 2 of 4 in 0.5s"]);
});

test("a 503 and a 429 are tried again", async () => {
  for (const code of [503, 429]) {
    const { fetch, calls } = harness([status(code), ok]);
    assert.equal((await fetch(RAW)).status, 200, `HTTP ${code} is retried`);
    assert.equal(calls.length, 2);
  }
});

test("a 404 is not retried", async () => {
  const { fetch, calls, lines } = harness([notFound, ok]);
  const response = await fetch(RAW);
  assert.equal(response.status, 404);
  assert.equal(calls.length, 1);
  assert.deepEqual(lines, []);
});

test("after the last of four tries it throws the last error, and returns the last response for a status", async () => {
  const last = new TypeError("fetch failed");
  const { fetch, calls, lines, sleeps } = harness([dropped, dropped, dropped, () => Promise.reject(last)]);
  await assert.rejects(fetch(RAW), (error) => error === last);
  assert.equal(calls.length, 4);
  assert.deepEqual(sleeps, [500, 1500, 4000]);
  assert.deepEqual(lines.map((line) => line.replace(/^.*; /, "")), ["try 2 of 4 in 0.5s", "try 3 of 4 in 1.5s", "try 4 of 4 in 4s"]);

  const statuses = harness([status(503), status(503), status(503), status(502)]);
  assert.equal((await statuses.fetch(RAW)).status, 502);
  assert.equal(statuses.calls.length, 4);
});

test("another host is passed through untouched, with its error", async () => {
  const error = new TypeError("fetch failed");
  const { fetch, calls, lines } = harness([() => Promise.reject(error)]);
  await assert.rejects(fetch("https://example.com/registry.json"), (thrown) => thrown === error);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].url, "https://example.com/registry.json");
  assert.deepEqual(lines, []);
});

test("an aborted request is not tried again", async () => {
  const controller = new AbortController();
  controller.abort();
  const error = new DOMException("aborted", "AbortError");
  const { fetch, calls } = harness([() => Promise.reject(error), ok], {});
  await assert.rejects(fetch(RAW, { signal: controller.signal }), (thrown) => thrown === error);
  assert.equal(calls.length, 1);
});

test("the request's options, dispatcher included, reach every try unchanged", async () => {
  const dispatcher = { name: "proxy" };
  const { fetch, calls } = harness([dropped, ok]);
  await fetch(RAW, { redirect: "manual", dispatcher });
  assert.deepEqual(calls.map((call) => call.init), [{ redirect: "manual", dispatcher }, { redirect: "manual", dispatcher }]);
});

test("a real connection dropped mid-request and a real 503 are both tried again", async () => {
  let requests = 0;
  const server = createServer((request, response) => {
    requests += 1;
    if (requests === 1) return request.socket.destroy();
    if (requests === 2) {
      response.writeHead(503).end();
      return;
    }
    response.writeHead(200).end("the file");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/registry.json`;
    const lines = [];
    const fetch = withRetry(globalThis.fetch, { hosts: ["127.0.0.1"], log: (line) => lines.push(line), sleep: async () => {} });
    const response = await fetch(url);
    assert.equal(await response.text(), "the file");
    assert.equal(requests, 3);
    assert.equal(lines.length, 2);
    assert.match(lines[1], /failed \(HTTP 503\); try 3 of 4/);
  } finally {
    server.close();
  }
});

test("the preload wraps the global fetch in a process that imports it", () => {
  const preload = fileURLToPath(new URL("./raw-fetch-retry-preload.mjs", import.meta.url));
  const result = spawnSync(process.execPath, ["--import", preload, "-e", "console.log(globalThis.fetch.name)"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "retryingFetch");
});
