# CI speed and the merge queue

How to keep Ouro UI's CI fast without hiding a failure: queue pull requests cleanly, read a latency failure before you blame the change, rehearse a release on the commit it tests, and quarantine a test only on the record.

## Start here

The method, in short:

- **Profile first.** Read the run's jobs and steps and find the job that finishes last before you change anything.
- **Measure the wall clock** from the push to the last required check, queueing included.
- **Find the cause before any re-run.** Name the two things racing and make the bad order happen every time.
- **Never loosen a gate or add a retry** to get to green.

Treat a red check as a question with an answer. Find the cause before any re-run, and never loosen a gate, lengthen a timeout or add a retry to get to green. Read the failing job's log first, then check whether main fails the same way on the same base. Ask the owner of the change before you call it a flake.

Words used here:

- **Merge queue:** GitHub tests each queued pull request on top of the ones ahead of it, in a `merge_group` run, and merges it only if that run passes.
- **Drop:** GitHub takes an entry out of the queue when a check fails or it stops merging cleanly.
- **Rehearsal:** a full CI run on the release commit, before the real release.
- **Quarantine:** a short, public list of tests known to fail now and then, kept beside their open issues and owners.

## Queue a pull request

Queue it through the GraphQL API, since `gh pr merge` can't queue without auto-merge:

```sh
id=$(gh pr view <number> -R ourostack/ouro-ui --json id -q .id)
gh api graphql -f query="mutation { enqueuePullRequest(input: { pullRequestId: \"$id\" }) { mergeQueueEntry { position } } }"
# Take it out again: dequeuePullRequest(input: { id: "$id" })
```

- **Queue only a green pull request.** GitHub refuses the entry until the required checks in `.github/required-checks.json` have passed on the head.
- **If it refuses a green pull request with `2 of 21 expected`,** look at the checks it names. On the night the clocks went back, GitHub recorded some job times an hour off and lost track of them.[^dst] Re-run the named jobs so their results are recorded again, then queue.
- **Watch the entry until it merges.** Find drops and their reasons:

```sh
gh api graphql -f query='{ repository(owner: "ourostack", name: "ouro-ui") { pullRequest(number: <number>) {
  timelineItems(last: 5, itemTypes: [REMOVED_FROM_MERGE_QUEUE_EVENT]) { nodes { ... on RemovedFromMergeQueueEvent { createdAt reason } } } } } }'
```

- **Ignore the drops whose reason is `merged`:** that entry left the queue by merging.
- **Treat a drop like a red run.** Find the cause in the failed `merge_group` run before queueing again. A watcher that re-queues on its own after a drop is a blind retry: make it alert instead.
- **Find the failed `merge_group` run** for a pull request:

```sh
gh run list -R ourostack/ouro-ui --event merge_group -L 30 --json databaseId,conclusion,headBranch,displayTitle \
  -q '.[] | select(.conclusion == "failure") | "\(.databaseId) \(.headBranch)"'
```

- **Cancel a stale `merge_group` run** whose queue entry is gone, so it stops holding runners.
- **Keep generated files out of commits.** Queue entries that regenerate the same file conflict, and the later one is dropped. Generate it on install or in CI instead, as the control and motion matrices are.[^matrices]
- **Rebase a stacked pull request after its base squash-merges.** Its branch still carries the base's old commits: `git rebase --onto origin/main <old-base> <branch>`, then retarget it to main.
- **Skip the install test or heavy tier only on proof.** The plan job skips one only when every changed file is one it never reads, such as a change fragment; any doubt runs it, since a skipped required check counts as passing.[^installs-queue]

## Read a latency failure

The `latency` check presses each control on the voyage (the stage and Chapters I–III) at 4x CPU throttling and fails when its p95 goes over its budget.[^latency-gate] A shared runner's speed moves that number, so a failure on a change that didn't touch the control may be the runner, not the change.

- **Compare against main on the same runner type** before blaming the change. Interleave the builds on the runners of one probe, so a slow host slows both.
- **Don't loosen the budget, and don't take fewer samples.** Make the press cheaper instead.
- **Trace the press** to see where the time goes: record a Chromium trace of each press on a CI runner, and split the main thread's work from the click to the next frame by source.[^traces]
- **Ship a site fix with its evidence.** The museum and organ fix took its p95 on the EPYC 7763 runners from 88 to 72 ms and from 80 to 64 ms, over 520 samples each.[^museum]

