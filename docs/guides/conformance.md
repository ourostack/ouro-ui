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
| A message announced twice | Every one of those actions runs inside `watchAnnouncements`: the same text announced twice in one action fails, whether one live region says it twice or two regions say it once each. | `interactions.test.tsx` |
| Server/client mismatch | Every story is rendered to HTML as a server in UTC and en-US would, then hydrated in America/Los_Angeles with de-DE and in Asia/Tokyo with ja-JP. The server and each reader are separate frames (`frame.tsx`), each with its own copy of every module, so a formatter cached under one locale is never read under another. A recoverable error or an attribute mismatch fails. | `hydration.test.tsx` |
| Right to left | Every story renders with `dir="rtl"` on `<html>`, closed and with each overlay open, at 390px and 1280px: nothing may stick out of the viewport sideways. | `rtl.test.tsx` |
| Physical sides in the source | `physicalUtilities` in `scripts/source-rules.mjs` fails on `left-*`, `right-*`, `ml-*`, `mr-*`, `pl-*`, `pr-*`, `border-l`, `border-r`, `rounded-l-*`, `rounded-r-*`, the corner radii, `text-left`, `text-right`, `float-*` and `clear-*` on a side, unless `physicalAllowed` lists the class with its reason. It also fails on a horizontal translate (`translate-x-*`), a transform origin, a background position or an object position on a side (`origin-left`, `bg-right`, `object-left-top`), which have no logical form, unless the same class list reverses it for right to left with an `rtl:` class of the same kind (`translate-x-4 rtl:-translate-x-4`, `origin-left rtl:origin-right`). | `scripts/source-rules.test.mjs` |
| Forced colours | Under `forced-colors: active`, closed and with each overlay open: every box a person presses, types into, drags or scrolls keeps an edge (a border or outline on it, inside it or on its component's frame); a checked, selected, pressed or current control looks different from one that is not; and focusing each control from the keyboard changes what its component shows, while the highlight moving onto each option or item of a list or menu shows too. A fill in the colour behind it counts as no fill, and a control that never takes keyboard focus there fails as uncompared. | `forced-colors.test.tsx` |

Motion is already held the same way, by `pnpm motion:coverage`.

Each check also proves it can fail. `test/fixtures/conformance/broken.stories.tsx` holds one story per defect, outside Storybook. Each check's "proves it can fail" tests expect it to report that story:

- a button that removes itself when pressed;
- the same text in two live regions;
- a number formatted through a module-level `Intl.NumberFormat` cache;
- a part placed at `left: 100%` in a right-to-left page;
- a focus ring drawn only with a box shadow;
- a button whose only edge is its fill.

These tests run in every conformance run, whatever stories it selects, on the first shard, and in CI even when a pull request changes no component (`pnpm conformance -t "can fail"`). A check changed so that it misses its defect fails there.

### Why a check fails, and the fix

- **"focus fell to `<body>`"**: the control you used left the page, or became disabled, while it held focus. A component that a press removes hands focus on before it goes: `useFocusHandoff` (`registry/ouro/lib/ouro/focus-handoff.ts`) moves it to what now stands where the element stood (Alert, Attachment and Toast use it). A control that becomes unavailable where it is says so with `aria-disabled` and keeps focus, as Pagination's Previous and Next do at the ends. When the story's own code removes the control (a demo's "show it again" button), keep the control on the page.
- **A hydration mismatch**: render nothing that depends on the time zone, the locale, the clock or randomness on the server and in hydration. Read it with `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)`, whose server snapshot is the same everywhere, and fill it in once hydrated (Calendar's today, Slider's value samples without a `locale`). A number or date formatted in the reader's default locale is written in a fixed one on the server and during hydration, then switches: Slider and Progress pass Base UI `locale="en-US"` until hydrated, when no `locale` is given. A story that computes an instant from `Date.now()` at module level rounds it (to the hour), since the server's frame and the reader's load the module at different moments.
- **Overflow in a right-to-left page**: a part placed by a physical side lands on the wrong one. Use `start-*`/`end-*`, `ms-*`/`me-*`, `ps-*`/`pe-*`, `border-s`/`border-e`, `rounded-s`/`rounded-e` and `text-start`/`text-end`, and `rtl:` for a transform that must reverse (SegmentedControl's thumb).
- **"no edge"**: forced colours drop fills and shadows. Add a border that only forced colours draw, `forced-colors:border forced-colors:border-solid`, or for a scrollable region that is a tab stop, an outline: `forced-colors:[&[tabindex='0']]:outline-1 forced-colors:[&[tabindex='0']]:outline-solid`.
- **"on looks like off"**: the state was a fill. Paint it with the system's pair, `forced-colors:data-pressed:bg-[Highlight] forced-colors:data-pressed:text-[HighlightText]` (Tabs' and SegmentedControl's selected item).
- **"focus shows nothing"**: the focus ring was a box shadow. Draw it with `outline`, which forced colours keep.
- **"highlight shows nothing"**: an option's or item's highlight was a fill. Add `forced-colors:data-highlighted:bg-[Highlight] forced-colors:data-highlighted:text-[HighlightText]` (Menu, Select, Combobox, Command). On a link, add `forced-colors:forced-color-adjust-none` with the pair, since Chromium paints a link's background in the canvas colour whatever it is (Pagination's current page).
- **"focus never compared"**: the control took no keyboard focus when focused, or kept it when blurred. Make it reachable from the keyboard: a tab stop, or a roving item its group moves focus onto.

## Declaring an exception

A check never guesses. When a story does something on purpose that a check would fail, it says so in its `parameters.conformance` (`ConformanceParameters` in `test/stories.tsx`), with the reason, and the check fails once the declaration is no longer true:

- `focusExit: { "<data-ouro-control>/<data-ouro-part> <accessible name>": "<why>" }`: using that one control deliberately takes focus out of the page (`"unmarked/? <name>"` for a control the story renders itself). A declared control whose action keeps focus, or that no control is, fails, so the declaration cannot go stale.
- `announces: { "<control's accessible name>": "<text>" }`: one action on that control must announce the text exactly once.
- `clientOnly: "<why>"`: the story cannot render on a server, so its hydration is not checked; once it does render on a server, the check fails until the declaration goes.

A physical side that must follow the screen, not the text (a part centred with `left-1/2 -translate-x-1/2`, a safe-area inset, a sheet whose `side` prop is physical), goes in `scripts/physical-allowed.json` (`physicalAllowed`), by file and class, with its reason; an allowance the source no longer uses fails.

Exemptions only grow on purpose. `scripts/conformance-exemptions.mjs` compares the physical-side allowances, every `focusExit` control and every `clientOnly` with the base branch, as the Conformance exemptions workflow does on each pull request (and again when its description is edited). Each one the pull request adds needs its reason, and the description must name it: the class, the control's key, or the story (`SheetFeel/FeelComparison`).

## Tests that cannot fail: mutation testing

A test that passes whatever the code does proves nothing. `pnpm mutation` (`scripts/mutation.mjs`) runs [Stryker](https://stryker-mutator.io/) on the lines a change added or altered in the runtime source (`registry/ouro/components/` and `registry/ouro/lib/ouro/`, not tests, stories or the test kit): it changes each of those lines in every way it knows (a condition flipped, a branch emptied, a `+` made a `-`), one change (a mutant) at a time, and runs the tests. A mutant that no test fails on survived, and the run fails, naming it:

```sh
pnpm mutation                                                     # the working tree against origin/main
pnpm mutation origin/main --only registry/ouro/lib/ouro/cn.ts     # one file's changed lines
```

Each survivor is reported as `<file>:<line>:<column> <Mutator>: <replacement>`. Fix a survivor with a test that fails on that change. When the change cannot alter behaviour (an equivalent mutant), say why on the line before it, `// Stryker disable next-line <Mutator>: <why>`, so the reason is in the source for the next reader. Any other Stryker comment a change adds to the runtime source fails the run: `disable all` with no reason would silence the rest of the file. The run also reports how many disable comments the source has at the base and now, and fails if that count grew by more than the change shows. Two kinds of mutant are left out on purpose. The first is Tailwind classes where only classes go (a `className`, a `cn()` or `cva()` argument, a `*Class` constant), which change how a part looks and which the screenshot tests hold. An attribute name, a selector or a marker that only looks like classes (`"aria-invalid"`, `closest("[inert]")`, `data-ouro-part`) is still mutated. The second is the `process.env.NODE_ENV` check that strips development messages, which every test (they all run in development) sees the same way.

The tests run in Chromium through `scripts/mutation/plugins.mjs`, a Stryker test runner over one Vitest instance (Stryker's own Vitest runner has no browser mode). Each mutant runs only the tests of the file it is in: that file's own tests first (its component folder's, or a `lib/` file's own test file), stopping at the first failure, then, only if those let it survive, the tests of the components that import that `lib/` file. A large change therefore costs each mutant no more than a small one. CI's `mutation` job runs it on every pull request, over the pull request's changes.

## Ratchets that cannot be talked around: property tests

The two guardrail kits hold a count that may only fall: `ouro-source-rules` the hand-rolled controls in an app's source, `ouro-census` the unmarked controls in each state of each journey. `scripts/kits/ratchets.test.mjs` checks with [fast-check](https://fast-check.dev/) that no edit gets around them. It generates hundreds of baselines, scans, settings, renames and removals from a fixed seed, so a run is deterministic. Each property states what must hold whatever the edit:

- The census accepts a run without a reason exactly when it drops no state and raises no state's unmarked count. Every rise and drop it accepts with a reason is recorded with that reason and the counts it moves between. A rename that adds unmarked controls needs a reason. Updating a baseline from itself records nothing.
- The source rule reports a settings change whenever the head's settings stop reading a file the base's settings read. A move stays within its file or component, so a fix elsewhere never pays for a new control: the regressions are never fewer than the controls the scan gained. Against a base ref, the check fails, and `--write-baseline` writes nothing, exactly when a file gained controls with no recorded reason.

A failing property prints the smallest case it found and the seed. Add that case to the kit's own tests (`scripts/kits/*.test.mjs`) when you fix it. The property tests run in `pnpm test:scripts` (`scripts/kits.test.mjs`), under the kits' 100% coverage.
