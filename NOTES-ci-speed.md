# CI speed: auxiliary workflows lane (untracked)

Lane: every workflow except ci.yml, plus queue measurement. Branch ci/aux-workflows.

## Required checks (ruleset on main, checked 2026-10-30 15:50 PT)
Only `conformance exemptions` (conformance-exemptions.yml) is required from this lane. Claims, Form answer proof and Required checks are not required. No classic branch protection. Merge queue: ALLGREEN, max 3 build, 60 min check timeout.

## Findings
- Claims, Conformance exemptions and Form answer proof all already cancel superseded PR runs. Conformance exemptions and Form answer proof also set cancel-in-progress on merge_group/dispatch (harmless today because their merge_group refs are unique, but against the never-cancel-merge_group rule).
- Form answer proof runs on every PR push: full pnpm install, npm ci of a fixture, Playwright Chromium+WebKit, two Vitest runs. Not required. Candidate for on.paths.
- Conformance exemptions and Claims each do a full pnpm install to run Node scripts (conformance-exemptions.mjs imports typescript).

## Measurement
Scripts in session files: measure.mjs, report.mjs. Before window 2026-10-30 16:45Z..22:50Z.

## Changes
1. PR A (cancellation): cancel-in-progress only for pull_request in conformance-exemptions.yml and form-answer-proof.yml.

## Status 16:20 PT
- Before table written: session files/ouro-queue-before.md. CI is 98% of runner-minutes (19,374 of 19,665 in 6h); this lane's workflows are about 300 runner-min but about 300 one-job runs.
- PR A #281 (cancellation) open; claims, conformance exemptions, form-answer pass on it; CI pending in queue.
- Proof of no-cancel for dispatches: runs 41144128939 and 41144132516 dispatched back to back on ci/aux-workflows; both queued, neither cancelled (old group would have cancelled the first). Check they both finish.
- Next (PR B): Form answer proof runs only when test-impact's graph reaches form/link/radio-group, after dropping paths the proof never loads. Estimate from 40 recent PRs: most touch an unrelated component folder.
- Not changing: Claims and Conformance exemptions (~0.5 runner-min each, merging would rename or tighten a required check); Visual baselines (manual tool); Pages, Required checks, schedules.

## Status 17:35 PT
- #281: both back-to-back dispatched Conformance exemptions runs (41144128939, 41144132516) completed success; neither cancelled. In independent review.
- #283 (Form answer proof selection) open. Probe run 41146148302 ran the script on 18 open PRs' merge commits, each in its own checkout: 15 skip, 3 run (#276 lib/, #274 package.json, #262 dialog, which form imports).
- First probe (41144826338) showed CI's plan runs everything for test/generated/*.json, scripts/shard-timings.json and scripts/*.mts; narrowed the unread list to what vitest.config.ts actually imports.
- Now: temporary commit that feeds #280's diff to the impact step, to prove the job's skip path end to end; then restore and push the final commit.

## Status 18:05 PT
- #283 review fixes pushed: retry.sh, browser-deps.sh, form-answer-impact.mjs, test-impact.mjs now run the proof; body reworded (claims failed on "every"). Body edited again so the edited-event Claims run reads it.
- #285 (inspector-toaster race) open. Probe run 41150014565 (branch since deleted): old test failed 3 of 61 WebKit repetitions on a loaded runner; new passed 61/61 in WebKit and Chromium.
- #281: failed jobs re-run by the parent; browser (6/6) pending.
- Credential rule: never read credential files; registry issues only via npm config get/list or pnpm config get.

## After-measurement 22:05 PT
- files/ouro-queue-after.md written (window 03:05Z-05:00Z). Runner wait p90 16.0 -> 10.1 min; PR CI wall p50 26.1 -> 16.0; critical path >10 min 20/58 -> 2/16. Load halved, so not all attributable.
- Both remaining >10 min runs are #272: latency 47 tests on one worker (10.2 min) and browser (1/6) 9.5-10.7 min. ci.yml lane.
- Posted on tandem#394 (comment 6539485552).
