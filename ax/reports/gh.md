# AX X-ray: gh

Ouro AX standard 0.1.0, checked by ax-xray at 2026-10-30T22:06:54.837Z. Target: CLI `gh` (41 commands, 45 calls).

Claims holding: **4 of 11** (must: 4 of 9). Checks: 75 pass, 16 fail, 1 skipped. Score **82.4%**.

| | Claim | Severity | Rule | Pass | Fail | Skip |
|---|---|---|---|---|---|---|
| ✗ | `cli.help-parses` | must | `<cli> help --json` prints one JSON document that names every command. | 0 | 1 | 0 |
| ✗ | `cli.help-effects` | must | Help says who sees each command: only the person, or other people. | 0 | 1 | 0 |
| ✗ | `cli.exit-codes` | must | Exit codes are documented, and every exit code the CLI gives is one of them. | 0 | 1 | 0 |
| ✗ | `cli.one-line-error` | must | Every error is one line on stderr, with nothing on stdout. | 0 | 1 | 0 |
| – | `cli.reads-stay-reads` | must | Reads change nothing. | 0 | 0 | 1 |
| ✗ | `cli.help-width` | should | No help line is wider than the width limit (100 columns by default). | 31 | 11 | 0 |
| ✗ | `cli.overview-short` | should | The overview (`--help`) fits one screen: at most 60 lines. | 0 | 1 | 0 |
| ✓ | `cli.command-help` | must | Every command answers `<command> --help` with exit 0 on stdout, and nothing on stderr. | 41 | 0 | 0 |
| ✓ | `cli.unknown-command` | must | An unknown command fails with the usage exit code and lists the commands. | 1 | 0 | 0 |
| ✓ | `cli.error-teaches` | must | Every error names a next action: a command to run or a flag to add. | 1 | 0 | 0 |
| ✓ | `cli.no-stack-trace` | must | No call prints a stack trace. | 1 | 0 | 0 |

## What fails, and the fix

### `cli.help-parses`: `<cli> help --json` prints one JSON document that names every command.

Why: An agent learns the interface from the interface. Help that parses lets it list commands without scraping prose. Source: Ouro UI 2026-10-11 CLI kit: help that parses; Tandem P15.

Fix: Keep help as data (a COMMANDS table) and print it with `help --json`: { commands: [{ name, effect, summary, usage[] }], exitCodes: [{ code, meaning }] }.

- **help**: `gh --help --json` → exit 1; stderr: unknown flag: --json

### `cli.help-effects`: Help says who sees each command: only the person, or other people.

Why: The one thing an agent must know before acting is whether other people will see it. Source: Tandem P1, P2.

Fix: Add `effect: "private" | "others"` to every command in help JSON, from one action catalog, and group the text help under two headings.

- **help**: no help JSON, so no command says who sees it

### `cli.exit-codes`: Exit codes are documented, and every exit code the CLI gives is one of them.

Why: Stable, documented exit codes let an agent branch without parsing prose. Source: Ouro UI 2026-10-11 CLI kit: stable exit codes.

Fix: Keep one exit-code table, print it in help and help JSON, and exit only with codes from it.

- **help**: no exit codes in help --json or an `Exit codes:` line

### `cli.one-line-error`: Every error is one line on stderr, with nothing on stdout.

Why: One line is cheap to read and easy to quote back; stdout stays parseable. Source: Tandem P7.

Fix: Catch errors at the entry point and print one line to stderr.

- **ax-xray-no-such-command**: `gh ax-xray-no-such-command` → exit 1; stderr: unknown command "ax-xray-no-such-command" for "gh" (63 stderr lines, 0 stdout lines)

### `cli.help-width`: No help line is wider than the width limit (100 columns by default).

Why: Long lines wrap unpredictably in terminals and transcripts and cost tokens to re-read. Source: Tandem src/cli/help.ts WIDTH.

Fix: Wrap help at one width in the help renderer, not by hand.

- **--help**: 1 lines over 100 columns, first:   status:        Print information about relevant issues, pull requests, and notifications across repositories
- **browse --help**: 1 lines over 100 columns, first (111):   -c, --commit string[="last"]   Select another commit by passing in the commit SHA, default is the last commit
- **agent-task --help**: 1 lines over 100 columns, first (109):   - by URL, e.g. "https://github.com/OWNER/REPO/pull/123/agent-sessions/12345abc-12345-12345-12345-12345abc";
- **api --help**: 3 lines over 100 columns, first (131):   -F, --field key=value          Add a typed parameter in key=value format (use "@<path>" or "@-" to read value from file or stdin)
- **config --help**: 9 lines over 100 columns, first (190): - `api_host`: experimental: the hostname to use when making API requests for a GitHub host. Note: this is not a security boundary and reque…
- **copilot --help**: 1 lines over 100 columns, first (103): If the Copilot CLI is not installed, it will be downloaded to /Users/microsoft/.local/share/gh/copilot.
- **search --help**: 4 lines over 100 columns, first (116): command line arguments to avoid the hyphen being interpreted as a command line flag because it begins with a hyphen.
- **status --help**: 1 lines over 100 columns, first (124): The status command prints information about your work on GitHub across all the repositories you're subscribed to, including:
- **environment --help**: 5 lines over 100 columns, first (104): a command targets either `github.com` or a subdomain of `ghe.com`. Setting this avoids being prompted to
- **formatting --help**: 4 lines over 100 columns, first (101): In addition to the Go template functions in the standard library, the following functions can be used
- **reference --help**: 99 lines over 100 columns, first (111):   -a, --custom-agent string   Use a custom agent for the task. e.g., use 'my-agent' for the 'my-agent.md' agent

