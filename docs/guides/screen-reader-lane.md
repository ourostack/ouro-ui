# The screen-reader lane

Ouro UI's components are read by real screen readers before every release: VoiceOver on macOS and NVDA on Windows, driven through [Guidepup](https://www.guidepup.dev/) in this repository's CI. This page lists what the lane checks, how a failure is classified, how to run it, and why it may change a runner's settings.

## What it checks

Each spec opens one story from a static build of this repository's Storybook, waits for the component to render, starts the screen reader, moves it into the page and asserts what it says: the control's name, its role and its state, then the change after a key press.

| Spec | Story | What the screen reader must say |
| --- | --- | --- |
| Checkbox | `forms-checkbox--playground` | "Email me new recipes", checkbox, unchecked; then checked after Space |
| Checklist | `lists-checklist--in-context` | the first item's name, checkbox and its state; then the other state after Space |
| Dialog | `overlays-dialog--playground` | "Edit", button; "Edit recipe", dialog, as it opens; the "Edit" button again after Escape |
| Select | `forms-select--playground` | "Course", combo box, collapsed; the list as it opens; "Main", then "Side"; "Side" once chosen |
| Toast | `feedback-toast--playground` | "Save recipe", button; "Recipe saved" from the live region after Enter |

The Checklist spec skips, with that reason, until `registry/ouro/components/ouro/checklist/` exists; once it does, a missing story fails the lane. Before either screen reader starts, the `stories` project checks every story id against the built Storybook's `index.json`.

VoiceOver reads WebKit on `macos-15`; NVDA reads Chromium on `windows-2025`. Each phrase is matched loosely (VoiceOver says "unchecked" where NVDA says "not checked", and "checkbox" where NVDA says "check box"), so the specs hold for both.

## When it runs

- Nightly, on main (`.github/workflows/screen-reader.yml`).
- Before every release: `release.yml` dispatches the lane on its release branch with `source_sha` set to the release commit, and tags that commit only when the run concluded `success` for that exact SHA.
- By hand: `gh workflow run screen-reader.yml --ref <branch> -f source_sha=<the branch's tip SHA>`. The lane refuses any other commit.

It never runs for a pull request.

## How a failure is classified

`scripts/sr-classify.mjs` reads the log and the exit code of `pnpm test:sr`:

- **accessibility**: an expected utterance was missing or wrong, or a story the lane opens is missing. This fails the run and blocks a release.
- **infrastructure**: VoiceOver or NVDA did not start or could not be controlled, a TCC prompt appeared, a test timed out before the screen reader said anything, the Storybook server never became ready, or the runner image was broken. A nightly run opens, or comments on, one issue labelled `screen-reader-infra` (`scripts/sr-infra-issue.sh`); a release dispatches the lane once more and stops after a second infrastructure failure, with that issue.

## Running it

On a machine set up for screen reader automation (`npx @guidepup/setup setup`, then `npx @guidepup/setup install` in this repository):

```sh
pnpm test:sr --project voiceover   # macOS
pnpm test:sr --project nvda        # Windows
```

The config (`playwright.screen-reader.config.ts`) builds Storybook into `.tmp/storybook-sr` and serves it on port 6006, runs one test at a time, headed, and never retries. The main end-to-end run (`pnpm test:e2e`) ignores `*.sr.spec.ts`.

## Security

Guidepup's setup changes the operating system: on macOS it enables VoiceOver's AppleScript control and writes the TCC database so the runner may automate it; on Windows it installs a portable NVDA. So the lane:

- runs only on GitHub-hosted runners, which are thrown away after the job (a step fails on any other runner);
- checks out only the commit it was given, and only when that commit is the tip of the dispatched branch, so it never runs code fetched by SHA from a fork;
- runs only from its schedule (main) or a dispatch, which needs write access to the repository, and never for a pull request;
- holds `contents: read` and no secrets, with every action pinned to a commit; only the job that files the nightly issue may write issues, and it runs no Guidepup.
