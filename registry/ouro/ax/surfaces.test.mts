import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkSurfaces, extractSurfaces, leadsWithFix, main, ratchet, surfacesText, type Surfaces } from "./surfaces.ts";

const made: string[] = [];
after(() => made.forEach((dir) => rmSync(dir, { recursive: true, force: true })));
const scratch = () => {
  const dir = mkdtempSync(join(tmpdir(), "surfaces-"));
  made.push(dir);
  return dir;
};

const manifest = (rest: Partial<Surfaces>): Surfaces => ({ ax: "surfaces/1", tool: "notes", ...rest });
const keys = (m: Partial<Surfaces>) => checkSurfaces(manifest(m)).findings.map((f) => f.key);

test("error.leads-with-fix: the first sentence is the fix, after an optional tool label", () => {
  for (const text of [
    "Pass --why. The send reaches other people.",
    "notes send: pass --why, because the send reaches other people.",
    "desk: push: Run desk_status, then try again. The push failed.",
    "Fix: pass --text. The draft is empty.",
    "To continue, sign in with notes login. Your session ended.",
    "Please retry in a minute; the service is busy.",
    "${label}: Call desk_doctor. Something is off.",
  ]) {
    assert.deepEqual(leadsWithFix(text), { leads: true, later: false }, text);
  }
  assert.deepEqual(leadsWithFix("send: the draft is empty. Fix: pass --text."), { leads: false, later: true });
  assert.deepEqual(leadsWithFix("The draft is empty. Pass --text to send it."), { leads: false, later: true });
  assert.deepEqual(leadsWithFix("The draft is empty."), { leads: false, later: false });
  assert.deepEqual(leadsWithFix("notes: no such note"), { leads: false, later: false });
  assert.deepEqual(leadsWithFix(""), { leads: false, later: false });
  assert.deepEqual(leadsWithFix("42 notes were lost"), { leads: false, later: false });
  assert.deepEqual(leadsWithFix("Then to continue, sign in. The session ended."), { leads: true, later: false });
});

test("error.leads-with-fix: says whether the fix is missing or only late", () => {
  const late = checkSurfaces(manifest({ errors: [{ id: "a", text: "Empty draft. Pass --text.", code: "empty" }] })).findings;
  assert.equal(late.length, 1);
  assert.equal(late[0]!.problem, "puts its fix after the problem");
  const none = checkSurfaces(manifest({ errors: [{ id: "b", text: "Empty draft.", code: "empty" }] })).findings;
  assert.equal(none[0]!.problem, "has no fix");
  assert.deepEqual(keys({ errors: [{ id: "c", text: "Pass --text. The draft is empty.", code: "empty" }] }), []);
});

test("error.has-code: a code is present and a lower-case slug", () => {
  const error = (code: string | undefined) => ({ id: "x", text: "Pass --text.", ...(code === undefined ? {} : { code }) });
  assert.deepEqual(keys({ errors: [error(undefined)] }), ["error.has-code:x"]);
  assert.deepEqual(keys({ errors: [error("")] }), ["error.has-code:x"]);
  assert.deepEqual(keys({ errors: [error("Not A Code")] }), ["error.has-code:x"]);
  assert.deepEqual(keys({ errors: [error("send_empty"), { ...error("desk.push-blocked"), id: "y" }] }), []);
});

test("tool.says-when and tool.description-budget: when to use it, within the size budget", () => {
  const tool = (description: string) => ({ name: "notes_send", description });
  assert.deepEqual(keys({ tools: [tool("Use when the person asks to send a note to someone.")] }), []);
  assert.deepEqual(keys({ tools: [tool("Call this to post a note after the draft is approved.")] }), []);
  assert.deepEqual(keys({ tools: [tool("Sends a note.")] }), ["tool.says-when:notes_send"]);
  const long = `Use when sending. ${"It does many things. ".repeat(40)}`;
  assert.deepEqual(keys({ tools: [tool(long)] }), ["tool.description-budget:notes_send"]);
  assert.deepEqual(keys({ tools: [tool(long)], limits: { toolDescription: 2000 } }), []);
  const found = checkSurfaces(manifest({ tools: [tool(long)] })).findings[0]!;
  assert.match(found.problem, new RegExp(`${long.length} characters, over the 600 budget`));
});

