# Claims

A factual sentence in this repository is a claim: it carries the primary source it comes from and a check that it still holds, so the next reader, person or agent, can trust it without rebuilding the proof. `pnpm claims:check` fails on a factual sentence that is not a claim, and on a claim whose check no longer holds.[^repo-passes]

## Commands

```sh
pnpm claims:check                  # lint every surface, then run every claim's checks
pnpm claims:check --network        # the same, fetching every urlOk address again into scripts/claims-urls.json
pnpm claims:lint <file>…           # the same for some files; --pr for a pull request, --stdin for a draft
pnpm claims:show <file>…           # each claim in a file, its sources, and whether each check holds
node scripts/claims.mjs ratchet    # claims.config.json's exemptions against CLAIMS_BASE_REF, named in PR_BODY
```

Where they run:

- The `ci` check runs `pnpm claims:check`, in its `checks` job. On a pull request it first runs the ratchet against the base branch, then reads the required checks at the base branch and fetches again the addresses the pull request adds to the cache or changes (`--network=changed`).[^ci] After editing the description to name an exemption, push again: a re-run of the job reads the description its run started with.
- The Claims workflow lints a pull request's title and body, and runs the ratchet, when the pull request opens and whenever its description is edited.[^claims-workflow]
- The Claim addresses workflow runs `pnpm claims:check --network` every week.[^addresses-workflow]

## What needs a source

The lint reads every sentence outside code, headings included, and asks whether it sounds factual.[^triggers] A sentence does when it has a number (in digits or in words, `three` or `a dozen`), a version or a date, or one of these words: `tested`, `accessible`, `every`, `all`, `each`, `no`, `none`, `zero`, `always`, `never`, `fully`, `works with`, `supports`, or a superlative such as `fastest` or `most`.[^triggers] Such a sentence must be a claim.

Instructions need no source, so a sentence that starts with a verb from the lint's list (`Run pnpm test`, `Don't add a class`), or with a condition and then one (`If it fails, run it again`), passes, and so does a question.[^instructions] A noun that is also a verb does not make an instruction: `Test coverage is 100%`, `Release 2.0 shipped` and `Note that it is tested` are claims.[^bypasses]

What is not prose is not read: code spans, link addresses and URLs, a short quotation without a claim word (a label, `"3 days ago"`), and a table cell of one or two words without a digit.[^not-prose] A quotation longer than a label, or one with a claim word in it, is read like any other text.[^bypasses] In the files `pnpm run docs` keeps on the newest release, a `#vX.Y.Z` or `@vX.Y.Z` tag is already checked against `ouro.latestRelease`.[^release-tags]

A failure names the file, the line, the sentence, what kind of claim it makes and what kind of source that needs:

```text
README.md:12: "Ships 95 components." states a number. Cite where it comes from, checked with verify:count(registry:ui)=<n> …
```

When a sentence cannot be sourced, it is not a claim we can make: correct it, or remove it. Do not reword a claim only to get past the lint.

## Writing a claim

### In Markdown

A source link: the words, a link to the source, and a title that starts with `verify:`.[^link]

```md
Ouro HX ships [95 components](registry.json "verify:count(registry:ui)=95").
```

A footnote, when the source is a test or there are several, or one source covers several sentences. A sentence is a claim when it carries the footnote's mark.[^footnote]

```md
Every story passes axe in light and dark.[^axe]

[^axe]: test:test/stories.test.tsx::at $width px > %s > $id has no axe violations, closed and with each overlay open verify:testExists(test/stories.test.tsx::at $width px > %s > $id has no axe violations, closed and with each overlay open)
```

Separate a footnote's sources with `;`, and write `verify:` before a check. A footnote or link whose check is missing or malformed fails.[^malformed] On the site, footnotes gather into a Claim sources list at the end of the page, each source linked on GitHub.[^site]

### In JSDoc

An `@claim` tag quotes words of the one sentence it backs, so a sentence added to the comment later needs its own.[^jsdoc] The quote is three words or more, found as whole words, and in only one sentence of the comment.[^quote-words] The quoted words must not contain `"`. A tag also backs a sentence of a `@default`, whose words the docs table shows.[^default]

