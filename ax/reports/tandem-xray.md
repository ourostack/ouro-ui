# AX X-ray: m365tandem

Ouro AX standard 0.1.0, checked by ax-xray at 2026-10-30T21:53:23.055Z. Target: at teams-microsoft/tandem@4f683e54 (branch ax-probe/xray); CLI `m365tandem` (39 commands, 144 calls); HTTP http://127.0.0.1:59282 (131 routes in the manifest, 100 requests).

Claims holding: **26 of 29** (must: 23 of 26). Checks: 512 pass, 5 fail, 0 skipped. Score **99%**.

| | Claim | Severity | Rule | Pass | Fail | Skip |
|---|---|---|---|---|---|---|
| ✗ | `http.error-teaches` | must | Every error names a next action: a route, a field, or a command. | 33 | 2 | 0 |
| ✗ | `http.wrong-ref-first` | must | A route given an id that does not exist fails and says where to get a right one. | 17 | 2 | 0 |
| ✗ | `cli.read-json` | must | Every read takes `--json` and prints exactly one JSON document (a stream prints JSON lines), exits 0 and writes nothing to stderr. | 26 | 1 | 0 |
| ✓ | `cli.help-parses` | must | `<cli> help --json` prints one JSON document that names every command. | 1 | 0 | 0 |
| ✓ | `cli.help-effects` | must | Help says who sees each command: only the person, or other people. | 39 | 0 | 0 |
| ✓ | `cli.command-help` | must | Every command answers `<command> --help` with exit 0 on stdout, and nothing on stderr. | 39 | 0 | 0 |
| ✓ | `cli.exit-codes` | must | Exit codes are documented, and every exit code the CLI gives is one of them. | 1 | 0 | 0 |
| ✓ | `cli.unknown-command` | must | An unknown command fails with the usage exit code and lists the commands. | 1 | 0 | 0 |
| ✓ | `cli.unknown-flag` | must | An unknown flag fails before anything runs, and the error names the flag. | 44 | 0 | 0 |
| ✓ | `cli.missing-arg` | must | A command missing a required argument fails with the usage exit code and says what to give. | 4 | 0 | 0 |
| ✓ | `cli.one-line-error` | must | Every error is one line on stderr, with nothing on stdout. | 51 | 0 | 0 |
| ✓ | `cli.error-teaches` | must | Every error names a next action: a command to run or a flag to add. | 51 | 0 | 0 |
| ✓ | `cli.no-stack-trace` | must | No call prints a stack trace. | 1 | 0 | 0 |
| ✓ | `cli.ambiguous-verbs` | must | Ambiguous verbs (edit, delete, remove) don't act; they answer with the specific commands. | 3 | 0 | 0 |
| ✓ | `cli.others-need-why` | must | Every command other people see refuses to run without `--why`, and says so. | 8 | 0 | 0 |
| ✓ | `cli.wrong-ref-first` | must | A wrong reference fails before anything reaches anyone, and the error says where to get a right one. | 8 | 0 | 0 |
| ✓ | `cli.others-preview` | must | Every command other people see has a preview that acts on nothing (`--dry-run`) and names who will see it. | 8 | 0 | 0 |
| ✓ | `cli.reads-stay-reads` | must | Reads change nothing. | 1 | 0 | 0 |
| ✓ | `cli.refusals-change-nothing` | must | A refused call changes nothing, except an audit record that says it was refused. | 8 | 0 | 0 |
| ✓ | `http.json` | must | Every route answers JSON, with a JSON content type. | 62 | 0 | 0 |
| ✓ | `http.error-shape` | must | Every error is a JSON object with a string `error`. | 35 | 0 | 0 |
| ✓ | `http.index` | must | The API's base path answers an index of its routes. | 1 | 0 | 0 |
| ✓ | `http.unknown-route` | must | An unknown route answers 404 and says where the routes are listed. | 1 | 0 | 0 |
| ✓ | `http.others-need-why` | must | Every route that does what other people see refuses a request without a why, and names the field. | 5 | 0 | 0 |
| ✓ | `http.reads-stay-reads` | must | GET requests change nothing. | 1 | 0 | 0 |
| ✓ | `http.refusals-change-nothing` | must | A refused request changes nothing, except an audit record that says it was refused. | 5 | 0 | 0 |
| ✓ | `cli.help-width` | should | No help line is wider than the width limit (100 columns by default). | 40 | 0 | 0 |
| ✓ | `cli.overview-short` | should | The overview (`--help`) fits one screen: at most 60 lines. | 1 | 0 | 0 |
| ✓ | `cli.flag-suggest` | should | A misspelt flag's error names the closest real flag. | 17 | 0 | 0 |

