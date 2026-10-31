import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CLAIM_SET } from "./claims.ts";
import {
  checkSafety,
  claimSetHash,
  compareInventory,
  harvest,
  main,
  misspell,
  parseArgs,
  refusalVerdict,
  renderHtml,
  renderMarkdown,
  renderText,
  requiredWords,
  splitCommand,
  stateDelta,
  summarize,
  usageWords,
  xray,
  XRAY_VERSION,
  type Report,
  type XrayOptions,
} from "./xray.ts";

const here = dirname(fileURLToPath(import.meta.url));
// Inside this folder (in .tmp/, which git and the registry ignore), never the system temp folder; removed after the tests.
const scratch = join(here, ".tmp", `xray-${process.pid}`);
const home = join(scratch, "home");
mkdirSync(home, { recursive: true });
after(() => {
  rmSync(scratch, { recursive: true, force: true });
  if (readdirSync(join(here, ".tmp")).length === 0) rmSync(join(here, ".tmp"), { recursive: true });
});

let mock: Server;
let mockUrl = "";
let api: Server;
let apiUrl = "";
let apiLog: { verb: string }[] = [];
const apiRoutes = ["GET /api/rooms", "GET /api/rooms/{id}", "GET /api/log", "POST /api/act", "GET /api/html"];
const listen = (server: Server) => new Promise<string>((done) => server.listen(0, "127.0.0.1", () => done(`http://127.0.0.1:${(server.address() as { port: number }).port}`)));
before(async () => {
  mock = createServer((req, res) => {
    if (req.url === "/text") {
      res.writeHead(200);
      return res.end("not json");
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ mock: true, who: { name: "mock" } }));
  });
  mockUrl = await listen(mock);
  api = createServer((req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const u = new URL(req.url ?? "/", "http://x");
    if (u.pathname === "/api") return send(200, { routes: apiRoutes });
    if (u.pathname === "/api/rooms") return send(200, { rooms: [{ ref: "r1" }] });
    if (u.pathname === "/api/log") return send(200, { log: apiLog });
    if (u.pathname.startsWith("/api/rooms/")) return send(404, { error: "no such room" });
    if (u.pathname === "/api/act" && req.method === "POST") {
      let body = "";
      req.on("data", (d: Buffer) => (body += String(d)));
      req.on("end", () => {
        const b = JSON.parse(body) as { why?: string };
        if (!b.why) return send(422, { error: "say why: the why field" });
        apiLog = [...apiLog, { verb: "act.refused" }];
        send(404, { error: "no such room; GET /api/rooms lists them" });
      });
      return;
    }
    if (u.pathname === "/api2") return send(200, { routes: ["GET /api2/rooms"] });
    if (u.pathname === "/api2/rooms") {
      apiLog = [...apiLog, { verb: "read" }];
      return send(200, { rooms: [] });
    }
    if (u.pathname === "/api2/log") return send(200, { log: apiLog });
    if (u.pathname === "/api2/tick") return send(200, { tick: process.hrtime.bigint().toString() });
    if (u.pathname === "/api2/plain") {
      res.writeHead(204);
      return res.end();
    }
    if (u.pathname === "/api2/text") {
      res.writeHead(200);
      return res.end("plain words");
    }
    if (u.pathname === "/api2/act") {
      apiLog = [...apiLog, { verb: "act" }];
      return send(200, { ok: true });
    }
    if (u.pathname.startsWith("/api2/")) return send(404, { error: "no route; GET /api2 lists the routes" });
    if (u.pathname === "/api/html") {
      res.writeHead(500, { "content-type": "text/html" });
      return res.end("<p>oops</p>");
    }
    send(404, { error: "not found" });
  });
  apiUrl = await listen(api);
});
after(() => {
  mock.close();
  api.close();
});

const fixture = (name: string) => `node ${join(here, "fixtures", name)}`;
const base = (over: Partial<XrayOptions> = {}): XrayOptions => ({ env: {}, state: [], volatile: [], samples: {}, width: 100, timeoutMs: 20_000, json: false, conformance: false, command: null, home, mock: `${mockUrl}/ mock=true`, ...over });
const verdicts = (report: Report, claim: string) => report.results.filter((r) => r.claim === claim).map((r) => r.verdict);
const holds = (report: Report, claim: string) => report.claims.find((c) => c.id === claim)?.holds;
const io = () => {
  const o = { out: "", err: "" };
  return { o, io: { stdout: { write: (s: string) => (o.out += s) }, stderr: { write: (s: string) => (o.err += s) } } };
};

