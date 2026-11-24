import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createMcpHandler as createRawHandler, mcpTools, PROTOCOL_VERSIONS, serveMcp } from "#ouro-ax/mcp.ts";
import { AxError } from "#ouro-ax/problem.ts";
import { defineCli, defineCommand } from "#ouro-ax/ax-command.ts";
import { exampleCli as cli, resetRooms, rooms } from "#ouro-ax/example-cli.ts";
import { outcome } from "#ouro-ax/outcome.ts";
import { wait } from "#ouro-ax/wait.ts";

const MODERN = { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "test", version: "1" }, "io.modelcontextprotocol/clientCapabilities": {} };
// A 2026-07-28 client: its requests carry the version and capabilities in _meta, and there is no initialize.
const createMcpHandler = (options: Parameters<typeof createRawHandler>[0]) => {
  const h = createRawHandler(options);
  return (m: unknown) => {
    const r = m as { id?: unknown; method?: string; params?: object };
    return h(r && typeof r === "object" && r.id !== undefined && r.method !== "initialize" ? { ...r, params: { ...r.params, _meta: MODERN } } : m);
  };
};
const handle = createMcpHandler({ cli, version: "1.0.0", maxChars: 300 });
const call = async (name: string, args: unknown) => ((await handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } })) as { result: { content: { text: string }[]; isError: boolean; structuredContent?: { error?: { code: string; fix: string } } } }).result;
beforeEach(resetRooms);

test("a word that only disambiguates the CLI's longer form is left out of the MCP schema, with every other property described", () => {
  const t = defineCli({
    name: "t",
    about: ["t"],
    commands: [
      defineCommand({
        name: "react",
        summary: "React to a message.",
        effect: "private",
        readOnly: true,
        args: [
          { name: "message", description: "The message to react to.", required: true },
          { name: "emoji", description: "The emoji to react with.", required: true },
          { name: "third", description: "A fourth CLI word some installs still send after the emoji; it means nothing on its own.", cliOnly: true, required: true },
        ],
      }),
    ],
  });
  const tool = mcpTools({ cli: t }).find((x) => x.name === "react")!;
  assert.deepEqual(Object.keys(tool.inputSchema.properties!), ["message", "emoji"]);
  assert.deepEqual(tool.inputSchema.required, ["message", "emoji"]);
  for (const prop of Object.values(tool.inputSchema.properties!)) assert.ok(prop.description);
});

test("a command whose CLI streams forever is left out of the MCP tool list", () => {
  const t = defineCli({
    name: "t",
    about: ["t"],
    commands: [
      defineCommand({ name: "tail", summary: "Streams new log lines as they arrive, forever.", effect: "private", readOnly: true, streams: true }),
      defineCommand({ name: "rooms", summary: "R.", effect: "private", readOnly: true }),
    ],
  });
  assert.deepEqual(
    mcpTools({ cli: t }).map((x) => x.name),
    ["rooms"],
  );
});

test("initialize, ping and tools/list: one tool per command, schema and effect annotations from the definition", async () => {
  const older = createRawHandler({ cli, version: "1.0.0" });
  const init = (await older({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } })) as { result: { protocolVersion: string; serverInfo: { name: string } } };
  assert.equal(init.result.protocolVersion, "2025-03-26");
  assert.equal(init.result.serverInfo.name, "notes");
  assert.deepEqual(await older({ jsonrpc: "2.0", id: 2, method: "ping" }), { jsonrpc: "2.0", id: 2, result: {} });
  assert.equal(await older({ jsonrpc: "2.0", method: "notifications/initialized" }), null);
  const tools = mcpTools({ cli });
  assert.deepEqual(tools.map((t) => t.name), ["rooms", "note", "post", "watch"]);
  const post = tools.find((t) => t.name === "post")!;
  assert.deepEqual(post.annotations, { title: "notes post", readOnlyHint: false, destructiveHint: true, openWorldHint: true });
  assert.match(post.description, /call it only when a human asked you to, with "why"/);
  assert.deepEqual(post.inputSchema.required, ["room", "text", "why"]);
});