test("reply.reports-outcome: an action's reply carries a field that says what happened; a read needs none", () => {
  assert.deepEqual(keys({ replies: [{ id: "browser_command", action: true, fields: ["ok", "page"] }] }), ["reply.reports-outcome:browser_command"]);
  assert.deepEqual(keys({ replies: [{ id: "browser_command", action: true, fields: ["ok", "change", "page"] }] }), []);
  assert.deepEqual(keys({ replies: [{ id: "browser_context", action: false, fields: ["page"] }] }), []);
  assert.deepEqual(keys({ outcomeFields: ["done"], replies: [{ id: "a", action: true, fields: ["change"] }] }), ["reply.reports-outcome:a"]);
  assert.match(checkSurfaces(manifest({ replies: [{ id: "a", action: true, fields: [] }] })).findings[0]!.problem, /no fields/);
});

test("text.no-script: no error, tool description or text sends the agent to a script", () => {
  const code = "x";
  assert.deepEqual(keys({ errors: [{ id: "a", text: "Run npm run writes -- on, then try again.", code }] }), ["text.no-script:a"]);
  const scripts = [
    { id: "b", text: "Run scripts/sync.mjs to catch up." },
    { id: "c", text: "Execute ~/.local/bin/refresh.sh first." },
    { id: "d", text: "Use `node tools/fix.mjs` to repair it." },
  ];
  assert.deepEqual(keys({ texts: scripts }), ["text.no-script:b", "text.no-script:c", "text.no-script:d"]);
  assert.deepEqual(keys({ texts: [{ id: "e", text: "Call desk_doctor to see why." }, { id: "f", text: "Run notes sync to catch up." }] }), []);
  assert.deepEqual(keys({ tools: [{ name: "t", description: "Use when stuck. Run scripts/x.mjs after." }] }), ["text.no-script:t"]);
});

test("a manifest that is not one fails with the fix", () => {
  assert.throws(() => checkSurfaces({ tool: "x" } as never), /"ax" is not "surfaces\/1"\. Fix: write/);
  assert.throws(() => checkSurfaces({ ax: "surfaces/1" } as never), /no "tool"/);
  assert.throws(() => checkSurfaces(manifest({ errors: [{ id: "a", text: "x" }, { id: "a", text: "y" }] })), /two errors share the id "a"/);
  assert.throws(() => checkSurfaces(manifest({ errors: [{ id: "", text: "x" }] })), /the errors list has an entry with no id/);
  assert.throws(() => checkSurfaces(manifest({ tools: [{ name: "t" } as never] })), /tool "t" has no description string/);
  assert.throws(() => checkSurfaces(manifest({ replies: [{ id: "r", fields: [] } as never] })), /reply "r" needs "action"/);
});

test("the ratchet fails a new finding and a fixed one still listed, so the count only goes down", () => {
  const report = checkSurfaces(manifest({ errors: [{ id: "a", text: "Empty.", code: "empty" }, { id: "b", text: "Pass --x.", code: "b" }] }));
  assert.equal(ratchet(report, ["error.leads-with-fix:a"]).ok, true);
  const added = ratchet(report, []);
  assert.deepEqual(added.added.map((f) => f.key), ["error.leads-with-fix:a"]);
  assert.equal(added.ok, false);
  const fixed = ratchet(report, ["error.leads-with-fix:a", "error.leads-with-fix:gone"]);
  assert.deepEqual(fixed.fixed, ["error.leads-with-fix:gone"]);
  assert.equal(fixed.ok, false);
  assert.match(surfacesText(report, fixed, { baselinePath: "base.json" }), /^FAIL: 1 finding in 2 surfaces: 1 in the baseline, 0 new, 1 fixed and still listed\.\nFix: delete these lines from base\.json/);
  assert.match(surfacesText(report, fixed), /^FAIL: .*\nFix: delete these lines from the baseline /);
  const placed = checkSurfaces(manifest({ errors: [{ id: "a", text: "Empty.", code: "empty", where: "src/a.js:3" }] }));
  assert.match(surfacesText(placed, null), /\nerror\.leads-with-fix a \(src\/a\.js:3\): has no fix\./);
  assert.match(surfacesText(report, null), /^FAIL: 1 finding in 2 surfaces\.\nerror\.leads-with-fix a: has no fix\. Fix: add/);
});

