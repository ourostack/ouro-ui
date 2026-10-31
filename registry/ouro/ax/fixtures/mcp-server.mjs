#!/usr/bin/env node
// A tiny stdio MCP server for xray.test.mts: `look` holds every MCP claim; `poke` has no annotations and runs a call
// that is missing its required argument instead of refusing it.
import readline from "node:readline";

const TOOLS = [
  { name: "look", description: "Read a room's messages.", inputSchema: { type: "object", properties: { room: { type: "string" } }, required: ["room"] }, annotations: { readOnlyHint: true } },
  { name: "poke", description: "Poke someone.", inputSchema: { type: "object", properties: { who: { type: "string" } }, required: ["who"] } },
];
const send = (m) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\n");
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  let m;
  try {
    m = JSON.parse(line);
  } catch {
    return;
  }
  if (m.id === undefined) return;
  if (m.method === "initialize") return send({ id: m.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "fixture", version: "0" } } });
  if (m.method === "tools/list") return send({ id: m.id, result: { tools: TOOLS } });
  if (m.method === "tools/call") {
    const { name, arguments: a = {} } = m.params ?? {};
    if (name === "look") return a.room ? send({ id: m.id, result: { content: [{ type: "text", text: "[]" }] } }) : send({ id: m.id, result: { isError: true, content: [{ type: "text", text: "look needs room: a room id from rooms" }] } });
    if (name === "poke") return send({ id: m.id, result: { content: [{ type: "text", text: "poked undefined" }] } });
    return send({ id: m.id, error: { code: -32602, message: `no tool ${name}; tools/list lists them: look, poke` } });
  }
  send({ id: m.id, error: { code: -32601, message: "no such method" } });
});
