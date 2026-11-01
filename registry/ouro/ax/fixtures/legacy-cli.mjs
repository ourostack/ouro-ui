#!/usr/bin/env node
// A CLI in the shape of one built before the kit, for xray.test.mts: help JSON with usage lists, a stream, refs to
// harvest, text on stdin, actions other people see with and without a preview, and a few faults. State lives in
// $LEGACY_STATE. $LEGACY_MODE names variants, comma-separated: "second" (help JSON only from --help --json), "unstable"
// (the state moves on its own), "writes" (a read writes), "nousage" (no usage exit code), "badwait" (watch refuses
// conversations), "nostreams" (no command streams, so a run takes less time).
import fs from "node:fs";

const argv = process.argv.slice(2);
const mode = (process.env.LEGACY_MODE ?? "").split(",");
const file = process.env.LEGACY_STATE;
const load = () => (file && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { log: [], reads: 0, names: {} });
const save = (s) => file && fs.writeFileSync(file, JSON.stringify(s));
const out = (s) => process.stdout.write(`${s}\n`);
const fail = (s, code) => {
  process.stderr.write(`legacy: ${s}\n`);
  process.exit(code);
};
const others = ["send", "react", "rename", "pin", "invite"];
const COMMANDS = [
  { name: "conversations", effect: "private", usage: ["conversations [--limit N] [--all]"] },
  { name: "draft show", effect: "private", usage: ["draft show <conversation> [--all]"] },
  { name: "history", effect: "private", usage: ["history <conversation> list"] },
  { name: "noise", effect: "private", usage: ["noise"] },
  { name: "look", effect: "private", usage: "look <conversation> [--limit N]" },
  { name: "tail", effect: "private", usage: ["tail"] },
  { name: "quiet", effect: "private", usage: ["quiet"] },
  { name: "meeting", effect: "private", usage: ["meeting <meeting>"] },
  { name: "pair", effect: "private", usage: ["pair <a> <b>"] },
  { name: "set", effect: "private", usage: ["set <conversation> on"] },
  { name: "alias", effect: "private", usage: ["lk <conversation>"] },
  { name: "find", effect: "private", usage: ["find --q <words>"] },
  { name: "broken", effect: "private", usage: ["broken"] },
  { name: "wide", effect: "private" },
  { name: "noeffect", usage: ["noeffect"] },
  { name: "note", effect: "private", usage: ["note <conversation> -"] },
  { name: "watch", effect: "private", usage: ["watch <conversation> [--timeout <duration>]"] },
  { name: "send", effect: "others", usage: ["send <conversation> -", "send", 'send <conversation> <text> --why "<reason>"'] },
  { name: "react", effect: "others", usage: ['react <conversation>#<message id> like|heart --why "<reason>"'] },
  { name: "rename", effect: "others", usage: ['rename <conversation> <name> --why "<reason>"'] },
  { name: "pin", effect: "others", usage: ['pin <conversation> --why "<reason>"'] },
  { name: "invite", effect: "others", usage: ['invite <person> --why "<reason>"'] },
];
if (mode.includes("nostreams")) COMMANDS.splice(0, COMMANDS.length, ...COMMANDS.filter((c) => !["tail", "quiet", "noise"].includes(c.name)));
const EXIT = [{ code: 0, short: "ok" }, { code: 1, short: "error" }, { code: 2, short: mode.includes("nousage") ? "bad input" : "usage" }, { code: 5, short: "waited and it didn't happen" }];

