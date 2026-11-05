# Ouro AX

Ouro AX is for the interfaces agents use: a CLI, an HTTP API or an MCP server. Ouro HX gives a person's screen its components; Ouro AX gives an agent's interface a standard, a kit that meets it and an X-ray that checks it ([decision record](../decisions/2026-10-30-ouro-ax.md)).

- **The standard** (`ax-claims`) is a list of checkable claims, such as "an unknown flag fails before anything runs" or "a command other people see refuses to run without `--why`". A claim is `must` when an agent evaluation showed agents failing without it, or when it guards against a stated hazard; the others are `should` ([the claims](ax-standard.md)).
- **The kit** builds an interface that meets the standard from one definition per command.
- **The X-ray** (`ax-xray`) checks any interface against the claims from outside, whether the kit built it or not ([the X-ray](ax-conformance.md)).

## Install

```sh
npx shadcn@latest add ourostack/ouro-ui/ouro-ax#v1.3.4         # the kit and the X-ray
npx shadcn@latest add ourostack/ouro-ui/ouro-ax-tests#v1.3.4   # with their node:test tests
```

The shadcn CLI copies the files into `lib/ouro/ax/` under your lib alias. Node runs them as they are: they are TypeScript that imports its siblings as `./<file>.ts`, and Node strips the types.[^node] Add single items by name (`ax-command`, `ax-xray`) when you need only some of them; each brings the items it imports.[^deps]

## A tool

This tool has a read and an action other people see. The kit gives it the rest:

```ts
import { quietPipes, runCli } from "./lib/ouro/ax/cli.ts";
import { defineCli, defineCommand } from "./lib/ouro/ax/command.ts";
import { AxError } from "./lib/ouro/ax/problem.ts";
import { outcome } from "./lib/ouro/ax/outcome.ts";

const tasks = new Map([["t1", { title: "Book the room", owner: "Jo" }]]);
const team = { only: false, who: "the team" };
function task(id: unknown) {
  const found = tasks.get(String(id));
  if (!found) throw new AxError({ code: "no-task", exit: 1, thing: "task", problem: `there is no task "${String(id)}"`, fix: "tasks list" });
  return found;
}

const cli = defineCli({
  name: "tasks",
  about: ["tasks: the team's task list, for agents."],
  commands: [
    defineCommand({ name: "list", summary: "The tasks, with their ids.", effect: "private", readOnly: true, examples: ["tasks list"], run: () => [...tasks].map(([ref, t]) => ({ ref, ...t })) }),
    defineCommand({
      name: "assign", summary: "Give a task to someone; the team sees it.", effect: "others", examples: ['tasks assign t1 Ana --why "Jo asked"'],
      args: [{ name: "task", description: "A task id.", required: true, source: "list" }, { name: "person", description: "Who takes it.", required: true }],
      plan: (i) => outcome({ action: "assign", effect: "others", audience: team, state: "planned", summary: `Would give "${task(i["task"]).title}" to ${String(i["person"])}; the team will see it.` }),
      run: (i) => {
        const t = task(i["task"]);
        t.owner = String(i["person"]);
        return outcome({ action: "assign", effect: "others", audience: team, state: "done", summary: `Gave "${t.title}" to ${t.owner}.`, postcondition: { checked: true, holds: tasks.get(String(i["task"]))?.owner === t.owner, how: "read the task back" }, receipt: { id: `a-${String(i["task"])}`, at: new Date().toISOString(), by: "agent", why: String(i["why"]) } });
      },
    }),
  ],
});
quietPipes(process);
process.exitCode = await runCli(cli, process.argv.slice(2), process);
```

What the agent gets, from that definition alone:[^tool]

```text
$ tasks assign t1 Ana
tasks: assign: other people will see this as the person's, so it needs --why: who asked you, and what they said. Fix: tasks assign t1 Ana --why "<who asked you, and what they said>".
$ tasks assign t9 Ana --why "Jo asked"
tasks: task: there is no task "t9". Fix: tasks list.
$ tasks assign t1 Ana --why "Jo asked" --dry-run
Would give "Book the room" to Ana; the team will see it.
$ tasks assign t1 Ana --why "Jo asked"
Gave "Book the room" to Ana.
Checked: read the task back.
Receipt: a-t1
```

