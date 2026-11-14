import assert from "node:assert/strict";
import { test } from "node:test";
import { load, pinProblems } from "./platform-parity.mjs";
import { cellText, componentRows, sideState, surfaceRows, totals } from "./parity-rows.mjs";

test("a side's state comes from its check text: tested, partly with what is open, or not yet", () => {
  assert.deepEqual(sideState(undefined), { state: "none", open: "" });
  assert.deepEqual(sideState("  "), { state: "none", open: "" });
  assert.deepEqual(sideState("The Button test measures it."), { state: "checked", open: "" });
  assert.deepEqual(sideState("The Button test. Not yet checked on web: the Alert. The drag allowance: x."), { state: "partly", open: "the Alert" });
  assert.deepEqual(sideState("A test. Not yet checked on web: 7:1 under increased contrast."), { state: "partly", open: "7:1 under increased contrast" });
  assert.equal(cellText({ state: "none", open: "" }), "Not yet");
  assert.equal(cellText({ state: "partly", open: "the Alert" }), "Partly. Not yet: the Alert");
  assert.equal(cellText({ state: "checked", open: "" }), "Covered");
});

test("a claim with no web check shows as not yet on web, and the totals count it", () => {
  const rows = componentRows({ claims: [{ id: "a", tier: "must", appliesTo: ["button"], checks: { apple: "A test." } }, { id: "b", tier: "should", appliesTo: ["alert"], checks: { web: "A test.", apple: "A test." } }] });
  assert.deepEqual(rows.map((row) => [row.web.state, row.apple.state]), [["none", "checked"], ["checked", "checked"]]);
  assert.deepEqual(totals(rows), { claims: 2, web: { checked: 1, partly: 0, none: 1 }, apple: { checked: 2, partly: 0, none: 0 } });
});

test("a surface is listed with the claims that name it, and one no claim names is left out", () => {
  const rows = surfaceRows({ claims: [{ id: "x", appliesTo: ["cli", "reins"] }, { id: "y", appliesTo: ["cli"] }] });
  assert.deepEqual(rows.map((row) => [row.id, row.claims]), [["cli", ["x", "y"]], ["reins", ["x"]]]);
});

test("the vendored copies match the hashes provenance.json records, and one changed byte would not", () => {
  const data = load();
  assert.deepEqual(pinProblems(data.provenance), []);
  assert.match(data.provenance.coreTag, /^v\d+\.\d+\.\d+$/);
  assert.deepEqual(pinProblems({ files: { ...data.provenance.files, "parity.json": "0".repeat(64) } }), [`parity.json is ${data.provenance.files["parity.json"]}, and provenance.json says ${"0".repeat(64)}.`]);
});
