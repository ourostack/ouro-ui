# Ouro Current

Ouro Current is our own Dependabot for Ouro UI. Install the [Ouro Current GitHub App](https://github.com/apps/ouro-current) on a repository, and when Ouro UI, Ouro UI core or Ouro UI for Apple releases, that repository gets one small pull request, "Update to Ouro UI vX", with auto-merge on. Nothing else to set up: it finds the pin files by their names.

## What it does

- **Finds the pins by name** in the repository's default branch:[^find] an Ouro HX install record (`.github/ouro-hx-installed.json`), a file vendored from an ouro-ui-core release (`ouro-ui-core/pin.json`), files vendored from a commit (`upstream-sources.lock.json`), SwiftPM (`Package.swift`, `Package.resolved`), XcodeGen (`project.yml`), an Xcode project (`project.pbxproj`), and a workflow's `OURO_UI_TAG`.
- **Moves each pin to the newest release** and writes what that release would install.[^versions] An Ouro HX file takes the new tag's source, rewritten to the app's aliases as the shadcn CLI rewrites it, and the install record keeps the source's hash.[^hx] Each file stays where the install record has it, so an app that keeps Ouro check in `lib/ouro/check/` apart from its components in `src/` is updated in place, and a file an item gains goes beside that item's other files.[^placement]
- **Keeps one pull request per repository** on the branch `ouro-current/update`, and updates it in place when a newer release comes.[^one-pr] It pushes nothing when the update is already there, and closes its pull request when the repository caught up on its own.[^caught-up]
- **Writes a pull request a claims check accepts**: versions and file names in code spans, no counts, so a repository that runs Ouro UI's claims check on pull requests does not fail the update.[^claims]
- **Keeps a lock file's layout**: in `upstream-sources.lock.json` it changes only the followed source's commit and its files' hashes, and every other byte stays as the repository wrote it.[^lock]
- **Does what the repository asks of a change**, when it declares that in `.github/ouro-current.json`, the way Dependabot reads `.github/dependabot.yml`.[^rules] `version` lists the files that carry the app's version, with a pattern whose first group is the version; when the repository has a published release at or past it, the update moves those files to the next patch.[^rules] `changelog` is a fragment to add, its `path` and `text` taking `{version}` and `{releases}`.[^rules]

  ```json
  {
    "version": [{ "path": "Sources/App/Release.swift", "pattern": "static let version = \"([0-9]+\\.[0-9]+\\.[0-9]+)\"" }],
    "changelog": { "path": "changes/ouro-ui-{version}.md", "text": "Uses {releases}.\n" }
  }
  ```

- **Turns on auto-merge**, squash where the repository allows it, else a merge commit.[^auto-merge] The repository's own checks decide whether it merges.

## What it leaves alone

- It never writes to a default branch, and never merges anything itself.[^one-pr]
- It never overwrites a file that differs from what the install wrote, and names that file in the pull request instead.[^hx]
- It never names a private repository in public: not in the run's log, and not on the page.[^private]

## How it runs

[`.github/workflows/ouro-current.yml`](../../.github/workflows/ouro-current.yml) runs on a release here, and twice an hour for core and Apple releases. It signs in as the app (a JWT from the private key in `OURO_CURRENT_PRIVATE_KEY`, the app ID in `OURO_CURRENT_APP_ID`), takes a short-lived token for each installation, and keeps every repository that installation can see.[^jwt] A failed GitHub request is tried again.[^retry] A repository that still fails is reported while the others go on, and the run opens or comments on one issue, "Ouro Current could not update a repository", which it closes after a clean run.[^failure]

The list of who it keeps current is `current.json` on the `adoption-data` branch. For a repository the app is not installed on yet, `--with-token` opens the same pull request with your own token.[^with-token]

```sh
node --test scripts/current/current.test.mjs                                   # the tests, with GitHub faked
GH_TOKEN=$(gh auth token) node scripts/current/current.mjs --dry-run --only owner/repo   # what it would change; writes nothing
GH_TOKEN=$(gh auth token) node scripts/current/current.mjs --with-token --only owner/repo   # the same pull request, opened with your token
```

[^with-token]: test:scripts/current/current.test.mjs::--with-token opens the update with GH_TOKEN, only for the repositories named verify:testExists(scripts/current/current.test.mjs::--with-token opens the update with GH_TOKEN, only for the repositories named)
[^find]: test:scripts/current/current.test.mjs::pins are found by file name in every format Ouro UI is taken in verify:testExists(scripts/current/current.test.mjs::pins are found by file name in every format Ouro UI is taken in)
[^versions]: test:scripts/current/current.test.mjs::version pins move to the release, written the way the file writes them verify:testExists(scripts/current/current.test.mjs::version pins move to the release, written the way the file writes them)
[^hx]: test:scripts/current/current.test.mjs::Ouro HX takes the new tag's source as the CLI would write it, adds files its items gained, and leaves an edited file alone verify:testExists(scripts/current/current.test.mjs::Ouro HX takes the new tag's source as the CLI would write it, adds files its items gained, and leaves an edited file alone)
[^placement]: test:scripts/current/current.test.mjs::Ouro HX keeps each file where the install record has it, as a site keeps Ouro check apart from its components verify:testExists(scripts/current/current.test.mjs::Ouro HX keeps each file where the install record has it, as a site keeps Ouro check apart from its components)
[^one-pr]: test:scripts/current/current.test.mjs::one pull request per repository: opened once, left alone when nothing changed, and updated in place verify:testExists(scripts/current/current.test.mjs::one pull request per repository: opened once, left alone when nothing changed, and updated in place)
[^caught-up]: test:scripts/current/current.test.mjs::a repository that caught up on its own has its stale pull request closed verify:testExists(scripts/current/current.test.mjs::a repository that caught up on its own has its stale pull request closed)
[^auto-merge]: test:scripts/current/current.test.mjs::auto-merge falls back to a merge method the repository allows verify:testExists(scripts/current/current.test.mjs::auto-merge falls back to a merge method the repository allows)
[^private]: test:scripts/current/current.test.mjs::every installation runs, a failing repository is reported while the rest go on, and a private one is never named in public verify:testExists(scripts/current/current.test.mjs::every installation runs, a failing repository is reported while the rest go on, and a private one is never named in public)
[^jwt]: test:scripts/current/current.test.mjs::the app signs in with a JWT its public key verifies verify:testExists(scripts/current/current.test.mjs::the app signs in with a JWT its public key verifies)
[^retry]: test:scripts/current/current.test.mjs::requests are retried on a server error or rate limit, and not on a refusal verify:testExists(scripts/current/current.test.mjs::requests are retried on a server error or rate limit, and not on a refusal)
[^failure]: .github/workflows/ouro-current.yml verify:fileLine(.github/workflows/ouro-current.yml, /Ouro Current could not update a repository/)
[^claims]: test:scripts/current/current.test.mjs::the pull request's title and body pass Ouro UI's claims check, which a repository may run on pull requests verify:testExists(scripts/current/current.test.mjs::the pull request's title and body pass Ouro UI's claims check, which a repository may run on pull requests)
[^lock]: test:scripts/current/current.test.mjs::a vendored source changes only its own values in the lock, every other byte kept as the repository lays it out verify:testExists(scripts/current/current.test.mjs::a vendored source changes only its own values in the lock, every other byte kept as the repository lays it out)
[^rules]: test:scripts/current/current.test.mjs::a repository's own rules ride along: its version moves past its latest release, and its changelog fragment is added verify:testExists(scripts/current/current.test.mjs::a repository's own rules ride along: its version moves past its latest release, and its changelog fragment is added)
