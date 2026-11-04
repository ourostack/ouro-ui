# Decision: the same CI rigor on fewer runners

Nothing reaches main without the full suite passing on the tree that merges. This record keeps that rule and says how CI spends less runner time getting there. A pull request runs a fast suite, the merge queue the full suite, and one required check, `gate`, decides both. A later step lets the queue reuse a job's pass when that job's inputs are byte for byte the same as on a commit where it passed.

## Before

- **The wait.** Over the pull requests merged from 2026-11-02 05:00 UTC, the median took 312 minutes from its first entry into the merge queue to its merge, and 115 from its last.[^latency] The median entered the queue twice.[^latency]
- **A queue run.** A passing merge-queue run took a median of 27.7 minutes, and 54 at the 90th percentile.[^queue] It ran 55 jobs and 287 job-minutes.[^queue] Of 154 queue runs, 60 failed.[^queue]
- **Where the time goes.** In full queue run 41749612682, the install shards took 121 of 303 job-minutes.[^setup] Setup (the container, `pnpm i`, the checkout and Node) took 34.[^setup]
- **Pull requests.** In the 24 hours to 2026-11-04 04:00 UTC, 54 pull-request runs took 14,337 job-minutes between them; 39 of those runs were cancelled.[^pulls]
- **The pool.** The organisation's GitHub-hosted Linux and Windows jobs share one pool, which was full for 198 of 360 minutes on 2026-11-02.[^pool] On a full pool, a job that waits on another queues for a runner again once that one ends.

## The decision

1. **Split the pull request from the queue, with one gate.** A pull request into main runs the fast suite: the checks, the script tests, the browser tests and coverage the plan selects, mutation testing, the selected stories' themes and conformance, the selected end-to-end specs, the visual and registry checks, and one install app (shadcn, nova) when it changes the install test. The merge queue, main, dispatched and scheduled runs and release branches run the full suite. The `gate` job needs every other job and runs whatever they did.[^gate] It passes only when each passed, or was left out by design for that kind of run (`scripts/ci-gate.mjs`).[^gate] The gate picks the suite from the event, not from the plan, so a queue run can never pass on the fast suite.[^gate] The ruleset requires `gate` and `conformance exemptions`, the one check another workflow reports.
2. **Next: reuse a pass by fingerprint, failing closed.** Not built yet. A job's fingerprint will be a hash of the tracked files, less the paths a reviewed list marks, with a reason, as unread by its target. A file nobody listed counts as read. In the merge queue, a job whose fingerprint equals the fingerprint of a recent main commit where the job passed would reuse that pass and skip, and the gate would accept the skip only when the plan names the source commit. The install matrix would gain most: 30 of the last 120 merged pull requests changed no file the install test reads.[^installs]
3. **Measure setup, cache only what pays.** Setup is about a ninth of a run's job-minutes, and most of it is the Playwright image's start, which a cache does not shorten.[^setup] Playwright advises against caching its browsers, since a restore takes about as long as a download.[^pw-ci] The win is fewer jobs: run mutation testing on pull requests only (done here), since a queue run has nothing changed to mutate,[^mutation] and next, drop the jobs that only report a result another job already checked.
4. **Tune the queue from what the smaller suite measures**, after it has run on real traffic.
5. **Run the full suite every night on main**, with no reuse, so a wrongly listed path is caught within a day.
6. **Hold off on a paid express lane.** On this public repository, GitHub's standard runners are free and have 4 vCPUs.[^runners] A 4-core larger runner costs $0.012 a minute, so the $10 budget buys about 830 minutes, under three full runs.[^pricing] The cheaper fix is to stop pull requests from filling the pool. The third-party runners and a request to GitHub for a higher limit are for Ari, below.

## Switching over

1. Merge the gate's pull request while the ruleset still requires the old checks, which its own merge-queue run reports. Its `required checks` run fails until the ruleset changes, since the file already lists the new rules.
2. Change ruleset 24881709 to require `gate` and `conformance exemptions`, and close any "Required checks drifted" issue.
3. Start a new run on each open pull request (a push, or "Update branch"): a re-run repeats the old workflow, which has no `gate`.

## Prior art (meerkat mode)

