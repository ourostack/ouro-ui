# Guardrails

The guardrail kits hold an app to Ouro UI. The **census** (`ouro-census`) measures the running app, page by page and state by state, and the **source rule** (`ouro-source-rules`) reads the app's source and finds the controls still built by hand: their aim is that every control a person can reach is an Ouro control, and the number that are not can only fall.[^ratchets] Each of those two keeps a committed baseline, so every change is a reviewed diff, and each refuses a rise unless you record why.[^baselines] The **screen check** (`ouro-check`) opens the built app's pages at screen sizes from a phone to a wide desktop and finds what a person would see broken.[^check-rules] It keeps no baseline: it fails on any finding that `ouro-check.json` does not waive with a reason.[^check-exit]

Add them from the same place and release tag as your components:

```sh
npx shadcn@latest add ourostack/ouro-ui/ouro-census#v1.3.3 ourostack/ouro-ui/ouro-source-rules#v1.3.3
```

`ouro-census` installs `e2e/ouro-census/` and names `@playwright/test` and `axe-core` as devDependencies. `ouro-source-rules` installs `scripts/ouro-source-rules.mjs` and names `typescript` and `postcss`. Like the test kit, they carry no version, so the CLI installs a package only when your app lacks it.[^kit-versions] The census reads names with axe-core and needs 4.13.0 or later: on an older one it throws before it loads axe into the page, naming the version it found.[^census-axe]

## The census

A control's identity is one line: its role, its accessible name, its Ouro marker and part (`data-ouro-control` / `data-ouro-part`, `-` when there is none) and its context, the nearest landmark, dialog or named group, else the nearest `data-testid`.[^identity] Never its position:

```text
button "Save" [button/root] in main
option "Weekly" [select/item] in dialog "Repeat"
link "Notes" [-/-] in testid "note-actions"
```

A state's census is the exact multiset of its visible controls. Whitespace in names collapses, and a relative time ("2 minutes ago") or a calendar date ("Jun 1, 2026") becomes `<relative time>` or `<date>`, so a name never depends on when the run happened.[^names]

### List the journeys

A journey is a page your app renders, as the visitor who sees it, and the states a person can open on it: dialogs, menus, sheets, popovers, disclosures. Each state starts from a fresh load of the journey's `path`.[^fresh-load] Write its `action` to only open things, never to submit, so the census leaves your test data alone.

```ts
// e2e/census.spec.ts
import { test } from "@playwright/test";
import { censusTests, type Journey } from "./ouro-census/census-page.mjs";

const journeys: Journey[] = [
  { id: "home", enrolled: false, path: "/", states: [{ id: "default" }] },
  {
    id: "note",
    enrolled: true,
    path: "/notes/1",
    storageState: "e2e/.auth/writer.json",
    states: [
      { id: "default" },
      {
        id: "delete-dialog",
        action: async (page) => {
          await page.getByRole("button", { name: "Delete" }).click();
          await page.getByRole("alertdialog").waitFor();
        },
      },
    ],
  },
  { id: "not-found", enrolled: false, path: "/no-such-page", status: 404, states: [{ id: "default" }] },
];

censusTests({ test, journeys, projects: ["chromium", "webkit"], componentsDir: "src/components/ouro" });
```

`projects` lists every Playwright project the spec runs in; a run that leaves one out fails the merge.[^merge-projects] `componentsDir` is where your app installs Ouro components: a marker naming no file there fails an enrolled journey.[^known-items] Pass `prepare` to wait for hydration after each load, and your own `test` to use your fixtures. Each test fails when the page answers another status (`status`, 200 by default) or redirects, since it would measure some other page.[^status]

### Run it and accept changes

Each worker writes its census to `ouro-census/` (or `OURO_CENSUS_DIR`).[^worker-files] After the run, merge them and keep the result as the run's artifact, pass or fail:

```yaml
- run: npx playwright test e2e/census.spec.ts
- if: ${{ !cancelled() }}
  run: node e2e/ouro-census/census-merge.mjs ouro-census census-actual.json
- if: ${{ !cancelled() }}
  uses: actions/upload-artifact@v4
  with:
    name: ouro-census-actual
    path: census-actual.json
```

The merge fails, writing nothing, when any project skipped a state, recorded one twice, or recorded one the list lacks.