test("usage parsing keeps placeholders with spaces whole and drops optional groups", () => {
  assert.deepEqual(splitCommand(`a "b c" 'd' e ""`), ["a", "b c", "d", "e", ""]);
  assert.deepEqual(usageWords('react <conversation>#<message id> <emoji id> --why "<reason>"'), ["react", "<conversation>#<message id>", "<emoji id>", "--why", "<reason>"]);
  assert.deepEqual(requiredWords("conversations [--limit N] [--unread [--x]]"), ["conversations"]);
  assert.equal(misspell("--limit"), "--limt");
  assert.equal(misspell("--ab"), "--abx");
});

test("harvest takes the first ref of each named list, singular", () => {
  assert.deepEqual(harvest({ conversations: [{ ref: "c1" }, { ref: "c2" }], meetings: [{ id: "m1" }], stories: [{ ref: "s1" }], other: [{}, 3] }, {}), { conversation: "c1", meeting: "m1", story: "s1" });
  assert.deepEqual(harvest([{ ref: "r1" }], {}, "rooms"), { room: "r1" });
});

test("a refusal may leave only a record that says it was refused", () => {
  const a = [JSON.stringify({ log: [{ verb: "send" }] })];
  assert.deepEqual(refusalVerdict(stateDelta(a, a)), { ok: true, note: "nothing changed" });
  assert.equal(refusalVerdict(stateDelta(a, [JSON.stringify({ log: [{ verb: "send" }, { verb: "send.refused" }] })])).note, "1 audit record of the refusal, nothing else");
  assert.equal(refusalVerdict(stateDelta(a, [JSON.stringify({ log: [{ verb: "send" }, { verb: "send.refused" }, { verb: "x.refused" }] })])).note, "2 audit records of the refusal, nothing else");
  assert.equal(refusalVerdict(stateDelta(a, [JSON.stringify({ log: [{ verb: "send" }, { verb: "send" }] })])).ok, false);
  assert.match(refusalVerdict(stateDelta(a, [JSON.stringify({ log: [] })])).note, /^0 added, 1 removed; first: /);
  assert.equal(stateDelta(["plain text"], ["plain text"]).same, true);
});

test("compareInventory names what is missing, unknown or listed twice", () => {
  assert.deepEqual(compareInventory(["a", "b", "b"], ["b", "c", "c"]), { expected: 2, covered: 2, missing: ["a"], unknown: ["c"], duplicate: ["b", "c"] });
});

test("the claim set: its hash is stable and every claim the X-ray records exists", () => {
  assert.match(claimSetHash(), /^[0-9a-f]{64}$/);
  assert.equal(claimSetHash(), claimSetHash());
  assert.equal(CLAIM_SET.claims.length, new Set(CLAIM_SET.claims.map((c) => c.id)).size);
});

test("the kit's example tool conforms, and the X-ray acts on nothing", async () => {
  const state = join(scratch, "notes.json");
  const inventory = join(scratch, "inventory.json");
  writeFileSync(inventory, JSON.stringify({ cli: ["rooms", "note", "post", "watch"] }));
  const report = await xray(base({ cli: fixture("notes.mts"), name: "notes", env: { NOTES_STATE: state }, state: ["state"], inventory, conformance: true, commit: "abc1234" }));
  const failing = report.claims.filter((c) => c.fail).map((c) => `${c.id}: ${c.failing.map((f) => f.note).join("; ")}`);
  assert.deepEqual(failing, []);
  assert.equal(report.conformant, true);
  assert.equal(report.target.commit, "abc1234");
  assert.deepEqual(report.claimSet, { version: CLAIM_SET.version, hash: claimSetHash() });
  assert.deepEqual(report.checker, { version: XRAY_VERSION });
  assert.deepEqual(report.effects, []);
  assert.equal(JSON.parse(readFileSync(state, "utf8")).abc123.messages.length, 0);
  for (const id of ["cli.others-preview", "cli.outcome", "cli.wait-on-refs", "cli.wait-typed", "cli.inventory", "cli.ambiguous-verbs"]) assert.equal(holds(report, id), true, id);
  assert.match(renderText(report), /^ax-xray: at abc1234; CLI `notes`/);
});

