# Naming and repositories for Ouro HX and Ouro AX across platforms

Recommendation, 2026-11-03.

Ari's question, 2026-11-03: "you're correct that today we only care about apple, but that will change as things mature. let's call this Apple Native, perhaps? lmk best disambiguating and durable holistic naming scheme so we never need to rename :) can include placeholder pages for other platforms and tell folks if they want to build for those platforms to just start opening PRs and if i like their work i'll make em contributors? lmk - or should we even think about making separate repos?"

Status: recommendation, waiting for Ari's yes. It replaces one assumption of the approved proposal. That assumption was "both live in ourostack/ouro-ui with a Package.swift at the repository root". Nothing had been built on it.

## The scheme: products × platforms

| Level | Human name | Machine identifier |
|---|---|---|
| Parent | Ouro UI | repo `ouro-ui`, site `ui.ouro.bot` |
| Products | Ouro HX (for people), Ouro AX (for agents) | `hx`, `ax` |
| Platforms (an open set) | Web, Apple, Android, Windows | `web`, `apple`, `android`, `windows` |
| An implementation | "Ouro HX for Apple platforms", "Ouro AX for Apple platforms" | repo `ouro-ui-apple`; Swift products `OuroHX`, `OuroAX`, `OuroAXTesting` |
| The neutral core | tokens, HX's design language and component specs, AX's claims standard | in `ouro-ui` |

Rules that keep it durable:

1. **A product name never carries a platform.** "Ouro HX" means HX on every platform. A platform appears only after "for", in smaller type than the product name.
2. **A platform is named by its ecosystem's family name.** It is never named by a toolkit (React, SwiftUI, Compose), a version, or a relative word ("native", "mobile"). Toolkits appear only in descriptions, so swapping a toolkit renames nothing.
3. **Surfaces are vocabulary, not names.** CLI, HTTP, MCP, App Intents and AppFunctions belong to AX's standard and never become product names.
4. **Code identifiers don't repeat what the platform already implies.** On Apple it is `import OuroHX`, not `OuroHXApple`.
5. **`ouro-ui` holds the core and Web; every other platform is `ouro-ui-<platform>`.** Web is the reference platform, so it stays where it is and no existing install path or URL moves.

## Definitions

- **Web** is the TypeScript ecosystem: browsers, servers and terminals. The shipped AX kit for CLIs, HTTP and MCP is therefore Ouro AX for Web.
- **Other languages:** a later Python or Rust kit would be its own platform.

## Why not "Apple Native"

- **Trademark.** Apple's guidelines say third parties may not use an Apple trademark "as or as part of a ... product name". The mark may appear only in a referential phrase such as "for" or "runs on", "less prominent than the product name", and without implying endorsement ([Apple trademark guidelines](https://www.apple.com/legal/intellectual-property/guidelinesfor3rdparties.html)). "Apple Native" as a name breaks that rule. "Ouro HX for Apple platforms" follows it.
- **Every platform name is a trademark** (Android is Google's, Windows is Microsoft's), so the "for" rule applies to all of them.
- **"Native" is relative.** It stops telling things apart once Android and Windows exist, because each is native to itself, and web is native in a browser.
- **Repository names.** Using a platform slug in a repository name is common practice: Microsoft's `fluentui-apple` and `fluentui-android`, and Google's own `material-components-android`. That is judgment, not legal advice.

## Why separate repositories, one per platform

1. **SwiftPM:** packages are fetched by git URL, with `Package.swift` at the repository root. `ouro-ui` is a 66 MB, 8,201-file TypeScript repository (measured 2026-11-03). Every app would clone all of it, and Xcode would open the web repository as a Swift package.
2. **Toolchains and CI:** Xcode and macOS runners on one side, Node and browsers on the other. In one repository, every web PR waits on Mac CI, and the HX web release lane gates Apple releases.
3. **Contributors:** GitHub write access is per repository. Making someone an Android contributor shouldn't hand them the web release.
4. **Precedent:** Fluent (fluentui, fluentui-apple, fluentui-android) and Material (material-web, material-components-android).
5. **No drift:** the core stays single-source in `ouro-ui`. Tokens are DTCG JSON that generates CSS there, and the AX claims, including the new App Intents surface type, live there too. Platform repositories pin a core release by tag and check against it, the way apps already pin HX.
   - One repository per platform, not per product: HX and AX on Apple share a toolchain, contributors, CI and consumers.
   - The App Intents X-ray lives in `ouro-ui-apple`, because it needs AppIntentsTesting on a Mac. Its reports follow the same claims and formats as the TypeScript X-ray.

**The cost:** a token change becomes a core release plus an automated bump PR in each platform repository.

## Placeholders for other platforms

- **Site pages:** `ui.ouro.bot` gets a page for Android, for Windows, and a generic "your platform" page. Each says what HX and AX would mean there:
  - Android: Compose, and AppFunctions, which is experimental.
  - Windows: WinUI, App Actions, and the On-device Agent Registry for MCP, which is prerelease.
  - Each page also gives the contract an implementation must meet: consume pinned core tokens, meet HX's accessibility and agent-usability bar, and pass AX's X-ray for that platform's surfaces.
