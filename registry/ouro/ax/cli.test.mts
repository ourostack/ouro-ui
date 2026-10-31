import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { dispatch, printResult, runCli } from "./cli.ts";
import { defineCli, defineCommand, parse, type Parsed, type RunContext } from "./command.ts";
import { exampleCli as cli, exits, postMessage, resetRooms, rooms, setClock } from "./example-cli.ts";
import { nextStep, outcome } from "./outcome.ts";

async function run(argv: string[], stdin?: string) {
  let out = "";
  let err = "";
  const code = await runCli(cli, argv, { stdout: { write: (s) => (out += s) }, stderr: { write: (s) => (err += s) }, ...(stdin === undefined ? {} : { stdin: [stdin] }) }, { topics: { refs: "how to name a room" } });
  return { code, out, err };
}
beforeEach(resetRooms);

test("one result, as text or --json", async () => {
  assert.deepEqual(await run(["rooms"]), { code: 0, out: "[abc123] Design sync\n", err: "" });
  assert.deepEqual(JSON.parse((await run(["rooms", "--json"])).out), [{ ref: "abc123", title: "Design sync" }]);
});

test("a private action says nothing was sent; an others action says who can see it", async () => {
  assert.equal((await run(["note", "abc123", "-"], "check dates\n")).out, 'Note added in "Design sync". Only you see it; nothing was sent.\n');
  const posted = await run(["post", "abc123", "Running late", "--why", "Sam asked"]);
  assert.equal(posted.code, 0);
  assert.equal(posted.out, 'Posted to "Design sync". Everyone in it can see it.\nChecked: read the room\'s last message back.\nReceipt: m1\nNext: notes watch abc123  (wait for a reply)\n');
});

test("messages and receipts carry the clock's time: a fixed one in tests, the real one by default", async () => {
  setClock(() => new Date("2026-10-31T09:00:00.000Z"));
  try {
    const posted = JSON.parse((await run(["post", "abc123", "Running late", "--why", "Sam asked", "--json"])).out);
    assert.equal(posted.receipt.at, "2026-10-31T09:00:00.000Z");
    assert.equal(rooms["abc123"]!.messages[0]!.at, "2026-10-31T09:00:00.000Z");
  } finally {
    setClock();
  }
  const before = Date.now();
  postMessage("abc123", "Sam Lee", "On my way");
  const at = Date.parse(rooms["abc123"]!.messages[1]!.at);
  assert.ok(at >= before && at <= Date.now());
});

test("an error is one stderr line with the fix and its exit code; --json also prints the error shape", async () => {
  const r = await run(["post", "abc123", "hi"]);
  assert.equal(r.code, 2);
  assert.equal(r.out, "");
  assert.equal(r.err, `notes: post: other people will see this as the person's, so it needs --why: who asked you, and what they said. Fix: notes post abc123 hi --why "<who asked you, and what they said>".\n`);
  const j = await run(["note", "zzz", "x", "--json"]);
  assert.equal(j.code, 1);
  assert.equal(JSON.parse(j.out).error.fix, "notes rooms");
  assert.equal((await run(["note", "abc123", "x"])).code, 0);
});

test("help: the overview, a command, a topic, as text and --json; an unknown topic is usage", async () => {
  assert.match((await run(["--help"])).out, /^notes: a toy tool/);
  assert.match((await run(["help", "post"])).out, /notes post: Post a message/);
  assert.equal(JSON.parse((await run(["help", "post", "--json"])).out).name, "post");
  assert.equal(JSON.parse((await run(["help", "--json"])).out).tool, "notes");
  assert.equal((await run(["help", "refs"])).out, "how to name a room\n");
  const bad = await run(["help", "nope"]);
  assert.equal(bad.code, 2);
  assert.match(bad.err, /Fix: notes --help\.\n$/);
});

