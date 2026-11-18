import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer as createHttpServer, type Server } from "node:http";
import { createServer as createNetServer, type Socket } from "node:net";
import type { AddressInfo } from "node:net";
import { pidAlive, probeHttp } from "#ouro-ax/probe.ts";

const servers: { close(): unknown }[] = [];
const sockets: Socket[] = [];
after(() => {
  sockets.forEach((s) => s.destroy());
  servers.forEach((s) => s.close());
});

async function listen(server: Server | ReturnType<typeof createNetServer>): Promise<number> {
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  return (server.address() as AddressInfo).port;
}

test("probeHttp tells up, stuck and down apart on real local sockets", async () => {
  const json = await listen(createHttpServer((req, res) => res.writeHead(req.headers["x-check"] === "yes" ? 200 : 401, { "content-type": "application/json" }).end('{"ok":true}')));
  assert.deepEqual(await probeHttp(`http://127.0.0.1:${json}/health`, { timeoutMs: 10_000, headers: { "x-check": "yes" } }), { state: "up", status: 200, body: { ok: true } });
  assert.deepEqual(await probeHttp(`http://127.0.0.1:${json}/health`, { timeoutMs: 10_000 }), { state: "up", status: 401, body: { ok: true } }, "any answer is up, with its status");
  const html = await listen(createHttpServer((_req, res) => res.writeHead(503).end("<h1>busy</h1>")));
  assert.deepEqual(await probeHttp(`http://127.0.0.1:${html}/`, { timeoutMs: 10_000 }), { state: "up", status: 503 }, "an answer that isn't JSON has no body");
  // Takes the connection and never answers, as a process that hangs does.
  const silent = await listen(createNetServer((socket) => void sockets.push(socket)));
  assert.deepEqual(await probeHttp(`http://127.0.0.1:${silent}/health`, { timeoutMs: 300 }), { state: "stuck" });
  const halfway = await listen(createHttpServer((_req, res) => void res.writeHead(200, { "content-type": "application/json" }).write('{"ok":')));
  assert.deepEqual(await probeHttp(`http://127.0.0.1:${halfway}/health`, { timeoutMs: 1000 }), { state: "stuck", status: 200 }, "headers, then nothing: stuck");
  const closed = createNetServer();
  const port = await listen(closed);
  await new Promise((done) => closed.close(done));
  assert.deepEqual(await probeHttp(`http://127.0.0.1:${port}/health`, { timeoutMs: 10_000 }), { state: "down" }, "nothing listens");
});

test("probeHttp reads an aborted request as stuck and any other failure as down", async () => {
  const failing = (error: unknown) => (() => Promise.reject(error)) as unknown as typeof fetch;
  assert.deepEqual(await probeHttp("http://x/", { fetchImpl: failing(Object.assign(new Error("aborted"), { name: "AbortError" })) }), { state: "stuck" });
  assert.deepEqual(await probeHttp("http://x/", { fetchImpl: failing(new TypeError("fetch failed")) }), { state: "down" });
  assert.deepEqual(await probeHttp("http://x/", { fetchImpl: failing(null) }), { state: "down" });
  assert.deepEqual(await probeHttp("http://x/", { fetchImpl: (() => Promise.resolve(Response.json(false))) as typeof fetch }), { state: "up", status: 200, body: false }, "a JSON false is a body");
  const broken = new Response(new ReadableStream({ start: (c) => c.error(new TypeError("terminated")) }), { status: 502 });
  assert.deepEqual(await probeHttp("http://x/", { fetchImpl: (() => Promise.resolve(broken)) as typeof fetch }), { state: "up", status: 502 }, "an answer cut off by a failure, not the time limit, is still an answer");
});

test("pidAlive is true for a running process, one of another user's, and false for no process or no pid", () => {
  assert.equal(pidAlive(process.pid), true);
  const answers = (code: string) => () => {
    throw Object.assign(new Error(code), { code });
  };
  assert.equal(pidAlive(1234, answers("EPERM")), true, "it runs as another user");
  assert.equal(pidAlive(1234, answers("ESRCH")), false);
  assert.equal(
    pidAlive(1234, () => {
      throw null;
    }),
    false,
  );
  const asked: number[] = [];
  for (const pid of [0, -1, 1.5, Number.NaN, 2 ** 60, "4200", null, undefined]) assert.equal(pidAlive(pid, (p) => void asked.push(p)), false, String(pid));
  assert.deepEqual(asked, [], "the system is never asked about a pid that can't be one");
  assert.equal(pidAlive(1, (p) => void asked.push(p)), true);
  assert.deepEqual(asked, [1], "1 is a pid");
  const ended = spawnSync(process.execPath, ["-e", ""]).pid;
  assert.equal(pidAlive(ended), false, "a process that has ended");
});
