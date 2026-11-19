# Ouro UI at a company

Ouro HX is copy-in source: a component is yours to change, which is why an agent can fix what it ships. That suits one team. For a company of many teams it raises questions about ownership: who owns the version the teams get, and who decides when it moves. This guide covers what Ouro ships for them: a registry your company owns, updates that wait for a person, and a report of which apps are behind or have edited what. An npm package isn't offered, because it would take away the edit-in-place model that the checks rely on.

## A registry your company owns

Mirror Ouro's registry at a release you have reviewed into a shadcn registry under your own namespace, such as `@acme/button`. Teams install from the mirror, and one reviewed pull request on the mirror moves the teams that install from it.

```sh
git clone --depth 1 https://github.com/ourostack/ouro-ui
TAG=vX.Y.Z   # the release you reviewed, from https://github.com/ourostack/ouro-ui/releases
node ouro-ui/scripts/mirror/mirror.mjs --tag "$TAG" --namespace @acme --out ./acme-registry
```

The script reads the tag's `registry.json`, which only a release tag has, and the files it lists, from GitHub at that tag.[^mirror-read] Pass `--source <folder>` to read them from a checkout of the release instead. It writes:

- `r/<item>.json`, one per item, with the contents of its files inside and its dependencies on other Ouro items pointed at your namespace (`@acme/lib-cn`), in the shape the public `@ouro` namespace has.[^mirror-shape]
- `r/registry.json`, the index.
- `mirror.json`, which records the source tag of the items, the sha256 of each source file, and the sha256 of the item's own JSON.[^mirror-record] The file hash is the one an install record holds, so a team's record and the mirror agree on what a file was.

Host the `r/` folder anywhere that serves files, and point teams at it once in their `components.json`:

```json
{ "registries": { "@acme": "https://registry.acme.example/r/{name}.json" } }
```

Then `npx shadcn@latest add @acme/ouro-base` once per app and `npx shadcn@latest add @acme/dialog` for a component, as the [installing guide](installing.md) does for `@ouro`.

To move to a new release, run the script again with its tag and review the pull request: an item whose source changed has a different hash in `mirror.json`, and one that did not has the same. `--check` builds the mirror in memory and lists each item whose file under `--out` is missing, changed or extra, for the mirror repository's own CI.[^mirror-check] The script stops on a registry that is not a release's, on the public `@ouro` namespace and on an `--out` folder that is not a mirror.[^mirror-refuses]

An app that installs from your mirror should not also let Ouro Current move it to a release your company has not reviewed. Leave its install record out of Current's reach in the app's `.github/ouro-current.json`:

```json
{ "ignore": [".github/ouro-hx-installed.json"] }
```

A pin file named there stays where it is.[^ignore]

## Updates that wait for a person

Ouro Current opens its update pull request with auto-merge on. For a repository whose governance wants a person to approve a change, name a review team in `.github/ouro-current.json`:

```json
{ "review": { "team": "design-system" } }
```

Current then opens the update with auto-merge off and asks that team to review it, when the pull request opens and after a push.[^review] The team is a slug in the organisation that owns the repository, or `"acme/design-system"`; one outside it fails that repository's run with the fix.[^review-bad] Current's [README](https://github.com/ourostack/ouro-ui/blob/main/scripts/current/README.md) lists the rest of what it reads from that file.

## Who is behind, and who has edited what

The drift report reads an app's Ouro HX install record, `.github/ouro-hx-installed.json`: the tag the app installed from, and the sha256 of the source of the files it installed. For the apps you give it, it lists the Ouro items the app has, the release it is on, and which of their files differ from that release's source.[^drift-states]

```sh
node ouro-ui/scripts/drift/drift.mjs ../spoonjoy ../recipes --latest "$TAG"
```

The report takes the registry source at the record's tag, rewrites it as the shadcn CLI does for the app's `components.json` aliases, and compares it with the file in the checkout. A file is `released` when they are the same, `edited` when they differ, `missing` when the app no longer has it, and `unlisted` when that release's registry no longer lists it.[^drift-states] An app whose record names an older release than `--latest` (or, without it, GitHub's newest release) is behind.[^drift-behind] `--json` prints the report as JSON, and `--strict` exits 1 when an app is behind, has a file that is not as released, or has no install record, so a company's CI can fail on drift.[^drift-cli]

