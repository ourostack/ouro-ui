import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, checkRelease, NotPublished, RETRY_DELAYS_MS } from "./docs-pin-release-check.mjs";

// docs-pin.yml's pin job must tell a release that genuinely does not exist apart from a GitHub API hiccup
// (ourostack/ouro-ui#2469: v1.3.505 was published all along, but a lookup error failed the job as if it were not).

test("a 404 (release not found) fails as not published, with no retry and no wait", async () => {
  let calls = 0;
  const waits = [];
  await assert.rejects(
    checkRelease(
      async () => {
        calls += 1;
        throw new Error("release not found");
      },
      "v1.3.505",
      { wait: async (ms) => waits.push(ms), log: () => {} },
    ),
    (error) => error instanceof NotPublished && /v1\.3\.505 is not a published release/.test(error.message),
  );
  assert.equal(calls, 1, "no retry of a genuine 404");
  assert.deepEqual(waits, []);
});

test("an API error (a 5xx, a rate limit, a token blip) clears on retry, after one 5s wait, with each try logged", async () => {
  let calls = 0;
  const waits = [];
  const logs = [];
  await checkRelease(
    async () => {
      calls += 1;
      if (calls === 1) throw new Error("HTTP 500: Internal Server Error");
    },
    "v1.3.505",
    { wait: async (ms) => waits.push(ms), log: (message) => logs.push(message) },
  );
  assert.equal(calls, 2, "retried once after the API error");
  assert.deepEqual(waits, [5000], "waited 5s before the retry, not the real clock");
  assert.match(logs[0], /attempt 1 of 3.*HTTP 500.*Retrying in 5s/s);
});

test("a persistent API error exhausts the retries (5s then 20s) and fails as itself, naming gh's error", async () => {
  let calls = 0;
  const waits = [];
  const logs = [];
  await assert.rejects(
    checkRelease(
      async () => {
        calls += 1;
        throw new Error("HTTP 403: API rate limit exceeded for installation ID 123.");
      },
      "v1.3.505",
      { wait: async (ms) => waits.push(ms), log: (message) => logs.push(message) },
    ),
    (error) => error instanceof ApiError && /Could not check whether v1\.3\.505 is a published release.*API rate limit exceeded/s.test(error.message),
  );
  assert.equal(calls, RETRY_DELAYS_MS.length + 1, "the initial try plus every retry, then it gives up");
  assert.deepEqual(waits, RETRY_DELAYS_MS);
  assert.equal(logs.length, RETRY_DELAYS_MS.length, "logged before each retry, not after the final failure");
});