test("without proof of a mock, nothing other people see is called, and it does not conform", async () => {
  const calls = join(scratch, "unsafe-calls.jsonl");
  const report = await xray(base({ cli: fixture("bad-cli.mjs"), name: "bad", env: { FIXTURE_CALLS: calls }, mock: undefined, home: undefined }));
  assert.equal(report.safety.ok, false);
  assert.deepEqual(verdicts(report, "cli.others-need-why"), ["skip"]);
  assert.match(report.results.find((r) => r.claim === "cli.others-need-why")!.note, /not run: the target is not proven a mock \(loopback: no address to check/);
  assert.ok(!readFileSync(calls, "utf8").split("\n").some((l) => l.startsWith('["send"') && !l.includes("--help")));
  assert.equal(report.conformant, false);
  assert.match(renderText(report), /Calls to what other people see: not made/);
});

test("checkSafety fails closed: a remote address, the real home, a credential, a wrong or missing mock", async () => {
  const names = async (over: Partial<XrayOptions>, guard = false) => (await checkSafety(base(over), guard)).checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.note}`);
  assert.deepEqual(await names({}), []);
  assert.deepEqual(await names({ mock: undefined, env: { TANDEM_URL: "http://localhost:5999" } }, true), []);
  assert.match((await names({ env: { TANDEM_URL: "https://teams.example.com" } }))[0]!, /^loopback: not loopback: https:\/\/teams\.example\.com/);
  assert.match((await names({ home: homedir() }))[0]!, /^isolated home: .* is or holds the real home/);
  assert.match((await names({ home: dirname(homedir()) }))[0]!, /is or holds the real home/);
  assert.match((await names({ env: { GH_TOKEN: "x" } }))[0]!, /^no credentials: --env passes GH_TOKEN/);
  assert.match((await names({ mock: `${mockUrl}/ mock=false` }))[0]!, /^mock identity: .* answers mock=true; expected false/);
  assert.equal((await names({ mock: `${mockUrl}/ who.name=mock` })).length, 0);
  assert.match((await names({ mock: `${mockUrl}/ who.name=other` }))[0]!, /answers who\.name="mock"; expected other/);
  assert.match((await names({ mock: `${mockUrl}/ mock` }))[0]!, /--mock needs <key>=<value>/);
  assert.match((await names({ mock: `http://127.0.0.1:1/ mock=true` }))[0]!, /^mock identity: http:\/\/127\.0\.0\.1:1\/: /);
  assert.match((await names({ mock: "not-a-url mock=true" }))[0]!, /not loopback: not-a-url/);
  assert.match((await names({ mock: undefined })).at(-1)!, /no proof the target is a mock/);
});

