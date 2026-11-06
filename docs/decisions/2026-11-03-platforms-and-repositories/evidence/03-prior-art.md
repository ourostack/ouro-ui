# Prior art for Ouro UI (HX and AX)

Researched 2026-11-03 by a read-only child agent, from the web, and read against `01-native-inventory.md`, `02-apple-agent-platform.md`, `naming-and-repos.md` and the Ouro AX decision record. **[P]** means read on the primary source (the repository, docs or paper); **[S]** means a secondary source, a search summary or press only.

## The answer

The maintainer's surprise that nobody does this is half right. **Every part of Ouro UI has a neighbour, but nobody has put the parts together.** No project found has both of these:
- **Claims a real agent evaluation admits.** Others either write principles that nothing checks, or measure task success without turning it into a standard.
- **One system for both kinds of interface:** what people use, built by agents (HX), and what agents use (AX).

That is AX's distinctive bet, and the decision record's own finding backs it: principle-derived claims "changed no task outcome", and failure-derived ones moved runs from 5/10 to 10/10.

**What already exists, closest first:**

| Ours | Closest prior art | Overlap | Recommendation |
|---|---|---|---|
| AX kit: one definition gives the parser, help, `--json`, fix-naming errors and MCP | **incur** (wevm) [P] | Strong. A TypeScript CLI framework "for agents and humans" with `--mcp`, `--llms` manifests, `--json`, errors with `hint` and `cta.commands`, a Fetch handler, and OpenAPI in and out. It has no dry-run, effects or audience, typed waits, exit-code table or conformance checker. | **Borrow ideas and watch.** Don't adopt: it isn't copy-in, and it lacks our outcomes, effects and waits. Compare our kit against it explicitly, and steal its `--llms` manifest and skill sync if evaluations admit them. |
| AX evaluation gate | Netlify **AXIS** [P]; Microsoft **DevAX + Scope** [P]; Anthropic's eval-driven tool writing [P] | Medium. All run real agents on tasks. None turns results into admitted claims. | **Borrow the method; watch AXIS.** Consider making AXIS-compatible scenario JSON an export of our task sets. |
| AX X-ray (black-box, claims, fix per failure) | MCP **conformance** suite [P]; mcp-quality, MCProbe, mcp-doctor [S] | Partial. They check protocol compliance or lint descriptions. None checks CLI+HTTP+MCP against evaluation-admitted claims. | **Adopt the official MCP conformance suite** under `ax-mcp` for protocol compliance; it's out of AX's scope. **Ignore** the third-party linters as dependencies. |
| AX claims for CLIs | clig.dev [P]; Agent-Friendly CLI Spec v0.1 [P]; cli-skills [S] | Weak to medium. These are rule lists built from opinion, and the spec has 3 stars. | **Borrow as `should` candidates only.** Our admission rule exists because lists like these didn't predict failures. |
| HX agent-usability evaluation | **Open Design System Bench** [P]; LibraryDesignBench (arXiv 2609.36730) [P] | Medium. ODSB runs a headless agent against a React component library and grades hallucinated components, tokens, compilation and static accessibility. | **Borrow ideas.** Run ODSB against HX once as an outside, comparable score; adopt its "context level" matrix (none, AGENTS.md, docs). Keep our own evaluation as the gate, because ODSB has an LLM-judge share and no real-browser or screen-reader check. |
| HX distribution and agent discovery | shadcn registry + MCP [P]; Storybook MCP [P]; Figma Code Connect (incl. SwiftUI) [P] | We already use shadcn. Storybook MCP is a preview with docs, story and `test-run` tools. | **Adopt Storybook MCP** on ui.ouro.bot's Storybook (cheap; we have Storybook), then measure it with our own evaluation before calling it helpful. **Watch** Code Connect, which is paid-plan only and needs Figma files we don't maintain. |
| Single token source | DTCG 2025.10; **Terrazzo** (Swift plugin, experimental) [P]; Style Dictionary [P] | Strong: it's a solved problem in principle. | **Adopt DTCG + Terrazzo or Style Dictionary.** Style Dictionary's Swift formats emit `UIColor` and have no SwiftUI format [P], so expect a small custom formatter either way. |
| Cross-platform from shared tokens | Skyscanner **Backpack** [P/S]; Fluent [P] | Strong as precedent, not as code. | **Borrow Backpack's token layering** (`base/` for all platforms, `app/` for iOS and Android). **Ignore** as dependencies. |
| SwiftUI components | fluentui-apple [P]; community kits [S] | Weak. fluentui-apple's README advertises UIKit and AppKit controls and carries Fluent's look; community kits are young and self-described. | **Build our own** thin SwiftUI layer, as planned. |
| App Intents helpers and the X-ray | Apple **AppIntentsTesting** [P, in 02]; app_intents_codegen [P] | Little. Only Flutter code generators (Dart → Swift App Intents + Kotlin AppFunctions). No MCP. | **Adopt AppIntentsTesting** (already planned). **Watch** app_intents_codegen for the "one definition → App Intents + AppFunctions" idea. |
| App Intents ↔ MCP | Shortcuts MCP servers [S] | Weak. They shell out to the `shortcuts` CLI; none reads typed App Intents metadata. | Genuinely open. |
| HX + AX under one system | none found | none | Genuinely new. |