### `cli.overview-short`: The overview (`--help`) fits one screen: at most 60 lines.

Why: The overview is read on every cold start; details belong on each command's page. Source: Tandem OVERVIEW_MAX_LINES.

Fix: Keep one line per command in the overview and move details to `<command> --help`.

- **--help**: 71 lines

## Every surface

| Surface | Holds | Fails |
|---|---|---|
| cli · help |  | `cli.help-parses` `cli.help-effects` `cli.exit-codes` |
| cli · --help |  | `cli.help-width` `cli.overview-short` |
| cli · auth | `cli.command-help` |  |
| cli · auth --help | `cli.help-width` |  |
| cli · browse | `cli.command-help` |  |
| cli · browse --help |  | `cli.help-width` |
| cli · codespace | `cli.command-help` |  |
| cli · codespace --help | `cli.help-width` |  |
| cli · discussion | `cli.command-help` |  |
| cli · discussion --help | `cli.help-width` |  |
| cli · gist | `cli.command-help` |  |
| cli · gist --help | `cli.help-width` |  |
| cli · issue | `cli.command-help` |  |
| cli · issue --help | `cli.help-width` |  |
| cli · org | `cli.command-help` |  |
| cli · org --help | `cli.help-width` |  |
| cli · pr | `cli.command-help` |  |
| cli · pr --help | `cli.help-width` |  |
| cli · project | `cli.command-help` |  |
| cli · project --help | `cli.help-width` |  |
| cli · release | `cli.command-help` |  |
| cli · release --help | `cli.help-width` |  |
| cli · repo | `cli.command-help` |  |
| cli · repo --help | `cli.help-width` |  |
| cli · skill | `cli.command-help` |  |
| cli · skill --help | `cli.help-width` |  |
| cli · cache | `cli.command-help` |  |
| cli · cache --help | `cli.help-width` |  |
| cli · run | `cli.command-help` |  |
| cli · run --help | `cli.help-width` |  |
| cli · workflow | `cli.command-help` |  |
| cli · workflow --help | `cli.help-width` |  |
| cli · co | `cli.command-help` |  |
| cli · co --help | `cli.help-width` |  |
| cli · agent-task | `cli.command-help` |  |
| cli · agent-task --help |  | `cli.help-width` |
| cli · alias | `cli.command-help` |  |
| cli · alias --help | `cli.help-width` |  |
| cli · api | `cli.command-help` |  |
| cli · api --help |  | `cli.help-width` |
| cli · attestation | `cli.command-help` |  |
| cli · attestation --help | `cli.help-width` |  |
| cli · completion | `cli.command-help` |  |
| cli · completion --help | `cli.help-width` |  |
| cli · config | `cli.command-help` |  |
| cli · config --help |  | `cli.help-width` |
| cli · copilot | `cli.command-help` |  |
| cli · copilot --help |  | `cli.help-width` |
| cli · extension | `cli.command-help` |  |
| cli · extension --help | `cli.help-width` |  |
| cli · gpg-key | `cli.command-help` |  |
| cli · gpg-key --help | `cli.help-width` |  |
| cli · label | `cli.command-help` |  |
| cli · label --help | `cli.help-width` |  |
| cli · licenses | `cli.command-help` |  |
| cli · licenses --help | `cli.help-width` |  |
| cli · preview | `cli.command-help` |  |
| cli · preview --help | `cli.help-width` |  |
| cli · ruleset | `cli.command-help` |  |
| cli · ruleset --help | `cli.help-width` |  |
| cli · search | `cli.command-help` |  |
| cli · search --help |  | `cli.help-width` |
| cli · secret | `cli.command-help` |  |
| cli · secret --help | `cli.help-width` |  |
| cli · ssh-key | `cli.command-help` |  |
| cli · ssh-key --help | `cli.help-width` |  |
| cli · status | `cli.command-help` |  |
| cli · status --help |  | `cli.help-width` |
| cli · variable | `cli.command-help` |  |
| cli · variable --help | `cli.help-width` |  |
| cli · actions | `cli.command-help` |  |
| cli · actions --help | `cli.help-width` |  |
| cli · environment | `cli.command-help` |  |
| cli · environment --help |  | `cli.help-width` |
| cli · exit-codes | `cli.command-help` |  |
| cli · exit-codes --help | `cli.help-width` |  |
| cli · formatting | `cli.command-help` |  |
| cli · formatting --help |  | `cli.help-width` |
| cli · mintty | `cli.command-help` |  |
| cli · mintty --help | `cli.help-width` |  |
| cli · reference | `cli.command-help` |  |
| cli · reference --help |  | `cli.help-width` |
| cli · telemetry | `cli.command-help` |  |
| cli · telemetry --help | `cli.help-width` |  |
| cli · ax-xray-no-such-command | `cli.unknown-command` `cli.error-teaches` | `cli.one-line-error` |
| cli · state |  |  |
| cli · all 45 calls | `cli.no-stack-trace` |  |