test("a call runs the definition; a bad call is refused before it runs, with the arguments to send instead", async () => {
  const ok = await call("post", { room: "abc123", text: "Running late", why: "Jo asked" });
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

test("an outcome comes back as its text and data; a refused one is a tool error; dry-run calls the plan", async () => {
  const planned = await call("post", { room: "abc123", text: "hi", why: "Jo asked", "dry-run": true });
  assert.equal(planned.isError, false);
  assert.equal((planned.structuredContent as { state?: string }).state, "planned");
  assert.equal(rooms["abc123"]!.messages.length, 0);
  const t = defineCli({
    name: "t",
    about: ["t"],
    commands: [
      defineCommand({ name: "send", summary: "S.", effect: "others", run: () => outcome({ action: "send", state: "refused", summary: "No.", error: { code: "off", exit: 2, thing: "send", problem: "writes are off", fix: null } }) }),
      defineCommand({ name: "wait", summary: "W.", effect: "private", run: () => wait({ for: "a reply", state: "satisfied", since: "t", events: [{ cursor: "1", type: "m", at: "t", by: "Riley", target: null, summary: "Lakeside" }] }) }),
      defineCommand({ name: "docs", summary: "D.", effect: "private" }),
    ],
  });
  const h = createMcpHandler({ cli: t });
  const tc = async (name: string, args: unknown) => ((await h({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } })) as { result: { content: { text: string }[]; isError: boolean } }).result;
  const refused = await tc("send", { why: "x" });
  assert.equal(refused.isError, true);
  assert.equal(refused.content[0]!.text, "t: send: writes are off.");
  assert.equal((await tc("send", { why: "x", "dry-run": true })).content[0]!.text, "t: send dry-run: this tool has no preview, so nothing was done.");
  assert.match((await tc("wait", {})).content[0]!.text, /^Happened: a reply\.\nt Riley: Lakeside/);
  assert.match((await tc("docs", {})).content[0]!.text, /has no run\(\)/);
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
  const lines = [JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: MODERN } }) + "\n", "not json\n", JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "rooms", arguments: {}, _meta: MODERN } })];
  await serveMcp({ cli, input: lines, output: { write: (s) => (out += s) } });
  const replies = out.trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(replies.length, 3);
  assert.ok(replies.some((r) => r.error?.code === -32700));
  assert.ok(replies.some((r) => r.id === 2 && /Design sync/.test(r.result.content[0].text)));
});

test("odd messages and calls: no params, no version, a name that is not text, a call that throws, blank lines and bytes", async () => {
  const thrown = createMcpHandler({ cli, call: async (cmd) => { if (cmd.name === "rooms") throw new AxError({ code: "down", exit: 3, thing: "rooms", problem: "the service is down", fix: null }); throw "odd"; } });
  const answer = async (h: typeof thrown, message: unknown) => (await h(message)) as { id?: unknown; result?: { content: { text: string }[]; isError: boolean; protocolVersion?: string; serverInfo?: { version: string } }; error?: { code: number } };
  assert.equal((await answer(thrown, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "rooms" } })).result?.content[0]!.text, "notes: rooms: the service is down.");
  assert.equal((await answer(thrown, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "note", arguments: { room: "abc123", text: "x" } } })).result?.content[0]!.text, "notes: note: odd.");
  const init = await answer(thrown, { jsonrpc: "2.0", id: 2, method: "initialize" });
  assert.equal(init.result?.protocolVersion, "2025-11-25");
  assert.equal(init.result?.serverInfo?.version, "0.0.0");
  assert.match((await answer(thrown, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: 3 } })).result?.content[0]!.text ?? "", /tools\/call: there is no tool ""\. Fix: rooms, note, post, watch\./);
  assert.deepEqual(await thrown(null), { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request: expected a JSON-RPC 2.0 message with a method." } });
  assert.equal(mcpTools({ cli: defineCli({ name: "p", about: ["p"], commands: [defineCommand({ name: "go", summary: "Go.", effect: "private" })] }) })[0]!.description, "Go. Only you see these.");
  let out = "";
  await serveMcp({ cli, input: ["\n", new TextEncoder().encode(`${JSON.stringify({ jsonrpc: "2.0", id: 9, method: "ping" })}\n`)], output: { write: (s) => (out += s) } });
  assert.deepEqual(JSON.parse(out.trim()), { jsonrpc: "2.0", id: 9, result: {} });
});

