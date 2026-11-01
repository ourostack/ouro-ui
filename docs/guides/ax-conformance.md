# The Ouro AX X-ray

`ax-xray` checks an interface an agent uses against the Ouro AX claims ([the claims](ax-standard.md)). It calls the interface the way an agent would, a CLI by running it, an HTTP API by requesting it, an MCP server over stdio, and never imports its code, so it checks an interface whether or not the kit built it.[^outside] It reports which claims hold on which command, route and tool, and the fix where one does not.

```sh
npx shadcn@latest add ourostack/ouro-ui/ax-xray#v1.3.1
node lib/ouro/ax/xray.ts --cli "node bin/tool.mjs" --home .xray-home --mock "http://127.0.0.1:5999/api/state mock=true"
```

## What it checks

- **A CLI** (`--cli "<command>"`): it reads `help --json` for the commands and who sees each, then calls every command's `--help`, every read with `--json`, an unknown command and flag, a misspelt flag, the ambiguous verbs, the wait command on a reference a read gave, and each command other people see without `--why`, with a made-up target, and with `--dry-run` on a real one.[^cli] It also runs the overview into a pipe that is already closed, runs each read that lists refs again as text, and checks every call for the voice lines `help --json` lists: none may reach a pipe or `--json`.[^v13]
- **An HTTP API** (`--http <url> --routes <manifest.json>`): it requests the base path's index, an unknown route and every read route, and sends the refused probes the manifest names.[^http] The manifest is `{ "base": "/api", "routes": ["GET /api/x", ...], "state": ["GET /api/log"], "others": [{ "route": "POST /api/send", "why": "why", "body": { "to": "{ref}" } }] }`.
- **An MCP server** (`--mcp "<command>"`): it initializes, lists the tools, calls a tool that has required arguments with none, and calls a tool that does not exist.[^mcp]

`--state "<args>"` names the commands (or, in the manifest, the routes) whose output is the state that must not change. The X-ray reads it twice before it starts, around each refused call and preview, and at the end, and it reports any change that is not a record of a refusal as an unplanned write.[^effects]

## It calls what other people see only on a proven mock

Before it calls anything other people see, even a call that must be refused, the X-ray needs proof that the target is a mock, and it fails closed:[^safety]

- every address it can see (`--http`, the `--mock` address, an `--env` value that is a URL) is loopback;[^safety]
- `--home <dir>` is an isolated home, not the real one or a folder that holds it;[^safety]
- the target says it is a mock: `--mock "<loopback url> <key>=<value>"` (the mock of the first adopter, the app Ouro AX was first measured on, answers `GET /api/state` with `"mock": true`), or your own `--guard "<command>"`, which must exit 0 before anything runs;[^safety]
- no credential reaches it: it builds the checked program's environment from `PATH`, `LANG`, `TERM`, `TZ` and `TMPDIR`, the isolated `HOME`, and the `--env` values, and refuses an `--env` whose name looks like a token, secret, password or key.[^safety]

Without that proof it runs the reads and skips every call other people would see, and the report says which proof was missing.[^conformance]

## The inventory: coverage you can trust

A report only proves the surfaces it covered. `--inventory <file>` names the surfaces your interface registers, generated from its own registration rather than written by hand:

```json
{ "cli": ["look", "send", "watch"], "http": ["GET /api/state", "POST /api/agent-actions"], "mcp": ["look"] }
```

The X-ray compares the inventory with what it covered, the commands in `help --json`, the routes in the manifest and the tools in tools/list, and fails `cli.inventory`, `http.inventory` or `mcp.inventory` on a surface missing from either side or listed twice.[^inventory]

## Conformance

With `--conformance` (which needs `--inventory`), the X-ray exits 0 only when the interface conforms: every applicable `must` claim holds, none was skipped for want of a sample or a proof, and the inventory covers every surface it checked.[^conformance] Without it, the X-ray exits 1 when a `must` claim fails, and 0 otherwise.[^exit] A usage error or a guard that refuses exits 2.[^exit]

## The report

The report pins what it checked: the claim set's version and SHA-256 hash, the X-ray's version, and `--commit <sha>`.[^pin] It lists the safety proof, the effects it caused, and every claim with how many surfaces hold it, then the failures with the fix.[^report] `--json` prints it as data; `--md <file>` and `--html <file>` also write it as a page, with a grid of every surface against every claim.[^report]

## Flows check what a task needs

