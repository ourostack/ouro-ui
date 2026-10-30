// ax-xray's own tests: the checker against fixture CLIs, a fixture HTTP API and a fixture MCP server.
//   node --test ax/xray.test.mjs
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CLAIMS, harvest, main, misspell, refusalVerdict, renderHtml, renderMarkdown, requiredWords, splitCommand, stateDelta, usageWords, xray } from "./xray.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
// Inside the repository, never the system temp folder; removed after the tests.
const scratch = path.join(here, `.tmp-xray-${process.pid}`);
fs.mkdirSync(scratch, { recursive: true });
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

const fixture = (name) => `node ${path.join(here, "fixtures", name)}`;
const base = { env: {}, state: [], volatile: [], samples: {}, width: 100, timeoutMs: 20_000 };
const verdicts = (report, claim) => report.results.filter((r) => r.claim === claim).map((r) => r.verdict);
const holds = (report, claim) => report.claims.find((c) => c.id === claim)?.holds;

test("the standard: every claim has an id, a surface, a severity, a rule, a rationale, a source, a check and a fix", () => {
  const ids = new Set();
  for (const c of CLAIMS) {
    for (const k of ["id", "surface", "severity", "rule", "rationale", "source", "check", "fix"]) assert.ok(typeof c[k] === "string" && c[k].trim(), `${c.id}: ${k}`);
    assert.match(c.surface, /^(cli|http|mcp)$/);
    assert.match(c.severity, /^(must|should)$/);
    assert.ok(c.id.startsWith(`${c.surface}.`), c.id);
    assert.ok(!ids.has(c.id), `${c.id} twice`);
    ids.add(c.id);
  }
});

test("usage parsing keeps placeholders with spaces whole and drops optional groups", () => {
  assert.deepEqual(splitCommand(`a "b c" 'd' e`), ["a", "b c", "d", "e"]);
  assert.deepEqual(usageWords('react <conversation>#<message id> <emoji id> --why "<reason>"'), ["react", "<conversation>#<message id>", "<emoji id>", "--why", "<reason>"]);
  assert.deepEqual(requiredWords("conversations [--limit N] [--unread [--x]]"), ["conversations"]);
  assert.equal(misspell("--limit"), "--limt");
});

test("harvest takes the first ref of each named list, singular", () => {
  assert.deepEqual(harvest({ conversations: [{ ref: "c1" }, { ref: "c2" }], meetings: [{ id: "m1" }] }, {}), { conversation: "c1", meeting: "m1" });
});

test("a refusal may leave only a record that says it was refused", () => {
  const a = [JSON.stringify({ log: [{ verb: "send" }] })];
  assert.equal(refusalVerdict(stateDelta(a, a)).ok, true);
  assert.equal(refusalVerdict(stateDelta(a, [JSON.stringify({ log: [{ verb: "send" }, { verb: "send.refused" }] })])).ok, true);
  assert.equal(refusalVerdict(stateDelta(a, [JSON.stringify({ log: [{ verb: "send" }, { verb: "send" }] })])).ok, false);
  assert.equal(refusalVerdict(stateDelta(a, [JSON.stringify({ log: [] })])).ok, false);
});