The report uses what an install leaves in an app: the install record, which Ouro Current also reads, and `components.json`. An app without a record can write one from a checkout of Ouro UI that has the tag, with `node scripts/current/local-update.mjs <app> --record <tag>`.[^record] The report covers Ouro HX items; Ouro Current's `--dry-run --only <owner/repo>` also reports a repository's pins of the core and Apple releases.[^dry-run]

[^mirror-read]: test:scripts/mirror/mirror.test.mjs::without a checkout it reads the tag's registry.json and the files it lists from raw.githubusercontent.com verify:testExists(scripts/mirror/mirror.test.mjs::without a checkout it reads the tag's registry.json and the files it lists from raw.githubusercontent.com) verify:testExists(scripts/mirror/mirror.test.mjs::a registry that is not a release's, a missing file, a path outside registry/, a bad tag and a bad namespace each fail with the fix)
[^mirror-shape]: test:scripts/mirror/mirror.test.mjs::a mirror carries each file's contents and is what the public namespace build is, byte for byte, under another name verify:testExists(scripts/mirror/mirror.test.mjs::a mirror carries each file's contents and is what the public namespace build is, byte for byte, under another name) verify:testExists(scripts/mirror/mirror.test.mjs::a mirror points every dependency on an item of this repository at the company's namespace, and keeps any other)
[^mirror-record]: test:scripts/mirror/mirror.test.mjs::mirror.json records each item's source tag, the sha256 of each source file and of the item's own JSON verify:testExists(scripts/mirror/mirror.test.mjs::mirror.json records each item's source tag, the sha256 of each source file and of the item's own JSON)
[^mirror-check]: test:scripts/mirror/mirror.test.mjs::the command writes the mirror from a checkout of the tag, and --check says whether a folder still is it verify:testExists(scripts/mirror/mirror.test.mjs::the command writes the mirror from a checkout of the tag, and --check says whether a folder still is it)
[^mirror-refuses]: test:scripts/mirror/mirror.test.mjs::the command will not write into a folder that has an r/ folder and no mirror.json verify:testExists(scripts/mirror/mirror.test.mjs::the command will not write into a folder that has an r/ folder and no mirror.json) verify:testExists(scripts/mirror/mirror.test.mjs::a registry that is not a release's, a missing file, a path outside registry/, a bad tag and a bad namespace each fail with the fix)
[^ignore]: test:scripts/current/current.test.mjs::a core manifest a lock vendors is the lock's, a repository never follows itself, and its rules can leave a pin alone verify:testExists(scripts/current/current.test.mjs::a core manifest a lock vendors is the lock's, a repository never follows itself, and its rules can leave a pin alone)
[^review]: test:scripts/current/current.test.mjs::a repository that names a review team gets its update with auto-merge off and that team asked to review (#2296) verify:testExists(scripts/current/current.test.mjs::a repository that names a review team gets its update with auto-merge off and that team asked to review (#2296))
[^review-bad]: test:scripts/current/current.test.mjs::a review setting that is not a team in the repository's own organisation fails the repository with the fix (#2296) verify:testExists(scripts/current/current.test.mjs::a review setting that is not a team in the repository's own organisation fails the repository with the fix (#2296))
[^drift-states]: test:scripts/drift/drift.test.mjs::a file the app changed is edited, a file it deleted is missing, and each is named under its item verify:testExists(scripts/drift/drift.test.mjs::a file the app changed is edited, a file it deleted is missing, and each is named under its item) verify:testExists(scripts/drift/drift.test.mjs::a file the release's registry no longer lists is unlisted, since there is nothing to compare it with)
[^drift-behind]: test:scripts/drift/drift.test.mjs::an app on an older release is behind the newest, and with no newest release behind is unknown verify:testExists(scripts/drift/drift.test.mjs::an app on an older release is behind the newest, and with no newest release behind is unknown)
[^drift-cli]: test:scripts/drift/drift.test.mjs::the command prints text or JSON, and --strict exits 1 for an app that drifted verify:testExists(scripts/drift/drift.test.mjs::the command prints text or JSON, and --strict exits 1 for an app that drifted)
[^dry-run]: test:scripts/current/current.test.mjs::a dry run reports a repository that fails and goes on to the next, then exits nonzero verify:testExists(scripts/current/current.test.mjs::a dry run reports a repository that fails and goes on to the next, then exits nonzero)
[^record]: scripts/current/local-update.mjs verify:fileLine(scripts/current/local-update.mjs, /node scripts\/current\/local-update\.mjs <app> --record <tag>/)