if (argv[0] === "state") {
  const s = load();
  out(JSON.stringify({ log: s.log, reads: s.reads, at: Date.now(), names: s.names, ...(mode.includes("unstable") ? { tick: process.hrtime.bigint().toString() } : {}) }));
  process.exit(0);
}
if (argv[0] === "events") {
  const event = { ax: "work-event/1", id: "e1", at: "2026-10-30T09:00:00.000Z", kind: "action", actor: "agent:a", onBehalfOf: "Ari", target: null, why: "Riley asked", effect: "others", receipt: "r1", correlation: null };
  const shapes = { array: JSON.stringify([event]), object: JSON.stringify({ events: [event] }), lines: `${JSON.stringify(event)}\n${JSON.stringify({ ...event, kind: "poke" })}`, bad: "nope", number: "3" };
  out(shapes[argv[1]]);
  process.exit(0);
}
const json = argv.includes("--json");
if ((argv[0] === "help" && json && !mode.includes("second")) || (argv[0] === "--help" && json && mode.includes("second"))) {
  out(JSON.stringify({ commands: COMMANDS, exitCodes: EXIT }));
  process.exit(0);
}
if (argv[0] === "help") fail("no help here", 1);
if (argv[0] === "--help") {
  out("legacy: a fixture.\n\n  conversations  List them.\n  send           Send.\n\nExit codes: 0 ok, 1 error, 2 usage, 5 waited.");
  process.exit(0);
}
const two = COMMANDS.find((c) => c.name === `${argv[0]} ${argv[1]}`);
const cmd = two ? two.name : argv[0];
const rest = argv.slice(two ? 2 : 1);
const words = rest.filter((a, i) => !a.startsWith("--") && !(rest[i - 1] === "--why" || rest[i - 1] === "--limit" || rest[i - 1] === "--timeout"));
if (rest.includes("--help")) {
  if (cmd === "broken") fail("help is broken", 1);
  if (cmd === "wide") out(`legacy wide: ${"x".repeat(150)}`);
  else out(`legacy ${cmd}: help.${["send", "react", "rename", "pin", "invite"].includes(cmd) ? " --dry-run shows who would see it." : ""}`);
  process.exit(0);
}
if (["edit", "remove"].includes(cmd)) fail(cmd === "edit" ? 'edit what? a note ("note") or a message others saw ("send")' : "remove what?", 2);
if (cmd === "delete") {
  out("deleted");
  process.exit(0);
}
const known = COMMANDS.find((c) => c.name === cmd);
if (!known) fail(`unknown command "${cmd}"`, 3);
const s = load();
const flags = rest.filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=")[0]);
switch (cmd) {
  case "conversations": {
    const bad = flags.find((f) => !["limit", "all", "json"].includes(f));
    if (bad) fail(`unknown flag --${bad}${bad === "limt" ? "; did you mean --limit?" : ""}`, 2);
    if (mode.includes("writes")) save({ ...s, reads: s.reads + 1 });
    out(JSON.stringify({ conversations: [{ ref: "c1" }], messages: [{ ref: "c1#m1" }] }));
    break;
  }
  case "history":
  case "draft show":
    out(JSON.stringify({ draft: null }));
    break;
  case "look":
    if (flags.some((f) => f !== "json")) fail("something failed", 1);
    out(JSON.stringify({ messages: [] }));
    break;
  case "tail":
    out(JSON.stringify({ event: 1 }));
    globalThis.setInterval(() => out(JSON.stringify({ event: 2 })), 50);
    break;
  case "noise":
    out("not json");
    globalThis.setInterval(() => out("still not json"), 50);
    break;
  case "quiet":
    globalThis.setInterval(() => undefined, 1000);
    break;
  case "pair":
    fail("pair needs two words", 1);
    break;
  case "broken":
    out("not json");
    break;
  case "watch":
    if (mode.includes("badwait")) fail("watch takes only meeting refs", 2);
    if (json) out(JSON.stringify({ ax: "wait/1", for: "a reply", target: null, state: "timed-out", since: "t", until: null, cursor: "1", events: [], fresh: null, resume: null, reason: null, callback: null, next: [] }));
    else out("Nothing happened.");
    process.exit(5);
    break;
  default: {
    if (!others.includes(cmd)) fail(`${cmd} needs more`, 2);
    if (!rest.includes("--why")) fail(`${cmd} needs --why "<who asked you>"`, 2);
    const real = words[0] === "c1" || words[0] === "c1#m1";
    if (!real) {
      if (cmd === "react") save({ ...s, log: [...s.log, { verb: "react" }] });
      else if (cmd !== "pin") save({ ...s, log: [...s.log, { verb: `${cmd}.refused` }] });
      if (cmd !== "pin") fail(`no conversation "${words[0]}". Try "legacy conversations".`, 1);
    }
    if (rest.includes("--dry-run")) {
      if (cmd === "rename") save({ ...s, names: { ...s.names, [words[0]]: words[1] } });
      if (!json) out(`Would ${cmd} in ${words[0]}. Everyone in it will see it.`);
      else if (cmd === "send") out(JSON.stringify({ ax: "outcome/1", action: "send", effect: "others", audience: { only: false, who: "everyone in c1" }, target: { kind: "conversation", id: "c1" }, state: "planned", summary: "Would send.", postcondition: { checked: false, holds: null, how: "a plan" }, receipt: null, next: [] }));
      else if (cmd === "rename") out(JSON.stringify({ ax: "outcome/1", action: "rename", effect: "others", audience: { only: false, who: "everyone" }, target: null, state: "done", summary: "Renamed.", postcondition: { checked: true, holds: true, how: "read back" }, receipt: { id: "r", at: "t", by: "a", why: "w" }, next: [] }));
      else if (cmd === "pin") out(JSON.stringify({ ax: "outcome/1", action: "pin", effect: "others", audience: { only: false, who: "everyone" }, target: null, state: "planned", summary: "Would pin.", postcondition: { checked: true, holds: true, how: "?" }, receipt: null, next: [] }));
      else out(JSON.stringify({ dryRun: true }));
      break;
    }
    out(`${cmd} done`);
  }
}
