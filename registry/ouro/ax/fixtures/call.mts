// A call tool built from the kit, the twin of the calling components (call-components.mts), for the X-ray's tests:
// `node fixtures/call.mts <args>`. It is a mock: state lives in $CALL_STATE (a JSON file), nobody is in the call, and
// `state` prints it. $CALL_FAULTS, a comma list, breaks the component claims: `effect` (a private mute), `unmute` (it
// acts), `listen` (captions without a follow), `push` (every line, untriggered), `fields` (no connection, no speaker),
// `cursor` (ignored), `nocursor`, `nolines`, `follow` (the follow fails), `resume` (a follow with a placeholder),
// `state` (captions done without a follow), `extra` (a mention's needs-human carries lines), `unlisted` (a question's
// follow is no command) and `reason` (a refusal that leaves out its reason).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { quietPipes, runCli } from "../cli.ts";
import { defineCli, defineCommand, type CommandDef, type Input } from "../command.ts";
import { AxError } from "../problem.ts";
import { nextStep, outcome } from "../outcome.ts";

const faults = new Set((process.env["CALL_FAULTS"] ?? "").split(","));
const file = process.env["CALL_STATE"];
const state: { follows: string[]; pinned: string[]; muted: boolean; hand: boolean; left: boolean; log: { verb: string }[] } = { follows: [], pinned: [], muted: false, hand: false, left: false, log: [] };
if (file && existsSync(file)) Object.assign(state, JSON.parse(readFileSync(file, "utf8")));

const meetings = [{ ref: "m1", title: "Design sync" }];
const people = [
  { ref: "p1", name: "Jo Park", muted: false, camera: true, speaking: true, handRaised: false, connection: "good" },
  { ref: "p2", name: "Ana Ruiz", muted: true, camera: false, speaking: false, handRaised: true, connection: "poor" },
];
const said = [
  { at: "1", speaker: "Jo Park", text: "Can the agent take notes on the launch date?" },
  { at: "2", speaker: "Ana Ruiz", text: "The launch moves to Friday." },
];
const everyone = { only: false, who: 'everyone in "Design sync"' };
const why = "<who asked you, and what they said>";

function meeting(ref: unknown) {
  const found = meetings.find((m) => m.ref === String(ref));
  if (!found) throw new AxError({ code: "no-meeting", exit: 1, thing: "meeting", problem: `there is no meeting "${String(ref)}"`, fix: "call meetings" });
  return found;
}
const meetingArg = { name: "meeting", description: "A meeting's id.", required: true, source: "meetings" };

/** What people say in a meeting, after the cursor, once the person has asked you to follow it; needs-human before. */
function listening(input: Input, lines: typeof said) {
  const m = meeting(input["meeting"]);
  if (!faults.has("listen") && !state.follows.includes(m.ref)) {
    if (faults.has("state") && input["on"] === undefined) return outcome({ action: "captions", state: "done", summary: "Read." });
    const follow = faults.has("unlisted") && input["on"] === "question" ? "call sit-in" : "call follow";
    const waiting = outcome({ action: "captions", state: "needs-human", summary: `You are not following "${m.title}", so you read nothing said there.`, human: { reason: "the person asks you to sit in on this meeting before you read what people say", resume: nextStep(`${follow} ${faults.has("resume") ? "<room>" : m.ref} --why "${why}"`, "follow it once the person asks you to") } });
    return faults.has("extra") && input["on"] === "mention" ? { ...waiting, lines: [] } : waiting;
  }
  const after = (faults.has("nolines") ? [] : lines).filter((l) => faults.has("cursor") || typeof input["cursor"] !== "string" || Number(l.at) > Number(input["cursor"]));
  const shown = faults.has("fields") ? after.map((l) => ({ at: l.at, text: l.text })) : after;
  return faults.has("nocursor") ? { lines: shown } : { lines: shown, cursor: String(said.length) };
}

/** An action other people in the call see, with its preview. */
function others(name: string, summary: string, doing: string, done: string, change: () => void): CommandDef {
  return defineCommand({
    name,
    summary,
    effect: faults.has("effect") && name === "mute" ? "private" : "others",
    why: "required",
    args: [meetingArg],
    examples: [`call ${name} m1 --why "Jo asked"`],
    plan: (i) => outcome({ action: name, effect: "others", audience: everyone, state: "planned", summary: `${doing} in "${meeting(i["meeting"]).title}"; everyone in "Design sync" will see it.` }),
    run: (i) => {
      const m = meeting(i["meeting"]);
      change();
      return outcome({ action: name, effect: "others", audience: everyone, state: "done", summary: `${done} in "${m.title}".`, postcondition: { checked: true, holds: true, how: "read the call's state back" }, receipt: { id: `${name}-${m.ref}`, at: new Date().toISOString(), by: "agent", why: String(i["why"]) } });
    },
  });
}

