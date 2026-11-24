// Checks that a tag is a published release before docs-pin.yml's pin job points the docs at it
// (.github/workflows/docs-pin.yml, "Point the docs at the release"). `gh release view` can fail for the tag it is
// given two different ways: the release genuinely does not exist (gh prints "release not found"), or GitHub's API
// had a hiccup (a 5xx, an installation rate limit, a token blip) that says nothing about whether the release is
// published. Treating the second as the first failed run 45318383848 on v1.3.505, a release published all along
// (ourostack/ouro-ui#2469). This follows release.yml's "Check the version, the tag and main's CI" (which also greps
// for "release not found" before trusting any other gh error) and the parity lane's retry
// (scripts/parity-matrix.mjs, ourostack/ouro-ui#3339): retry an API error twice with backoff, logging each try, and
// fail an API error as itself rather than as "not published".
//
//   node scripts/docs-pin-release-check.mjs <tag>
//       in GitHub Actions: GH_TOKEN, read from the environment by gh itself. Exits 0 when the tag is a published
//       release, 1 otherwise, with ::error:: naming why.
import { execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

/**
 * How long to wait before each retry of a GitHub API error: 5s, then 20s. Three attempts total, so a hiccup that
 * clears before the third try never reaches ApiError. A genuine "release not found" throws on the first try, with
 * no retry.
 */
export const RETRY_DELAYS_MS = [5000, 20000];

/** The release does not exist: gh said so itself, not a GitHub hiccup. */
export class NotPublished extends Error {}
/** gh could not be asked, or answered something other than "release not found", even after retrying. */
export class ApiError extends Error {}

/**
 * Checks that `tag` is a published release, retrying a GitHub API error (anything `run` throws other than "release
 * not found") up to twice, logging before each retry. `run(tag)` runs `gh release view <tag> --json tagName` and
 * resolves on success or throws an Error whose message is gh's combined output; `wait` and `log` are injectable for
 * tests.
 */
export async function checkRelease(run, tag, { retryDelaysMs = RETRY_DELAYS_MS, wait = (ms) => sleep(ms), log = console.log } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      await run(tag);
      return;
    } catch (error) {
      const message = String(error.message ?? error).trim();
      if (/release not found/i.test(message)) throw new NotPublished(`${tag} is not a published release.`, { cause: error });
      if (attempt >= retryDelaysMs.length)
        throw new ApiError(`Could not check whether ${tag} is a published release: ${message}`, { cause: error });
      const delayMs = retryDelaysMs[attempt];
      log(
        `::warning::Could not check whether ${tag} is a published release (attempt ${attempt + 1} of ${retryDelaysMs.length + 1}): ${message}. Retrying in ${delayMs / 1000}s.`,
      );
      await wait(delayMs);
    }
  }
}

/** `gh release view <tag> --json tagName`, throwing an Error with gh's combined stdout and stderr on failure. */
export function ghReleaseView(tag) {
  try {
    execFileSync("gh", ["release", "view", tag, "--json", "tagName"], { stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const output = [error.stdout, error.stderr]
      .filter(Boolean)
      .map((buf) => buf.toString().trim())
      .filter(Boolean)
      .join("\n");
    throw new Error(output || error.message, { cause: error });
  }
}

async function main() {
  const [tag] = process.argv.slice(2);
  if (!tag) {
    console.error("::error::usage: node scripts/docs-pin-release-check.mjs <tag>");
    process.exit(1);
  }
  try {
    await checkRelease(ghReleaseView, tag);
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
