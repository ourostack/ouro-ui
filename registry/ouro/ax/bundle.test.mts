import { after, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bundleText, tailLines, writeBundle } from "#ouro-ax/bundle.ts";
import { leaks, type RedactRule } from "#ouro-ax/redact.ts";

const made: string[] = [];
after(() => made.forEach((dir) => rmSync(dir, { recursive: true, force: true })));
function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "ax-bundle-"));
  made.push(dir);
  return dir;
}

// Made up, and joined at run time so no scanner mistakes this file for a leak.
const TOKEN = ["gh", "p_", "R7xk2Qm9Lw4Tz8Vb1Nc6Hy3Jd5Gf0Sa2Pe7U"].join("");
const COOKIE = ["0.AQoAk8", "Zq2Wm1Tn6Yp9"].join("");
const HOME = "/Users/jordan.lee";

const parts = {
  facts: {
    tool: "chat doctor",
    verdict: "failed",
    summary: "1 of 8 checks failed: Sign-in. 6 passed, 1 not run, in under 0.1s.",
    identity: { account: "jordan.lee@contoso.com", tenant: "6f1c2d9e-4b7a-4c3e-9a51-0d8e2f7b6c41", displayName: "Jordan Lee" },
    byTenant: { "6f1c2d9e-4b7a-4c3e-9a51-0d8e2f7b6c41": "signed-in" },
    dataFolder: `${HOME}/Library/Application Support/chat`,
    refreshToken: COOKIE,
    counts: { passed: 6, failed: 1 },
    signedIn: false,
    versions: ["0.2.11", null],
  },
  logs: {
    service: [`{"at":"2026-11-17T19:57:02Z","event":"sign-in","token":"${TOKEN}","message":"hi"}`, `19:57:03 Cookie: sid=${COOKIE}`],
    engine: [`opened ${HOME}/Library/Logs/engine.log for jordan.lee@contoso.com`],
  },
};

test("bundleText redacts the facts and every log line, and keeps the tool's own words", () => {
  const text = bundleText(parts, { home: HOME });
  for (const secret of [TOKEN, COOKIE, "jordan.lee@contoso.com", "6f1c2d9e", "jordan.lee", "hi"]) assert.ok(!text.includes(secret), `${secret} is in the bundle:\n${text}`);
  assert.deepEqual(leaks(text), []);
  assert.deepEqual(JSON.parse(text), {
    tool: "chat doctor",
    verdict: "failed",
    summary: "1 of 8 checks failed: Sign-in. 6 passed, 1 not run, in under 0.1s.",
    identity: { account: "[text]", tenant: "[id]", displayName: "[text]" },
    byTenant: { "[id]": "signed-in" },
    dataFolder: "~/Library/Application Support/chat",
    refreshToken: "[redacted]",
    counts: { passed: 6, failed: 1 },
    signedIn: false,
    versions: ["0.2.11", null],
    logs: {
      service: ['{"at":"2026-11-17T19:57:02Z","event":"sign-in","token":"[redacted]","message":"[text]"}', "19:57:03 Cookie: [redacted]"],
      engine: ["opened ~/Library/Logs/engine.log for [email]"],
    },
  });
  assert.ok(text.endsWith("}\n"));
});

test("a bundle that still holds a secret's shape after redaction is refused, and nothing is written", () => {
  // A rule that leaves its match as it is, as a rule with a mistake would: the safety net still catches it.
  const forgetful: RedactRule = { name: "ticket", re: /\bTKT-\d+/g, to: (m) => m };
  const anyId: RedactRule = { ...forgetful, to: "[ticket]" };
  const leaky = { facts: { ticket: "TKT-0" }, logs: { service: ["opened TKT-0", '{"ticket":"TKT-0"}'] } };
  assert.throws(() => bundleText(leaky, { rules: [forgetful] }), {
    message: "bundle: the facts still held ticket; the service log still held ticket after redaction, so the bundle was not written. Fix: leave that out of the bundle, or pass a rule for its shape in rules.",
  });
  assert.doesNotThrow(() => bundleText(leaky, { rules: [anyId] }), "what the app's rule leaves is clean");
  const dir = join(scratch(), "doctor");
  assert.throws(() => writeBundle(leaky, { dir, prefix: "chat-doctor", at: 0, rules: [forgetful] }), /still held ticket/);
  assert.equal(existsSync(dir), false, "not even its folder");
  const chatId = { name: "chat-id", re: /\b19:\w+@thread\.v2/g, to: "[chat]" };
  assert.match(bundleText({ facts: { ["19:abc@thread.v2"]: 1 }, logs: {} }, { rules: [chatId] }), /"\[chat\]": 1/, "keys are redacted too");
  assert.match(bundleText({ facts: {}, logs: { app: ["posted in 19:abc@thread.v2"] } }, { rules: [chatId] }), /posted in \[chat\]/);
});

test("writeBundle writes a redacted file only this user can read, named by its time, and never over another", () => {
  const dir = join(scratch(), "logs", "doctor");
  const at = Date.UTC(2026, 10, 17, 19, 57, 2, 120);
  const file = writeBundle(parts, { dir, prefix: "chat-doctor", at, home: HOME });
  assert.equal(file, join(dir, "chat-doctor-2026-11-17T19-57-02-120Z.json"));
  assert.equal(readFileSync(file, "utf8"), bundleText(parts, { home: HOME }));
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(statSync(dir).mode & 0o777, 0o700);
  assert.throws(() => writeBundle(parts, { dir, prefix: "chat-doctor", at, home: HOME }), /EEXIST/);
  assert.deepEqual(readdirSync(dir), ["chat-doctor-2026-11-17T19-57-02-120Z.json"]);
});

test("tailLines reads the last lines from the end of a file, drops a line cut in half, and gives none for a missing file", () => {
  const dir = scratch();
  assert.deepEqual(tailLines(join(dir, "missing.log"), 10), []);
  const log = join(dir, "service.log");
  writeFileSync(log, "one\r\ntwo\n\n  \nthree\nfour\n");
  assert.deepEqual(tailLines(log, 3), ["two", "three", "four"], "blank lines don't count, and CRLF ends a line too");
  assert.deepEqual(tailLines(log, 10), ["one", "two", "three", "four"]);
  assert.deepEqual(tailLines(log, 0), [], "no lines asked for, none given");
  assert.deepEqual(tailLines(log, 10, 8), ["four"], "the last 8 bytes start inside three, which is dropped");
  assert.deepEqual(tailLines(log, 10, 12), ["three", "four"], "a cut just after a line's end drops only the empty piece before it");
});
