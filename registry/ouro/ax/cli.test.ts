import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "./cli.ts";
import { exampleCli as cli, resetRooms } from "./example-cli.ts";

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
  assert.equal((await run(["post", "abc123", "Running late", "--why", "Sam asked"])).out, 'Posted to "Design sync" as you. Sam Lee, Ana Ruiz and 1 other can see it.\n');
});

test("an error is one stderr line with the fix and its exit code; --json also prints the error shape", async () => {
  const r = await run(["post", "abc123", "hi"]);
  assert.equal(r.code, 2);
  assert.equal(r.out, "");
  assert.equal(r.err, `notes: post: other people will see this as the person's, so it needs --why: who asked you, and what they said. Fix: notes post abc123 hi --why "<who asked you, and what they said>".\n`);
  const j = await run(["note", "zzz", "x", "--json"]);
  assert.equal(j.code, 1);
  assert.equal(JSON.parse(j.out).error.fix, "notes rooms");
  assert.equal((await run(["post", "abc123", "-", "--why", "-"], "x")).code, 2);
  const thrown = await run(["note", "abc123", "x"].concat([]), undefined);
  assert.equal(thrown.code, 0);
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
