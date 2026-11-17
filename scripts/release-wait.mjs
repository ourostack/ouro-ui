#!/usr/bin/env node
// How long the oldest pending change has waited (release-auto.yml, on each wait). A change is pending from the first
// first-parent commit of main after the newest release's tag that brings a change line the tag's changes/ lacked: a
// pin-only commit or a CI-only commit holds none, so it does not start the clock. The clock runs from that commit's
// committer time. Prints "<sha> <minutes> over|under" for it, or nothing when no commit brings a pending change.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { releasedAt } from "./changes.mjs";

/** A wait over this many minutes opens or comments on "Release waiting" and fails Release auto. */
export const LIMIT_MINUTES = 60;

/**
 * The first of `commits` (first-parent commits after the tag, oldest first, each `{ sha, time }` with its committer
 * time in Unix seconds) whose change lines hold one `tagLines` lacks, or null. `linesOf(commit)` gives the change
 * lines that commit's changes/ held, and is only called until a commit is found.
 */
export function pendingCommit(commits, tagLines, linesOf) {
  const released = new Set(tagLines);
  return commits.find((commit) => linesOf(commit).some((line) => !released.has(line))) ?? null;
}

/** How many whole minutes `commit` has waited at `now` (milliseconds), and whether that is over `limit`. */
export function waited(commit, now, limit = LIMIT_MINUTES) {
  const minutes = Math.floor((now / 1000 - commit.time) / 60);
  return { sha: commit.sha, minutes, over: minutes > limit };
}

/** The wait of the pending change among `commits`, or null when none is pending. */
export function pendingWait(commits, tagLines, linesOf, now, limit = LIMIT_MINUTES) {
  const commit = pendingCommit(commits, tagLines, linesOf);
  return commit ? waited(commit, now, limit) : null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [tag] = process.argv.slice(2);
  if (!tag) {
    console.error("usage: release-wait.mjs <newest release tag>");
    process.exit(2);
  }
  const log = execFileSync("git", ["log", "--first-parent", "--reverse", "--format=%H %ct", `${tag}..origin/main`], { encoding: "utf8" });
  const commits = log.split("\n").filter(Boolean).map((line) => {
    const [sha, time] = line.split(" ");
    return { sha, time: Number(time) };
  });
  const found = pendingWait(commits, releasedAt(tag), (commit) => releasedAt(commit.sha), Date.now());
  if (found) console.log(`${found.sha} ${found.minutes} ${found.over ? "over" : "under"}`);
}