- `--help` lists the commands under "Only you see these" and "Other people see these"; `help --json` gives the same as data, with the commands' input schemas.
- A command other people see takes `--why` and `--dry-run`. The dry run calls `plan()` and never `run()`.[^dry-run]
- A refusal is one line that ends with `Fix:` and the command to run instead, and exits with the usage code.
- `--json` prints the outcome: its state, who can see it, the postcondition the tool checked, the receipt and the next commands.

## The items

| Item | What it gives you |
| --- | --- |
| [`ax-command`](../ax/ax-command.md) | `defineCommand` and `defineCli`: one declaration per command, from which the parser, usage, help, input schema and MCP schema come. |
| [`ax-cli`](../ax/ax-cli.md) | `runCli`: parse, help, run or plan, print text or `--json`, and the exit code. |
| [`ax-problem`](../ax/ax-problem.md) | The one error shape: `<tool>: <thing>: <problem>. Fix: <command>.` |
| [`ax-exit-codes`](../ax/ax-exit-codes.md) | A tool's exit-code table, which starts with ok, error and usage. |
| [`ax-effects`](../ax/ax-effects.md) | Who sees an effect: only the person, or other people; `--why` and `--dry-run`. |
| [`ax-output`](../ax/ax-output.md) | Text and `--json` from one result; cutting long text; pages with a cursor. |
| [`ax-outcome`](../ax/ax-outcome.md) | What an action returns: state, audience, checked postcondition, receipt, next commands. |
| [`ax-wait`](../ax/ax-wait.md) | A typed wait on a reference the agent holds, with a cursor to resume from and a time limit. |
| [`ax-work-event`](../ax/ax-work-event.md) | An attributed event per action, handoff, wait and return, and a fold that counts them. |
| [`ax-mcp`](../ax/ax-mcp.md) | The same commands as MCP tools over stdio. A preview in this release. |
| [`ax-component`](../ax/ax-component.md) | A component's agent side: what an agent reads from it and the actions it may take, bound to their CLI twins, for the X-ray to check. |
| [`ax-lint`](../ax/ax-lint.md) | Checks the declarations, and against your command inventory that the commands you register run through them. |
| [`ax-dev-commands`](../ax/ax-dev-commands.md) | Finds a developer command or a repository path in a message for an agent or a person, which the person's installed tool can't run; a step marked `sourceCheckout: true` passes. |
| [`ax-claims`](../ax/ax-claims.md) | The standard as data. |
| [`ax-xray`](../ax/ax-xray.md) | The checker. |
| [`ax-checks`](../ax/ax-checks.md) | A doctor or self-check declared once: progress while it runs, the verdict first, the fix beside a problem, the same facts in `--json`, and the findings exit code. |
| [`ax-terminal`](../ax/ax-terminal.md) | Colour, status marks, times, next steps and a progress line for a person at a terminal, with plain words in a pipe, in CI or under `NO_COLOR`. |
| [`ax-voice`](../ax/ax-voice.md) | An optional line of character for a person at a terminal, after the facts, kept out of what an agent parses. |
| [`ax-flows`](../ax/ax-flows.md) | Your agent flows as data, run in CI without a model: the calls a good agent makes for a task, checked. |
| [`ax-example`](../ax/ax-example.md) | A small tool built only from the kit; the tests use it. |

## Outcomes and waits

An action returns an outcome rather than a bare "ok". Its `state` says what became of it: `done`, `queued`, `planned`, `needs-human`, `uncertain`, `refused` or `failed`. `postcondition` says whether the tool checked the effect apart from the transport's answer, and `receipt.id` finds the request again. `runCli` sets the exit code from the state.[^outcome-exit]

A wait takes a reference the agent already holds, such as a conversation id from a list, and waits inside the tool. `waitFor()` reads the source as often as it must and returns what happened, or, when the time limit passes, the cursor and the exact command that resumes the wait. The agent makes one call instead of writing a polling loop.

## A voice

