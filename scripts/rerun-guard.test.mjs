import assert from "node:assert/strict";
import { test } from "node:test";
import { URL } from "node:url";
import { alreadyFiled, guardComment, guardMarker, hasFiledCause, ISSUE_NUMBER, mentionsRun, postComment, readComments, verdict } from "./rerun-guard.mjs";

test("mentionsRun finds the bare run id word-bounded, and inside its run URL, but not a longer number that contains it", () => {
  assert.ok(mentionsRun("run 45207607524 on b43be0ac8", "45207607524"));
  assert.ok(mentionsRun("https://github.com/ourostack/ouro-ui/actions/runs/45207607524", "45207607524"));
  assert.ok(!mentionsRun("run 145207607524", "45207607524"));
  assert.ok(!mentionsRun("run 452076075241", "45207607524"));
  assert.ok(!mentionsRun("no run named here", "45207607524"));
});

test("hasFiledCause needs one comment that both names the run and files a signature", () => {
  const runId = "45207607524";
  assert.ok(hasFiledCause([`**Signature:** run ${runId} on b43be0ac8, job browser (16/22): a known flake.`], runId));
  // A signature with no bold, and a plain lowercase "signature:" line, still counts.
  assert.ok(hasFiledCause([`Signature: run ${runId}, infra flake.`], runId));
  assert.ok(hasFiledCause([`some prose\nsignature: run ${runId}`], runId));
  // Naming the run with no signature line is not a filed cause.
  assert.ok(!hasFiledCause([`run ${runId} failed, still looking`], runId));
  // A signature for another run does not cover this one.
  assert.ok(!hasFiledCause(["**Signature:** run 1 on abc, a known flake."], runId));
  // Split across two comments (named in one, signatured in another) is not one comment that does both.
  assert.ok(!hasFiledCause([`run ${runId} failed`, "**Signature:** an unrelated flake"], runId));
});

test("guardComment carries a marker guardMarker and alreadyFiled both read, so a second run of the job never comments twice", () => {
  const comment = guardComment({ runId: "1", attempt: "2", runUrl: "https://github.com/o/r/actions/runs/1" });
  assert.match(comment, new RegExp(guardMarker("1", "2").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.ok(comment.includes("https://github.com/o/r/actions/runs/1"));
  assert.ok(alreadyFiled([comment], "1", "2"));
  assert.ok(!alreadyFiled([comment], "1", "3"), "a different attempt is not the same marker");
  assert.ok(!alreadyFiled([comment], "2", "2"), "a different run is not the same marker");
});

test("guardComment names the triggering actor when given one, and says so plainly when it is not", () => {
  const named = guardComment({ runId: "1", attempt: "2", runUrl: "https://github.com/o/r/actions/runs/1", actor: "arimendelow" });
  assert.ok(named.includes("rerun by arimendelow"));
  const unnamed = guardComment({ runId: "1", attempt: "2", runUrl: "https://github.com/o/r/actions/runs/1" });
  assert.ok(unnamed.includes("rerun by someone (actor unknown)"));
});

test("verdict passes attempt 1 outright, passes an attempt with a filed cause, and otherwise gives the comment to file, once", () => {
  const runId = "9";
  const runUrl = "https://github.com/o/r/actions/runs/9";
  assert.deepEqual(verdict({ runId, attempt: "1", runUrl, bodies: [] }), { status: "first-attempt" });
  assert.deepEqual(verdict({ runId, attempt: "2", runUrl, bodies: ["**Signature:** run 9, a known flake."] }), { status: "caused" });
  const first = verdict({ runId, attempt: "2", runUrl, actor: "arimendelow", bodies: [] });
  assert.equal(first.status, "uncaused");
  assert.ok(first.comment.includes(runUrl));
  assert.ok(first.comment.includes("rerun by arimendelow"));
  // Already filed (by an earlier run of this same job, for this run and attempt): nothing left to comment.
  const already = verdict({ runId, attempt: "2", runUrl, bodies: [first.comment] });
  assert.deepEqual(already, { status: "uncaused", comment: null });
});

test("readComments pages through every comment, and postComment sends the body as JSON with the token", async () => {
  const page = (bodies) => ({ ok: true, json: async () => bodies.map((body) => ({ body })) });
  const calls = [];
  const paged = async (url) => {
    calls.push(url);
    const n = Number(new URL(url).searchParams.get("page"));
    return n === 1 ? page(Array.from({ length: 100 }, (_, i) => `c${i}`)) : page(["c100"]);
  };
  const bodies = await readComments({ fetch: paged, repository: "o/r", token: "t", issue: ISSUE_NUMBER });
  assert.equal(bodies.length, 101);
  assert.equal(calls.length, 2);
  assert.ok(calls[0].includes(`/repos/o/r/issues/${ISSUE_NUMBER}/comments`));

  await assert.rejects(readComments({ fetch: async () => ({ ok: false, status: 404, text: async () => "nope" }), repository: "o/r", issue: ISSUE_NUMBER }), /404/);

  let sent;
  const post = async (url, init) => {
    sent = { url, ...init };
    return { ok: true };
  };
  await postComment({ fetch: post, repository: "o/r", token: "t", issue: ISSUE_NUMBER, body: "hello" });
  assert.equal(sent.method, "POST");
  assert.equal(sent.headers.authorization, "Bearer t");
  assert.deepEqual(JSON.parse(sent.body), { body: "hello" });

  await assert.rejects(postComment({ fetch: async () => ({ ok: false, status: 403, text: async () => "no" }), repository: "o/r", token: "t", issue: ISSUE_NUMBER, body: "x" }), /403/);
});
