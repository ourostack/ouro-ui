#!/usr/bin/env node
// A tiny CLI that breaks most Ouro AX CLI claims, for xray.test.mts: no help JSON, ignored flags, errors on stdout,
// a stack trace, an ambiguous verb that acts, and a send that needs no --why. Every call is appended to $FIXTURE_CALLS.
import fs from "node:fs";

const argv = process.argv.slice(2);
if (process.env.FIXTURE_CALLS) fs.appendFileSync(process.env.FIXTURE_CALLS, JSON.stringify(argv) + "\n");
const stateFile = process.env.FIXTURE_STATE;
const bump = () => {
  if (!stateFile) return;
  const n = fs.existsSync(stateFile) ? Number(fs.readFileSync(stateFile, "utf8")) : 0;
  fs.writeFileSync(stateFile, String(n + 1));
};
const [cmd, ...rest] = argv.filter((a) => !a.startsWith("--"));
const json = argv.includes("--json");
if (cmd === "help" && json) {
  // Help that parses, but with no exit codes.
  process.stdout.write(JSON.stringify({ commands: [{ name: "rooms", effect: "private", usage: ["rooms [--limit N]"] }, { name: "send", effect: "others", usage: ["send <room> <text>"] }, { name: "doctor", effect: "private", usage: ["doctor"] }] }) + "\n");
  process.exit(0);
}
if (!cmd && argv.includes("--help")) {
  process.stdout.write("bad: a fixture\n  rooms   List rooms, and also this line goes on and on well past any sensible terminal width so it wraps badly everywhere.\n  send    Send.\n");
  process.exit(0);
}
if (argv.includes("--help")) {
  process.stdout.write(`bad ${cmd}\n`);
  process.exit(0);
}
switch (cmd) {
  case "count":
    // The X-ray's state command: how many times a read wrote.
    process.stdout.write(`${stateFile && fs.existsSync(stateFile) ? fs.readFileSync(stateFile, "utf8") : "0"}\n`);
    process.exit(0);
    break;
  case "rooms":
    // Reading marks everything read: a read that writes.
    bump();
    process.stdout.write(json ? '{"rooms":[{"ref":"r1"}]}\n{"more":true}\n' : "r1\n");
    process.exit(0);
    break;
  case "doctor":
    // A doctor whose JSON is a checks report, but whose text is coloured, redrawn and puts the verdict last.
    if (json) {
      const row = { id: "cache", label: "The cache", state: "failed", detail: "missing", fix: { byHand: "Open the app." }, kind: null, durationMs: 5 };
      process.stdout.write(JSON.stringify({ ax: "checks/1", verdict: "failed", summary: "1 of 1 check failed: The cache. 0 passed, in under 0.1s.", durationMs: 5, counts: { passed: 0, warned: 0, failed: 1, skipped: 0 }, rows: [row], next: [], exitCode: 1 }) + "\n");
      process.exit(1);
    }
    process.stdout.write("\x1b[35mDOCTOR\x1b[0m\nchecking...\r  cache  missing\n1 of 1 check failed: The cache. 0 passed, in under 0.1s.\n");
    process.exit(4);
    break;
  case "edit":
    bump();
    process.stdout.write("editing\redited\n");
    process.exit(0);
    break;
  case "send":
    if (rest[0] !== "r1") {
      process.stdout.write("Error: something went wrong\n");
      process.stderr.write(new Error("no room").stack + "\n");
      process.exit(9);
    }
    process.stdout.write("sent\n");
    process.exit(0);
    break;
  default:
    process.stderr.write("what?\n");
    process.exit(1);
}
