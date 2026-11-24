// What a change under scripts/, test/ or .github/ can reach in CI, so a pull request that touches
// only a CI helper does not start every browser shard. Each file is in one of two lists:
//
//   `scoped`   files that reach only the CI tiers a rule names (browser, screens, installs, heavy;
//              scripts/ci-relevance.mjs) and, with `components: false`, no component's tests
//              (scripts/test-impact.mjs). Everything outside a rule's tiers is skipped.
//   `runsAll`  files that may reach everything, by top-level entry: a folder ends in "/".
//
// A new file under those folders that is in neither list fails scripts/ci-relevance.test.mjs until it
// is put in one, and that test also holds every scoped rule to what its readers actually name.
// Main, the merge queue, dispatched runs and release branches run everything regardless.
// This file imports nothing outside Node, so a workflow can ask before `pnpm i`.

/** @type {{ pattern: RegExp, tiers: string[], components: boolean, reason: string }[]} */
export const scoped = [
  { pattern: /^scripts\/[^/]+\.test\.mjs$/, tiers: [], components: false, reason: "a Node script test (pnpm test:scripts)" },
  {
    pattern: /^scripts\/(ci-budget|ci-fail-fast|ci-proof|ci-yield|fresh-main|main-green|required-checks|required-producers|cache-prune|patch-guard|quarantine|rerun-guard|size-budget|release-commit|release-note|release-wait|run-script-tests|script-tests)\.(mjs|sh)$|^scripts\/(required-ci|dispatch-required|scheduled-failure|sr-infra-issue|pages-clear|retry)\.sh$/,
    tiers: [],
    components: false,
    reason: "a CI or release helper that only the workflows and the Node script tests run",
  },
  {
    pattern: /^scripts\/current\//,
    tiers: ["installs"],
    components: false,
    reason: "Ouro Current, which only the install test's current variant and the Node script tests run (install-check.mjs takes its stylesheet module); no browser shard, design shard or heavy job loads it",
  },
  { pattern: /^scripts\/scroller-probe\.mjs$/, tiers: [], components: false, reason: "a probe run by hand for #2891, which no workflow or test runs" },
  { pattern: /^scripts\/ouro-census\//, tiers: [], components: false, reason: "the Ouro AX census, which only its Node script test (scripts/ouro-census.test.mjs) runs" },
  { pattern: /^scripts\/ax-claim-sets\.(json|mjs)$/, tiers: [], components: false, reason: "the Ouro AX claim-set history, which only its Node script test and the adoption ledger read" },
  { pattern: /^scripts\/claims-urls\.json$/, tiers: [], components: false, reason: "the claim URL list, which only the Node script tests read" },
  { pattern: /^scripts\/model-reviews\//, tiers: ["screens"], components: false, reason: "the model reviews and their pages, which the Node script tests read and the site renders at install (#2600)" },
  {
    pattern: /^scripts\/parity-data\/[^/]+\.json$/,
    tiers: ["browser", "screens", "heavy"],
    components: false,
    reason: "the platform parity data, which only the site's Apple pages, the site tests and the Node script tests read; no component or install reads it",
  },
  { pattern: /^scripts\/latency-shards\.mjs$/, tiers: ["heavy"], components: false, reason: "the latency shard table, which only the heavy tier's latency shards read" },
  { pattern: /^\.github\/headroom\.json$/, tiers: ["browser"], components: false, reason: "the tests the browser shards may run past half their timeout, which changes no test" },
  { pattern: /^scripts\/(shard\.mjs|shard-timings\.json|vitest-shards\.mts)$/, tiers: ["browser"], components: false, reason: "how the browser shards split their tests, which changes no test" },
  {
    pattern: /^scripts\/(install-test\.sh|install-delta\.mjs|raw-fetch-retry\.mjs|raw-fetch-retry-preload\.mjs|upgrade-note\.mjs|split-items\.mjs)$/,
    tiers: ["installs", "heavy", "browser", "screens"],
    components: false,
    reason: "the install test's own scripts, which the theme install test runs and the docs claims name",
  },
  { pattern: /^test\/__screenshots__\//, tiers: ["heavy"], components: false, reason: "a screenshot baseline, which only the visual job reads" },
  { pattern: /^\.github\/workflows\/(?!ci\.yml$|screens\.yml$)/, tiers: [], components: false, reason: "another workflow, which runs on its own trigger" },
];

/** Top-level entries under each folder that may reach everything. */
export const runsAll = {
  scripts: [
    "a11y-evidence/", "addresses.d.mts", "addresses.mjs", "adoption/", "agent-benchmark/", "agent-usability/", "apple-release.mjs", "attribution.mjs", "ax-docs.mts",
    "browser-deps.sh", "catalog-groups.mts", "changes.mjs", "check/", "ci-paths.mjs", "ci-relevance.mjs", "claims.mjs", "components.mts", "conformance-exemptions.mjs", "control-matrix.mts",
    "core-bundle.mts", "coverage-merge.mjs", "cross-kit/", "docs-summary.mts", "drift/", "fixtures/", "form-answer-impact.mjs", "gen-docs.mts", "generate.mjs",
    "generated-files.d.mts", "generated-files.mjs", "git-hooks/", "goto-timeout-reporter.mjs", "gradient-known.json", "headroom-ratchet.mjs", "headroom-reporter.mts", "headroom.d.mts", "headroom.mjs", "images/", "install-check.mjs", "install-folders.mts", "install-hooks.mjs",
    "kit-pin.mjs", "kits/", "latency-quiet.mjs", "latest-release.mjs", "local-test-gate.sh", "layout-animation-allowed.json", "links.mjs", "lint/", "mcp-app.mts", "mcp-app/", "mirror/", 
    "motion-coverage.mts", "motion-reporter.mts", "motion-states.mts", "mutation.mjs", "mutation/", "namespace.sh", "ouro-actions/", "parity-matrix.mjs",
    "parity-rows.d.mts", "parity-rows.mjs", "part-names-baseline.json", "part-names.mts", "pattern-size.json", "pattern-size.mjs", "physical-allowed.json", "pin-only.mjs", "platform-parity.mjs", "platform-versions.mjs",
    "pre-push.mjs", "public-registry.mjs", "published-release.mjs", "radius-codemod.mjs", "read-stdin.mjs", "readme-steps.mjs", "real-clock-ratchet.mjs", "registry.mts",
    "safari-squircle.mjs", "sandbox.mjs", "scratch.mjs", "shard.d.mts", "size-gate.d.mts", "size-gate.mjs", "source-rules.mjs", "squircle-cost/", "squircle-surface.mjs", "sr-classify.mjs", "sr-impact.mjs",
    "sr-lane-timings.mjs", "sr-yield.mjs", "stale-pages.mjs", "stall-reporter-default.mts", "stall-reporter.mts", "story-costs.mjs", "subset-coverage.mjs", "sweeps-compare.mjs", "sweeps-retake.mjs",
    "test-impact.mjs", "ts71.mts", "timings-node-reporter.mjs", "timings-playwright-reporter.mjs", "tree.d.mts", "tree.mjs", "upkeep/", "vendored.d.mts", "vendored.mjs", "waivers.mjs",
    "write-atomic.mjs",
  ],
  test: [
    "__screenshots__/", "check-known.ts", "check-story.ts", "check-sweep.ts", "conformance/", "control-suite.tsx", "controls.ts", "fixtures/", "form-answer-fixture/",
    "form-answer.config.ts", "form-answer.probe.tsx", "hide-native-corner-shape.ts", "incumbent-fixture/", "ax-standalone-fixture/", "install-fixture-next/", "install-fixture-tests/",
    "install-fixture-themes/", "install-fixture-upgrade/", "install-fixture/", "mcp-app/", "motion.ts", "shadcn-stock.css", "slice-core.ts", "slice.ts", "stories.tsx",
    "story-axe.ts", "story-costs.json", "story-selection.ts", "theme-fixtures.ts", "theme-fixtures/", "themes/", "warm-stories.ts",
  ],
  ".github": ["actions/", "copilot/", "dependabot.yml", "ouro-check.json", "ouro-current.json", "quarantine.json", "required-checks.json", "workflows/ci.yml", "workflows/screens.yml"],
};

/** A shared suite over the stories: it can fail on any component, so a change to one runs them all. */
const sharedSuite = /^test\/[^/]+\.test\.tsx?$/;

/** `{ scope: "scoped", rule }`, `{ scope: "all" }`, or undefined for a path in neither list (the test fails on it). */
export function classify(path) {
  const rule = scoped.find(({ pattern }) => pattern.test(path));
  if (rule) return { scope: "scoped", rule };
  if (sharedSuite.test(path)) return { scope: "all" };
  const [folder, ...rest] = path.split("/");
  const entries = runsAll[folder];
  if (!entries) return undefined;
  const inner = rest.join("/");
  return entries.some((entry) => (entry.endsWith("/") ? inner.startsWith(entry) : inner === entry)) ? { scope: "all" } : undefined;
}

/** `[pattern, reason]` pairs for the paths the scoped rules say `target` never reads. */
export const unreadBy = (target) => scoped.filter((rule) => !rule.tiers.includes(target)).map(({ pattern, reason }) => [pattern, `${reason}`]);