```ts
/**
 * At least 44px tall on a coarse pointer.
 *
 * @claim "At least 44px tall" registry/ouro/lib/ouro/touch-target.tsx verify:fileLine(registry/ouro/lib/ouro/touch-target.tsx, /44px/)
 */
```

`pnpm run docs` leaves the tags out of the generated pages; the source stays one click away in the file the page is generated from.

### In TypeScript copy

`claim()` from the `lib-claims` item returns its text unchanged and carries the evidence beside it. Keep both arguments literal, so the check can read them.[^copy]

```tsx
import { claim } from "@/lib/ouro/claims";

export const SUBLINE = claim("Checkout passes axe in light and dark.", {
  source: { test: "src/checkout.test.tsx::checkout passes axe" },
  verify: { testExists: "src/checkout.test.tsx::checkout passes axe" },
});
```

In copy, the lint reads JSX text, a string that reads as a sentence, a Markdown template as Markdown (its footnotes are claims, and their checks run), a number followed by a word (`"73 components"`), and any other string with a claim word, lowercase or not; it skips class names (`className`, `cn`, `clsx`) and attributes that hold code.[^copy-read]

A generator's own sentences are claims in its source: `scripts/registry.mts` and `scripts/gen-docs.mts` wrap theirs in `claim()`, and the lint reads `registry.json`, `site/public/llms.txt` and the generated regions of `README.md`, letting through only the words a source already claims.[^generated]

## Sources

| Source | Markdown and JSDoc | `claim()` |
| --- | --- | --- |
| A repository file, at a line and commit | `scripts/claims.mjs#L12@c752a8bb` | `{ file, line?, commit? }` |
| A CI run | `https://github.com/<owner>/<repo>/actions/runs/<id>` | `{ ciRun }` |
| A test | `test:<file>::<full test name>` | `{ test }` |
| A specification or document | its address | `{ spec }` |
| A committed evidence file | `evidence:<path>` | `{ evidence }` |

A source outside the repository (a desk note, a local log) cannot be checked by the next reader: commit it as evidence first.[^sources]

## Checks

| Check | Holds when |
| --- | --- |
| `count(<what>)=<n>` | There are exactly n: registry items of a type (`registry:ui`), entries in a folder (`dir:<path>`), or items in a JSON array or object (`<file>#<field path>`). |
| `equals(<file>#<field path>)=<value>` | The JSON field is exactly that value. |
| `fileLine(<path>[#L<line>], /<pattern>/)` | The file, or that line of it, matches the regular expression. |
| `testExists(<file>::<full test name>)` | The test exists, is not skipped, and a required CI job runs its file (`requiredTests` in `claims.config.json`), so a green main means it passed. |
| `ciJob([<workflow>#]<job>)` | A workflow defines the job, and it is one of the required checks in `.github/required-checks.json`, read at the pull request's base. |
| `urlOk(<url>)` | The address answered with a success status when it was last fetched. |

The checks read only the checkout, so they give the same answer on every machine.[^offline] A pull request cannot make a check of its own required: `ciJob` reads the list of required checks at the base branch.[^required] Only when the base has no list yet does the pull request's own list count, and then the ratchet makes its description name each check in it.[^required-bootstrap]

`urlOk` proves only that an address answers, so a file or folder on GitHub must be pinned to a 40-character commit hash (`https://github.com/<owner>/<repo>/blob/<commit>/<path>#L<line>`): at a branch or tag it still answers after the file changes, and the check refuses it.[^url-pinned] For a claim about what a tool does in the version you support, also check it where that version runs, as the install job does for the shadcn CLI.[^url-in-ci] `urlOk` reads its answers from `scripts/claims-urls.json`. After citing a new address, run `pnpm claims:lint --network <file>` and commit the cache. CI fetches again each address a pull request adds or changes, so a hand-written answer fails there, and an answer no claim cites fails.[^url-cache] The weekly run fetches every address again and fails when one answers differently, and when a committed answer is older than `urlMaxAgeDays` (30 by default): then run `pnpm claims:check --network` and commit the cache.[^url-network]

## Surfaces and exemptions

`claims.config.json` declares what is read and what is exempt:[^surfaces]

