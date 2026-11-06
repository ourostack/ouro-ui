import assert from "node:assert/strict";
import { test } from "node:test";
import { BARE_FAILURE, CAUSE_MARKER, checkFailureCopyAllow, FAILURE_KEYS, LEAD_FAILURE, NOT_A_CAUSE, NOT_BARE_LEADS, statesCause, VAGUE_FAILURE_PHRASES, vagueFailureIn, vagueFailuresIn } from "./precise-copy.ts";

test("keeps the source rules kit's list of phrases", async () => {
  // @ts-expect-error The source rules kit is plain JavaScript with no declarations.
  const kit = (await import("../source-rules/source-rules.mjs")) as { VAGUE_FAILURE_PHRASES: [string, RegExp][]; BARE_FAILURE: RegExp; CAUSE_MARKER: RegExp; LEAD_FAILURE: RegExp; NOT_A_CAUSE: string[]; NOT_BARE_LEADS: string[]; statesCause: (rest: string) => boolean; vagueFailurePhrase: (text: string) => string | undefined };
  const shown = (list: readonly (readonly [string, RegExp])[]) => list.map(([name, pattern]) => `${name} ${String(pattern)}`);
  assert.deepEqual(shown(VAGUE_FAILURE_PHRASES), shown(kit.VAGUE_FAILURE_PHRASES));
  assert.equal(String(BARE_FAILURE), String(kit.BARE_FAILURE));
  assert.equal(String(CAUSE_MARKER), String(kit.CAUSE_MARKER));
  assert.equal(String(LEAD_FAILURE), String(kit.LEAD_FAILURE));
  assert.deepEqual([...NOT_A_CAUSE], kit.NOT_A_CAUSE);
  assert.deepEqual([...NOT_BARE_LEADS], kit.NOT_BARE_LEADS);
  // The two agree on every case, precise or vague.
  const samples = ["Couldn't send: you're offline. Try again when you're back online.", "Couldn't send: try again.", "Something went wrong. Error code: E42", "Error: error", "Error: the photo service says this picture was deleted", "Unable to save - try again", "No errors", "Retry failed", "Upload failed"];
  for (const text of samples) assert.equal(vagueFailureIn(text), kit.vagueFailurePhrase(text) ?? null, text);
  for (const rest of [" send: you're offline.", " send: try again.", " send because the server refused it"]) assert.equal(statesCause(rest), kit.statesCause(rest), rest);
});

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
  for (const precise of ["Couldn't send: you're offline. Try again when you're back online.", "Could not save because the server refused it", "Upload failed - the server answered 413", "Error: the photo service says this picture was deleted", "Something went wrong — the server answered 500", "Couldn't send: ${…}"]) assert.equal(vagueFailureIn(precise), null, precise);
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
