# Ouro AX

Ouro AX is for the interfaces agents use: a CLI, an HTTP API or an MCP server. Ouro HX gives a person's screen its components; Ouro AX gives an agent's interface a standard, a kit that meets it and an X-ray that checks it ([decision record](../decisions/2026-10-30-ouro-ax.md)).

- **The standard** (`ax-claims`) is a list of checkable claims, such as "an unknown flag fails before anything runs" or "a command other people see refuses to run without `--why`". A claim is `must` when an agent evaluation showed agents failing without it, or when it guards against a stated hazard; the others are `should` ([the claims](ax-standard.md)).
- **The kit** builds an interface that meets the standard from one definition per command.
- **The X-ray** (`ax-xray`) checks any interface against the claims from outside, whether the kit built it or not ([the X-ray](ax-conformance.md)).

## Install

```sh
npx shadcn@latest add ourostack/ouro-ui/ouro-ax#v1.3.0         # the kit and the X-ray
npx shadcn@latest add ourostack/ouro-ui/ouro-ax-tests#v1.3.0   # with their node:test tests
```

The shadcn CLI copies the files into `lib/ouro/ax/` under your lib alias. Node runs them as they are: they are TypeScript that imports its siblings as `./<file>.ts`, and Node strips the types.[^node] Add single items by name (`ax-command`, `ax-xray`) when you need only some of them; each brings the items it imports.[^deps]

## A tool

This tool has a read and an action other people see. The kit gives it the rest:

```ts
import { quietPipes, runCli } from "./lib/ouro/ax/cli.ts";
import { defineCli, defineCommand } from "./lib/ouro/ax/command.ts";
import { AxError } from "./lib/ouro/ax/problem.ts";
import { outcome } from "./lib/ouro/ax/outcome.ts";

const tasks = new Map([["t1", { title: "Book the room", owner: "Sam" }]]);
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
      name: "assign", summary: "Give a task to someone; the team sees it.", effect: "others", examples: ['tasks assign t1 Ana --why "Sam asked"'],
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
$ tasks assign t9 Ana --why "Sam asked"
tasks: task: there is no task "t9". Fix: tasks list.
$ tasks assign t1 Ana --why "Sam asked" --dry-run
Would give "Book the room" to Ana; the team will see it.
$ tasks assign t1 Ana --why "Sam asked"
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
| [`ax-lint`](../ax/ax-lint.md) | Checks the declarations, and against your command inventory that the commands you register run through them. |
| [`ax-claims`](../ax/ax-claims.md) | The standard as data. |
| [`ax-xray`](../ax/ax-xray.md) | The checker. |
| [`ax-example`](../ax/ax-example.md) | A small tool built only from the kit; the tests use it. |

## Outcomes and waits

An action returns an outcome rather than a bare "ok". Its `state` says what became of it: `done`, `queued`, `planned`, `needs-human`, `uncertain`, `refused` or `failed`. `postcondition` says whether the tool checked the effect apart from the transport's answer, and `receipt.id` finds the request again. `runCli` sets the exit code from the state.[^outcome-exit]

A wait takes a reference the agent already holds, such as a conversation id from a list, and waits inside the tool. `waitFor()` reads the source as often as it must and returns what happened, or, when the time limit passes, the cursor and the exact command that resumes the wait. The agent makes one call instead of writing a polling loop.

## Adopting it in an existing tool

Declare one command at a time. A command declared `loose` passes its flags through unchecked until you declare them, and `lintCli(cli, { inventory })`, given the names your dispatcher registers, lists the commands that still run outside the kit.[^lint] The inventory compares names, so also keep a check of your own source that the command table is the only dispatch path. A tool that reads stdin or prints errors its own way calls `parse()`, then `dispatch()` with its own context, then `printResult()`, the steps `runCli` takes. Then run the X-ray in CI ([the X-ray](ax-conformance.md)).

[^node]: test:scripts/ax.test.mjs::the Ouro AX tests pass and cover every line, branch and function of Ouro AX verify:testExists(scripts/ax.test.mjs::the Ouro AX tests pass and cover every line, branch and function of Ouro AX)
[^deps]: test:scripts/registry.test.mjs::Ouro AX items depend on the ax items they import verify:testExists(scripts/registry.test.mjs::Ouro AX items depend on the ax items they import)
[^tool]: test:scripts/ax.test.mjs::the guide shows the tasks tool as it is, and the answers it gives; test:registry/ouro/ax/xray.test.mts::the guide's tool conforms verify:testExists(scripts/ax.test.mjs::the guide shows the tasks tool as it is, and the answers it gives) verify:testExists(registry/ouro/ax/xray.test.mts::the guide's tool conforms)
[^dry-run]: test:registry/ouro/ax/cli.test.mts::--dry-run runs the plan, never run(): a planned outcome, exit 0, nothing posted verify:testExists(registry/ouro/ax/cli.test.mts::--dry-run runs the plan, never run(): a planned outcome, exit 0, nothing posted)
[^outcome-exit]: test:registry/ouro/ax/outcome.test.mts::outcomeExit: a refusal's own exit, else the state's name in the tool's table verify:testExists(registry/ouro/ax/outcome.test.mts::outcomeExit: a refusal's own exit, else the state's name in the tool's table)
[^lint]: test:registry/ouro/ax/lint.test.mts::against the tool's own inventory: a registered command with no declaration, and a declaration with no command verify:testExists(registry/ouro/ax/lint.test.mts::against the tool's own inventory: a registered command with no declaration, and a declaration with no command)
