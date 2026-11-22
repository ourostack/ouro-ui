import assert from "node:assert/strict";
import { test } from "node:test";
import { checkFailureCopyAllow, FAILURE_KEYS, preciseFailureProblem, vagueFailureIn, vagueFailuresIn } from "#ouro-ax/precise-copy.ts";

test("finds each vague phrase and a bare failure, and lets precise copy and allowed text through", () => {
  assert.equal(vagueFailureIn("Couldn't show this picture"), "couldn't");
  assert.equal(vagueFailureIn("This photo could not be opened."), "could not");
  assert.equal(vagueFailureIn("Something went wrong"), "something went wrong");
  assert.equal(vagueFailureIn("Unable to send"), "unable to");
  assert.equal(vagueFailureIn("Messages failed to load"), "failed to load");
  assert.equal(vagueFailureIn("An unexpected error occurred."), "an error occurred");
  assert.equal(vagueFailureIn("Error"), "bare error");
  assert.equal(vagueFailureIn("Error:"), "bare error");
  assert.equal(vagueFailureIn("Upload failed"), "bare failed");
  assert.equal(vagueFailureIn("The photo service says this picture was deleted. Ask its owner to share it again."), null);
  assert.equal(vagueFailureIn("3 failed"), null);
  // The cause after the phrase makes it precise; without one, or with nothing after the colon, it is vague.
  for (const precise of ["Couldn't send: you're offline. Try again when you're back online.", "Could not save because the server refused it", "Upload failed - the server answered 413", "Error: the photo service says this picture was deleted", "Something went wrong — the server answered 500", "Couldn't send: ${…}", "Couldn't save: it failed because the disk is full", "Couldn't send: the mail service stopped answering"]) assert.equal(vagueFailureIn(precise), null, precise);
  assert.equal(vagueFailureIn("Couldn't send."), "couldn't");
  assert.equal(vagueFailureIn("Couldn't send:"), "couldn't");
  assert.equal(vagueFailureIn("Error: something went wrong"), "something went wrong");
  // A negation or an action before the word is no failure.
  for (const text of ["No errors", "Nothing failed", "Zero errors", "None failed", "Show errors", "Hide errors", "Retry failed", "Clear errors"]) assert.equal(vagueFailureIn(text), null, text);
  assert.equal(vagueFailureIn("Sync errors"), "bare error");
  // A cause in the same sentence, of two words or a substitution, that is not a next step or a vague word; every occurrence.
  const vague = {
    "Couldn't send: try again.": "couldn't",
    "Something went wrong: please try again later.": "something went wrong",
    "Something went wrong. Error code: E42": "something went wrong",
    "Unable to save - try again": "unable to",
    "Couldn't send: error": "couldn't",
    "Couldn't sync since yesterday": "couldn't",
    "Couldn't send: you're offline. Could not retry.": "could not",
    "Could not send: the server could not say": "could not",
    "Error: error": "bare error",
    "Error: please try again": "bare error",
    "Upload failed: try again": "bare failed",
    "Something went wrong: it broke.": "something went wrong",
    "Couldn't send: it didn't work.": "couldn't",
    "Couldn't save: there was a problem": "couldn't",
    "Upload failed: an issue occurred": "bare failed",
    "Error: something stopped working": "bare error",
  };
  for (const [text, phrase] of Object.entries(vague)) assert.equal(vagueFailureIn(text), phrase, text);
  // A code or a status is not copy.
  assert.equal(vagueFailureIn("failed"), null);
  assert.equal(vagueFailureIn("not_found"), null);
  const allow = [{ match: "could not be charged", reason: "names the card service and its answer" }];
  assert.equal(vagueFailureIn("The card service says your card could not be charged. Use another card.", allow), null);
  assert.equal(vagueFailureIn("Your card could not be read.", allow), "could not");
});

