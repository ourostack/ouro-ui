import { after, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bundleText, tailLines, writeBundle } from "#ouro-ax/bundle.ts";
import { leaks } from "#ouro-ax/redact.ts";

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
    identity: { account: "jordan.lee@contoso.com", tenant: "6f1c2d9e-4b7a-4c3e-9a51-0d8e2f7b6c41" },
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
    identity: { account: "[email]", tenant: "[id]" },
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
  const leaky = { facts: { byUser: { "jordan.lee@contoso.com": 3 } }, logs: {} };
  assert.throws(() => bundleText(leaky), { message: "bundle: the bundle still held email after redaction, so it was not written. Fix: drop or rename the facts that hold it." });
  const dir = join(scratch(), "doctor");
  assert.throws(() => writeBundle(leaky, { dir, prefix: "chat-doctor", at: 0 }), /still held email/);
  assert.equal(existsSync(dir), false, "not even its folder");
  const chatId = { name: "chat-id", re: /\b19:\w+@thread\.v2/g, to: "[chat]" };
  assert.throws(() => bundleText({ facts: { ["19:abc@thread.v2"]: 1 }, logs: {} }, { rules: [chatId] }), /still held chat-id, email after redaction/);
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
  assert.deepEqual(tailLines(log, 10, 8), ["four"], "the last 8 bytes start inside three, which is dropped");
  assert.deepEqual(tailLines(log, 10, 12), ["three", "four"], "a cut just after a line's end drops only the empty piece before it");
});
