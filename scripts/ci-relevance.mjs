// Whether a pull request's change can reach a group of CI jobs that is costly to start, so a change
// that cannot skips them: each job is a runner the repository's other runs wait for.
//
//   node scripts/ci-relevance.mjs <target> <base> <head>   prints why, and writes `run` to $GITHUB_OUTPUT
//
// Targets (`targets` below):
//   browser   CI's browser shards (`pnpm test`, .github/workflows/ci.yml), and so the coverage they
//             measure and the browser-fallback shards that decide it
//   screens   Screens (.github/workflows/screens.yml): Ouro check over the site as it builds
//
// Each target lists the paths it never reads. A change runs the target unless every file it
// changes is one of those, so a path nobody listed, a new folder or a renamed file runs it: it
// fails closed. An empty diff, and a diff that cannot be read, run it too. The workflows ask only on
// a pull request into main; the merge queue, main, dispatched runs and release branches run
// everything, so a path wrongly listed here is still tested before it merges.
//
// This file imports nothing outside Node, so a workflow can ask it before `pnpm i`.
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** A test, type test or story anywhere: the site build and Ouro check load none of them. */
const testOrStory = /(^|\/)[^/]+\.(test\.(ts|tsx|mts|mjs)|test-d\.ts|stories\.tsx)$/;

/**
 * Per target, what it runs and the paths it never reads, each with the reason the plan prints.
 * `readers` are the files whose literal paths `scripts/ci-relevance.test.mjs` holds against the
 * list, so a reader that starts loading a listed path fails a test until the list makes room for it.
 */
export const targets = {
  browser: {
    name: "the browser shards",
    // The Vitest projects the shards run: {registry,test}/**/*.test.{ts,tsx} and site/**/*.test.{ts,tsx}
    // (vitest.config.ts), with what they import and what vitest.config.ts loads.
    unread: [
      [/^changes\/[^/]+\.md$/, "a change fragment, which only scripts/changes.mjs reads"],
      [/^AGENTS\.md$/, "the contributors' rules"],
      [/^flows\//, "a Flow review flow"],
      [/^scripts\/.+\.test\.mjs$/, "a Node script test (pnpm test:scripts)"],
      [/^scripts\/agent-usability\//, "the agent-usability test, which runs in Node"],
      [/^site\/e2e\/(?!voyage-presets\.spec\.ts$).+\.spec\.ts$/, "a site end-to-end spec, which Playwright runs"],
      [/^registry\/ouro\/e2e\/.+\.spec\.ts$/, "an end-to-end spec, which Playwright runs"],
      [/^test\/__screenshots__\//, "a screenshot baseline, which only the visual job reads"],
      [/^\.github\/(?!workflows\/ci\.yml$)/, "another workflow or repository setting"],
    ],
    readers: [/^(registry|test|site)\/.+\.(ts|tsx|mts|mjs)$/, /^vitest[^/]*\.config\.[cm]?[jt]s$/, /^scripts\/(vitest-shards|motion-reporter)\.mts$/],
  },
  screens: {
    name: "Screens",
    // `pnpm site:build` (with `pnpm i`, whose postinstall writes the docs and registry files the site
    // reads) and Ouro check over site/dist, with .github/ouro-check.json and .github/actions/check.
    unread: [
      [/^changes\/[^/]+\.md$/, "a change fragment, which only scripts/changes.mjs reads"],
      [/^AGENTS\.md$/, "the contributors' rules"],
      [/^flows\//, "a Flow review flow"],
      // site/scripts/proof.mts reads voyage-presets.spec.ts for the hero's proof line.
      [/^site\/e2e\/(?!voyage-presets\.spec\.ts$)/, "a site end-to-end spec or its helpers"],
      [/^site\/test\//, "a site test helper"],
      [testOrStory, "a test, type test or story"],
      // scripts/registry.mts prints ouro-fixtures.ts and axe-version.ts's minimum in the ouro-testing docs.
      [/^registry\/ouro\/e2e\/(?!ouro-fixtures\.ts$)/, "an end-to-end spec or its setup"],
      // site/scripts/proof.mts reads testing/vitest.ts for the browsers the hero names.
      [/^registry\/ouro\/lib\/ouro\/testing\/(?!vitest\.ts$|axe-version\.ts$)/, "the test kit"],
      [/^test\//, "the shared test setup, fixtures and baselines"],
      [/^stories\//, "a repository-only story"],
      [/^\.storybook\//, "Storybook's configuration"],
      [/^\.github\/(?!workflows\/screens\.yml$|actions\/check\/|ouro-check\.json$)/, "another workflow or repository setting"],
    ],
    readers: [/^site\/(?!e2e\/|test\/).+\.(ts|tsx|mts|mjs)$/, /^scripts\/(generate\.mjs|gen-docs\.mts|registry\.mts|components\.mts|catalog-groups\.mts|docs-summary\.mts)$/],
  },
};

/** `{ run, reasons }`: whether `changedFiles` can reach `target`, and why, one line per file. */
export function relevance(target, changedFiles) {
  const { name, unread } = targets[target];
  if (changedFiles.length === 0) return { run: true, reasons: ["no changed file was found, so nothing can be ruled out"] };
  const reasons = [];
  let run = false;
  for (const path of changedFiles) {
    const skip = unread.find(([pattern]) => pattern.test(path));
    if (skip) {
      reasons.push(`${path}: ${skip[1]}, which ${name} do not read`);
    } else {
      run = true;
      reasons.push(`${path}: ${name} may read it, so they run`);
    }
  }
  return { run, reasons };
}

function main([target, base, head]) {
  const output = (line) => appendFileSync(process.env["GITHUB_OUTPUT"] ?? "/dev/null", `${line}\n`);
  if (!targets[target] || !base || !head) {
    console.error(`[ouro-ui] ci-relevance: unknown target or missing commits (${[target, base, head].join(" ")}). Fix: node scripts/ci-relevance.mjs <${Object.keys(targets).join("|")}> <base> <head>.`);
    output("run=true");
    return 1;
  }
  const diff = spawnSync("git", ["diff", "--no-renames", "--name-only", base, head], { cwd: repoRoot, encoding: "utf8" });
  if (diff.status !== 0) {
    console.log(`git diff ${base} ${head} failed, so ${targets[target].name} run: ${diff.stderr}`);
    output("run=true");
    return 0;
  }
  const { run, reasons } = relevance(target, diff.stdout.split("\n").filter(Boolean));
  console.log(run ? `${targets[target].name} run:` : `Nothing ${targets[target].name} read changed, so they pass without running:`);
  for (const reason of reasons) console.log(`- ${reason}`);
  output(`run=${run}`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
