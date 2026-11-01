import { test } from "node:test";
import assert from "node:assert/strict";
import { checkClaimSet, CLAIM_SCOPES, CLAIM_SET, CLAIM_SET_VERSION, claimSetText, loadClaimSet } from "./claims.ts";

test("the claim set follows its own admission rule: every must claim cites a run or states a hazard", () => {
  assert.deepEqual(checkClaimSet(CLAIM_SET), []);
  assert.equal(CLAIM_SET.version, CLAIM_SET_VERSION);
  for (const c of CLAIM_SET.claims) {
    assert.ok(c.id.startsWith(`${c.surface}.`), c.id);
    assert.ok(CLAIM_SCOPES.includes(c.applies), c.id);
    if (c.tier === "must") assert.notEqual(c.evidence.basis, "principle", c.id);
    if (c.evidence.basis === "evaluation") assert.match(c.evidence.source, /^docs\/decisions\/2026-10-30-ouro-ax\/evidence\/[\w.-]+\.md$/, c.id);
  }
  assert.equal(loadClaimSet(JSON.parse(JSON.stringify(CLAIM_SET))).claims.length, CLAIM_SET.claims.length);
});

test("checkClaimSet names each problem with its fix", () => {
  const good = CLAIM_SET.claims[0]!;
  assert.deepEqual(checkClaimSet(null), ["a claim set is { version, claims: [...] }. Fix: start from CLAIM_SET."]);
  const problems = checkClaimSet({
    version: "x",
    claims: [
      3,
      { ...good, rule: "" },
      { ...good, id: "a", surface: "web", tier: "may", applies: "page" },
      { ...good, id: "a" },
      { ...good, id: "b", evidence: "none" },
      { ...good, id: "c", evidence: { basis: "evaluation", source: "", finding: "" } },
      { ...good, id: "d", evidence: { basis: "hazard", source: "", finding: "" } },
      { ...good, id: "e", tier: "must", evidence: { basis: "principle", source: "P7", finding: "" } },
    ],
  });
  assert.deepEqual(problems, [
    "claim 0: is not an object. Fix: { id, surface, tier, applies, rule, why, evidence, check, fix }.",
    "cli.help-parses: rule is empty. Fix: say it in one sentence.",
    'a: surface is "web". Fix: "cli", "http" or "mcp".',
    'a: tier is "may". Fix: "must" or "should".',
    `a: applies is "page". Fix: one of ${CLAIM_SCOPES.join(", ")}.`,
    "a: the id is used twice. Fix: give each claim its own id.",
    "b: evidence is not { basis, source, finding }. Fix: name the run, the hazard or the principle.",
    'c: an evaluation names its run and what it showed. Fix: evidence: { basis: "evaluation", source: "<the run\'s file>", finding: "<what agents did>" }.',
    'd: a hazard is stated. Fix: evidence.finding: "<the harm it prevents>".',
    'e: a must claim needs an evaluation that shows agents failing without it, or a stated hazard. Fix: tier: "should", or cite the run.',
  ]);
  assert.throws(() => loadClaimSet({ version: "x", claims: [3] }), /the claim set has 1 problem:\nclaim 0: is not an object/);
  assert.throws(() => loadClaimSet({ version: "x", claims: [3, 4] }), /the claim set has 2 problems:/);
});

test("claimSetText is canonical: key order does not change it", () => {
  const a = claimSetText({ version: "1", claims: [{ ...CLAIM_SET.claims[0]! }] });
  const reversed = Object.fromEntries(Object.entries(CLAIM_SET.claims[0]!).reverse()) as unknown as (typeof CLAIM_SET.claims)[number];
  assert.equal(claimSetText({ claims: [reversed], version: "1" }), a);
  assert.match(a, /^\{"claims":\[\{"applies":/);
});
