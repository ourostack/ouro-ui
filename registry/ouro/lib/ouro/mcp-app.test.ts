import { afterEach, describe, expect, it, vi } from "vitest";
import { connectMcpApp, MCP_APPS_PROTOCOL, McpAppError, windowHostLink, type McpAppHandlers, type McpAppHostLink, type McpAppMessage } from "@/registry/ouro/lib/ouro/mcp-app";

// Runs in Chromium and WebKit.

/** A link whose host is the test: `sent` is what the view posted, `deliver` hands it the host's next message. */
function testLink() {
  const sent: McpAppMessage[] = [];
  let listener: ((message: unknown) => void) | undefined;
  const stop = vi.fn(() => {
    listener = undefined;
  });
  const link: McpAppHostLink = {
    post: (message) => sent.push(message),
    listen: (onMessage) => {
      listener = onMessage;
      return stop;
    },
  };
  return { link, sent, stop, deliver: (message: unknown) => listener?.(message) };
}

const handlers = (overrides: Partial<McpAppHandlers> = {}): McpAppHandlers => ({ onNotification: vi.fn(), onRequest: vi.fn(() => ({})), ...overrides });

const frames: HTMLIFrameElement[] = [];
afterEach(() => {
  for (const frame of frames.splice(0)) frame.remove();
});

describe("windowHostLink", () => {
  it("posts to the host window and hears only that window's messages, until it stops", async () => {
    const frame = document.createElement("iframe");
    // The host echoes what it gets back to the window that framed it.
    frame.srcdoc = `<script>addEventListener("message", (e) => parent.postMessage({ from: "host", got: e.data }, "*"));</script>`;
    const loaded = new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));
    document.body.append(frame);
    frames.push(frame);
    await loaded;
    const heard: unknown[] = [];
    const link = windowHostLink(frame.contentWindow!);
    const stop = link.listen((message) => heard.push(message));
    // A message from another window, the page itself, is not the host's.
    window.postMessage({ from: "page" }, "*");
    link.post({ jsonrpc: "2.0", method: "ping" });
    await vi.waitFor(() => expect(heard).toEqual([{ from: "host", got: { jsonrpc: "2.0", method: "ping" } }]));
    stop();
    const after = new Promise((resolve) => window.addEventListener("message", resolve, { once: true }));
    link.post({ jsonrpc: "2.0", method: "ping" });
    await after;
    expect(heard).toHaveLength(1);
  });

  it("defaults to the window that framed this one", () => {
    const post = vi.spyOn(window.parent, "postMessage").mockImplementation(() => {});
    windowHostLink().post({ jsonrpc: "2.0", method: "ui/notifications/initialized" });
    expect(post).toHaveBeenCalledWith({ jsonrpc: "2.0", method: "ui/notifications/initialized" }, "*");
    post.mockRestore();
  });
});