const call = async (...args: string[]) => {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(args, { stdout: { write: (s: string) => out.push(s) }, stderr: { write: (s: string) => err.push(s) } });
  return { code, out: out.join(""), err: err.join("") };
};

test("check exits 0 clean, 3 on findings, 2 on a usage mistake, 1 when it cannot read", async () => {
  const dir = scratch();
  const file = join(dir, "surfaces.json");
  writeFileSync(file, JSON.stringify(manifest({ errors: [{ id: "a", text: "Pass --x. It is needed.", code: "a" }] })));
  const clean = await call("check", file);
  assert.equal(clean.code, 0);
  assert.match(clean.out, /^ok: no findings in 1 surface\.\n$/);
  writeFileSync(file, JSON.stringify(manifest({ errors: [{ id: "a", text: "Nope.", code: "a" }] })));
  assert.equal((await call("check", file)).code, 3);
  const json = await call("check", file, "--json");
  assert.equal(json.code, 3);
  assert.equal(JSON.parse(json.out).findings[0].key, "error.leads-with-fix:a");
  const none = await call("check");
  assert.equal(none.code, 2);
  assert.match(none.err, /^surfaces: check: needs one manifest\. Fix: pass the manifest/);
  assert.equal((await call("bogus")).code, 2);
  assert.match((await call()).err, /no command given/);
  assert.match((await call("check", file, "--init")).err, /--init needs a baseline file/);
  assert.match((await call("check", file, "--update")).err, /--update needs a baseline file/);
  assert.equal((await call("check", file, "--baseline")).code, 1);
  assert.equal((await call("check", file, "--update")).code, 2);
  const missing = await call("check", join(dir, "missing.json"));
  assert.equal(missing.code, 1);
  assert.match(missing.err, /^surfaces: ENOENT/);
});

test("a baseline is written once, fails what is new, and only ever shrinks", async () => {
  const dir = scratch();
  const file = join(dir, "surfaces.json");
  const base = join(dir, "nested", "baseline.json");
  const write = (ids: string[]) => writeFileSync(file, JSON.stringify(manifest({ errors: ids.map((id) => ({ id, text: "Nope.", code: id })) })));
  write(["a", "b"]);
  const empty = join(dir, "empty.json");
  writeFileSync(file, JSON.stringify(manifest({})));
  assert.match((await call("check", file, "--baseline", empty, "--init")).out, /^ok: wrote 0 findings to /);
  assert.match(readFileSync(empty, "utf8"), /"findings": \[\]/);
  write(["a", "b"]);
  assert.match((await call("check", file, "--baseline", base, "--init")).out, /^ok: wrote 2 findings to /);
  assert.deepEqual(JSON.parse(readFileSync(base, "utf8")), { ax: "surfaces-baseline/1", findings: ["error.leads-with-fix:a", "error.leads-with-fix:b"] });
  const again = await call("check", file, "--baseline", base, "--init");
  assert.equal(again.code, 2);
  assert.match(again.err, /already exists/);
  const held = await call("check", file, "--baseline", base);
  assert.equal(held.code, 0);
  assert.match(held.out, /^ok: 2 findings in 2 surfaces: 2 in the baseline, 0 new, 0 fixed and still listed\./);
  const asJson = JSON.parse((await call("check", file, "--baseline", base, "--json")).out);
  assert.deepEqual([asJson.ok, asJson.baseline.known, asJson.baseline.added, asJson.baseline.fixed], [true, 2, [], []]);
  write(["a", "b", "c"]);
  const grew = await call("check", file, "--baseline", base);
  assert.equal(grew.code, 3);
  assert.match(grew.out, /error\.leads-with-fix c: has no fix/);
  const refused = await call("check", file, "--baseline", base, "--update");
  assert.equal(refused.code, 3);
  assert.match(refused.out, /a baseline never takes one/);
  write(["a"]);
  const stale = await call("check", file, "--baseline", base);
  assert.equal(stale.code, 3);
  assert.match(stale.out, /error\.leads-with-fix:b/);
  const shrunk = await call("check", file, "--baseline", base, "--update");
  assert.equal(shrunk.code, 0);
  assert.match(shrunk.out, /^ok: .* now lists 1 finding, 1 fewer\./);
  assert.deepEqual(JSON.parse(readFileSync(base, "utf8")).findings, ["error.leads-with-fix:a"]);
  writeFileSync(base, "{}");
  const broken = await call("check", file, "--baseline", base);
  assert.equal(broken.code, 1);
  assert.match(broken.err, /is not a surfaces-baseline\/1 file\. Fix: run the check with --baseline/);
});

