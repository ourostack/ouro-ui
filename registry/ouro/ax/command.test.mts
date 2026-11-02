import { test } from "node:test";
import assert from "node:assert/strict";
import { checkInput, defineCli, defineCommand, exampleArgv, findCommand, inputSchema, parse, toArgv, usageOf, type Parsed } from "./command.ts";
import { renderCommand } from "./help.ts";
import { AxError } from "./problem.ts";
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
  const p = run(["post", "abc123", "Running", "late", "--why=Jo asked", "--tone", "markdown", "--json"]);
  assert.equal(p.command.name, "post");
  assert.deepEqual(p.input, { room: "abc123", text: "Running late", why: "Jo asked", tone: "markdown", json: true });
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
  assert.deepEqual(refusal(["edit", "x"]), { code: "ambiguous", exit: 2, thing: "edit", problem: '"edit" could mean 2 things, so it does nothing: a note only you see; or a message other people see', fix: "notes note x <text> or notes post x <text> --why <why>" });
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

test("a command's own why flag replaces the generated one in help, the unknown-flag error and the input schema", () => {
  const description = 'Who asked you, by name, and what they said, like "Riley asked me to post the banner".';
  const t = defineCli({
    name: "t",
    about: [],
    commands: [
      defineCommand({ name: "post", summary: "P.", effect: "others", flags: { why: { type: "string", required: true, placeholder: '"<who asked>"', description }, tone: { type: "string", description: "Tone." } }, examples: ['t post --why "Riley asked"'] }),
      defineCommand({ name: "tidy", summary: "T.", effect: "private", why: "none" }),
    ],
  });
  const post = findCommand(t, ["post"])!.command;
  const problem = (argv: string[]) => {
    try {
      parse(t, argv);
    } catch (e) {
      assert.ok(e instanceof AxError);
      return e.shape.problem;
    }
    throw new Error("parsed");
  };
  assert.equal(problem(["post", "--zzzzzz"]), "there is no --zzzzzz; its flags are --why, --tone");
  assert.equal(problem(["tidy", "--zzzzzz"]), "there is no --zzzzzz; it takes no flags of its own");
  assert.deepEqual(inputSchema(t, post).properties.why, { type: "string", description });
  assert.deepEqual(inputSchema(t, post).required, ["why"]);
  const help = renderCommand(t, post, 80);
  assert.equal(help.split("\n").filter((line) => line.trimStart().startsWith("--why")).length, 1);
  assert.match(help, /by name/);
  assert.doesNotMatch(help, /it is logged with the action/);
});

