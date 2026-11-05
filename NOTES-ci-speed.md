# CI speed notes (ouro-ui, plan item teams-microsoft/tandem#394)

Untracked. Never commit. Worktree: ~/code/ouro-ui-worktrees/ci-speed, branch ci/speed from origin/main 2fbbd7ed. Scratch: ~/code/ouro-ui-worktrees/ci-speed-scratch (jobs.mjs per-job timer, timings/ = ci-timings artifacts).

## Rules (AGENTS.md)
- PRs merge through the merge queue; ci-budget required check (target 10 min, limit 12, ceiling 15). No AI attribution.
- New rule from operator (2026-10-30): every merge gets independent review first. Return with PR ready; don't merge.
- Local pnpm: corepack can't fetch pnpm@10.2.0 (network); use `node ~/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`.

## Measurements (before)
- CI critical path ~9.2 min with no queue (ci-timings of 27 runs). Path = plan > install (variant, preset, n/4) > install gate.
- Wall time 13-19 min when PRs overlap: each full run takes ~215-220 runner-minutes, ~55 jobs, against the 60-runner pool. Merge-group run https://github.com/ourostack/ouro-ui/actions/runs/41103901849 : critical 9.8, wall 15.1.
- Runner minutes per full run (41103901849): install shards 97 (12 jobs), browser 38, e2e 20, themes 19, conformance 12, rest ~30.
- Install shard (ouro, nova, 1/4): container 27s, fixture 31s, runtime add+check ~1m, later adds 31s, testing setup + ouro-tests 2m36s (shadcn writes 484 files in ~2m), then the shard's own work: Vitest 1.5m + Playwright 2.3m. ~4.5 min of setup is identical in all 11 shards.
- PR mutation (cold, 5 shards): shard 1/5 takes 25-30 min, hits the 30-min job timeout. Runs 41079037271, 41089363800, 41092805099 (30.1m), 41095548585. Cause: emoji-picker.tsx:466-825 is one unsplittable unit (~368 mutants, one component function body; splitRange can't cut inside a function body), and Stryker runs with `concurrency: 1` (~10 s per mutant).
- Release: 32-45 min. Release run 41013484475: CI on release commit 742s, then SR lane 501s, then Prepare main 609s, then queue 690s, publish 123s. All sequential.
- v1.2.14 release failures 41040917151, 41043032549: CI runs 41041013638 / 41043124911 browser (1/6) failed in site/src/voyage/voyage.test.tsx: one screenshot hit `locator.screenshot: Timeout`, then 21 scans each failed at ~16 s "waiting for screenshot". #247 raised those tests to pageScanTimeout (30 s). Root cause still open: why one stuck screenshot stalls the rest.

## Experiments
- Local mutation, table-parts.tsx since 4e847230~1 (39 mutants, 12-core Mac): concurrency 1 = 2m19s; concurrency 3 = 1m19s, same result (all killed), no port clashes. CI runners have 4 vCPU, so this must be proven in CI.

## Decisions
- Lever 1: mutation concurrency > 1 (and maybe shard count from estimated cost). Biggest PR critical-path offender.
- Lever 2: release runs the SR lane alongside CI on the release commit instead of after it (~8 min saved).
- Lever 3 (later): cut install-shard duplicated setup to lower runner minutes / queueing.
- Not doing: build-once install app shared as artifact; it lengthens the critical path (setup 5.4 + shard 5) for little runner saving.

## Next step
Set mutation concurrency for CI (env in ci.yml or derived from CPU count), open a PR touching a big runtime file to prove the shard time in CI.

## Progress 12:45
- Comment posted: https://github.com/teams-microsoft/tandem/issues/394#issuecomment-6531612060
- Built: splitRange now cuts inside one long node after LONG_UNIT_MUTANTS (32) without a clean cut; the crossed nodes' mutants go to a "spanning" unit (whole range, minus parts other shards own) via an ignorer (`inOtherShard`, env OURO_MUTATION_EXCLUDED, Babel `path.hub.file.opts.filename`) and scopeReport/inScope `excluded`.
- Verified with Stryker's own instrumenter: table.tsx 295-356 whole = 129 mutants = parts 125 + spanning 4, none missing or extra; emoji-picker 1-861 whole 553 = 537 + 16. Plan for emoji-picker cold 5 shards: 395/395/374/395/374 s estimated (before: one ~2213 s unit).
- Dead end: node.loc.filename is unset in Stryker's parse; hub works because Stryker wraps the AST in a Babel File.
- Next: concurrency 2 in Stryker, unit tests, docs, then a probe PR stacked with feat/emoji-picker to prove shard times in CI.

## 13:05 PRs open
- PR #269 https://github.com/ourostack/ouro-ui/pull/269 (ci/speed, commit 5171a92a): spanning-unit split + 2 Stryker runners. Docs: AGENTS.md, docs/guides/conformance.md (footnotes mutation-spanning, mutation-runners). Local: node --test scripts/mutation.test.mjs 31 pass; eslint clean; claims check clean except this notes file.
- Probe PR #268 (draft, ci/speed-probe = ci/speed + origin/feat/emoji-picker): compare its cold mutation shards to #258's run 41092805099 (shard 1/5 30.1m timeout, 4/5 13.9m).
- Operator: no heavy local work (Mac overloaded). Poll CI at most every 2 min. Don't merge; independent review first.
- Next: lever 2, Release runs the screen-reader lane alongside CI on the release commit. Read release.yml "Run CI on the release commit" and "Pass the screen-reader lane" steps.

## 13:25 PR #270 open
- PR #270 https://github.com/ourostack/ouro-ui/pull/270 (branch ci/release-sr-beside-ci, 1593d95c): new step "Start the screen-reader lane on the release commit" before CI; gate attempt 1 uses SR_BEFORE, attempt 2 dispatches. Test renamed to "a release runs the screen-reader lane beside CI (with shadcn@latest) on its own commit, and tags only when both passed" (claims in AGENTS.md, screen-reader-lane.md updated). workflows.test.mjs: SR gate tests pass locally after harness runs start+gate.
- Expected: Release CI+SR stage 742+501 s (run 41013484475) becomes about max(CI, SR). Proof only at next real release.
- Worktree now on ci/release-sr-beside-ci; ci/speed is PR #269.
- Next: check probe #268's CI (mutation shards) every 2+ min; compare with 41092805099.

## 13:45
- Claims lint (Claims workflow) checks PR title/body: every number needs a footnote with verify:urlOk(...)/testExists/fileLine. Both PR bodies rewritten; lint locally with `node scripts/claims.mjs lint --stdin < body.md`. PR #269 retitled "... run test runners side by side" (no number words in titles).
- Local evidence posted as https://github.com/ourostack/ouro-ui/pull/268#issuecomment-6532079256 (cited by #269).
- Probe #268 had no CI: PR conflicted with main (generated files). Merged origin/main, took main's side for generated files (README, registry.json, llms.txt, catalog.json, control-matrix.json, interactive-components.json) -> edcc4d81. Docs/registry checks will fail on the probe; only mutation matters.
- #247's author already root-caused the voyage failures: #212's screenshot contrast measurement slowed voyage.test.tsx from 74-80 s to 117-200 s; a scan that times out keeps running (Vitest can't stop it), so later scans time out behind it. Fixed by pageScanTimeout. Not changing it.

## 14:15 Probe proved mutation gain
- Probe CI run https://github.com/ourostack/ouro-ui/actions/runs/41118502779 (cancelled after mutation shards): cold 5 shards, job times 4.4/4.7/7.4/6.4/9.1 min (before, run 41092805099: 30.1 min timeout on shard 1, 13.9 on 4/5). 638 in-scope mutants, 2 runners each, 2 timeouts (old single-runner run: 2 in first 153). 14 survivors are EmojiPicker's own.
- Results comment: https://github.com/ourostack/ouro-ui/pull/268#issuecomment-6532448800. Probe #268 closed, branch deleted. #269 body updated with result.
- PR #269's own CI 41117140713: success, critical path 10.0 min, wall 11.0 (unchanged by the change; it touches no runtime source).
- Shard queueing in the probe: mutation shards waited ~2.3 min for runners.
- Open, not doing now: install-shard setup duplication (97 runner-min/run) drives queueing; prepare-main + queue add ~20 min to Release after tagging.
- Next: tandem#394 comment, wait for #269/#270 CI, return for independent review (don't merge).

## 14:30 Ready for review
- #269 and #270: all checks pass, mergeStateStatus CLEAN. Not merged (operator runs independent review first).
- Cleaned: node_modules, .tmp, scratch dir, local probe branch. Worktree kept (holds these notes) until review ends; remove it with `git -C ~/code/ouro-ui worktree remove ~/code/ouro-ui-worktrees/ci-speed` after merge.

## 15:50 Phase 2 (operator): ouro-ui first, v1.2.15 Saturday. Lane = ci.yml only.
- #269, #270 merged (c7dcca23, c6417f45).
- Ruleset 24881709 required checks: ci, ci-budget, conformance, conformance exemptions, e2e, install (namespace|next|ouro|shadcn nova|shadcn vega), install-upgrade, latency, lighthouse, motion-coverage, mutation, registry, theme-install, themes (1-3/3), visual. Merge queue: ALLGREEN, max build 3, timeout 60 min. No classic branch protection.
- CI already cancelled superseded PR runs (22 of last 62 PR runs cancelled) but also cancelled main push run 41112379756. PR #278 https://github.com/ourostack/ouro-ui/pull/278 (branch ci/cancel-superseded): group per PR ref with cancel only for pull_request; run_id group otherwise. Test "CI cancels only a pull request's superseded run: never a merge-queue, main or dispatched run".
- Polish session rules: freeze on required-check names / merge_group / release*.yml from v1.2.15 rehearsal start (Sat midday) until tag. PR-only speedups can merge anytime if required checks still report.
- New task: lighthouse TBT flake (merge-group dropped #259: 166 ms vs 150 limit; samples 830/166/204). Use median of several runs, keep 150 ms.
- Remaining plan: (a) lighthouse median, (b) PR-side subset with full matrices in merge_group (needs review before Sat midday), (c) install-shard setup sharing.
- node_modules deleted; claims lint can't run locally without deps.

## 16:20 Lighthouse TBT root cause (no PR yet)
- Data: lighthouse-reports artifacts of 40 CI runs after #251 (home page = Nautilus look) + 16 before. Script in .tmp/lh/sum.mjs, sim.mjs.
- Config: site/lighthouserc.json numberOfRuns 3, LHCI default aggregation = optimistic (best of 3), simulated throttling 4x CPU.
- First run per job is always cold: "/" TBT min 43, median 439, max 3215 ms; benchmarkIndex depressed in that run (host busy at start).
- Runner classes: benchmarkIndex ~2400 (26 of 40 jobs) vs ~3000-4300. Warm "/" TBT: slow runners median 129, p90 173, 35% of samples > 150; fast runners median 39, max 94. /nautilus/ ~80 on slow runners.
- Lighthouse docs (docs/throttling.md): 4x targets mid-tier mobile from a high-end desktop with benchmarkIndex 1500-2000; a host above that range should use a HIGHER multiplier. So the slow runners are the closer-to-calibrated measurement; fast runners are lenient.
- #259 drop (run 41127289408, bm ~2400): samples 830 (cold), 166, 204. Not noise: both warm samples over 150.
- Simulated P(fail) on a slow runner: today best-of-3 0.10; median of 3 0.52; median of 5 incl. cold 0.39; median of 5 warm 0.23. => Switching to median (as asked) makes the gate fail MORE often until the page gets lighter.
- Page cost on "/" (slow run): entry-*.js scripting ~500 ms with 90-130 ms long tasks during hydration (~2.0-2.7 s); document tasks 105-111 ms around 1.0-1.2 s (parse/style of the prerendered page); styleLayout ~300 ms. Before #251, /voyage/ was 49-158 on slow runners, creeping up.
- Decision: no lighthouse PR now. Root cause is the page's main-thread work (site lane) plus runner CPU variance; a median change would cost v1.2.15 more queue drops. Report to operator/polish; offer median-of-5-warm PR once the page is under budget.

## 16:45 PR #282 (install test to merge queue)
- https://github.com/ourostack/ouro-ui/pull/282, branch ci/queue-heavy, e1b776b4. Plan output installs=queue|here (here when PR changes scripts/install-test.sh, install-check*, readme-steps.mjs, upgrade-note.mjs, namespace.sh, UPGRADING.md). install-shard skips at job level; required install checks (gates, install namespace/next, install-upgrade) run a notice step and skip other steps (AGENTS rule: required jobs never skip themselves; required-ci.sh treats skipped as not passed).
- ci-budget: jobGraph node gets `template`; skipped matrix job reported under unexpanded name matches.
- Kept latency/lighthouse/theme-install on PRs (site early warning; small, 8 runner-min).
- Before: full PR run 41117140713 = 57 jobs, 219 runner-min (install 18 jobs/101 min); reduced PR 41107036327 = 57 jobs, 132 runner-min (install 64).
- Local: workflows.test.mjs 107 pass, 5 fail also on main (missing node_modules); ci-budget.test 16 pass.
- Needs: own PR run numbers; merge-queue run after review (merge_group change -> review before Sat midday or hold).
- Next: item 4 install-shard setup sharing (install shards in merge queue still 97 runner-min).

## 17:05 Item 4 analysis (no PR)
- Build-once install app: setup job ~5.8 min + shard ~4.8 min => queue critical path ~11.4 (vs ~10 now) for ~15 runner-min saving (82 vs 97); with 6 shards/variant ~10.2 min path but 21 jobs instead of 12. After #282 the duplicated setup only costs in merge-queue runs. Not worth the risk before v1.2.15.
- shadcn add of ouro-tests (~2 min, "Created 484 files") is the CLI under test; can't cache.
- npm/npx cache for install shards: est. ~3 runner-min net per queue run. Skip.
- e2e uses `storybook dev` (on-demand); building once changes test semantics. Skip.
- Considered: skip mutation shards at job level when nothing to mutate (saves 3 container jobs per merge-queue run and per non-runtime PR), but the gate design deliberately fails on skipped shards (test "conformance and mutation are each one check..."); merge_group change near freeze. Not doing now.
- #278 CI queued since 22:47Z (pool saturated: 22 queued runs at 23:16Z).

## 18:45 Results
- #278 CI run 41140403603: success (full, 57 jobs, 210 runner-min, critical 9.3, wall 68 min queued). Ready/in review.
- #282 CI run 41143180325: success incl. ci-budget. 45 jobs, 118 runner-min (install 0.4 over 6 notice jobs), critical 9.1 (plan > e2e (3/4) > e2e), wall 69 min (pool saturated). Before (full PR): 57 jobs, 210-219 runner-min, install 18 jobs ~96-101 min.
- #282 body updated with results; Claims re-run pending.
- Still to prove: #282's merge-queue run (install in full) after review; needs review before Sat midday (it doesn't change merge_group behaviour or required names, so it may be freeze-safe, but the release prepare-PR path changes).
- 19:20 #282 Claims failed on title/body claim words ("every", "no"); fixed title ("...instead of on pull request pushes") and footnotes; Claims re-run queued (pool saturated). Self-check script for claim words: python regex over body sentences without footnotes.
- Operator hard rule: never read credential files (~/.npmrc, ~/.config/gh, ~/.netrc, keychains). Registry issues: only `npm config get registry`/`npm config list`/`pnpm config get`. Auth failure -> stop and report.

## 19:30 #282 review fix pushed (96ee891d)
- installPaths now: ci.yml, package.json, pnpm-lock.yaml, UPGRADING.md, docs/OuroProvider.md, test/install-fixture*/, scripts/{install-test.sh, install-check.mjs, source-rules.mjs, readme-steps.mjs, upgrade-note.mjs, latest-release.mjs, namespace.sh, registry.mts, components.mts, shard.mjs, shard-timings.json, vitest-shards.mts, test-impact.mjs}; README.md via `node scripts/readme-steps.mjs same HEAD^1` (new sameSteps; catalog lines and tags don't count).
- Test pins every $root/scripts/* that install-test.sh references plus their `from "./x"` imports, the fixtures, and README steps change (nodeStatus 1) -> here; component PR -> queue.
- This push changes ci.yml, so #282's own run now runs the install test (installs=here).
- #278 in merge queue (operator).
- 20:55 #282 green at 96ee891d (CI 41154139055; install shards ran on the PR since ci.yml changed: installs=here). mergeStateStatus CLEAN. Returned to operator.

## 21:15 URGENT mutation scaling for #287 (wave 1)
- #287 run 41159468260: 5 shards est ~2730 s each; actual 925/3960(extrap)/1860/672/1340 s. Cause: too few shards + hanging mutants: coverageAnalysis off => Stryker timeout = 1.5 x whole dry-run net (~300 s when a lib file pulls 27 importers' tests) + 10 s = ~463 s each; shards 2/3 had 4/3 timeouts.
- Change (branch ci/mutation-scale, 2805b0aa): cache.mjs shardCost adds mutants x timeoutRate(0.007) x strykerTimeout(shard test seconds); shardCount(files, seconds, {min,max,target}); mutation.mjs --count min/max prints count; SHARD_TARGET_SECONDS 1500 (worst ratio 0.72 -> 18 min). mutation-plan: pnpm setup + install on PR, count = node scripts/mutation.mjs HEAD^1 --count "$min/16".
- Calibration (grid over unmeasuredSeconds/timeoutRate): kept unmeasured 5; with rate 0.007 ratios 0.21-0.72.
- #287 plans 13 shards (max est ~1450); main's last 12 merges plan 5.
- Probe #290 (ci/mutation-scale-probe = #287 head 7e43e77e + ci/mutation-scale, ci.yml cut to plan+mutation). Temp worktree ~/code/ouro-ui-worktrees/ci-speed-287 (node_modules symlinked to ci-speed's).
- Local: mutation.test 33 pass, workflows.test 113 pass (deps installed now), eslint clean, claims lint clean on body.
- 22:10 Probe run 41165521107: 13 shards, 2395 mutants (same as #287 run), job times 4.4-14.9 min, Stryker 3.6-14.1, 10 timeouts, 0 survived; mutation check passed. Probe #290 closed.
- #291 https://github.com/ourostack/ouro-ui/pull/291 first CI failed `checks`/`scripts (2/3)` on claims: docs/guides/conformance.md cited the renamed test. Fixed docs + AGENTS.md (commit pushed); waiting for CI.
- #291 all checks green at acd7eb1f (merged main to clear AGENTS.md conflict); CLEAN. Returned for review.
