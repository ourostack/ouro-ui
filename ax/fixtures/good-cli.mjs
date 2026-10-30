#!/usr/bin/env node
// A tiny CLI that holds every Ouro AX CLI claim, for ax/xray.test.mjs. State lives in the file $FIXTURE_STATE.
// Every call is appended to $FIXTURE_CALLS, so the test can prove what the X-ray ran.
import fs from "node:fs";

const argv = process.argv.slice(2);
if (process.env.FIXTURE_CALLS) fs.appendFileSync(process.env.FIXTURE_CALLS, JSON.stringify(argv) + "\n");
const stateFile = process.env.FIXTURE_STATE;
const state = () => (stateFile && fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, "utf8")) : { sent: [], log: [] });
const save = (s) => stateFile && fs.writeFileSync(stateFile, JSON.stringify(s));
const ROOMS = [{ ref: "abc123", title: "Design" }];

const COMMANDS = [
  { name: "rooms", effect: "private", summary: "List rooms.", usage: ["rooms [--limit N]"] },
  { name: "look", effect: "private", summary: "Messages in a room.", usage: ["look <room>"] },
  { name: "log", effect: "private", summary: "The action log.", usage: ["log"] },
  { name: "send", effect: "others", summary: "Send a message others see.", usage: ['send <room> <text> --why "<reason>"'] },
];
const EXIT = [
  { code: 0, meaning: "ok" },
  { code: 1, meaning: "error" },
  { code: 2, meaning: "usage" },
];
const fail = (msg, code = 1) => {
  process.stderr.write(`good: ${msg}\n`);
  process.exit(code);
};

const flags = {};
const args = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--")) {
    const k = a.slice(2);
    if (k === "limit" || k === "why") flags[k] = argv[++i];
    else flags[k] = true;
  } else args.push(a);
}
const [cmd, ...rest] = args;
const json = flags.json === true;
const out = (data, text) => process.stdout.write(json ? JSON.stringify(data) + "\n" : text + "\n");

if (cmd === "help" && json) {
  out({ commands: COMMANDS, exitCodes: EXIT });
  process.exit(0);
}
if (!cmd && flags.help) {
  process.stdout.write(`good: a fixture.\n\nOnly you see these\n${COMMANDS.filter((c) => c.effect === "private").map((c) => `  ${c.name.padEnd(8)}  ${c.summary}`).join("\n")}\n\nOther people see these\n  send      Send a message others see.\n\nExit codes: 0 ok, 1 error, 2 usage.\n`);
  process.exit(0);
}
const c = COMMANDS.find((x) => x.name === cmd);
if (!c) {
  if (cmd === "edit" || cmd === "delete" || cmd === "remove") fail(`${cmd} what? Messages others saw can't be changed here; to send a correction: good send <room> <text>.`, 2);
  fail(`unknown command "${cmd}". Commands: ${COMMANDS.map((x) => x.name).join(", ")}. Details: good help.`, 2);
}
const allowed = { rooms: ["limit"], look: [], log: [], send: ["why", "dry-run"] }[cmd];
for (const k of Object.keys(flags)) {
  if (k === "json" || k === "help" || allowed.includes(k)) continue;
  const near = allowed.find((f) => f.length > 2 && (k.startsWith(f.slice(0, 3)) || f.startsWith(k.slice(0, 3))));
  fail(`unknown flag --${k}${near ? `; did you mean --${near}?` : ""} Details: good ${cmd} --help.`, 2);
}
if (flags.help) {
  process.stdout.write(`good ${cmd}: ${c.summary}\nUsage: ${c.usage.join("; ")}${cmd === "send" ? "\nAdd --dry-run to see who would see it, and stop." : ""}\n`);
  process.exit(0);
}
const room = (ref) => ROOMS.find((r) => r.ref === ref) ?? fail(`no room "${ref}". Try "good rooms".`, 1);
switch (cmd) {
  case "rooms":
    out({ rooms: ROOMS.slice(0, Number(flags.limit ?? 10)) }, ROOMS.map((r) => `[${r.ref}] ${r.title}`).join("\n"));
    break;
  case "look":
    if (!rest[0]) fail('look which room? Give its id from "good rooms".', 2);
    out({ room: room(rest[0]), messages: [] }, `${room(rest[0]).title}: no messages`);
    break;
  case "log":
    out({ log: state().log }, `${state().log.length} actions`);
    break;
  case "send": {
    if (!flags.why) fail('send needs --why "<who asked you>": others will see it.', 2);
    const r = room(rest[0]);
    if (flags["dry-run"]) {
      out({ dryRun: true, room: r.ref }, `Dry run: nothing sent. Everyone in ${r.title} would see it.`);
      break;
    }
    const s = state();
    s.sent.push({ room: r.ref, text: rest[1] });
    s.log.push({ verb: "send", room: r.ref });
    save(s);
    out({ sent: true }, `Sent to ${r.title}. Everyone in it can see it.`);
    break;
  }
}