test("extract reads the words after a throw, an Error constructor or an error property, with a code and a stable id", async () => {
  const dir = scratch();
  mkdirSync(join(dir, "src"));
  const source = [
    "export function send(draft) {",
    '  if (!draft) throw new Error("The draft is empty, so nothing was sent.");',
    '  if (draft.length > 9) throw new Error("The draft is " + draft.length + " characters, over the limit of 9");',
    '  return { error: `Pass --why: ${draft} reaches other people`, code: "needs_why" };',
    '  throw new Error("short");',
    '  throw new Error("The draft is empty, so nothing was sent again.");',
    String.raw`  throw new Error("Say \"why\" to send " + pick(a, [{ b: 1 }]) + ", then retry " + (x) + " later");`,
    "  throw new Error('Never closed, so skipped",
    "  throw new Error(`A template over",
    "two lines`);",
    "  throw new Error(a + b);",
    '  throw new Error("Pass the flag " + flag);',
    "  throw new Error(`${draft} ${other} ${third}`);",
    "  throw new Error(`Never closed template",
    "}",
  ].join("\n");
  writeFileSync(join(dir, "src", "send.js"), source);
  mkdirSync(join(dir, "src", "node_modules"));
  writeFileSync(join(dir, "src", "node_modules", "dep.js"), 'throw new Error("A dependency failure text here");');
  writeFileSync(join(dir, "src", "send.test.js"), 'throw new Error("A test-only failure text here");');
  const { errors } = extractSurfaces({ root: dir, paths: ["src"], tool: "notes" });
  assert.deepEqual(
    errors!.map((e) => [e.id, e.text, e.code, e.where]),
    [
      ["src/send.js#the-draft-is-empty-so", "The draft is empty, so nothing was sent.", undefined, "src/send.js:2"],
      ["src/send.js#the-draft-is-characters-over", "The draft is ${…} characters, over the limit of 9", undefined, "src/send.js:3"],
      ["src/send.js#pass-why-reaches-other-people", "Pass --why: ${draft} reaches other people", "needs_why", "src/send.js:4"],
      ["src/send.js#the-draft-is-empty-so~2", "The draft is empty, so nothing was sent again.", undefined, "src/send.js:6"],
      ["src/send.js#say-why-to-send-then", 'Say "why" to send ${…}, then retry ${…} later', undefined, "src/send.js:7"],
      ["src/send.js#a-template-over-two-lines", "A template over two lines", undefined, "src/send.js:9"],
      ["src/send.js#pass-the-flag", "Pass the flag ${…}", undefined, "src/send.js:12"],
      ["src/send.js#text", "${draft} ${other} ${third}", undefined, "src/send.js:13"],
    ],
  );
  const out = join(dir, "out", "surfaces.json");
  assert.equal((await call("extract", "src", "--root", dir, "--tool", "notes", "--out", out)).code, 0);
  assert.equal(JSON.parse(readFileSync(out, "utf8")).errors.length, 8);
  const printed = await call("extract", join(dir, "src", "send.js"), "--tool", "notes", "--root", dir);
  assert.equal(printed.code, 0);
  assert.equal(JSON.parse(printed.out).tool, "notes");
  const defaults = JSON.parse((await call("extract", join(dir, "src", "send.js"))).out);
  assert.equal(defaults.tool, "tool");
  assert.equal((await call("extract")).code, 2);
});