test("a CLI that breaks the claims fails them, each with what it saw", async () => {
  const calls = join(scratch, "bad-calls.jsonl");
  const state = join(scratch, "bad-state.txt");
  const report = await xray(base({ cli: fixture("bad-cli.mjs"), name: "bad", env: { FIXTURE_CALLS: calls, FIXTURE_STATE: state, TARGET: "http://127.0.0.1:9" }, state: ["count"] }));
  for (const id of ["cli.exit-codes", "cli.read-json", "cli.unknown-command", "cli.unknown-flag", "cli.flag-suggest", "cli.ambiguous-verbs", "cli.others-need-why", "cli.wrong-ref-first", "cli.others-preview", "cli.one-line-error", "cli.error-teaches", "cli.no-stack-trace", "cli.help-width", "cli.reads-stay-reads"]) {
    assert.equal(holds(report, id), false, id);
  }
  assert.ok(report.results.find((r) => r.claim === "cli.unknown-flag")!.note.includes("ignored"));
  assert.equal(holds(report, "cli.help-parses"), true);
  assert.deepEqual(verdicts(report, "cli.inventory"), ["skip"]);
  assert.ok(report.effects.length > 0);
  // Without --dry-run in its help, the X-ray never calls send with a real room.
  const sends = readFileSync(calls, "utf8").trim().split("\n").map((l) => JSON.parse(l) as string[]).filter((a) => a[0] === "send" && !a.includes("--help"));
  for (const a of sends) assert.ok(a.includes("axxraynoref"), a.join(" "));
  const md = renderMarkdown(report);
  assert.match(md, /## What fails, and the fix/);
  assert.match(md, /Does not conform yet: \d+ must claims not holding; no inventory given/);
});

test("an HTTP API: JSON, one error shape, an index, errors that teach, refusals that change nothing, its inventory", async () => {
  apiLog = [];
  const manifest = join(scratch, "routes.json");
  writeFileSync(manifest, JSON.stringify({ base: "/api", routes: [...apiRoutes, "GET /api/rooms?q="], skip: [], state: ["GET /api/log"], others: [{ route: "POST /api/act", why: "why", body: { room: "{ref}", action: "act" } }] }));
  const inventory = join(scratch, "http-inventory.json");
  writeFileSync(inventory, JSON.stringify({ http: [...apiRoutes, "GET /api/gone"] }));
  const report = await xray(base({ http: apiUrl, routes: manifest, inventory, name: "rooms" }));
  for (const id of ["http.index", "http.others-need-why", "http.reads-stay-reads", "http.refusals-change-nothing"]) assert.equal(holds(report, id), true, id);
  assert.equal(holds(report, "http.unknown-route"), false, "not found says nothing");
  assert.equal(holds(report, "http.json"), false, "an HTML error page");
  assert.deepEqual(verdicts(report, "http.wrong-ref-first").sort(), ["fail", "pass"]);
  assert.deepEqual(report.results.filter((r) => r.claim === "http.inventory").map((r) => r.surface), ["GET /api/gone", "GET /api/rooms?q="]);
  const unsafe = await xray(base({ http: apiUrl, routes: manifest, mock: undefined }));
  assert.deepEqual(verdicts(unsafe, "http.others-need-why"), ["skip"]);
  const unstable = join(scratch, "routes-unstable.json");
  writeFileSync(unstable, JSON.stringify({ routes: ["GET /api/rooms"] }));
  const bare = await xray(base({ http: `${apiUrl}/`, routes: unstable }));
  assert.match(bare.results.find((r) => r.claim === "http.reads-stay-reads")!.note, /names no state routes/);
  const down = await xray(base({ http: "http://127.0.0.1:1", routes: unstable }));
  assert.equal(holds(down, "http.index"), false);
});

test("an MCP server: listed tools, annotations, a bad call refused naming the argument, an unknown tool, its inventory", async () => {
  const inventory = join(scratch, "mcp-inventory.json");
  writeFileSync(inventory, JSON.stringify({ mcp: ["look"] }));
  const report = await xray(base({ mcp: fixture("mcp-server.mjs"), inventory }));
  assert.equal(holds(report, "mcp.tools-list"), true);
  assert.equal(holds(report, "mcp.unknown-tool"), true);
  assert.deepEqual(report.results.filter((r) => r.claim === "mcp.bad-call-teaches").map((r) => [r.surface, r.verdict]), [["look", "pass"], ["poke", "fail"]]);
  assert.deepEqual(report.results.filter((r) => r.claim === "mcp.effect-annotated").map((r) => [r.surface, r.verdict]), [["look", "pass"], ["poke", "fail"]]);
  assert.deepEqual(report.results.filter((r) => r.claim === "mcp.inventory").map((r) => [r.surface, r.verdict]), [["poke", "fail"]]);
  const unsafe = await xray(base({ mcp: fixture("mcp-server.mjs"), mock: undefined }));
  assert.deepEqual(unsafe.results.filter((r) => r.claim === "mcp.bad-call-teaches").map((r) => r.verdict), ["pass", "skip"]);
  const kit = await xray(base({ mcp: fixture("notes-mcp.mts") }));
  assert.deepEqual(kit.claims.filter((c) => c.fail).map((c) => c.id), []);
  const dead = await xray(base({ mcp: "node -e process.exit(0)", timeoutMs: 300 }));
  assert.match(dead.results[0]!.note, /no answer to initialize/);
});

test("the reports: Markdown and HTML list every claim and surface", async () => {
  const report = await xray(base({ mcp: fixture("mcp-server.mjs") }));
  const md = renderMarkdown(report);
  const html = renderHtml(report);
  for (const c of report.claims) {
    assert.ok(md.includes(c.id), c.id);
    assert.ok(html.includes(c.id), c.id);
  }
  assert.match(html, /<table>/);
  assert.match(html, /sha256 [0-9a-f]{64}/);
  const many = summarize(Array.from({ length: 8 }, (_, i) => ({ claim: "cli.help-width", surface: `s${i}`, verdict: "fail" as const, note: "wide" })), { target: { commit: null }, safety: { ok: true, checks: [] }, inventory: { given: true, surfaces: ["cli"] }, effects: [{ surface: "x", note: "y" }] }, "2026-10-30T00:00:00.000Z");
  assert.match(renderText(many), /… 2 more/);
  assert.match(renderText(many), /Effects the X-ray caused: x: y\./);
  assert.equal(many.summary.score, 0);
  assert.equal(summarize([], { target: { commit: null }, safety: { ok: true, checks: [] }, inventory: { given: true, surfaces: [] }, effects: [] }).summary.score, null);
  const one = summarize([{ claim: "cli.help-parses", surface: "help", verdict: "fail", note: "x" }, { claim: "cli.wait-on-refs", surface: "watch", verdict: "skip", note: "y" }], { target: { commit: null }, safety: { ok: false, checks: [] }, inventory: { given: false, surfaces: [] }, effects: [] });
  assert.match(renderText(one), /Does not conform yet: 1 must claim not holding; no inventory given; 1 must claim skipped\./);
  const two = summarize([{ claim: "cli.help-parses", surface: "help", verdict: "skip", note: "x" }, { claim: "cli.wait-on-refs", surface: "watch", verdict: "skip", note: "y" }], { target: { commit: null }, safety: { ok: true, checks: [] }, inventory: { given: true, surfaces: ["cli"] }, effects: [] });
  assert.match(renderText(two), /Does not conform yet: 2 must claims skipped\./);
  const elsewhere = summarize([{ claim: "http.json", surface: "GET /x", verdict: "pass", note: "" }], { target: { commit: null }, safety: { ok: true, checks: [] }, inventory: { given: true, surfaces: ["cli"] }, effects: [] });
  assert.match(renderText(elsewhere), /Does not conform yet: the inventory names no http surfaces\./);
  const spawnFails = await xray(base({ cli: "ax-xray-no-such-program-anywhere", timeoutMs: 5000 }));
  assert.equal(spawnFails.claims.find((c) => c.id === "cli.help-parses")!.holds, false);
});

test("the command: claims, help, usage errors with the fix, exit codes, written reports", async () => {
  const a = io();
  assert.equal(await main(["claims"], a.io), 0);
  assert.match(a.o.out, /^cli\.help-parses \[must\]/);
  const b = io();
  assert.equal(await main(["claims", "--json"], b.io), 0);
  assert.equal(JSON.parse(b.o.out).hash, claimSetHash());
  const c = io();
  assert.equal(await main(["--help"], c.io), 0);
  assert.match(c.o.out, /^ax-xray 1\.0\.0: checks an agent-facing interface/);
  for (const [argv, message] of [
    [["--jsn"], /there is no --jsn\. Fix: --json\./],
    [["oops"], /unexpected "oops"/],
    [["--cli"], /--cli needs a value/],
    [["--env", "X"], /--env takes K=V/],
    [["--width", "0", "--cli", "x"], /--width takes a positive number/],
    [["--http", "http://x"], /--http needs --routes/],
    [[], /nothing to check/],
    [["--cli", "x", "--conformance"], /--conformance needs --inventory/],
  ] as [string[], RegExp][]) {
    const d = io();
    assert.equal(await main(argv, d.io), 2, argv.join(" "));
    assert.match(d.o.err, message);
  }
  const o = parseArgs(["--cli", "x", "--sample", "a=b", "--state", "log", "--volatile", "at,id", "--timeout", "500", "--width", "80", "--md", "m", "--html", "h", "--json"]);
  assert.deepEqual([o.samples, o.state, o.volatile, o.timeoutMs, o.width, o.md, o.html, o.json], [{ a: "b" }, ["log"], ["at", "id"], 500, 80, "m", "h", true]);
  const guard = io();
  assert.equal(await main(["--cli", fixture("notes.mts"), "--guard", "node -e process.exit(3)"], guard.io), 2);
  assert.match(guard.o.err, /refusing: the guard failed: exit 3/);
  const guardSays = io();
  assert.equal(await main(["--cli", fixture("notes.mts"), "--guard", `node -e "console.error('not the mock'); process.exit(2)"`], guardSays.io), 2);
  assert.match(guardSays.o.err, /the guard failed: not the mock/);
  const md = join(scratch, "r.md");
  const html = join(scratch, "r.html");
  const bad = io();
  assert.equal(await main(["--mcp", fixture("mcp-server.mjs"), "--home", home, "--mock", `${mockUrl}/ mock=true`, "--md", md, "--html", html, "--json"], bad.io), 1);
  assert.equal(JSON.parse(bad.o.out).tool, "ax-xray");
  assert.ok(existsSync(md) && existsSync(html));
  const inventory = join(scratch, "inv-notes.json");
  writeFileSync(inventory, JSON.stringify({ cli: ["rooms", "note", "post"] }));
  const strict = io();
  assert.equal(await main(["--cli", fixture("notes.mts"), "--name", "notes", "--home", home, "--mock", `${mockUrl}/ mock=true`, "--inventory", inventory, "--conformance"], strict.io), 1);
  const good = io();
  appendFileSync(join(scratch, "noop"), "");
  assert.equal(await main(["--cli", fixture("notes.mts"), "--name", "notes", "--home", home, "--mock", `${mockUrl}/ mock=true`, "--guard", "node -e 0"], good.io), 0);
  const missing = io();
  assert.equal(await main(["--cli", "x", "--inventory", join(scratch, "nope.json")], missing.io), 1);
  assert.match(missing.o.err, /ENOENT/);
});

test("the guide's tool conforms", async () => {
  const inventory = join(scratch, "inv-tasks.json");
  writeFileSync(inventory, JSON.stringify({ cli: ["list", "assign"] }));
  const report = await xray(base({ cli: fixture("tasks.mts"), inventory, conformance: true, samples: { task: "t1", person: "Ana" }, state: ["list --json"] }));
  assert.deepEqual(report.claims.filter((c) => c.fail).map((c) => `${c.id}: ${c.failing.map((f) => f.note).join("; ")}`), []);
  assert.equal(report.conformant, true);
});

const legacy = (over: Partial<XrayOptions> = {}) => base({ cli: fixture("legacy-cli.mjs"), name: "legacy", state: ["state"], volatile: ["at"], timeoutMs: 5000, ...over });
const verdictOf = (report: Report, claim: string, surface: string) => report.results.find((r) => r.claim === claim && r.surface === surface)?.verdict;

test("a CLI built before the kit: usage lists, a stream, refs it harvests, text on stdin, previews, and its faults", async () => {
  const state = join(scratch, "legacy.json");
  const inventory = join(scratch, "inv-legacy.json");
  writeFileSync(inventory, JSON.stringify({ cli: ["conversations", "conversations", "gone"] }));
  const report = await xray(legacy({ env: { LEGACY_STATE: state }, events: "events lines", inventory, samples: { "react:<conversation>#<message id>": "c1#m1" } }));
  const v = (claim: string, surface: string) => verdictOf(report, claim, surface);
  assert.deepEqual([v("cli.read-json", "tail"), v("cli.read-json", "quiet"), v("cli.read-json", "noise"), v("cli.read-json", "meeting"), v("cli.read-json", "broken"), v("cli.read-json", "draft show"), v("cli.read-json", "history")], ["pass", "skip", "fail", "skip", "fail", "pass", "pass"]);
  assert.deepEqual([v("cli.missing-arg", "pair"), v("cli.missing-arg", "set"), v("cli.missing-arg", "find")], ["fail", "pass", "pass"]);
  assert.deepEqual([v("cli.unknown-flag", "look"), v("cli.unknown-flag", "draft show"), v("cli.flag-suggest", "conversations --limt")], ["fail", "fail", "pass"]);
  assert.deepEqual([v("cli.text-as-argument", "note"), v("cli.text-as-argument", "send")], ["fail", "pass"]);
  assert.deepEqual([v("cli.wait-on-refs", "watch <conversation>"), v("cli.wait-typed", "watch <conversation> --json")], ["pass", "fail"]);
  assert.deepEqual([v("cli.outcome", "send"), v("cli.outcome", "react"), v("cli.outcome", "rename"), v("cli.outcome", "pin"), v("cli.others-preview", "invite")], ["pass", "fail", "fail", "fail", "skip"]);
  assert.deepEqual([v("cli.refusals-change-nothing", "react"), v("cli.refusals-change-nothing", "the whole run"), v("cli.others-preview", "rename"), v("cli.wrong-ref-first", "pin")], ["fail", "fail", "fail", "fail"]);
  assert.deepEqual([v("cli.ambiguous-verbs", "edit"), v("cli.ambiguous-verbs", "delete"), v("cli.help-effects", "noeffect"), v("cli.command-help", "broken"), v("cli.help-width", "wide --help")], ["pass", "fail", "fail", "fail", "fail"]);
  assert.deepEqual([v("cli.unknown-command", "ax-xray-no-such-command"), v("cli.work-events", "events lines")], ["fail", "fail"]);
  assert.deepEqual(report.results.filter((r) => r.claim === "cli.inventory").map((r) => [r.surface, r.verdict]).slice(0, 2), [["gone", "fail"], ["draft show", "fail"]]);
  assert.ok(report.results.some((r) => r.claim === "cli.inventory" && r.note === "listed twice"));
  assert.ok(report.effects.some((e) => e.surface === "rename --dry-run"));
  assert.match(renderText(report), /^ax-xray: CLI `legacy`/);
  assert.match(renderMarkdown(report), /Does not conform yet: \d+ must claims not holding/);
});

test("help JSON only from --help --json, a state that moves on its own, a read that writes, and event lists", async () => {
  const second = await xray(legacy({ name: undefined, env: { LEGACY_MODE: "second,nostreams", LEGACY_STATE: join(scratch, "legacy-2.json") }, events: "events array" }));
  assert.equal(verdictOf(second, "cli.help-parses", "help"), "pass");
  assert.equal(second.target.cli?.name, "legacy-cli");
  assert.equal(verdictOf(second, "cli.work-events", "events array"), "pass");
  const unstable = await xray(legacy({ env: { LEGACY_MODE: "unstable,nostreams" }, events: "events object" }));
  assert.match(unstable.results.find((r) => r.claim === "cli.reads-stay-reads")!.note, /answer differently with nothing run between them/);
  assert.equal(verdictOf(unstable, "cli.work-events", "events object"), "pass");
  const writes = await xray(legacy({ env: { LEGACY_MODE: "writes,nostreams", LEGACY_STATE: join(scratch, "legacy-3.json") }, events: "events bad" }));
  assert.equal(writes.results.find((r) => r.claim === "cli.reads-stay-reads")!.verdict, "fail");
  assert.equal(verdictOf(writes, "cli.work-events", "events bad"), "fail");
  const number = await xray(legacy({ events: "events number", state: ["nothing"], env: { LEGACY_MODE: "nousage,badwait,nostreams" } }));
  assert.equal(verdictOf(number, "cli.work-events", "events number"), "fail");
  assert.deepEqual([verdictOf(number, "cli.wait-on-refs", "watch <conversation>"), verdictOf(number, "cli.wait-typed", "watch <conversation> --json")], ["fail", "fail"]);
  assert.match(number.results.find((r) => r.claim === "cli.wait-typed")!.note, /not a wait\/1/);
});

test("a CLI with no help JSON: commands and exit codes from the overview, a long overview, no usage code", async () => {
  const plain = await xray(base({ cli: fixture("plain-cli.mjs") }));
  assert.deepEqual([verdictOf(plain, "cli.help-parses", "help"), verdictOf(plain, "cli.help-effects", "help"), verdictOf(plain, "cli.wait-on-refs", "watch")], ["fail", "fail", "skip"]);
  assert.match(plain.results.find((r) => r.claim === "cli.unknown-command")!.note, /usage exit code is 2/);
  const long = await xray(base({ cli: fixture("plain-cli.mjs"), env: { PLAIN_MODE: "long" } }));
  assert.equal(verdictOf(long, "cli.overview-short", "--help"), "fail");
  const nousage = await xray(base({ cli: fixture("plain-cli.mjs"), env: { PLAIN_MODE: "nousage" } }));
  assert.doesNotMatch(nousage.results.find((r) => r.claim === "cli.unknown-command")!.note, /usage exit code/);
});

test("an HTTP API whose reads write, whose writes need no why, and whose answers are not JSON", async () => {
  apiLog = [];
  const manifest = join(scratch, "routes2.json");
  writeFileSync(manifest, JSON.stringify({ base: "/api2", routes: ["GET /api2/rooms", "GET /api2/plain", "GET /api2/text", "GET /api2/x/{id}"], state: ["/api2/log", "GET /api2/text"], others: [{ route: "POST /api2/act" }] }));
  const report = await xray(base({ http: apiUrl, routes: manifest }));
  assert.deepEqual(["http.unknown-route", "http.reads-stay-reads", "http.others-need-why", "http.refusals-change-nothing"].map((id) => report.results.find((r) => r.claim === id)?.verdict), ["pass", "fail", "fail", "fail"]);
  assert.deepEqual(report.results.filter((r) => r.claim === "http.json").map((r) => r.verdict), ["pass", "fail", "fail", "pass"]);
  assert.deepEqual(report.results.filter((r) => r.claim === "http.wrong-ref-first").map((r) => [r.surface, r.verdict]), [["GET /api2/x/{id}", "pass"], ["POST /api2/act", "fail"]]);
  const ticking = join(scratch, "routes4.json");
  writeFileSync(ticking, JSON.stringify({ base: "/api2", routes: [], state: ["GET /api2/tick"], others: [{ route: "POST /api2/act", why: "reason", body: { to: "{ref}" } }] }));
  const tick = await xray(base({ http: apiUrl, routes: ticking }));
  assert.match(tick.results.find((r) => r.claim === "http.reads-stay-reads")!.note, /answer differently/);
  assert.equal(tick.results.some((r) => r.claim === "http.refusals-change-nothing"), false);
  assert.match(report.results.find((r) => r.claim === "http.json" && r.verdict === "fail")!.note, /→ 204$/);
  const bare = join(scratch, "routes3.json");
  writeFileSync(bare, JSON.stringify({}));
  const none = await xray(base({ http: apiUrl, routes: bare }));
  assert.match(none.results.find((r) => r.claim === "http.index")!.note, /names 0 of 0 routes/);
  assert.match(renderMarkdown(none), /^# AX X-ray: http:\/\/127\.0\.0\.1/);
});

test("MCP servers that refuse to start, list no tools, or have tools without a description or schema", async () => {
  const noinit = await xray(base({ mcp: fixture("mcp-server.mjs"), env: { MCP_MODE: "noinit" } }));
  assert.match(noinit.results[0]!.note, /"message":"not today","data":\{"why":"a fixture"\}/);
  const notools = await xray(base({ mcp: fixture("mcp-server.mjs"), env: { MCP_MODE: "notools" } }));
  assert.equal(notools.results[0]!.note, "no tools array");
  const loose = await xray(base({ mcp: fixture("mcp-server.mjs"), env: { MCP_MODE: "loose" } }));
  assert.deepEqual(loose.results.filter((r) => r.claim === "mcp.tools-list").map((r) => r.note), ["missing description", "No arguments.", "missing inputSchema"]);
  assert.equal(loose.results.find((r) => r.claim === "mcp.unknown-tool")!.note, "ran: (no text)");
  assert.equal(loose.results.find((r) => r.claim === "mcp.bad-call-teaches")!.note, "ran: (no text)");
  assert.match(renderHtml(loose), /AX X-ray: MCP server/);
});

test("a mock check that answers text, a key path through a value that is not an object, and the command's last flags", async () => {
  const names = async (over: Partial<XrayOptions>) => (await checkSafety(base(over), false)).checks.filter((c) => !c.ok).map((c) => c.note);
  assert.match((await names({ mock: `${mockUrl}/text mock=true` }))[0]!, /answers mock=undefined; expected true/);
  assert.match((await names({ mock: `${mockUrl}/ mock.deep=true` }))[0]!, /answers mock\.deep=undefined/);
  const o = parseArgs(["--cli", "x", "--env", "A=b", "--timeout", "500"]);
  assert.deepEqual([o.env, o.timeoutMs], [{ A: "b" }, 500]);
  const t = io();
  assert.equal(await main(["--cli", "x", "--timeout", "-1"], t.io), 2);
  assert.match(t.o.err, /--timeout takes a positive number, not "-1"\. Fix: --timeout 20000\./);
  const inventory = join(scratch, "inv-notes-full.json");
  writeFileSync(inventory, JSON.stringify({ cli: ["rooms", "note", "post", "watch"] }));
  const good = io();
  assert.equal(await main(["--cli", fixture("notes.mts"), "--name", "notes", "--home", home, "--mock", `${mockUrl}/ mock=true`, "--inventory", inventory, "--conformance", "--state", "state", "--env", `NOTES_STATE=${join(scratch, "notes-main.json")}`], good.io), 0);
  assert.match(good.o.out, /Conforms: every applicable must claim holds/);
});