test("--dry-run runs the plan, never run(): a planned outcome, exit 0, nothing posted", async () => {
  const r = await run(["post", "abc123", "hi", "--why", "Sam asked", "--dry-run", "--json"]);
  assert.equal(r.code, 0);
  const o = JSON.parse(r.out);
  assert.equal(o.ax, "outcome/1");
  assert.equal(o.state, "planned");
  assert.deepEqual(o.audience, { only: false, who: 'everyone in "Design sync"' });
  assert.equal(rooms["abc123"]!.messages.length, 0);
  assert.equal((await run(["post", "abc123", "hi", "--why", "x", "--dry-run"])).out, 'Would post to "Design sync". Everyone in it would see it.\n');
});

const io = () => {
  const o = { out: "", err: "" };
  return { o, io: { stdout: { write: (s: string) => (o.out += s) }, stderr: { write: (s: string) => (o.err += s) } } };
};

test("a refused or failed outcome is the one error line on stderr, its own exit; --json prints the outcome", async () => {
  const refuse = outcome({ action: "send", state: "refused", summary: "Writes are off.", error: { code: "writes-off", exit: 3, thing: "send", problem: "writes are off", fix: "t writes on" } });
  const t = defineCli({
    name: "t",
    about: ["t"],
    exits,
    commands: [
      defineCommand({ name: "send", summary: "Send.", effect: "others", run: () => refuse }),
      defineCommand({ name: "queue", summary: "Queue.", effect: "others", run: () => outcome({ action: "q", state: "uncertain", summary: "Maybe.", receipt: { id: "r", at: "t", by: "a", why: "w" }, next: [nextStep("t log", "check")] }) }),
      defineCommand({ name: "plain", summary: "No run.", effect: "private" }),
      defineCommand({ name: "boom", summary: "Throws.", effect: "private", run: () => { throw new Error("disk full"); } }),
      defineCommand({ name: "odd", summary: "Throws a string.", effect: "private", run: () => { throw "odd"; } }),
      defineCommand({ name: "two", summary: "Two stdin values.", effect: "private", args: [{ name: "a", description: "A.", stdin: true }], flags: { b: { type: "string", description: "B.", stdin: true } }, run: async (input, ctx) => [input["a"], await ctx.stdin()] }),
      defineCommand({ name: "again", summary: "Reads stdin twice.", effect: "private", args: [{ name: "a", description: "A.", stdin: true }], run: async (input, ctx) => [input["a"], await ctx.stdin()] }),
    ],
  });
  const a = io();
  assert.equal(await runCli(t, ["send", "--why", "x"], a.io), 3);
  assert.deepEqual(a.o, { out: "", err: "t: send: writes are off. Fix: t writes on.\n" });
  const b = io();
  assert.equal(await runCli(t, ["send", "--why", "x", "--json"], b.io), 3);
  assert.equal(JSON.parse(b.o.out).state, "refused");
  const c = io();
  assert.equal(await runCli(t, ["queue", "--why", "x"], c.io), 1);
  assert.equal(c.o.out, "Maybe.\nReceipt: r\nNext: t log  (check)\n");
  const d = io();
  assert.equal(await runCli(t, ["send", "--why", "x", "--dry-run"], d.io), 2);
  assert.equal(d.o.err, "t: send --dry-run: this command has no preview, so nothing was done.\n");
  const e = io();
  assert.equal(await runCli(t, ["plain"], e.io), 1);
  assert.match(e.o.err, /plain: this command has no run\(\) in its definition\./);
  const f = io();
  assert.equal(await runCli(t, ["boom", "--json"], f.io), 1);
  assert.equal(f.o.err, "t: t: disk full.\n");
  assert.equal(JSON.parse(f.o.out).error.code, "error");
  const g = io();
  assert.equal(await runCli(t, ["odd"], g.io), 1);
  assert.equal(g.o.err, "t: t: odd.\n");
  const h = io();
  assert.equal(await runCli(t, ["two", "-", "--b", "-"], { ...h.io, stdin: ["x"] }), 2);
  assert.match(h.o.err, /only one "-" \(stdin\) per command, and a and b both ask for it/);
  const i = io();
  assert.equal(await runCli(t, ["again", "-"], { ...i.io, stdin: [new TextEncoder().encode("x\n")] }), 2);
  assert.match(i.o.err, /stdin was already read/);
  const j = io();
  assert.equal(await runCli(t, ["two"], j.io), 0);
  assert.deepEqual(JSON.parse(j.o.out), [null, ""]);
});

