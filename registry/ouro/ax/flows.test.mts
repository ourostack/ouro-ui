import { after, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { at, checkCall, defineFlow, defineSuite, inProcess, listedCommands, main, matches, report, runFlows, runSuite, spawned, unlisted, type Finding, type Flow, type FlowSuite, type Mock, type Ran } from "./flows.ts";
import suite, { flows } from "./fixtures/flows-suite.mts";

const here = dirname(fileURLToPath(import.meta.url));
// Inside this folder (in .tmp/, which git and the registry ignore), never the system temp folder; removed after the tests.
const scratch = join(here, ".tmp", `flows-${process.pid}`);
mkdirSync(scratch, { recursive: true });
after(() => {
  rmSync(scratch, { recursive: true, force: true });
  if (readdirSync(join(here, ".tmp")).length === 0) rmSync(join(here, ".tmp"), { recursive: true });
});

const FLOW = { id: "X", surface: "agent-cli" } as const;
const ran = (over: Partial<Ran> = {}): Ran => ({ code: 0, out: "", err: "", ms: 1, ...over });
const io = () => {
  const o = { out: "", err: "" };
  return { o, io: { stdout: { write: (s: string) => (o.out += s) }, stderr: { write: (s: string) => (o.err += s) } } };
};

test("paths find values, fan out over arrays and filters, and take the last element", () => {
  const doc = { a: [{ b: 1, t: "Weekly sync" }, { b: 2, t: "Standup" }], c: { d: "x" } };
  assert.deepEqual(at(doc, "a[].b"), { values: [1, 2], fan: true });
  assert.deepEqual(at(doc, "a[-1].b").values, [2]);
  assert.deepEqual(at(doc, "a[t~^weekly].b"), { values: [1], fan: true });
  assert.deepEqual(at(doc, "c[t~x]").values, []);
  assert.deepEqual(at(doc, "a.length").values, [2]);
  assert.deepEqual(at(doc, "c.d.e").values, [undefined]);
  assert.deepEqual(at(doc, "c[0]").values, [undefined]);
  assert.deepEqual(at(doc, "c[]").values, [undefined]);
  assert.deepEqual(at([{ t: null }], "[t~x]").values, []);
  assert.deepEqual(at(doc, "a]b").values, []);
  assert.deepEqual(at(doc, "a.b").values, [undefined]);
  assert.ok(matches("Riley asked", { re: "riley" }));
  assert.ok(!matches(3, { re: "3" }));
  assert.ok(matches(5, { oneOf: [4, 5] }));
  assert.ok(matches([], { type: "array" }) && matches(null, { type: "null" }) && matches({}, { type: "object" }));
  assert.ok(!matches("x", "y"));
  assert.ok(matches(null, null));
});

test("a call's checks: exit, shape, fields, error text, time, size, text and voice, each its own finding", () => {
  const step = { id: "s", expect: { exit: 2, stderrRules: ["oneLine", "namesFix", "noStack"] as const, maxMs: 100, maxBytes: 200 } };
  const good = checkCall(FLOW, step, ran({ code: 2, err: 'notes: post: needs --why. Fix: notes post x --why "I asked".\n', ms: 50 }), { tool: "notes", argv: ["post", "x"] });
  assert.ok(good.every((f) => f.pass), JSON.stringify(good));
  assert.deepEqual(good.map((f) => f.check), ["exit", "stderr.oneLine", "stderr.namesFix", "stderr.noStack", "max-ms", "max-bytes", "voice.plain-stderr"]);
  const bad = checkCall(FLOW, { id: "s", expect: { exit: [2, 3], stderrRules: ["oneLine", "noStack", "empty", "namesFix"], maxMs: 100 }, fix: "say it in one line", known: "#1" }, ran({ code: 1, err: "boom!\n    at main (file.ts:1:2)\n", ms: 150 }), { tool: "notes", slack: 1.2, argv: ["x"] });
  assert.deepEqual(bad.filter((f) => !f.pass).map((f) => f.check), ["exit", "stderr.oneLine", "stderr.noStack", "stderr.empty", "stderr.namesFix", "max-ms", "voice.plain-stderr"]);
  assert.ok(bad.every((f) => f.known === "#1"));
  assert.ok(bad.filter((f) => !f.pass).every((f) => f.fix === "say it in one line"));
  assert.equal(bad.find((f) => f.check === "max-ms")?.threshold, 120);
  const json = checkCall(FLOW, { id: "j", expect: { exit: 0, jsonShape: ["items[].ref", "gone"], fields: { "items[].by": "agent:x", why: { re: "asked" }, total: 3 } } }, ran({ out: JSON.stringify({ items: [{ ref: "a", by: "agent:y" }, { ref: "b", by: "agent:x" }], why: "Riley asked", total: 2 }) }), { tool: "t" });
  assert.deepEqual(json.map((f) => [f.check, f.selector ?? "", f.pass, f.rubric]), [["exit", "", true, "predictable"], ["json-shape", "items[].ref", true, "predictable"], ["json-shape", "gone", false, "predictable"], ["fields", "items[].by", true, "honest"], ["fields", "why", true, "honest"], ["fields", "total", false, "predictable"]]);
  assert.equal(json.find((f) => f.selector === "gone")?.measured, "missing");
  assert.equal(checkCall(FLOW, { id: "e", expect: { exit: 0, jsonShape: ["x[]"] } }, ran({ out: '{"x":[]}' }), { tool: "t" })[1]?.measured, "empty");
  const notJson = checkCall(FLOW, { id: "j", expect: { exit: 0, fields: { a: 1 } } }, ran({ out: "text" }), { tool: "t", argv: ["x", "--json"] });
  assert.deepEqual(notJson.filter((f) => !f.pass).map((f) => [f.check, f.fix]), [["json", "print exactly one JSON document with --json"]]);
  const text = checkCall(FLOW, { id: "t", expect: { exit: 0, maxBytes: 4, text: { has: ["^Sent", "Nope"], not: ["19:[0-9a-f]+", "@thread"] } } }, ran({ out: "Sent to 19:abc\n" }), { tool: "t" });
  assert.deepEqual(text.map((f) => [f.check, f.pass]), [["exit", true], ["max-bytes", false], ["text.has", true], ["text.has", false], ["text.not", false], ["text.not", true]]);
  assert.equal(text.find((f) => f.check === "text.not")?.evidence, "Sent to 19:abc");
  const exitBad = checkCall(FLOW, { id: "x", expect: { exit: 0 } }, ran({ code: 1, out: "out only" }), { tool: "t" });
  assert.equal(exitBad[0]?.evidence, "out only");
  const long = checkCall(FLOW, { id: "l", expect: { exit: 0, jsonShape: ["a"] } }, ran({ err: "x".repeat(400) }), { tool: "t" });
  assert.equal(long[1]?.evidence, `${"x".repeat(300)}…`);
});

test("the voice rules: plain stderr, JSON alone under --json, and no brand names", () => {
  const verdict = (r: Partial<Ran>, argv: string[], brandNames?: string[]) => Object.fromEntries(checkCall(FLOW, { id: "v", expect: { exit: 0 } }, ran(r), { tool: "t", argv, ...(brandNames ? { brandNames } : {}) }).filter((f) => f.check.startsWith("voice.")).map((f) => [f.check, f.pass]));
  assert.deepEqual(verdict({ out: "Sent.\n", err: 't: send: needs --why. Fix: t send x --why "I asked".\n' }, ["send"], ["Acme", "Wid.get"]), { "voice.plain-stderr": true, "voice.no-brand-names": true });
  assert.deepEqual(verdict({ out: "Acme, it is sent.\n", err: "I sent it\n" }, ["send"], ["Acme"]), { "voice.plain-stderr": false, "voice.no-brand-names": false });
  assert.deepEqual(verdict({ err: "Done \u{1F6B2}\n" }, ["send"]), { "voice.plain-stderr": false });
  assert.deepEqual(verdict({ out: "All done, nice pedalling.\n{}" }, ["log", "--json"]), { "voice.plain-stderr": true, "voice.json-only": false });
  assert.deepEqual(verdict({ out: "[]" }, ["log", "--json"]), { "voice.plain-stderr": true, "voice.json-only": true });
  assert.deepEqual(verdict({ out: "" }, ["log", "--json"]), { "voice.plain-stderr": true, "voice.json-only": true });
  assert.deepEqual(verdict({ out: "x" }, ["log"], []), { "voice.plain-stderr": true });
});

test("the overview's commands come from help --json, else from its text; a flow's unlisted commands are named", () => {
  const help = ran({ out: JSON.stringify({ commands: [{ name: "today" }, { name: "draft set", aliases: ["ds"] }, { name: "attention", hidden: true }] }) });
  assert.deepEqual([...listedCommands(help, ran())], ["today", "draft", "ds"]);
  assert.deepEqual([...listedCommands(ran({ code: 2 }), ran({ out: "Only you see these\n  today           Start here.\n  look, lk        Messages.\nnot a row\n" }))], ["today", "look", "lk"]);
  assert.deepEqual([...listedCommands(ran({ out: "[]" }), ran())], []);
  const flow: Flow = { id: "F", surface: "agent-cli", title: "", rubric: [], steps: [{ id: "a", run: ["today"], expect: { exit: 0 } }, { id: "b", run: ["attention"], expect: { exit: [0, 5] } }, { id: "c", run: ["edit", "x"], expect: { exit: 2 } }, { id: "d", run: ["help"], expect: { exit: 0 } }, { id: "e", run: ["--help"], expect: { exit: 0 } }, { id: "f", run: [], expect: { exit: 0 } }, { id: "g", harness: { path: "/x" } }] };
  assert.deepEqual(unlisted(flow, new Set(["today"])), ["attention"]);
});

test("nothing runs until the suite's guard passes", async () => {
  let calls = 0;
  const refused = defineSuite({ ...suite, cli: async () => (calls++, ran()), guard: () => { throw new Error("not a mock"); } });
  await assert.rejects(runFlows(refused, { stop: () => undefined }, { dir: scratch }), /not a mock/);
  assert.equal(calls, 0);
});

test("the suite's flows against its mock: saved values, a harness reply, a request, known defects and reads that write", async () => {
  const mock = await (suite as FlowSuite).start(scratch);
  try {
    const findings = await runFlows(suite, mock, { dir: scratch, slack: 2 });
    const failing = findings.filter((f) => !f.pass).map((f) => `${f.flow} ${f.step} ${f.check}${f.known ? " known" : ""}`);
    assert.deepEqual(failing, ["K1 --help discoverable.listed known", "K1 rooms-text text.has known", "U1 rooms exit", "U1 fields fields", "U1 * reads-stay-reads", "U2 exit exit"]);
    assert.ok(findings.some((f) => f.flow === "T5" && f.step === "wait" && f.check === "fields" && f.selector === "events[].summary" && f.pass));
    assert.ok(findings.some((f) => f.flow === "A1" && f.surface === "agent-http" && f.check === "json-shape" && f.pass));
    assert.ok(findings.some((f) => f.flow === "H1" && f.check === "reads-stay-reads" && f.pass));
    assert.ok(findings.filter((f) => f.check.startsWith("voice.")).every((f) => f.pass));
    assert.equal(findings.find((f) => f.flow === "U1" && f.check === "reads-stay-reads")?.evidence, "state changed across a flow that only reads");
  } finally {
    await mock.stop();
  }
});

test("a suite that can't do what a flow asks: no control port, no API, a control port that refuses, a state that is not JSON", async () => {
  const one = (step: Flow["steps"][number], extra: Partial<Flow> = {}): FlowSuite => defineSuite({ ...suite, guard: () => undefined, flows: [defineFlow({ id: "Z", surface: "agent-cli", title: "", rubric: [], steps: [step], ...extra })] });
  const noop: Mock = { stop: () => undefined };
  await assert.rejects(runFlows(one({ id: "h", harness: { path: "/inject" } }), noop, { dir: scratch }), /Z h: a harness step needs the mock's control port\. Fix: return \{ control \} from the suite's start\(\)\./);
  await assert.rejects(runFlows(one({ id: "r", request: { method: "GET", path: "/" }, expect: { exit: 200 } }), noop, { dir: scratch }), /Z r: a request step needs the mock's API/);
  const mock = await (suite as FlowSuite).start(scratch);
  try {
    await assert.rejects(runFlows(one({ id: "h", harness: { path: "/nowhere" } }), mock, { dir: scratch }), /Z h: the mock's control port answered 404: \{"error":"no such route"\}/);
    const posted = await runFlows(one({ id: "p", request: { method: "POST", path: "/api/rooms", body: { x: 1 } }, expect: { exit: 200 }, save: { gone: "nothing" } }), mock, { dir: scratch });
    assert.equal(posted.find((f) => f.check === "exit")?.pass, true);
    // A value that was never saved stays as written; a step that prints no JSON saves nothing. No brand names given, no brand check.
    const unsaved = await runFlows(defineSuite({ ...one({ id: "u", run: ["note", "{room}", "{never}"], expect: { exit: 0 }, save: { x: "y" } }), brandNames: undefined as unknown as string[] }), mock, { dir: scratch });
    assert.ok(unsaved.every((f) => f.pass) && !unsaved.some((f) => f.check === "voice.no-brand-names"), JSON.stringify(unsaved));
    const text = defineSuite({ ...one({ id: "r", run: ["rooms"], expect: { exit: 0 } }, { readOnly: true }), state: ["rooms"] });
    const r = await runFlows(text, mock, { dir: scratch });
    assert.equal(r.find((f) => f.check === "reads-stay-reads")?.evidence, "rooms gave no JSON");
    const noState = defineSuite({ ...one({ id: "r", run: ["rooms"], expect: { exit: 0 } }, { readOnly: true }) });
    delete (noState as { state?: unknown }).state;
    assert.ok(!(await runFlows(noState, mock, { dir: scratch })).some((f) => f.check === "reads-stay-reads"));
    const http = await runFlows(one({ id: "r", request: { method: "GET", path: "/api/rooms" }, expect: { exit: 200 } }, { surface: "agent-http" }), mock, { dir: scratch });
    assert.ok(!http.some((f) => f.check === "discoverable.listed"));
  } finally {
    await mock.stop();
  }
});

test("the report: per flow, unknown failures, a known defect that passes, and the X-ray attached", () => {
  const f = (over: Partial<Finding>): Finding => ({ flow: "A", step: "s", surface: "agent-cli", cell: null, check: "exit", pass: true, ms: 1, ...over });
  const r = report([f({ pass: false, known: "#1" }), f({ check: "fields", known: "#1" }), f({ step: "t", known: "#2" }), f({ step: "t", check: "fields", known: "#2" }), f({ flow: "B", pass: false })], { path: "x/report.json", doc: { claimSet: { hash: "h" }, checker: { version: "1.1.0" }, conformant: true } });
  assert.equal(r.schema, "flow-review-report/0");
  assert.deepEqual(r.summary, { checks: 5, pass: 3, fail: 2, unknownFail: 1, knownPassing: [{ flow: "A", step: "t", known: "#2" }], flows: [{ flow: "A", pass: false, checks: 4, failed: 1, known: 1 }, { flow: "B", pass: false, checks: 1, failed: 1, known: 0 }] });
  assert.deepEqual(r.attachments, [{ kind: "ouro-ax-xray", path: "x/report.json", claimSetHash: "h", checkerVersion: "1.1.0", conformant: true }]);
  assert.deepEqual(report([], { path: "y.json", doc: { claimSet: 1, checker: { version: 2 }, conformant: "yes" } }).attachments, [{ kind: "ouro-ax-xray", path: "y.json", claimSetHash: null, checkerVersion: null, conformant: null }]);
  assert.deepEqual(report([], { path: "z.json", doc: [] }).attachments[0]?.claimSetHash, null);
  assert.deepEqual(report([]).attachments, []);
});

test("runSuite writes findings.jsonl and report.json and leaves no work folder", async () => {
  const out = join(scratch, "suite");
  mkdirSync(out, { recursive: true });
  const r = await runSuite(suite, { out, only: ["H1"] });
  assert.equal(r.summary.unknownFail, 0);
  const lines = readFileSync(join(out, "findings.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as Finding);
  assert.equal(lines.length, r.summary.checks);
  assert.deepEqual(Object.keys(lines[1]!).slice(0, 7), ["flow", "step", "surface", "cell", "check", "pass", "ms"]);
  assert.deepEqual(JSON.parse(readFileSync(join(out, "report.json"), "utf8")), r);
  assert.equal(existsSync(join(out, "work")), false);
});

test("the command runs a suite module: exit 0, 1 on an unknown failure or a known that passes, 2 on usage", async () => {
  const module = join(here, "fixtures", "flows-suite.mts");
  const out = join(scratch, "cmd");
  const xrayReport = join(scratch, "xray.json");
  writeFileSync(xrayReport, JSON.stringify({ claimSet: { hash: "abc" }, checker: { version: "1.1.0" }, conformant: true }));
  const ok = io();
  assert.equal(await main(["run", module, "--out", out, "--flows", "H1,K1", "--slack", "2", "--xray", xrayReport], ok.io), 0);
  assert.match(ok.o.out, /^pass {2}H1 {3}\d+ checks, 0 failed\nFAIL {2}K1 {3}\d+ checks, 2 failed \(2 known\)\n {2}known K1 --help discoverable\.listed: \["secret"\] -> list secret in the overview\n/);
  assert.match(ok.o.out, /checks pass; 0 unknown failures; 0 known defects pass now\./);
  assert.equal(JSON.parse(readFileSync(join(out, "report.json"), "utf8")).attachments[0].claimSetHash, "abc");
  const fixed = io();
  assert.equal(await main(["run", module, "--out", out, "--flows", "K2"], fixed.io), 1);
  assert.match(fixed.o.out, /FIXED K2 rooms passes now: remove known https:\/\/example\.com\/issues\/2\n.*0 unknown failures; 1 known defect passes now\./);
  const failing = io();
  assert.equal(await main(["run", module, "--out", out, "--flows", "U1"], failing.io), 1);
  assert.match(failing.o.out, / {2}FAIL {2}U1 rooms exit: 0 -> nothing: this flow fails on purpose\n {2}FAIL {2}U1 fields fields \[0\]\.owner: ""\n {2}FAIL {2}U1 \* reads-stay-reads: "state changed across a flow that only reads"\n.*3 unknown failures; 0 known defects pass now\./s);
  const one = io();
  assert.equal(await main(["run", module, "--out", out, "--flows", "U2"], one.io), 1);
  assert.match(one.o.out, /; 1 unknown failure; 0 known defects pass now\./);
  const all = io();
  assert.equal(await main(["run", module, "--out", out], all.io), 1);
  assert.equal(all.o.out.match(/^(pass|FAIL) /gm)?.length, 8);
  const help = io();
  assert.equal(await main(["--help"], help.io), 0);
  assert.match(help.o.out, /^ax-flows: runs an adopter's agent flows/);
  assert.equal(await main(["help"], io().io), 0);
  for (const [argv, problem] of [
    [[], "it runs a suite: run <suite module>"],
    [["run", "--out", "x"], "it runs a suite: run <suite module>"],
    [["run", module, "--out"], "--out needs a value"],
    [["run", module, "--slack", "fast"], '--slack takes a number above 0, not "fast"'],
    [["run", module, "--retries", "2"], "there is no --retries; it takes --out, --flows, --slack, --xray"],
    [["run", join(here, "output.ts")], `${join(here, "output.ts")} does not default-export defineSuite({ tool, flows, cli, start, guard })`],
  ] as const) {
    const u = io();
    assert.equal(await main(argv, u.io), 2, argv.join(" "));
    assert.equal(u.o.err, `ax-flows: ${problem}. Fix: node flows.ts run <suite module> [--out <dir>].\n`);
  }
});

test("drivers: the tool in this process, and a built CLI as its own process with a time limit", async () => {
  let flushed = false;
  const inside = inProcess((argv, tool) => {
    tool.stdout.write(argv.join(" "));
    tool.stderr.write("note", () => (flushed = true));
    tool.stderr.write("\n");
    return Number(tool.env["CODE"]);
  });
  assert.deepEqual({ ...(await inside(["a", "b"], { CODE: "3" })), ms: 0 }, { code: 3, out: "a b", err: "note\n", ms: 0 });
  assert.equal(flushed, true);
  const echo = spawned([process.execPath, "-e", "process.stdout.write(JSON.stringify([process.argv.slice(1), process.env.ROOM]))", "--"]);
  const listed = await echo(["list", "--json"], { ROOM: "abc123" });
  assert.equal(listed.code, 0);
  assert.deepEqual(JSON.parse(listed.out), [["list", "--json"], "abc123"]);
  const slow = spawned([process.execPath, "-e", "process.stderr.write('waiting'); setTimeout(() => {}, 5000)"], 1000);
  assert.deepEqual({ ...(await slow([], {})), ms: 0 }, { code: -1, out: "", err: "waiting", ms: 0 });
  assert.equal(flows.length, 8);
});
