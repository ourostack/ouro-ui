#!/usr/bin/env node
// How long the oldest change Release has not released has waited (release-auto.yml, on each wait): the first-parent
// commits of main after the newest release's tag, read from `git log --first-parent --reverse --format='%H %ct'`
// on stdin, oldest first. Prints "<sha> <minutes> over|under" for the oldest, or nothing when none is waiting.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** A wait over this many minutes opens or comments on "Release waiting" and fails Release auto. */
export const LIMIT_MINUTES = 60;

/** The oldest commit of `git log --format='%H %ct'` lines, oldest first, or null when there are none. */
export function oldestCommit(text) {
  const [first] = text.split("\n").filter(Boolean);
  if (!first) return null;
  const [sha, time] = first.split(" ");
  return { sha, time: Number(time) };
}

/** How many whole minutes `commit` (Unix seconds) has waited at `now` (milliseconds), and whether that is over `limit`. */
export function waited(commit, now, limit = LIMIT_MINUTES) {
  const minutes = Math.floor((now / 1000 - commit.time) / 60);
  return { sha: commit.sha, minutes, over: minutes > limit };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const commit = oldestCommit(readFileSync(0, "utf8"));
  if (commit) {
    const { sha, minutes, over } = waited(commit, Date.now());
    console.log(`${sha} ${minutes} ${over ? "over" : "under"}`);
  }
}
