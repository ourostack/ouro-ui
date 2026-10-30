import { test } from "node:test";
import assert from "node:assert/strict";
import { defineCli, defineCommand } from "./command.ts";
import { exampleCli } from "./example-cli.ts";
import { lintCli } from "./lint.ts";

test("the example tool conforms: every command typed, no problems", () => {
  assert.deepEqual(lintCli(exampleCli), { typed: ["rooms", "note", "post"], loose: [], problems: [] });
});

test("each missing piece is one line with its fix, and loose commands are counted", () => {
  const cli = defineCli({
    name: "t",
    about: ["t"],
    commands: [
      defineCommand({ name: "send", summary: "", effect: "others", why: "optional", readOnly: true, args: [{ name: "to", description: "" }], flags: { x: { type: "boolean", description: "" } } }),
      defineCommand({ name: "old", summary: "Old.", effect: "private", loose: true }),
    ],
  });
  const r = lintCli(cli);
  assert.deepEqual(r.loose, ["old"]);
  assert.deepEqual(r.problems, [
    't send: has no summary. Fix: summary: "<what it does, in one line>".',
    't send: has no example. Fix: examples: ["t send ..."].',
    't send: reaches other people without a required --why. Fix: drop why: "optional".',
    't send: is a read that other people see. Fix: effect: "private", or drop readOnly.',
    't send: <to> has no description. Fix: { name: "to", description: "<what it is>" }.',
    't send: --x has no description. Fix: x: { description: "<what it does>" }.',
  ]);
  const wide = defineCli({ name: "t", about: ["t"], commands: [defineCommand({ name: "a", summary: "x".repeat(120), effect: "private", examples: ["t a"] })] });
  assert.match(lintCli(wide).problems.join("\n"), /the overview has a line of \d+ columns/);
});