describe("connectMcpApp", () => {
  it("names the MCP Apps version it speaks", () => {
    expect(MCP_APPS_PROTOCOL).toBe("2026-01-26");
  });

  it("numbers requests and settles each with its own response", async () => {
    const { link, sent, deliver } = testLink();
    const host = connectMcpApp(link, handlers());
    const first = host.request("ui/initialize", { protocolVersion: MCP_APPS_PROTOCOL });
    const second = host.request("ping");
    expect(sent).toEqual([
      { jsonrpc: "2.0", id: 1, method: "ui/initialize", params: { protocolVersion: MCP_APPS_PROTOCOL } },
      { jsonrpc: "2.0", id: 2, method: "ping", params: {} },
    ]);
    deliver({ jsonrpc: "2.0", id: 2, result: { pong: true } });
    deliver({ jsonrpc: "2.0", id: 1, result: { hostInfo: { name: "host" } } });
    await expect(second).resolves.toEqual({ pong: true });
    await expect(first).resolves.toEqual({ hostInfo: { name: "host" } });
  });

  it("gives an empty result when a response's result is not an object", async () => {
    const { link, deliver } = testLink();
    const host = connectMcpApp(link, handlers());
    const pending = host.request("ui/open-link", { url: "https://example.com" });
    deliver({ jsonrpc: "2.0", id: 1, result: "ok" });
    await expect(pending).resolves.toEqual({});
  });

  it("rejects a request with the host's error, its code and data", async () => {
    const { link, deliver } = testLink();
    const host = connectMcpApp(link, handlers());
    const pending = host.request("tools/call", { name: "share_recipe" });
    deliver({ jsonrpc: "2.0", id: 1, error: { code: -32000, message: "Denied by the person", data: { why: "no" } } });
    const error = (await pending.catch((e: unknown) => e)) as McpAppError;
    expect(error).toBeInstanceOf(McpAppError);
    expect(error.name).toBe("McpAppError");
    expect(error.message).toBe("Denied by the person");
    expect(error.code).toBe(-32000);
    expect(error.data).toEqual({ why: "no" });
  });

  it("ignores what isn't a JSON-RPC 2.0 message, and responses it isn't waiting for", async () => {
    const { link, sent, deliver } = testLink();
    const on = handlers();
    const host = connectMcpApp(link, on);
    const pending = host.request("ping");
    for (const message of [null, "text", [1], { id: 1, result: {} }, { jsonrpc: "1.0", id: 1, result: {} }, { jsonrpc: "2.0", id: 9, result: {} }, { jsonrpc: "2.0", result: {} }]) deliver(message);
    expect(on.onNotification).not.toHaveBeenCalled();
    expect(on.onRequest).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
    deliver({ jsonrpc: "2.0", id: 1, result: { ok: 1 } });
    await expect(pending).resolves.toEqual({ ok: 1 });
    // Answered once: a second response with the same id finds nothing waiting.
    deliver({ jsonrpc: "2.0", id: 1, error: { code: 1, message: "late" } });
  });

  it("hands notifications to the view, with empty params when they are not an object", () => {
    const { link, deliver } = testLink();
    const on = handlers();
    connectMcpApp(link, on);
    deliver({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { content: [] } });
    deliver({ jsonrpc: "2.0", method: "ui/notifications/tool-cancelled", params: [1] });
    expect(on.onNotification).toHaveBeenNthCalledWith(1, "ui/notifications/tool-result", { content: [] });
    expect(on.onNotification).toHaveBeenNthCalledWith(2, "ui/notifications/tool-cancelled", {});
  });

  it("answers the host's requests with the view's result, or {} when it gives none", () => {
    const { link, sent, deliver } = testLink();
    const onRequest = vi.fn((method: string) => (method === "ping" ? undefined : { done: true }));
    connectMcpApp(link, handlers({ onRequest }));
    deliver({ jsonrpc: "2.0", id: "h1", method: "ui/resource-teardown", params: { reason: "closed" } });
    deliver({ jsonrpc: "2.0", id: 0, method: "ping" });
    expect(onRequest).toHaveBeenNthCalledWith(1, "ui/resource-teardown", { reason: "closed" });
    expect(onRequest).toHaveBeenNthCalledWith(2, "ping", {});
    expect(sent).toEqual([
      { jsonrpc: "2.0", id: "h1", result: { done: true } },
      { jsonrpc: "2.0", id: 0, result: {} },
    ]);
  });

  it("answers with the view's McpAppError, keeping its data, or an internal error for anything else it throws", () => {
    const { link, sent, deliver } = testLink();
    const onRequest = (method: string): object => {
      if (method === "with-data") throw new McpAppError(-32602, "No such function", { code: "INVALID_FUNCTION_CALL" });
      if (method === "without-data") throw new McpAppError(-32601, "No such method");
      throw new Error("broken");
    };
    connectMcpApp(link, handlers({ onRequest }));
    deliver({ jsonrpc: "2.0", id: 1, method: "with-data" });
    deliver({ jsonrpc: "2.0", id: 2, method: "without-data" });
    deliver({ jsonrpc: "2.0", id: 3, method: "other" });
    expect(sent).toEqual([
      { jsonrpc: "2.0", id: 1, error: { code: -32602, message: "No such function", data: { code: "INVALID_FUNCTION_CALL" } } },
      { jsonrpc: "2.0", id: 2, error: { code: -32601, message: "No such method" } },
      { jsonrpc: "2.0", id: 3, error: { code: -32603, message: "broken" } },
    ]);
    expect(Object.keys(sent[1]!.error!)).toEqual(["code", "message"]);
  });

  it("sends notifications, with empty params by default", () => {
    const { link, sent } = testLink();
    const host = connectMcpApp(link, handlers());
    host.notify("ui/notifications/initialized");
    host.notify("ui/notifications/size-changed", { width: 390, height: 900 });
    expect(sent).toEqual([
      { jsonrpc: "2.0", method: "ui/notifications/initialized", params: {} },
      { jsonrpc: "2.0", method: "ui/notifications/size-changed", params: { width: 390, height: 900 } },
    ]);
  });

  it("on close, stops listening and rejects the requests still waiting", async () => {
    const { link, stop, deliver } = testLink();
    const on = handlers();
    const host = connectMcpApp(link, on);
    const pending = host.request("tools/call");
    host.close();
    expect(stop).toHaveBeenCalledOnce();
    const error = (await pending.catch((e: unknown) => e)) as McpAppError;
    expect(error).toBeInstanceOf(McpAppError);
    expect(error.code).toBe(-32000);
    expect(error.message).toBe("The view closed its connection to the host.");
    deliver({ jsonrpc: "2.0", method: "ui/notifications/tool-result" });
    expect(on.onNotification).not.toHaveBeenCalled();
  });
});
