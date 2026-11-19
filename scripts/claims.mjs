// The repository's claims check: lib-claims' checker (registry/ouro/lib/ouro/claims-check.mjs)
// over claims.config.json, with two checks only this repository has (docs/guides/claims.md):
//
//   pnpm claims:check              lints every surface and runs every claim's checks
//   pnpm claims:lint <file>…       the same for some files; --pr lints a pull request's title and
//                                  body (PR_TITLE, PR_BODY, or --title and --body-file) and the change
//                                  fragments its branch adds or changes, --stdin reads a draft
//   pnpm claims:show <file>        lists the file's claims, their sources and each check's result
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkClaims as checkAt, main } from "../registry/ouro/lib/ouro/claims-check.mjs";
import { syncedFiles } from "./latest-release.mjs";

export * from "../registry/ouro/lib/ouro/claims-check.mjs";

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * In the files `pnpm run docs` keeps on the newest release (scripts/latest-release.mjs), each
 * `#vX.Y.Z` or `@vX.Y.Z` tag is already a checked claim: `pnpm run docs --check` fails unless
 * it names package.json's `ouro.latestRelease`.
 */
const mask = (text) => "§".repeat(text.length);
/**
 * A release commit's registry.json (release.yml, `scripts/registry.mts --release`) records its
 * version and ends each item's docs message with "Ouro UI v<that version>.", which
 * `pnpm registry --check` holds to the version field; that stamp is already a checked claim.
 */