A tool may have a voice: a line of character after the facts, for a person at a terminal. Give `defineCli` a `voice` with any of five slots, each a list of variants: `banner` leads the help overview, `done(outcome)` follows an action that is done or queued, `summary` follows the command marked `summarizes`, `empty` follows a list that came back empty, and `healthy` follows a checks report (ax-checks) whose checks all ran and passed. `emptyText("unread", next)` writes that list's fact first: `Nothing unread.` and the command to run next.

```ts
voice: {
  banner: ["Rooms to talk in, notes to keep."],
  done: () => ["Said once, said plainly.", "Posted; the room has it now."],
  empty: ["Nothing yet. Rooms fill up."],
},
```

The kit prints a voice line only when stdout is a terminal, and never under `--json`, `--quiet` (a tool with a voice takes it) or when `CI` is set; never on stderr and never in an error.[^voice] Every line is one line of plain ASCII, at most 72 characters, checked when the tool is built.[^voice-line] The fact comes first, a process celebrates once, and variants rotate; pass `voiceMemory` to `runCli` to keep the last one between runs.[^voice-order] `help --json` lists the fixed lines, which the X-ray looks for in its piped and `--json` calls.

## Components

An Ouro HX component an agent can act through declares its agent side next to it: what an agent may read from it, with the fields, and its actions' effects, with `agent: true` for an action an agent may take or `personOnly` with the reason for one only the person takes, said to the agent ("You can't turn on the person's camera; only they can."). Leaving out that choice, or making both, is a type error and a one-line error at load.[^component] Some actions are the person's whatever the component. Name them with the canonical ids `unmute`, `camera`, `share`, `answer`, `decline`, `admit` and `record`, and their reverse with `mute`, `camera-off` and `stop-share`, which stay an agent's. `isReservedPersonOnly` also catches aliases (`Unmute`, `mic-on`, `share-screen`, `accept`, `start-recording`), bare devices (`mic`, `video`) and toggles (`toggle-mute`), so declaring any of them `agent: true` throws. A call verb away from a call, such as `share-link` or `answer-message`, stays an agent's.[^reserved] The app binds each read and agent action to its CLI twin, because a component does not know the app's command names, and gives each person-only action the CLI words an agent might try (`refuseAs`); `bindAx` throws when one has no twin or no words, or when a person-only action is given a twin, and returns the entries for the X-ray's inventory.[^bind] Each component renders `data-ax-action="<id>"` on the control for each action it declares, and its tests check that with `expectAxRendered(ax, container)`.[^rendered] Declare it beside the component whose actions it names, such as `CallControls`, rather than the generic `Toolbar` that holds it: a container exports one only when it has agent reads or actions of its own. A component imports the kit as `import { defineComponentAx } from "@/registry/ouro/ax/component";`. The shadcn CLI rewrites that to the app's lib alias (`@/lib/ouro/ax/component`) when it installs the component, and the component's item brings `ax-component` with it.[^install] These are the calling components, bound to a `call` tool:

```ts
import { bindAx, defineComponentAx } from "./lib/ouro/ax/component.ts";

const theirs = "You can't turn on the person's microphone, camera or screen; only they can.";

export const mediaTileAx = defineComponentAx({
  component: "MediaTile",
  reads: [{ id: "participant", summary: "Who is in the tile, and what they are doing.", fields: ["name", "muted", "camera", "speaking", "handRaised", "connection"], consent: "none" }],
  actions: [{ id: "pin", summary: "Keep this tile in the person's main view.", effect: "private", agent: true }],
});

export const callControlsAx = defineComponentAx({
  component: "CallControls",
  reads: [],
  actions: [
    { id: "mute", summary: "Mute the person's microphone.", effect: "others", agent: true },
    { id: "leave", summary: "Leave the call.", effect: "others", agent: true },
    { id: "raise-hand", summary: "Raise the person's hand.", effect: "others", agent: true },
    { id: "lower-hand", summary: "Lower the person's hand.", effect: "others", agent: true },
    { id: "unmute", summary: "Turn the person's microphone on.", effect: "others", personOnly: theirs },
    { id: "camera", summary: "Turn the person's camera on.", effect: "others", personOnly: theirs },
    { id: "share", summary: "Share the person's screen.", effect: "others", personOnly: theirs },
    { id: "captions", summary: "Turn captions on.", effect: "private", personOnly: "You can't turn the person's captions on or off; only they can." },
  ],
});

export const liveCaptionsAx = defineComponentAx({
  component: "LiveCaptions",
  reads: [{ id: "captions", summary: "What people say, once the person asks you to follow the meeting.", fields: ["speaker", "text", "at"], consent: "listening", push: "filtered" }],
  actions: [],
});

export const ui = [
  ...bindAx(mediaTileAx, { reads: { participant: "call participants <meeting>" }, actions: { pin: "call pin <participant>" } }),
  ...bindAx(callControlsAx, {
    actions: { mute: "call mute <meeting>", leave: "call leave <meeting>", "raise-hand": "call raise-hand <meeting>", "lower-hand": "call lower-hand <meeting>" },
    refuseAs: { unmute: "call unmute", camera: "call camera", share: "call share", captions: "call captions on" },
  }),
  ...bindAx(liveCaptionsAx, {
    reads: { captions: { read: "call captions <meeting>", push: "call events <meeting> --stream live-transcript", trigger: "--on mention" } },
  }),
];
```

