#!/usr/bin/env node
// The MCP door: lists the tools in generated/mcp.json and answers each call with the app's own handler.
import { createInterface } from "node:readline";
import { readFileSync } from "node:fs";
import { handlers } from "./tasks.mjs";

const { tools } = JSON.parse(readFileSync(new URL("../generated/mcp.json", import.meta.url), "utf8"));
const send = (message) => process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
const answer = (value, isError = false) => ({ content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value, ...(isError ? { isError: true } : {}) });

function call(name, args = {}) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) return { error: { code: -32602, message: `No tool named ${name}. Call tools/list for the tools this server has.` } };
  const missing = tool.inputSchema.required.find((field) => typeof args[field] !== "string");
  if (missing) return { result: answer({ error: `Missing required argument ${missing}. Fix: pass ${missing} as a string.` }, true) };
  try {
    return { result: answer(handlers[name](args)) };
  } catch (error) {
    return { result: answer({ error: error.message }, true) };
  }
}

createInterface({ input: process.stdin }).on("line", (line) => {
  const message = JSON.parse(line);
  if (message.id === undefined) return;
  const { id, method, params } = message;
  if (method === "initialize") return send({ id, result: { protocolVersion: params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "tasks", version: "0.0.0" } } });
  if (method === "ping") return send({ id, result: {} });
  if (method === "tools/list") return send({ id, result: { tools } });
  if (method === "tools/call") return send({ id, ...call(params?.name, params?.arguments) });
  send({ id, error: { code: -32601, message: `Method ${method} is not served here.` } });
});