## Rehearse a release

- **Rehearse the commit you will release,** dispatched on main's head. The rehearsal tests the commit it was dispatched on, so a merge mid-run changes nothing it tests.[^rehearsal]
- **Keep merging while it runs.** Release cuts the commit the rehearsal tested, not main's head, so later merges go out in the next release.[^release-commit] Change no required check, `merge_group` job or release workflow until the tag is published.

## Quarantine a test, on the record

- **Add a test only with an open issue and an owner,** in `.github/quarantine.json`. Release and its rehearsal retry a failure of listed tests once, and record the retry; pull requests and the merge queue never retry.[^quarantine]
- **Remove the entry in the pull request that fixes the test,** and close its issue.

[^dst]: evidence:docs/guides/evidence/2026-11-01-dst-check-times.txt verify:fileLine(docs/guides/evidence/2026-11-01-dst-check-times.txt, /e2e \(3\/4\)\tsuccess\t2026-11-01T09:49:01Z\t2026-11-01T09:03:21Z/)
[^matrices]: scripts/control-matrix.test.mjs verify:fileLine(.gitignore, /control-matrix/)
[^installs-queue]: .github/workflows/ci.yml verify:testExists(scripts/workflows.test.mjs::a pull request into main skips the install test or the heavy tier only when the plan proves the change cannot reach it)
[^latency-gate]: site/e2e/latency.ts; site/e2e/stage.latency.spec.ts; site/e2e/chapter-one.latency.spec.ts; site/e2e/chapter-two.latency.spec.ts; site/e2e/chapter-three.latency.spec.ts verify:fileLine(site/e2e/stage.latency.spec.ts, /from "\.\/latency/) verify:fileLine(site/e2e/chapter-one.latency.spec.ts, /from "\.\/latency/) verify:fileLine(site/e2e/chapter-two.latency.spec.ts, /from "\.\/latency/) verify:fileLine(site/e2e/chapter-three.latency.spec.ts, /from "\.\/latency/) verify:fileLine(playwright.latency.config.ts, /testDir: "site\/e2e"/) verify:fileLine(site/e2e/latency.ts, /p95: 100,/) verify:fileLine(site/e2e/latency.ts, /throttle: 4,/) verify:fileLine(.github/workflows/ci.yml, /pnpm test:latency/)
[^traces]: evidence:site/e2e/latency-evidence/2026-11-01-museum-organ-traces.txt verify:fileLine(site/e2e/latency-evidence/2026-11-01-museum-organ-traces.txt, /Chromium traces/)
[^museum]: evidence:site/e2e/latency-evidence/2026-11-01-museum-organ-ab.txt verify:fileLine(site/e2e/latency-evidence/2026-11-01-museum-organ-ab.txt, /pooled 7763 museum main: p95 88 median 72 samples 520/) verify:fileLine(site/e2e/latency-evidence/2026-11-01-museum-organ-ab.txt, /pooled 7763 museum pr: p95 72 median 56 samples 520/) verify:fileLine(site/e2e/latency-evidence/2026-11-01-museum-organ-ab.txt, /pooled 7763 organ main: p95 80 median 64 samples 520/) verify:fileLine(site/e2e/latency-evidence/2026-11-01-museum-organ-ab.txt, /pooled 7763 organ pr: p95 64 median 48 samples 520/)
[^release-commit]: scripts/rehearsal-evidence.mjs verify:testExists(scripts/rehearsal-evidence.test.mjs::releaseCommit releases the commit a passing rehearsal tested, main's head or an earlier commit of main, whatever merged after it)
[^rehearsal]: .github/workflows/release-rehearsal.yml; .github/workflows/release.yml verify:testExists(scripts/workflows.test.mjs::a release rehearsal writes the release commit as Release does, on a branch of its own, runs CI and the screen-reader lane there, tags nothing and deletes the branch)
[^quarantine]: .github/quarantine.json; scripts/quarantine.mjs verify:testExists(scripts/workflows.test.mjs::every quarantined test names its test (project, file and title), an issue and an owner, and its file has that test) verify:testExists(scripts/workflows.test.mjs::Release and its rehearsal retry once only a failure of quarantined tests with open issues, and any other failure stops them) verify:testExists(scripts/workflows.test.mjs::only Release and its rehearsal retry, and only after scripts/required-ci.sh failed, judging the retry with it again)