A read of what people say (`consent: "listening"`) gives nothing until the person asks the agent to follow that meeting: the inbox-agent runs `call follow m1 --why "<who asked>"` only at the person's direction, and before that the read answers `needs-human`, with the follow as the step that resumes. Its stream (`push: "filtered"`) delivers lines only on a words trigger, such as a mention, a question or a topic, so no agent gets every line of a meeting, and a read takes `--cursor` to pull only what is new.[^listening]

The CLI declares the words a person-only action answers to with `defineCli({ personOnly: { unmute: { reason, how } } })`. They refuse with one line that says why and where the person does it, a refused outcome under `--json`, and `help --json` lists them under `personOnly`, so the prep-agent learns them before it tries.[^person-only] In the `call` tool, `join` is person-only too: the person joins, and agents read from the app's one capture.[^join]

## Agent-first surfaces

When an agent drives a surface better than a person does, make it agent-first. Look for a surface that gathers from many places, follows the same steps every time, or has to decide what is safe to share: the person would otherwise copy logs, look up versions and guess what to leave out.

- Give the agent one command that runs the whole surface end to end, not a series of steps it must string together. Put what each step did and what it left out in the outcome's `summary`, and what the person must still do in `next`.
- Make it a command other people see when anything leaves the computer, so it takes `--why` and `--dry-run`.[^dry-run] Let the dry run name what would go, to whom, and what was held back, before anything is sent.
- Shrink the person's screen to a prompt: one line to tell their agent, with a copy button. Keep the full form one press away, labelled with the task ("Report it myself"), for when no agent is at hand.
- Write the prompt in the person's words, as they would say it to their agent, never as a command line.

Take a problem report as the example. When the person tells their inbox-agent "something is off with the calendar: it's blank", have the inbox-agent run the app's one report command with `--why "<the person's words>"` and `--dry-run`. Gather the person's words, where the window was, the recent log and the app's own state. Include a performance trace only once it has passed the app's privacy screen. When the trace is missing, write that plainly in the summary. Return a `planned` outcome whose audience names the app's issue tracker and who reads it. Have the inbox-agent show the person that preview and run the command again without `--dry-run` only once they say yes. In the app, show "Tell your agent: something is off with …" with Copy, and "Report it myself" for the full form.

## Agent flows in CI

The X-ray checks the rules a command must keep; a flow checks what a task needs. A flow is the calls a good agent makes for one task, as data, with what the calls must show:

```ts
import { defineFlow, defineSuite, inProcess } from "./lib/ouro/ax/flows.ts";

const send = defineFlow({
  id: "T3", surface: "agent-cli", title: "Post what someone asked for, after a preview", rubric: ["honest", "forgiving"],
  steps: [
    { id: "rooms", run: ["rooms", "--json"], expect: { exit: 0, jsonShape: ["[].ref"] }, save: { room: "[0].ref" } },
    { id: "no-why", run: ["post", "{room}", "Running late"], expect: { exit: 2, stderrRules: ["oneLine", "namesFix", "noStack"] } },
    { id: "preview", run: ["post", "{room}", "Running late", "--why", "Jo asked", "--dry-run", "--json"], expect: { exit: 0, fields: { "audience.who": { re: "^everyone in" } } } },
  ],
});

export default defineSuite({ tool: "notes", flows: [send], cli: inProcess(main), start: startMock, guard: assertMock, state: ["log", "--json"] });
```

