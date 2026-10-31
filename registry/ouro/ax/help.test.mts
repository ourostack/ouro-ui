import { test } from "node:test";
import assert from "node:assert/strict";
import { defineCli, defineCommand, findCommand } from "./command.ts";
import { exampleCli as cli } from "./example-cli.ts";
import { helpJson, renderCommand, renderOverview, wrap } from "./help.ts";

test("the overview is the two headings, one line per command, and the exit codes", () => {
  assert.equal(
    renderOverview(cli),
    [
      "notes: a toy tool built from Ouro AX definitions.",
      "",
      "Only you see these",
      "  rooms   The rooms, with their short ids.",
      "  note    Add a private note to a room.",
      "  watch   Wait for the next message in a room, then print it.",
      "",
      "Other people see these",
      "  post    Post a message everyone in the room sees.",
      "",
      "Output: --json on every command. Exit codes: 0 ok, 1 error, 2 usage, 3 unavailable. Errors: one line",
      "that says what to do instead.",
      "Details: notes help <command>",
      "",
    ].join("\n"),
  );
});

test("a multi-word group shows once, with its group summary", () => {
  const c = defineCli({ name: "t", about: ["t"], groups: { draft: "Edit the draft." }, commands: [defineCommand({ name: "draft set", summary: "Set.", effect: "private" }), defineCommand({ name: "draft show", summary: "Show.", effect: "private" })] });
  assert.match(renderOverview(c), /\n {2}draft {3}Edit the draft\.\n\n/);
});

test("a command's help is generated from its definition, and an others command says so first", () => {
  const text = renderCommand(cli, findCommand(cli, ["post"])!.command);
  assert.match(text, /^Other people see these: run it only when a human asked you to, with --why\./);
  assert.match(text, /\nDefinition\n {2}notes post <room> <text\.\.\.>\|- --why "<who asked you, and what they said>" \[--dry-run\] \[--tone\n {4}plain\|markdown\]\n {2}<room> {26}The room's short id\. "notes rooms" lists them\.\n/);
  assert.match(text, /\n {2}--dry-run {23}Show what it would do and who would see it, and do nothing\.\n/);
  assert.match(text, /\n {2}--tone plain\|markdown {11}How the text is formatted\.\n/);
  assert.match(text, /\nExamples\n {2}notes post abc123/);
  assert.ok(text.split("\n").every((l) => l.length <= 100));
});

test("help --json is the manifest: effect, who sees it, whether it reads, why, schema, exit codes, error shape", () => {
  const j = helpJson(cli);
  const post = j.commands.find((c) => c.name === "post")!;
  assert.equal(post.whoSees, "Other people see these");
  assert.equal(post.needsWhy, true);
  assert.equal(j.commands.find((c) => c.name === "rooms")!.readOnly, true);
  assert.deepEqual(j.exitCodes.map((e) => e.code), [0, 1, 2, 3]);
  assert.deepEqual(Object.keys(j.errorShape.error), ["code", "exit", "thing", "problem", "fix", "message"]);
});

test("wrap keeps long words whole and indents every line", () => {
  assert.deepEqual(wrap("aaa bbb ccc", 2, 0, 8), ["aaa bbb", "  ccc"]);
  assert.deepEqual(wrap("averyveryverylongword x", 0, 0, 5), ["averyveryverylongword", "x"]);
});

test("a flag read from stdin says so, and a command without examples has none in its manifest", () => {
  const c = defineCli({ name: "t", about: ["t"], commands: [defineCommand({ name: "say", summary: "Say.", effect: "private", flags: { text: { type: "string", description: "The text.", stdin: true } } })] });
  assert.match(renderCommand(c, c.commands[0]!), /The text\. "-" reads it from stdin\./);
  assert.deepEqual(helpJson(c).commands[0]!.examples, []);
});
