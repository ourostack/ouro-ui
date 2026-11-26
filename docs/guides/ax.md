# Ouro AX

Ouro AX is for the interfaces agents use: a CLI, an HTTP API or an MCP server. Ouro HX gives a person's screen its components; Ouro AX gives an agent's interface a standard, a kit that meets it and an X-ray that checks it ([decision record](../decisions/2026-10-30-ouro-ax.md)).

- **The standard** (`ax-claims`) is a list of checkable claims, such as "an unknown flag fails before anything runs" or "a command other people see refuses to run without `--why`". A claim is `must` when an agent evaluation showed agents failing without it, or when it guards against a stated hazard; the others are `should` ([the claims](ax-standard.md)).
- **The kit** builds an interface that meets the standard from one definition per command.
- **The X-ray** (`ax-xray`) checks any interface against the claims from outside, whether the kit built it or not ([the X-ray](ax-conformance.md)).

Hold a door to [the bar](design-craft.md#the-bar) a screen meets, with the agent as the person, and pass [the AX gate](design-craft.md#the-ax-gate) before agents rely on it: the claims are its floor, and fresh agents doing real jobs are its proof. Whoever owns a door iterates it live with fresh agents in the person's seat, and adds what they learn here as claims with their evaluations.

Already have an app and no Ouro HX? [Add Ouro AX to it](ax-standalone.md): a pair of actions, wired to your buttons and served over MCP.

## Install

```sh
npx shadcn@latest add ourostack/ouro-ui/ouro-ax#v1.3.573         # the kit and the X-ray
npx shadcn@latest add ourostack/ouro-ui/ouro-ax-tests#v1.3.573   # with their node:test tests
```

The shadcn CLI copies the shared files into `lib/ouro/ax/` under your lib alias. The X-ray, the flow runner, the surfaces check and their tests go to `scripts/ouro/ax/`, outside your TypeScript project, so `tsc -b` never reads their Node imports.[^ax-outside] Node runs them as they are: they are TypeScript that imports its siblings as `./<file>.ts`, and the shared files as `#ouro-ax/<file>`, which package.json names once: `npm pkg set "imports.#ouro-ax/*=./src/lib/ouro/ax/*"`, with `src/lib` as your lib folder. Node strips the types.[^node] Add single items by name (`ax-command`, `ax-xray`) when you need only some of them; each brings the items it imports.[^deps]
## A tool

This tool has a read and an action other people see. The kit gives it the rest:

```ts
import { quietPipes, runCli } from "#ouro-ax/cli.ts";
import { defineCli, defineCommand } from "#ouro-ax/ax-command.ts";
import { AxError } from "#ouro-ax/problem.ts";
import { outcome } from "#ouro-ax/outcome.ts";

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

A tool with one thing to do defines `command` instead of `commands`. That command [takes no command word](registry/ouro/ax/ax-command.test.mts "verify:testExists(registry/ouro/ax/ax-command.test.mts::a tool with one command reads every token as the command's arguments and flags, with no command word)"), so every token is its own argument or flag: `images site/showcase --out x` runs it with `site/showcase`. `--help` shows the command, and `help` still gives the overview. A tool with `commands` still refuses a word it doesn't know.

```ts
const cli = defineCli({
  name: "images",
  about: ["images: writes the sizes a folder of pictures is written at."],
  command: defineCommand({ name: "sizes", summary: "Write each picture at the sizes the site uses.", effect: "private", examples: ["images site/showcase"], args: [{ name: "folder", description: "The folder of pictures.", required: true }], run: (i) => ({ folder: i["folder"] }) }),
});
```

A tool can also define `command` beside `commands`. That default [runs when no command word leads](registry/ouro/ax/ax-command.test.mts "verify:testExists(registry/ouro/ax/ax-command.test.mts::a tool with a default command runs it for any leading word that is not a command word, and a command word goes after --)"): in a tool with a `sizes` command, `images site/showcase` runs the default and `images sizes site/showcase` runs `sizes`. A target named like a command word goes after `--`. A flag may [repeat](registry/ouro/ax/ax-command.test.mts "verify:testExists(registry/ouro/ax/ax-command.test.mts::a repeat flag collects each value in order, in either form, and is absent when not given)"), as `--ready a --ready b`, and then its values come as a list.

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
| [`ax-mcp`](../ax/ax-mcp.md) | The same commands as MCP tools over stdio, checked against the official TypeScript client.[^mcp-client] See [Maturity](#maturity). |
| [`ax-component`](../ax/ax-component.md) | A component's agent side: what an agent reads from it and the actions it may take, bound to their CLI twins, for the X-ray to check. |
| [`ax-lint`](../ax/ax-lint.md) | Checks the declarations, and against your command inventory that the commands you register run through them. |
| [`ax-dev-commands`](../ax/ax-dev-commands.md) | Finds a developer command or a repository path in a message for an agent or a person, which the person's installed tool can't run; a step marked `sourceCheckout: true` passes. |
| [`ax-precise-copy`](../ax/ax-precise-copy.md) | Finds a vague failure ("couldn't", "something went wrong", a bare "Error") in a message for an agent or a person, with an allow-list of precise texts and their reasons. |
| [`ax-surfaces`](../ax/ax-surfaces.md) | Checks the words an agent reads, from a JSON manifest any repository can produce: errors that open with their fix and carry a code, tool descriptions that say when and stay short, action replies that report an outcome, and a message that sends an agent to run a script. A baseline file keeps CI failing on a new finding and on a fixed one still listed. |
| [`ax-claims`](../ax/ax-claims.md) | The standard as data. |
| [`ax-xray`](../ax/ax-xray.md) | The checker. |
| [`ax-checks`](../ax/ax-checks.md) | A doctor or self-check declared once: progress while it runs, the verdict first, the fix beside a problem, the same facts in `--json`, and the findings exit code. |
| [`ax-doctor`](../ax/ax-doctor.md) | A doctor: the checks' report with what the tool saw (each process and since when, the versions, the last attempts), printed under the verdict and carried in `--json`.[^doctor-text] |
| [`ax-probe`](../ax/ax-probe.md) | Tells a local process's state from outside it: an endpoint that answers is up, one that never answers is stuck, one that refuses is down; and whether a pid runs.[^doctor-probe] |
| [`ax-redact`](../ax/ax-redact.md) | Redacts text, log lines and JSON before they leave the computer: tokens, cookies, ids, email addresses, user folders and what anyone wrote become their category, and `leaks` finds any left. |
| [`ax-bundle`](../ax/ax-bundle.md) | A doctor's diagnostics file, for an agent to read or attach: the tool's facts and its logs' last lines, redacted, and refused when anything shaped like a secret is left. |
| [`ax-terminal`](../ax/ax-terminal.md) | Colour, status marks, times, next steps and a progress line for a person at a terminal, with plain words in a pipe, in CI or under `NO_COLOR`. |
| [`ax-voice`](../ax/ax-voice.md) | An optional line of character for a person at a terminal, after the facts, kept out of what an agent parses. |
| [`ax-flows`](../ax/ax-flows.md) | Your agent flows as data, run in CI without a model: the calls a good agent makes for a task, checked. |
| [`ax-example`](../ax/ax-example.md) | A small tool built only from the kit; the tests use it. |

## Maturity

`ax-mcp` is not a preview. It speaks [MCP 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning), the current revision: a client sends its version with every request and asks `server/discover` what the server supports, and nothing opens with a handshake.[^mcp-eras] It also answers the `initialize` handshake of 2025-11-25, 2025-06-18, 2025-03-26 and 2024-11-05, so an older client works against the same process.[^mcp-eras] The official TypeScript client connects to the example tool over stdio in each revision, then lists and calls its tools, in tests that run on every pull request.[^mcp-client] The MCP project's own conformance suite tests a server at an HTTP address, so it can't reach a stdio server.[^mcp-conformance] `ax-mcp` serves tools, over stdio.[^mcp-scope]

An agent door is how an agent reaches your app. The table shows how mature the doors Ouro ships are, in Ouro's own piece and in the platform API under it.

| Door | Ouro's piece | The platform API under it |
| --- | --- | --- |
| Command line: `ax-cli` | Stable. Its tests cover every line, branch and function of Ouro AX.[^node] | The process itself: its arguments, exit code and output. |
| MCP over stdio: `ax-mcp` | Stable. MCP 2026-07-28 and four older revisions, checked against the official TypeScript client.[^mcp-client] | MCP 2026-07-28 is the specification's current revision.[^mcp-current] |
| Apple: App Intents, in [ourostack/ouro-ui-apple](https://github.com/ourostack/ouro-ui-apple) | Version 1.0, with a public API that is source-stable.[^door-apple] It needs iOS 18 or macOS 15, and Xcode 16.3.[^door-apple] Its Siri AI tool intents compile to nothing until you build with the Xcode 27.3 beta SDK.[^door-apple-siri] | App Intents is Apple's framework for Siri, Shortcuts and Spotlight.[^door-apple-api] The Siri AI Developer Preview in the 27.3 betas is a preview.[^door-apple-preview] |
| Windows: App Actions and an MCP bundle, in [ourostack/ouro-ui-windows](https://github.com/ourostack/ouro-ui-windows) | Before 1.0, at version 0.4.0.[^door-windows] CI runs on Windows Server, which has no App Actions runtime and no On-device Agent Registry, so it proves the package registers both doors and that they behave, not that Windows lists them to agents.[^door-windows] | Microsoft's overview of MCP on Windows says some of its information relates to a prereleased product that might change substantially.[^door-windows-mcp] App Actions have a [page of their own](https://learn.microsoft.com/en-us/windows/ai/app-actions/).[^door-windows-actions] |
| Android: AppFunctions, in [ourostack/ouro-ui-android](https://github.com/ourostack/ouro-ui-android) | Before 1.0, at version 0.5.0.[^door-android-version] It is checked on emulators and never on a real device.[^door-android] Android indexed none of the sample's AppFunctions on CI's API 36 emulator image, so CI checks them on API 37.[^door-android] A consequential action an agent calls asks the person with a built-in confirmation, as Windows' message box does, and an app can replace it with its own `confirm`.[^door-android-confirm] With the app on screen the confirmation opens at once. With the app in the background a notification opens it, and with no notification permission, or no answer in two minutes, the call is refused.[^door-android-confirm] CI's emulator runs an agent's share through Allow, Don't, Back and the notification.[^door-android-confirm-test] | The Jetpack library, androidx.appfunctions, reached 1.0.0 on 18 November 2026, and the kit builds on 1.0.0.[^door-android-jetpack] Google's overview still calls AppFunctions an experimental preview, for Android 16 and later.[^door-android-api] |

## Outcomes and waits

An action returns an outcome rather than a bare "ok". Its `state` says what became of it: `done`, `queued`, `planned`, `needs-human`, `uncertain`, `refused` or `failed`. `postcondition` says whether the tool checked the effect apart from the transport's answer, and `receipt.id` finds the request again. `runCli` sets the exit code from the state.[^outcome-exit]

A wait takes a reference the agent already holds, such as a conversation id from a list, and waits inside the tool. `waitFor()` reads the source as often as it must and returns what happened, or, when the time limit passes, the cursor and the exact command that resumes the wait. The agent makes one call instead of writing a polling loop.

A command that returns data, such as a list or a report, prints it as it is under `--json`. Its `exit` names the exit code by its name in the tool's table, such as `unavailable`, and a name the table does not have is refused.[^data-exit] Without `exit`, the exit code is 0.[^data-exit]

A check command (`defineChecks`, a doctor or a self-check) exits 0 when nothing failed, with `findings` (3) when a check found a problem, and with `error` (1) when a check threw.[^checks-exits] A tool whose table already gives 3 another meaning, such as "not running", passes its own table as `exits` with a `findings` code after its own codes (`{ ...FINDINGS_EXIT_CODE, code: 4 }`), and a finding exits with that code.[^checks-exits] `defineChecks` refuses a table without a `findings` code and names the code that took 3, so a finding never exits with a code that means something else.[^checks-exits-refused]

## Say precisely why it failed

When something fails, your message says what happened and precisely why (the system and its answer), who or what caused it where you know, and the next step as a command or an action. When you don't know the cause, say what you tried and what came back. "Couldn't show this picture" leaves you guessing: should the person retry, ask someone or change something?

| Before | After |
| --- | --- |
| `Couldn't show this picture` | `The photo service says this picture was deleted by its owner. Ask them to share it again.` |
| `inbox-agent: something went wrong` | `inbox-agent: the mail service didn't answer within 60 s. Run inbox-agent sync again.` |
| `Unable to open the file` | `The file service says you don't have access to this file. Ask its owner for access.` |
| `Error` | `inbox-agent: the mail service turned down its sign-in (401). Run inbox-agent login.` |

The X-ray's must claim `copy.precise-failure` reads every refusal, error, outcome `error` and `summary`, `human.reason` and doctor finding it collects, and `help --json` in full, and fails each text that says "couldn't", "could not", "something went wrong", "unable to", "failed to load" or "an error occurred", or is only a bare "Error" or "Failed".[^precise-failure] A phrase passes when its cause follows in the same sentence, after a colon, a dash or "because", in at least two words that start with neither a next step nor a vague word, and "Error: …" is held to the same test; a negation or an action ("No errors", "Retry failed") passes too.[^precise-failure] So `Couldn't send: you're offline. Try again when you're back online.` passes, and `Couldn't send: try again.` does not. Your own tests can call the same checker, `vagueFailuresIn` from [`ax-precise-copy`](../ax/ax-precise-copy.md). When a precise text still holds a phrase ("The card service says your card could not be charged. Use another card."), list it in a file and pass `--failure-copy-allow <file>`: `[{ "match": "could not be charged", "reason": "names the card service and its answer" }]`. An entry without a reason stops the X-ray.[^failure-allow] The source rules kit holds an app's interface copy to the same list ([guardrails guide](guardrails.md#say-precisely-why-it-failed)).

Prior art:

- [Nielsen Norman Group's error-message guidelines](https://www.nngroup.com/articles/error-message-guidelines/ "verify:urlOk(https://www.nngroup.com/articles/error-message-guidelines/)"): adopt. Say precisely what went wrong in plain words, and offer a way forward.
- [GOV.UK's error message component](https://design-system.service.gov.uk/components/error-message/ "verify:urlOk(https://design-system.service.gov.uk/components/error-message/)"): borrow. Its wording rules are for form fields, but its stance carries over: say what happened and how to fix it, in place of "an error occurred".
- [Apple's Human Interface Guidelines on alerts](https://developer.apple.com/design/human-interface-guidelines/alerts "verify:urlOk(https://developer.apple.com/design/human-interface-guidelines/alerts)"): watch. It governs when an alert appears and how its buttons read, more than what a failure says.

## Answer the question the agent asks

A fresh agent asked "what's new for me?" by a consuming app often reaches for several partial commands in turn, rather than the one command built to answer that question directly, and then has to reconcile their separate counts and timestamps by hand.

**One read that answers the agent's question beats several partial ones.** Give the question its own command, one whose single answer already holds everything a "what's new" question needs — the unread items, the mentions, the invites, and what's happening now — each counted from the same lists the answer reports, so nothing in it can disagree with itself. A fresh agent should reach for that command first, from its own `--help`, rather than assembling the same picture from several narrower list commands and reconciling their counts by hand.

**An agent relays a warning stated as a warning, first, and treats a timestamp as metadata.** When the answer is current, say nothing extra: a plain freshness timestamp changes nothing for the person reading it. When the app could not refresh its view, lead the answer with that warning, its cause and its age, before anything else. Don't put an instruction to the agent inside the answer ("Tell the person…"): it is copy that earns no place when nothing is wrong.

## When a page asks to open an app

A surface that drives a browser for an agent meets pages that try to open a desktop app. Zoom, Teams, Slack, Figma and Spotify point the page at an app address such as `zoomus:` and offer a web option for when that fails. The app is the person's to open, so refuse the launch the same way on any site, and keep the agent moving:

- Let the refusal fail the way an app that is not installed fails. Pages with a timer fallback then take their web path on their own.
- If the page only offers a button, follow the page's own web option, found by its role and name ("Join from browser", "Continue in browser"), once. Never take a download, a desktop-app or a "switch browsers" control.
- Say it in the reply, in the same shape as an outcome: which app was refused, what the surface did instead (`page`, `followed` or `none`), and the next command when it did nothing. Name the route that opens the app itself when it does not exist yet, so the agent stops looking for it.

```json
{ "appLaunch": { "refused": ["zoomus"], "by": "zoom.us", "how": "followed", "followed": { "role": "button", "name": "Join from browser" },
  "note": "desk-web refused zoom.us's attempt to open an app (zoomus:); desk-web never opens desktop apps. It then followed the page's own web option, the button \"Join from browser\". Opening the app itself needs its own explicit route, which desk-web does not offer yet." } }
```

A read, such as a snapshot, follows nothing: it reports the launch and the option's ref, and leaves the click to the agent.

## Check the words of a tool without the kit

A repository that has not adopted the kit can still hold its agent-facing words to Ouro AX. `ax-surfaces` reads a manifest of them, `{ "ax": "surfaces/1", "tool": "notes", "errors": [...], "tools": [...], "replies": [...], "texts": [...] }`, and finds an error that does not open with what to do, an error with no stable `code`, a tool description that does not say when to use the tool or runs past 600 characters, an action reply with no field that says what happened, and any message that sends the agent to run a script.[^surfaces-checks] `node scripts/ouro/ax/surfaces.ts extract src --tool notes --out surfaces.json` writes a first manifest from JavaScript or TypeScript source, as a start to edit.

Record today's findings once, then let CI hold the line: `node scripts/ouro/ax/surfaces.ts check surfaces.json --baseline surfaces-baseline.json --init` writes the baseline, and every later `check` with `--baseline` exits 3 on a finding the baseline does not list, and on a listed finding that is fixed, so the pull request that fixes one lowers its count (`--update`) and the count only goes down. The baseline counts findings per check and file, so rewording an error does not change it.[^surfaces-ratchet]

## A doctor

When an app misbehaves, the person's agent should ask the app what's wrong instead of the person relaying screenshots. A doctor answers that: one command says what runs, what's wrong and the next step, and an optional bundle writes a file the agent can read or attach. Build it from these items:

- `ax-doctor`: declare the checks with `defineChecks` (ax-checks), run them, and pass the report with what the tool saw to `doctorReport(checks, state, Date.now())`. `state` is sections of facts (`Processes`, `Versions`, `Sign-in`), each line a label, a value in words, and optionally since when and a part's state: `up`, `starting`, `stuck`, `down` or `absent`.[^doctor-report] A command that returns the report prints the verdict, then the state, then the problems and their fixes, and `--json` carries the same facts.[^doctor-text]
- `ax-probe`: `probeHttp(url, { timeoutMs })` tells up, stuck and down apart, so the doctor answers when the app is down or hangs, and `pidAlive(pid)` says whether a process runs.[^doctor-probe]
- `ax-redact` and `ax-bundle`: `writeBundle({ facts, logs }, { dir, prefix, at, home })` writes a diagnostics file the agent can read or attach, redacted, and refuses it when anything shaped like a secret is left.[^doctor-bundle] `tailLines(file, 300)` reads a log's last lines.

A doctor keeps to these rules. Every problem names its next step as a command that runs or an action by hand, never the doctor itself (`defineChecks` refuses that).[^doctor-fix] It works whatever state the app is in, so it reads files and probes from outside before it asks the app. A tool that already uses the findings code for something else passes its own exit table to `defineChecks`, as [Outcomes and waits](#outcomes-and-waits) says. Its bundle is for categories, counts, times and versions, so test it with made-up secrets of the shapes your app logs.

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
import { bindAx, defineComponentAx } from "#ouro-ax/component.ts";

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

export const agentPresenceAx = defineComponentAx({
  component: "AgentPresence",
  reads: [{ id: "listening", summary: "Which of the person's agents are listening, and what each listens for.", fields: ["agent", "doing"], consent: "none" }],
  actions: [
    { id: "stop", summary: "Stop your own listening: your row only, never another agent's.", effect: "private", agent: true, scope: "self" },
    { id: "stop-all", summary: "Stop every agent listening for the person.", effect: "private", personOnly: "You can't stop every agent; only the person can. Stop your own listening with stop." },
  ],
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
  ...bindAx(agentPresenceAx, {
    reads: { listening: "call agents <meeting>" },
    actions: { stop: "call unfollow <meeting> <listener> --agent <me>" },
    refuseAs: { "stop-all": "call unfollow-all" },
  }),
];
```

A read of what people say (`consent: "listening"`) gives nothing until the person asks the agent to follow that meeting: the inbox-agent runs `call follow m1 --why "<who asked>"` only at the person's direction, and before that the read answers `needs-human`, with the follow as the step that resumes. Its stream (`push: "filtered"`) delivers lines only on a words trigger, such as a mention, a question or a topic, so no agent gets every line of a meeting, and a read takes `--cursor` to pull only what is new.[^listening]

The CLI declares the words a person-only action answers to with `defineCli({ personOnly: { unmute: { reason, how } } })`. They refuse with one line that says why and where the person does it, a refused outcome under `--json`, and `help --json` lists them under `personOnly`, so the prep-agent learns them before it tries.[^person-only] In the `call` tool, `join` is person-only too: the person joins, and agents read from the app's one capture.[^join]

Some actions an agent may take only on its own item. In AgentPresence, an agent may stop its own listening, never another agent's: the person asked that agent to listen. Declare such an action `scope: "self"`. `bindAx` then needs its twin to say who is calling, with `--agent <me>`.[^self-bind] The twin's command declares whose item a call names, with `self: { owner }`, and takes `--agent <you>`. Before `plan()` or `run()`, the kit refuses a call on an item that is not the caller's. The refusal names whose item it is and who called. It gives the command for the caller's own item when the command names one with `instead`, or says to ask the person:[^self-refuse]

```ts
defineCommand({
  name: "unfollow", summary: "Stop your own listening in a meeting; never another agent's.", effect: "private",
  args: [meetingArg, { name: "listener", description: "The listening agent: you.", required: true, source: "agents" }],
  self: { owner: (input) => listener(input).agent, instead: "unfollow <meeting> <agent> --agent <agent>" },
  run: (input) => stopListening(input),
});
```

```text
$ call unfollow m1 research-agent --agent inbox-agent
call: unfollow: that one is research-agent's, and you are inbox-agent; only research-agent or the person may do it. Do it on your own instead. Fix: call unfollow m1 inbox-agent --agent inbox-agent.
```

The person still stops any agent from the app. `help --json` marks the command `scope: "self"`, and the X-ray runs the twin as an agent that owns nothing, which must be refused (`ui.self-scope-refuses`).[^self-xray]

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
import { defineFlow, defineSuite, inProcess } from "../scripts/ouro/ax/flows.ts";

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
node scripts/ouro/ax/flows.ts run flows/suite.ts --out report --xray xray.json
```

`--help` and `--json` come from the Ouro AX kit: under `--json`, stdout holds the outcome alone and each flow's line goes to stderr.[^flows-json] It writes `report/findings.jsonl`, one check a line, and `report/report.json` with the X-ray attached, in the `flow-review/0` format. Each call is checked for its exit code, JSON shape and fields, one-line errors that name the fix, time and size budgets, text it must have or must not, and the voice: plain stderr and JSON alone under `--json`.[^flows-checks] The runner also checks a flow for commands the overview leaves out, and a flow marked `readOnly` for a state that changed. Nothing runs until your guard proves the mock is a mock.[^flows-guard] A step marked `known` with its issue is reported and doesn't fail the run; once it passes, the run fails until the mark goes.[^flows-known] `fixtures/flows-suite.mts` is a whole suite over the example tool, with a reply that arrives partway through a wait.

## Adopting it in an existing tool

Declare one command at a time. A command declared `loose` passes its flags through unchecked until you declare them, and `lintCli(cli, { inventory })`, given the names your dispatcher registers, lists the commands that still run outside the kit.[^lint] The inventory compares names, so also keep a check of your own source that the command table is the only dispatch path. A tool that reads stdin or prints errors its own way calls `parse()`, then `dispatch()` with its own context, then `printResult()`, the steps `runCli` takes. Then run the X-ray in CI ([the X-ray](ax-conformance.md)). [Make your CLI conformant](ax-adopt.md) walks through it step by step.

[^mcp-eras]: test:registry/ouro/ax/mcp.test.mts::2026-07-28: server/discover names the versions, the capabilities and the server, and the results carry resultType, a cache hint and the server's identity; test:registry/ouro/ax/mcp.test.mts::an older client opens with initialize, is answered in the revision it asked for, and then needs no _meta; https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning verify:testExists(registry/ouro/ax/mcp.test.mts::2026-07-28: server/discover names the versions, the capabilities and the server, and the results carry resultType, a cache hint and the server's identity) verify:testExists(registry/ouro/ax/mcp.test.mts::an older client opens with initialize, is answered in the revision it asked for, and then needs no _meta) verify:urlOk(https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning)
[^mcp-client]: test:scripts/ax-mcp-client.test.mjs::the official client, pinned to 2026-07-28, lists and calls ax-mcp's tools with no initialize; test:scripts/ax-mcp-client.test.mjs::the official client that probes with server/discover settles on 2026-07-28 against ax-mcp; test:scripts/ax-mcp-client.test.mjs::the official client that opens with initialize is served 2025-11-25, and each older revision it asks for verify:testExists(scripts/ax-mcp-client.test.mjs::the official client, pinned to 2026-07-28, lists and calls ax-mcp's tools with no initialize) verify:testExists(scripts/ax-mcp-client.test.mjs::the official client that probes with server/discover settles on 2026-07-28 against ax-mcp) verify:testExists(scripts/ax-mcp-client.test.mjs::the official client that opens with initialize is served 2025-11-25, and each older revision it asks for) verify:fileLine(package.json, /"@modelcontextprotocol\/client": "2\.4\.0"/)
[^mcp-conformance]: https://github.com/modelcontextprotocol/conformance/blob/96a6f9478b7f2e125cf0360a213383cf57533893/README.md#L79 verify:urlOk(https://github.com/modelcontextprotocol/conformance/blob/96a6f9478b7f2e125cf0360a213383cf57533893/README.md#L79)
[^mcp-scope]: registry/ouro/ax/mcp.ts verify:fileLine(registry/ouro/ax/mcp.ts, /capabilities: \{ tools: \{\} \}/)
[^mcp-current]: https://modelcontextprotocol.io/specification/2026-07-28/changelog verify:urlOk(https://modelcontextprotocol.io/specification/2026-07-28/changelog)
[^door-apple]: https://github.com/ourostack/ouro-ui-apple/blob/dfdcc158b659e6448beec6a290fa161911e04d93/README.md#L26; https://github.com/ourostack/ouro-ui-apple/blob/dfdcc158b659e6448beec6a290fa161911e04d93/README.md#L32 verify:urlOk(https://github.com/ourostack/ouro-ui-apple/blob/dfdcc158b659e6448beec6a290fa161911e04d93/README.md#L26) verify:urlOk(https://github.com/ourostack/ouro-ui-apple/blob/dfdcc158b659e6448beec6a290fa161911e04d93/README.md#L32)
[^door-apple-siri]: https://github.com/ourostack/ouro-ui-apple/blob/dfdcc158b659e6448beec6a290fa161911e04d93/README.md#L330 verify:urlOk(https://github.com/ourostack/ouro-ui-apple/blob/dfdcc158b659e6448beec6a290fa161911e04d93/README.md#L330)
[^door-apple-api]: https://developer.apple.com/documentation/appintents verify:urlOk(https://developer.apple.com/documentation/appintents)
[^door-apple-preview]: https://developer.apple.com/documentation/appintents/siri-ai-developer-preview verify:urlOk(https://developer.apple.com/documentation/appintents/siri-ai-developer-preview)
[^door-windows]: https://github.com/ourostack/ouro-ui-windows/blob/7f62ae7a10e99669a81f0ac095430e030d7f947c/README.md#L11; https://github.com/ourostack/ouro-ui-windows/blob/7f62ae7a10e99669a81f0ac095430e030d7f947c/README.md#L131 verify:urlOk(https://github.com/ourostack/ouro-ui-windows/blob/7f62ae7a10e99669a81f0ac095430e030d7f947c/README.md#L11) verify:urlOk(https://github.com/ourostack/ouro-ui-windows/blob/7f62ae7a10e99669a81f0ac095430e030d7f947c/README.md#L131)
[^door-windows-mcp]: https://learn.microsoft.com/en-us/windows/ai/mcp/overview verify:urlOk(https://learn.microsoft.com/en-us/windows/ai/mcp/overview)
[^door-windows-actions]: https://learn.microsoft.com/en-us/windows/ai/app-actions/ verify:urlOk(https://learn.microsoft.com/en-us/windows/ai/app-actions/)
[^door-android-version]: https://github.com/ourostack/ouro-ui-android/releases/tag/v0.5.0; https://github.com/ourostack/ouro-ui-android/blob/e38acea984aa202707f6a0c8ea9c6fd889aabf1f/README.md#L72 verify:urlOk(https://github.com/ourostack/ouro-ui-android/releases/tag/v0.5.0) verify:urlOk(https://github.com/ourostack/ouro-ui-android/blob/e38acea984aa202707f6a0c8ea9c6fd889aabf1f/README.md#L72)
[^door-android]: https://github.com/ourostack/ouro-ui-android/blob/e38acea984aa202707f6a0c8ea9c6fd889aabf1f/README.md#L49; https://github.com/ourostack/ouro-ui-android/blob/e38acea984aa202707f6a0c8ea9c6fd889aabf1f/README.md#L83; https://github.com/ourostack/ouro-ui-android/blob/e38acea984aa202707f6a0c8ea9c6fd889aabf1f/README.md#L56; https://github.com/ourostack/ouro-ui-core/blob/e90f749fdb14e738aad01141d18c03f6cc18d99c/docs/decisions/2026-11-14-android-kit.md#L20 verify:urlOk(https://github.com/ourostack/ouro-ui-android/blob/e38acea984aa202707f6a0c8ea9c6fd889aabf1f/README.md#L49) verify:urlOk(https://github.com/ourostack/ouro-ui-android/blob/e38acea984aa202707f6a0c8ea9c6fd889aabf1f/README.md#L83) verify:urlOk(https://github.com/ourostack/ouro-ui-android/blob/e38acea984aa202707f6a0c8ea9c6fd889aabf1f/README.md#L56) verify:urlOk(https://github.com/ourostack/ouro-ui-core/blob/e90f749fdb14e738aad01141d18c03f6cc18d99c/docs/decisions/2026-11-14-android-kit.md#L20)
[^door-android-jetpack]: https://developer.android.com/jetpack/androidx/releases/appfunctions; https://github.com/ourostack/ouro-ui-android/blob/e38acea984aa202707f6a0c8ea9c6fd889aabf1f/gradle/libs.versions.toml#L7 verify:urlOk(https://developer.android.com/jetpack/androidx/releases/appfunctions) verify:urlOk(https://github.com/ourostack/ouro-ui-android/blob/e38acea984aa202707f6a0c8ea9c6fd889aabf1f/gradle/libs.versions.toml#L7)
[^door-android-confirm]: https://github.com/ourostack/ouro-ui-android/blob/e38acea984aa202707f6a0c8ea9c6fd889aabf1f/README.md#L85-L104; https://github.com/ourostack/ouro-ui-android/blob/e38acea984aa202707f6a0c8ea9c6fd889aabf1f/ouro-actions/src/main/kotlin/bot/ouro/ui/actions/OuroConfirm.kt; https://github.com/ourostack/ouro-ui-windows/blob/076c29cb1e582ddb902a08cb832aa5a21c65ee3b/src/Ouro.Actions/MessageBoxConfirm.cs verify:urlOk(https://github.com/ourostack/ouro-ui-android/blob/e38acea984aa202707f6a0c8ea9c6fd889aabf1f/README.md#L85-L104) verify:urlOk(https://github.com/ourostack/ouro-ui-android/blob/e38acea984aa202707f6a0c8ea9c6fd889aabf1f/ouro-actions/src/main/kotlin/bot/ouro/ui/actions/OuroConfirm.kt) verify:urlOk(https://github.com/ourostack/ouro-ui-windows/blob/076c29cb1e582ddb902a08cb832aa5a21c65ee3b/src/Ouro.Actions/MessageBoxConfirm.cs)
[^door-android-confirm-test]: https://github.com/ourostack/ouro-ui-android/blob/e38acea984aa202707f6a0c8ea9c6fd889aabf1f/samples/shop/src/androidTest/kotlin/bot/ouro/shop/ConfirmTest.kt verify:urlOk(https://github.com/ourostack/ouro-ui-android/blob/e38acea984aa202707f6a0c8ea9c6fd889aabf1f/samples/shop/src/androidTest/kotlin/bot/ouro/shop/ConfirmTest.kt)
[^door-android-api]: https://developer.android.com/ai/appfunctions verify:urlOk(https://developer.android.com/ai/appfunctions)
[^node]: test:scripts/ax.test.mjs::the Ouro AX tests pass and cover every line, branch and function of Ouro AX verify:testExists(scripts/ax.test.mjs::the Ouro AX tests pass and cover every line, branch and function of Ouro AX)
[^deps]: test:scripts/registry.test.mjs::Ouro AX items depend on the ax items they import verify:testExists(scripts/registry.test.mjs::Ouro AX items depend on the ax items they import)
[^tool]: test:scripts/ax.test.mjs::the guide shows the tasks tool as it is, and the answers it gives; test:registry/ouro/ax/xray.test.mts::the guide's tool conforms verify:testExists(scripts/ax.test.mjs::the guide shows the tasks tool as it is, and the answers it gives) verify:testExists(registry/ouro/ax/xray.test.mts::the guide's tool conforms)
[^dry-run]: test:registry/ouro/ax/cli.test.mts::--dry-run runs the plan, never run(): a planned outcome, exit 0, nothing posted verify:testExists(registry/ouro/ax/cli.test.mts::--dry-run runs the plan, never run(): a planned outcome, exit 0, nothing posted)
[^outcome-exit]: test:registry/ouro/ax/outcome.test.mts::outcomeExit: a refusal's own exit, else the state's name in the tool's table verify:testExists(registry/ouro/ax/outcome.test.mts::outcomeExit: a refusal's own exit, else the state's name in the tool's table)
[^data-exit]: test:registry/ouro/ax/cli.test.mts::a data result exits with the code its command names in the tool's table, and --json prints the data unchanged verify:testExists(registry/ouro/ax/cli.test.mts::a data result exits with the code its command names in the tool's table, and --json prints the data unchanged)
[^doctor-text]: test:registry/ouro/ax/cli.test.mts::a command that returns a doctor report prints the doctor's text, with the state under the verdict, and the report as --json verify:testExists(registry/ouro/ax/cli.test.mts::a command that returns a doctor report prints the doctor's text, with the state under the verdict, and the report as --json)
[^doctor-probe]: test:registry/ouro/ax/probe.test.mts::probeHttp tells up, stuck and down apart on real local sockets verify:testExists(registry/ouro/ax/probe.test.mts::probeHttp tells up, stuck and down apart on real local sockets)
[^doctor-report]: test:registry/ouro/ax/doctor.test.mts::a doctor report is the checks report with the state it judged, and still a checks report verify:testExists(registry/ouro/ax/doctor.test.mts::a doctor report is the checks report with the state it judged, and still a checks report)
[^doctor-fix]: test:registry/ouro/ax/checks.test.mts::a warning or failure without a fix, or with the command just run as its fix, fails the run verify:testExists(registry/ouro/ax/checks.test.mts::a warning or failure without a fix, or with the command just run as its fix, fails the run)
[^doctor-bundle]: test:registry/ouro/ax/bundle.test.mts::a bundle that still holds a secret's shape after redaction is refused, and nothing is written verify:testExists(registry/ouro/ax/bundle.test.mts::a bundle that still holds a secret's shape after redaction is refused, and nothing is written)
[^checks-exits]: test:registry/ouro/ax/checks.test.mts::a tool's own exit table gives a finding its findings code, wherever the table puts it verify:testExists(registry/ouro/ax/checks.test.mts::a tool's own exit table gives a finding its findings code, wherever the table puts it)
[^checks-exits-refused]: test:registry/ouro/ax/checks.test.mts::a tool's exit table without a findings code is refused, naming the code that took 3 verify:testExists(registry/ouro/ax/checks.test.mts::a tool's exit table without a findings code is refused, naming the code that took 3)
[^voice]: test:registry/ouro/ax/cli.test.mts::the voice speaks only on a terminal: never under --json, --quiet, CI or a pipe, and never in an error verify:testExists(registry/ouro/ax/cli.test.mts::the voice speaks only on a terminal: never under --json, --quiet, CI or a pipe, and never in an error)
[^voice-line]: test:registry/ouro/ax/voice.test.mts::a line is one line of plain ASCII, at most 72 characters, checked when the tool is built verify:testExists(registry/ouro/ax/voice.test.mts::a line is one line of plain ASCII, at most 72 characters, checked when the tool is built)
[^voice-order]: test:registry/ouro/ax/cli.test.mts::a voice line follows the fact it adds to: a done outcome, an empty list, the summary, and one celebration at most; test:registry/ouro/ax/cli.test.mts::voice variants rotate from the memory a tool keeps between runs verify:testExists(registry/ouro/ax/cli.test.mts::a voice line follows the fact it adds to: a done outcome, an empty list, the summary, and one celebration at most) verify:testExists(registry/ouro/ax/cli.test.mts::voice variants rotate from the memory a tool keeps between runs)
[^flows-checks]: test:registry/ouro/ax/flows.test.mts::a call's checks: exit, shape, fields, error text, time, size, text and voice, each its own finding verify:testExists(registry/ouro/ax/flows.test.mts::a call's checks: exit, shape, fields, error text, time, size, text and voice, each its own finding)
[^flows-guard]: test:registry/ouro/ax/flows.test.mts::nothing runs until the suite's guard passes verify:testExists(registry/ouro/ax/flows.test.mts::nothing runs until the suite's guard passes)
[^flows-known]: test:registry/ouro/ax/flows.test.mts::the command runs a suite module: exit 0, 1 on an unknown failure or a known that passes, 2 on usage verify:testExists(registry/ouro/ax/flows.test.mts::the command runs a suite module: exit 0, 1 on an unknown failure or a known that passes, 2 on usage)
[^flows-json]: test:registry/ouro/ax/flows.test.mts::--json prints the outcome alone on stdout, and each flow's line on stderr verify:testExists(registry/ouro/ax/flows.test.mts::--json prints the outcome alone on stdout, and each flow's line on stderr)
[^component]: test:registry/ouro/ax/component.test.mts::an action is agent or person-only, exactly one, and every problem throws one line with its fix verify:testExists(registry/ouro/ax/component.test.mts::an action is agent or person-only, exactly one, and every problem throws one line with its fix)
[^bind]: test:registry/ouro/ax/component.test.mts::bindAx needs a twin for every read and agent action, refuses one for a person-only action, and returns the inventory entries; test:scripts/ax.test.mjs::the guide shows the calling components' declarations as they are verify:testExists(registry/ouro/ax/component.test.mts::bindAx needs a twin for every read and agent action, refuses one for a person-only action, and returns the inventory entries) verify:testExists(scripts/ax.test.mjs::the guide shows the calling components' declarations as they are)
[^listening]: test:registry/ouro/ax/xray.test.mts::the calling components' twins conform: each twin is listed with its effect, person-only words refuse, and listening reads wait for a follow verify:testExists(registry/ouro/ax/xray.test.mts::the calling components' twins conform: each twin is listed with its effect, person-only words refuse, and listening reads wait for a follow)
[^person-only]: test:registry/ouro/ax/cli.test.mts::a person-only word refuses with its reason and how the person does it, as a refused outcome under --json; test:registry/ouro/ax/help.test.mts::person-only words are listed in the overview and in help --json, with the reason and how the person does it verify:testExists(registry/ouro/ax/cli.test.mts::a person-only word refuses with its reason and how the person does it, as a refused outcome under --json) verify:testExists(registry/ouro/ax/help.test.mts::person-only words are listed in the overview and in help --json, with the reason and how the person does it)
[^self-bind]: test:registry/ouro/ax/component.test.mts::a self-scoped action is an agent's, and bindAx needs its twin to say who is calling verify:testExists(registry/ouro/ax/component.test.mts::a self-scoped action is an agent's, and bindAx needs its twin to say who is calling)
[^self-refuse]: test:registry/ouro/ax/cli.test.mts::a self-scoped command runs on the calling agent's own item and refuses another agent's before plan() or run(), naming both; test:registry/ouro/ax/mcp.test.mts::a self-scoped tool refuses another agent's item as a tool error, before run() verify:testExists(registry/ouro/ax/cli.test.mts::a self-scoped command runs on the calling agent's own item and refuses another agent's before plan() or run(), naming both) verify:testExists(registry/ouro/ax/mcp.test.mts::a self-scoped tool refuses another agent's item as a tool error, before run()) verify:fileLine(registry/ouro/ax/fixtures/call.mts, /self: \{ owner: \(i: Input\) => listener\(i\)\.agent, instead: "unfollow <meeting> <agent> --agent <agent>" \}/)
[^self-xray]: test:registry/ouro/ax/xray.test.mts::a self-scoped twin that does not check the owner fails ui.self-scope-refuses, with what it saw verify:testExists(registry/ouro/ax/xray.test.mts::a self-scoped twin that does not check the owner fails ui.self-scope-refuses, with what it saw) verify:testExists(registry/ouro/ax/xray.test.mts::the calling components' twins conform: each twin is listed with its effect, person-only words refuse, and listening reads wait for a follow)
[^join]: registry/ouro/ax/fixtures/call.mts verify:fileLine(registry/ouro/ax/fixtures/call.mts, /join: \{ reason: "You can't join a call for the person, and you read from the app's one capture; only they join\."/)
[^reserved]: test:registry/ouro/ax/component.test.mts::reserved ids are matched by meaning: every alias and case is the person's, and what reduces exposure stays an agent's verify:testExists(registry/ouro/ax/component.test.mts::reserved ids are matched by meaning: every alias and case is the person's, and what reduces exposure stays an agent's) verify:testExists(registry/ouro/ax/component.test.mts::a reserved action is always the person's: declaring it agent: true throws with its reason)
[^install]: test:scripts/install-check.test.mjs::an installed file must equal its source once import paths are mapped to the app's aliases; test:scripts/registry.test.mjs::a component that imports the ax kit lists the ax item in its registryDependencies verify:testExists(scripts/install-check.test.mjs::an installed file must equal its source once import paths are mapped to the app's aliases) verify:testExists(scripts/registry.test.mjs::a component that imports the ax kit lists the ax item in its registryDependencies)
[^rendered]: test:registry/ouro/ax/component.test.mts::expectAxRendered finds each declared action's control by data-ax-action, and names the ones it misses verify:testExists(registry/ouro/ax/component.test.mts::expectAxRendered finds each declared action's control by data-ax-action, and names the ones it misses)
[^lint]: test:registry/ouro/ax/lint.test.mts::against the tool's own inventory: a registered command with no declaration, and a declaration with no command verify:testExists(registry/ouro/ax/lint.test.mts::against the tool's own inventory: a registered command with no declaration, and a declaration with no command)
[^precise-failure]: test:registry/ouro/ax/xray.test.mts::a CLI whose failures say something went wrong fails copy.precise-failure once per text, and an allow-list with reasons lets precise text through verify:testExists(registry/ouro/ax/xray.test.mts::a CLI whose failures say something went wrong fails copy.precise-failure once per text, and an allow-list with reasons lets precise text through) verify:testExists(registry/ouro/ax/precise-copy.test.mts::walks a value, reading an outcome's error, human reason and summary and a checks report's findings, not the person's data)
[^failure-allow]: test:registry/ouro/ax/precise-copy.test.mts::an allow-list needs a match and a reason in every entry verify:testExists(registry/ouro/ax/precise-copy.test.mts::an allow-list needs a match and a reason in every entry) verify:testExists(registry/ouro/ax/xray.test.mts::a CLI whose failures say something went wrong fails copy.precise-failure once per text, and an allow-list with reasons lets precise text through)
[^surfaces-checks]: test:registry/ouro/ax/surfaces.test.mts::error.leads-with-fix: says whether the fix is missing or only late verify:testExists(registry/ouro/ax/surfaces.test.mts::error.leads-with-fix: says whether the fix is missing or only late) verify:testExists(registry/ouro/ax/surfaces.test.mts::tool.says-when and tool.description-budget: when to use it, within the size budget) verify:testExists(registry/ouro/ax/surfaces.test.mts::reply.reports-outcome: an action's reply carries a field that says what happened; a read needs none) verify:testExists(registry/ouro/ax/surfaces.test.mts::text.no-script: no error, tool description or text sends the agent to a script)
[^surfaces-ratchet]: test:registry/ouro/ax/surfaces.test.mts::a baseline is written once, fails what is new, and only ever shrinks verify:testExists(registry/ouro/ax/surfaces.test.mts::a baseline is written once, fails what is new, and only ever shrinks)
[^ax-outside]: test:scripts/check-vite-types.test.mjs::a Vite app type-checks with Ouro check and Ouro images installed where the CLI puts them, outside src, and fails with their Node files in src; test:scripts/check-vite-types.test.mjs::a Vite app type-checks with the Ouro AX kit and its tests installed, and still checks what it imports from the kit verify:testExists(scripts/check-vite-types.test.mjs::a Vite app type-checks with Ouro check and Ouro images installed where the CLI puts them, outside src, and fails with their Node files in src) verify:testExists(scripts/check-vite-types.test.mjs::a Vite app type-checks with the Ouro AX kit and its tests installed, and still checks what it imports from the kit)
