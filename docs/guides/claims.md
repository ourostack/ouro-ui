# Claims

A factual sentence in this repository is a claim: it carries the primary source it comes from and a check that it still holds, so the next reader, person or agent, can trust it without rebuilding the proof. `pnpm claims:check` fails on a factual sentence that is not a claim, and on a claim whose check no longer holds.[^repo-passes]

## The three commands

```sh
pnpm claims:check               # lint every surface, then run every claim's checks (CI runs this)
pnpm claims:lint <file>…        # the same for some files; --pr for a pull request, --stdin for a draft
pnpm claims:show <file>…        # each claim in a file, its sources, and whether each check holds
```

`pnpm claims:check` runs in the `ci` job, and the Claims workflow lints each pull request's title and body when it opens and whenever the description is edited.[^ci]

## What needs a source

The lint reads every sentence outside code and asks whether it sounds factual.[^triggers] A sentence does when it has a number, a version or a date, or one of these words: "tested", "accessible", "every", "all", "works with", "supports", or a superlative such as "fastest" or "most".[^triggers] Such a sentence must be a claim.

Instructions need no source, so a sentence that starts with a verb from the lint's short list ("Run pnpm test", "Don't add a class"), or with a condition and then one ("If it fails, run it again"), passes, and so does a question.[^instructions] Words inside code spans, link addresses and URLs are not prose, so `size="lg"` or a `#v1.1.0` in an install command never trips it. In the files `pnpm run docs` keeps on the newest release, a `#vX.Y.Z` or `@vX.Y.Z` tag is already checked against `ouro.latestRelease`.[^release-tags]

A failure names the file, the line, the sentence, what kind of claim it makes and what kind of source that needs:

```text
README.md:12: "Ships 73 components." states a number. Cite where it comes from, checked with verify:count(registry:ui)=<n> …
```

When a sentence cannot be sourced, it is not a claim we can make: correct it, or remove it.

## Writing a claim

### In Markdown

A source link: the words, a link to the source, and a title that starts with `verify:`. The link is an ordinary Markdown link, relative to the file.

```md
Ouro HX ships [73 components](registry.json "verify:count(registry:ui)=73").
```

A footnote, when the source is a test or there are several, or one source covers several sentences. Each sentence that cites it is a claim.

```md
Every story passes axe in light and dark.[^axe]

[^axe]: test/stories.test.tsx verify:testExists(test/stories.test.tsx::stories > pass axe) verify:ciJob(ci)
```

A footnote's sources are repository paths (separate several with `;`), and each `verify:` adds a check. On the site, footnotes gather into a Sources list at the end of the page, each source linked on GitHub.[^site]

### In JSDoc

An `@claim` tag covers its whole comment, so keep a comment to one subject.

```ts
/**
 * At least 44px tall on a coarse pointer.
 *
 * @claim registry/ouro/lib/ouro/touch-target.tsx verify:fileLine(registry/ouro/lib/ouro/touch-target.tsx, /44px/)
 */
```

`pnpm run docs` leaves the tag out of the generated pages; the source stays one click away in the file the page is generated from.

### In TypeScript copy

`claim()` from the `lib-claims` item returns its text unchanged and carries the evidence beside it. Keep both arguments literal, so the check can read them.

```tsx
import { claim } from "@/lib/ouro/claims";

export const SUBLINE = claim("Every tap is tested in real browsers.", {
  source: { file: "test/stories.test.tsx" },
  verify: [{ ciJob: "ci" }, { testExists: "test/stories.test.tsx::stories > pass axe" }],
});
```

## Sources

| Source | Markdown and JSDoc | `claim()` |
| --- | --- | --- |
| A repository file, at a line and commit | `scripts/claims.mjs#L12@c752a8bb` | `{ file, line?, commit? }` |
| A CI run | `https://github.com/<owner>/<repo>/actions/runs/<id>` | `{ ciRun }` |
| A test | `test:<file>::<full test name>` | `{ test }` |
| A specification or document | its address | `{ spec }` |
| A committed evidence file | `evidence:<path>` | `{ evidence }` |

A source outside the repository (a desk note, a local log) cannot be checked by the next reader: commit it as evidence first.

## Checks

| Check | Holds when |
| --- | --- |
| `count(<what>)=<n>` | There are exactly n: registry items of a type (`registry:ui`), entries in a folder (`dir:<path>`), or items in a JSON array or object (`<file>#<field path>`). |
| `equals(<file>#<field path>)=<value>` | The JSON field is exactly that value. |
| `fileLine(<path>[#L<line>], /<pattern>/)` | The file, or that line of it, matches the regular expression. |
| `testExists(<file>::<full test name>)` | The test exists, is not skipped, and a required CI job runs its file, so a green main means it passed. |
| `ciJob([<workflow>#]<job>)` | A workflow defines the job, by id or name. |
| `urlOk(<url>)` | The address answered with a success status when last checked. |

The checks read only the checkout, so they give the same answer on every machine.[^offline] `urlOk` reads its answers from `scripts/claims-urls.json`: after adding one, run `pnpm claims:check --network`, which asks each address again, and commit the file.

## Surfaces

Every tracked prose file is linted unless it is declared generated, evidence or input, with its reason, in `scripts/claims.mjs`.[^surfaces] Markdown and text files are read as Markdown; registry source files, for their JSDoc; the site's source files, for their copy, string literals and JSX text. A generated file is held to its source another way: the docs pages and the README catalog by `pnpm run docs --check` over the JSDoc this check lints, the comparison pages by rendering them again from the scored runs.

[^repo-passes]: scripts/claims.test.mjs verify:testExists(scripts/claims.test.mjs::checkClaims over the repository: every surface passes)
[^ci]: .github/workflows/ci.yml; .github/workflows/claims.yml verify:fileLine(.github/workflows/ci.yml, /pnpm claims:check/) verify:fileLine(.github/workflows/claims.yml, /types: \[opened, edited, synchronize, reopened\]/)
[^triggers]: scripts/claims.mjs verify:testExists(scripts/claims.test.mjs::triggers: numbers, versions, dates and the words that make a sentence a factual claim)
[^instructions]: scripts/claims.mjs verify:testExists(scripts/claims.test.mjs::instructions are allowed: imperatives, conditional imperatives and questions)
[^release-tags]: scripts/claims.mjs; scripts/latest-release.mjs verify:fileLine(scripts/latest-release.mjs, /releaseMismatches/) verify:fileLine(scripts/claims.mjs, /syncedFiles\.includes\(file\)/)
[^site]: site/src/docs/markdown.tsx verify:fileLine(site/src/docs/markdown.tsx, /kind: "sources"/)
[^offline]: scripts/claims.mjs verify:testExists(scripts/claims.test.mjs::verify: each check passes on what holds and explains what does not)
[^surfaces]: scripts/claims.mjs verify:testExists(scripts/claims.test.mjs::surfaces: every tracked prose file is linted or declared generated, evidence or input with a reason)