## What fails, and the fix

### `http.error-teaches`: Every error names a next action: a route, a field, or a command.

Why: `not found` alone leaves the agent guessing. Source: Tandem P7.

Fix: Say where to go: `no such conversation; GET /api/conversations lists them`.

- **GET /api/resolve**: "link-form" names no route, flag or command
- **GET /api/agent-actions/{id}**: "no such action" names no route, flag or command

### `http.wrong-ref-first`: A route given an id that does not exist fails and says where to get a right one.

Why: Checking before acting keeps a stale id from becoming a wrong write. Source: Tandem P8.

Fix: On a miss, name the route that lists valid ids.

- **GET /api/drafts/{id}**: `GET /api/drafts/axxraynoref` → 200 {"conversationId":"axxraynoref","draft":{"text":"","spans":[],"version":0,"updatedAt":null,"updatedBy":null,"readiness":"drafting","readinessBy":null,"readines…
- **GET /api/agent-actions/{id}**: `GET /api/agent-actions/axxraynoref` → 404 {"error":"no such action"}

### `cli.read-json`: Every read takes `--json` and prints exactly one JSON document (a stream prints JSON lines), exits 0 and writes nothing to stderr.

Why: One parseable answer per call is the cheapest thing for an agent to consume. Source: Ouro UI 2026-10-11 CLI kit: one definition gives human output and --json; Tandem help: --json on every read.

Fix: Give the read a `--json` that prints the same data the text shows, as one document.

- **draft**: `m365tandem draft show --json` → exit 1; stderr: m365tandem: the person has no conversation open right now. Name one instead: its [id] from "m365tandem conversations".

## Every surface

| Surface | Holds | Fails |
|---|---|---|
| cli · help | `cli.help-parses` `cli.help-effects` `cli.command-help` `cli.read-json` `cli.unknown-flag` |  |
| cli · today | `cli.help-effects` `cli.command-help` `cli.read-json` `cli.unknown-flag` |  |
| cli · activity | `cli.help-effects` `cli.command-help` `cli.read-json` `cli.unknown-flag` |  |
| cli · status | `cli.help-effects` `cli.command-help` `cli.read-json` `cli.unknown-flag` |  |
| cli · update | `cli.help-effects` `cli.command-help` `cli.read-json` `cli.unknown-flag` |  |
| cli · conversations | `cli.help-effects` `cli.command-help` `cli.read-json` `cli.unknown-flag` |  |
| cli · look | `cli.help-effects` `cli.command-help` `cli.read-json` `cli.unknown-flag` |  |
| cli · emoji | `cli.help-effects` `cli.command-help` `cli.read-json` `cli.unknown-flag` |  |
| cli · people | `cli.help-effects` `cli.command-help` `cli.read-json` `cli.unknown-flag` |  |
| cli · folders | `cli.help-effects` `cli.command-help` `cli.read-json` `cli.unknown-flag` |  |
| cli · teams | `cli.help-effects` `cli.command-help` `cli.read-json` `cli.unknown-flag` |  |
| cli · apps | `cli.help-effects` `cli.command-help` `cli.read-json` `cli.unknown-flag` |  |
| cli · focus | `cli.help-effects` `cli.command-help` `cli.read-json` `cli.unknown-flag` |  |
| cli · show | `cli.help-effects` `cli.command-help` `cli.missing-arg` |  |
| cli · search | `cli.help-effects` `cli.command-help` `cli.read-json` `cli.unknown-flag` |  |
| cli · attention | `cli.help-effects` `cli.command-help` `cli.read-json` `cli.unknown-flag` |  |
| cli · agenda | `cli.help-effects` `cli.command-help` `cli.read-json` `cli.unknown-flag` |  |
| cli · calendar | `cli.help-effects` `cli.command-help` `cli.read-json` `cli.unknown-flag` |  |
| cli · matters | `cli.help-effects` `cli.command-help` `cli.read-json` `cli.unknown-flag` |  |
| cli · categories | `cli.help-effects` `cli.command-help` `cli.read-json` `cli.unknown-flag` |  |
| cli · categorize | `cli.help-effects` `cli.command-help` `cli.missing-arg` |  |
| cli · meeting | `cli.help-effects` `cli.command-help` `cli.read-json` `cli.unknown-flag` |  |
| cli · transcript | `cli.help-effects` `cli.command-help` `cli.missing-arg` |  |
| cli · recordings | `cli.help-effects` `cli.command-help` `cli.read-json` `cli.unknown-flag` |  |
| cli · prep | `cli.help-effects` `cli.command-help` `cli.read-json` `cli.unknown-flag` |  |
| cli · note | `cli.help-effects` `cli.command-help` `cli.missing-arg` |  |
| cli · notes | `cli.help-effects` `cli.command-help` `cli.read-json` `cli.unknown-flag` |  |
| cli · draft | `cli.help-effects` `cli.command-help` `cli.unknown-flag` | `cli.read-json` |
| cli · layout | `cli.help-effects` `cli.command-help` `cli.read-json` `cli.unknown-flag` |  |
| cli · send | `cli.help-effects` `cli.command-help` `cli.others-need-why` `cli.wrong-ref-first` `cli.refusals-change-nothing` `cli.others-preview` |  |
| cli · reply | `cli.help-effects` `cli.command-help` `cli.others-need-why` `cli.wrong-ref-first` `cli.refusals-change-nothing` `cli.others-preview` |  |
| cli · react | `cli.help-effects` `cli.command-help` `cli.others-need-why` `cli.wrong-ref-first` `cli.refusals-change-nothing` `cli.others-preview` |  |
| cli · edit-sent | `cli.help-effects` `cli.command-help` `cli.others-need-why` `cli.wrong-ref-first` `cli.refusals-change-nothing` `cli.others-preview` |  |
| cli · delete-sent | `cli.help-effects` `cli.command-help` `cli.others-need-why` `cli.wrong-ref-first` `cli.refusals-change-nothing` `cli.others-preview` |  |
| cli · answer-invite | `cli.help-effects` `cli.command-help` `cli.others-need-why` `cli.wrong-ref-first` `cli.refusals-change-nothing` `cli.others-preview` |  |
| cli · join | `cli.help-effects` `cli.command-help` `cli.others-need-why` `cli.wrong-ref-first` `cli.refusals-change-nothing` `cli.others-preview` |  |
| cli · mark-read | `cli.help-effects` `cli.command-help` `cli.others-need-why` `cli.wrong-ref-first` `cli.refusals-change-nothing` `cli.others-preview` |  |
| cli · watch | `cli.help-effects` `cli.command-help` `cli.read-json` `cli.unknown-flag` |  |
| cli · log | `cli.help-effects` `cli.command-help` `cli.read-json` `cli.unknown-flag` |  |
| cli · --help | `cli.help-width` `cli.overview-short` |  |
| cli · today --help | `cli.help-width` |  |
| cli · activity --help | `cli.help-width` |  |
| cli · status --help | `cli.help-width` |  |
| cli · update --help | `cli.help-width` |  |
| cli · conversations --help | `cli.help-width` |  |
| cli · look --help | `cli.help-width` |  |
| cli · emoji --help | `cli.help-width` |  |
| cli · people --help | `cli.help-width` |  |
| cli · folders --help | `cli.help-width` |  |
| cli · teams --help | `cli.help-width` |  |
| cli · apps --help | `cli.help-width` |  |
| cli · focus --help | `cli.help-width` |  |
| cli · show --help | `cli.help-width` |  |
| cli · search --help | `cli.help-width` |  |
| cli · attention --help | `cli.help-width` |  |
| cli · agenda --help | `cli.help-width` |  |
| cli · calendar --help | `cli.help-width` |  |
| cli · matters --help | `cli.help-width` |  |
| cli · categories --help | `cli.help-width` |  |
| cli · categorize --help | `cli.help-width` |  |
| cli · meeting --help | `cli.help-width` |  |
| cli · transcript --help | `cli.help-width` |  |
| cli · recordings --help | `cli.help-width` |  |
| cli · prep --help | `cli.help-width` |  |
| cli · note --help | `cli.help-width` |  |
| cli · notes --help | `cli.help-width` |  |
| cli · draft --help | `cli.help-width` |  |
| cli · layout --help | `cli.help-width` |  |
| cli · send --help | `cli.help-width` |  |
| cli · reply --help | `cli.help-width` |  |
| cli · react --help | `cli.help-width` |  |
| cli · edit-sent --help | `cli.help-width` |  |
| cli · delete-sent --help | `cli.help-width` |  |
| cli · answer-invite --help | `cli.help-width` |  |
| cli · join --help | `cli.help-width` |  |
| cli · mark-read --help | `cli.help-width` |  |
| cli · watch --help | `cli.help-width` |  |
| cli · log --help | `cli.help-width` |  |
| cli · help --help | `cli.help-width` |  |
| cli · ax-xray-no-such-command | `cli.unknown-command` `cli.one-line-error` `cli.error-teaches` |  |
| cli · edit | `cli.ambiguous-verbs` `cli.one-line-error` `cli.error-teaches` |  |
| cli · delete | `cli.ambiguous-verbs` `cli.one-line-error` `cli.error-teaches` |  |
| cli · remove | `cli.ambiguous-verbs` `cli.one-line-error` `cli.error-teaches` |  |
| cli · show (no argument) | `cli.one-line-error` `cli.error-teaches` |  |
| cli · categorize (no argument) | `cli.one-line-error` `cli.error-teaches` |  |
| cli · transcript (no argument) | `cli.one-line-error` `cli.error-teaches` |  |
| cli · note (no argument) | `cli.one-line-error` `cli.error-teaches` |  |
| cli · today --ax-xray-no-such-flag | `cli.one-line-error` `cli.error-teaches` |  |
| cli · activity --ax-xray-no-such-flag | `cli.one-line-error` `cli.error-teaches` |  |
| cli · activity --allx | `cli.unknown-flag` `cli.flag-suggest` |  |
| cli · status --ax-xray-no-such-flag | `cli.one-line-error` `cli.error-teaches` |  |
| cli · update --ax-xray-no-such-flag | `cli.one-line-error` `cli.error-teaches` |  |
| cli · conversations --ax-xray-no-such-flag | `cli.one-line-error` `cli.error-teaches` |  |
| cli · conversations --limt | `cli.unknown-flag` `cli.flag-suggest` |  |
| cli · emoji --ax-xray-no-such-flag | `cli.one-line-error` `cli.error-teaches` |  |
| cli · emoji --limt | `cli.unknown-flag` `cli.flag-suggest` |  |
| cli · folders --ax-xray-no-such-flag | `cli.one-line-error` `cli.error-teaches` |  |
| cli · folders --allx | `cli.unknown-flag` `cli.flag-suggest` |  |
| cli · teams --ax-xray-no-such-flag | `cli.one-line-error` `cli.error-teaches` |  |
| cli · teams --hiddn | `cli.unknown-flag` `cli.flag-suggest` |  |
| cli · apps --ax-xray-no-such-flag | `cli.one-line-error` `cli.error-teaches` |  |
| cli · apps --lookp | `cli.unknown-flag` `cli.flag-suggest` |  |
| cli · focus --ax-xray-no-such-flag | `cli.one-line-error` `cli.error-teaches` |  |
| cli · attention --ax-xray-no-such-flag | `cli.one-line-error` `cli.error-teaches` |  |
| cli · attention --allx | `cli.unknown-flag` `cli.flag-suggest` |  |
| cli · agenda --ax-xray-no-such-flag | `cli.one-line-error` `cli.error-teaches` |  |
| cli · calendar --ax-xray-no-such-flag | `cli.one-line-error` `cli.error-teaches` |  |
| cli · calendar --categry | `cli.unknown-flag` `cli.flag-suggest` |  |
| cli · matters --ax-xray-no-such-flag | `cli.one-line-error` `cli.error-teaches` |  |
| cli · matters --seris | `cli.unknown-flag` `cli.flag-suggest` |  |
| cli · categories --ax-xray-no-such-flag | `cli.one-line-error` `cli.error-teaches` |  |
| cli · recordings --ax-xray-no-such-flag | `cli.one-line-error` `cli.error-teaches` |  |
| cli · recordings --sine | `cli.unknown-flag` `cli.flag-suggest` |  |
| cli · prep --ax-xray-no-such-flag | `cli.one-line-error` `cli.error-teaches` |  |
| cli · draft --ax-xray-no-such-flag | `cli.one-line-error` `cli.error-teaches` |  |
| cli · draft --abot | `cli.unknown-flag` `cli.flag-suggest` |  |
| cli · layout --ax-xray-no-such-flag | `cli.one-line-error` `cli.error-teaches` |  |
| cli · layout --brif | `cli.unknown-flag` `cli.flag-suggest` |  |
| cli · watch --ax-xray-no-such-flag | `cli.one-line-error` `cli.error-teaches` |  |
| cli · watch --aftr | `cli.unknown-flag` `cli.flag-suggest` |  |
| cli · log --ax-xray-no-such-flag | `cli.one-line-error` `cli.error-teaches` |  |
| cli · log --limt | `cli.unknown-flag` `cli.flag-suggest` |  |
| cli · help --ax-xray-no-such-flag | `cli.one-line-error` `cli.error-teaches` |  |
| cli · look --ax-xray-no-such-flag | `cli.one-line-error` `cli.error-teaches` |  |
| cli · look --limt | `cli.unknown-flag` `cli.flag-suggest` |  |
| cli · people --ax-xray-no-such-flag | `cli.one-line-error` `cli.error-teaches` |  |
| cli · search --ax-xray-no-such-flag | `cli.one-line-error` `cli.error-teaches` |  |
| cli · search --limt | `cli.unknown-flag` `cli.flag-suggest` |  |
| cli · meeting --ax-xray-no-such-flag | `cli.one-line-error` `cli.error-teaches` |  |
| cli · meeting --freh | `cli.unknown-flag` `cli.flag-suggest` |  |
| cli · notes --ax-xray-no-such-flag | `cli.one-line-error` `cli.error-teaches` |  |
| cli · 27 reads, their flag probes and the missing-argument probes | `cli.reads-stay-reads` |  |
| cli · send (no --why) | `cli.one-line-error` `cli.error-teaches` |  |
| cli · send (wrong ref) | `cli.one-line-error` `cli.error-teaches` |  |
| cli · reply (no --why) | `cli.one-line-error` `cli.error-teaches` |  |
| cli · reply (wrong ref) | `cli.one-line-error` `cli.error-teaches` |  |
| cli · react (no --why) | `cli.one-line-error` `cli.error-teaches` |  |
| cli · react (wrong ref) | `cli.one-line-error` `cli.error-teaches` |  |
| cli · edit-sent (no --why) | `cli.one-line-error` `cli.error-teaches` |  |
| cli · edit-sent (wrong ref) | `cli.one-line-error` `cli.error-teaches` |  |
| cli · delete-sent (no --why) | `cli.one-line-error` `cli.error-teaches` |  |
| cli · delete-sent (wrong ref) | `cli.one-line-error` `cli.error-teaches` |  |
| cli · answer-invite (no --why) | `cli.one-line-error` `cli.error-teaches` |  |
| cli · answer-invite (wrong ref) | `cli.one-line-error` `cli.error-teaches` |  |
| cli · join (no --why) | `cli.one-line-error` `cli.error-teaches` |  |
| cli · join (wrong ref) | `cli.one-line-error` `cli.error-teaches` |  |
| cli · mark-read (no --why) | `cli.one-line-error` `cli.error-teaches` |  |
| cli · mark-read (wrong ref) | `cli.one-line-error` `cli.error-teaches` |  |
| cli · all 144 calls | `cli.no-stack-trace` `cli.exit-codes` |  |
| http · GET /api | `http.index` |  |
| http · GET /api/ax-xray-no-such-route | `http.unknown-route` `http.error-shape` `http.error-teaches` |  |
| http · GET /api/health | `http.json` |  |
| http · GET /api/update | `http.json` |  |
| http · GET /api/state | `http.json` |  |
| http · GET /api/freshness | `http.json` |  |
| http · GET /api/conversations | `http.json` |  |
| http · GET /api/conversations/{id} | `http.json` `http.wrong-ref-first` `http.error-shape` `http.error-teaches` |  |
| http · GET /api/conversations/{id}/messages | `http.json` `http.wrong-ref-first` `http.error-shape` `http.error-teaches` |  |
| http · GET /api/conversations/{id}/artifacts | `http.json` `http.wrong-ref-first` `http.error-shape` `http.error-teaches` |  |
| http · GET /api/conversations/{id}/transcript | `http.json` `http.wrong-ref-first` `http.error-shape` `http.error-teaches` |  |
| http · GET /api/focus | `http.json` |  |
| http · GET /api/drafts | `http.json` |  |
| http · GET /api/drafts/{id} | `http.json` | `http.wrong-ref-first` |
| http · GET /api/log | `http.json` |  |
| http · GET /api/callbacks | `http.json` `http.error-shape` `http.error-teaches` |  |
| http · GET /api/search | `http.json` |  |
| http · GET /api/resolve | `http.json` `http.error-shape` | `http.error-teaches` |
| http · GET /api/layout | `http.json` |  |
| http · GET /api/layout/catalog | `http.json` |  |
| http · GET /api/layout/list | `http.json` |  |
| http · GET /api/usage | `http.json` |  |
| http · GET /api/layout/v3 | `http.json` |  |
| http · GET /api/settings | `http.json` |  |
| http · GET /api/actions | `http.json` |  |
| http · GET /api/agent-actions | `http.json` `http.error-shape` `http.error-teaches` |  |
| http · GET /api/agent-actions/{id} | `http.json` `http.error-shape` | `http.wrong-ref-first` `http.error-teaches` |
| http · GET /api/activity | `http.json` |  |
| http · GET /api/activity/seen/{id} | `http.json` `http.wrong-ref-first` `http.error-shape` `http.error-teaches` |  |
| http · GET /api/activity/seen-work | `http.json` `http.error-shape` `http.error-teaches` |  |
| http · GET /api/attention | `http.json` |  |
| http · GET /api/prep | `http.json` |  |
| http · GET /api/prep/{id} | `http.json` `http.wrong-ref-first` `http.error-shape` `http.error-teaches` |  |
| http · GET /api/agenda | `http.json` |  |
| http · GET /api/meetings | `http.json` |  |
| http · GET /api/meetings/{id} | `http.json` `http.wrong-ref-first` `http.error-shape` `http.error-teaches` |  |
| http · GET /api/meetings/{id}/recap | `http.json` `http.wrong-ref-first` `http.error-shape` `http.error-teaches` |  |
| http · GET /api/meetings/{id}/transcript | `http.json` `http.wrong-ref-first` `http.error-shape` `http.error-teaches` |  |
| http · GET /api/meetings/{id}/notes | `http.json` `http.wrong-ref-first` `http.error-shape` `http.error-teaches` |  |
| http · GET /api/recordings | `http.json` |  |
| http · GET /api/recordings/{ref} | `http.json` `http.wrong-ref-first` `http.error-shape` `http.error-teaches` |  |
| http · GET /api/calendar | `http.json` |  |
| http · GET /api/matters | `http.json` |  |
| http · GET /api/matters/proposals | `http.json` |  |
| http · GET /api/categories | `http.json` |  |
| http · GET /api/calendar/categorize | `http.json` `http.error-shape` `http.error-teaches` |  |
| http · GET /api/calendar/categorize/{id} | `http.json` `http.wrong-ref-first` `http.error-shape` `http.error-teaches` |  |
| http · GET /api/people | `http.json` |  |
| http · GET /api/people/presence | `http.json` |  |
| http · GET /api/people/avatars | `http.json` |  |
| http · GET /api/folders | `http.json` |  |
| http · GET /api/teams | `http.json` |  |
| http · GET /api/apps | `http.json` |  |
| http · GET /api/untitled | `http.json` |  |
| http · GET /api/emoji | `http.json` |  |
| http · GET /api/emoji/status | `http.json` |  |
| http · GET /api/emoji/catalog | `http.json` `http.error-shape` `http.error-teaches` |  |
| http · GET /api/sync/fresh-work | `http.json` `http.error-shape` `http.error-teaches` |  |
| http · GET /api/sync/recap-work | `http.json` `http.error-shape` `http.error-teaches` |  |
| http · GET /api/sync/attendees | `http.json` |  |
| http · GET /api/sync/chat-work | `http.json` `http.error-shape` `http.error-teaches` |  |
| http · GET /api/sync/profile-work | `http.json` `http.error-shape` `http.error-teaches` |  |
| http · GET /api/sync/org-work | `http.json` `http.error-shape` `http.error-teaches` |  |
| http · GET /api/lifecycle | `http.json` |  |
| http · 70 GET requests | `http.reads-stay-reads` |  |
| http · POST /api/agent-actions (message.send) | `http.others-need-why` `http.wrong-ref-first` `http.refusals-change-nothing` |  |
| http · POST /api/agent-actions (message.send) (no why) | `http.error-shape` `http.error-teaches` |  |
| http · POST /api/agent-actions (message.send) (wrong ref) | `http.error-shape` `http.error-teaches` |  |
| http · POST /api/agent-actions (reaction.add) | `http.others-need-why` `http.wrong-ref-first` `http.refusals-change-nothing` |  |
| http · POST /api/agent-actions (reaction.add) (no why) | `http.error-shape` `http.error-teaches` |  |
| http · POST /api/agent-actions (reaction.add) (wrong ref) | `http.error-shape` `http.error-teaches` |  |
| http · POST /api/agent-actions (conversation.markRead) | `http.others-need-why` `http.wrong-ref-first` `http.refusals-change-nothing` |  |
| http · POST /api/agent-actions (conversation.markRead) (no why) | `http.error-shape` `http.error-teaches` |  |
| http · POST /api/agent-actions (conversation.markRead) (wrong ref) | `http.error-shape` `http.error-teaches` |  |
| http · POST /api/agent-actions (meeting.respond) | `http.others-need-why` `http.wrong-ref-first` `http.refusals-change-nothing` |  |
| http · POST /api/agent-actions (meeting.respond) (no why) | `http.error-shape` `http.error-teaches` |  |
| http · POST /api/agent-actions (meeting.respond) (wrong ref) | `http.error-shape` `http.error-teaches` |  |
| http · POST /api/meetings/{id}/join | `http.others-need-why` `http.wrong-ref-first` `http.refusals-change-nothing` |  |
| http · POST /api/meetings/{id}/join (no why) | `http.error-shape` `http.error-teaches` |  |
| http · POST /api/meetings/{id}/join (wrong ref) | `http.error-shape` `http.error-teaches` |  |
