import assert from "node:assert/strict";
import { test } from "node:test";
import { holdsPin } from "./branch-holds-pin.mjs";

const files = {
  "package.json": JSON.stringify({ ouro: { latestRelease: "v1.3.650" } }),
  "scripts/parity-data/provenance.json": JSON.stringify({ coreTag: "v1.12.0" }),
  "scripts/parity-data/versions.json": JSON.stringify({ apple: { tag: "v1.11.0" } }),
};
const read = (file) => {
  if (!(file in files)) throw new Error("no such file");
  return files[file];
};

test("a branch that pins the target release or a newer one holds the pin, and an older one does not", () => {
  assert.equal(holdsPin("docs", "v1.3.650", read), true);
  assert.equal(holdsPin("docs", "v1.3.649", read), true);
  assert.equal(holdsPin("docs", "v1.3.651", read), false);
  assert.equal(holdsPin("core", "v1.12.0", read), true);
  assert.equal(holdsPin("core", "v1.13.0", read), false);
  assert.equal(holdsPin("apple", "v1.11.0", read), true);
  assert.equal(holdsPin("apple", "v1.12.0", read), false);
});

test("a branch whose pin is missing or unreadable does not hold it, so the run pushes", () => {
  assert.equal(holdsPin("windows", "v0.12.1", read), false);
  assert.equal(holdsPin("docs", "v1.3.650", () => { throw new Error("no ref"); }), false);
  assert.equal(holdsPin("docs", "v1.3.650", () => "not json"), false);
});