test("usage, the input schema and toArgv come from the same definition", () => {
  const post = findCommand(cli, ["post"])!.command;
  assert.equal(usageOf(cli, post), 'post <room> <text...>|- --why "<who asked you, and what they said>" [--dry-run] [--tone plain|markdown]');
  assert.deepEqual(inputSchema(cli, post), {
    type: "object",
    properties: {
      room: { type: "string", description: "The room's short id." },
      text: { type: "string", description: "The message." },
      why: { type: "string", description: 'Who asked you, and what they said, like "Riley asked me to post the banner"; it is logged with the action.' },
      "dry-run": { type: "boolean", description: "Show what it would do and who would see it, and do nothing." },
      tone: { type: "string", enum: ["plain", "markdown"], description: "How the text is formatted." },
    },
    required: ["room", "text", "why"],
    additionalProperties: false,
  });
  assert.deepEqual(toArgv(cli, post, { room: "abc123", text: "-starts with a dash\nand two lines", why: "Jo asked", tone: "plain" }), { argv: ["post", "abc123", "-", "--why", "Jo asked", "--tone", "plain"], stdin: "-starts with a dash\nand two lines" });
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

test("list and required flags, examples that name another tool, a shorter command after a longer one, and toArgv's forms", () => {
  const t = defineCli({
    name: "t",
    about: [],
    commands: [
      defineCommand({ name: "draft set", summary: "Set.", effect: "private", args: [{ name: "conversation", description: "C.", required: true }], flags: { ids: { type: "list", description: "Ids." }, mode: { type: "string", description: "Mode.", required: true }, quiet: { type: "boolean", description: "Q." } }, examples: ["see also: other draft set"] }),
      defineCommand({ name: "draft", summary: "Show the draft.", effect: "private" }),
    ],
  });
  const set = findCommand(t, ["draft", "set", "x"])!;
  assert.equal(set.used, 2);
  assert.equal(findCommand(t, ["draft"])!.command.name, "draft");
  assert.equal(usageOf(t, set.command), "draft set <conversation> --mode <mode> [--ids <ids,ids>] [--quiet]");
  assert.deepEqual((parse(t, ["draft", "set", "c1", "--ids", "a,b c", "--mode", "m"]) as Parsed).input, { conversation: "c1", ids: ["a", "b", "c"], mode: "m" });
  assert.throws(() => parse(t, ["draft", "set", "c1"]), (e: AxError) => e.shape.code === "missing-flag" && e.shape.problem === "needs --mode: Mode" && e.shape.fix === "t draft set c1 --mode <mode>");
  const schema = inputSchema(t, set.command);
  assert.deepEqual(schema.properties["ids"], { type: "array", description: "Ids.", items: { type: "string" } });
  assert.deepEqual(schema.required, ["conversation", "mode"]);
  assert.throws(() => checkInput(t, set.command, { conversation: "c", mode: "m", ids: "a" }), /"ids" is an array of strings, not string/);
  assert.throws(() => checkInput(t, set.command, { conversation: "c", mode: "m", ids: [1] }), /"ids" is an array of strings, not array/);
  assert.throws(() => checkInput(t, set.command, { conversation: "c" }), (e: AxError) => e.shape.code === "missing-arg" && e.shape.fix === '{"conversation":"c","mode":"<mode>"}');
  assert.throws(() => checkInput(t, set.command, ["x"]), /needs "conversation"/);
  assert.throws(() => checkInput(t, set.command, null), /needs "conversation"/);
  assert.deepEqual(toArgv(t, set.command, { conversation: "c", ids: ["a", "b"], quiet: true, mode: "m" }), { argv: ["draft", "set", "c", "--ids", "a,b", "--mode", "m", "--quiet"], stdin: null });
  assert.deepEqual(toArgv(t, set.command, { quiet: false }), { argv: ["draft", "set"], stdin: null });
  const bare = findCommand(t, ["draft"])!.command;
  assert.deepEqual(toArgv(t, bare, {}), { argv: ["draft"], stdin: null });
  assert.throws(() => checkInput(t, bare, { x: 1 }), /there is no argument "x"; it takes none/);
});

test("-h as a flag's value is the value, a rest list keeps its words apart, and an ambiguous phrase refuses", () => {
  const t = defineCli({
    name: "t",
    about: [],
    ambiguous: { "draft send": [{ means: "send the draft others will see", use: "send <conversation> --draft --why <why>" }] },
    commands: [
      defineCommand({ name: "calendar", summary: "C.", effect: "private", flags: { category: { type: "string", description: "Cat." }, all: { type: "boolean", description: "All." } } }),
      defineCommand({ name: "tag", summary: "T.", effect: "private", args: [{ name: "ref", description: "R.", required: true }, { name: "names", description: "N.", rest: "list" }] }),
      defineCommand({ name: "draft", summary: "D.", effect: "private", args: [{ name: "what", description: "W." }] }),
      defineCommand({ name: "draft set", summary: "S.", effect: "private" }),
    ],
  });
  assert.deepEqual((parse(t, ["calendar", "--category", "-h"]) as Parsed).input, { category: "-h" });
  assert.deepEqual(parse(t, ["calendar", "--all", "-h"]), { kind: "help", topic: "calendar", json: false });
  assert.deepEqual(parse(t, ["--json", "-h"]), { kind: "help", topic: undefined, json: true });
  assert.deepEqual((parse(t, ["tag", "x", "Q&A", "launch plan", "-wip"]) as Parsed).input, { ref: "x", names: ["Q&A", "launch plan", "-wip"] });
  const tag = findCommand(t, ["tag"])!.command;
  assert.deepEqual(inputSchema(t, tag).properties["names"], { type: "array", items: { type: "string" }, description: "N." });
  assert.deepEqual(toArgv(t, tag, { ref: "x", names: ["a b", "c"] }), { argv: ["tag", "x", "a b", "c"], stdin: null });
  assert.deepEqual(checkInput(t, tag, { ref: "x", names: ["a"] }), { ref: "x", names: ["a"] });
  assert.throws(() => parse(t, ["draft", "send", "c1"]), (e: AxError) => e.shape.code === "ambiguous" && e.shape.thing === "draft send" && e.shape.fix === "t send <conversation> --draft --why <why>");
  assert.deepEqual((parse(t, ["draft", "other"]) as Parsed).input, { what: "other" });
  const two = defineCli({ name: "u", about: [], ambiguous: { edit: [{ means: "a note", use: "note" }], "edit sent": [{ means: "a sent message", use: "edit-sent" }] }, commands: [defineCommand({ name: "note", summary: "N.", effect: "private" })] });
  assert.throws(() => parse(two, ["edit", "sent", "x"]), (e: AxError) => e.shape.thing === "edit sent");
  assert.throws(() => parse(two, ["edit", "x"]), (e: AxError) => e.shape.thing === "edit");
  assert.throws(() => defineCli({ name: "t", about: [], ambiguous: { "draft set": [] }, commands: [defineCommand({ name: "draft set", summary: "S.", effect: "private" })] }), /"draft set" is both a command and an ambiguous word/);
});

test("an ambiguous word's fix carries the words and flags the agent gave, in each meaning's command", () => {
  assert.equal(refusal(["edit"]).fix, "notes note <room> <text> or notes post <room> <text> --why <why>");
  assert.equal(refusal(["edit", "abc123", "Thursday?", "--tone", "plain", "--why", "Jo asked"]).fix, 'notes note abc123 "Thursday?" or notes post abc123 "Thursday?" --tone plain --why "Jo asked"');
  assert.equal(refusal(["edit", "abc123", "x", "--why=Jo", "--dry-run", "--json"]).fix, "notes note abc123 x or notes post abc123 x --why Jo --dry-run");
  const tool = defineCli({
    name: "t",
    about: [],
    ambiguous: {
      edit: [
        { means: "a draft", use: "draft set {args} {flags}" },
        { means: "a sent message", use: 'edit-sent {args} {flags} --why "..."' },
        { means: "as written", use: "help edit" },
        { means: "no such command", use: "gone {args}" },
      ],
    },
    commands: [
      defineCommand({ name: "draft set", summary: "D.", effect: "private", args: [{ name: "conversation", description: "C.", required: true }, { name: "note", description: "N." }], flags: { text: { type: "string", description: "T." }, token: { type: "string", description: "K.", sensitive: true }, wide: { type: "boolean", description: "W." } }, run: () => null }),
      defineCommand({ name: "edit-sent", summary: "E.", effect: "others", args: [{ name: "message", description: "M.", required: true }, { name: "more", description: "R.", rest: true }], flags: { text: { type: "string", description: "T." } }, run: () => null }),
    ],
  });
  const fix = (argv: string[]) => {
    try {
      parse(tool, argv);
    } catch (e) {
      return (e as AxError).shape.fix;
    }
    return null;
  };
  assert.equal(fix(["edit", "c#1", "--text", "Thursday?", "--token", "s3cret", "--wide", "--zz"]), 't draft set c#1 --text "Thursday?" --token <token> --wide or t edit-sent c#1 --text "Thursday?" --why "..." or t help edit or t gone c#1');
  assert.equal(fix(["edit", "c#1", "--why", "Jo asked", "--text"]), 't draft set c#1 --text or t edit-sent c#1 --why "Jo asked" --text or t help edit or t gone c#1');
  assert.equal(fix(["edit"]), 't draft set <conversation> or t edit-sent <message> --why "..." or t help edit or t gone');
  assert.equal(fix(["edit", "a", "b", "c", "d"]), 't draft set a b c d or t edit-sent a b c d --why "..." or t help edit or t gone a b c d');
});

test("an unknown flag that is one of an argument's words gets that word as its fix", () => {
  const tool = defineCli({ name: "t", about: [], commands: [defineCommand({ name: "calendar", summary: "C.", effect: "private", readOnly: true, args: [{ name: "range", description: "R.", values: ["today", "tomorrow", "week"] }], flags: { matters: { type: "boolean", description: "M." } }, run: () => [] })] });
  const shape = (argv: string[]) => {
    try {
      parse(tool, argv);
    } catch (e) {
      return (e as AxError).shape;
    }
    return null;
  };
  assert.deepEqual(shape(["calendar", "--week", "--matters"]), { code: "unknown-flag", exit: 2, thing: "calendar", problem: 'there is no --week; "week" is a word for <range>, without the dashes', fix: "t calendar week --matters" });
  assert.equal(shape(["calendar", "--mattres"])?.fix, "t calendar --matters");
  assert.equal(shape(["calendar", "--week=1"])?.fix, "t calendar");
  assert.equal(parse(tool, ["calendar", "week"]).kind, "run");
});

test("a tool with a voice takes --quiet, which stays out of the input schema and argv", () => {
  const tool = defineCli({ name: "t", about: [], voice: { banner: ["Hello there."] }, commands: [defineCommand({ name: "list", summary: "L.", effect: "private", readOnly: true, run: () => [] })] });
  assert.deepEqual(run2(tool, ["--quiet", "list"]).input, { quiet: true });
  assert.deepEqual(inputSchema(tool, tool.commands[0]!).properties, {});
  assert.deepEqual(toArgv(tool, tool.commands[0]!, { quiet: true }).argv, ["list"]);
  const own = defineCli({ name: "t", about: [], voice: {}, globalFlags: { quiet: { type: "boolean", description: "Less." } }, commands: tool.commands });
  assert.equal(own.globalFlags["quiet"]!.description, "Less.");
  const none = defineCli({ name: "t", about: [], commands: tool.commands });
  assert.deepEqual(none.globalFlags, {});
  assert.deepEqual(none.voice, {});
  assert.throws(() => defineCli({ name: "t", about: [], voice: { empty: ["Nothing here \u{1F6B2}"] }, commands: [] }), /t: the voice's empty line "Nothing here .*" is not plain ASCII \(no emoji, curly quotes or tabs\)\. Fix: one line of plain ASCII, at most 72 characters\./);
});

function run2(tool: ReturnType<typeof defineCli>, argv: string[]): Parsed {
  const p = parse(tool, argv);
  assert.equal(p.kind, "run");
  return p as Parsed;
}
