import assert from "node:assert/strict";
import { test } from "node:test";
import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import comments from "./comments.mjs";

const lint = (code) =>
  new Linter()
    .verify(code, [{ files: ["**/*.ts"], languageOptions: { parser: tseslint.parser }, plugins: { comments }, rules: { "comments/no-orphan-doc": "error" } }], "file.ts")
    .map((message) => `${message.line}: ${message.message}`);

test("no-orphan-doc fails a doc block with another doc block directly after it, and names the fix", () => {
  const found = lint("/** Gone. */\n/** Kept. */\nconst a = 1;\n\n/**\n * Gone too.\n */\n  /** Kept. */\nfunction b() {}\n");
  assert.equal(found.length, 2);
  assert.match(found[0], /^1: This doc block describes nothing/);
  assert.match(found[0], /Merge the two, move this one to the code it describes, or delete it\./);
  assert.match(found[1], /^5: /);
});

test("no-orphan-doc passes one doc per declaration, and docs apart from each other", () => {
  assert.deepEqual(lint("/** A. */\nconst a = 1;\n/** B. */\nconst b = 2;\n"), []);
  assert.deepEqual(lint("/** A file note. */\n\n/** A. */\nconst a = 1;\n"), []);
  assert.deepEqual(lint("/** A. */\n// why\n/** B. */\nconst a = 1;\n"), []);
  assert.deepEqual(lint("/* plain */\n/** A. */\nconst a = 1;\n/**/\n/** B. */\nconst b = 1;\n"), []);
  assert.deepEqual(lint('const s = "/** a */\\n/** b */";\n'), []);
});
