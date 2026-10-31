# The Ouro AX evaluation

The X-ray says exactly whether a claim holds; only an agent evaluation says whether the claim matters ([the claims](ax-standard.md)). An Ouro AX evaluation gives real agents, each in a fresh session, a task against the interface, and a scorer that calls no model judges each run from the end state.[^method] It is how a claim enters `must`. Ouro HX's agent-usability test measures components the same way: fresh agents, a fixed task, and a scorer that makes no model calls.[^hx]

## The method

1. **A mock with made-up data.** Each run gets a fresh copy of the interface's mock, with made-up fixtures, and a guard that refuses anything else.[^mock] Tandem's runner refuses a daemon that does not answer as its mock.[^mock]
2. **Real agents, fresh sessions.** Each run starts a new agent session with no plugins or skills of the host, the interface's own short agent guide, and permission to run only the interface (for a CLI, a shell rule such as `shell(m365tandem)`), never approve-all.[^agent]
3. **Tasks with an end state.** A task is a request a person would make, with a success rule over the mock's end state and the agent's answer. Tandem's five core tasks are a read, a draft handed back to the person, a send other people see, an edit whose obvious first try fails, and waiting for a reply.[^tasks]
4. **A scorer without a model.** The scorer reads the mock's log, drafts and messages after the run, and matches the answer with patterns. It counts success, calls, wrong turns (errors, repeats, undone calls and calls the allow-list denied), recoveries, help calls, tokens and wall time.[^metrics]
5. **Enough runs to see the difference.** Runs of the same task vary, so compare success first, then wrong turns, and treat a difference of a call or two as noise unless it holds over more runs.[^variance] For evidence that admits a claim, run each task at least three times per variant.

## Admitting a claim with it

1. Run the baseline: the interface as it is.
2. Find the failure in the runs: the call that went wrong, and why.
3. Write the claim that forbids it, and its check in `ax-xray`.
4. Fix the interface and run the same tasks again.
5. When the fix removes the failure, commit both runs' results and cite them in the claim's `evidence`.

The text-as-an-argument claim went this way: the baseline's sends and edits failed because text went in only on stdin and the allow-list refused the pipe, and with `--text` they passed.[^text]

## Publishing a run

Commit a run's `results.json` (every run's calls, answer and score) and `results.md` (the tables) as evidence, beside the claim or decision they support, as `docs/decisions/2026-10-30-ouro-ax/evidence/` does. The scorer can score saved end states again (`--rescore`), so a changed scoring rule is rerun over the same runs rather than new ones.[^rescore]

## Where the runner is

The reference runner is Tandem's `probe/ax-eval` (`run.ts`, `tasks.ts`, `serve.ts`), on its `ax-probe/eval` branch: it starts the mock, runs `agency copilot` per run under the locks one host shares, logs every interface call, and scores the end state.[^runner] Its method is the one above; another adopter writes its own tasks and mock, and keeps the rules: fresh sessions, only the interface allowed, a scorer that reads the end state rather than asking a model, and the results committed.

[^method]: evidence:docs/decisions/2026-10-30-ouro-ax/evidence/eval-method.md verify:fileLine(docs/decisions/2026-10-30-ouro-ax/evidence/eval-method.md, /a fresh mock tandem per run, and scoring from the end state/)
[^hx]: scripts/agent-usability/README.md verify:fileLine(scripts/agent-usability/README.md, /a scorer that makes no model calls judges every result the same way/)
[^mock]: evidence:docs/decisions/2026-10-30-ouro-ax/evidence/eval-method.md verify:fileLine(docs/decisions/2026-10-30-ouro-ax/evidence/eval-method.md, /re-checks the mock \(guard\.ts\)/)
[^agent]: evidence:docs/decisions/2026-10-30-ouro-ax/evidence/eval-method.md verify:fileLine(docs/decisions/2026-10-30-ouro-ax/evidence/eval-method.md, /agency copilot --no-config-plugins --session-id <new> -s --output-format json --allow-tool 'shell\(m365tandem\)'/)
[^tasks]: evidence:docs/decisions/2026-10-30-ouro-ax/evidence/eval-method.md verify:fileLine(docs/decisions/2026-10-30-ouro-ax/evidence/eval-method.md, /^\| T5 Wait \| "Tell me when someone replies/)
[^metrics]: evidence:docs/decisions/2026-10-30-ouro-ax/evidence/eval-method.md verify:fileLine(docs/decisions/2026-10-30-ouro-ax/evidence/eval-method.md, /^- \*\*Wrong turns\*\*: denied commands, plus calls that are any of/)
[^variance]: evidence:docs/decisions/2026-10-30-ouro-ax/evidence/eval-method.md verify:fileLine(docs/decisions/2026-10-30-ouro-ax/evidence/eval-method.md, /Treat a difference of one or two calls, or under about 30% in tokens, as noise/)
[^text]: evidence:docs/decisions/2026-10-30-ouro-ax/evidence/eval-baseline.md; evidence:docs/decisions/2026-10-30-ouro-ax/evidence/eval-after-440.md verify:fileLine(docs/decisions/2026-10-30-ouro-ax/evidence/eval-baseline.md, /\| T4 Recovery \(ambiguous verb: edit\) \| 0\/2 \|/) verify:fileLine(docs/decisions/2026-10-30-ouro-ax/evidence/eval-after-440.md, /\| T4 Recovery \(ambiguous verb: edit\) \| 2\/2 \|/)
[^rescore]: evidence:docs/decisions/2026-10-30-ouro-ax/evidence/eval-method.md verify:fileLine(docs/decisions/2026-10-30-ouro-ax/evidence/eval-method.md, /--rescore <out>/)
[^runner]: evidence:docs/decisions/2026-10-30-ouro-ax/evidence/eval-method.md verify:fileLine(docs/decisions/2026-10-30-ouro-ax/evidence/eval-method.md, /Code: branch `ax-probe\/eval` of teams-microsoft\/tandem, folder `probe\/ax-eval\/`/)
