# The conformance matrix

Some review findings come back again and again: focus lost when a control disappears, server HTML that a reader in another time zone or locale cannot hydrate, a part on the wrong side in a right-to-left page, a control that vanishes under forced colours, a message announced twice. The conformance matrix turns each of them into a check that runs on every story, so a new component is covered the day it gets a story, with nothing to opt into and no checklist to remember.

```sh
pnpm conformance                                  # every check, every story (Chromium)
pnpm conformance test/conformance/rtl.test.tsx    # one check
pnpm conformance -t "SegmentedControl/"           # one component's stories, every check
OURO_STORIES=pagination pnpm conformance          # the stories of the folders a change touches
OURO_CONFORMANCE_SHARD=2/4 pnpm conformance       # one CI shard: every 4th story from the 2nd
```

The checks live in `test/conformance/` and run in their own Vitest project, `conformance` (Chromium only, `OURO_CONFORMANCE=1`), so `pnpm test` leaves them out. CI's `conformance` job runs them in shards (`OURO_CONFORMANCE_SHARD`), each shard every *n*th story, so the shards take about as long as each other; on a pull request it renders only the stories `scripts/test-impact.mjs` selects, as the other shared suites do.

## The checks

| Recurring finding | Check | File |
| --- | --- | --- |
| Focus lost when a control disappears | Each story's controls are used one after another: a press on each button, link, checkbox, tab or option (Enter for one shown only to screen readers), a character typed into each field, an arrow key on each slider and scrollable region, and Escape for each popup the actions open. After every action, focus must be on an element still in the page and shown. | `interactions.test.tsx` |
| A message announced twice | Every one of those actions runs inside `watchAnnouncements`: a live region announcing the same text twice in one action fails. | `interactions.test.tsx` |
| Server/client mismatch | Every story is rendered to HTML as a server in UTC and en-US would, then hydrated in America/Los_Angeles with de-DE and in Asia/Tokyo with ja-JP. A recoverable error or an attribute mismatch fails. | `hydration.test.tsx` |
| Right to left | Every story renders with `dir="rtl"` on `<html>`, closed and with each overlay open, at 390px and 1280px: nothing may stick out of the viewport sideways. | `rtl.test.tsx` |
| Physical sides in the source | `physicalUtilities` in `scripts/source-rules.mjs` fails on `left-*`, `right-*`, `ml-*`, `mr-*`, `pl-*`, `pr-*`, `border-l`, `border-r`, `rounded-l-*`, `rounded-r-*`, the corner radii, `text-left`, `text-right`, `float-*` and `clear-*` on a side, unless `physicalAllowed` lists the class with its reason. | `scripts/source-rules.test.mjs` |
| Forced colours | Under `forced-colors: active`, closed and with each overlay open: every box a person presses, types into, drags or scrolls keeps an edge (a border or outline on it, inside it or on its component's frame); a checked, selected, pressed or current control looks different from one that is not; and focusing each control from the keyboard changes what its component shows. | `forced-colors.test.tsx` |

Motion is already held the same way, by `pnpm motion:coverage`.

### Why a check fails, and the fix

- **"focus fell to `<body>`"**: the control you used left the page, or became disabled, while it held focus. A component that a press removes hands focus on before it goes: `useFocusHandoff` (`registry/ouro/lib/ouro/focus-handoff.ts`) moves it to what now stands where the element stood (Alert, Attachment and Toast use it). A control that becomes unavailable where it is says so with `aria-disabled` and keeps focus, as Pagination's Previous and Next do at the ends. When the story's own code removes the control (a demo's "show it again" button), keep the control on the page.
- **A hydration mismatch**: render nothing that depends on the time zone, the locale, the clock or randomness on the server and in hydration. Read it with `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)`, whose server snapshot is the same everywhere, and fill it in once hydrated (Calendar's today, Slider's value samples without a `locale`).
- **Overflow in a right-to-left page**: a part placed by a physical side lands on the wrong one. Use `start-*`/`end-*`, `ms-*`/`me-*`, `ps-*`/`pe-*`, `border-s`/`border-e`, `rounded-s`/`rounded-e` and `text-start`/`text-end`, and `rtl:` for a transform that must reverse (SegmentedControl's thumb).
- **"no edge"**: forced colours drop fills and shadows. Add a border that only forced colours draw, `forced-colors:border forced-colors:border-solid`, or for a scrollable region that is a tab stop, an outline: `forced-colors:[&[tabindex='0']]:outline-1 forced-colors:[&[tabindex='0']]:outline-solid`.
- **"on looks like off"**: the state was a fill. Paint it with the system's pair, `forced-colors:data-pressed:bg-[Highlight] forced-colors:data-pressed:text-[HighlightText]` (Tabs' and SegmentedControl's selected item).
- **"focus shows nothing"**: the focus ring was a box shadow. Draw it with `outline`, which forced colours keep.

## Declaring an exception

A check never guesses. When a story does something on purpose that a check would fail, it says so in its `parameters.conformance` (`ConformanceParameters` in `test/stories.tsx`), with the reason, and the check fails once the declaration is no longer true:

- `focusExit: { "<control's accessible name>": "<why>" }`: using that control deliberately takes focus out of the page. A declared control whose action keeps focus fails, so the declaration cannot go stale.
- `announces: { "<control's accessible name>": "<text>" }`: one action on that control must announce the text exactly once.
- `clientOnly: "<why>"`: the story cannot render on a server, so its hydration is not checked; once it does render on a server, the check fails until the declaration goes.

A physical side that must follow the screen, not the text (a part centred with `left-1/2 -translate-x-1/2`, a safe-area inset, a sheet whose `side` prop is physical), goes in `physicalAllowed` in `scripts/source-rules.mjs` with its reason; an allowance the source no longer uses fails.

## Tests that cannot fail: mutation testing

A test that passes whatever the code does proves nothing. `pnpm mutation` (`scripts/mutation.mjs`) runs [Stryker](https://stryker-mutator.io/) on the lines a change added or altered in the runtime source (`registry/ouro/components/` and `registry/ouro/lib/ouro/`, not tests, stories or the test kit): it changes each of those lines in every way it knows (a condition flipped, a branch emptied, a `+` made a `-`), one change (a mutant) at a time, and runs the tests. A mutant that no test fails on survived, and the run fails, naming it:

```sh
pnpm mutation                                                     # the working tree against origin/main
pnpm mutation origin/main --only registry/ouro/lib/ouro/cn.ts     # one file's changed lines
```

Each survivor is reported as `<file>:<line>:<column> <Mutator>: <replacement>`. Fix a survivor with a test that fails on that change. When the change cannot alter behaviour (an equivalent mutant), say why on the line before it, `// Stryker disable next-line <Mutator>: <why>`, so the reason is in the source for the next reader. Two kinds of mutant are left out on purpose: Tailwind class strings, which change how a part looks and which the screenshot tests hold, and the `process.env.NODE_ENV` check that strips development messages, which every test (they all run in development) sees the same way.

The tests run in Chromium through `scripts/mutation/plugins.mjs`, a Stryker test runner over one Vitest instance (Stryker's own Vitest runner has no browser mode). Each mutant runs only the tests of the file it is in: that file's own tests first (its component folder's, or a `lib/` file's own test file), stopping at the first failure, then, only if those let it survive, the tests of the components that import that `lib/` file. A large change therefore costs each mutant no more than a small one. CI's `mutation` job runs it on every pull request, over the pull request's changes.

## Ratchets that cannot be talked around: property tests

The two guardrail kits hold a count that may only fall: `ouro-source-rules` the hand-rolled controls in an app's source, `ouro-census` the unmarked controls in each state of each journey. `scripts/kits/ratchets.test.mjs` checks with [fast-check](https://fast-check.dev/) that no edit gets around them. It generates hundreds of baselines, scans, settings, renames and removals from a fixed seed, so a run is deterministic. Each property states what must hold whatever the edit:

- The census accepts a run without a reason exactly when it drops no state and raises no state's unmarked count. Every rise and drop it accepts with a reason is recorded with that reason and the counts it moves between. A rename that adds unmarked controls needs a reason. Updating a baseline from itself records nothing.
- The source rule reports a settings change whenever the head's settings stop reading a file the base's settings read. A move stays within its file or component, so a fix elsewhere never pays for a new control: the regressions are never fewer than the controls the scan gained. Against a base ref, the check fails, and `--write-baseline` writes nothing, exactly when a file gained controls with no recorded reason.

A failing property prints the smallest case it found and the seed. Add that case to the kit's own tests (`scripts/kits/*.test.mjs`) when you fix it. The property tests run in `pnpm test:scripts` (`scripts/kits.test.mjs`), under the kits' 100% coverage.
