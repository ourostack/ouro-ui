#!/usr/bin/env node
// A CLI with a protocol command, for xray.test.mts: `relay` declares protocol (its stdout is one JSON reply line), `post`
// prints that same line without declaring it, and `loud` declares it but writes two stderr lines. Each refuses without
// --why, the way a command other people see does.
const argv = process.argv.slice(2);
const [cmd] = argv.filter((a) => !a.startsWith("--"));
const reply = JSON.stringify({ code: 2, reply: { ok: false, refused: "input-invalid", message: "needs --why" } });

if (cmd === "help" && argv.includes("--json")) {
  process.stdout.write(JSON.stringify({
    tool: "proto",
    commands: [
      { name: "relay", protocol: true, effect: "others", usage: ["relay"], summary: "serve one request from stdin" },
      { name: "post", effect: "others", usage: ["post"], summary: "post a message" },
      { name: "loud", protocol: true, effect: "others", usage: ["loud"], summary: "serve a request, loudly" },
    ],
    exitCodes: [{ code: 0, name: "ok" }, { code: 1, name: "error" }, { code: 2, name: "usage" }],
  }) + "\n");
  process.exit(0);
}
if (argv.includes("--help") && cmd) {
  process.stdout.write(`proto ${cmd}\n`);
  process.exit(0);
}
if (!argv.includes("--why") && (cmd === "relay" || cmd === "post" || cmd === "loud")) {
  if (cmd === "loud") process.stderr.write("proto: loud needs --why.\nproto: loud also says this.\n");
  else process.stderr.write(`proto: ${cmd} needs --why. Fix: proto ${cmd} --why "<who asked you, and what they said>"\n`);
  process.stdout.write(reply + "\n");
  process.exit(2);
}
process.stdout.write(reply + "\n");
process.exit(0);
