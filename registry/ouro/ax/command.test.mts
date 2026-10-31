import { test } from "node:test";
import assert from "node:assert/strict";
import { checkInput, defineCli, defineCommand, exampleArgv, findCommand, inputSchema, parse, toArgv, usageOf, type Parsed } from "./command.ts";
import { renderCommand } from "./help.ts";
import { AxError } from "./errors.ts";
import { DEFAULT_OUTCOME_EXITS } from "./outcome.ts";
import { exampleCli as cli } from "./example-cli.ts";

const run = (argv: string[]) => {
  const p = parse(cli, argv);
  assert.equal(p.kind, "run");
  return p as Parsed;
};
const refusal = (argv: string[]) => {
  try {
    parse(cli, argv);
  } catch (e) {
    assert.ok(e instanceof AxError);
    return e.shape;
  }
  throw new Error(`${argv.join(" ")} parsed`);
};

test("argv parses to the command and typed input: rest text, numbers, enums, --json", () => {
  const p = run(["post", "abc123", "Running", "late", "--why=Sam asked", "--tone", "markdown", "--json"]);
  assert.equal(p.command.name, "post");
  assert.deepEqual(p.input, { room: "abc123", text: "Running late", why: "Sam asked", tone: "markdown", json: true });
  assert.equal(p.json, true);
  assert.deepEqual(run(["rooms", "--limit", "5"]).input, { limit: 5 });
  assert.deepEqual(run(["note", "abc123", "--", "--not-a-flag"]).input, { room: "abc123", text: "--not-a-flag" });
});

test("help is asked three ways", () => {
  assert.deepEqual(parse(cli, ["help"]), { kind: "help", topic: undefined, json: false });
  assert.deepEqual(parse(cli, ["help", "post", "--json"]), { kind: "help", topic: "post", json: true });
  assert.deepEqual(parse(cli, ["post", "-h"]), { kind: "help", topic: "post", json: false });
  assert.deepEqual(parse(cli, ["--help"]), { kind: "help", topic: undefined, json: false });
});