test("a CLI that holds every claim passes every CLI claim, and the X-ray never acts on anything", async () => {
  const state = path.join(scratch, "good.json");
  const calls = path.join(scratch, "good-calls.jsonl");
  const env = { FIXTURE_STATE: state, FIXTURE_CALLS: calls };
  const report = await xray({ ...base, cli: fixture("good-cli.mjs"), name: "good", env, state: ["log --json"], samples: { text: "hello" } });
  const failing = report.claims.filter((c) => !c.holds).map((c) => `${c.id}: ${c.failing.map((f) => f.note).join("; ")}`);
  assert.deepEqual(failing, []);
  assert.equal(report.summary.mustHolding, report.summary.must);
  // Nothing was sent: the only send that named a real room carried --dry-run.
  assert.ok(!fs.existsSync(state) || JSON.parse(fs.readFileSync(state, "utf8")).sent.length === 0);
  const sends = fs.readFileSync(calls, "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((a) => a[0] === "send" && !a.includes("--help"));
  assert.ok(sends.length >= 3);
  for (const a of sends) assert.ok(a.includes("--dry-run") || a.includes("axxraynoref"), a.join(" "));
});

test("a CLI that breaks the claims fails them, each with what it saw", async () => {
  const env = { FIXTURE_CALLS: path.join(scratch, "bad-calls.jsonl") };
  const report = await xray({ ...base, cli: fixture("bad-cli.mjs"), name: "bad", env });
  for (const id of ["cli.exit-codes", "cli.read-json", "cli.unknown-command", "cli.unknown-flag", "cli.flag-suggest", "cli.ambiguous-verbs", "cli.others-need-why", "cli.wrong-ref-first", "cli.others-preview", "cli.one-line-error", "cli.error-teaches", "cli.no-stack-trace", "cli.help-width"]) {
    assert.equal(holds(report, id), false, id);
  }
  assert.ok(report.results.find((r) => r.claim === "cli.unknown-flag").note.includes("ignored"));
  assert.equal(holds(report, "cli.help-parses"), true);
  // Without --dry-run in its help, the X-ray never calls send with a real room.
  const sends = fs.readFileSync(env.FIXTURE_CALLS, "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((a) => a[0] === "send" && !a.includes("--help"));
  for (const a of sends) assert.ok(a.includes("axxraynoref"), a.join(" "));
});

test("an HTTP API: JSON, one error shape, an index, errors that teach, refusals that change nothing", async () => {
  let log = [];
  const routes = ["GET /api/rooms", "GET /api/rooms/{id}", "GET /api/log", "POST /api/act"];
  const server = http.createServer((req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const u = new URL(req.url, "http://x");
    if (u.pathname === "/api") return send(200, { routes });
    if (u.pathname === "/api/rooms") return send(200, { rooms: [{ ref: "r1" }] });
    if (u.pathname === "/api/log") return send(200, { log });
    if (u.pathname.startsWith("/api/rooms/")) return send(404, { error: "no such room" });
    if (u.pathname === "/api/act" && req.method === "POST") {
      let body = "";
      req.on("data", (d) => (body += d));
      req.on("end", () => {
        const b = JSON.parse(body);
        if (!b.why) return send(422, { error: "say why: the why field" });
        log = [...log, { verb: "act.refused" }];
        send(404, { error: "no such room; GET /api/rooms lists them" });
      });
      return;
    }
    send(404, { error: "not found" });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const manifest = path.join(scratch, "routes.json");
    fs.writeFileSync(manifest, JSON.stringify({ base: "/api", routes, state: ["GET /api/log"], others: [{ route: "POST /api/act", why: "why", body: { room: "{ref}" } }] }));
    const report = await xray({ ...base, http: `http://127.0.0.1:${server.address().port}`, routes: manifest });
    for (const id of ["http.json", "http.error-shape", "http.index", "http.others-need-why", "http.reads-stay-reads", "http.refusals-change-nothing"]) assert.equal(holds(report, id), true, id);
    assert.equal(holds(report, "http.unknown-route"), false, "not found says nothing");
    assert.deepEqual(verdicts(report, "http.wrong-ref-first").sort(), ["fail", "pass"], "a bare 404 fails; one naming the list passes");
  } finally {
    server.close();
  }
});

test("an MCP server: listed tools, annotations, a bad call refused naming the argument, an unknown tool", async () => {
  const report = await xray({ ...base, mcp: fixture("mcp-server.mjs") });
  assert.equal(holds(report, "mcp.tools-list"), true);
  assert.equal(holds(report, "mcp.unknown-tool"), true);
  assert.deepEqual(report.results.filter((r) => r.claim === "mcp.bad-call-teaches").map((r) => [r.surface, r.verdict]), [["look", "pass"], ["poke", "fail"]]);
  assert.deepEqual(report.results.filter((r) => r.claim === "mcp.effect-annotated").map((r) => [r.surface, r.verdict]), [["look", "pass"], ["poke", "fail"]]);
});

test("the reports: Markdown and HTML list every claim and surface; the command refuses unknown flags with the closest one", async () => {
  const report = await xray({ ...base, mcp: fixture("mcp-server.mjs") });
  const md = renderMarkdown(report);
  const html = renderHtml(report);
  for (const c of report.claims) {
    assert.ok(md.includes(c.id), c.id);
    assert.ok(html.includes(c.id), c.id);
  }
  assert.match(html, /<table>/);
  let err = "";
  const code = await main(["--jsn"], { stdout: { write: () => {} }, stderr: { write: (s) => (err += s) } });
  assert.equal(code, 2);
  assert.match(err, /unknown flag --jsn; did you mean --json\?/);
});
