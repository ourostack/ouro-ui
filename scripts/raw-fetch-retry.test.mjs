import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { test } from "node:test";
import { fileURLToPath, URL } from "node:url";
import { withRetry, withTagFallback } from "./raw-fetch-retry.mjs";

const { AbortController, DOMException, ReadableStream, Response, TextEncoder } = globalThis;

const RAW = "https://raw.githubusercontent.com/ourostack/ouro-ui/v1/registry.json";
const notFound = () => new Response("gone", { status: 404 });
const ok = () => new Response("ok", { status: 200 });
const status = (code) => () => new Response("", { status: code });
const dropped = () => {
  throw new TypeError("fetch failed", { cause: Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }) });
};
// The headers arrive with a 200, then the body stream ends early: shadcn reads registry.json this way ("TypeError: terminated").
const bodyDropped = () =>
  new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"items":'));
        controller.error(new TypeError("terminated"));
      },
    }),
    { status: 200 },
  );

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

test("a 200 whose body ends early is tried again, and the caller reads the complete second body", async () => {
  const { fetch, calls, lines, sleeps } = harness([bodyDropped, ok]);
  const response = await fetch(RAW);
  assert.equal(await response.text(), "ok");
  assert.equal(calls.length, 2);
  assert.deepEqual(sleeps, [500]);
  assert.deepEqual(lines, ["raw-fetch-retry: /ourostack/ouro-ui/v1/registry.json failed (terminated); try 2 of 4 in 0.5s"]);
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

test("a real response cut off mid-body is tried again", async () => {
  let requests = 0;
  const server = createServer((request, response) => {
    requests += 1;
    if (requests === 1) {
      response.writeHead(200, { "Content-Length": 1000 });
      response.write('{"items":', () => request.socket.destroy());
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
    assert.equal(requests, 2);
    assert.equal(lines.length, 1);
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

test("every shadcn add from GitHub in the install test goes through add_retrying_raw_fetch", () => {
  const script = readFileSync(fileURLToPath(new URL("./install-test.sh", import.meta.url)), "utf8");
  const lines = script.split("\n").filter((line) => !/^\s*#/.test(line));
  // A direct add of a GitHub address fails on one dropped raw fetch, as the upgrade variant's v0.1.0 add did on main (run 43939020664).
  assert.deepEqual(lines.filter((line) => /\badd\b/.test(line) && /ourostack\/ouro-ui\//.test(line) && !/^\s*add_retrying_raw_fetch /.test(line)), []);
  assert.ok(lines.some((line) => /^\s*add_retrying_raw_fetch "\$\{shadcn\[2\]\}" "ourostack\/ouro-ui\/dialog#v0\.1\.0"$/.test(line)));
  assert.ok(lines.some((line) => /^\s*add_retrying_raw_fetch "\$\{shadcn\[2\]\}" "ourostack\/ouro-ui\/ouro-theme#\$ref"$/.test(line)));
});

const BRANCH_LOOKUP = "https://api.github.com/repos/ourostack/ouro-ui/commits/heads/v0.1.0";
const TAG_LOOKUP = "https://api.github.com/repos/ourostack/ouro-ui/commits/tags/v0.1.0";

test("a tag whose branch lookup GitHub answers 422 is looked up as a tag, and that answer is returned", async () => {
  const { fetchImpl, calls } = scripted([status(422), () => new Response('{"sha":"6a5b"}', { status: 200 })]);
  const response = await withTagFallback(fetchImpl)(BRANCH_LOOKUP, { redirect: "manual" });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '{"sha":"6a5b"}');
  assert.deepEqual(calls.map((call) => call.url), [BRANCH_LOOKUP, TAG_LOOKUP]);
  assert.deepEqual(calls[1].init, { redirect: "manual" });
});

test("a ref that is neither a branch nor a tag still fails with GitHub's 422", async () => {
  const { fetchImpl, calls } = scripted([status(422), status(422)]);
  const response = await withTagFallback(fetchImpl)(BRANCH_LOOKUP);
  assert.equal(response.status, 422);
  assert.equal(calls.length, 2);
});

test("only a 422 on a GitHub branch lookup is answered by the tag lookup; other answers and URLs pass through once", async () => {
  for (const url of [
    "https://raw.githubusercontent.com/ourostack/ouro-ui/v0.1.0/registry.json",
    "https://api.github.com/repos/ourostack/ouro-ui/git/ref/heads/v0.1.0",
    "https://example.com/repos/ourostack/ouro-ui/commits/heads/v0.1.0",
  ]) {
    const { fetchImpl, calls } = scripted([status(422)]);
    assert.equal((await withTagFallback(fetchImpl)(url)).status, 422, url);
    assert.equal(calls.length, 1, url);
  }
  // A 404 is shadcn's own signal to look the tag up, so the wrapper leaves it alone.
  const notFound = scripted([status(404)]);
  assert.equal((await withTagFallback(notFound.fetchImpl)(BRANCH_LOOKUP)).status, 404);
  assert.equal(notFound.calls.length, 1);
  const branch = scripted([ok]);
  assert.equal((await withTagFallback(branch.fetchImpl)(BRANCH_LOOKUP)).status, 200);
  assert.equal(branch.calls.length, 1);
});
