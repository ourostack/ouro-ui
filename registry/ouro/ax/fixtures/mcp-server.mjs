#!/usr/bin/env node
// A tiny stdio MCP server for xray.test.mts: `look` holds every MCP claim; `poke` has no annotations and runs a call
// that is missing its required argument instead of refusing it. $MCP_MODE picks a broken variant: "noinit" refuses to
// initialize, "notools" lists no tools array, "loose" has tools without a description or schema, runs unknown tools,
// and writes a line that is not JSON-RPC first, "modern" speaks only MCP 2026-07-28: it answers server/discover and
// requests that carry the version in _meta, and refuses initialize, "stream" lists three tools whose descriptions
// promise a stream this transport (one reply per call) can never give, and three that only name a stream as a thing
// (friends' channel_caps lists streaming among a channel's capabilities, friends#286).
import readline from "node:readline";

const mode = process.env.MCP_MODE ?? "";
const TOOLS =
  mode === "loose"
    ? [
        { name: "bare", inputSchema: { type: "object", required: ["x"] }, annotations: { readOnlyHint: true } },
        { name: "free", description: "No arguments.", inputSchema: { type: "object" }, annotations: { destructiveHint: false } },
        { name: "nameless", description: "No schema." },
      ]
    : mode === "stream"
      ? [
          ["tail", "Streams new log lines as they happen."],
          ["feed", "Returns a stream of events from the room."],
          ["watch", "Watch the build and report on it continuously."],
          ["caps", "Return the capabilities of a channel (integrations, markdown, streaming, rich cards, max length)."],
          ["pick", "Pick which stream to read: the events or the live transcript."],
          ["count", "Count a channel's streams and their viewers."],
        ].map(([name, description]) => ({ name, description, inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true } }))
      : [
          { name: "look", description: "Read a room's messages.", inputSchema: { type: "object", properties: { room: { type: "string" } }, required: ["room"] }, annotations: { readOnlyHint: true } },
          { name: "poke", description: "Poke someone.", inputSchema: { type: "object", properties: { who: { type: "string" } }, required: ["who"] } },
        ];
const send = (m) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\n");
if (mode === "loose") process.stdout.write('not json\n{"jsonrpc":"2.0","id":"x"}\n{"jsonrpc":"2.0","id":99}\n');
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  let m;
  try {
    m = JSON.parse(line);
  } catch {
    return;
  }
  if (m.id === undefined) return;
  if (mode === "modern") {
    const versioned = m.params?._meta?.["io.modelcontextprotocol/protocolVersion"] === "2026-07-28";
    if (m.method === "server/discover" && versioned) return send({ id: m.id, result: { resultType: "complete", supportedVersions: ["2026-07-28"], capabilities: { tools: {} } } });
    if (!versioned) return send({ id: m.id, error: { code: -32602, message: "send the version in _meta" } });
  }
  if (m.method === "initialize") return mode === "noinit" ? send({ id: m.id, error: { code: -32603, message: "not today", data: { why: "a fixture" } } }) : send({ id: m.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "fixture", version: "0" } } });
  if (m.method === "tools/list") return send({ id: m.id, result: mode === "notools" ? {} : { tools: TOOLS } });
  if (m.method === "tools/call") {
    const { name, arguments: a = {} } = m.params ?? {};
    if (mode === "loose") return send({ id: m.id, result: name === "bare" ? {} : { content: [{ type: "image" }] } });
    if (name === "look") return a.room ? send({ id: m.id, result: { content: [{ type: "text", text: "[]" }] } }) : send({ id: m.id, result: { isError: true, content: [{ type: "text", text: "look needs room: a room id from rooms" }] } });
    if (name === "poke") return send({ id: m.id, result: { content: [{ type: "text", text: "poked undefined" }] } });
    if (name === "tail") return send({ id: m.id, result: { content: [{ type: "text", text: "[]" }] } });
    return send({ id: m.id, error: { code: -32602, message: `no tool ${name}; tools/list lists them: look, poke` } });
  }
  send({ id: m.id, error: { code: -32601, message: "no such method" } });
});