test("every refusal names the exact command to run instead", () => {
  assert.deepEqual(refusal(["post", "abc123", "hi"]), { code: "needs-why", exit: 2, thing: "post", problem: "other people will see this as the person's, so it needs --why: who asked you, and what they said", fix: 'notes post abc123 hi --why "<who asked you, and what they said>"' });
  const why = defineCli({ name: "t", about: [], commands: [defineCommand({ name: "discard", summary: "D.", effect: "private", why: "required" })] });
  assert.throws(() => parse(why, ["discard"]), /discard: it acts on the person's own things for them, so it needs --why: who asked you, and what they said\. Fix: t discard --why "<who asked you, and what they said>"\./);
  assert.equal(refusal(["rooms", "--limt", "5"]).fix, "notes rooms --limit 5");
  assert.match(refusal(["rooms", "--zzzzzz"]).problem, /there is no --zzzzzz; its flags are --limit/);
  assert.equal(refusal(["rooms", "--limit", "500"]).fix, "notes rooms --limit 1");
  assert.equal(refusal(["rooms", "--limit"]).fix, "notes rooms --limit <N>");
  assert.equal(refusal(["post", "abc123", "hi", "--why", "x", "--tone", "markdwn"]).fix, "notes post abc123 hi --why x --tone markdown");
  assert.equal(refusal(["note"]).fix, "notes rooms, then notes note <room>");
  assert.equal(refusal(["note", "abc123"]).fix, "notes note abc123 <text>");
  assert.equal(refusal(["rooms", "extra"]).code, "extra-arg");
  assert.equal(refusal(["rooms", "extra"]).fix, "notes rooms");
  assert.deepEqual([refusal(["rooms", "--limit", "1", "--limit", "2"]).code, refusal(["rooms", "--limit", "1", "--limit", "2"]).fix], ["duplicate-flag", "notes rooms --limit 1"]);
  assert.equal(refusal(["rooms", "--json=yes"]).code, "bad-value");
  assert.deepEqual(refusal(["edit", "x"]), { code: "ambiguous", exit: 2, thing: "edit", problem: '"edit" could mean 2 things, so it does nothing: a note only you see; or a message other people see', fix: "notes note <room> <text> or notes post <room> <text> --why <why>" });
  assert.equal(refusal(["romos"]).fix, "notes rooms");
  assert.equal(refusal(["zzzzzzzz"]).fix, "notes --help");
  assert.equal(refusal([]).code, "no-command");
});

test("multi-word commands: the longest name wins, a bare group word lists its commands", () => {
  const c = defineCli({
    name: "t",
    about: ["t"],
    commands: [
      defineCommand({ name: "draft set", summary: "Set.", effect: "private", args: [{ name: "conversation", description: "c", required: true }] }),
      defineCommand({ name: "draft show", summary: "Show.", effect: "private", readOnly: true }),
    ],
  });
  assert.equal(findCommand(c, ["draft", "set", "x"])?.used, 2);
  assert.throws(() => parse(c, ["draft"]), /"draft" needs one of draft set, draft show\. Fix: t help draft\./);
  assert.throws(() => parse(c, ["draft", "sett", "x"]), /there is no "draft sett".* Fix: t draft set x\./);
});

test("a loose command passes unknown flags and extra words through", () => {
  const c = defineCli({ name: "t", about: ["t"], commands: [defineCommand({ name: "legacy", summary: "Old.", effect: "private", loose: true })] });
  const p = parse(c, ["legacy", "a", "--x", "1", "--y", "--json=yes"]) as Parsed;
  assert.deepEqual(p.unchecked, { x: "1", y: true, json: "yes", _: "a" });
});

test("definitions are checked when the tool is built: names, rest last, examples that parse", () => {
  const cmd = (over: object) => defineCommand({ name: "a", summary: "A.", effect: "private", ...over });
  assert.throws(() => defineCli({ name: "t", about: [], commands: [cmd({}), cmd({})] }), /two commands are named "a"/);
  assert.throws(() => defineCli({ name: "t", about: [], commands: [cmd({ args: [{ name: "x", description: "", rest: true }, { name: "y", description: "" }] })] }), /must be the last argument/);
  assert.throws(() => defineCli({ name: "t", about: [], commands: [cmd({ examples: ["t a --nope"] })] }), /the example "t a --nope" does not parse/);
  assert.throws(() => defineCli({ name: "t", about: [], commands: [cmd({})], ambiguous: { a: [] } }), /both a command and an ambiguous word/);
  assert.throws(() => defineCli({ name: "t", about: [], commands: [cmd({})], outcomeExits: { ...DEFAULT_OUTCOME_EXITS, uncertain: "possibly done" } }), /no code named "possibly done"/);
  assert.deepEqual(exampleArgv("t", `"x" | t a - --why y`), ["a", "-", "--why", "y"]);
  assert.deepEqual(exampleArgv("t", "t watch | grep x"), ["watch"]);
  assert.equal(exampleArgv("t", "other a"), null);
  assert.deepEqual(exampleArgv("t", `t a "two words" 'single quoted'`), ["a", "two words", "single quoted"]);
});

test("usage, the input schema and toArgv come from the same definition", () => {
  const post = findCommand(cli, ["post"])!.command;
  assert.equal(usageOf(cli, post), 'post <room> <text...>|- --why "<who asked you, and what they said>" [--dry-run] [--tone plain|markdown]');
  assert.deepEqual(inputSchema(cli, post), {
    type: "object",
    properties: {
      room: { type: "string", description: "The room's short id." },
      text: { type: "string", description: "The message." },
      why: { type: "string", description: "Who asked you, and what they said; it is logged with the action." },
      "dry-run": { type: "boolean", description: "Show what it would do and who would see it, and do nothing." },
      tone: { type: "string", enum: ["plain", "markdown"], description: "How the text is formatted." },
    },
    required: ["room", "text", "why"],
    additionalProperties: false,
  });
  assert.deepEqual(toArgv(cli, post, { room: "abc123", text: "-starts with a dash\nand two lines", why: "Sam asked", tone: "plain" }), { argv: ["post", "abc123", "-", "--why", "Sam asked", "--tone", "plain"], stdin: "-starts with a dash\nand two lines" });
});

test("checkInput refuses a bad MCP call with the arguments to send instead", () => {
  const post = findCommand(cli, ["post"])!.command;
  const shape = (raw: unknown) => {
    try {
      checkInput(cli, post, raw);
    } catch (e) {
      assert.ok(e instanceof AxError);
      return e.shape;
    }
    throw new Error("accepted");
  };
  assert.deepEqual(shape({ room: "abc123", text: "hi" }), { code: "needs-why", exit: 2, thing: "post", problem: `other people will see this as the person's, so it needs "why": who asked you, and what they said`, fix: '{"room":"abc123","text":"hi","why":"<who asked you, and what they said>"}' });
  assert.equal(shape({ rom: "abc123", text: "hi", why: "x" }).fix, '{"text":"hi","why":"x","room":"abc123"}');
  assert.equal(shape({ room: "abc123", text: "hi", why: "x", tone: "markdwn" }).fix, '{"room":"abc123","text":"hi","why":"x","tone":"markdown"}');
  assert.equal(shape({ room: 5, text: "hi", why: "x" }).fix, '{"room":"5","text":"hi","why":"x"}');
  const rooms = findCommand(cli, ["rooms"])!.command;
  assert.throws(() => checkInput(cli, rooms, { limit: 0 }), /out of range/);
  assert.deepEqual(checkInput(cli, post, { room: "abc123", text: "hi", why: "x", tone: null }), { room: "abc123", text: "hi", why: "x" });
});

test("an argument and a flag of one name are refused when the tool is built", () => {
  assert.throws(() => defineCli({ name: "t", about: [], commands: [defineCommand({ name: "send", summary: "S.", effect: "private", args: [{ name: "text", description: "T." }], flags: { text: { type: "string", description: "T." } } })] }), /send: <text> and --text share one input key\. Fix: rename one\./);
});

test("a flag's value may start with -- unless it is one of the command's flags", () => {
  const t = defineCli({ name: "t", about: [], commands: [defineCommand({ name: "say", summary: "S.", effect: "private", flags: { text: { type: "string", description: "T." }, loud: { type: "boolean", description: "L." } } })] });
  assert.deepEqual((parse(t, ["say", "--text", "--- Running late"]) as Parsed).input, { text: "--- Running late" });
  assert.throws(() => parse(t, ["say", "--text", "--loud"]), /--text needs a value/);
  assert.throws(() => parse(t, ["say", "--text", "--loud=true"]), /--text needs a value/);
});

test("unless takes several flags, for an argument and for a flag; help and the schema say so", () => {
  const t = defineCli({
    name: "t",
    about: [],
    commands: [
      defineCommand({
        name: "send",
        summary: "S.",
        effect: "others",
        args: [{ name: "words", description: "W.", required: true, rest: true, unless: ["text", "draft"] }],
        flags: { text: { type: "string", description: "T." }, draft: { type: "boolean", description: "D." }, why: { type: "string", description: "Why.", required: true, unless: "why-file" }, "why-file": { type: "string", description: "F." } },
      }),
    ],
  });
  assert.deepEqual((parse(t, ["send", "--draft", "--why-file", "w.txt"]) as Parsed).input, { draft: true, "why-file": "w.txt" });
  assert.throws(() => parse(t, ["send", "--why", "x"]), /needs <words> \(or --text, --draft\)/);
  assert.throws(() => parse(t, ["send", "hi"]), /so it needs --why: .* Fix: t send hi --why <why>\./);
  const send = findCommand(t, ["send"])!.command;
  const schema = inputSchema(t, send);
  assert.deepEqual(schema.required, []);
  assert.equal(schema.properties?.["why"]?.description, "Why. Not needed with why-file.");
  assert.equal(schema.properties?.["words"]?.description, "W. Not needed with text or draft.");
  assert.match(renderCommand(t, send), /Why\. Required unless --why-file\./);
  assert.throws(() => checkInput(t, send, { why: "x" }), /needs "words" \(or "text", "draft"\)/);
  assert.throws(() => checkInput(t, send, { text: "x" }), /needs "why" \(or "why-file"\)/);
  assert.deepEqual(checkInput(t, send, { text: "x", "why-file": "w" }), { text: "x", "why-file": "w" });
  const h = defineCli({ name: "h", about: [], commands: [defineCommand({ name: "a", summary: "A.", effect: "private", flags: { b: { type: "string", description: "B.", required: true, unless: ["c", "d"] }, c: { type: "boolean", description: "C." } } })] });
  assert.match(renderCommand(h, h.commands[0]!), /B\. Required unless --c or --d\./);
  assert.throws(() => checkInput(h, h.commands[0]!, {}), /needs "b" \(or "c", "d"\)/);
});

test("global flags may come before the command's words", () => {
  const t = defineCli({ name: "t", about: [], globalFlags: { agent: { type: "string", description: "A." }, quiet: { type: "boolean", description: "Q." } }, commands: [defineCommand({ name: "look", summary: "L.", effect: "private", readOnly: true })] });
  assert.deepEqual((parse(t, ["--json", "--agent", "a1", "--quiet", "look"]) as Parsed).input, { json: true, agent: "a1", quiet: true });
  assert.deepEqual((parse(t, ["--agent=a1", "look"]) as Parsed).input, { agent: "a1" });
  assert.deepEqual(parse(t, ["--json", "--help"]), { kind: "help", topic: undefined, json: true });
});

test("an unknown flag's fix drops its value once the command's words are all given; a sensitive value is never printed back", () => {
  const t = defineCli({
    name: "t",
    about: [],
    commands: [defineCommand({ name: "edit", summary: "E.", effect: "private", args: [{ name: "ref", description: "R." }, { name: "text", description: "T." }], flags: { intent: { type: "string", description: "I.", sensitive: true }, level: { type: "number", description: "L.", sensitive: true } } })],
  });
  const shape = (argv: string[]) => {
    try {
      parse(t, argv);
    } catch (e) {
      return (e as AxError).shape;
    }
    throw new Error("parsed");
  };
  assert.equal(shape(["edit", "x", "y", "--again", "a3fd4e"]).fix, "t edit x y");
  assert.equal(shape(["edit", "x", "--again", "a3fd4e"]).fix, "t edit x a3fd4e");
  assert.equal(shape(["edit", "x", "y", "--intent", "secret1", "--intent", "secret2"]).fix, "t edit x y --intent <intent>");
  assert.equal(shape(["edit", "x", "y", "--intent=secret1", "--intent=secret2"]).fix, 't edit x y "--intent=<intent>"');
  assert.equal(shape(["edit", "x", "y", "--level", "high"]).problem, "--level takes a number, not the value given");
});
