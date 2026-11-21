import { test } from "node:test";
import assert from "node:assert/strict";
import { defineCli, defineCommand, findCommand, usageOf } from "#ouro-ax/ax-command.ts";
import { exampleCli as cli } from "#ouro-ax/example-cli.ts";
import { helpJson, renderCommand, renderOverview, wrap } from "#ouro-ax/help.ts";

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

test("a multi-word command with no group summary is listed by its whole name, never as its first word", () => {
  const c = defineCli({ name: "t", about: ["t"], commands: [defineCommand({ name: "peer send", summary: "Send a message.", effect: "others" }), defineCommand({ name: "peer inbox", summary: "Read new messages.", effect: "private" }), defineCommand({ name: "peer watch", summary: "Watch for new messages.", effect: "private" })] });
  const text = renderOverview(c);
  assert.match(text, /\n {2}peer inbox {3}Read new messages\.\n {2}peer watch {3}Watch for new messages\.\n/);
  assert.match(text, /\n {2}peer send {4}Send a message\.\n/);
  assert.doesNotMatch(text, /\n {2}peer {2}/);
});

test("an overview line too long for the width wraps its summary under itself", () => {
  const long = "send a message to the agent on the other machine, through a secret gist, within six minutes of sending";
  const c = defineCli({ name: "t", about: ["t"], commands: [defineCommand({ name: "send", summary: long, effect: "others" }), defineCommand({ name: "ls", summary: "List.", effect: "private" })] });
  const lines = renderOverview(c).split("\n");
  for (const line of lines) assert.ok(line.length <= 100, `${line.length} columns: ${line}`);
  const at = lines.findIndex((l) => l.startsWith("  send "));
  assert.equal(lines[at], "  send   send a message to the agent on the other machine, through a secret gist, within six minutes");
  assert.equal(lines[at + 1], "         of sending");
  assert.equal(renderOverview(c, { width: 60 }).split("\n").filter((l) => l.length > 60).length, 0);
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

test("help --json marks only a protocol command, with protocol: true", () => {
  const c = defineCli({ name: "proto", about: ["proto"], commands: [
    defineCommand({ name: "relay", summary: "Serve a request.", effect: "others", protocol: true }),
    defineCommand({ name: "post", summary: "Post.", effect: "others" }),
  ] });
  const j = helpJson(c);
  assert.equal(j.commands.find((x) => x.name === "relay")!.protocol, true);
  assert.equal("protocol" in j.commands.find((x) => x.name === "post")!, false);
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

test("person-only words are listed in the overview and in help --json, with the reason and how the person does it", () => {
  const theirs = { reason: "You can't turn on the person's camera; only they can.", how: "with the camera button" };
  const c = defineCli({ name: "call", about: ["call"], commands: [defineCommand({ name: "mute", summary: "Mute.", effect: "others" })], personOnly: { camera: theirs, "share screen": theirs } });
  assert.match(renderOverview(c), /\n {2}mute {3}Mute\.\n\nOnly the person does these, never you: camera, share screen\. Why and where: call help --json\.\n\nOutput:/);
  assert.deepEqual(helpJson(c).personOnly, [{ name: "camera", ...theirs }, { name: "share screen", ...theirs }]);
  assert.deepEqual(helpJson(cli).personOnly, []);
  assert.doesNotMatch(renderOverview(cli), /Only the person/);
});

test("a one-command tool's overview and command help name the tool and its usage, never a command word", () => {
  const images = defineCli({
    name: "ouro-images",
    about: ["Writes the sizes of a folder of pictures."],
    command: defineCommand({
      name: "images",
      summary: "Write each picture at the sizes the site uses.",
      effect: "private",
      args: [{ name: "folder", description: "The folder of pictures.", required: true }],
      flags: { out: { type: "string", description: "Where the sizes go." } },
      run: () => 1,
    }),
  });
  assert.equal(
    renderOverview(images),
    [
      "Writes the sizes of a folder of pictures.",
      "",
      "Only you see these",
      "  <folder> [--out <out>]          Write each picture at the sizes the site uses.",
      "",
      "Output: --json on every command. Exit codes: 0 ok, 1 error, 2 usage. Errors: one line that says what",
      "to do instead.",
      "Details: ouro-images --help",
      "",
    ].join("\n"),
  );
  assert.match(renderCommand(images, images.commands[0]!), /^ouro-images: Write each picture at the sizes the site uses\.\n\nDefinition\n {2}ouro-images <folder> \[--out <out>\]\n/);
  assert.deepEqual(helpJson(images).commands[0], { ...helpJson(images).commands[0], usage: "ouro-images <folder> [--out <out>]", single: true });
  assert.equal("single" in helpJson(cli).commands[0]!, false);
  const poster = defineCli({ name: "ouro-post", about: ["p"], command: defineCommand({ name: "post", summary: "Post.", effect: "others", why: "required", run: () => 1 }) });
  assert.match(renderOverview(poster, { othersNote: " (asked only)", footer: ["Footer."] }), /^p\n\nOther people see these \(asked only\)\n {2}--why "<who asked you, and what they said>" \[--dry-run\]\n {34}Post\.\n\nFooter\.\n$/);
});

test("a default shows in usage as [<name>=<value>], on its flag's line as (default: 90), and in help JSON's input schema, typed", () => {
  const tool = defineCli({
    name: "t",
    about: ["t: a tool."],
    command: defineCommand({
      name: "sizes",
      summary: "Sizes.",
      effect: "private",
      readOnly: true,
      args: [
        { name: "folder", description: "The folder.", required: true },
        { name: "set", description: "The widths.", values: ["web", "print"], default: "web" },
        { name: "tag", description: "A tag.", default: "open tasks" },
      ],
      flags: {
        quality: { type: "number", description: "The quality.", min: 1, max: 100, default: 90 },
        wide: { type: "boolean", description: "The widest size.", default: false },
        mode: { type: "enum", description: "The mode.", values: ["plain", "markdown"], default: "plain" },
      },
      run: () => null,
    }),
  });
  const cmd = tool.commands[0]!;
  assert.equal(usageOf(tool, cmd), '<folder> [<set>=web] [<tag>="open tasks"] [--quality <N>] [--wide] [--mode plain|markdown]');
  const shown = renderCommand(tool, cmd);
  assert.match(shown, /--quality <N> +The quality\. \(default: 90\)/);
  assert.match(shown, /--wide +The widest size\. \(default: false\)/);
  assert.match(shown, /--mode plain\|markdown +The mode\. \(default: plain\)/);
  const schema = helpJson(tool).commands[0]!.inputSchema;
  assert.deepEqual(schema.properties, {
    folder: { type: "string", description: "The folder." },
    set: { type: "string", enum: ["web", "print"], default: "web", description: "The widths." },
    tag: { type: "string", default: "open tasks", description: "A tag." },
    quality: { type: "number", minimum: 1, maximum: 100, default: 90, description: "The quality." },
    wide: { type: "boolean", default: false, description: "The widest size." },
    mode: { type: "string", enum: ["plain", "markdown"], default: "plain", description: "The mode." },
  });
  assert.deepEqual(schema.required, ["folder"]);
});

test("a default command is listed in the overview under its own heading, with its arguments and flags, and never as a command word", () => {
  const check = defineCommand({
    name: "check",
    summary: "Checks every page at every screen size, and writes a report.",
    effect: "private",
    args: [{ name: "target", description: "A URL or a built folder.", rest: "list", required: true }],
    flags: { pages: { type: "string", description: "Only the pages the glob matches." }, ready: { type: "string", description: "An event the page fires once it has drawn.", repeat: true } },
    run: (input) => input,
  });
  const merge = defineCommand({ name: "merge", summary: "Joins the out folders of a sharded run.", effect: "private", args: [{ name: "dir", description: "An out folder.", rest: "list", required: true }], run: () => null });
  const post = defineCommand({ name: "post", summary: "Posts it.", effect: "others", why: "required", run: () => null });
  const tool = defineCli({ name: "t", about: ["t: checks pages."], command: check, commands: [merge, post] });
  assert.equal(
    renderOverview(tool),
    [
      "t: checks pages.",
      "",
      "Only you see these",
      "  <target...> [--pages <pages>] [--ready <ready>...]",
      `${" ".repeat(34)}Checks every page at every screen size, and writes a report.`,
      `${"  <target...>".padEnd(34)}A URL or a built folder.`,
      `${"  --pages <pages>".padEnd(34)}Only the pages the glob matches.`,
      `${"  --ready <ready>...".padEnd(34)}An event the page fires once it has drawn. Repeat it for each`,
      `${" ".repeat(34)}value.`,
      "  merge   Joins the out folders of a sharded run.",
      "",
      "Other people see these",
      "  post    Posts it.",
      "",
      "Output: --json on every command. Exit codes: 0 ok, 1 error, 2 usage. Errors: one line that says what",
      "to do instead.",
      "Details: t help <command>",
      "",
    ].join("\n"),
  );
  assert.deepEqual(
    helpJson(tool).commands.map((c) => [c.name, c.usage, "single" in c]),
    [
      ["check", "t <target...> [--pages <pages>] [--ready <ready>...]", true],
      ["merge", "t merge <dir...>", false],
      ["post", 't post --why "<who asked you, and what they said>" [--dry-run]', false],
    ],
  );
});

test("a default command that reaches other people is listed under their heading, and a hidden one only in help --json", () => {
  const merge = defineCommand({ name: "merge", summary: "Merges.", effect: "private", run: () => null });
  const post = defineCommand({ name: "post", summary: "Posts it.", effect: "others", why: "required", run: () => null });
  const reaching = renderOverview(defineCli({ name: "t", about: [], command: post, commands: [merge] }));
  assert.ok(reaching.indexOf("Only you see these") < reaching.indexOf("  merge") && reaching.indexOf("  merge") < reaching.indexOf("Other people see these") && reaching.indexOf("Other people see these") < reaching.indexOf("Posts it."));
  const hidden = defineCli({ name: "t", about: [], command: defineCommand({ ...post, effect: "private", hidden: true, why: "none" }), commands: [merge] });
  assert.doesNotMatch(renderOverview(hidden), /Posts it\./);
  assert.equal(helpJson(hidden).commands[0]!.single, true);
});
