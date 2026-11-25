import assert from "node:assert/strict";
import { test } from "node:test";
import { alreadyLogged, candidateComment, candidateMarker, candidateVerdict, exemptCandidate, parseBaseOverFailure, report } from "./ceiling-fix-exempt.mjs";

const BASE_OVER = "css-size-gate docs CSS, gzip bytes: 57407 bytes, 0 more than its base's 57407, within the 512 a pull request may add, but still over its ceiling of 57344: its base was over too";
const BASE_OVER_SHRINKS = "css-size-gate docs CSS, gzip bytes: 57340 bytes, 67 less than its base's 57407, within the 512 a pull request may add, but still over its ceiling of 57344: its base was over too";
const BASE_OVER_GREW = "css-size-gate docs CSS, gzip bytes: 57420 bytes, 13 more than its base's 57407, within the 512 a pull request may add, but still over its ceiling of 57344: its base was over too";
const TIPS_IT_OVER = "css-size-gate docs CSS, gzip bytes: 57400 bytes, 56 more than its base's 57344, within the 512 a pull request may add, but past its ceiling of 57344 for the first time: this pull request tips it over";
const UNDER = "css-size-gate docs CSS, gzip bytes: 57000 bytes, 0 more than its base's 57000, within the 512 a pull request may add, under its ceiling of 57344";

test("parseBaseOverFailure reads a size-gate 'its base was over too' failure line, and only that shape", () => {
  assert.deepEqual(parseBaseOverFailure(BASE_OVER), { name: "docs CSS, gzip bytes", bytes: 57407, grew: 0, ceiling: 57344 });
  assert.deepEqual(parseBaseOverFailure(BASE_OVER_SHRINKS), { name: "docs CSS, gzip bytes", bytes: 57340, grew: -67, ceiling: 57344 });
  assert.equal(parseBaseOverFailure(TIPS_IT_OVER), null, "a pull request's own first tip over a ceiling is its own growth, never a base-over failure");
  assert.equal(parseBaseOverFailure(UNDER), null, "a passing line is not a failure at all");
  assert.equal(parseBaseOverFailure("some other log line"), null);
});

test("exemptCandidate is a candidate only for a red-main-fix pull request whose own growth is zero or less", () => {
  assert.deepEqual(exemptCandidate({ line: BASE_OVER, labels: ["red-main-fix"] }), { name: "docs CSS, gzip bytes", bytes: 57407, grew: 0, ceiling: 57344, verdict: "report" });
  assert.deepEqual(exemptCandidate({ line: BASE_OVER_SHRINKS, labels: ["red-main-fix"] }).verdict, "report");
  assert.equal(exemptCandidate({ line: BASE_OVER, labels: [] }), null, "no red-main-fix label, no exemption");
  assert.equal(exemptCandidate({ line: BASE_OVER_GREW, labels: ["red-main-fix"] }), null, "real growth over the base is never exempt, label or not");
  assert.equal(exemptCandidate({ line: TIPS_IT_OVER, labels: ["red-main-fix"] }), null, "never exempts a first-tip failure, even labelled");
});

test("candidateVerdict is allExempt only when every base-over failure found is itself exempt, never on an empty set", () => {
  assert.equal(candidateVerdict({ lines: [BASE_OVER], labels: ["red-main-fix"] }).allExempt, true);
  assert.equal(candidateVerdict({ lines: [BASE_OVER, BASE_OVER_GREW], labels: ["red-main-fix"] }).allExempt, false, "one real-growth failure among them blocks allExempt");
  assert.equal(candidateVerdict({ lines: [BASE_OVER], labels: [] }).allExempt, false, "no label, not exempt");
  assert.equal(candidateVerdict({ lines: [UNDER, TIPS_IT_OVER], labels: ["red-main-fix"] }).allExempt, false, "no base-over failure at all: nothing to exempt");
});