const theirs = { reason: "agents never turn on a person's microphone, camera or screen", how: "with the buttons in the call's toolbar" };
const cli = defineCli({
  name: "call",
  about: ["call: the person's call, for agents. You never join one; you read from the app's capture."],
  commands: [
    defineCommand({ name: "meetings", summary: "The meetings, with their ids.", effect: "private", readOnly: true, examples: ["call meetings"], run: () => meetings }),
    defineCommand({
      name: "participants", summary: "Who is in a meeting, and what each is doing.", effect: "private", readOnly: true, args: [meetingArg], examples: ["call participants m1"],
      run: (i) => (meeting(i["meeting"]), people.map((p) => (faults.has("fields") ? { ...p, connection: undefined } : p))),
    }),
    defineCommand({
      name: "captions", summary: "What people say in a meeting you follow, after a cursor.", effect: "private", readOnly: true, args: [meetingArg], examples: ["call captions m1 --cursor 1"],
      flags: { cursor: { type: "string", placeholder: "<cursor>", description: "Only the lines after this cursor, which the last read gave." } },
      run: (i) => listening(i, said),
    }),
    defineCommand({
      name: "events", summary: "A meeting's events, or what people say on a trigger.", effect: "private", readOnly: true, args: [meetingArg], examples: ["call events m1 --stream live-transcript --on mention"],
      flags: {
        stream: { type: "enum", values: ["events", "live-transcript"], description: "Which stream: the meeting's events (the default) or what people say." },
        on: { type: "string", placeholder: "mention|question|topic:<t>", description: "What people say that you get: a mention of you, a question, or a topic." },
      },
      run: (i) => {
        const m = meeting(i["meeting"]);
        if (i["stream"] !== "live-transcript") return { events: [{ ref: "e1", kind: "started" }] };
        if (i["on"] === undefined && !faults.has("push"))
          return outcome({ action: "events", state: "refused", summary: "Every line of a meeting is not a stream.", error: { code: "needs-trigger", exit: 2, thing: "events --stream live-transcript", problem: "what people say comes only on a trigger, never every line", fix: `call events ${m.ref} --stream live-transcript --on mention|question|topic:<t>` } });
        return listening(i, said.filter((l) => i["on"] === undefined || l.text.includes("?")));
      },
    }),
    defineCommand({
      name: "follow", summary: "Follow a meeting the person asked you to sit in on, to read what people say.", effect: "private", why: "required", args: [meetingArg], examples: ['call follow m1 --why "Jo asked"'],
      run: (i) => {
        const m = meeting(i["meeting"]);
        if (faults.has("follow")) throw new AxError({ code: "no-follow", exit: 1, thing: "follow", problem: "the call's capture is not running", fix: null });
        if (!state.follows.includes(m.ref)) state.follows.push(m.ref);
        return outcome({ action: "follow", state: "done", summary: `Following "${m.title}"; you can read what people say there.`, postcondition: { checked: true, holds: true, how: "read the follows back" } });
      },
    }),
    defineCommand({
      name: "pin", summary: "Keep a participant's tile in the person's main view.", effect: "private", args: [{ name: "participant", description: "A participant's id.", required: true, source: "participants" }], examples: ["call pin p1"],
      run: (i) => (state.pinned.push(String(i["participant"])), outcome({ action: "pin", state: "done", summary: `Pinned ${String(i["participant"])}.` })),
    }),
    others("mute", "Mute the person's microphone; everyone sees it.", "Would mute the person", "Muted the person", () => (state.muted = true)),
    others("leave", "Leave the call; everyone sees it.", "Would leave the call", "Left the call", () => (state.left = true)),
    others("raise-hand", "Raise the person's hand; everyone sees it.", "Would raise the person's hand", "Raised the person's hand", () => (state.hand = true)),
    ...(faults.has("unmute") ? [defineCommand({ name: "unmute", summary: "Turn the person's microphone on.", effect: "private", run: () => (state.log.push({ verb: "unmute" }), "Unmuted.") })] : []),
  ],
  personOnly: {
    ...(faults.has("unmute") ? {} : { unmute: theirs }),
    camera: theirs,
    share: theirs,
    join: { reason: "the person joins a call, and you read from the app's one capture", how: "from the meeting's join button" },
  },
});

const argv = process.argv.slice(2);
if (argv[0] === "state") process.stdout.write(`${JSON.stringify(state)}\n`);
else {
  quietPipes(process);
  const stderr = { write: (text: string) => process.stderr.write(faults.has("reason") ? text.replace(theirs.reason, "it is not yours") : text) };
  process.exitCode = await runCli(cli, argv, { stdout: process.stdout, stderr, stdin: process.stdin });
  if (file) writeFileSync(file, JSON.stringify(state));
}
