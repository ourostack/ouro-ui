# Make your CLI conformant

Ouro AX checks the interface an agent uses from outside, the way an agent calls it ([Ouro AX](ax.md)). To make your own CLI conform, copy in the kit, move your commands onto its declarations one at a time, and run the X-ray until it says the CLI conforms; then keep it that way in CI. Try the whole idea first in your browser: the [Ouro AX page](https://ui.ouroboros.bot/ax/) lets you be the agent, and shows the X-ray's report on a real app before and after it adopted the kit.

## 1. Copy in the kit

```sh
npx shadcn@latest add ourostack/ouro-ui/ouro-ax#v1.3.652
npx shadcn@latest add ourostack/ouro-ui/ouro-ax-tests#v1.3.652
```

The shared files land in `lib/ouro/ax/`, and the X-ray's Node files in `scripts/ouro/ax/`, as TypeScript that Node runs as it is.[^node] Keep them as they are: when you need a change, make it in Ouro UI and copy the next tag, so your copy and the X-ray never drift apart.

## 2. Run the X-ray on your CLI as it is

```sh
node scripts/ouro/ax/xray.ts --cli "node bin/tool.mjs" --home .xray-home --env "TOOL_URL=$MOCK_URL" --guard "node scripts/assert-mock.mjs" --md xray-before.md
```

Start before you change anything. The report lists each claim, the surfaces it holds on, and for each failure the call it made, what came back and the fix.[^effects] Keep this first report: it is your "before". Point the CLI at a mock with made-up data on a loopback address, pass that address with `--env` so the X-ray can check it, and give the X-ray a guard that proves it is a mock; without that proof it skips every call other people would see.[^safety]

## 3. Declare one command at a time

Write a `defineCommand` for one command: its name, a one-line summary, who sees its effect (only the person, or other people), its arguments and an example. Declare an existing command `loose` while its flags still pass through unchecked, and declare them next.[^lint] Run `lintCli(cli, { inventory })` with the names your dispatcher registers, and it lists the commands that still run outside the kit.[^lint] [The guide's tool](ax.md#a-tool) is a whole CLI in one file, with a read and an action other people see.

What an agent gets from a declaration, in the guide's tool:[^tool]

```text
$ tasks assign t1 Ana
tasks: assign: other people will see this as the person's, so it needs --why: who asked you, and what they said. Fix: tasks assign t1 Ana --why "<who asked you, and what they said>".
$ tasks assign t1 Ana --why "Jo asked" --dry-run
Would give "Book the room" to Ana; the team will see it.
```

## 4. Generate the inventory, and ask for conformance

```sh
node scripts/inventory.mjs > inventory.json   # from your command table, never by hand
node scripts/ouro/ax/xray.ts --cli "node bin/tool.mjs" --inventory inventory.json --conformance --home .xray-home --env "TOOL_URL=$MOCK_URL" --guard "node scripts/assert-mock.mjs" --json --md xray.md > xray.json
```

A report proves only the surfaces it covered, so build the inventory from your CLI's own registration.[^inventory] With `--conformance`, the X-ray exits 0 only when your CLI conforms.[^conformance] Read `xray.md` for what still fails, fix the first `must`, and run it again.

## 5. Gate CI on it, and keep the report

Add the X-ray to CI against your mock, with `--commit` so the report names what it checked, and upload `xray.json`, `xray.md` and `inventory.json` as an artifact ([the X-ray in CI](ax-conformance.md#in-ci)). The report pins the claim set's version and hash, the X-ray's version and your commit.[^pin] When you review a change, compare the failing checks of the base and the change, not their totals: a new command adds checks, so the totals move anyway.

For a CLI without an HTTP API, run step 4's command in CI with `--commit` and a home under `$RUNNER_TEMP`:

```yaml
- name: Ouro AX X-ray
  run: |
    node scripts/inventory.mjs > inventory.json
    node scripts/ouro/ax/xray.ts --cli "node bin/tool.mjs" --inventory inventory.json --conformance \
      --home "$RUNNER_TEMP/xray-home" --env "TOOL_URL=$MOCK_URL" --guard "node scripts/assert-mock.mjs" --commit "$GITHUB_SHA" --json --md xray.md > xray.json
```

Gate CI on the exit code, not on `xray.json` alone: a run that refuses its options or fails before it checks (exit 2, or 1) writes an error object to `xray.json` under `--json`, in place of a report.[^ax-gate]

## 6. Give it a voice, if you want one

```ts
voice: {
  banner: ["Rooms to talk in, notes to keep."],
  empty: ["Nothing yet. Rooms fill up."],
},
```

A voice is optional: a line of character after the facts, for a person at a terminal ([a voice](ax.md#a-voice)). The kit keeps it out of `--json`, pipes, `--quiet`, CI, stderr and errors, and checks each line when the tool is built.[^voice] Write it in your product's own voice: call the agent "you" and the human "the person". Don't make the tool say "I", and don't give a brand character lines.

## 7. Check the tasks, not just the rules

Write each task an agent does with your CLI as a flow, the calls a good agent makes and what each must show, and run the flows in CI beside the X-ray ([agent flows in CI](ax.md#agent-flows-in-ci)). A command can keep every rule and still leave an agent stuck halfway through a task.[^flows]

## 8. Watch real agents use it

Give fresh agents real tasks against your mock, with only your CLI allowed, and score each run from the end state ([the evaluation](ax-eval.md)). Admit a new `must` claim only when a run shows agents failing without it.

## Today's gotchas

- **Text on stdin can't get through an allow-list.** An agent allowed only your CLI can't run `printf ... | tool`, because the pipe's first command isn't your tool. Take text as `--text` or `--file`.[^text]
- **A fresh agent waits forever before its first call.** Pass `--no-config-plugins` with `--allow-tool` when you run an agent in prompt mode. With an allow-list, the agent CLI stops approving every tool, so the host's plugin extensions are denied and the run waits for an approval nobody can give until it times out.[^hang] Give each run minutes, not seconds, on a busy machine.
- **`null` and missing are different answers.** Print "nothing yet" for a field that is `null` and "not known" for one that is absent, and test both.
- **Unlisted means unfound.** Put every command in the help overview, and group commands on one line when the overview gets long, rather than leaving one out.[^v13]
- **Repeat flags and trailing words are yours to add.** Spread a generated command into `defineCommand` and set them there, as in `flags: { ...def.flags, fetch: { ...def.flags.fetch, repeat: true } }` and `args: [{ name: "words", description: "...", rest: "list" }]`. A wrapper that passes its words on to another program takes `rest: "list"`, and hands the words to the kit only for its own help or commands, so the other program keeps its `--json` and `--help`.
- **`--dry-run` is the kit's.** An action input named `dryRun` is refused by `ouro-actions`; give it `flag: "preview"` and, in the command you build, rename the flag back (`{ ...flags, "dry-run": preview }`) when the tool already documents `--dry-run`.
- **A check that finds something exits with the findings code.** Declare `exits: defineExitCodes([...BASE_EXIT_CODES, FINDINGS_EXIT_CODE])` and `exit: (r) => (r.ok ? "ok" : "findings")`, so a plain error still means the tool itself broke.
- **Hooks and libraries that import the tool must not load the kit.** Import `cli.ts` and `ax-command.ts` with `await import()` inside `main`, so a file that other code loads for its functions starts no faster or slower, and a host that runs an older Node fails only when the command runs.
- **Real names leak.** Use made-up people and role names (`inbox-agent`) in examples and fixtures, never the name of a real product or person.
- **A published example teaches wording, not only syntax.** The kit already refuses to build a CLI whose own example doesn't parse,[^examples] but a fresh agent copies an example's phrasing back at people too, including the words in its `--why`; write every example the way a person actually talks, not a placeholder like "testing".
- **A suggested command should resolve, and the kit only proves one of them.** Build a `next` step's `command` from the words your help renders, never type it by hand a second time; the X-ray already proves this for the step that resumes a `needs-human` outcome,[^resume] so hold your own `next` steps in refused and queued outcomes to the same rule, and run the command you suggest to check it doesn't refuse right back.
- **A receipt is only as useful as the read that can find it again.** Give a receipt's id the exact shape one of your own read commands takes as an argument, and test the round trip: write, then read with the id the write returned.
- **Put "what's new" in a read, not a side channel.** An agent asks the same question a person does, what changed since I last looked, so answer it from an unread count or a last-seen point in the read itself, not from a separate notification surface it has to poll.
- **Say whose "now" a date is in.** Wherever a result reads "today" or "this week", name the time zone it is reckoned in; an agent and the person reading its output may not share one.
- **An effect's one-line summary should say what changes, not only that something does.** An `others` command already needs a required `--why` and a `--dry-run` preview,[^others] so put what changes and who sees it in the summary itself, rather than making an agent run the preview just to find out.
- **An agent-facing doc leads with the agent's part.** In a guide a person and an agent both read, put the CLI's own commands and examples first and the narrative after: an agent reads start to finish once and stops at the first answer it needs.

[^node]: test:scripts/ax.test.mjs::the Ouro AX tests pass and cover every line, branch and function of Ouro AX verify:testExists(scripts/ax.test.mjs::the Ouro AX tests pass and cover every line, branch and function of Ouro AX)
[^effects]: test:registry/ouro/ax/xray.test.mts::a CLI that breaks the claims fails them, each with what it saw verify:testExists(registry/ouro/ax/xray.test.mts::a CLI that breaks the claims fails them, each with what it saw)
[^safety]: test:registry/ouro/ax/xray.test.mts::checkSafety fails closed: a remote address, the real home, a credential, a wrong or missing mock; test:registry/ouro/ax/xray.test.mts::without proof of a mock, nothing other people see is called, and it does not conform verify:testExists(registry/ouro/ax/xray.test.mts::checkSafety fails closed: a remote address, the real home, a credential, a wrong or missing mock) verify:testExists(registry/ouro/ax/xray.test.mts::without proof of a mock, nothing other people see is called, and it does not conform)
[^lint]: test:registry/ouro/ax/lint.test.mts::against the tool's own inventory: a registered command with no declaration, and a declaration with no command verify:testExists(registry/ouro/ax/lint.test.mts::against the tool's own inventory: a registered command with no declaration, and a declaration with no command)
[^tool]: test:scripts/ax.test.mjs::the guide shows the tasks tool as it is, and the answers it gives; test:registry/ouro/ax/xray.test.mts::the guide's tool conforms verify:testExists(scripts/ax.test.mjs::the guide shows the tasks tool as it is, and the answers it gives) verify:testExists(registry/ouro/ax/xray.test.mts::the guide's tool conforms)
[^inventory]: test:registry/ouro/ax/xray.test.mts::compareInventory names what is missing, unknown or listed twice verify:testExists(registry/ouro/ax/xray.test.mts::compareInventory names what is missing, unknown or listed twice)
[^conformance]: test:registry/ouro/ax/xray.test.mts::the kit's example tool conforms, and the X-ray acts on nothing; test:registry/ouro/ax/xray.test.mts::the command: claims, help, usage errors with the fix, exit codes, written reports verify:testExists(registry/ouro/ax/xray.test.mts::the kit's example tool conforms, and the X-ray acts on nothing) verify:testExists(registry/ouro/ax/xray.test.mts::the command: claims, help, usage errors with the fix, exit codes, written reports)
[^pin]: test:registry/ouro/ax/xray.test.mts::the kit's example tool conforms, and the X-ray acts on nothing verify:testExists(registry/ouro/ax/xray.test.mts::the kit's example tool conforms, and the X-ray acts on nothing)
[^voice]: test:registry/ouro/ax/cli.test.mts::the voice speaks only on a terminal: never under --json, --quiet, CI or a pipe, and never in an error; test:registry/ouro/ax/voice.test.mts::a line is one line of plain ASCII, at most 72 characters, checked when the tool is built verify:testExists(registry/ouro/ax/cli.test.mts::the voice speaks only on a terminal: never under --json, --quiet, CI or a pipe, and never in an error) verify:testExists(registry/ouro/ax/voice.test.mts::a line is one line of plain ASCII, at most 72 characters, checked when the tool is built)
[^flows]: evidence:docs/decisions/2026-10-30-ouro-ax/evidence/agent-flow-review.md verify:fileLine(docs/decisions/2026-10-30-ouro-ax/evidence/agent-flow-review.md, /593 checks, 30 failing/)
[^text]: evidence:docs/decisions/2026-10-30-ouro-ax/evidence/eval-baseline.md; evidence:docs/decisions/2026-10-30-ouro-ax/evidence/eval-after-440.md verify:fileLine(docs/decisions/2026-10-30-ouro-ax/evidence/eval-baseline.md, /\| T4 Recovery \(ambiguous verb: edit\) \| 0\/2 \|/) verify:fileLine(docs/decisions/2026-10-30-ouro-ax/evidence/eval-after-440.md, /\| T4 Recovery \(ambiguous verb: edit\) \| 2\/2 \|/)
[^hang]: evidence:docs/decisions/2026-10-30-ouro-ax/evidence/eval-method.md verify:fileLine(docs/decisions/2026-10-30-ouro-ax/evidence/eval-method.md, /every prompt-mode run with .--allow-tool. hung after startup/)
[^ax-gate]: registry/ouro/ax/xray.test.mts verify:testExists(registry/ouro/ax/xray.test.mts::the kit answers help, an unknown flag is one line with its fix, and repeat flags keep every value) verify:testExists(registry/ouro/ax/xray.test.mts::the command: claims, help, usage errors with the fix, exit codes, written reports)
[^v13]: test:registry/ouro/ax/xray.test.mts::a voice in a pipe or --json, text without its refs, an unlisted command, long help, an unnamed audience, a closed pipe verify:testExists(registry/ouro/ax/xray.test.mts::a voice in a pipe or --json, text without its refs, an unlisted command, long help, an unnamed audience, a closed pipe)
[^examples]: test:registry/ouro/ax/ax-command.test.mts::definitions are checked when the tool is built: names, rest last, examples that parse verify:testExists(registry/ouro/ax/ax-command.test.mts::definitions are checked when the tool is built: names, rest last, examples that parse)
[^resume]: test:registry/ouro/ax/xray.test.mts::the calling components' twins conform: each twin is listed with its effect, person-only words refuse, and listening reads wait for a follow verify:testExists(registry/ouro/ax/xray.test.mts::the calling components' twins conform: each twin is listed with its effect, person-only words refuse, and listening reads wait for a follow)
[^others]: test:registry/ouro/ax/lint.test.mts::each missing piece is one line with its fix, and loose commands are counted verify:testExists(registry/ouro/ax/lint.test.mts::each missing piece is one line with its fix, and loose commands are counted)