test("a tool's run() reads no stdin over MCP, and an Error it throws is the tool error", async () => {
  const t = defineCli({ name: "t", about: ["t"], commands: [defineCommand({ name: "read", summary: "R.", effect: "private", run: async (_, ctx) => ({ stdin: await ctx.stdin() }) }), defineCommand({ name: "boom", summary: "B.", effect: "private", run: () => { throw new Error("disk full"); } })] });
  const h = createMcpHandler({ cli: t });
  const text = async (name: string) => ((await h({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: {} } })) as { result: { content: { text: string }[] } }).result.content[0]!.text;
  assert.equal(await text("read"), '{"stdin":""}');
  assert.equal(await text("boom"), "t: boom: disk full.");
});

test("a self-scoped tool refuses another agent's item as a tool error, before run()", async () => {
  const ran: string[] = [];
  const t = defineCli({
    name: "call",
    about: ["call: the person's call."],
    commands: [
      defineCommand({
        name: "unfollow", summary: "Stop your own listening.", effect: "private", args: [{ name: "listener", description: "The listening agent: you.", required: true }],
        self: { owner: (i) => String(i["listener"]), instead: "unfollow <agent> --agent <agent>" },
        run: (i) => (ran.push(String(i["listener"])), "Stopped."),
      }),
    ],
  });
  for (const h of [createMcpHandler({ cli: t }), createMcpHandler({ cli: t, call: async (cmd, input) => ({ ok: true, data: await cmd.run!(input, { stdin: async () => "", json: true }) }) })]) {
    const answer = async (args: unknown) => ((await h({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "unfollow", arguments: args } })) as { result: { content: { text: string }[]; isError: boolean } }).result;
    const refused = await answer({ listener: "research-agent", agent: "inbox-agent" });
    assert.deepEqual(refused.isError, true);
    assert.equal(refused.content[0]!.text, "call: unfollow: that one is research-agent's, and you are inbox-agent; only research-agent or the person may do it. Do it on your own instead. Fix: call unfollow inbox-agent --agent inbox-agent.");
    assert.equal((await answer({ listener: "inbox-agent", agent: "inbox-agent" })).isError, false);
  }
  assert.deepEqual(mcpTools({ cli: t })[0]!.inputSchema.required, ["listener", "agent"]);
  assert.deepEqual(ran, ["inbox-agent", "inbox-agent"]);
});

test("a tool with one command offers one MCP tool, named after the tool, with the command's input schema", async () => {
  const images = defineCli({
    name: "ouro-images",
    about: ["Writes the sizes of a folder of pictures."],
    command: defineCommand({
      name: "images",
      summary: "Write each picture at the sizes the site uses.",
      effect: "private",
      args: [{ name: "folder", description: "The folder of pictures.", required: true }],
      flags: { out: { type: "string", description: "Where the sizes go." } },
      run: (i) => ({ folder: i["folder"], out: i["out"] ?? "." }),
    }),
  });
  const single = createMcpHandler({ cli: images });
  const listed = (await single({ jsonrpc: "2.0", id: 1, method: "tools/list" })) as { result: { tools: { name: string; title: string; inputSchema: { required: string[] } }[] } };
  assert.deepEqual(listed.result.tools.map((t) => [t.name, t.title]), [["ouro-images", "ouro-images"]]);
  assert.deepEqual(listed.result.tools[0]!.inputSchema.required, ["folder"]);
  const ran = (await single({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "ouro-images", arguments: { folder: "site/showcase" } } })) as { result: { isError: boolean; structuredContent: unknown } };
  assert.deepEqual([ran.result.isError, ran.result.structuredContent], [false, { folder: "site/showcase", out: "." }]);
  const wrong = (await single({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "images", arguments: {} } })) as { result: { isError: boolean; structuredContent: { error: { fix: string } } } };
  assert.deepEqual([wrong.result.isError, wrong.result.structuredContent.error.fix], [true, "ouro-images"]);
});

