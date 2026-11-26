import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JOBS_PER_PAGE, jobsPage, listJobs, listJobsAsync } from "./run-jobs.mjs";

const reply = (all) => (url) => {
  const page = Number(url.match(/&page=(\d+)/)[1]);
  return { total_count: all.length, jobs: all.slice((page - 1) * JOBS_PER_PAGE, page * JOBS_PER_PAGE) };
};

test("a run's jobs come in pages of 30, with the page and any extra query in the URL", () => {
  assert.equal(JOBS_PER_PAGE, 30);
  assert.equal(jobsPage("repos/o/r/actions/runs/7", 2), "repos/o/r/actions/runs/7/jobs?per_page=30&page=2");
  assert.equal(jobsPage("repos/o/r/actions/runs/7", 1, "filter=latest&"), "repos/o/r/actions/runs/7/jobs?filter=latest&per_page=30&page=1");
});

test("listJobs follows the pages until it has every job, and stops on an empty page", async () => {
  const all = Array.from({ length: 151 }, (_, id) => ({ id }));
  assert.equal(listJobs(reply(all), "r").length, 151);
  assert.equal((await listJobsAsync(async (url) => reply(all)(url), "r")).length, 151);
  assert.deepEqual(listJobs(() => ({ total_count: 5, jobs: [] }), "r"), []);
});

test("no script or workflow reads a run's jobs in a page other than 30, or without the shared reader", () => {
  const files = execFileSync("git", ["ls-files", "scripts", ".github/workflows"], { encoding: "utf8" })
    .split("\n")
    .filter((file) => /\.(mjs|mts|sh|yml)$/.test(file) && !/\.test\.mjs$/.test(file) && file !== "scripts/run-jobs.mjs");
  const problems = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const [url] of text.matchAll(/\/jobs\?[^\s"'`)]*/g)) {
      const size = url.match(/per_page=([^&\s]*)/)?.[1];
      if (size !== "30" && size !== "${JOBS_PER_PAGE}" && size !== "${jobsPerPage}") problems.push(`${file}: ${url} reads a page of ${size ?? "the default size"}; list a run's jobs through scripts/run-jobs.mjs`);
    }
    if (/\.mjs$/.test(file) && /actions\/runs\/[^\s`"']*\/jobs\?/.test(text) && !/from "(\.\/|\.\.\/)run-jobs\.mjs"/.test(text)) problems.push(`${file}: reads a run's jobs without importing scripts/run-jobs.mjs`);
  }
  assert.deepEqual(problems, []);
});