- `surfaces`: the files that are read, as Markdown (`markdown`), for their JSDoc (`jsdoc`) or for their copy (`copy`).
- `notLinted`: files that are generated, evidence or input, and why.
- `generated` and `generators`: the generated files, and the scripts whose `claim()` calls carry into them.
- `allowed`: exact sentences let through, each with its reason; an entry that matches nothing fails.[^allowed]
- `instructionVerbs`: the verbs that start an instruction.
- `requiredTests`: which required job runs which test files, and why.
- `requiredChecks` and `urlCache`: the files that hold the required checks and the URL answers.

The ratchet compares these lists, and the list of required checks, with the base branch's. Each entry a pull request adds to `allowed`, `notLinted`, `instructionVerbs`, `generated`, `generators`, `requiredTests` or `surfaces` must be named in the pull request's description, and the entries that take a reason must have one, so a reviewer sees every exemption.[^ratchet] So must each entry it changes, compared whole, each entry it removes from `surfaces`, `generators` or `generated`, a rise in `urlMaxAgeDays`, and a new `urlCache` or `requiredChecks` file.[^ratchet-narrow]

## In an app

`lib-claims` ships the checker as `lib/ouro/claims-check.mjs` beside `claim()`. Without a `claims.config.json`, it reads the app's Markdown and its copy under `src/`, and a test counts once it exists and is not skipped. Run it with `node src/lib/ouro/claims-check.mjs check` (your lib folder in place of `src/lib`), for example as a package script.[^app]

