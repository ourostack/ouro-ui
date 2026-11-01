#!/usr/bin/env node
// A CLI whose voice and text break the v1.3 claims, for xray.test.mts: a voice line in every answer (piped and under
// --json), a list whose text drops a ref, a read with no text form, a fix that names a command the overview leaves out,
// a help page over 6,000 bytes, a preview that starts with a warmer line and names no one, and an overview that ends
// in a stack trace when its reader has gone.
const argv = process.argv.slice(2);
const json = argv.includes("--json");
const words = argv.filter((a) => !a.startsWith("--"));
const [cmd, ...rest] = words;
const VOICE = "Pedal on.";
const out = (s) => process.stdout.write(`${s}\n`);
const fail = (s, code = 2) => {
  process.stderr.write(`loud: ${s}\n`);
  process.exit(code);
};
const COMMANDS = [
  { name: "list", effect: "private", readOnly: true, usage: "list" },
  { name: "flaky", effect: "private", readOnly: true, usage: "flaky" },
  { name: "noisy", effect: "private", readOnly: true, usage: "noisy" },
  { name: "big", effect: "private", readOnly: true, usage: "big" },
  { name: "secret", effect: "private", readOnly: false, hidden: true, usage: "secret" },
  { name: "send", effect: "others", usage: 'send <room> --why "<reason>"' },
  { name: "ping", effect: "others", usage: 'ping <room> --why "<reason>"' },
];
const planned = (action, summary, audience) => ({ ax: "outcome/1", action, effect: "others", ...(audience ? { audience } : {}), target: null, state: "planned", summary, postcondition: { checked: false, holds: null, how: "not checked" }, receipt: null, next: [] });

if (cmd === "help" && json) {
  out(JSON.stringify({ tool: "loud", commands: COMMANDS, exitCodes: [{ code: 0, name: "ok" }, { code: 1, name: "error" }, { code: 2, name: "usage" }], voice: [VOICE, 3, " "] }));
  process.exit(0);
}
if (!cmd && argv.includes("--help")) {
  // No EPIPE handler: into a closed pipe this ends in Node's stack trace.
  out(["loud: a fixture with a voice", "", "  list    The items.", "  flaky   Items, JSON only.", "  noisy   Items, chatty.", "  big     Items, long help.", "  send    Send to a room.", "  ping    Ping a room.", "", "Exit codes: 0 ok, 1 error, 2 usage", VOICE].join("\n"));
  process.exitCode = 0;
} else if (argv.includes("--help")) {
  if (cmd === "big") out(Array.from({ length: 100 }, (_, i) => `  line ${String(i).padStart(3, "0")} of a help page that says far more than one call needs to know`).join("\n"));
  else out(`loud ${cmd}: ${COMMANDS.find((c) => c.name === cmd)?.usage ?? ""}${cmd === "send" || cmd === "ping" ? " [--dry-run]; who will see it: the room" : ""}`);
  process.exit(0);
} else {
  const unknown = argv.find((a) => a.startsWith("--") && !["--json", "--why", "--dry-run"].includes(a));
  if (unknown) fail(`${cmd}: there is no ${unknown}. Fix: loud ${cmd}`);
  switch (cmd) {
    case "list":
      out(json ? JSON.stringify({ items: [{ ref: "a1" }, { ref: "a2" }] }) : `a1\n${VOICE}`);
      break;
    case "flaky":
      out(json ? `Here they are:\n${JSON.stringify({ items: [{ ref: "f1" }] })}` : "f1");
      break;
    case "noisy":
      out(json ? `${JSON.stringify({ items: [] })}\n${VOICE}` : `Nothing.\n${VOICE}`);
      break;
    case "big":
      if (!json) fail("big: there is no text form. Fix: loud big --json", 1);
      out(JSON.stringify({ items: [{ ref: "b1" }] }));
      break;
    case "send":
    case "ping": {
      if (!argv.includes("--why")) fail(`${cmd}: needs --why. Fix: loud ${cmd} <room> --why "<reason>"`);
      if (rest[0] !== "a1") fail(`${cmd}: there is no room "${rest[0]}". Fix: loud list`);
      const summary = `Would ${cmd} Room A; everyone in Room A will see it.`;
      if (json) out(JSON.stringify(planned(cmd, summary, cmd === "send" ? { only: false, who: "other people" } : null)));
      else out(cmd === "send" ? `Heads up: this one goes out.\n${summary}\n${VOICE}` : summary);
      break;
    }
    default:
      fail(`there is no command "${cmd}". Fix: loud secret`);
  }
}