const releaseStamp = (text) => {
  const version = JSON.parse(text).version;
  return typeof version === "string" ? text.replaceAll(` Ouro UI v${version}.`, ` Ouro UI v${mask(version)}.`) : text;
};
const prepare = (file, text) => {
  // site/public/llms.txt is site/llms.txt with its items filled in, so it names the same tag.
  if (syncedFiles.includes(file) || file === "site/public/llms.txt") return text.replace(/([#@])v\d+\.\d+\.\d+\b/g, (tag) => tag[0] + mask(tag.slice(1)));
  return file === "registry.json" ? releaseStamp(text) : text;
};

/** The generated pages claims:check renders again, because no other check does. */
async function generatedFailures(root) {
  const runs = "scripts/agent-usability/runs/2026-10-15";
  if (!existsSync(join(root, runs)) || !existsSync(join(root, "scripts/agent-usability/page.mts"))) return [];
  const { publicationPages } = await import(pathToFileURL(join(root, "scripts/agent-usability/page.mts")).href);
  const failures = [];
  for (const [name, text] of Object.entries(publicationPages(join(root, runs), "why-no-skill.md"))) {
    const path = join(root, "docs/guides", name);
    if (!existsSync(path) || readFileSync(path, "utf8") !== text) failures.push({ message: `docs/guides/${name} differs from what scripts/agent-usability/page.mts renders from ${runs}. Render it again: node scripts/agent-usability/page.mts ${runs} docs/guides/why-no-skill.md.` });
  }
  const benchmarkPage = join(root, "docs/guides/agent-interfaces.md");
  if (existsSync(join(root, "scripts/agent-benchmark/page.mjs")) && existsSync(benchmarkPage)) {
    const { renderPage, publishedRuns } = await import(pathToFileURL(join(root, "scripts/agent-benchmark/page.mjs")).href);
    if (readFileSync(benchmarkPage, "utf8") !== renderPage(publishedRuns(join(root, "scripts/agent-benchmark/results")))) {
      failures.push({ message: "docs/guides/agent-interfaces.md differs from what scripts/agent-benchmark/page.mjs renders from scripts/agent-benchmark/results/. Render it again: node scripts/agent-benchmark/page.mjs docs/guides/agent-interfaces.md." });
    }
  }
  const reviewsPage = join(root, "docs/guides/model-reviews.md");
  if (existsSync(join(root, "scripts/model-reviews/page.mjs")) && existsSync(reviewsPage)) {
    const { renderPage, publishedRuns } = await import(pathToFileURL(join(root, "scripts/model-reviews/page.mjs")).href);
    if (readFileSync(reviewsPage, "utf8") !== renderPage(publishedRuns(join(root, "scripts/model-reviews/results")))) {
      failures.push({ message: "docs/guides/model-reviews.md differs from what scripts/model-reviews/page.mjs renders from scripts/model-reviews/results/. Render it again: node scripts/model-reviews/page.mjs docs/guides/model-reviews.md." });
    }
  }
  const interviewsPage = join(root, "docs/guides/model-interviews.md");
  if (existsSync(join(root, "scripts/model-reviews/interviews-page.mjs")) && existsSync(interviewsPage)) {
    const { renderInterviewsPage, publishedInterviews, readFindings } = await import(pathToFileURL(join(root, "scripts/model-reviews/interviews-page.mjs")).href);
    if (readFileSync(interviewsPage, "utf8") !== renderInterviewsPage(publishedInterviews(join(root, "scripts/model-reviews/interviews-results")), readFindings(join(root, "scripts/model-reviews/findings.json")))) {
      failures.push({ message: "docs/guides/model-interviews.md differs from what scripts/model-reviews/interviews-page.mjs renders from scripts/model-reviews/interviews-results/ and findings.json. Render it again: node scripts/model-reviews/interviews-page.mjs docs/guides/model-interviews.md." });
    }
  }
  const evidencePage = join(root, "docs/guides/accessibility-evidence.md");
  if (existsSync(join(root, "scripts/a11y-evidence/page.mjs")) && existsSync(evidencePage)) {
    const { renderEvidencePage, evidenceRows } = await import(pathToFileURL(join(root, "scripts/a11y-evidence/page.mjs")).href);
    if (readFileSync(evidencePage, "utf8") !== renderEvidencePage(evidenceRows(root))) {
      failures.push({ message: "docs/guides/accessibility-evidence.md differs from what scripts/a11y-evidence/page.mjs renders from the components' stories and screen-reader specs. Render it again: node scripts/a11y-evidence/page.mjs docs/guides/accessibility-evidence.md." });
    }
  }
  return failures;
}

export const hooks = { prepare, extraFailures: generatedFailures };

/** checkClaims, with this repository's hooks when it checks this repository. */
export function checkClaims(options = {}) {
  const root = options.root ?? repoRoot;
  return checkAt({ ...options, root, hooks: options.hooks ?? (root === repoRoot ? hooks : {}) });
}

/**
 * A Dependabot pull request's body quotes its upstream's release notes and commits, which are not
 * our words, and its title states the two versions it moves between. When the pull request's
 * author (PR_AUTHOR, set by GitHub, so no one else can claim the name) is Dependabot, `lint --pr`
 * skips the body, and skips the title only when it has Dependabot's one-bump shape; any other
 * title is linted as written. Attribution holds such a pull request to dependency files
 * (scripts/attribution.mjs).
 */
const bumpTitle = /^(?:build|chore|ci)?(?:\(deps(?:-dev)?\))?:? ?bump \S+ from \S+ to \S+$/i;
export function vendorText(env) {
  if (env.PR_AUTHOR !== "dependabot[bot]") return {};
  return { PR_BODY: "", ...(bumpTitle.test(env.PR_TITLE ?? "") ? { PR_TITLE: "Bump a dependency" } : {}) };
}
Object.assign(process.env, vendorText(process.env));

/** A git command's output, or undefined when git fails (a ref that does not exist). */
function git(root, args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return undefined;
  }
}

/**
 * The change fragments (changes/*.md) the branch adds or changes, against origin/main or, when the
 * checkout has no origin/main, main. With neither (a checkout that fetched only the merge commit,
 * as CI's pull request does), there is nothing to compare, so `base` is undefined and no file is listed.
 */
export function branchFragments(root) {
  const base = ["origin/main", "main"].find((ref) => git(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]) !== undefined);
  if (!base) return { base, files: [] };
  const changed = git(root, ["diff", "--name-only", "--no-renames", "--diff-filter=AM", `${base}...HEAD`, "--", "changes/"]) ?? "";
  return { base, files: changed.split("\n").filter((file) => /^changes\/.+\.md$/.test(file) && existsSync(join(root, file))) };
}

/** `lint --pr` lints the branch's change fragments too: a fragment with a claim fails the full check later, so the pull request's text command reads them now. */
export function withBranchFragments(args, root) {
  if (args[0] !== "lint" || !args.includes("--pr")) return args;
  const { base, files } = branchFragments(root);
  if (!base) process.stderr.write("No origin/main or main to compare with, so the branch's change fragments are not read here; pnpm claims:check reads every fragment.\n");
  return [...args, ...files.filter((file) => !args.includes(file))];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(withBranchFragments(process.argv.slice(2), repoRoot), { root: repoRoot, hooks, guide: "docs/guides/claims.md" });
}