[^repo-passes]: scripts/claims.test.mjs verify:testExists(scripts/claims.test.mjs::checkClaims over the repository: every surface passes)
[^ci]: .github/workflows/ci.yml verify:fileLine(.github/workflows/ci.yml, /CLAIMS_BASE_REF="origin\/\$BASE_REF" pnpm claims:check --network=changed/) verify:testExists(scripts/workflows.test.mjs::the required ci job runs the claims ratchet on a pull request, against its base, with its description) verify:testExists(scripts/claims.test.mjs::ciJob reads the required checks at the base ref, so a pull request cannot add its own)
[^claims-workflow]: .github/workflows/claims.yml verify:fileLine(.github/workflows/claims.yml, /types: \[opened, edited, synchronize, reopened\]/) verify:fileLine(.github/workflows/claims.yml, /node scripts\/claims.mjs ratchet/) verify:testExists(scripts/claims.test.mjs::the lint command reads a pull request's title and body from the environment)
[^addresses-workflow]: .github/workflows/claims-urls.yml verify:fileLine(.github/workflows/claims-urls.yml, /pnpm claims:check --network$/) verify:fileLine(.github/workflows/claims-urls.yml, /cron: "23 5 \* \* 1"/)
[^triggers]: scripts/claims.test.mjs verify:testExists(scripts/claims.test.mjs::triggers: numbers, versions, dates and the words that make a sentence a factual claim) verify:testExists(scripts/claims.test.mjs::triggers: spelled-out numbers, each, no and zero, always and never, and fully) verify:testExists(scripts/claims.test.mjs::Markdown: code is not read; generated regions, headings and tables are)
[^instructions]: scripts/claims.test.mjs verify:testExists(scripts/claims.test.mjs::instructions are allowed: imperatives, conditional imperatives and questions)
[^bypasses]: scripts/claims.test.mjs verify:testExists(scripts/claims.test.mjs::bypasses: noun-verbs, quotations, headings and spelled-out claims are caught)
[^not-prose]: scripts/claims.test.mjs verify:testExists(scripts/claims.test.mjs::triggers: code, links, accessible names and plain descriptions are not claims) verify:testExists(scripts/claims.test.mjs::Markdown: code is not read; generated regions, headings and tables are)
[^release-tags]: scripts/claims.mjs; scripts/latest-release.mjs verify:fileLine(scripts/latest-release.mjs, /releaseMismatches/) verify:fileLine(scripts/claims.mjs, /syncedFiles\.includes\(file\)/)
[^link]: scripts/claims.test.mjs verify:testExists(scripts/claims.test.mjs::Markdown: a source link titled with its check makes its sentence a claim)
[^footnote]: scripts/claims.test.mjs verify:testExists(scripts/claims.test.mjs::Markdown: a footnote with checks covers each sentence that cites it)
[^malformed]: scripts/claims.test.mjs verify:testExists(scripts/claims.test.mjs::Markdown: a malformed or unverified claim marker is an error, not a pass)
[^site]: site/src/docs/markdown.tsx verify:fileLine(site/src/docs/markdown.tsx, /kind: "sources"/)
[^jsdoc]: scripts/claims.test.mjs verify:testExists(scripts/claims.test.mjs::JSDoc: an @claim tag covers the sentence it quotes, not the whole comment)
[^quote-words]: scripts/claims.test.mjs verify:testExists(scripts/claims.test.mjs::JSDoc: an @claim quote is at least three words, matched as words, in one sentence only)
[^default]: scripts/claims.test.mjs verify:testExists(scripts/claims.test.mjs::JSDoc: a default's prose is a sentence the docs table shows, and its value is code)
[^copy]: scripts/claims.test.mjs verify:testExists(scripts/claims.test.mjs::TypeScript copy: claim() calls are claims, unsourced prose literals and JSX text fail)
[^copy-read]: scripts/claims.test.mjs verify:testExists(scripts/claims.test.mjs::TypeScript copy: Markdown templates, lowercase and unpunctuated strings and comma templates are read) verify:testExists(scripts/claims.test.mjs::TypeScript copy: a footnote in a Markdown template is a claim, and a false check in it fails) verify:testExists(scripts/claims.test.mjs::TypeScript copy: a string of only a number and a noun is read) verify:testExists(scripts/claims.test.mjs::TypeScript copy: claim() calls are claims, unsourced prose literals and JSX text fail)
[^generated]: scripts/claims.test.mjs verify:testExists(scripts/claims.test.mjs::generated surfaces are linted: registry.json, README regions and llms.txt items, with claims carried from their sources)
[^sources]: scripts/claims.test.mjs verify:testExists(scripts/claims.test.mjs::verify: sources must exist where they can be checked offline)
[^offline]: scripts/claims.test.mjs verify:testExists(scripts/claims.test.mjs::verify: each check passes on what holds and explains what does not)
[^required]: scripts/claims.test.mjs verify:testExists(scripts/claims.test.mjs::ciJob reads the required checks at the base ref, so a pull request cannot add its own)
[^url-pinned]: scripts/claims.test.mjs verify:testExists(scripts/claims.test.mjs::verify: urlOk refuses a GitHub file or folder link that follows a branch, and passes a commit permalink)
[^url-in-ci]: scripts/install-test.sh verify:fileLine(scripts/install-test.sh, /grep -c 'z-50' src.components.ui.dialog.tsx/) verify:ciJob(ci.yml#install)
[^url-cache]: scripts/claims.test.mjs verify:testExists(scripts/claims.test.mjs::the URL cache: new or changed entries are fetched again, and an entry no claim cites fails)
[^url-network]: scripts/claims.test.mjs verify:testExists(scripts/claims.test.mjs::verify --network fails when an address no longer answers as the cache says) verify:testExists(scripts/claims.test.mjs::verify --network fails on a committed answer older than the cache's age limit, so the weekly run asks for a refresh)
[^surfaces]: scripts/claims.test.mjs verify:testExists(scripts/claims.test.mjs::surfaces: every tracked prose file is linted or declared generated, evidence or input with a reason) verify:testExists(scripts/claims.test.mjs::the repository's exemptions are narrow: a fixtures folder in shipped code is linted, the install fixtures are not)
[^allowed]: scripts/claims.test.mjs verify:testExists(scripts/claims.test.mjs::the allow-list drops exact story sentences, and an entry that matches nothing fails)
[^ratchet]: scripts/claims.test.mjs verify:testExists(scripts/claims.test.mjs::exemptions ratchet against the base ref: a new one must carry a reason and be named in the pull request)
[^ratchet-narrow]: scripts/claims.test.mjs verify:testExists(scripts/claims.test.mjs::exemptions ratchet against the base ref: a new one must carry a reason and be named in the pull request)
[^app]: scripts/claims.test.mjs verify:testExists(scripts/claims.test.mjs::the claims checker ships in lib-claims and runs in an app)
[^required-bootstrap]: scripts/claims.test.mjs verify:testExists(scripts/claims.test.mjs::ciJob reads the pull request's list of required checks only when the base has none, and the ratchet makes it name each check it adds)
