#!/usr/bin/env node
// A tiny in-turn tools server for xray.test.mts, over stdio JSON-RPC: `read_note` holds every in-turn claim;
// `send_note` is consequential and asks its confirm question; `poke` declares no effect and runs a call that is missing
// its required argument (the list's shared errors card the unknown tool's code); `wave` is consequential with no confirm question, and answers a bare string, not an outcome. $TOOLS_MODE picks
// a broken variant: "notools" lists no tools array, "error" answers tools/list with an error, "loose" has tools that
// are not function definitions or lack a description or parameters, answers with a code no card lists, an empty
// refusal with no code, a JSON-RPC error and, for an unknown tool, an answer with no result, and writes a line that is not JSON-RPC first.
import readline from "node:readline";

const mode = process.env.TOOLS_MODE ?? "";
const fn = (name, description, parameters) => ({ type: "function", function: { name, description, parameters } });
const params = (required) => ({ type: "object", properties: Object.fromEntries(required.map((k) => [k, { type: "string" }])), required });
const TOOLS =
  mode === "loose"
    ? [
        { type: "function", function: { name: "bare", parameters: params(["x"]) }, ax: { effect: "read", when: "", errors: [] } },
        { name: "flat", description: "Not a function definition.", ax: { effect: "maybe", when: "Never." } },
        { type: "function", function: { name: "nameless", description: "No parameters." } },
        fn("free", "No arguments.", { type: "object" }),
        { ...fn("coy", "Refuses saying nothing.", params(["y"])), ax: { effect: "read", when: "Never." } },
        { ...fn("boom", "Answers a JSON-RPC error.", params(["z"])), ax: { effect: "read", when: "Never." } },
      ]
    : [
        { ...fn("read_note", "Read a note.", params(["path"])), ax: { effect: "read", when: "Read one note you know the path of.", errors: [{ code: "missing_path", means: "No path given.", fix: "Pass path." }] } },
        { ...fn("send_note", "Send a note to someone.", params(["to"])), ax: { effect: "consequential", when: "Send a note someone else will read.", confirm: "Send this note to {to}?", errors: [{ code: "missing_to", means: "No one named.", fix: "Pass to." }] } },
        { ...fn("poke", "Poke someone.", params(["who"])), ax: { when: "Poke someone.", errors: [] } },
        { ...fn("wave", "Wave at a room.", params(["room"])), ax: { effect: "consequential", when: "Wave at everyone.", errors: [] } },
      ];
const send = (m) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\n");
const answer = (id, state, text, code) => send({ id, result: { state, text, ...(code ? { code } : {}) } });
if (mode === "loose") process.stdout.write('not json\n{"jsonrpc":"2.0","id":"x"}\n{"jsonrpc":"2.0","id":99}\n');
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  let m;
  try {
    m = JSON.parse(line);
  } catch {
    return;
  }
  if (m.id === undefined) return;
  if (m.method === "tools/list") {
    if (mode === "error") return send({ id: m.id, error: { code: -32603, message: "the tool registry did not load" } });
    return send({ id: m.id, result: mode === "notools" ? {} : mode === "loose" ? { tools: TOOLS } : { tools: TOOLS, errors: [{ code: "unknown_tool", means: "No tool has that name.", fix: "Call one tools/list names." }] } });
  }
  if (m.method === "tools/call") {
    const { name, arguments: a = {} } = m.params ?? {};
    if (mode === "loose") {
      if (name === "bare") return answer(m.id, "refused", "bare needs x", "not_on_the_card");
      if (name === "coy") return send({ id: m.id, result: { state: "refused", text: "", code: "" } });
      if (name === "boom") return send({ id: m.id, error: { code: -32602, message: "boom needs z" } });
      return send({ id: m.id });
    }
    if (name === "read_note") return a.path ? answer(m.id, "done", "# a note") : answer(m.id, "refused", "read_note needs path: a note's path from list_notes (code: missing_path)", "missing_path");
    if (name === "send_note") return a.to ? answer(m.id, "done", "sent") : answer(m.id, "refused", "send_note needs to: the person to send it to (code: missing_to)", "missing_to");
    if (name === "poke") return answer(m.id, "done", "poked undefined");
    if (name === "wave") return send({ id: m.id, result: "waved" });
    return answer(m.id, "refused", `no tool ${name}; the tools are read_note, send_note, poke and wave (code: unknown_tool)`, "unknown_tool");
  }
  send({ id: m.id, error: { code: -32601, message: "no such method" } });
});
