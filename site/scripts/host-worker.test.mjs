/* global URL, Request, Response */
import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { host, hsts, pages, rehome, secure, upstream } from "../host/worker.mjs";

test("every path and query is fetched from the same place on Pages", () => {
  assert.equal(upstream(new URL("https://ui.ouroboros.bot/")), `${pages}/`);
  assert.equal(upstream(new URL("https://ui.ouroboros.bot/docs/dialog/?a=1&b=2")), `${pages}/docs/dialog/?a=1&b=2`);
  assert.equal(upstream(new URL("https://ui.ouroboros.bot/r/registry.json")), `${pages}/r/registry.json`);
});

test("a Pages redirect comes back on ui.ouroboros.bot", () => {
  assert.equal(rehome(`${pages}/docs`), `${host}/docs`);
  assert.equal(rehome("https://ourostack.github.io/ouro-ui/docs/?x=1"), `${host}/docs/?x=1`);
  assert.equal(rehome("https://ourostack.github.io/ouro-ui"), `${host}/`);
  assert.equal(rehome("/ouro-ui/storybook/"), `${host}/storybook/`);
});

test("a redirect elsewhere is left alone", () => {
  assert.equal(rehome("https://github.com/ourostack/ouro-ui"), "https://github.com/ourostack/ouro-ui");
  assert.equal(rehome(null), null);
});

test("the Worker proxies, keeps the status and rewrites Location", async (t) => {
  const seen = [];
  t.mock.method(globalThis, "fetch", async (address, init) => {
    seen.push([address, init.redirect]);
    return new Response(null, { status: 301, headers: { location: `${pages}/docs/` } });
  });
  const response = await worker.fetch(new Request("https://ui.ouroboros.bot/docs?q=1"));
  assert.deepEqual(seen, [[`${pages}/docs?q=1`, "manual"]]);
  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), `${host}/docs/`);
  assert.equal(response.headers.get("x-ouro-ui-host"), "ui.ouroboros.bot");
});

test("plain HTTP gets a 301 to the same path and query on https, with HSTS, and Pages is never asked", async (t) => {
  const fetched = t.mock.method(globalThis, "fetch", async () => new Response("pages"));
  for (const from of ["http://ui.ouroboros.bot/", "http://ui.ouroboros.bot/docs/dialog/?a=1&b=2", "http://ui.ouroboros.bot/r/registry.json"]) {
    const url = new URL(from);
    const response = await worker.fetch(new Request(from));
    assert.equal(response.status, 301, from);
    assert.equal(response.headers.get("location"), `${host}${url.pathname}${url.search}`, from);
    assert.equal(response.headers.get("strict-transport-security"), hsts, from);
  }
  assert.equal(fetched.mock.callCount(), 0);
  assert.equal(secure(new URL("https://ui.ouroboros.bot/docs/?x=1")), null);
});

test("every HTTPS response carries HSTS, whether or not Pages sent it", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("page", { headers: { "content-type": "text/html" } }));
  const bare = await worker.fetch(new Request("https://ui.ouroboros.bot/"));
  assert.equal(bare.status, 200);
  assert.equal(bare.headers.get("strict-transport-security"), hsts);

  t.mock.method(globalThis, "fetch", async () => new Response("page", { headers: { "strict-transport-security": "max-age=600" } }));
  const sent = await worker.fetch(new Request("https://ui.ouroboros.bot/"));
  assert.equal(sent.headers.get("strict-transport-security"), "max-age=600");
});
