# What exists today: HX web, Ouro AX, the native shell and the native apps

Researched 2026-11-03 from source; it is read-only, and the paths are as given. A child agent did the inventory, and I read the Ouro AX decision record myself.

**Which versions were read:**
- ouro-ui: origin/main 403748d2, 2026-11-02. The local clone is 113 commits behind.
- ouro-md: 8f27349 and Workbench: 6ffef7a, both read through `gh api`.
- spoonjoy-v2 as of 2026-10-31 and spoonjoy-apple as of 2026-11-02.

## Headline

**Ouro AX shipped in ouro-ui on 2026-11-01** (PRs #322, #381, #397, #403, #437) as a standard, a kit, an X-ray and an evaluation gate.
- It covers CLI, HTTP and MCP surfaces only. Its decision record is `docs/decisions/2026-10-30-ouro-ax.md`.
- Native intents and Siri appear nowhere in it.

On the native side there is no shared design system. The native shell is macOS-only and holds no tokens; each iOS app built its own.

## 1. HX web (ourostack/ouro-ui)

- **Components:** 90 under `registry/ouro/components/ouro/`, built on `@base-ui/react`.
  - Storybook groups them into Forms, Navigation, Feedback, Chat, Display, Actions, Lists, Overlays, Layout, Text, Data and Menus.
- **Tokens:**
  - `registry/ouro/theme/ouro-theme.css` is the optional "Pearl" theme, using shadcn's names.
  - `ouro-base.css` is required. It adds `--success`, `--warning`, `--avatar-1..8`, motion (`--ouro-duration-*`, `--ouro-ease-*`, `--ouro-spring-duration`, `--ouro-press-scale`), layers, backdrop and sheet shadows.
  - Site presets: `site/public/css/themes/{abyss,brass,chart,cookbook,coral,pearl}.css`.
- **Distribution:** copy-in through the shadcn CLI (`npx shadcn@latest add`, pinned to a release tag) or `https://ui.ouro.bot/r/{name}.json`.
- **Docs:** generated from JSDoc, with Storybook at ui.ouro.bot.
- **The X-ray Inspector** (`docs/Inspector.md`) outlines every HX component on a page, with docs and source links.
- **Agent-facing parts:**
  - `site/llms.txt` and the registry JSON.
  - Deliberately no skill (`docs/guides/why-no-skill.md`).
  - An agent-usability evaluation (`scripts/agent-usability/`), a `claims` checker, and the `ouro-census`, `ouro-source-rules` and `lib-claims` kits.
- **Accessibility:**
  - Vitest in a real browser, with axe.
  - A VoiceOver and NVDA lane through Guidepup.
  - Visual baselines and a latency suite.
- **Release:** a tag commit with a pinned `registry.json`. Latest release v1.3.2.
- **Spoonjoy web** is pinned at v1.2.13 with hash-pinned files. It maps HX tokens onto `--sj-*` in `app/styles/tailwind.css` and has not adopted the AX kit.

## 2. The native shell (ouro-native-apple-app-shell)

**What it is:** a SwiftPM package, macOS 13 only.
- `OuroAppShellCore`: identity, release and update policy.
- `OuroAppShellContract`: About, command reference, utility windows, settings, privacy and diagnostics.
- `OuroAppShellConsumerTesting`, `OuroAppShellAppKit`, and `OuroAppShellUI` (SwiftUI About, What's New, updates and command reference).
- `OuroAppShellUISurfaceProbe`.
- Scripts: shell doctor, consumer scaffold, downstream checks and a boundary check.

**What it doesn't have:** colours, fonts, haptics, motion, App Intents or Spotlight.

**Consumers:** Ouro MD and Workbench. Workbench has been frozen since 2026-10-10.

**Separately**, `ourostack/apple-distribution-kit` handles signing and shipping.

## 3. Native apps

| App | Platforms | UI | Own tokens | Shares code with |
|---|---|---|---|---|
| Ouro MD | macOS 13+ | AppKit + SwiftUI + WKWebView | `Sources/OuroMD/Themes.swift`, `SystemDesign.swift` | shell, distribution kit |
| Workbench (frozen) | macOS | SwiftUI | none | shell, distribution kit |
| Spoonjoy apple | iOS, iPadOS and macOS | SwiftUI | `Apps/Spoonjoy/Shared/Design/KitchenTableTheme.swift`, `Sources/SpoonjoyCore/Design/KitchenMotion.swift`, `KitchenHaptics.swift`, `KitchenContrast.swift`, `docs/native-design-language.md` | distribution kit |
| Gatefold | iOS 27 | SwiftUI + Readium | `Gatefold/Design/Design.swift`, `AccentColor` | none |
| Drift Remote | iOS 26 | SwiftUI | `DriftRemote/UI/DriftStyle.swift` | none |

**Spoonjoy's native colours copy its web palette by hand.**
- Each colour carries a `// --sj-*` comment.
- `scripts/check-native-web-palette-contract.rb` checks them against a vendored CSS file.
- This goes through Spoonjoy's palette, not HX tokens.

**Primitives built twice or more:**
- colour light, dark and high-contrast helpers
- motion vocabularies with Reduce Motion handling
- haptic moments (central in Spoonjoy, inline in Gatefold)
- empty states, pill and glass buttons, banners and sheets
- command palettes (Ouro MD and Workbench)

**Fold (Duo) code:**
- `.github/scripts/duo/devicehub.swift` is byte-identical in Gatefold and spoonjoy-apple.
- Both apps have a `duo-tour.yml` workflow.
- Each has its own posture and hinge code (`Gatefold/Duo/FoldReader.swift`; Spoonjoy's `KitchenTableSpread.swift` and `DuoHinge.swift`).

## 4. AX surfaces today

**Ouro MD** (`Sources/OuroMD/DocumentIntents.swift`):
- `MarkdownDocumentEntity` (AppEntity, IndexedEntity, Transferable) and its query.
- Open, Get, Append and Replace intents, with Siri phrases.
- `NSUserActivity.appEntityIdentifier` and Spotlight indexing.
- Writing Tools.
- Real Siri and sandbox behaviour has not been verified on a device (`ouro-md/sandboxed-siri-recent-documents/task.md`).

**Spoonjoy apple:**
- `SpoonjoyAppIntents.swift` is 2,847 lines, with about 52 intents and 10 App Shortcuts.
- Seven AppEntity+IndexedEntity types and a Spotlight indexer.
- `NativeIntentOutcome.swift` records, per intent, whether it finishes in place or opens the app, and why.
- Live Activities for cook timers and sessions (AlarmKit), voice in cook mode, and deep links.

**Spoonjoy's contract script:** `scripts/check-app-intents-contract.rb`, 4,644 lines, covering 14 domains.
- It checks source text and Xcode target membership, not behaviour.
- CI runs it.

**Other apps:**
- Workbench has its own stdio MCP server (`Sources/OuroWorkbenchMCP/`) and no App Intents.
- Gatefold and Drift have no App Intents, no Spotlight and no URL scheme.

**Web:** Spoonjoy serves `/mcp` with OAuth, `/llms.txt`, a device flow at `/agent/connect`, and AASA.

## 5. Gaps (inference)

- **Tokens:** nothing connects native tokens to HX tokens.
- **Shared code:** the three iOS apps share nothing.
- **Quality checks:** native has no counterpart to HX's tests, screen-reader lane, X-ray, source rules, census or release pinning.
- **Repeated AX pieces:**
  - entity, query and IndexedEntity boilerplate
  - NSUserActivity setup
  - Spotlight indexing
  - errors that say the fix: Ouro MD's `DocumentIntentError` matches `ax-problem`
  - finish-in-place or open-the-app outcomes: Spoonjoy's table is close to `ax-outcome` and `ax-effects`
  - source-text contract checking where AX's rule is to check behaviour from outside
  - two MCP servers built without `ax-mcp`