| Idea | Verdict | Why |
| --- | --- | --- |
| [Mergify's split CI](https://docs.mergify.com/merge-queue/two-step/) | Borrow | Fast checks to enter the queue, the full suite to merge. Here, one gate on GitHub's own queue does it. |
| [GitHub merge queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue) | Adopt (in use) | Build concurrency and group size are the levers. |
| [A skipped job passes a required check](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks) | Adopt the fix | The gate runs after any outcome and accepts a skip only by policy. |
| [Turborepo's cache hash](https://turborepo.dev/docs/crafting-your-repository/caching) | Borrow | A task's hash of its inputs. Here a file counts as an input unless it is ruled out, so an unlisted file fails closed. |
| [Nx affected and its cache](https://nx.dev/concepts/how-caching-works) | Watch | Its sandbox only warns about undeclared inputs. |
| [Bazel's remote cache](https://bazel.build/remote/caching) | Ignore | It would mean rewriting the build. |
| [Vitest's changed mode](https://vitest.dev/guide/cli) | Ignore | `scripts/test-impact.mjs` already selects by the import graph. |
| [Aviator](https://docs.aviator.co/mergequeue/concepts/parallel-mode), [Graphite](https://graphite.com/docs/graphite-merge-queue) | Watch | Paid. Neither documents splitting a failed batch to find the culprit. |
| [Bors-NG](https://bors.tech/) | Ignore | Deprecated in favour of GitHub's queue. |
| [Ubicloud](https://www.ubicloud.com/docs/about/pricing), [Blacksmith](https://www.blacksmith.sh/pricing) | For Ari | Cheaper per minute than GitHub's larger runners, but both need a GitHub App on the organisation. |

## For Ari

- **Third-party runners.** Ubicloud lists a 4 vCPU Linux runner at $0.0025 a minute, with $2.50 of free credit a month.[^ubicloud] Blacksmith gives 3,000 free 2-vCPU minutes a month.[^blacksmith] Both need their GitHub App installed on `ourostack`, so this record recommends neither until the pool still fills after the split.
- **A higher limit.** GitHub's limits page sets 60 standard runners at once for a Team plan, and says Support can raise it.[^limits] Asking costs nothing.

## After

The after numbers, measured the same way on real traffic, are in `evidence/after.txt` once the changes have run for a day.

[^latency]: docs/decisions/2026-11-04-ci-same-rigor-fewer-runners/evidence/before.txt verify:fileLine(docs/decisions/2026-11-04-ci-same-rigor-fewer-runners/evidence/before.txt, /^first enqueue to merge: pull requests 28, median 312, p90 1361, max 3399$/) verify:fileLine(docs/decisions/2026-11-04-ci-same-rigor-fewer-runners/evidence/before.txt, /^last enqueue to merge: pull requests 28, median 115, p90 828, max 1179$/) verify:fileLine(docs/decisions/2026-11-04-ci-same-rigor-fewer-runners/evidence/before.txt, /^times enqueued: pull requests 28, median 2, /)
[^queue]: docs/decisions/2026-11-04-ci-same-rigor-fewer-runners/evidence/before.txt verify:fileLine(docs/decisions/2026-11-04-ci-same-rigor-fewer-runners/evidence/before.txt, /^wall min: median 27\.7 p90 54 max 178\.1 mean 34\.9$/) verify:fileLine(docs/decisions/2026-11-04-ci-same-rigor-fewer-runners/evidence/before.txt, /^jobs: median 55 /) verify:fileLine(docs/decisions/2026-11-04-ci-same-rigor-fewer-runners/evidence/before.txt, /^job-min: median 287\.4 /) verify:fileLine(docs/decisions/2026-11-04-ci-same-rigor-fewer-runners/evidence/before.txt, /^conclusions: \{"success":86,"cancelled":8,"failure":60\}$/)
[^setup]: docs/decisions/2026-11-04-ci-same-rigor-fewer-runners/evidence/before.txt verify:fileLine(docs/decisions/2026-11-04-ci-same-rigor-fewer-runners/evidence/before.txt, /^job-minutes: 303, of which setup \(container, install, checkout and Node\): 34$/) verify:fileLine(docs/decisions/2026-11-04-ci-same-rigor-fewer-runners/evidence/before.txt, /^install shards: 121 job-minutes$/)
[^pulls]: docs/decisions/2026-11-04-ci-same-rigor-fewer-runners/evidence/before.txt verify:fileLine(docs/decisions/2026-11-04-ci-same-rigor-fewer-runners/evidence/before.txt, /^pull-request runs: 54, job-minutes in all: 14337$/) verify:fileLine(docs/decisions/2026-11-04-ci-same-rigor-fewer-runners/evidence/before.txt, /^conclusions: \{"cancelled":39,"success":7,"failure":8\}$/)
[^pool]: docs/guides/evidence/2026-11-02-runner-pool.txt verify:fileLine(docs/guides/evidence/2026-11-02-runner-pool.txt, /^Linux and Windows jobs holding runners, minutes at 58 to 60: 198$/)
[^gate]: scripts/ci-gate.mjs verify:testExists(scripts/ci-gate.test.mjs::the merge queue passes only when every job of the full suite passed) verify:testExists(scripts/ci-gate.test.mjs::the gate reads the event, not the plan, to pick the suite: a plan that says fast in the queue still needs the full suite) verify:testExists(scripts/ci-gate.test.mjs::the gate needs every ci.yml job, its policy names exactly those, and nothing can skip it)
[^installs]: docs/decisions/2026-11-04-ci-same-rigor-fewer-runners/evidence/before.txt verify:fileLine(docs/decisions/2026-11-04-ci-same-rigor-fewer-runners/evidence/before.txt, /: 30 of 120$/)
[^pw-ci]: https://playwright.dev/docs/ci verify:urlOk(https://playwright.dev/docs/ci)
[^runners]: https://docs.github.com/en/actions/reference/runners/github-hosted-runners verify:urlOk(https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
[^pricing]: https://docs.github.com/en/billing/reference/actions-runner-pricing verify:urlOk(https://docs.github.com/en/billing/reference/actions-runner-pricing)
[^mutation]: .github/workflows/ci.yml verify:fileLine(.github/workflows/ci.yml, /^    if: \$\{\{ !cancelled\(\) && needs\.plan\.outputs\.tested != 'true' && github\.event_name == 'pull_request' \}\}$/) verify:testExists(scripts/ci-gate.test.mjs::a fast pull request may leave out the full suite's own jobs, and must pass mutation testing and the budget)
[^ubicloud]: https://www.ubicloud.com/docs/about/pricing verify:urlOk(https://www.ubicloud.com/docs/about/pricing)
[^blacksmith]: https://www.blacksmith.sh/pricing verify:urlOk(https://www.blacksmith.sh/pricing)
[^limits]: https://docs.github.com/en/actions/reference/limits verify:urlOk(https://docs.github.com/en/actions/reference/limits)
