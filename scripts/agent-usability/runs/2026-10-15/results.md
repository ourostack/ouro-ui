- Model: `claude-opus-5-5`, verified as the primary model in initialization and assistant messages for all 45 processes.
- Effort: `high` for every process.
- Agent: Claude Code `2.1.299`, started with the frozen runbook command, safe mode, bypass permissions, no session persistence and streaming JSON. The first `opus` request resolved to the same exact model; the other 44 requested its exact identifier.
- Web access: yes, for every arm.
- Skill read by every skill-arm agent: yes, 15/15, verified from successful tool results containing the original skill material, including Bash reads and read continuations, not prompt-string matches.
- shadcn CLI the skill-arm agents ran: `npx shadcn@latest`. Exact resolved versions were not retained per invocation. The pinned baseline installation versions are recorded separately in each arm manifest; this gap limits reproducibility.
- Anything that went wrong: this is an exploratory shared-host cohort, not a fully isolated causal ranking. All 45 agents issued outside-workspace scratch-write commands despite the workspace-only instruction. Five runs reported port conflicts, and 46 pairs of overlapping runs referenced a shared scratch path or fixed port. Forty-two runs issued name-based process-cleanup commands. These instruction and isolation problems are disclosed rather than repaired, excluded or converted into new scoring rules.
- Additional reported model usage: the CLI reported `claude-haiku-5-5` usage in ten runs, nine Ouro HX runs and one skill-arm run. All exposed primary assistant messages remained Opus 5.5; no exposed Task or Agent delegation calls were observed. The role of the additional reported usage is unverified.
- Concurrency: at most six fresh processes in total, with a measured peak of six. Every app started from its arm's one original baseline, outside Git, without inherited project instructions, hooks, plugins or MCP context.
- Retries and assistance: no process was replaced or retried, and no agent received controller corrections or extra library guidance. Agent-generated source was collected unchanged. All 45 CLI processes exited zero; that is not a passing UI score.
- Scoring: every resulting app is judged by the same frozen formula and checks in isolated Linux CI. Agent configuration changes are restored from the original arm record, and changed backend stand-ins receive the existing zero-score treatment. No local agent self-check is used as an official score. The formula does not grade operational safety or workspace-instruction adherence.
- Baseline qualification: all three known-good preflights scored 100 before generation. Stock and skill arms used [run 38692141733](https://github.com/ourostack/ouro-ui/actions/runs/38692141733); Ouro HX used [run 38698901537](https://github.com/ourostack/ouro-ui/actions/runs/38698901537).
- Ouro HX input: the actual published `v0.8.0` tag, commit `7a293a703427a7f7c4a9d946d14ad911a9d63faa`. Public docs, README and all 205 live namespace items were qualified before the first process. No public release input changed during generation.
- Evidence: [protocol metadata and frozen source hashes](https://github.com/ourostack/ouro-ui/blob/main/scripts/agent-usability/runs/2026-10-15/protocol.json) accompany the committed app sources and per-run CI evidence. Raw transcripts remain private because they include host paths and tool output.

Each cell lists the score of each of the 3 runs, out of 100, and their median.

| Screen | shadcn/ui | shadcn/ui with its skill | Ouro HX |
| --- | --- | --- | --- |
| settings-form | 100, 100, 100 (median 100) | 100, 100, 100 (median 100) | 100, 100, 100 (median 100) |
| recipe-list | 100, 85.71, 100 (median 100) | 100, 100, 100 (median 100) | 100, 100, 100 (median 100) |
| command-palette | 90, 90, 90 (median 90) | 90, 100, 100 (median 100) | 100, 90, 100 (median 100) |
| confirm-delete | 100, 100, 100 (median 100) | 100, 100, 100 (median 100) | 100, 100, 100 (median 100) |
| app-shell | 100, 100, 100 (median 100) | 100, 100, 100 (median 100) | 100, 100, 100 (median 100) |
| Mean of the five medians | 98 | 100 | 100 |

Mean points per part over all 15 runs of an arm:

| Arm | typecheck (of 20) | lint (of 10) | axe (of 20) | behavior (of 50) |
| --- | ---: | ---: | ---: | ---: |
| shadcn/ui | 20 | 10 | 18 | 49.05 |
| shadcn/ui with its skill | 20 | 10 | 19.33 | 50 |
| Ouro HX | 20 | 10 | 19.33 | 50 |

| Pinned | shadcn/ui | shadcn/ui with its skill | Ouro HX |
| --- | --- | --- | --- |
| Arm made | 2026-10-15 | 2026-10-15 | 2026-10-15 |
| shadcn CLI | 4.21.1 | 4.21.1 | 4.21.1 |
| Ouro HX release | none | none | v0.8.0 |
| Skill | none | shadcn-ui/ui@993eb2c31519, content da388f632cd8 | none |
| llms.txt (sha256) | 7abce6a2d2d3 | 7abce6a2d2d3 | 7ac2df10726d |
| Installed files (count) | 81 | 82 | 160 |
| react | 19.3.0 | 19.3.0 | 19.3.0 |
| @base-ui/react | 1.8.0 | 1.8.0 | 1.8.0 |
| tailwindcss | 4.3.3 | 4.3.3 | 4.3.3 |
| typescript | 6.0.3 | 6.0.3 | 6.0.3 |
| vite | 8.3.3 | 8.3.3 | 8.3.3 |
| oxlint | 1.86.0 | 1.86.0 | 1.86.0 |
| Type errors before the agent ran | 1 | 1 | 0 |
| Lint errors before the agent ran | 0 | 0 | 0 |

Scored by harness commit 4bedf56c3fcf, axe-core 4.13.0, Chromium 153.0.8010.12, formula 4 (scripts/agent-usability/formula.mts).
