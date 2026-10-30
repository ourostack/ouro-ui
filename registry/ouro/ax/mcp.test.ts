import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createMcpHandler, mcpTools, serveMcp } from "./mcp.ts";
import { exampleCli as cli, resetRooms } from "./example-cli.ts";

const handle = createMcpHandler({ cli, version: "1.0.0", maxChars: 300 });
const call = async (name: string, args: unknown) => ((await handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } })) as { result: { content: { text: string }[]; isError: boolean; structuredContent?: { error?: { code: string; fix: string } } } }).result;
beforeEach(resetRooms);

test("initialize, ping and tools/list: one tool per command, schema and effect annotations from the definition", async () => {
  const init = (await handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } })) as { result: { protocolVersion: string; serverInfo: { name: string } } };
  assert.equal(init.result.protocolVersion, "2025-03-26");
  assert.equal(init.result.serverInfo.name, "notes");
  assert.deepEqual(await handle({ jsonrpc: "2.0", id: 2, method: "ping" }), { jsonrpc: "2.0", id: 2, result: {} });
  assert.equal(await handle({ jsonrpc: "2.0", method: "notifications/initialized" }), null);
  const tools = mcpTools({ cli });
  assert.deepEqual(tools.map((t) => t.name), ["rooms", "note", "post"]);
  const post = tools.find((t) => t.name === "post")!;
  assert.deepEqual(post.annotations, { title: "notes post", readOnlyHint: false, destructiveHint: true, openWorldHint: true });
  assert.match(post.description, /call it only when a human asked you to, with "why"/);
  assert.deepEqual(post.inputSchema.required, ["room", "text", "why"]);
});

test("a call runs the definition; a bad call is refused before it runs, with the arguments to send instead", async () => {
  const ok = await call("post", { room: "abc123", text: "Running late", why: "Sam asked" });
  assert.equal(ok.isError, false);
  assert.match(ok.content[0]!.text, /Posted to "Design sync"/);
  const bad = await call("post", { room: "abc123", text: "hi" });
  assert.equal(bad.isError, true);
  assert.equal(bad.structuredContent?.error?.code, "needs-why");
  assert.match(bad.content[0]!.text, /^notes: post: .* Fix: \{"room":"abc123","text":"hi","why":"<who asked you, and what they said>"\}\.$/);
  const thrown = await call("note", { room: "zzz", text: "x" });
  assert.equal(thrown.structuredContent?.error?.fix, "notes rooms");
  const unknown = await call("rooms_list", {});
  assert.equal(unknown.structuredContent?.error?.fix, "rooms");
});

test("results are cut to maxChars; unknown methods and bad messages are JSON-RPC errors", async () => {
  const h = createMcpHandler({ cli, maxChars: 120, call: async () => ({ ok: true, data: { big: "x".repeat(1000) } }) });
  const r = (await h({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "rooms", arguments: {} } })) as { result: { content: { text: string }[]; structuredContent?: unknown } };
  assert.ok(r.result.content[0]!.text.length <= 120);
  assert.equal(r.result.structuredContent, undefined);
  assert.equal(((await handle({ jsonrpc: "2.0", id: 3, method: "resources/list" })) as { error: { code: number } }).error.code, -32601);
  assert.equal(((await handle({ id: 4 })) as { error: { code: number } }).error.code, -32600);
});

test("tool calls run one at a time, in order, unless concurrent", async () => {
  const order: string[] = [];
  const slow = (concurrent: boolean) =>
    createMcpHandler({ cli, concurrent, call: async (cmd) => { order.push(`start ${cmd.name}`); await new Promise((r) => setTimeout(r, cmd.name === "rooms" ? 20 : 0)); order.push(`end ${cmd.name}`); return { ok: true, data: {} }; } });
  const h = slow(false);
  await Promise.all([h({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "rooms", arguments: {} } }), h({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "note", arguments: { room: "abc123", text: "x" } } })]);
  assert.deepEqual(order, ["start rooms", "end rooms", "start note", "end note"]);
  order.length = 0;
  const c = slow(true);
  await Promise.all([c({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "rooms", arguments: {} } }), c({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "note", arguments: { room: "abc123", text: "x" } } })]);
  assert.deepEqual(order, ["start rooms", "start note", "end note", "end rooms"]);
});

test("serveMcp answers line by line over a stream", async () => {
  let out = "";
  const lines = [JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) + "\n", "not json\n", JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "rooms", arguments: {} } })];
  await serveMcp({ cli, input: lines, output: { write: (s) => (out += s) } });
  const replies = out.trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(replies.length, 3);
  assert.ok(replies.some((r) => r.error?.code === -32700));
  assert.ok(replies.some((r) => r.id === 2 && /Design sync/.test(r.result.content[0].text)));
});