```sh
node lib/ouro/ax/flows.ts run flows/suite.ts --out report --xray xray.json
```

It writes `report/findings.jsonl`, one check a line, and `report/report.json` with the X-ray attached, in the `flow-review/0` format. Each call is checked for its exit code, JSON shape and fields, one-line errors that name the fix, time and size budgets, text it must have or must not, and the voice: plain stderr and JSON alone under `--json`.[^flows-checks] The runner also checks a flow for commands the overview leaves out, and a flow marked `readOnly` for a state that changed. Nothing runs until your guard proves the mock is a mock.[^flows-guard] A step marked `known` with its issue is reported and doesn't fail the run; once it passes, the run fails until the mark goes.[^flows-known] `fixtures/flows-suite.mts` is a whole suite over the example tool, with a reply that arrives partway through a wait.

## Adopting it in an existing tool

Declare one command at a time. A command declared `loose` passes its flags through unchecked until you declare them, and `lintCli(cli, { inventory })`, given the names your dispatcher registers, lists the commands that still run outside the kit.[^lint] The inventory compares names, so also keep a check of your own source that the command table is the only dispatch path. A tool that reads stdin or prints errors its own way calls `parse()`, then `dispatch()` with its own context, then `printResult()`, the steps `runCli` takes. Then run the X-ray in CI ([the X-ray](ax-conformance.md)). [Make your CLI conformant](ax-adopt.md) walks through it step by step.

