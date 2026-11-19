# Model reviews: which interface toolkit would a model choose?

This measures one thing: asked independently and neutrally, which design system or interface toolkit does each frontier model choose to build interfaces that both people and agents use, across web and native? The results are published at [/docs/model-reviews/](https://ui.ouroboros.bot/docs/model-reviews/), rendered by a script from the runs' records. A claim that models choose Ouro UI is made only from a run of this script that shows it, and its raw output is the only source for any model's words.

It is the Ouro UI counterpart of `scripts/model-reviews.cjs` in [ourostack/ouroboros-website](https://github.com/ourostack/ouroboros-website), which backs ouroboros.bot/model-reviews, and it keeps that script's method.

## The question

Every model gets the same system prompt ([`renderSystemPrompt`](model-reviews.mjs)):

> You are choosing the design system or interface toolkit you would use to build interfaces that both people and agents use, across web and native platforms.

It then lists the candidates by name and URL, and gives three tools: `search`, `fetch_url` and `final_verdict`. The model researches until it calls `final_verdict` once, with its choice, a pull quote, a testimonial and an evaluation of every candidate that links a page it fetched.

## The rules that keep it fair

1. **Names and URLs only.** A candidate is its name and one URL. Nobody describes it, praises it or says what to judge it on, and the prompt lists no dimension (such as accessibility or agent support). The test `the prompt carries names and URLs only` fails on a description or a dimension word.
2. **Ouro UI is never first, and no model sees the same order.** Each model gets its own random order of the candidates, hashed into the record (`promptSha256`). The `final_verdict` schema lists its choices in that same order. The record keeps each model's order, and the summary reports where Ouro UI sat in each. The script enforces it from 2026-11-19 ([`orderCandidates`](model-reviews.mjs)): before then the shuffle could put Ouro UI first, and the page flags each review where it did.
3. **The same tools, the same text, one runtime.** Models share the Ouroboros script's stripped GitHub Copilot runtime (`empty` mode: no skills, memory, instructions, hooks or host tools, no compaction, no large-output indirection). A run that compacted is rejected, so no hidden context decides a vote.
4. **Sources are pinned.** A candidate on GitHub is read at the commit current at the cutoff, whatever branch or path the model asks for. A candidate that is not a repository (Material 3 and Jetpack Compose, SwiftUI and the Human Interface Guidelines) is captured when first fetched, with a hash of its first page recorded.
5. **Repair access symmetrically.** Apple's documentation needs JavaScript, so its pages come back as the JSON they render from (`developer.apple.com/tutorials/data/...json`). That is the only rewrite beyond pinning GitHub, and it applies to every Apple page whoever asks.
6. **Reject incomplete research.** A verdict is refused unless the model fetched a source for every candidate (at its pinned revision, for a repository) and links only pages it fetched. The model sees the refusal, with the rule it broke, and can continue. (Until 2026-11-14 a refusal reached the model only as the runtime's generic "Tool execution failed", which names no rule; the 2026-11-13 baseline ran that way.)
7. **Never curate.** No quote is edited, paraphrased or picked from a longer one. An unusable output may have its *format* constraints changed, and the run repeated, without steering toward a candidate or a dimension. An undesired choice is not malformed output, and an unchanged input is not rerun to seek another vote.
8. **Save everything privately.** A run writes to a new folder outside this repository (`--output-dir`). Credentials are redacted from every log, and a finished artifact containing one is refused.
9. **One research budget for every model.** A session can read [450,000 characters](model-reviews.mjs "verify:fileLine(scripts/model-reviews/model-reviews.mjs, /export const RESEARCH_BUDGET = 450_000;/)") of search and fetch results, and the prompt says so. Past it, both tools return the same message, "Research budget reached: call final_verdict with what you have.", and read nothing more; the result that crosses the budget is returned whole. Without it, a model that reads thoroughly in a smaller context window compacted before it could vote, and a compacted run is rejected (rule 3): Gemini 4 Carbon compacted on every attempt in the 2026-11-13 and 2026-11-14 series ([#1225](https://github.com/ourostack/ouro-ui/issues/1225)). The budget cuts other models' sessions short of what they read before, so it counts only for a series in which the whole panel ran under it; each review records it (`configuration.researchBudget`).

Where this differs from the Ouroboros script, it is on purpose: the choices in the verdict schema are shuffled with the prompt (the original lists its subject first), the panel is every reachable frontier model rather than one per vendor, and every session has the same research budget (rule 9).

## Search

Every model gets the same `search` tool, with the same name, description and parameters, whichever backend answers it. A run records its backend in `run.json` (`runtime.search`), and a series uses one backend; the page says which, and says so when it differs from the review before.

- **GitHub Copilot's web search** (`--search copilot`, the default with `--inference copilot-first`, from 2026-11-19). The query goes, unchanged, to the GitHub MCP server's `web_search`, the search Copilot's own agents use, and the model gets the results themselves: each result's title, address and snippets, numbered ([`formatSearchResults`](model-reviews.mjs)). The runtime offers that tool only inside a session, so a relay session on `claude-haiku-4.5` with no other tool makes the call. The harness checks that it made exactly one web search with the query exactly as given, or the search fails ([`relayedSearch`](model-reviews.mjs)), so the relay can't reword a query or answer it. Nothing it writes reaches the model, not even in an error. Searches run side by side fail now and then, and the same query then succeeds, so a failed search or a relay mistake is tried twice more after a pause; the model sees a failure only when all three tries fail, and only its fixed message. Before any review, the run checks the relay model is in the catalog and makes one search; a run whose every search failed is not saved as finished, and `run.json` records how many searches were made and failed (`runtime.searches`).
- **Perplexity's `sonar`** (`--search perplexity`). It answers each query with a written summary. The 2026-11-13 and 2026-11-14 reviews used it. Ari moved search to Copilot on 2026-11-18 ("can we use copilot instead?"), so a review needs only a Copilot sign-in. A summary and a list of results read differently, so a change between those reviews and later ones may come from search as well as from the models or the candidates. To separate the two, the 2026-11-14 review's searches were replayed through Copilot search on 2026-11-19 by [`search-replay.mjs`](search-replay.mjs) into [`search-replay.json`](search-replay.json), recording for each query whether Copilot returned an Ouro UI page and whether Perplexity's recorded answer mentioned Ouro UI; the page reports both.

## The candidates

Defined in `CANDIDATES`. Ouro UI, shadcn/ui, Vercel UI SDK, Agent-native (Builder.io), Radix UI, Base UI, React Aria and React Spectrum, MUI, Chakra UI, Tamagui, Flutter, Fluent UI, Material 3 and Jetpack Compose, SwiftUI and Apple Human Interface Guidelines, A2UI, OpenAI Apps SDK UI, MCP Apps, json-render, AI Elements and CopilotKit.

The list is the real alternatives for web and native interfaces that people and agents share: component systems, headless primitives, platform design systems, agent-aware toolkits and generative-UI formats. Add a candidate by adding one `{ name, url }` entry, never a description. Changing the list starts a new baseline: runs with different lists are not compared.

## The models

Defined in `REVIEW_MODELS`: the newest model of each frontier family that GitHub Copilot's catalog serves, plus MiniMax M3 through its own API, which Copilot does not carry. A result is a statement about the models that ran, never about "every frontier model", and a comparison with an earlier review counts only the models both share.

- **2026-11-13:** Claude Opus 5.5, Opus 5 and Sonnet 5.5, GPT-6.1 Sol and GPT-6 Astra, Gemini 4 Carbon and Hydrogen, Grok 4.7, and MiniMax M3.
- **2026-11-14:** GPT-6.1 Terra added, the one model of the newest generation that Copilot's catalog had added beside the panel.
- **2026-11-19:** at Ari's request ("switch to latest, so gpt 6.2 models", and "add the strongest new MAI model"), GPT-6.2 Sol and GPT-6.2 Astra replace GPT-6.1 Sol and GPT-6 Astra, MAI Code 2 joins (the catalog also has MAI Code 2 Flash, a smaller model), and Claude Opus 5 leaves, since the catalog no longer serves it. Copilot serves no GPT-6.2 Terra, so GPT-6.1 Terra stays. The catalog's Gemini 4 Argon and Neon are not added: they're the same generation as Carbon and Hydrogen, and the panel keeps the two it already had.

## Credentials

Nothing is printed or committed.

- **Model inference (`--inference copilot-first`).** The GitHub account signed in to `gh` (`gh auth login`, read through the Copilot SDK's logged-in-user path). Alternatively set `COPILOT_GITHUB_TOKEN`, `GH_TOKEN` or `GITHUB_TOKEN`. No other sign-in is needed.
- **Search.** With `--inference copilot-first`, nothing more: search is GitHub Copilot's own. `--search perplexity` (the default for `--inference direct-api`) needs `PERPLEXITY_API_KEY`, or `integrations.perplexityApiKey` in an agent secret store, `~/.agentsecrets/<agent>/secrets.json` for `model-reviews`, `ouroboros` or `slugger`, the first that has it.
- **Direct vendor APIs** (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `MINIMAX_API_KEY`, or `providers.<vendor>.apiKey` in the same stores) are used only for a model Copilot's catalog lacks. Today that is MiniMax M3.

- **GitHub's API, optionally.** `OURO_MODEL_REVIEWS_GITHUB_TOKEN`, one token or several separated by spaces, goes with reads of `api.github.com` and nothing else ([`requestHeaders`](model-reviews.mjs)). A token GitHub refuses, such as one an organization's SAML blocks, gives way to the next, then to none. GitHub answers the same, and a shared machine's 60 unauthenticated calls an hour no longer run out mid-review.

The model runtime runs with these removed from its environment.

## Running it

The Copilot SDK is not a dependency of this repository (it would change every consumer's lockfile for a tool only maintainers run). Install it beside the repository and point the script at it.

```sh
mkdir ../model-reviews-deps && (cd ../model-reviews-deps && npm i @github/copilot-sdk@1.0.13)
export OURO_MODEL_REVIEWS_SDK=$PWD/../model-reviews-deps

node scripts/model-reviews/model-reviews.mjs --preflight --inference copilot-first --output-dir <new folder>   # access check and one search; no model reviews anything
node scripts/model-reviews/model-reviews.mjs --inference copilot-first --output-dir <new folder>
node scripts/model-reviews/model-reviews.mjs --inference copilot-first --models grok-4-7,gpt-6-2-astra --output-dir <new folder>
node scripts/model-reviews/model-reviews.mjs --inference copilot-first --concurrency 3 --max-load 60 --output-dir <new folder>   # on a shared machine
```

With the whole panel, a model the machine can't reach (not in its Copilot catalog, and no key for the model's own API) is left out and recorded in `run.json` as `runtime.skipped`, so a Copilot sign-in alone runs every model Copilot serves; a model named with `--models` must be reachable, or the run stops. The page's "Run it yourself" section gives these commands and the prompt one model got, rebuilt from the record and checked against its hash.

Models run at once by default. `--concurrency` caps how many, and `--max-load` starts another only while the one-minute load average is at or below it, so a busy machine runs one model at a time. The evaluations are independent, so the schedule changes nothing a model sees; `run.json` records it under `runtime`.

A run takes tens of minutes, since each model reads every candidate. Tests: `node --test scripts/model-reviews/model-reviews.test.mjs` (part of `pnpm test:scripts`).

## What a run leaves

In the output folder:

- `run.json`: the run id, cutoff, each candidate's pinned source (`sha`, `committedAt`, `capturedAt`), the runtime, any failures, and the `summary` (`picks`, `winner`, `subjectPicks`, and `subjectPositions`, the 1-based place of Ouro UI in each model's order). Each review is the model's verbatim verdict, its candidate order, its prompt hash and its configuration.
- `transcripts/<provider>.json`: every round: the model's words, each search and fetch, and its verdict. Each tool result is a 500-character prefix, its length and its SHA-256, so a transcript can be shared without republishing third-party documents.
- `raw/evidence.json`: the full tool results and each page's single capture, for audit. `raw/<provider>.log`: the live log.

## Reading it honestly

- **One run per model is a sample, not a rate.** A model asked twice may choose twice differently. State the count (n of N models), the date and the panel, never a percentage of "all models".
- **Position is controlled by shuffling, not removed.** Read `subjectPositions` beside the picks.
- **A model's reasons are its own and may be wrong.** Check a factual objection against the source it links before treating it as a defect, and keep both the claim and the check.
- **Pinned means a snapshot.** A fix merged after the cutoff is not seen until the next run. Rerun after fixing, as a new baseline with its own date, never to replace an unwelcome result.
- **A headline needs the data.** The page says models choose Ouro UI only when more than half of the models that gave a verdict chose it, and "all" only when every model asked did; otherwise it says Ouro UI is not yet their choice, with the counts.

## Publishing a run

1. Copy the run's `run.json` and `transcripts/` (never `raw/`) to `scripts/model-reviews/results/<series>--<run>/`, unchanged. A series is one review of the panel, named by its date and a word (`2026-11-14-rerun`); a retry of a model that gave no verdict is another run in the same series (`2026-11-14-rerun--run-2-gemini-4-carbon-retry`). The page refuses two verdicts from one model in a series.
2. `node scripts/model-reviews/page.mjs docs/guides/model-reviews.md` renders the page from every published run: the headline and table from the latest series, the comparison with the series before it over the models both answered, and each model's verbatim evaluation of Ouro UI. `pnpm claims:check` renders it again and fails when the committed page differs.

## The interviews series

A second series runs beside the question above and never mixes with its counts: the model interviews, registered before any run in Ouro UI core's decision record, [Ask models what they'd build with as customer interviews](https://github.com/ourostack/ouro-ui-core/blob/bf4539aad126b1d6999883eb84149f86b6acd567/docs/decisions/2026-11-19-model-interviews.md). The record fixes every question's wording, the jobs, the scales, the arms, the tools and the budget; a change to any of them starts a new series. Each model is a customer interviewed by the [Mom Test](https://www.momtestbook.com/): its own practice before any toolkit is named, a real job before any opinion, and what it does weighed above what it says.

[`interviews.mjs`](interviews.mjs) runs it, importing this script's runtime, `search`, `fetch_url`, pinned sources, research budget mechanism, transcripts, redaction and private output folder, so every rule above holds. Its strings are the record's, and `interviews.test.mjs` pins them.

### Four sessions per model, one script

Each model gets four sessions: the listed and open arms, each at a product team's scale and a large company's. The **listed arm measures merit**: each job lists the same 20 candidates, by name and link only, in a fresh random order for each session, the same order for the session's three jobs. Ouro UI is never first ([`orderListedCandidates`](interviews.mjs), the same rule as rule 2): when the shuffle puts it first, it trades places with another candidate chosen at random. The **open arm measures discoverability**: each job says "Find the options yourself." and lists nothing, so a loss there is a finding about how agents find Ouro UI, never about its merit.

Every session runs the same six questions, word for word, each ending in a tool call:

1. **Look before you zoom** (`answer`): the model's own practice, and whether building good human interfaces is a problem for it at all.
2. **The three jobs** (`record_decision`, once each, in a fresh random order for each session): a chat app, a consumer cooking app and agent tooling. Each job's text ends with "and show it's good for the people who'll use it.", then comes the scale, then the arm's list or "Find the options yourself.", then "Research what you need with search and fetch_url, then call record_decision." The decision records the primary pick (free text, which may name something no list names), what it would pair with it, why, how it would show the result is good for the people who'll use it, what it's unsure of, and the pages it relied on, each one a page it fetched in the session.
3. **Regret** (`answer`): a year later the choices went badly; what went wrong, and what slowed it down while it researched.
4. **Ouro, named last** (`answer`): Ouro UI is named, with its link, only here. Before it, no prompt, tool description or nudge names or describes Ouro UI; in the listed arm it is one entry of the list, like any candidate.

A call to the wrong tool for the question, or a decision that breaks a rule (an empty field, a source it never fetched), is refused with the reason, and the model can fix it and call again (rule 6). A turn that ends without its tool call gets the same nudges as a verdict, up to five times, for every model. A session can read 900,000 characters of search and fetch results, because it researches three jobs; past that, both tools say so with one message, "Research budget reached: call record_decision or answer, whichever the question asks for, with what you have." The system prompt names the tools and the budget and nothing about any job or toolkit, and it's the same for every session.

### What a session records

Each session's record, in `run.json` (with `series: "interviews"`) and `transcripts/<provider>--<arm>--<scale>.json`, keeps its job order and candidate order, the hash of its whole script (`promptSha256`, re-rendered from the recorded order when the run is checked), every decision and answer verbatim, which candidates it fetched in each job and overall, and `foundOuro`: whether, before the last question, it fetched a page under github.com/ourostack, raw.githubusercontent.com/ourostack or api.github.com/repos/ourostack, or on ouroboros.bot or ouro.bot, or named Ouro in a decision or an answer. That is the open arm's "found Ouro before being told".

### Running and publishing it

```sh
node scripts/model-reviews/interviews.mjs --preflight --inference copilot-first --output-dir <new folder>
node scripts/model-reviews/interviews.mjs --inference copilot-first --concurrency 4 --max-load 60 --output-dir <new folder>
node scripts/model-reviews/interviews.mjs --inference copilot-first --models grok-4-7 --arms listed --scales product-team --output-dir <new folder>   # one session
```

`--arms` and `--scales` narrow a run to some sessions, for a trial or to run again a session that gave no answer; `--concurrency` counts sessions. Publish a run as for the original series, but to `scripts/model-reviews/interviews-results/<series>--<run>/`, and render [the interviews page](../../docs/guides/model-interviews.md) with `node scripts/model-reviews/interviews-page.mjs docs/guides/model-interviews.md`. The page refuses a run without the interviews marker, and the reviews page refuses one with it.

The findings are synthesis, filled in after a run in [`findings.json`](findings.json): for each session's first answer, whether it said building good human interfaces is a problem; and each finding, with its Mom Test signal, the models that raised it, their verbatim quotes linked to transcripts, its `model-review` issue, its status and the change that answered it. The page renders an empty or partial file, lists findings by how many models raised them, and shows not-a-pain and surprise findings as their own group.