The X-ray checks the rules a command must keep. It can't tell that a task's next call needs a ref the text left out, or that the fix for `--week` drops the week. On the first adopter's main branch, the same commit the X-ray called conformant failed 30 of 593 scripted flow checks.[^flows] Run your own flows beside it with `ax-flows`, and attach the X-ray's report to theirs (`--xray xray.json`), so one `report.json` covers both ([the guide](ax.md#agent-flows-in-ci)).

## In CI

Run it against your mock, with the inventory your build generates, and keep the report:

```yaml
- name: Ouro AX X-ray
  run: |
    node scripts/inventory.mjs > inventory.json   # from your command table and router
    node lib/ouro/ax/xray.ts --cli "node bin/tool.mjs" --http "$MOCK_URL" --routes routes.json \
      --inventory inventory.json --conformance --home "$RUNNER_TEMP/xray-home" --guard "node scripts/assert-mock.mjs" \
      --env "TOOL_URL=$MOCK_URL" --state "log --json" --commit "$GITHUB_SHA" --json --md xray.md > xray.json
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: ax-xray
    path: |
      xray.json
      xray.md
      inventory.json
```

## Reading a failure

Each failing check names the call it made and what came back, then the claim's fix:[^effects]

```text
✗ cli.unknown-flag [must] An unknown flag fails before anything runs, and the error names the flag. (0 of 2)
    rooms: `bad rooms --ax-xray-no-such-flag --json` → exit 0; stdout: {"rooms":[{"ref":"r1"}]}: the flag was ignored
    Fix: Check every flag against the command's declared flags before acting; refuse an unknown one with the usage exit code.
```

[^cli]: test:registry/ouro/ax/xray.test.mts::the kit's example tool conforms, and the X-ray acts on nothing; test:registry/ouro/ax/xray.test.mts::a CLI that breaks the claims fails them, each with what it saw verify:testExists(registry/ouro/ax/xray.test.mts::the kit's example tool conforms, and the X-ray acts on nothing) verify:testExists(registry/ouro/ax/xray.test.mts::a CLI that breaks the claims fails them, each with what it saw)
[^http]: test:registry/ouro/ax/xray.test.mts::an HTTP API: JSON, one error shape, an index, errors that teach, refusals that change nothing, its inventory verify:testExists(registry/ouro/ax/xray.test.mts::an HTTP API: JSON, one error shape, an index, errors that teach, refusals that change nothing, its inventory)
[^mcp]: test:registry/ouro/ax/xray.test.mts::an MCP server: listed tools, annotations, a bad call refused naming the argument, an unknown tool, its inventory verify:testExists(registry/ouro/ax/xray.test.mts::an MCP server: listed tools, annotations, a bad call refused naming the argument, an unknown tool, its inventory)
[^exit]: test:registry/ouro/ax/xray.test.mts::the command: claims, help, usage errors with the fix, exit codes, written reports verify:testExists(registry/ouro/ax/xray.test.mts::the command: claims, help, usage errors with the fix, exit codes, written reports)
[^report]: test:registry/ouro/ax/xray.test.mts::the reports: Markdown and HTML list every claim and surface verify:testExists(registry/ouro/ax/xray.test.mts::the reports: Markdown and HTML list every claim and surface)
[^outside]: test:registry/ouro/ax/xray.test.mts::the kit's example tool conforms, and the X-ray acts on nothing verify:testExists(registry/ouro/ax/xray.test.mts::the kit's example tool conforms, and the X-ray acts on nothing)
[^effects]: test:registry/ouro/ax/xray.test.mts::a CLI that breaks the claims fails them, each with what it saw verify:testExists(registry/ouro/ax/xray.test.mts::a CLI that breaks the claims fails them, each with what it saw)
[^safety]: test:registry/ouro/ax/xray.test.mts::checkSafety fails closed: a remote address, the real home, a credential, a wrong or missing mock; test:registry/ouro/ax/xray.test.mts::without proof of a mock, nothing other people see is called, and it does not conform verify:testExists(registry/ouro/ax/xray.test.mts::checkSafety fails closed: a remote address, the real home, a credential, a wrong or missing mock) verify:testExists(registry/ouro/ax/xray.test.mts::without proof of a mock, nothing other people see is called, and it does not conform)
[^inventory]: test:registry/ouro/ax/xray.test.mts::compareInventory names what is missing, unknown or listed twice; test:registry/ouro/ax/xray.test.mts::an HTTP API: JSON, one error shape, an index, errors that teach, refusals that change nothing, its inventory verify:testExists(registry/ouro/ax/xray.test.mts::compareInventory names what is missing, unknown or listed twice) verify:testExists(registry/ouro/ax/xray.test.mts::an HTTP API: JSON, one error shape, an index, errors that teach, refusals that change nothing, its inventory)
[^conformance]: test:registry/ouro/ax/xray.test.mts::the kit's example tool conforms, and the X-ray acts on nothing; test:registry/ouro/ax/xray.test.mts::the command: claims, help, usage errors with the fix, exit codes, written reports verify:testExists(registry/ouro/ax/xray.test.mts::the kit's example tool conforms, and the X-ray acts on nothing) verify:testExists(registry/ouro/ax/xray.test.mts::the command: claims, help, usage errors with the fix, exit codes, written reports)
[^v13]: test:registry/ouro/ax/xray.test.mts::a voice in a pipe or --json, text without its refs, an unlisted command, long help, an unnamed audience, a closed pipe verify:testExists(registry/ouro/ax/xray.test.mts::a voice in a pipe or --json, text without its refs, an unlisted command, long help, an unnamed audience, a closed pipe)
[^flows]: evidence:docs/decisions/2026-10-30-ouro-ax/evidence/agent-flow-review.md verify:fileLine(docs/decisions/2026-10-30-ouro-ax/evidence/agent-flow-review.md, /593 checks, 30 failing/)
[^pin]: test:registry/ouro/ax/xray.test.mts::the kit's example tool conforms, and the X-ray acts on nothing verify:testExists(registry/ouro/ax/xray.test.mts::the kit's example tool conforms, and the X-ray acts on nothing)
