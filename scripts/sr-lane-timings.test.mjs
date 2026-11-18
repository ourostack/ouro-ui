import assert from "node:assert/strict";
import { test } from "node:test";
import { jobGraph } from "./ci-budget.mjs";
import { dependents, laneTimings } from "./sr-lane-timings.mjs";

// The screen-reader lane's cost on a pull request (scripts/sr-lane-timings.mjs): what the lane adds to
// the run's wall time, and the runner minutes its jobs held, from a run's jobs as the API reports them.

const graph = jobGraph(`name: CI
jobs:
  plan:
    runs-on: ubuntu-latest
  sr-yield:
    name: Screen-reader yield
    needs: [plan]
    runs-on: ubuntu-latest
  screen-reader:
    needs: [plan, sr-yield]
    uses: ./.github/workflows/screen-reader.yml
  browser:
    needs: [plan]
    name: browser (\${{ matrix.shard }}/2)
    strategy:
      matrix:
        shard: [1, 2]
  ci:
    needs: [plan, browser, screen-reader]
  ci-budget:
    needs: [ci]
`);

const at = (minutes) => new Date(Date.UTC(2026, 10, 17, 12, minutes)).toISOString();
const job = (name, created, started, completed, labels = ["ubuntu-latest"]) => ({ name, labels, created_at: at(created), started_at: at(started), completed_at: completed === null ? null : at(completed) });
const macos = ["macos-26"];

test("the jobs that wait for the lane, and the lane itself, are the lane's dependents, while the rest of the run is not", () => {
  assert.deepEqual([...dependents(graph, "screen-reader")].sort(), ["ci", "ci-budget"]);
});

test("a run's screen-reader jobs give the lane's wall time, its runner minutes by platform, and the wall time it adds past the run's own jobs", () => {
  const jobs = [
    job("plan", 0, 0, 1),
    job("Screen-reader yield", 1, 1, 9),
    job("screen-reader / voiceover (macos-26)", 9, 9, 30, macos),
    job("screen-reader / nvda (windows-2025)", 9, 9, 22, ["windows-2025"]),
    job("browser (1/2)", 1, 1, 6),
    job("browser (2/2)", 1, 1, 5),
    job("ci", 30, 30, 31),
    job("ci-budget", 31, 31, null),
  ];
  const timings = laneTimings(jobs, graph);
  assert.equal(timings.ran, true);
  // The lane ran from 9 to 30 minutes; the run's own jobs ended at 6, so the lane added 24 minutes.
  assert.equal(timings.laneWallSeconds, 21 * 60);
  assert.equal(timings.addedWallSeconds, 24 * 60);
  assert.equal(timings.macosRunSeconds, 21 * 60);
  assert.equal(timings.otherRunSeconds, 13 * 60);
  assert.deepEqual(timings.laneJobs.map((entry) => [entry.name, entry.macos, entry.queuedSeconds]), [["screen-reader / voiceover (macos-26)", true, 0], ["screen-reader / nvda (windows-2025)", false, 0]]);
});

test("a run that selected no spec reports the lane as not run, with nothing added", () => {
  const jobs = [job("plan", 0, 0, 1), job("browser (1/2)", 1, 1, 6), job("ci", 6, 6, 7)];
  assert.deepEqual(laneTimings(jobs, graph), { ran: false, laneWallSeconds: 0, addedWallSeconds: 0, macosRunSeconds: 0, otherRunSeconds: 0, laneJobs: [] });
});

test("a lane that ends before the run's own jobs adds nothing", () => {
  const jobs = [job("plan", 0, 0, 1), job("browser (1/2)", 1, 1, 12), job("screen-reader / nvda (windows-2025)", 2, 2, 8, ["windows-2025"])];
  assert.equal(laneTimings(jobs, graph).addedWallSeconds, 0);
});