test("a default command is the tool itself, named after it, beside the tools its commands name", () => {
  const tool = defineCli({
    name: "ouro-check",
    about: [],
    command: defineCommand({ name: "check", summary: "Checks.", effect: "private", args: [{ name: "target", description: "T.", rest: "list", required: true }], run: () => null }),
    commands: [defineCommand({ name: "draft set", summary: "Sets.", effect: "private", run: () => null })],
  });
  assert.deepEqual(
    mcpTools({ cli: tool }).map((t) => [t.name, t.title]),
    [
      ["ouro-check", "ouro-check"],
      ["draft_set", "ouro-check draft set"],
    ],
  );
});

type Answer = { id?: unknown; result?: Record<string, unknown>; error?: { code: number; message: string; data?: { supported: string[]; requested: unknown } } };
const ask = async (h: (m: unknown) => Promise<unknown>, method: string, params?: unknown, id: number = 1) => (await h({ jsonrpc: "2.0", id, method, params })) as Answer;
const SERVER_INFO = "io.modelcontextprotocol/serverInfo";

test("2026-07-28: server/discover names the versions, the capabilities and the server, and the results carry resultType, a cache hint and the server's identity", async () => {
  const h = createRawHandler({ cli, version: "1.2.3" });
  const discovered = await ask(h, "server/discover", { _meta: MODERN });
  assert.deepEqual(discovered.result?.["supportedVersions"], ["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"]);
  assert.deepEqual(discovered.result?.["supportedVersions"], [...PROTOCOL_VERSIONS]);
  assert.deepEqual(discovered.result?.["capabilities"], { tools: {} });
  assert.deepEqual([discovered.result?.["resultType"], discovered.result?.["ttlMs"], discovered.result?.["cacheScope"]], ["complete", 3_600_000, "public"]);
  assert.deepEqual(discovered.result?.["_meta"], { [SERVER_INFO]: { name: "notes", version: "1.2.3" } });
  assert.match(String(discovered.result?.["instructions"]), /touch only the person's own space/);
  const listed = await ask(h, "tools/list", { _meta: MODERN });
  assert.deepEqual([listed.result?.["resultType"], listed.result?.["ttlMs"], listed.result?.["cacheScope"]], ["complete", 3_600_000, "public"]);
  assert.deepEqual(listed.result?.["_meta"], { [SERVER_INFO]: { name: "notes", version: "1.2.3" } });
  const called = await ask(h, "tools/call", { name: "rooms", arguments: {}, _meta: MODERN });
  assert.deepEqual([called.result?.["resultType"], called.result?.["isError"], called.result?.["_meta"]], ["complete", false, { [SERVER_INFO]: { name: "notes", version: "1.2.3" } }]);
  const refused = await ask(h, "tools/call", { name: "post", arguments: { room: "abc123", text: "hi" }, _meta: MODERN });
  assert.deepEqual([refused.result?.["resultType"], refused.result?.["isError"]], ["complete", true]);
  assert.equal((await ask(h, "server/discover", { _meta: { ...MODERN, "io.modelcontextprotocol/clientInfo": undefined } })).result?.["resultType"], "complete");
});

test("2026-07-28: tools are listed in the same order every time, the order the commands are declared", async () => {
  const h = createRawHandler({ cli });
  const names = async () => ((await ask(h, "tools/list", { _meta: MODERN })).result?.["tools"] as { name: string }[]).map((t) => t.name);
  assert.deepEqual(await names(), ["rooms", "note", "post", "watch"]);
  assert.deepEqual(await names(), await names());
});

test("2026-07-28: a request missing _meta, its version or its capabilities is -32602, and one naming another version is -32022 with the versions and the one asked for", async () => {
  const h = createRawHandler({ cli });
  const bad = async (params: unknown, method = "tools/list") => (await ask(h, method, params)).error!;
  for (const params of [undefined, {}, { _meta: "x" }, { _meta: {} }, { _meta: { "io.modelcontextprotocol/clientCapabilities": {} } }]) {
    const e = await bad(params);
    assert.equal(e.code, -32602);
    assert.match(e.message, /_meta\["io\.modelcontextprotocol\/protocolVersion"\]: "2026-07-28"/);
  }
  assert.equal((await bad({ _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" } })).code, -32602);
  assert.match((await bad({ _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": [] } })).message, /clientCapabilities"\] must be an object/);
  assert.match((await bad({ _meta: { "io.modelcontextprotocol/protocolVersion": 20260728, "io.modelcontextprotocol/clientCapabilities": {} } })).message, /must be a version string/);
  for (const requested of ["1900-01-01", "2025-11-25", "2027-01-01"]) {
    const e = await bad({ _meta: { ...MODERN, "io.modelcontextprotocol/protocolVersion": requested } });
    assert.equal(e.code, -32022);
    assert.deepEqual(e.data, { supported: [...PROTOCOL_VERSIONS], requested });
    assert.match(e.message, new RegExp(`Unsupported protocol version: ${requested}\\. Send "2026-07-28" in _meta`));
  }
  assert.equal((await bad({ _meta: { ...MODERN, "io.modelcontextprotocol/protocolVersion": "1900-01-01" } }, "server/discover")).code, -32022);
  assert.equal((await ask(h, "server/discover")).error?.code, -32602);
});

test("2026-07-28: ping, initialize-era methods, other methods and a cursor are refused with what the server answers", async () => {
  const h = createRawHandler({ cli });
  const ping = await ask(h, "ping", { _meta: MODERN });
  assert.equal(ping.error?.code, -32601);
  assert.match(ping.error!.message, /^Method not found: ping\. This server answers server\/discover, tools\/list and tools\/call\.$/);
  assert.equal((await ask(h, "resources/list", { _meta: MODERN })).error?.code, -32601);
  const cursor = await ask(h, "tools/list", { cursor: "page-2", _meta: MODERN });
  assert.equal(cursor.error?.code, -32602);
  assert.match(cursor.error!.message, /one page/);
});

test("an older client opens with initialize, is answered in the revision it asked for, and then needs no _meta", async () => {
  for (const version of ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"]) {
    const h = createRawHandler({ cli, version: "1.0.0" });
    const init = await ask(h, "initialize", { protocolVersion: version, capabilities: {}, clientInfo: { name: "old", version: "1" } });
    assert.deepEqual(init.result?.["capabilities"], { tools: { listChanged: false } });
    assert.deepEqual([init.result?.["protocolVersion"], init.result?.["serverInfo"]], [version, { name: "notes", version: "1.0.0" }]);
    assert.equal(init.result?.["resultType"], undefined);
    assert.equal(await h({ jsonrpc: "2.0", method: "notifications/initialized" }), null);
    const listed = await ask(h, "tools/list", { _meta: { progressToken: "p" } }, 2);
    assert.deepEqual(Object.keys(listed.result!), ["tools"]);
    const called = await ask(h, "tools/call", { name: "rooms", arguments: {} }, 3);
    assert.deepEqual(Object.keys(called.result!).sort(), ["content", "isError"]);
    assert.deepEqual((await ask(h, "ping", undefined, 4)).result, {});
    assert.equal((await ask(h, "resources/list", undefined, 5)).error?.message, "Method not found: resources/list. This server answers server/discover, tools/list and tools/call, and initialize and ping for older clients.");
    assert.equal((await ask(h, "server/discover", undefined, 6)).error?.code, -32602);
  }
  for (const requested of ["2026-07-28", "1999-01-01", undefined]) {
    assert.equal((await ask(createRawHandler({ cli }), "initialize", { protocolVersion: requested })).result?.["protocolVersion"], "2025-11-25");
  }
});

test("before initialize an older client's request is refused with how to open, and a 2026-07-28 request is served beside an older client's on one process", async () => {
  const h = createRawHandler({ cli });
  const early = await ask(h, "tools/list");
  assert.equal(early.error?.code, -32602);
  assert.match(early.error!.message, /or open with initialize as an older client does/);
  assert.deepEqual((await ask(h, "ping")).result, {});
  await ask(h, "initialize", { protocolVersion: "2025-06-18" });
  assert.deepEqual(Object.keys((await ask(h, "tools/list")).result!), ["tools"]);
  assert.equal((await ask(h, "tools/list", { _meta: MODERN })).result?.["resultType"], "complete");
  assert.equal((await ask(h, "tools/list", { _meta: { ...MODERN, "io.modelcontextprotocol/protocolVersion": "1900-01-01" } })).error?.code, -32022);
});

test("a client that cancels a call gets no reply for it: a queued call never runs, a running one is answered with nothing", async () => {
  const started: string[] = [];
  const h = createRawHandler({ cli, call: async (cmd) => { started.push(cmd.name); await new Promise((r) => setTimeout(r, 20)); return { ok: true, data: {} }; } });
  const running = ask(h, "tools/call", { name: "rooms", arguments: {}, _meta: MODERN }, 1);
  const queued = ask(h, "tools/call", { name: "note", arguments: { room: "abc123", text: "x" }, _meta: MODERN }, 2);
  const other = ask(h, "tools/call", { name: "rooms", arguments: {}, _meta: MODERN }, 3);
  while (!started.length) await new Promise((r) => setImmediate(r));
  assert.equal(await h({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 1 } }), null);
  assert.equal(await h({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 2 } }), null);
  assert.equal(await h({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 99 } }), null);
  assert.equal(await h({ jsonrpc: "2.0", method: "notifications/cancelled" }), null);
  assert.deepEqual(await Promise.all([running, queued, other].map((p) => p.then((a) => a?.result?.["isError"] ?? null))), [null, null, false]);
  assert.deepEqual(started, ["rooms", "rooms"]);
  assert.equal((await ask(h, "tools/call", { name: "rooms", arguments: {}, _meta: MODERN }, 1)).result?.["isError"], false);
  const gate = () => { let open!: () => void; const promise = new Promise<void>((r) => (open = r)); return { promise, open }; };
  const gates = [gate(), gate()];
  let calls = 0;
  const slow = createRawHandler({ cli, concurrent: true, call: async () => { await gates[calls++]!.promise; return { ok: true, data: {} }; } });
  const first = ask(slow, "tools/call", { name: "rooms", arguments: {}, _meta: MODERN }, 1);
  await slow({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 1 } });
  const reused = ask(slow, "tools/call", { name: "rooms", arguments: {}, _meta: MODERN }, 1);
  gates[0]!.open();
  assert.equal(await first, null);
  await slow({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 1 } });
  gates[1]!.open();
  assert.equal(await reused, null);
});

test("serveMcp serves a 2026-07-28 probe, then an older client's handshake, line by line", async () => {
  let out = "";
  const lines = [{ id: 1, method: "server/discover", params: { _meta: MODERN } }, { id: 2, method: "initialize", params: { protocolVersion: "2025-06-18" } }].map((m) => `${JSON.stringify({ jsonrpc: "2.0", ...m })}\n`);
  await serveMcp({ cli, input: lines, output: { write: (s) => (out += s) } });
  const replies = out.trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(replies.find((r) => r.id === 1).result.resultType, "complete");
  assert.equal(replies.find((r) => r.id === 2).result.protocolVersion, "2025-06-18");
});