test("a wait prints what happened or how to resume, with its state's exit code", async () => {
  const quiet = await run(["watch", "abc123", "--timeout", "20ms"]);
  assert.equal(quiet.code, 1);
  assert.match(quiet.out, /^Nothing yet: a message in "Design sync", waited until .+\.\nResume: notes watch abc123 --cursor 0 --timeout 20ms {2}\(keep waiting from where this wait stopped\)\n$/);
  setTimeout(() => postMessage("abc123", "Riley", "Lakeside room, 9:30"), 10);
  const heard = await run(["watch", "abc123", "--timeout", "5s", "--json"]);
  assert.equal(heard.code, 0);
  const w = JSON.parse(heard.out);
  assert.equal(w.state, "satisfied");
  assert.equal(w.events[0].summary, "Lakeside room, 9:30");
  const bad = await run(["watch", "abc123", "--timeout", "soon"]);
  assert.equal(bad.code, 2);
  assert.match(bad.err, /Fix: notes watch abc123 --timeout 2m\./);
});

test("dispatch runs the plan or run() with the tool's own context, and prints nothing", async () => {
  interface Ctx extends RunContext {
    who: string;
  }
  const t = defineCli<Ctx>({
    name: "t",
    about: ["t"],
    commands: [
      defineCommand({ name: "send", summary: "S.", effect: "others", run: (_, ctx: Ctx) => `sent by ${ctx.who}`, plan: (_, ctx: Ctx) => outcome({ action: "send", effect: "others", audience: { only: false, who: "all" }, state: "planned", summary: `would send as ${ctx.who}` }) }),
    ],
  });
  const ctx: Ctx = { who: "agent:a", json: false, stdin: async () => "" };
  const parsed = parse(t, ["send", "--why", "x"]);
  assert.equal(parsed.kind, "run");
  assert.equal(await dispatch(t, parsed as Parsed, ctx), "sent by agent:a");
  const dry = (await dispatch(t, parse(t, ["send", "--why", "x", "--dry-run"]) as Parsed, ctx)) as { summary: string };
  assert.equal(dry.summary, "would send as agent:a");
  const o = io();
  assert.equal(printResult(t, (parsed as Parsed).command, {}, "sent", false, o.io), 0);
  assert.equal(o.o.out, '"sent"\n');
});

test("the example's reads and waits: a limit, the default time limit and a cursor", async () => {
  assert.equal((await run(["rooms", "--limit", "1"])).out, "[abc123] Design sync\n");
  postMessage("abc123", "Riley", "first");
  const resumed = await run(["watch", "abc123", "--cursor", "0", "--json"]);
  assert.equal(JSON.parse(resumed.out).events[0].summary, "first");
  const quiet = await run(["watch", "abc123"]);
  assert.equal(quiet.code, 1);
});

test("a failed outcome is the error line too, and a help topic that ends its own line gets no second newline", async () => {
  const t = defineCli({ name: "t", about: ["t"], commands: [defineCommand({ name: "send", summary: "S.", effect: "others", run: () => outcome({ action: "send", state: "failed", summary: "Not sent.", error: { code: "gone", exit: 1, thing: "send", problem: "the chat is gone", fix: "t chats" } }) })] });
  const a = io();
  assert.equal(await runCli(t, ["send", "--why", "x"], a.io), 1);
  assert.equal(a.o.err, "t: send: the chat is gone. Fix: t chats.\n");
  const b = io();
  assert.equal(await runCli(t, ["help", "refs"], b.io, { topics: { refs: "refs\n" } }), 0);
  assert.equal(b.o.out, "refs\n");
});
