import assert from "node:assert/strict";
import { test } from "node:test";
import { ReadableStream } from "node:stream/web";
import { TextEncoder } from "node:util";
import { createElement, lazy, Suspense } from "react";
import { renderHtml } from "../src/render-html.ts";

const h = createElement;
const boundary = (child) => h(Suspense, { fallback: h("p", null, "Loading example") }, child);

test("static HTML contains resolved native controls, not a Suspense loading shell", async () => {
  const Demo = lazy(async () => ({ default: () => h("button", { type: "button" }, "Save to cookbook") }));
  const html = await renderHtml(boundary(h(Demo)));
  assert.match(html, /<button type="button">Save to cookbook<\/button>/);
  assert.doesNotMatch(html, /Loading example|data-msg=/);
});

test("a resolved boundary after a large real markup prefix remains visible without reveal scripts", async () => {
  const navigation = Array.from({ length: 75 }, (_, index) =>
    h("a", { key: index, href: `#section-${index}`, className: "navigation-link ".repeat(25) }, `Section ${index}`),
  );
  const html = await renderHtml(h("main", null, h("nav", null, navigation), boundary(
    h("button", { className: "real-control-styles ".repeat(50) }, "Ready example"),
  )));
  assert.match(html, /<button [^>]+>Ready example<\/button>/);
  assert.doesNotMatch(html, /Loading example|<div hidden id="S:|\$RC\(/);
});

test("a rejected lazy demo fails the prerender instead of returning client-recovery HTML", async (t) => {
  t.mock.method(console, "error", () => {});
  const failure = new Error("demo import failed");
  const Demo = lazy(() => Promise.reject(failure));
  await assert.rejects(async () => renderHtml(boundary(h(Demo))), (error) => error === failure);
});

test("a component throwing after suspension fails the prerender", async (t) => {
  t.mock.method(console, "error", () => {});
  const failure = new Error("resolved demo render failed");
  const Demo = lazy(async () => ({ default: () => { throw failure; } }));
  await assert.rejects(async () => renderHtml(boundary(h(Demo))), (error) => error === failure);
});

test("a failed boundary aborts another genuinely pending boundary", async (t) => {
  t.mock.method(console, "error", () => {});
  const failure = new Error("one demo failed");
  const Broken = lazy(() => Promise.reject(failure));
  const Pending = lazy(() => new Promise(() => {}));
  await assert.rejects(
    async () => renderHtml(h("main", null, boundary(h(Pending)), boundary(h(Broken)))),
    (error) => error === failure,
  );
});

for (const failure of [new Error("shell render failed"), 0, undefined]) {
  test(`shell failure is preserved even when falsy: ${String(failure)}`, async (t) => {
    t.mock.method(console, "error", () => {});
    function Broken() { throw failure; }
    await assert.rejects(async () => renderHtml(h(Broken)), (error) => error === failure);
  });
}

test("an error reported before stream creation resolves aborts once and cancels the unread stream", async (t) => {
  const diagnostic = t.mock.method(console, "error", () => {});
  const failure = 0;
  const subsequent = new Error("abort callback failure");
  let cancelled = 0;
  const stream = new ReadableStream({ cancel(reason) { assert.equal(reason, failure); cancelled++; } });
  const html = renderHtml(h("p"), async (_node, options) => {
    options.signal.addEventListener("abort", () => options.onError(subsequent));
    options.onError(failure);
    assert.equal(options.signal.aborted, true);
    assert.equal(options.signal.reason, failure);
    return { prelude: stream, postponed: null };
  });
  await assert.rejects(html, (error) => error === failure);
  assert.equal(diagnostic.mock.callCount(), 1);
  assert.equal(diagnostic.mock.calls[0].arguments[1], failure);
  assert.equal(cancelled, 1);
});

test("reported render and cancellation failures retain the original cause in an AggregateError", async (t) => {
  t.mock.method(console, "error", () => {});
  const failure = new Error("prerender failed");
  const cleanup = new Error("stream cancel failed");
  const stream = new ReadableStream({ cancel() { throw cleanup; } });
  const html = renderHtml(h("p"), async (_node, options) => {
    options.onError(failure);
    return { prelude: stream, postponed: null };
  });
  await assert.rejects(html, (error) =>
    error instanceof AggregateError && error.cause === failure &&
    error.errors[0] === failure && error.errors[1] === cleanup,
  );
});

test("body-read rejection preserves its cause without cancelling a locked stream", async (t) => {
  t.mock.method(console, "error", () => {});
  const failure = new Error("body read failed");
  let cancelled = 0;
  const stream = new ReadableStream({
    pull(controller) { controller.error(failure); },
    cancel() { cancelled++; },
  });
  await assert.rejects(renderHtml(h("p"), async () => ({ prelude: stream, postponed: null })), (error) => error === failure);
  assert.equal(stream.locked, true);
  assert.equal(cancelled, 0);
});

test("a falsy error reported during successful body collection still rejects HTML", async (t) => {
  t.mock.method(console, "error", () => {});
  let options;
  const stream = new ReadableStream({
    pull(controller) {
      options.onError(undefined);
      controller.enqueue(new TextEncoder().encode("<p>Not successful HTML</p>"));
      controller.close();
    },
  });
  await assert.rejects(renderHtml(h("p"), async (_node, given) => {
    options = given;
    return { prelude: stream, postponed: null };
  }), (error) => error === undefined);
});

test("diagnostic failure cannot replace the original rendering cause", async (t) => {
  const failure = new Error("render failed");
  const diagnostic = new Error("diagnostic sink failed");
  t.mock.method(console, "error", () => { throw diagnostic; });
  function Broken() { throw failure; }
  await assert.rejects(renderHtml(h(Broken)), (error) =>
    error instanceof AggregateError && error.cause === failure &&
    error.errors[0] === failure && error.errors[1] === diagnostic,
  );
});

test("an unfinished static result fails closed and cancels its obtained unread prelude", async (t) => {
  t.mock.method(console, "error", () => {});
  let cancelled = 0;
  const stream = new ReadableStream({ cancel() { cancelled++; } });
  await assert.rejects(
    renderHtml(h("p"), async () => ({ prelude: stream, postponed: {} })),
    /Prerender returned unfinished content/,
  );
  assert.equal(cancelled, 1);
});

test("native prerender Promise rejection is preserved", async (t) => {
  t.mock.method(console, "error", () => {});
  const failure = new Error("prerender creation rejected");
  await assert.rejects(renderHtml(h("p"), () => Promise.reject(failure)), (error) => error === failure);
});

test("a reported browser-only bailout rejects recovery HTML and cancels its prelude", async (t) => {
  t.mock.method(console, "error", () => {});
  const failure = new Error("browser-only example");
  let cancelled = 0;
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode("<p>Client-only fallback</p>")); },
    pull(controller) { controller.close(); },
    cancel() { cancelled++; },
  });
  await assert.rejects(renderHtml(h("p"), async (_node, options) => {
    options.onBrowserBailout?.(failure, { componentStack: "Browser-only fixture" });
    return { prelude: stream, postponed: null };
  }), (error) => error === failure);
  assert.equal(cancelled, 1);
});