[^node]: test:scripts/ax.test.mjs::the Ouro AX tests pass and cover every line, branch and function of Ouro AX verify:testExists(scripts/ax.test.mjs::the Ouro AX tests pass and cover every line, branch and function of Ouro AX)
[^deps]: test:scripts/registry.test.mjs::Ouro AX items depend on the ax items they import verify:testExists(scripts/registry.test.mjs::Ouro AX items depend on the ax items they import)
[^tool]: test:scripts/ax.test.mjs::the guide shows the tasks tool as it is, and the answers it gives; test:registry/ouro/ax/xray.test.mts::the guide's tool conforms verify:testExists(scripts/ax.test.mjs::the guide shows the tasks tool as it is, and the answers it gives) verify:testExists(registry/ouro/ax/xray.test.mts::the guide's tool conforms)
[^dry-run]: test:registry/ouro/ax/cli.test.mts::--dry-run runs the plan, never run(): a planned outcome, exit 0, nothing posted verify:testExists(registry/ouro/ax/cli.test.mts::--dry-run runs the plan, never run(): a planned outcome, exit 0, nothing posted)
[^outcome-exit]: test:registry/ouro/ax/outcome.test.mts::outcomeExit: a refusal's own exit, else the state's name in the tool's table verify:testExists(registry/ouro/ax/outcome.test.mts::outcomeExit: a refusal's own exit, else the state's name in the tool's table)
[^voice]: test:registry/ouro/ax/cli.test.mts::the voice speaks only on a terminal: never under --json, --quiet, CI or a pipe, and never in an error verify:testExists(registry/ouro/ax/cli.test.mts::the voice speaks only on a terminal: never under --json, --quiet, CI or a pipe, and never in an error)
[^voice-line]: test:registry/ouro/ax/voice.test.mts::a line is one line of plain ASCII, at most 72 characters, checked when the tool is built verify:testExists(registry/ouro/ax/voice.test.mts::a line is one line of plain ASCII, at most 72 characters, checked when the tool is built)
[^voice-order]: test:registry/ouro/ax/cli.test.mts::a voice line follows the fact it adds to: a done outcome, an empty list, the summary, and one celebration at most; test:registry/ouro/ax/cli.test.mts::voice variants rotate from the memory a tool keeps between runs verify:testExists(registry/ouro/ax/cli.test.mts::a voice line follows the fact it adds to: a done outcome, an empty list, the summary, and one celebration at most) verify:testExists(registry/ouro/ax/cli.test.mts::voice variants rotate from the memory a tool keeps between runs)
[^flows-checks]: test:registry/ouro/ax/flows.test.mts::a call's checks: exit, shape, fields, error text, time, size, text and voice, each its own finding verify:testExists(registry/ouro/ax/flows.test.mts::a call's checks: exit, shape, fields, error text, time, size, text and voice, each its own finding)
[^flows-guard]: test:registry/ouro/ax/flows.test.mts::nothing runs until the suite's guard passes verify:testExists(registry/ouro/ax/flows.test.mts::nothing runs until the suite's guard passes)
[^flows-known]: test:registry/ouro/ax/flows.test.mts::the command runs a suite module: exit 0, 1 on an unknown failure or a known that passes, 2 on usage verify:testExists(registry/ouro/ax/flows.test.mts::the command runs a suite module: exit 0, 1 on an unknown failure or a known that passes, 2 on usage)
[^component]: test:registry/ouro/ax/component.test.mts::an action is agent or person-only, exactly one, and every problem throws one line with its fix verify:testExists(registry/ouro/ax/component.test.mts::an action is agent or person-only, exactly one, and every problem throws one line with its fix)
[^bind]: test:registry/ouro/ax/component.test.mts::bindAx needs a twin for every read and agent action, refuses one for a person-only action, and returns the inventory entries; test:scripts/ax.test.mjs::the guide shows the calling components' declarations as they are verify:testExists(registry/ouro/ax/component.test.mts::bindAx needs a twin for every read and agent action, refuses one for a person-only action, and returns the inventory entries) verify:testExists(scripts/ax.test.mjs::the guide shows the calling components' declarations as they are)
[^listening]: test:registry/ouro/ax/xray.test.mts::the calling components' twins conform: each twin is listed with its effect, person-only words refuse, and listening reads wait for a follow verify:testExists(registry/ouro/ax/xray.test.mts::the calling components' twins conform: each twin is listed with its effect, person-only words refuse, and listening reads wait for a follow)
[^person-only]: test:registry/ouro/ax/cli.test.mts::a person-only word refuses with its reason and how the person does it, as a refused outcome under --json; test:registry/ouro/ax/help.test.mts::person-only words are listed in the overview and in help --json, with the reason and how the person does it verify:testExists(registry/ouro/ax/cli.test.mts::a person-only word refuses with its reason and how the person does it, as a refused outcome under --json) verify:testExists(registry/ouro/ax/help.test.mts::person-only words are listed in the overview and in help --json, with the reason and how the person does it)
[^join]: registry/ouro/ax/fixtures/call.mts verify:fileLine(registry/ouro/ax/fixtures/call.mts, /join: \{ reason: "You can't join a call for the person, and you read from the app's one capture; only they join\."/)
[^reserved]: test:registry/ouro/ax/component.test.mts::reserved ids are matched by meaning: every alias and case is the person's, and what reduces exposure stays an agent's verify:testExists(registry/ouro/ax/component.test.mts::reserved ids are matched by meaning: every alias and case is the person's, and what reduces exposure stays an agent's) verify:testExists(registry/ouro/ax/component.test.mts::a reserved action is always the person's: declaring it agent: true throws with its reason)
[^install]: test:scripts/install-check.test.mjs::an installed file must equal its source once import paths are mapped to the app's aliases; test:scripts/registry.test.mjs::a component that imports the ax kit lists the ax item in its registryDependencies verify:testExists(scripts/install-check.test.mjs::an installed file must equal its source once import paths are mapped to the app's aliases) verify:testExists(scripts/registry.test.mjs::a component that imports the ax kit lists the ax item in its registryDependencies)
[^rendered]: test:registry/ouro/ax/component.test.mts::expectAxRendered finds each declared action's control by data-ax-action, and names the ones it misses verify:testExists(registry/ouro/ax/component.test.mts::expectAxRendered finds each declared action's control by data-ax-action, and names the ones it misses)
[^lint]: test:registry/ouro/ax/lint.test.mts::against the tool's own inventory: a registered command with no declaration, and a declaration with no command verify:testExists(registry/ouro/ax/lint.test.mts::against the tool's own inventory: a registered command with no declaration, and a declaration with no command)
