# Model reviews: which interface toolkit would a model choose?

This measures one thing: asked independently and neutrally, which design system or interface toolkit does each frontier model choose to build interfaces that both people and agents use, across web and native? Nothing about Ouro UI is published from it yet. A claim that models choose Ouro UI is made only from a run of this script that shows it, and its raw output is the only source for any model's words.

It is the Ouro UI counterpart of `scripts/model-reviews.cjs` in [ourostack/ouroboros-website](https://github.com/ourostack/ouroboros-website), which backs ouroboros.bot/model-reviews, and it keeps that script's method.

## The question

Every model gets the same system prompt ([`renderSystemPrompt`](model-reviews.mjs)):

> You are choosing the design system or interface toolkit you would use to build interfaces that both people and agents use, across web and native platforms.

It then lists the candidates by name and URL, and gives three tools: `search` (Perplexity's `sonar`), `fetch_url` and `final_verdict`. The model researches until it calls `final_verdict` once, with its choice, a pull quote, a testimonial and an evaluation of every candidate that links a page it fetched.

## The rules that keep it fair

1. **Names and URLs only.** A candidate is its name and one URL. Nobody describes it, praises it or says what to judge it on, and the prompt lists no dimension (such as accessibility or agent support). The test `the prompt carries names and URLs only` fails on a description or a dimension word.
2. **Ouro UI is never first, and no model sees the same order.** Each model gets its own random order of the candidates, hashed into the record (`promptSha256`). The `final_verdict` schema lists its choices in that same order. The record keeps each model's order, and the summary reports where Ouro UI sat in each.
3. **The same tools, the same text, one runtime.** Models share the Ouroboros script's stripped GitHub Copilot runtime (`empty` mode: no skills, memory, instructions, hooks or host tools, no compaction, no large-output indirection). A run that compacted is rejected, so no hidden context decides a vote.
4. **Sources are pinned.** A candidate on GitHub is read at the commit current at the cutoff, whatever branch or path the model asks for. A candidate that is not a repository (Material 3 and Jetpack Compose, SwiftUI and the Human Interface Guidelines) is captured when first fetched, with a hash of its first page recorded.
5. **Repair access symmetrically.** Apple's documentation needs JavaScript, so its pages come back as the JSON they render from (`developer.apple.com/tutorials/data/...json`). That is the only rewrite beyond pinning GitHub, and it applies to every Apple page whoever asks.
6. **Reject incomplete research.** A verdict is refused unless the model fetched a source for every candidate (at its pinned revision, for a repository) and links only pages it fetched. The model sees the refusal and can continue.
7. **Never curate.** No quote is edited, paraphrased or picked from a longer one. An unusable output may have its *format* constraints changed, and the run repeated, without steering toward a candidate or a dimension. An undesired choice is not malformed output, and an unchanged input is not rerun to seek another vote.
8. **Save everything privately.** A run writes to a new folder outside this repository (`--output-dir`). Credentials are redacted from every log, and a finished artifact containing one is refused.

Where this differs from the Ouroboros script, it is on purpose: the choices in the verdict schema are shuffled with the prompt (the original lists its subject first), and the panel is every reachable frontier model rather than one per vendor.

## The candidates

Defined in `CANDIDATES`. Ouro UI, shadcn/ui, Vercel UI SDK, Agent-native (Builder.io), Radix UI, Base UI, React Aria and React Spectrum, MUI, Chakra UI, Tamagui, Flutter, Fluent UI, Material 3 and Jetpack Compose, SwiftUI and Apple Human Interface Guidelines, A2UI, OpenAI Apps SDK UI, MCP Apps, json-render, AI Elements and CopilotKit.

The list is the real alternatives for web and native interfaces that people and agents share: component systems, headless primitives, platform design systems, agent-aware toolkits and generative-UI formats. Add a candidate by adding one `{ name, url }` entry, never a description. Changing the list starts a new baseline: runs with different lists are not compared.

## The models

Defined in `REVIEW_MODELS`: the frontier models reachable through GitHub Copilot's catalog at the time (Claude Opus 5.5, Opus 5 and Sonnet 5.5, GPT-6.1 Sol and GPT-6 Astra, Gemini 4 Carbon and Hydrogen, Grok 4.7), plus MiniMax M3 through its own API, which Copilot does not carry. A result is a statement about the models that ran, never about "every frontier model".

## Credentials

Nothing is printed or committed.

- **Model inference (`--inference copilot-first`).** The GitHub account signed in to `gh` (`gh auth login`, read through the Copilot SDK's logged-in-user path). Alternatively set `COPILOT_GITHUB_TOKEN`, `GH_TOKEN` or `GITHUB_TOKEN`. No other sign-in is needed.
- **Search.** `PERPLEXITY_API_KEY`, or `integrations.perplexityApiKey` in an agent secret store, `~/.agentsecrets/<agent>/secrets.json` for `model-reviews`, `ouroboros` or `slugger`, the first that has it.
- **Direct vendor APIs** (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `MINIMAX_API_KEY`, or `providers.<vendor>.apiKey` in the same stores) are used only for a model Copilot's catalog lacks. Today that is MiniMax M3.

The model runtime runs with these removed from its environment.

## Running it

The Copilot SDK is not a dependency of this repository (it would change every consumer's lockfile for a tool only maintainers run). Install it beside the repository and point the script at it.

```sh
mkdir ../model-reviews-deps && (cd ../model-reviews-deps && npm i @github/copilot-sdk@1.0.13)
export OURO_MODEL_REVIEWS_SDK=$PWD/../model-reviews-deps

node scripts/model-reviews/model-reviews.mjs --preflight --inference copilot-first --output-dir <new folder>   # access check, no inference
node scripts/model-reviews/model-reviews.mjs --inference copilot-first --output-dir <new folder>
node scripts/model-reviews/model-reviews.mjs --inference copilot-first --models grok-4-7,gpt-6-astra --output-dir <new folder>
```

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
- **A headline needs the data.** Publish "models choose Ouro UI" only when a complete run shows it, derived from the run's `summary`, with the transcripts alongside.
