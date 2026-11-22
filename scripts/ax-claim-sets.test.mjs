import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { CLAIM_SETS_PATH, currentClaimSet, withCurrent, check } from "./ax-claim-sets.mjs";
import { claimSetHash } from "../registry/ouro/ax/xray.ts";
import { CLAIM_SET } from "../registry/ouro/ax/ax-claims.ts";

const committed = () => JSON.parse(readFileSync(CLAIM_SETS_PATH, "utf8"));

test("claim-sets.json lists Ouro AX's current claim set first, by the hash the X-ray reports", () => {
  const [first] = committed().sets;
  assert.equal(first.version, CLAIM_SET.version);
  assert.equal(first.hash, claimSetHash(), "the X-ray's report carries this hash, and the adoption ledger looks it up here");
  assert.deepEqual(first.claims, CLAIM_SET.claims.map(({ id, surface, tier }) => ({ id, surface, tier })));
  assert.deepEqual(check(committed()), []);
});

test("claim-sets.json keeps every claim set a release shipped, newest first, each hash once", () => {
  const { tool, sets } = committed();
  assert.equal(tool, "ouro-ax-claim-sets");
  assert.equal(new Set(sets.map((set) => set.hash)).size, sets.length);
  assert.ok(sets.some((set) => set.version === "1.7.0" && set.firstRelease === "v1.3.315"), "1.7.0 first shipped in v1.3.315");
  for (const set of sets) assert.match(set.hash, /^[0-9a-f]{64}$/);
});

test("a changed claim set goes first, and the ones before it stay", () => {
  const old = { tool: "ouro-ax-claim-sets", sets: [{ version: "0.9.0", hash: "0".repeat(64), firstRelease: "v1.0.0", claims: [] }] };
  const next = withCurrent(old);
  assert.deepEqual(next.sets[0], currentClaimSet());
  assert.deepEqual(next.sets.slice(1), old.sets);
  assert.deepEqual(withCurrent(next), next, "the current set is listed once");
  assert.deepEqual(check(old), [`registry/ouro/ax/claim-sets.json doesn't list Ouro AX's claim set ${CLAIM_SET.version} (${claimSetHash().slice(0, 12)}) first. Fix: node scripts/ax-claim-sets.mjs --write`]);
});
