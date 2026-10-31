# The Ouro AX claims

The Ouro AX standard is a list of claims about the interfaces agents use. A claim is one rule that a program can check from outside, such as "an unknown flag fails before anything runs". `ax-claims` holds them as data in `lib/ouro/ax/claims.ts`, and `ax-xray` checks an interface against them ([the X-ray](ax-xray.md)). [The claims page](../ax/ax-claims.md) lists them, with their tiers and what admitted them.

```sh
node lib/ouro/ax/xray.ts claims          # every claim, its tier, rule and check
node lib/ouro/ax/xray.ts claims --json   # the claim set as data, with its hash
```

## What a claim says

| Field | What it holds |
| --- | --- |
| `id` | A stable name, such as `cli.unknown-flag`. |
| `surface` | `cli`, `http` or `mcp`. |
| `tier` | `must` or `should`. |
| `applies` | Which surfaces it applies to, decided from what the interface says about itself: a command, a read, an action other people see, a route, a tool. |
| `rule` | The rule, in one sentence. |
| `why` | Why it matters to an agent. |
| `evidence` | What admitted it: an evaluation run, a stated hazard, or a principle. |
| `check` | What the X-ray does to check it. |
| `fix` | What to change when it fails. |

## The tiers

A broken `must` claim fails the X-ray, which exits 1; a broken `should` claim is reported and fails nothing.[^exit] With `--conformance`, a `must` claim that the X-ray could not check also fails it, so a skipped check never passes as a held one.[^conformance]

## How a claim enters `must`

A claim is `must` in one of two ways, and in no other:[^admission]

1. **An evaluation shows agents failing without it.** Real agents in fresh sessions do a task against the interface, and a scorer that calls no model judges the end state ([the evaluation](ax-eval.md)).[^eval] The run reproduces the failure the claim forbids, and a run with the fix removes it. The claim's `evidence` names the run's file. Text taken only on stdin entered this way: on Tandem's main branch, agents limited to `shell(m365tandem)` could not pipe text into a send or an edit and failed both tasks, and with `--text` they passed both.[^text]
2. **It guards against a stated hazard.** It protects safety, compatibility or integrity, its `evidence` states the hazard, and the X-ray checks it. Refusing an unknown flag entered this way: no agent in the evaluations misspelt a flag, but an ignored flag on an action can act for real.[^flag]

Every other claim is `should` until evidence arrives: it comes from a principle or from another product's experience.[^admission] `checkClaimSet` refuses a `must` claim that rests on a principle, and an evaluation that names no run.[^admission]

The order of work for a new claim:

1. Reproduce the failure in an evaluation, and commit the run's results as evidence.
2. Add the claim as `should`, with its check in `ax-xray` and a test of the check.
3. Fix it in an adopter and run the evaluation again.
4. When the fix removes the failure, make it `must` and cite both runs.

A claim is reviewed for demotion when repeated evaluations show that it does not change an outcome, unless it guards against a hazard. The probes found claims of that kind: the first claims, written from Tandem's principles, matched none of the wrong turns agents made on Tandem's main branch, and fixing every one of them changed no task's outcome.[^principles]

## The claim set's version

The claim set has a version (`CLAIM_SET_VERSION`) and a hash: the SHA-256 of its canonical JSON.[^hash] A report names both, so a conformance result says exactly which standard it checked.[^hash] An adopter that copies the claims in can read its own copy with `loadClaimSet`, which checks it the same way.

[^exit]: test:registry/ouro/ax/xray.test.mts::the command: claims, help, usage errors with the fix, exit codes, written reports verify:testExists(registry/ouro/ax/xray.test.mts::the command: claims, help, usage errors with the fix, exit codes, written reports)
[^conformance]: test:registry/ouro/ax/xray.test.mts::without proof of a mock, nothing other people see is called, and it does not conform verify:testExists(registry/ouro/ax/xray.test.mts::without proof of a mock, nothing other people see is called, and it does not conform)
[^admission]: test:registry/ouro/ax/claims.test.mts::checkClaimSet names each problem with its fix; test:registry/ouro/ax/claims.test.mts::the claim set follows its own admission rule: every must claim cites a run or states a hazard verify:testExists(registry/ouro/ax/claims.test.mts::checkClaimSet names each problem with its fix) verify:testExists(registry/ouro/ax/claims.test.mts::the claim set follows its own admission rule: every must claim cites a run or states a hazard)
[^text]: evidence:docs/decisions/2026-10-30-ouro-ax/evidence/eval-baseline.md; evidence:docs/decisions/2026-10-30-ouro-ax/evidence/eval-after-440.md verify:fileLine(docs/decisions/2026-10-30-ouro-ax/evidence/eval-baseline.md, /\| T3 Directed send others see \| 0\/2 \|/) verify:fileLine(docs/decisions/2026-10-30-ouro-ax/evidence/eval-after-440.md, /\| T3 Directed send others see \| 2\/2 \|/)
[^eval]: evidence:docs/decisions/2026-10-30-ouro-ax/evidence/eval-method.md verify:fileLine(docs/decisions/2026-10-30-ouro-ax/evidence/eval-method.md, /a fresh mock tandem per run, and scoring from the end state/)
[^flag]: evidence:docs/decisions/2026-10-30-ouro-ax/evidence/xray-probe.md verify:fileLine(docs/decisions/2026-10-30-ouro-ax/evidence/xray-probe.md, /In 30 agent runs no agent passed a misspelt flag or used `--dry-run`/)
[^principles]: evidence:docs/decisions/2026-10-30-ouro-ax/evidence/xray-probe.md verify:fileLine(docs/decisions/2026-10-30-ouro-ax/evidence/xray-probe.md, /named none of the 12 wrong turns in the baseline/)
[^hash]: test:registry/ouro/ax/xray.test.mts::the claim set: its hash is stable and every claim the X-ray records exists verify:testExists(registry/ouro/ax/xray.test.mts::the claim set: its hash is stable and every claim the X-ray records exists)