test("walks a value, reading an outcome's error, human reason and summary and a checks report's findings, not the person's data", () => {
  const outcome = {
    ax: "outcome/1",
    state: "failed",
    summary: "Couldn't send",
    error: { code: "send_failed", message: "Something went wrong" },
    human: { reason: "Unable to reach the mail service", resume: { command: "mail send", why: "Try again" } },
    target: { kind: "message", id: "m1", name: "Could not wait" },
  };
  const found = vagueFailuresIn(outcome, { messagesOnly: true });
  assert.deepEqual(
    found.map((f) => [f.where, f.phrase]),
    [
      ["summary", "couldn't"],
      ["error.message", "something went wrong"],
      ["human.reason", "unable to"],
    ],
  );
  const report = { ax: "checks/1", summary: "1 of 1 check failed", rows: [{ id: "mail", label: "Mail", state: "failed", detail: "Could not sign in", fix: null }] };
  assert.deepEqual(vagueFailuresIn(report, { messagesOnly: true }).map((f) => f.where), ["rows[0].detail"]);
  // A read's own data, outside an Ouro AX answer, is the person's.
  assert.deepEqual(vagueFailuresIn({ notes: [{ summary: "Couldn't sleep" }], next: ["Error"] }, { messagesOnly: true }).map((f) => f.where), ["next[0]"]);
  // Help is read in full, and an allowed text carries its entry.
  const allow = [{ match: "could not be charged", reason: "names the card service and its answer" }];
  const help = vagueFailuresIn({ commands: [{ name: "pay", summary: "Says why a card could not be charged" }, { name: "x", summary: "Fails with an error occurred" }] }, { allow });
  assert.deepEqual(help.map((f) => [f.where, f.allowed?.reason ?? null]), [
    ["commands[0].summary", "names the card service and its answer"],
    ["commands[1].summary", null],
  ]);
  assert.deepEqual(vagueFailuresIn("Error"), [{ phrase: "bare error", where: "", text: "Error", allowed: null }]);
  assert.deepEqual(vagueFailuresIn(null), []);
  assert.ok(FAILURE_KEYS.has("reason"));
});

test("an allow-list needs a match and a reason in every entry", () => {
  const good = [{ match: "could not be charged", reason: "names the card service and its answer" }];
  assert.deepEqual(checkFailureCopyAllow(good), good);
  assert.throws(() => checkFailureCopyAllow({ match: "x" }), /is a list\. Fix: \[\{ "match"/);
  assert.throws(
    () => checkFailureCopyAllow([{ match: "", reason: "r" }, { match: "x" }, null, ...good]),
    (e: Error) =>
      e.message ===
      'the failure copy allow-list has 3 problems:\nentry 0 {"match":"","reason":"r"} needs a non-empty "match" and a "reason". Fix: { "match": "<part of the text>", "reason": "<why this wording is precise>" }.\nentry 1 {"match":"x"} needs a non-empty "match" and a "reason". Fix: { "match": "<part of the text>", "reason": "<why this wording is precise>" }.\nentry 2 null needs a non-empty "match" and a "reason". Fix: { "match": "<part of the text>", "reason": "<why this wording is precise>" }.',
  );
  assert.throws(() => checkFailureCopyAllow([{ match: "x", reason: " " }]), /has 1 problem:\n/);
});

test("a preciseFailure reason on an error, human or checks row lets its own texts through with that reason, and a blank one does not", () => {
  const why = "names the mail service and its answer";
  const outcome = {
    ax: "outcome/1",
    state: "failed",
    summary: "Couldn't send",
    error: { code: "send_failed", message: "Could not reach the mail service", preciseFailure: why },
    human: { reason: "Unable to sign in", preciseFailure: " ", resume: { command: "mail login", why: "Sign in" } },
  };
  const found = vagueFailuresIn(outcome, { messagesOnly: true });
  assert.deepEqual(found.map((f) => [f.where, f.allowed?.reason ?? null]), [["summary", null], ["error.message", why], ["human.reason", null]]);
  const report = { ax: "checks/1", summary: "1 of 1 check failed", rows: [{ id: "mail", label: "Mail", state: "failed", detail: "Could not sign in", preciseFailure: why }] };
  assert.deepEqual(vagueFailuresIn(report, { messagesOnly: true }).map((f) => [f.where, f.allowed?.reason ?? null]), [["rows[0].detail", why]]);
  assert.equal(preciseFailureProblem({ preciseFailure: "" }), "preciseFailure needs a reason in words");
  assert.equal(preciseFailureProblem({ preciseFailure: 3 }), "preciseFailure needs a reason in words");
  assert.equal(preciseFailureProblem({}), null);
  assert.equal(preciseFailureProblem({ preciseFailure: why }), null);
});