Each state must equal `e2e/ouro-census/census.baseline.json` exactly: an added, removed, renamed, re-marked or duplicated control fails with a diff, and a state the baseline lacks fails with "no baseline".[^exact] To accept a change, rewrite the baseline from the run and commit it:

```sh
node e2e/ouro-census/census-update.mjs <run-id>          # downloads the artifact with gh
node e2e/ouro-census/census-update.mjs census-actual.json # or reads a local file
```

The census must be deterministic. Before baselining new journeys, run the same commit twice and compare: `node e2e/ouro-census/census-compare.mjs <run-id> <run-id>` fails, naming every difference, unless both runs recorded the same multisets. Measure lists of run-specific data (this run's users, anything another test creates) in a state that cannot show it, such as a search that matches nothing.

### Enrol and ratchet

An enrolled journey fails on any control without an Ouro marker. An unenrolled one is measured, and its unmarked count may only fall, state by state on each project: a fall in one state never pays for a rise in another.[^per-state] The update refuses a rise unless `--allow-regression "<reason>"` says why, and records it under `$allowedRegressions` until the next update. It also refuses to drop a journey or state the baseline has unless `--remove <journey>` (or `<project/journey/state>`) names it and `--remove-reason "<reason>"` says why; a renamed journey is a drop plus a new one, and may not start with more unmarked controls than the one it replaces. Set `enrolled: true` on a journey once its controls are all Ouro's.

## The source rule

The source rule reads every `.ts` and `.tsx` file under your source folder with the TypeScript compiler, and every `.css` file with PostCSS, skipping the Ouro installs (`components/ouro/`, `lib/ouro/`), tests, stories and declarations.[^scan] It finds:

- a raw `<button>`, `<a>` (and React Router's `Link`), visible `<input>`, `<select>`, `<textarea>`, `<details>`/`<summary>`; a hidden input and the anchor Ouro's `Link` renders through `OuroProvider` are exempt;
- `contentEditable`, a positive `tabIndex`, an interactive `role=`, and click, key, pointer or touch handlers on a plain element;
- any `data-ouro*` attribute your code writes;
- elements from another UI-control library (Headless UI, Radix, Base UI used directly, React Aria, Ariakit, MUI, Chakra, vaul, cmdk, sonner);
- control-state styling: `focus:`, `active:`, `aria-pressed:`, `data-[state=open]:` and the like in a `className`, and stylesheet rules that put such state on a class or a `data-*` hook;
- every use of a component of yours that renders any of these, however deep the wrapping.[^wrappers]
- a spinner standing where content would (`content-spinner`): Ouro's `<Spinner>` or any element with an `animate-spin` class that is returned or assigned on its own, or is the only thing in its element. Show a `Skeleton` shaped like the content instead (`<Skeleton shape="row" count={6}>`), so the content takes its place and nothing moves when it arrives. Inline progress for an action passes: a spinner inside a button, in a prop (a field's adornment, a control's icon), in an object (a toast's or a menu entry's icon), or beside the words that say what is under way. A spinner counts where you write it and never makes the component around it a hand-rolled control.[^content-spinner]

Each offender is a fingerprint, `file::component::category::tag::props`, never a line number, so moving code keeps it.[^fingerprints] Record where your app starts, commit the baseline, then check on every change:

```sh
node scripts/ouro-source-rules.mjs --write-baseline   # the first write records the starting point
node scripts/ouro-source-rules.mjs                    # fails on any difference from the baseline
node scripts/ouro-source-rules.mjs --base origin/main # on a pull request: also no rise against main
```

A new offender fails: use an Ouro component instead, or add the missing one to Ouro UI first. A fixed one fails until `--write-baseline` removes it. Against `--base`, a rise needs `--write-baseline --base <ref> --allow-regression "<reason>"`, which records it for that pull request only. Moving code is neutral: an offender removed and added with the same category, tag and literal props, in the same file or the same component, pairs one-to-one.

Against `--base`, the settings are read at the base too: its `baseline` setting says where its baseline is, and a pull request may only widen what is read. Moving the baseline, another `src`, an `ouroDirs` or `exclude` entry the base did not already skip, or a set or changed `hookPrefix` fails like a rise, and needs the same `--allow-regression "<reason>"`, which records it. A missing baseline is a first baseline, written without a reason, only when the base has neither `ouro-source-rules.json` nor a baseline.

Settings are optional, in `ouro-source-rules.json` at the root:

| Setting | Default | What it sets |
| --- | --- | --- |
| `src` | `src`, or `app` without one | The folder it reads. |
| `ouroDirs` | `<src>/components/ouro/`, `<src>/lib/ouro/` | Where your app installs Ouro UI; never read.[^scan] |
| `exclude` | none | More folders not to read, such as generated code. |
| `hookPrefix` | none | Read stylesheet state only on your own hooks (`.app-…`, `[data-app-…]`), not on every class. |
| `baseline` | `ouro-source-rules.baseline.json` | Where the baseline lives. |

## The screen check

The screen check (`ouro-check`) opens every page of your built app in headless Chromium at every screen size from a 320px phone to a 3840px screen, and four short landscape screens, light and dark, at density 2 up to 3072px wide, the widest real 2x screen, and 1 above it, so a 3840 screen asks for the pictures a 4K monitor shows.[^check-sizes] Each finding records the density it was found at.[^check-sizes] It finds six things, by measurement rather than by looking at pictures:[^check-rules]

| Rule | What it finds |
| --- | --- |
| `overlap` | A line of text drawn over another line, or over a picture, in the same section. |
| `sideways-scroll` | A page wider than the screen, naming the outermost elements that stick out. |
| `clipped-text` | Text cut off by its box. An ellipsis or a line clamp is truncation on purpose and passes while the whole text is still there: in a `title`, an `aria-label`, or the text itself in the accessibility tree.[^check-truncate] |
| `long-lines` | Prose whose lines average more than 100 characters.[^check-long-lines] |
| `blurry-image` | A picture drawn larger than its file's own pixels allow at the screen's density, often a wrong `sizes` on a cropped, height-driven image. |
| `axe` | Serious and critical axe-core violations, at a phone and a laptop size. |
| `broken-image` | A picture that loaded empty: a missing file, or one that is no picture.[^check-pages] |
| `http-error` | A page that answered with a status other than 2xx, or did not answer.[^check-pages] |
| `not-ready` | A page that gave no ready signal in time.[^check-pages] It is checked as it is, but never passes.[^check-pages] |

It also measures how a page responds, each against a budget:[^check-measured]

| Rule | What it measures | Budget |
| --- | --- | --- |
| `layout-shift` | How far the page moved under the reader while it loaded: its cumulative layout shift, scored as browsers score it, leaving out shifts just after input.[^check-shift] The close-up outlines the element whose own shift scored highest.[^check-shift] | 0.1[^check-budgets] |
| `first-content` | How long the page took to draw its largest text or picture, its largest contentful paint.[^check-measured] A skeleton draws neither, so a page that shows one first is timed to the content that replaces it.[^check-measured] | 2500 ms[^check-budgets] |
| `inp` | How long a press of a control took to paint: its longest event, from the press to the next frame drawn after its handlers ran.[^check-measured] | 200 ms[^check-budgets] |

The budgets are the thresholds browsers' own field data calls good.[^check-budgets] Each measured finding records its number, its budget and their unit in `report.json` (`value`, `budget` and `unit`), so a later run can be compared with it.[^check-measured] `inp` presses up to 24 controls a page, at 1440×900 (or the widest size you give) in the first theme, after the contact sheet's shot.[^check-budgets] It presses no link and no form's submit button, and presses Escape after each control to close what it opened, so point it at made-up data.[^check-press] `--no-measure` skips the measured rules, and `ouro-check.json` can change a budget:[^check-measured]

```json
{ "budgets": { "inp": 150, "layout-shift": 0.05, "first-content": 2000 } }
```

A new rule can start without failing a build: waive it on all pages, with the reason, and remove the waiver once its findings are fixed.[^check-shard] This repository's own site does that while the measured rules settle.[^check-site]

Add it, build your app, run it on the built folder (or on URLs), and fix what it reports:

```sh
npx shadcn@latest add ourostack/ouro-ui/ouro-check#v1.3.3
node lib/ouro/check/check.ts dist
```

`ouro-check` installs `lib/ouro/check/` and names `playwright` and `axe-core` as devDependencies, without a version.[^kit-versions] It writes `ouro-check/report.json`, `summary.md`, a contact sheet of every size a page was checked at in `sheets/`, and a captioned close-up of each finding in `findings/`, at most 40 a page.[^check-many] Its exit code is the one every Ouro tool gives, from the Ouro AX kit's table, so it can gate CI:[^check-exit]

| Exit | Meaning |
| --- | --- |
| `0` | Nothing found that `ouro-check.json` does not waive. |
| `1` | An error: the check itself could not run, such as a browser that would not start. |
| `2` | A usage problem, such as a folder that does not exist. |
| `3` | Findings to fix: the summary lists them. |



- `--pages "docs/**"` checks only the pages a glob matches; `--sizes 390x844,1440x900` and `--themes light` narrow the sweep.
- `--shard 1/4` checks the first of four shares, and `node lib/ouro/check/check.ts merge <out folders>…` joins the shares' folders into one report, the same as one run's.[^check-shard]
- `--before <earlier report.json>` adds a captioned before and after for each finding gone since.[^check-before]
- A page that draws after it loads says when it is ready: it fires `ouro:ready` (or an event you name with `--ready-event`), or sets `data-app-ready`. The check waits up to 15 seconds, then checks the page as it is.[^check-ready]

To keep a finding on purpose, mark the element with `data-ouro-allow="<rule>"` and a reason in `data-ouro-allow-why`; an allow without a reason does not count.[^check-allow] To waive a rule on whole pages, list it in `ouro-check.json`, with the reason:

```json
{ "waive": { "docs/legacy/**": { "long-lines": "Imported articles keep their layout until they are rewritten." } } }
```

In GitHub Actions, the check's action runs the shards side by side and merges their reports into the job summary, with the out folder as an artifact:

```yaml
jobs:
  screens:
    strategy:
      matrix:
        shard: [1, 2, 3, 4]
    runs-on: ubuntu-latest
    steps:
      # Check out, install and build first.
      - uses: ourostack/ouro-ui/.github/actions/check@v1.3.3
        with:
          targets: dist
          shard: ${{ matrix.shard }}/4
  screens-report:
    needs: screens
    if: ${{ !cancelled() }}
    runs-on: ubuntu-latest
    steps:
      # Check out and install first.
      - uses: ourostack/ouro-ui/.github/actions/check@v1.3.3
        with:
          merge: "true"
```

[^ratchets]: test:scripts/kits/census-update.test.mjs::the unmarked ratchet > refuses a baseline that raises a state's unmarked count without --allow-regression; test:scripts/kits/source-rules.test.mjs::main > refuses to write a baseline that adds an offender verify:testExists(scripts/kits/census-update.test.mjs::the unmarked ratchet > refuses a baseline that raises a state's unmarked count without --allow-regression) verify:testExists(scripts/kits/source-rules.test.mjs::main > refuses to write a baseline that adds an offender)
[^baselines]: test:scripts/kits/census-update.test.mjs::census-update.mjs > refuses a regression, writing nothing, and accepts it with a recorded reason; test:scripts/kits/source-rules.test.mjs::main > writes a larger baseline only with a stated reason verify:testExists(scripts/kits/census-update.test.mjs::census-update.mjs > refuses a regression, writing nothing, and accepts it with a recorded reason) verify:testExists(scripts/kits/source-rules.test.mjs::main > writes a larger baseline only with a stated reason)
[^census-axe]: registry/ouro/lib/ouro/testing/axe-version.ts verify:fileLine(registry/ouro/lib/ouro/testing/axe-version.ts, /^const axeMinimum = "4\.13\.0";$/) verify:testExists(scripts/kits/census-page.test.mjs::collectCensus > refuses an axe-core older than the kit's minimum before it loads axe into the page, naming the version it found)
[^kit-versions]: test:scripts/registry.test.mjs::devDependencies are named without a version, so the CLI installs it only when the app lacks it and never changes a version the app has verify:testExists(scripts/registry.test.mjs::devDependencies are named without a version, so the CLI installs it only when the app lacks it and never changes a version the app has)
[^identity]: test:scripts/kits/census-update.test.mjs::identity > builds an identity from role, name, marker, part and context, never position; test:scripts/kits/census-update.test.mjs::identity > takes the landmark as context, then the nearest data-testid, then '-'; test:scripts/kits/census-update.test.mjs::identity > makes a marker one token, and '-' when it is absent or blank verify:testExists(scripts/kits/census-update.test.mjs::identity > builds an identity from role, name, marker, part and context, never position) verify:testExists(scripts/kits/census-update.test.mjs::identity > takes the landmark as context, then the nearest data-testid, then '-') verify:testExists(scripts/kits/census-update.test.mjs::identity > makes a marker one token, and '-' when it is absent or blank)
[^names]: test:scripts/kits/census-update.test.mjs::identity > normalizes a name's whitespace and keeps its case and punctuation; test:scripts/kits/census-update.test.mjs::identity > replaces relative times and calendar dates, which depend on the run, with placeholders verify:testExists(scripts/kits/census-update.test.mjs::identity > normalizes a name's whitespace and keeps its case and punctuation) verify:testExists(scripts/kits/census-update.test.mjs::identity > replaces relative times and calendar dates, which depend on the run, with placeholders)
[^fresh-load]: test:scripts/kits/census-page.test.mjs::censusTests > registers one tagged test per state, each journey with its session, and the expected set before them verify:testExists(scripts/kits/census-page.test.mjs::censusTests > registers one tagged test per state, each journey with its session, and the expected set before them)
[^merge-projects]: test:scripts/kits/census-update.test.mjs::mergeActuals > fails on a journey/state recorded twice and on a missing project verify:testExists(scripts/kits/census-update.test.mjs::mergeActuals > fails on a journey/state recorded twice and on a missing project)
[^known-items]: test:scripts/kits/census-update.test.mjs::checkCensusState > fails an enrolled journey on any unmarked control or unknown item, even when the baseline matches; test:scripts/kits/census-page.test.mjs::installedItems > names each installed component file's stem, the values its markers carry verify:testExists(scripts/kits/census-update.test.mjs::checkCensusState > fails an enrolled journey on any unmarked control or unknown item, even when the baseline matches) verify:testExists(scripts/kits/census-page.test.mjs::installedItems > names each installed component file's stem, the values its markers carry)
[^status]: test:scripts/kits/census-page.test.mjs::censusTests > fails a state whose page answers another status, redirects, or differs from the baseline; registry/ouro/census/census-page.mjs verify:testExists(scripts/kits/census-page.test.mjs::censusTests > fails a state whose page answers another status, redirects, or differs from the baseline) verify:fileLine(registry/ouro/census/census-page.mjs, /journey\.status \?\? 200/)
[^worker-files]: test:scripts/kits/census-page.test.mjs::recording > adds each state to this worker's file; test:scripts/kits/census-update.test.mjs::census files > names worker files by project and worker index; registry/ouro/census/census-page.mjs verify:testExists(scripts/kits/census-page.test.mjs::recording > adds each state to this worker's file) verify:testExists(scripts/kits/census-update.test.mjs::census files > names worker files by project and worker index) verify:fileLine(registry/ouro/census/census-page.mjs, /OURO_CENSUS_DIR/)
[^exact]: test:scripts/kits/census-update.test.mjs::checkCensusState > passes an exact match and prints a readable diff otherwise; test:scripts/kits/census-update.test.mjs::multisets > finds added, removed, duplicated and re-marked controls; test:scripts/kits/census-update.test.mjs::checkCensusState > fails with the update command and the actual's path when the baseline lacks the project, journey or state verify:testExists(scripts/kits/census-update.test.mjs::checkCensusState > passes an exact match and prints a readable diff otherwise) verify:testExists(scripts/kits/census-update.test.mjs::multisets > finds added, removed, duplicated and re-marked controls) verify:testExists(scripts/kits/census-update.test.mjs::checkCensusState > fails with the update command and the actual's path when the baseline lacks the project, journey or state)
[^per-state]: test:scripts/kits/census-update.test.mjs::checkCensusState > lets an unenrolled journey hold unmarked controls; test:scripts/kits/census-update.test.mjs::the unmarked ratchet > refuses a rise in one state even when another state of the journey falls by as much verify:testExists(scripts/kits/census-update.test.mjs::checkCensusState > lets an unenrolled journey hold unmarked controls) verify:testExists(scripts/kits/census-update.test.mjs::the unmarked ratchet > refuses a rise in one state even when another state of the journey falls by as much)
[^scan]: test:scripts/kits/source-rules.test.mjs::loadConfig > scans src/ when the app has one, else app/, skipping the Ouro installs, with the default baseline; test:scripts/kits/source-rules.test.mjs::file selection > lists scanned files under app/, sorted, with forward slashes verify:testExists(scripts/kits/source-rules.test.mjs::loadConfig > scans src/ when the app has one, else app/, skipping the Ouro installs, with the default baseline) verify:testExists(scripts/kits/source-rules.test.mjs::file selection > lists scanned files under app/, sorted, with forward slashes)
[^content-spinner]: test:scripts/kits/source-rules.test.mjs::content-spinner > allows the named exception, an inline busy indicator inside a button, in its children or its props verify:testExists(scripts/kits/source-rules.test.mjs::content-spinner > lets inline progress for an action through: in a prop, in an object's icon, or beside the words that say what is under way) verify:testExists(scripts/kits/source-rules.test.mjs::content-spinner > allows the named exception, an inline busy indicator inside a button, in its children or its props) verify:testExists(scripts/kits/source-rules.test.mjs::content-spinner > never makes the component around it a hand-rolled control at its call sites)
[^wrappers]: test:scripts/kits/source-rules.test.mjs::the ratchet against real changes > counts every hop of a wrapper chain, and terminates on a cycle; test:scripts/kits/source-rules.test.mjs::call sites > counts each use of an app component that hand-rolls a control, and re-exported third-party controls verify:testExists(scripts/kits/source-rules.test.mjs::the ratchet against real changes > counts every hop of a wrapper chain, and terminates on a cycle) verify:testExists(scripts/kits/source-rules.test.mjs::call sites > counts each use of an app component that hand-rolls a control, and re-exported third-party controls)
[^fingerprints]: test:scripts/kits/source-rules.test.mjs::fingerprints > do not change when lines move, and report the new line; test:scripts/kits/source-rules.test.mjs::fingerprints > record only the stable props, in a fixed order, literal or as written verify:testExists(scripts/kits/source-rules.test.mjs::fingerprints > do not change when lines move, and report the new line) verify:testExists(scripts/kits/source-rules.test.mjs::fingerprints > record only the stable props, in a fixed order, literal or as written)
[^check-rules]: test:scripts/check/check.test.mts::Ouro check > finds each rule on its fail page and nothing on any pass page, with a report, a contact sheet and close-ups verify:testExists(scripts/check/check.test.mts::Ouro check > finds each rule on its fail page and nothing on any pass page, with a report, a contact sheet and close-ups)
[^check-many]: test:scripts/check/check.test.mts::Ouro check > takes at most 40 close-ups a page, the first of each finding, in a run and in a merge verify:testExists(scripts/check/check.test.mts::Ouro check > takes at most 40 close-ups a page, the first of each finding, in a run and in a merge)
[^check-exit]: test:scripts/check/check.test.mts::Ouro check's command > exits as every Ouro tool does: the Ouro AX kit's 0 ok, 1 error and 2 usage, then 3 for findings; test:scripts/check/check.test.mts::Ouro check's command > exits 3 on gated findings, writes the step summary, and exits 0 when the config waives them; test:scripts/check/check.test.mts::Ouro check's command > exits 2 when Playwright, axe-core, the config, the earlier report, a shard's report or the pages are missing, and 1 when it cannot run verify:testExists(scripts/check/check.test.mts::Ouro check's command > exits as every Ouro tool does: the Ouro AX kit's 0 ok, 1 error and 2 usage, then 3 for findings) verify:testExists(scripts/check/check.test.mts::Ouro check's command > exits 3 on gated findings, writes the step summary, and exits 0 when the config waives them) verify:testExists(scripts/check/check.test.mts::Ouro check's command > exits 2 when Playwright, axe-core, the config, the earlier report, a shard's report or the pages are missing, and 1 when it cannot run)
[^check-shard]: test:scripts/check/check.test.mts::Ouro check > a sharded run, merged, finds what one run does, with every shot, and a config gates the merge again verify:testExists(scripts/check/check.test.mts::Ouro check > a sharded run, merged, finds what one run does, with every shot, and a config gates the merge again)
[^check-before]: test:scripts/check/check.test.mts::Ouro check > gives a finding gone since --before a captioned before and after, and none to one still there at another size verify:testExists(scripts/check/check.test.mts::Ouro check > gives a finding gone since --before a captioned before and after, and none to one still there at another size)
[^check-ready]: test:test/check-in-page.test.ts::readiness > is ready once the page fires a ready event, marks itself ready, or has drawn its h1 verify:testExists(test/check-in-page.test.ts::readiness > is ready once the page fires a ready event, marks itself ready, or has drawn its h1)
[^check-allow]: test:test/check-in-page.test.ts::findSizeIssues: sideways-scroll > names the page when only an allowed element sticks out, and passes a page that allows it with a reason verify:testExists(test/check-in-page.test.ts::findSizeIssues: sideways-scroll > names the page when only an allowed element sticks out, and passes a page that allows it with a reason)
[^check-sizes]: registry/ouro/check/check.ts verify:fileLine(registry/ouro/check/check.ts, /^  \[320, 640\], /) verify:fileLine(registry/ouro/check/check.ts, /\[3840, 2160\],$/) verify:fileLine(registry/ouro/check/check.ts, /^  \[640, 360\], \[720, 420\], \[900, 500\], \[1000, 600\],$/) verify:fileLine(registry/ouro/check/check.ts, /^const dprAt = \(width: number\) => \(width <= 3072 \? 2 : 1\);$/) verify:testExists(scripts/check/check.test.mts::Ouro check > draws a screen wider than 3072px at density 1, holds its pictures to that, and records the density of each finding)
[^check-long-lines]: registry/ouro/check/size-check.ts verify:fileLine(registry/ouro/check/size-check.ts, /\{ maxChars = 100, /)
[^check-truncate]: test:test/check-in-page.test.ts::findSizeIssues: clipped-text > passes text that fits, hidden text, a block with block children, allowed clamps, and truncation whose whole text is still there; test:test/check-in-page.test.ts::findSizeIssues: clipped-text > finds text cut across by its box, and an ellipsis or a line clamp that leaves the whole text nowhere verify:testExists(test/check-in-page.test.ts::findSizeIssues: clipped-text > passes text that fits, hidden text, a block with block children, allowed clamps, and truncation whose whole text is still there) verify:testExists(test/check-in-page.test.ts::findSizeIssues: clipped-text > finds text cut across by its box, and an ellipsis or a line clamp that leaves the whole text nowhere)
[^check-measured]: test:scripts/check/check.test.mts::Ouro check > measures layout shift, first content and each press against their budgets, presses at one size and theme, and records each number verify:testExists(scripts/check/check.test.mts::Ouro check > measures layout shift, first content and each press against their budgets, presses at one size and theme, and records each number)
[^check-shift]: test:test/check-measure.test.ts::listenForMeasures > scores the largest burst of shifts no input caused, and keeps the element that moved most verify:testExists(test/check-measure.test.ts::listenForMeasures > scores the largest burst of shifts no input caused, and keeps the element that moved most)
[^check-press]: test:test/check-measure.test.ts::markPressables > marks and names the controls a person can press, shown and enabled, up to the limit, and no link or form submit verify:testExists(test/check-measure.test.ts::markPressables > marks and names the controls a person can press, shown and enabled, up to the limit, and no link or form submit)
[^check-budgets]: registry/ouro/check/check.ts verify:fileLine(registry/ouro/check/check.ts, /^const BUDGETS: Budgets = Object.freeze\(\{ inp: 200, "layout-shift": 0.1, "first-content": 2500 \}\);$/) verify:fileLine(registry/ouro/check/check.ts, /^const MAX_PRESSES = 24;$/) verify:fileLine(registry/ouro/check/check.ts, /^const INP_SIZE = "1440x900";$/)
[^check-site]: .github/ouro-check.json verify:fileLine(.github/ouro-check.json, /"inp": "/) verify:fileLine(.github/workflows/screens.yml, /config: .github\/ouro-check.json/)
[^check-pages]: test:test/check-in-page.test.ts::findSizeIssues: broken-image > finds a picture that loaded empty, named as a blurry one would be, unless allowed with a reason; test:scripts/check/check.test.mts::Ouro check > fails a page that answers an error or does not answer, and checks nothing else on it; test:scripts/check/check.test.mts::Ouro check > checks a page that never settles once its waits run out verify:testExists(test/check-in-page.test.ts::findSizeIssues: broken-image > finds a picture that loaded empty, named as a blurry one would be, unless allowed with a reason) verify:testExists(scripts/check/check.test.mts::Ouro check > fails a page that answers an error or does not answer, and checks nothing else on it) verify:testExists(scripts/check/check.test.mts::Ouro check > checks a page that never settles once its waits run out)
