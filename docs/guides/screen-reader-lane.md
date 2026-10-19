# The screen-reader lane

Ouro UI's components are read by real screen readers before every release: VoiceOver on macOS and NVDA on Windows, driven through [Guidepup](https://www.guidepup.dev/) in this repository's CI. This page lists what the lane checks, how a failure is classified, how to run it, and why it may change a runner's settings.

## What it checks

Each spec opens one story from a static build of this repository's Storybook, waits for the component to render, starts the screen reader, moves it into the page and asserts what it says: the control's name, its role and its state, then the change after a key press.

| Spec | Story | What the screen reader must say |
| --- | --- | --- |
| Checkbox | `forms-checkbox--playground` | "Email me new recipes", checkbox, unchecked; then checked after Space |
| Checklist | `lists-checklist--in-context` | the first item's name, checkbox and its state; then the other state after Space |
| Dialog | `overlays-dialog--playground` | "Edit", button; "Edit recipe", dialog, as it opens; the "Edit" button again after Escape |
| Select | `forms-select--playground` | "Course", combo box, collapsed; the list as it opens; "Main", then "Side"; "Course" with "Side" once chosen, read from the focused control |
| Toast | `feedback-toast--playground` | "Save recipe", button; "Recipe saved" from the live region after Enter |

The Checklist spec skips, with that reason, until `registry/ouro/components/ouro/checklist/` exists; once it does, a missing story fails the lane. Before either screen reader starts, the `stories` project checks every story id against the built Storybook's `index.json`.

VoiceOver reads WebKit on `macos-15`; NVDA reads Chromium on `windows-2025`. Each matcher accepts both readers' words (VoiceOver says "unchecked" where NVDA says "not checked", and "checkbox" where NVDA says "check box"), so the specs hold for both, but it must find a control's name and its role in one sentence of one spoken phrase (`inOneSentence` in `registry/ouro/e2e/screen-reader/phrases.ts`). Phrases are never joined, VoiceOver's hints ("You are currently on a button…", "To display a list of options…") are cut off first, and the reader's item text, which can run on into the next control, is never counted. So "Shakshuka Name edit text" (the dialog's text field) with a hint saying "button" does not pass for the Edit button; NVDA's "clickable, Edit, button, collapsed, opens dialog" does (`scripts/sr-phrases.test.mjs` holds both).

The specs wait for speech, never for a fixed time. NVDA's phrases come from Guidepup's capture, which logs everything NVDA says. VoiceOver lets AppleScript read only its last phrase, and Guidepup's capture reads it again only after waiting as long as that phrase takes to say: after a long hint, it missed the short phrase that named the newly focused control ("Edit dialog pop up button") and read the next hint, so the Dialog spec failed at random. On VoiceOver, `heard` instead watches the last phrase every 20 ms from one osascript process, and logs every phrase it read (`watchVoiceOver` in `screen-reader.ts`). The watch first has VoiceOver say "Speech check" (`MARK` in `phrases.ts`) and runs the action once that is VoiceOver's last phrase, so nothing said before the action counts, and a control VoiceOver was already on still counts when it says it again as focus arrives. Then it checks each new phrase as it is read, for up to 15 s.

VoiceOver starts for each test, as @guidepup/playwright's fixture starts it. NVDA starts once for each Playwright worker and quits after its last test (`registry/ouro/e2e/screen-reader/nvda.ts`): `nvda.stop()` returns while NVDA is still unloading its helper from the browser, and quitting between tests failed a passing test's context close ("browserContext.close: Test ended.") or took the shared browser down, so the next test could not open a context. Before each test NVDA is moved to the page as Guidepup's `navigateToWebContent` does, and the test fails as **infrastructure** when NVDA still reports another window (once it read "Start, window" and the test hung). Each test closes its own browser context, and stopping a screen reader gives up after 30 s; anything that goes wrong there is logged as `[sr] teardown:` and does not fail a test that passed.

## Known findings

- VoiceOver with WebKit says Select's value without its last three characters ([ourostack/ouro-ui#113](https://github.com/ourostack/ouro-ui/issues/113)): ", Choose a cou, Course, list box pop up" for the placeholder "Choose a course", and ", S, Course" once "Side" is chosen, both as focus arrives and when asked to describe the control (VO-F4). It reads the options whole ("Main (2 of 4)"), and NVDA reads the value whole ("Course, combo box, Side, collapsed"). The Select spec accepts that clipped form on VoiceOver only, and only with the label in the same sentence, and logs it as `[sr] finding (ourostack/ouro-ui#113):`; the next step is to tell WebKit's reading of a `button` with `role="combobox"` apart from the markup Base UI renders.
- As the Select list opens, VoiceOver can read the first option before it has its name ("selectable (null)"); the spec only logs that moment and checks each move once the list is open.

## When it runs

- Nightly, on main (`.github/workflows/screen-reader.yml`).
- Before every release: `release.yml` dispatches the lane on its release branch with `source_sha` set to the release commit, and tags that commit only when the run concluded `success` for that exact SHA.
- By hand: `gh workflow run screen-reader.yml --ref <branch> -f source_sha=<the branch's tip SHA>`. The lane refuses any other commit.

It never runs for a pull request.

## How a failure is classified

`scripts/sr-classify.mjs` reads the log and the exit code of `pnpm test:sr`:

- **accessibility**: an expected utterance was missing or wrong, or a story the lane opens is missing. This fails the run and blocks a release.
- **infrastructure**: VoiceOver or NVDA did not start or could not be controlled, a TCC prompt appeared, a test timed out before the screen reader said anything, the Storybook server never became ready, the runner image was broken, or every error in the run is the browser failing to open or close a test's context, which only the fixtures around a test do (a missing utterance, a failed `expect` or any other error in the run makes it **accessibility**). A nightly run opens, or comments on, one issue labelled `screen-reader-infra` (`scripts/sr-infra-issue.sh`); a release dispatches the lane once more and stops after a second infrastructure failure, with that issue.

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