- **No empty repositories ahead of demand.** The pages ask people to open a PR to `ourostack/ouro-ui` adding `docs/platforms/<platform>.md` with a link to what they've built. If Ari likes it, we create `ouro-ui-<platform>`, import their work with its history, and make them a contributor.
- **Copy:** the page copy is editorial and playful, and Ari reviews it.

## Not changing now

- **The native shell:** `ouro-native-apple-app-shell` stays as it is: macOS app chrome, update and release policy. It may later use OuroHX. Merging it in would be a rename, so that waits until it earns it.

## Revision 2026-11-03: core, web and apple as three repositories

Ari, 2026-11-03: "this sounds great! but then shouldn't we have ouro ui core (what is core? and this would also include the docs site) and ouro ui web and ouro ui apple, etc?" Agreed: this replaces rule 5 and the "ouro-ui holds the core and Web" row. Every platform, Web included, is now `ouro-ui-<platform>`.

**Repositories**
- **Rename `ouro-ui` to `ouro-ui-web`.** Its history, tags (v1.x), releases, open PRs and release pipeline are all Web's.
- **Never reuse the bare name `ouro-ui` for a new repository.** GitHub keeps the old name redirecting only while no repository takes that name.
- **Extract `ouro-ui-core`** as a new repository, keeping the history of the files that move into it.

**What core is:** everything true on every platform, plus the hub.
1. **Tokens:** the DTCG source and the generators, which publish each platform's output (CSS, Swift) in a core release.
2. **HX's design language:** the principles, plus component specs (anatomy, states, keyboard and screen-reader behaviour, accessibility requirements). Platforms implement the "what" in their own "how".
3. **AX's standard:** the claims (gaining the App Intents surface type), the admission rule, the evaluation methods and task sets, and the protocol X-ray for CLI, HTTP and MCP. That X-ray observes from outside, so it serves any language.
4. **Records:** decision records, evaluation evidence and the brand.
5. **The docs site, `ui.ouro.bot`.** It pulls each platform's docs and artifacts from that platform's releases: Web's registry JSON at `/r/` and Storybook, Apple's DocC. It also holds the placeholder platform pages.

Core is platform-neutral in content, not language-free: its tooling is TypeScript.

**Where X-rays go:** a checker that observes over a protocol lives in core. A checker that needs a platform's SDK lives with that platform; the App Intents X-ray needs AppIntentsTesting on a Mac, so it lives in apple.

**What each platform repository holds**
- **Web:** React components, the AX TypeScript kit, Storybook, browser and screen-reader tests, and its existing release pipeline.
- **Apple:** the Swift package (`OuroHX`, `OuroAX`, testing products), the App Intents X-ray and DocC.

**Compatibility**
- `ui.ouro.bot/r/{name}.json` and existing pages keep their URLs.
- GitHub redirects `ourostack/ouro-ui` to `ouro-ui-web`. Before renaming, check that `shadcn add ourostack/ouro-ui/<item>#<tag>` resolves through the redirect.
  - If it does not, keep the `ui.ouro.bot` registry URLs as the documented path.
  - Spoonjoy moves to the new path at its next HX bump.
- Moving the Pages custom domain from web to core is a few minutes' gap. The DNS CNAME to `ourostack.github.io` does not change.

**Coordination**
- The active ouro-ui tasks are `no-stale-prs`, `voyage-home-and-docs-nav` and `theming-surprise-and-delight`, all validating. Coordinate with their owners and split when the merge queue is quiet.
- Open PRs survive the rename.

**Order**
1. The split: rename, extract core, move the site.
2. `ouro-ui-apple`.
3. App Intents claims into core.
4. The AX-for-Apple probe.

## Revision 2026-11-03: a migration that interrupts no one

Ari, 2026-11-03: "others are also working on these libs and should not be interrupted by any of this so do be careful with putting redirects and guidance on the migrations etc".

**Rules**
1. **Copy first, remove later.** Core starts as a copy, with history, of the files that move. The copies left in web gain a one-line header pointing to core, and they stay until every open PR that touches them has merged or closed. Removing them is a separate later PR.
2. **The rename is the only instant step, and GitHub keeps it working.**
   - Existing clones, remotes, open PRs, issues, tags and release URLs keep working through the redirect.
   - Check before renaming: `git fetch` and `git push` on a renamed remote, `shadcn add ourostack/ouro-ui/<item>#<tag>`, release asset URLs, and the CI badges and workflows that reference the repository name.
   - Never create a new repository named `ouro-ui`, which would break the redirect.
3. **Guidance where each kind of reader will find it:**
   - Each repository gets an AGENTS.md and README line saying where things live now.
   - A `MIGRATION.md` in web lists old path → new home for every moved file.
   - A note on every active ouro-ui task card through `note_leave`, naming what changed and how to reach me. It tells no one how to work.
   - A line in the next web release notes.
4. **Timing:**
   - Do it between releases: never during a release run or while the merge queue is busy.
   - Check `gh pr list` and the merge queue right before.
   - Don't rebase or force-push anyone's branch.
5. **No URL moves:** `ui.ouro.bot` and `/r/{name}.json` stay put. The site moves to core only once core's build serves byte-identical registry JSON, checked by a diff of every `/r/*.json` before switching the Pages domain.
6. **Rollback:** a repository rename can be reversed while the old name is free. The Pages domain can move back in minutes.
