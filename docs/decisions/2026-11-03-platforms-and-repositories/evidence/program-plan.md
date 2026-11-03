# Ouro HX and Ouro AX for Apple: program plan

> **For agentic workers:** this is a program plan across five repositories. Each workstream owner writes its own test-first task plan, with Superpowers' writing-plans format and its Review Focus, in the workstream's iteration folder under this task before coding. That plan includes the file map, interfaces and failing-test-first steps. Execution is subagent-driven; one implementation owner per workstream.

**Goal:** Ouro HX and Ouro AX gain Apple as a platform. One token source, one claims standard and one docs site serve both platforms. Our native apps use them and contribute back to them.

**Architecture:**
- Three repositories: `ouro-ui-core` (the neutral core and the `ui.ouro.bot` hub), `ouro-ui-web` (today's `ouro-ui`, renamed) and `ouro-ui-apple` (a Swift package).
- Platforms pin a core release by tag, and a provenance file records the tag and hashes.
- AX gains App Intents as a surface type, checked black-box through Apple's AppIntentsTesting.

**Tech stack:**
- Core: TypeScript (Node 24, pnpm 10), with DTCG 2025.10 token JSON and a generator built on Terrazzo or Style Dictionary plus a custom SwiftUI formatter.
- Apple: Swift 6 and SwiftPM, iOS and iPadOS 27 / macOS 27 minimum for the new APIs, AppIntents, AppIntentsTesting and DocC. SwiftMCP (BSD) is used for the evaluation bridge and the Mac MCP door.

**Spec:**
- `ouro-ui/hx-and-ax-native/task.md` (the approved proposal)
- `naming-and-repos.md` (naming, repositories and migration rules)
- `research/01–03`
- ouro-ui `docs/decisions/2026-10-30-ouro-ax.md` and `docs/decisions/2026-11-02-cli-kit-and-platform-targets.md` (existing decisions; this program amends the second)

## Global constraints

- **Names (2026-11-02 record, kept):**
  - The family names are Ouro HX and Ouro AX. A target is "Ouro HX for web" / "Ouro HX for Apple", and likewise for AX.
  - In code, paths and tags the targets are `web` and `apple`.
  - A product name never carries a platform; Apple appears only after "for", less prominent than the product name.
  - The Apple library is `OuroHX`, with the web components' names (`Button`, `Dialog`). Its siblings are `OuroAX`, `OuroAXTesting` and `OuroHXTesting`.
- **Repositories:**
  - `ourostack/ouro-ui-core` and `ourostack/ouro-ui-apple`, both MIT.
  - `ourostack/ouro-ui` is renamed to `ourostack/ouro-ui-web` in milestone 3. Never create a new repository named `ouro-ui`.
- **The migration interrupts no one** (`naming-and-repos.md`, "a migration that interrupts no one"):
  - Copy first, remove later. Verify the redirect.
  - Write `MIGRATION.md` and AGENTS.md pointers, and leave a note on each active card.
  - No URL moves. Work between releases. No force pushes to others' branches.
- **Prior art (meerkat mode):** every decision record and every new library in these repositories has a Prior art section saying what to adopt, borrow, watch or ignore, with links.
- **The existing web addresses stay working:** `ui.ouro.bot/docs/<name>/`, `/r/{name}.json`, and `shadcn add ourostack/ouro-ui/<item>#<tag>`, through the redirect.
- **Claims discipline:** ouro-ui's AGENTS.md "Claims" section applies in core and web, and `pnpm claims:lint` runs on PR bodies there.
- **Gatefold:** its adoption waits until build 15 is on TestFlight and Ari has not sent it back. Nothing in this program may slow the build 15 to 16 delight path.
- **Workbench is frozen** (its README, 2026-10-10): skip it and record that.
- **Other owners:** Spoonjoy apple has active owners (`spoonjoy/apple-grade-native-redesign`). Coordinate through `note_leave` and PRs only; never steer their sessions.
- **Disk:** each agent keeps one DerivedData folder in its own worktree and stops below 5 GB free.

## Fixed interfaces (later work relies on these)

1. **Token source:** `ouro-ui-core/tokens/ouro.tokens.json` (DTCG 2025.10).
   - Semantic names match HX's CSS variables without the `--`: `background`, `foreground`, `primary`, `primary-foreground`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`, `radius`, `success`, `warning`, `chart-1..5`, `avatar-1..8`.
   - Motion: `ouro.duration.{fast,base,slow,press,sheet,draw}`, `ouro.ease.*`, `ouro.spring.duration` and `ouro.press.scale`.
   - Themes are token sets in `tokens/themes/<name>.tokens.json` (pearl, abyss, brass, chart, cookbook, coral).
2. **Generated outputs, in each core release:**
   - `dist/web/ouro-theme.css` and `dist/web/ouro-base.css`, **byte-identical** to web's current files at the pinned web tag (the CI check `tokens:parity`).
   - `dist/apple/OuroTokens.swift`: a `public struct OuroTokens` with `Color` and `Double` values and a `static func theme(_ name: OuroThemeName) -> OuroTheme`.
3. **Provenance:** each platform repository has `core-provenance.json` of the form `{ "coreTag": "vX.Y.Z", "files": { "<path>": "<sha256>" } }`, checked in CI.
4. **AX surface type `app-intent`** in core's claims standard, with sibling surfaces `app-entity` and `view-annotation`. Every claim carries `appliesTo: ["app-intent", ...]`. App Intents claims start as `should` unless they state a hazard and its check.
5. **X-ray report:** the App Intents X-ray (`ouro-ax-xray --bundle-id <id> --claims <core-claims.json> --format json|md|html`) emits the same report shape as `ax-xray`, pinned to the claim-set version and the app's commit.
6. **The Swift outcome types match ax-outcome and ax-problem:**
   - `OuroAX.Outcome` has a state (`done`, `queued`, `planned`, `needsPerson`, `uncertain`, `refused`, `failed`), an audience, a checked postcondition, a receipt and next actions.
   - `OuroAX.Problem` is a one-line message plus its fix.

## Review focus

1. **Byte drift:** generated CSS that differs by one byte from today's files changes every web app's appearance. `tokens:parity` must compare bytes, not parse them.
2. **The rename redirect:** an install command, release asset or CI badge that silently breaks. Verify each through the redirect before the rename, and again after it.
3. **Siri behaving differently from what AppIntentsTesting shows:** the report must say it does not prove Siri, and Ari confirms Siri by hand on his device.
4. **An app's existing behaviour regressing on adoption:** visual and haptic changes in Gatefold or Spoonjoy. Adoption PRs carry before-and-after captures, run the app's existing UI tests, and change nothing visible unless intended.
5. **Another agent's PR colliding with moved files:** copy-first, plus checking `gh pr list` before each step that removes anything.

## Milestones and workstreams

### Milestone 1: foundations (parallel)

- **W1, the decision and the standing rule** (ouro-ui, which becomes web):
  - **Decision record:** `docs/decisions/2026-11-03-platforms-and-repositories.md`, amending 2026-11-02. It records the three repositories, AX's Apple target (App Intents surfaces), the token pipeline, the migration rules and its own Prior art section.
  - **Standing rule:** an AGENTS.md rule, "Look around first (meerkat mode)", plus a required Prior art section in decision records. This follows Ari's 2026-11-03 words "make it a standing rule for all the ouro ui stuff!! not just for me".
  - **Done when:** merged through the repository's own checks (claims included) and visible on ui.ouro.bot.
- **W2, core bootstrap** (new `ouro-ui-core`):
  - Tokens, generators, the `tokens:parity` CI check, AGENTS.md (with meerkat mode), README, MIGRATION plan, a release workflow and the first tag `v0.1.0`.
  - The App Intents claims are added in milestone 2.
  - **Done when:** CI is green, `tokens:parity` passes against web's latest tag, and both generated outputs are attached to the release.
- **W3, Apple bootstrap** (new `ouro-ui-apple`). Depends on W2's first tag for tokens; it can start on structure in parallel.
  - The package has the `OuroHX`, `OuroHXTesting`, `OuroAX` and `OuroAXTesting` products, plus CI on macOS, DocC and AGENTS.md.
  - `OuroHX` first holds tokens, then `OuroMotion` (with Reduce Motion), `OuroHaptics` (a moment table), `OuroFoldPosture` (Duo posture and hinge) and `OuroColor` (light, dark and high-contrast helpers). These are extracted from what Gatefold and Spoonjoy built twice, with credit to both in the docs.
  - `OuroHXTesting` holds the Duo devicehub helper, deduplicated from the two apps.
  - **Done when:** CI is green, DocC builds, and a sample app target renders every token in light, dark and high contrast, with captures.

### Milestone 2: AX for Apple, end to end

- **W4, the App Intents claims and X-ray** (core plus apple):
  - The surface types and the first claims in core. The claims draw on Apple's guidance (DisplayRepresentation, IndexedEntity for personal context, onscreen annotation, errors that name the fix, outcomes, confirmation for actions other people see) and on research 02.
  - `OuroAX` (outcome and problem types, entity, query and index helpers, an `AppIntentsPackage` hook).
  - `OuroAXTesting` (the X-ray on AppIntentsTesting).
  - An evaluation bridge: a test-only SwiftMCP server exposing an app's intents to real agents, so AX's evaluation method runs on App Intents tasks.
  - Run the X-ray against Ouro MD, Spoonjoy and Gatefold, then run the evaluation tasks. A claim is promoted to `must` only by a reproduced failure or a stated hazard.
  - **Done when:** X-ray reports for the three apps are in the evidence, the evaluation results are recorded, and a decision record or amendment lists the admitted claims.
- **W5, Ouro MD adoption** (ouro-md; no active owner, so this program owns it):
  - OuroAX for its intents, conformance on main, and a Mac MCP door through SwiftMCP so our agents can work on documents.
  - OuroHX tokens where Ouro MD's chrome uses its own.
  - **Done when:** merged, X-ray conforming, and a real agent edits a document through MCP in an evaluation run.

### Milestone 3: repositories split, site hub

- **W6, the split:**
  - Copy the standard, the decisions, the claims tooling and the site into core, keeping history.
  - Get core's site to serve byte-identical `/r/*.json` and pages, verified by diff, then move the Pages domain.
  - Rename `ouro-ui` to `ouro-ui-web`, after the redirect checks.
  - Add MIGRATION.md and AGENTS.md pointers, and notes on the active ouro-ui cards.
  - The web copies are removed later, once the open PRs touching them drain.
  - **Done when:** the site is served from core with zero URL diffs, the redirect is verified, and no open PR is broken.
- **W7, the site:**
  - Web and Apple tabs on component pages, as the 2026-11-02 record specifies.
  - An AX for Apple section.
  - Placeholder pages for Android, Windows and "your platform": playful copy, each platform's agent doors from research 02, the contract an implementation must meet, and the proposal-PR path.
  - A version table of which core tag each platform implements, and a contributor guide.
  - **Done when:** live on ui.ouro.bot, with captures, and Ouro check clean.

### Milestone 4: HX for Apple components and adopters

- **W8, components:**
  - Extract `Button` (the glass and pill styles), `EmptyState`, `Banner`, `Sheet` and `Toast` from Gatefold and Spoonjoy, with their web names.
  - Each component's behaviour (touch targets, Reduce Motion, VoiceOver names, Dynamic Type) is stated as core claims and proven in Swift tests: XCUITest `performAccessibilityAudit`, snapshot baselines and a VoiceOver check.
  - A native agent-usability evaluation: an agent with no Ouro context builds a correct, accessible SwiftUI screen from the package alone.
  - **Done when:** all merged, with that evaluation's result recorded.
- **W9, Gatefold adoption** (after build 15 is signed off):
  - OuroHX tokens, motion, haptics, fold posture and components.
  - App Intents built with OuroAX: open a book, continue reading, reading progress, find in my library. Books are in Spoonjoy-free territory and reach Shortcuts only; Siri is reached through App Shortcuts phrases.
  - Conformance on main.
  - **Done when:** merged with no visual regression in captures, and the X-ray conforming.
- **W10, Spoonjoy adoption** (coordinated with its owners):
  - Leave a note on `spoonjoy/apple-grade-native-redesign` describing the packages and the offer.
  - Open PRs for tokens, motion, haptics and fold posture, and replace `check-app-intents-contract.rb` checks with the X-ray step by step.
  - Their reviewers decide.
  - **Done when:** PRs merged, or the owner's decision recorded.
- **W11, Drift Remote:** tokens and colour helpers only. Note it on `drift-remote/roadmap-chain`.

## Gates

- Every workstream: its own test-first plan in the desk, one implementer, an independent review (`superpowers:requesting-code-review`), the repository's own CI, merged, and captures for anything a person sees.
- Concurrency: at most three heavy agents at once while the host is loaded. Gatefold build 15 keeps priority.
- Program done: every milestone's done-when holds, the proposal's completion checks hold, and Siri has been confirmed on Ari's device. That last step is the only one that returns to Ari.
