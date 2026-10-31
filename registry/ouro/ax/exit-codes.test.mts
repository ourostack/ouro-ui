import { test } from "node:test";
import assert from "node:assert/strict";
import { BASE_EXIT_CODES, defineExitCodes } from "./exit-codes.ts";

test("a tool's table keeps 0 ok, 1 error, 2 usage and numbers its own from 3", () => {
  const t = defineExitCodes([...BASE_EXIT_CODES, { code: 3, name: "unavailable", short: "unavailable", meaning: "down" }]);
  assert.equal(t.line(), "Exit codes: 0 ok, 1 error, 2 usage, 3 unavailable.");
  assert.equal(t.code("unavailable"), 3);
  assert.throws(() => t.code("nope"), /no code named "nope"\. Fix: one of ok, error, usage, unavailable\./);
  assert.equal(defineExitCodes().codes.length, 3);
});

test("a gap, a renamed base code, a short table or a repeated name fails with the fix", () => {
  assert.throws(() => defineExitCodes([...BASE_EXIT_CODES, { code: 4, name: "x", short: "x", meaning: "x" }]), /Fix: number the codes/);
  assert.throws(() => defineExitCodes([{ code: 0, name: "fine", short: "ok", meaning: "ok" }, ...BASE_EXIT_CODES.slice(1)]), /Fix: name it "ok"/);
  assert.throws(() => defineExitCodes(BASE_EXIT_CODES.slice(0, 2)), /needs 0 ok, 1 error and 2 usage/);
  assert.throws(() => defineExitCodes([...BASE_EXIT_CODES, { code: 3, name: "usage", short: "u", meaning: "u" }]), /share a name/);
});
