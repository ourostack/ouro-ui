# Generated files out of component PRs (notes, untracked)

Branch ci/generated-not-committed off origin/main 0397fa74. Brief: own the generated-file conflict cause; land after v1.2.15 tag if it touches release/rehearsal/required checks/merge_group.

## Evidence (2026-10-31 ~04:30 PT)
- #301 was removed from the queue (merge_conflict) at 08:04Z when #299 merged. `git merge-tree` of #301's pre-force-push head 3d5bc375 against main after #299 (2f7dbeb9) and after #300 (acc48ee2): conflicts in registry.json, site/public/llms.txt, test/generated/control-matrix.json. README merged clean (#284 works).
- Cause: these three are ordered by component.json order; autocomplete took 2650 (new top, alone), so every later new component lands after it, in the same gap.
- Open waves now: #301 and #289 each merge clean with main and with each other (merge-tree, 04:35 PT).
- shadcn 4.21.1 GitHub source (`@shadcn/registry` 0.1.0) fetches root registry.json at the ref from raw.githubusercontent.com; `include` exists but needs an explicit list of registry.json paths (still an aggregate).

## Inventory (generator -> consumers)
- registry.json (pnpm registry): shadcn GitHub path reads root registry.json at the ref (ref-less main, #vX tags, CI `registry validate ourostack/ouro-ui#$REF`, install-github on main); namespace.sh from the tag; release-commit.sh --release; claims counts; registry/subset-coverage/test-impact tests; Tandem scripts/ouro-add.ts reads a tag checkout. Known external installs (Tandem, Spoonjoy) use #vX tags.
- site/public/llms.txt Items (pnpm registry) + tag (docs): Pages site (published-release reads Pages copy), links.mjs, claims lint, site tests. Mostly hand-written; Items lines 30-249.
- test/generated/{control,motion}-matrix.json (controls:matrix): browser tests + tsc only.
- site/src/docs/{catalog,pages}.json (docs): site build/tests, links. Sorted by name.
- README catalog/items, docs/parts.md, docs/<Export>.md (docs): GitHub readers, site. README alphabetical since #284; merged clean tonight.
- Not conflict sources: interactive-components.json (sorted), shard-timings.json, voyage-sources.generated.css (sorted), claims-urls.json.
- Release: release-commit.sh then `git commit -am` (tracked files only). release-rehearsal.yml checks out `ref: main` (cannot rehearse a branch). CI checks job runs release-commit.sh every run.
- Ruleset "main": no bypass actors; merge_queue required.
- Open waves #301 and #289 modify registry.json, llms.txt, catalog.json, README, control-matrix (301 also motion): untracking any of them before they merge = modify/delete conflict = queue ejection.

## Phase 1: draft PR #311 (8d417e4f)
- Matrices written by vitest.config.ts load and `pnpm typecheck`; gitignored; CI registry job runs `pnpm controls:matrix`.
- Local: control-matrix + motion tests 17/17, workflows/test-impact/required-checks 148/148, claims lint AGENTS + PR body pass; config load writes both files from nothing; output byte-identical to main's.

## Demo (merge-tree, #299 main 2f7dbeb9 vs #301 pre-push 3d5bc375)
- As is: registry.json, llms.txt, control-matrix.json conflict.
- Matrices removed from all three commits (phase 1): registry.json and llms.txt still conflict.
- Also registry.json, llms.txt, catalog.json, pages.json removed (phase 2): clean, exit 0.
- So phase 1 alone does not stop this jam; phase 2 does.

## More consumers found
- Required check `install (ouro, nova)` adds `ourostack/ouro-ui/ouro-theme#<head sha>` from GitHub: needs registry.json at the ref. Phase 2 must install it from the local build on PRs/queue and from GitHub on release branches.
- install-github (not required): ref-less main; retire or move to release branch.
- Milestone posted: tandem#394 issuecomment-6542659915.

## Option A (decided by the coordinator for Ari, 2026-10-31): installs take a tag, main has no registry.json
- PR #312 (stacked on #311): registry.json, site/public/llms.txt, site/src/docs/{catalog,pages,page-index}.json gitignored; `pnpm i` postinstall scripts/generate.mjs writes them; release-commit.sh `git add --force` them; registry --check guards tracked-on-main and unreadable-on-GitHub; ouro variant falls back to local; install-github installs newest tag; claims-check lints ignored generated surfaces; llms template site/llms.txt.
- Stub registry.json on main rejected: probes on a pushed probe branch (deleted) showed shadcn prints `Registry item "dialog" was not found.` (empty stub) or a path name (include trick), neither clearer than the missing-file message, and a committed stub at the generated path would need a git filter or skip-worktree to stay unchanged. README/llms/site/release notes quote the missing-file message instead.
- Audit: Spoonjoy (spoonjoy-v2, spoonjoy-apple, org repos): every install pins #v1.2.13; inspector story links tree/main source (unaffected). No PR needed. Tandem: scripts/ouro-add.ts reads `git show <tag>:registry.json` (works with tags; main/branch fails) -> draft teams-microsoft/tandem#480 adds a clear error. ourostack org: only ouroboros-website links the repo.
- Demo (script in session files gen-demo.sh): Toolbar and Autocomplete (#300) split into two branches off a base without them. #312 layout: merge clean, merged tree == #312 tip, docs/registry/matrix checks pass on each branch and the merge. Main layout: conflicts in registry.json, llms.txt, control-matrix.json.
- Local rehearsal on the merged tree: release-commit.sh 1.2.15 -> commit carries all 7 generated files + CHANGES.md, 2797/2797 deps pinned, release-branch registry/docs --check pass, namespace.sh + verify-build match byte for byte. Main guard fails on that commit as intended.
- install-github variant: install from v1.2.14 + tsc + vite build pass; install check now compares against the tag's sources (OURO_SOURCE_ROOT); passes.

## Review fix (2026-10-31 07:00-08:00 PT)
- install-github now runs the tag's own harness: git archive of the tag into $registry/tag, its test/install-fixture, its shadcn pin (from its install-test.sh), its scripts/install-check.mjs (node_modules symlinked). OURO_SOURCE_ROOT change to install-check.mjs reverted. Test: workflows.test.mjs "install-github checks the newest release with that release's own harness..." (stand-in git/npm/npx and a stand-in tag tree).
- CI proof: probe branch probe/install-github (PR tip + temporary push-triggered workflow with the job verbatim minus its main-only `if`), run 41208548766: success in 2.5 min; log shows "Fixture app, as v1.2.14 has it" and "install check: shadcn app passes (runtime)". Branch deleted.
- e2e (3/4) "WebKit encountered an internal error" fails on many branches and queue runs today; re-ran.
- Tandem #480: plan item #484 (lane ci, agent ci-speed, started), body Closes #484 + Visual proof line, rebased, ready for review. CI green.
- Later: README items/catalog regions still committed; same-gap conflicts possible (alphabetical); options: regenerate only in release/prepare PRs, or link the site catalog.
- Re-review fix (07:50-09:10 PT): install-github installs the tag's own lockfile in the harness (pnpm install --frozen-lockfile --ignore-scripts) and runs the tag's runtime_only (sourced from the tag's install-test.sh with its vitest pin, root=harness). Pinning test updated. Probe run 41211747083: success (v1.2.14 deps 2.3 s, install check passes, "No test files found"). Probe branch deleted. #312 CI green at 2a2f28ea after one re-run of e2e (3/4) (site-webkit voyage flake, also on other branches).