**What's genuinely new, as far as these searches reach:**
1. A standard whose `must` claims require a reproduced agent failure or a stated hazard.
2. A black-box conformance report across CLI, HTTP and MCP, pinned to a claim-set version and commit.
3. Typed outcomes with an audience and checked postconditions, typed waits and attributed work events as interface contracts. (incur has outcomes as `ok`/`error` and streaming, but none of these.)
4. One brand covering both the person-facing component library and the agent-facing standard.
5. An App Intents conformance X-ray, and one action definition for App Intents, MCP and later AppFunctions, from Swift.

## 1. "Agent experience" as a movement

- **Origin.** Netlify's Mathias Biilmann coined AX in early 2025 ([Netlify AX page](https://www.netlify.com/agent-experience/) [P]; [Netlify principles post](https://www.netlify.com/blog/the-principles-of-agent-experience-ax-designing-for-the-ai-driven-consumer/) [S, via search]). A January 2026 "One Year of AX" post reportedly sorts the field into four areas, starting with access [S]; not read.
- **agentexperience.ax** ([principles](https://agentexperience.ax/concepts/principles-of-ax/) [P]) lists principles such as "Human Centricity", "Agent Accessibility", "Transparent Identity" and "Provide feedback". It defines no checks, tests or metrics, and says the principles "may change". It is maintained by "AX OSS contributors" (repo `agentexperience/ax`).
- **AXIS** ([axis.run](https://axis.run), [netlify/axis](https://github.com/netlify/axis) [P], MIT, 67 stars) is "Lighthouse, but for agent experience".
  - It runs 23 coding agents on JSON scenarios (a prompt plus weighted `judge` checks).
  - It weights goal achievement at 40%, judged against rubric checks (a model judge per the site), and environment, service and agent behaviour at 20% each.
  - It can gate CI against a baseline. It doesn't certify conformance or produce per-claim fixes.
  - This is the closest thing to our evaluation method from the movement's originator. Our scorer calls no model; AXIS's does.
- **Microsoft DevAX** ([site](https://microsoft.github.io/agent-experience/) [P]) is the most methodologically similar.
  - It opens with "Every coding agent best practice is a guess until you measure it".
  - It measures against a bare baseline, classifies changes as lift, drag or expensive lift, and reports eight "measured claims".
  - Tooling: [Scope](https://github.com/microsoft/scope) [P] (MIT, research preview). Its scoring method wasn't on the README.
  - It is about SDK and docs ergonomics for coding agents, not a conformance standard for interfaces. **Borrow** its lift/drag vocabulary for our evaluation readouts. **Watch.**
- **Other "AX" usage** (Salesforce, agencies, Speakeasy, Medium) is framing without checks [S].

## 2. Standards and linters for agent-facing interfaces

**CLIs**
- [clig.dev](https://clig.dev/) [P] is humans-first and has no agent section that we could confirm. A skills site cites a rule named "agents-help-machine-readable" [S], unverified.
- [Agent-Friendly CLI Spec v0.1](https://github.com/ChaosRealmsAI/agent-cli-spec) [P] has 98 rules in three levels, JSON by default, and an agent-run audit protocol. There's no automated checker and no evaluation evidence, and it has 3 stars.
- [cli-skills](https://github.com/whoisnjoguu/cli-skills) packages clig.dev as must/should rules with verification steps [S].

**MCP**
- [modelcontextprotocol/conformance](https://github.com/modelcontextprotocol/conformance) [P] is official and marked work-in-progress. It checks protocol behaviour and wire schemas in client and server modes. It doesn't assess tool descriptions or agent usability.
- Third-party scorers [S], all deterministic graders of descriptions and fuzzing, not agent-evaluation-admitted claims:
  - [mcp-quality](https://pypi.org/project/mcp-quality/) (a five-dimension score with no model)
  - [mcp-server-lint](https://pypi.org/project/mcp-server-lint/)
  - MCProbe (lint plus fuzzing, A–F)
- **MCP Inspector** (`modelcontextprotocol/inspector`) is an interactive debugger, not a checker. It is known from the ecosystem; this pass didn't fetch it.

**Research that supports our gate**
- [arXiv 2602.14878](https://arxiv.org/abs/2602.14878) [P abstract] studied 856 tools on 103 servers. Fixing description "smells" had mixed effects; the reported cost and regression figures are [S].
- [arXiv 2602.18914](https://arxiv.org/abs/2602.18914v1) [P abstract] found that smells measurably change tool selection.
- Together these say rubric fixes don't reliably help agents, which is our 75.6%→99% with no change in outcomes.

**Specs**
- [Arazzo](https://www.openapis.org/arazzo-specification) 1.0.1 and [agents.json](https://hn.svelte.dev/item/43243893) describe multi-step API workflows for agents [S]. They are descriptions, not checks. **Ignore for now;** revisit if HTTP adopters ask for workflow descriptions.
- llms.txt is community-maintained with patchy adoption [S]. HX already ships one.

**Benchmarks that score interfaces rather than models**
- Most MCP benchmarks score models: [MCPMark](https://arxiv.org/html/2509.24002v1) [P], MCP-Universe and MCP-Bench [S].
- Exceptions: **mcpbr** ([supermodeltools/mcpbr](https://github.com/supermodeltools/mcpbr) [S]) runs SWE-bench with and without a server, so the server is the only variable. AXIS and ODSB also score the interface.
- [Anthropic's "Writing effective tools for agents"](https://www.anthropic.com/engineering/writing-tools-for-agents) (2025-09-11) [P] is the canonical evaluation-driven method: realistic tasks, held-out sets, actionable errors. Our gate formalises it into a standard.

**Does anything do what the X-ray does?** No. The MCP conformance suite is black-box but checks protocol only. The linters check descriptions. AXIS measures task success. None reports pinned, per-surface conformance to admitted claims across CLI, HTTP and MCP.

## 3. One definition generating CLI, MCP and help

- **incur** ([wevm/incur](https://github.com/wevm/incur) [P], MIT, 643 stars) is the real overlap; see the table. It's by the team behind viem and wagmi, so it's likely to stay maintained (inference).
- **Ophis / cobrax** ([cobrax](https://github.com/onexstack/cobrax) [S]): Cobra → MCP, either as a subprocess per call or in-process.
- **click-to-mcp** ([repo](https://github.com/coding-dev-tools/click-to-mcp) [S]): Click and Typer → MCP, by introspection.
- **FastMCP `from_openapi`** ([docs](https://gofastmcp.com/integrations/openapi) [P]): OpenAPI → MCP. Its own docs warn that curated servers beat auto-converted ones.
- Stainless and Speakeasy generate MCP servers from OpenAPI [S, vendor comparisons].
- **None of these** generates effects, previews, outcomes or waits from the definition, or proves the generated help matches the parser. That proof is what the decision record's `--text` / stdin failure shows matters.

## 4. Design systems built for agents to build with

- **shadcn registry + MCP** ([registry docs](https://ui.shadcn.com/docs/registry) [P]): namespaces, a directory, search, auth and skills. Already our channel.
- **Storybook MCP** ([docs](https://storybook.js.org/docs/ai/mcp/overview) [P], preview): docs tools from a component manifest (React, angular-vite, vue3-vite), story tools and `test-run` with accessibility results. It publishes no measured effect on agent output.
- **Design-system MCP servers:**
  - [ds-mcp](https://github.com/aestheticfunction/ds-mcp) (a portable "dspack" JSON) [S]
  - [Siemens iX](https://ix.siemens.io/docs/home/mcp-server) and [Serendie](https://serendie.design/en/get-started/ai-agent/mcp-server) [S]
  - None measures anything. Our `why-no-skill.md` stance (installed code first) remains distinct.
- **Figma Code Connect** ([SwiftUI docs](https://developers.figma.com/docs/code-connect/swiftui) [P]) supports React, HTML, SwiftUI and Compose, and feeds Figma MCP. It is paid-plan only.
- **Measuring agent usability:**
  - [Open Design System Bench](https://github.com/christophhdesign/open-design-system-bench) [P] (MIT, 102 stars, v1.5 in October 2026) is the only direct peer of our HX evaluation. It weights deterministic checks at 0.75 and an LLM judge at 0.30, as published.
  - [LibraryDesignBench](https://arxiv.org/abs/2609.36730) [P] found agents underuse libraries that are rigid or hard to use, and that testing a library with subagents improves it. That's independent support for HX's evaluation premise.
- **Generative-UI catalogs** (Google A2UI: agents emit JSON mapped to a client's own components [S]) are adjacent to HX: agent-built UI for people. **Watch:** an HX catalog for A2UI could be a future surface. The OpenAI Apps SDK UI kit wasn't researched (thin).

## 5. Cross-platform design systems and tokens

- **Backpack** (Skyscanner): [backpack-foundations](https://github.com/Skyscanner/backpack-foundations) has shared tokens in `base/` (all platforms) and `app/` (iOS and Android) [P/S]. [backpack-ios](https://github.com/Skyscanner/backpack-ios) (Apache-2.0) has a Backpack-SwiftUI pod, possibly partial [S]. It is the best open-source precedent for web + SwiftUI from one token source. It isn't agent-oriented.
- **Fluent:** [fluentui-apple](https://github.com/microsoft/fluentui-apple) [P] is MIT and iOS 17 / macOS 14. Its README lists UIKit and AppKit controls, and token sharing with web Fluent isn't documented there.
- **Material** has web and Compose but no SwiftUI. **Primer** builds its tokens with Style Dictionary (covered in 02).
- **Token tools:**
  - [Terrazzo Swift plugin](https://terrazzo.app/docs/integrations/swift/) [P] reads DTCG and outputs an `.xcassets` catalog (experimental).
  - [Style Dictionary](https://styledictionary.com/reference/hooks/formats/predefined/) [P] has `ios-swift/class.swift`, `enum.swift` and `any.swift`, which are UIKit-flavoured.
  - Tokens Studio, Specify and Supernova weren't checked this pass (thin). They are hosted products; prefer an open command-line tool in `ouro-ui-core`.
- **Community SwiftUI kits:** DesignFoundation, DesignKit, SwiftThemeKit and ThemeKit ([Swift Package Index](https://swiftpackageindex.com/keywords/design-system)) [S]. All are self-described and unaudited. **Ignore** as foundations.
- **No agent-oriented, cross-platform design system was found.**

## 6. The native agent side

- **App Intents test tools:**
  - Apple's AppIntentsTesting ([WWDC26 295](https://developer.apple.com/videos/play/wwdc2026/295)) [P] has no open-source counterpart.
  - [flutter_intents](https://github.com/touyou/flutter_intents/releases/tag/v0.11.0) scaffolds it in an example and calls the scaffold inert on stable Xcode [S].
- **Code generators:**
  - [app_intents_codegen](https://pub.dev/packages/app_intents_codegen) [P] (v0.20.0, unverified uploader, about 1.2k downloads) turns Dart annotations into Swift App Intents plus Kotlin `@AppFunction`. It's the only one-definition → App Intents + AppFunctions bridge found, and it has no MCP.
  - seisei_intents and expo-app-intents [S] are smaller.
- **An App Intents agent skill:** rudrankriyam/app-intents-agent-skill [S].
- **MCP ↔ App Intents:** only Shortcuts bridges ([recursechat/mcp-server-apple-shortcuts](https://github.com/recursechat/mcp-server-apple-shortcuts), apple-shortcuts-mcp [S]). They run shortcuts through the CLI and expose no typed intent schemas. No project reads an app's App Intents metadata into MCP tool schemas.
- **AppFunctions:** Google's Jetpack library generates the schema from annotations ([docs](https://developer.android.com/ai/appfunctions) [P]). Its agent skill is covered in 02.
- **One action → App Intents + AppFunctions + MCP from Swift: nothing found.** GitHub's code search wasn't run (no `gh search code` pass), so this is the thinnest "absence" in the report.

## 7. Human-facing and agent-facing design under one system

- **Nothing found.**
  - [HAX](https://github.com/outshift-open/hax) (Cisco Outshift) is UI for human–agent collaboration, not an agent-facing interface standard [S].
  - Netlify frames AX as extending DX, not paired with a component library.
  - An OutSystems job ad mentions a design system "to support agent-facing components" [S].
- Netlify's site (AXIS plus a UI platform) and Microsoft (Fluent plus DevAX) each own both halves under different brands, with no shared standard (inference).

## Where searches were thin

- Not read directly:
  - the "One Year of AX" post
  - Netlify's principles post
  - Tokens Studio, Specify and Supernova Swift output
  - the OpenAI Apps SDK UI kit
  - MCP Inspector
  - Smithery's or Glama's server scores
- No GitHub code search for App Intents + MCP or AppIntentsTesting usage. That is the next check before claiming "first App Intents X-ray" publicly.
- Star counts and versions were read on 2026-11-03 and will move.
- Search coverage of recent (2026-H2) repositories is weak. Absence here means "not found in about 25 searches", not "doesn't exist".

## Addendum, 2026-11-03: GitHub code search for App Intents and MCP

The report above flagged this search as missing, so it was run with `gh search code`.

- **[Cocoanetics/SwiftMCP](https://github.com/Cocoanetics/SwiftMCP)** is a Swift MCP server and client library.
  - It has an App Intents bridge: an `@MCPAppIntentTool` macro and App Shortcuts discovery, gated by `#if canImport(AppIntents)` (README), plus a demo at `Demos/SwiftMCPIntentsDemo/Intents.swift`.
  - It has 165 stars, was last pushed 2026-11-02, and is BSD-licensed (`LICENSE`, "Copyright (c) 2025, Oliver Drobnik", BSD redistribution terms; GitHub reports no SPDX id).
  - **This is a real neighbour to "one Swift action definition for App Intents and MCP".** Recommendation: evaluate building AX for Apple's MCP side on it, or borrow from it, before writing our own `ax-mcp` in Swift. We still differ on claims, outcomes, effects and the X-ray.
- **[bradwindy/app-intents-mcp](https://github.com/bradwindy/app-intents-mcp)** is an MCP server that exposes macOS App Intents to assistants. It has 1 star and was last pushed 2026-07-08. Watch it.
- **Apps that ship both App Intents and MCP**, each hand-wired: heznpc/AirMCP (`AirMCPKit/AppEntities.swift`), jasontitus/mcpzim and Anglesite.
- **AppIntentsTesting:** the hits are documentation mirrors and WWDC notes, for example WWDCNotes for session 295 and CharlesWiltgen/Axiom's reference. No X-ray or conformance tool built on it was found.