test("candidateMarker and alreadyLogged key on the pull request number and its head sha, so a new sha logs again", () => {
  const marker = candidateMarker(3798, "abc1234");
  assert.equal(marker, "<!-- ceiling-fix-exempt: pr 3798 sha abc1234 -->");
  assert.equal(alreadyLogged([`${marker}\nbody`], 3798, "abc1234"), true);
  assert.equal(alreadyLogged([`${marker}\nbody`], 3798, "def5678"), false);
  assert.equal(alreadyLogged([`${marker}\nbody`], 3799, "abc1234"), false);
});

test("candidateComment names the pull request, whether it would report or still fail, and every failure line's own exemption", () => {
  const verdict = candidateVerdict({ lines: [BASE_OVER], labels: ["red-main-fix"] });
  const body = candidateComment({ number: 3798, sha: "abc1234567", url: "https://x/run/1", verdict });
  assert.match(body, /would report, not fail/);
  assert.match(body, /exempt \(red-main-fix, adds no bytes\)/);
  assert.match(body, /Report-only: this candidate verdict changes nothing that merges/);
  const stillFails = candidateComment({ number: 3798, sha: "abc1234567", url: "https://x/run/1", verdict: candidateVerdict({ lines: [BASE_OVER_GREW], labels: ["red-main-fix"] }) });
  assert.match(stillFails, /would still fail/);
  assert.match(stillFails, /: not exempt/);
});

test("report logs one candidate verdict per red-main-fix pull request whose fresh-main job failed on a base-over line, skipping an unlabelled or a passing one", async () => {
  const comments = [];
  const pulls = [
    { number: 3798, head: { sha: "sha3798" }, labels: [{ name: "red-main-fix" }] },
    { number: 3799, head: { sha: "sha3799" }, labels: [] }, // no label: never a candidate, however it fails
  ];
  const api = (path) => {
    if (path.startsWith("repos/o/r/pulls?")) return pulls;
    if (path.includes("head_sha=sha3798")) return { workflow_runs: [{ id: 1, status: "completed", html_url: "https://x/run/1" }] };
    if (path.includes("head_sha=sha3799")) return { workflow_runs: [{ id: 2, status: "completed", html_url: "https://x/run/2" }] };
    if (path === "repos/o/r/actions/runs/1/jobs?per_page=100") return { jobs: [{ id: 11, name: "fresh-main", conclusion: "failure" }] };
    if (path === "repos/o/r/actions/runs/2/jobs?per_page=100") return { jobs: [{ id: 22, name: "fresh-main", conclusion: "failure" }] };
    throw new Error(`unexpected path ${path}`);
  };
  const jobLog = (repo, jobId) => (jobId === 11 || jobId === 22 ? `some step\n${BASE_OVER}\nanother line` : "");
  const result = await report({
    env: { GITHUB_REPOSITORY: "o/r", GH_TOKEN: "t" },
    api,
    jobLog,
    readIssueComments: async () => [],
    writeIssueComment: async ({ body }) => comments.push(body),
    log: () => {},
  });
  assert.equal(result.posted, 1, "only the red-main-fix pull request gets a candidate verdict logged");
  assert.match(comments[0], /pr 3798 sha sha3798/);
  assert.match(comments[0], /would report, not fail/);
});

test("report fails open and never throws when the pull requests or the issue cannot be read", async () => {
  const unreadable = await report({ env: { GITHUB_REPOSITORY: "o/r", GH_TOKEN: "t" }, api: () => { throw new Error("boom"); }, readIssueComments: async () => [], writeIssueComment: async () => {}, log: () => {} });
  assert.deepEqual(unreadable, { posted: 0 });
  const noIssue = await report({ env: { GITHUB_REPOSITORY: "o/r", GH_TOKEN: "t" }, api: () => [], readIssueComments: async () => { throw new Error("boom"); }, writeIssueComment: async () => {}, log: () => {} });
  assert.deepEqual(noIssue, { posted: 0 });
  const noRepo = await report({ env: {}, api: () => [], readIssueComments: async () => [], writeIssueComment: async () => {}, log: () => {} });
  assert.deepEqual(noRepo, { posted: 0 });
});
