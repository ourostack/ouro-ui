# Guardrails

The guardrail kits hold an app to Ouro UI. The **census** (`ouro-census`) measures the running app, page by page and state by state, and the **source rule** (`ouro-source-rules`) reads the app's source and finds the controls still built by hand: their aim is that every control a person can reach is an Ouro control, and the number that are not can only fall.[^ratchets] Each of those two keeps a committed baseline, so every change is a reviewed diff, and each refuses a rise unless you record why.[^baselines] The **screen check** (`ouro-check`) opens the built app's pages at screen sizes from a phone to a wide desktop and finds what a person would see broken.[^check-rules] It keeps no baseline: it fails on any finding that `ouro-check.json` does not waive with a reason.[^check-exit]

Add them from the same place and release tag as your components:

```sh
npx shadcn@latest add ourostack/ouro-ui/ouro-census#v1.3.9 ourostack/ouro-ui/ouro-source-rules#v1.3.9
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
- an index built in render (`render-index`): `new Map(…)`, `new Set(…)`, `new RegExp(…)`, `Object.fromEntries(…)`, `Object.groupBy(…)` or `Map.groupBy(…)` with an argument, evaluated in a component's own body (a capitalised function in a `.tsx` file, also through `memo` or `forwardRef`), a custom hook's or a class's `render`.[^render-index] An all-capitals function such as a route handler's `GET` is no component.[^render-index] A component rebuilds it on every render, a keystroke or a hover included, so build it where its data changes, once per change: in the store or loader that holds the data, or in `useMemo` on its inputs; move a constant to module scope.[^render-index] Anything inside a nested function passes: a `useMemo` or `useEffect` callback, a lazy `useState(() => …)` initializer, an event handler.[^render-index] An empty `new Map()` passes too.[^render-index] A callback that runs during render, such as `rows.map((row) => new Set(row.tags))`, is not counted yet.[^render-index] Like a spinner, an index counts where you write it and never makes the component around it a hand-rolled control.[^render-index]
- an animation of a layout property (`layout-animation`): `transition-all`, a `transition-[…]`, `[transition:…]` or `[transition-property:…]` class that names width, height, an inset, a margin or padding, a border width, a gap, flex, grid tracks, font size or line height, a `transition` style value or a stylesheet `transition` that does (a shorthand with no property animates `all`), keyframes for an element's `animate()` or Motion's `animate`, `exit` and `while…` props that set one, and `@keyframes` that set one.[^layout-animation] Those properties make the browser lay the page out again on every frame, on the main thread, while transform and opacity are the properties the compositor animates alone, so an overlay, a menu or a hover effect that moves or fades with them stays smooth on a slow machine.[^compositor] Animate `transform` (translate, scale) and `opacity` instead, and name the properties a transition runs (`transition-[opacity,translate]`, `transition-opacity`, `transition-transform`) rather than `transition-all`. Tailwind's plain `transition` and `transition-colors` pass, and so does a shorthand that animates nothing: keywords only (`unset`, `initial`, `inherit`, `revert`), or a zero or missing duration.[^layout-animation] Ouro's own Accordion, Collapsible and Checklist animate a height or grid rows on purpose, since the content below them must move; `scripts/layout-animation-allowed.json` lists them with why.[^layout-allowed]
- a spinner standing where content would (`content-spinner`): Ouro's `<Spinner>` or any element with an `animate-spin` class that is returned or assigned on its own, or is the only thing in its element. Show a `Skeleton` shaped like the content instead (`<Skeleton shape="row" count={6}>`), so the content takes its place and nothing moves when it arrives. Inline progress for an action passes: a spinner inside a button, in a prop (a field's adornment, a control's icon), in an object (a toast's or a menu entry's icon), or beside the words that say what is under way. A spinner counts where you write it and never makes the component around it a hand-rolled control.[^content-spinner]
- a load that waits for focus, visibility, the person's return, idle time or scrolling (`gated-load`): a fetch, a load, prefetch or refetch call, a data hook, `import()`, `new Image()` or a `src` set inside a `visibilitychange`, `focus`, `blur` or `pageshow` listener on the window or document, under a `document.hidden`, `visibilityState` or `document.hasFocus()` condition, in a `requestIdleCallback`, an `IntersectionObserver` or an in-view or idle hook's callback, or waiting on what such a hook returns (`enabled: inView`) or on state such a callback sets from what the gate says (`setShown(entry.isIntersecting)`); a popover that closes on blur (`setOpen(false)`) leaves `open` ordinary; and an element's `loading="lazy"`, or an address that waits on a gate (`src={inView ? url : undefined}`). Load it eagerly instead ([Load eagerly](#load-eagerly)). A gate that only changes what is drawn passes, because it loads nothing: pausing an animation or a caret, windowing rows whose data stays loaded, or a media stream. So does saving as the page hides (`sendBeacon`, or a `fetch` with `keepalive` or a method other than GET). It counts where the load is written and never makes the component around it a hand-rolled control.[^gated-load]
- vague failure copy (`vague-failure-copy`): a string, a template literal or JSX text that says "couldn't", "could not", "something went wrong", "unable to", "failed to load" or "an error occurred", or whose whole text is a bare "Error" or "Upload failed". See [Say precisely why it failed](#say-precisely-why-it-failed).[^vague-failure-copy]

Each offender is a fingerprint, `file::component::category::tag::props`, never a line number, so moving code keeps it.[^fingerprints] Record where your app starts, commit the baseline, then check on every change:

```sh
node scripts/ouro-source-rules.mjs --write-baseline   # the first write records the starting point
node scripts/ouro-source-rules.mjs                    # fails on any difference from the baseline
node scripts/ouro-source-rules.mjs --base origin/main # on a pull request: also no rise against main
```

A new offender fails: use an Ouro component instead, or add the missing one to Ouro UI first. A fixed one fails until `--write-baseline` removes it. Against `--base`, a rise needs `--write-baseline --base <ref> --allow-regression "<reason>"`, which records it for that pull request only. Moving code is neutral: an offender removed and added with the same category, tag and literal props, in the same file or the same component, pairs one-to-one.

Against `--base`, the settings are read at the base too: its `baseline` setting says where its baseline is, and a pull request may only widen what is read. Moving the baseline, another `src`, an `ouroDirs` or `exclude` entry the base did not already skip, a `failureCopyAllow` match that is not already covered by a match at the base, or a set or changed `hookPrefix` fails like a rise, and needs the same `--allow-regression "<reason>"`, which records it. A missing baseline is a first baseline, written without a reason, only when the base has neither `ouro-source-rules.json` nor a baseline.

Settings are optional, in `ouro-source-rules.json` at the root:

| Setting | Default | What it sets |
| --- | --- | --- |
| `src` | `src`, or `app` without one | The folder it reads. |
| `ouroDirs` | `<src>/components/ouro/`, `<src>/lib/ouro/` | Where your app installs Ouro UI; never read.[^scan] |
| `exclude` | none | More folders not to read, such as generated code. |
| `hookPrefix` | none | Read stylesheet state only on your own hooks (`.app-…`, `[data-app-…]`), not on every class. |
| `baseline` | `ouro-source-rules.baseline.json` | Where the baseline lives. |
| `failureCopyAllow` | none | Failure copy that is already precise: `[{ "match": "<part of the text>", "reason": "<why this wording is precise>" }]`. A text holding a `match` (case-sensitive) passes; an entry with an empty `match` or without a `reason` stops the rule. |

### Say precisely why it failed

A failure message tells the person, or the agent, what happened and precisely why (the system and its answer), who or what caused it where you know, and the next step as a working action or command. When you don't know the cause, say what you tried and what came back.

| Before | After |
| --- | --- |
| `Couldn't show this picture` | `The photo service says this picture was deleted by its owner. Ask them to share it again.` |
| `Something went wrong` | `The server didn't answer within 60 s. Your draft is saved; press Send to try again.` |
| `Unable to open file` | `You don't have access to this file. Ask its owner for edit access.` |
| `Error` | `inbox-agent stopped: the mail service turned down its sign-in (401). Sign in again in Settings.` |

The rule reads strings, template literals and JSX text in your source. It skips what is not copy: import specifiers, types, object keys, tagged templates (`css` and `gql` ones), compared values, `className`, `data-*`, `id`, `key`, `type`, `href`, `src`, `to`, `name`, `role`, `htmlFor` and `as` values, and a string that is one lowercase word (`"error"` as a status). A count such as `{n} failed`, a negation such as "No errors" and an action such as "Retry failed" are not bare failures.[^not-bare] A phrase passes when its cause follows in the same sentence, after a colon, a dash or "because", in at least two words that start with neither a next step nor a vague word, and "Error: …" is held to the same test.[^not-bare] So `Couldn't send: you're offline. Try again when you're back online.` passes, and `Couldn't send: try again.` and `Something went wrong. Error code: E42` do not. JSX text is read with what follows it, so `<p>Couldn't send: {why}</p>` passes like its template literal.[^not-bare] Text you build from pieces or load from a JSON catalog is not read. When a message names the system and its answer and still holds one of the phrases ("The card service says your card could not be charged. Use another card."), add it to `failureCopyAllow` with its reason.[^vague-failure-copy]

Prior art:

- [Nielsen Norman Group's error-message guidelines](https://www.nngroup.com/articles/error-message-guidelines/ "verify:urlOk(https://www.nngroup.com/articles/error-message-guidelines/)"): adopt. Say precisely what went wrong in plain words, and offer a way forward.
- [GOV.UK's error message component](https://design-system.service.gov.uk/components/error-message/ "verify:urlOk(https://design-system.service.gov.uk/components/error-message/)"): borrow. Its wording rules are for form fields, but its stance carries over: say what happened and how to fix it, in place of "an error occurred".
- [Apple's Human Interface Guidelines on alerts](https://developer.apple.com/design/human-interface-guidelines/alerts "verify:urlOk(https://developer.apple.com/design/human-interface-guidelines/alerts)"): watch. It governs when an alert appears and how its buttons read, more than what a failure says.

### Load eagerly

Load intelligently and eagerly. Don't gate a fetch on focus, on visibility or on the person coming back to the window: a person who returns to an app and then waits for what it could have fetched while they were away has had a bad experience. Start a load as soon as you know the data will be needed: on mount, or as soon as the page before it lands. Spend the work on what the person is likely to look at next, newer before older, and keep it within the performance budgets that [the screen check](#the-screen-check) measures (`first-content` and `inp`).

The source rule's `gated-load` category finds the loads that wait.[^gated-load] When one has to wait, for a reason the rule cannot see, record the reason against the base: `node scripts/ouro-source-rules.mjs --write-baseline --base origin/main --allow-regression "<reason>"`.[^gated-load-escape]

## The screen check

The screen check (`ouro-check`) opens every page of your built app in headless Chromium at every screen size from a 320px phone to a 3840px screen, and four short landscape screens, light and dark, at density 2 up to 3072px wide, the widest real 2x screen, and 1 above it, so a 3840 screen asks for the pictures a 4K monitor shows.[^check-sizes] Each finding records the density it was found at.[^check-sizes] It finds six things, by measurement rather than by looking at pictures:[^check-rules]

| Rule | What it finds |
| --- | --- |
| `overlap` | A line of text drawn over another line, or over a picture, in the same section. The part of a picture a clipping box cuts away doesn't count, and a label on an opaque backing of its own, such as a chip on a picture, reads.[^check-overlap-picture] |
| `sideways-scroll` | A page wider than the screen, naming the outermost elements that stick out. |
| `clipped-text` | Text cut off by its box. An ellipsis or a line clamp is truncation on purpose and passes while the whole text is still there: in a `title`, an `aria-label`, or the text itself in the accessibility tree.[^check-truncate] |
| `long-lines` | Off unless `ouro-check.json` declares a measure; then the elements it names whose lines run past it. Columns side by side are lines of their own, and a run of short items set apart by middle dots, bullets or bars is a list, not prose.[^check-measure] |
| `blurry-image` | A picture drawn larger than its file's own pixels allow at the screen's density, often a wrong `sizes` on a cropped, height-driven image. |
| `image-fade` | A picture that fades into the page: an `<img>`, an SVG `<image>` or a `url()` background with a gradient mask on it or on a box around it that fades it, or with a gradient between transparent and a colour over a tenth of it or more, from an absolutely positioned overlay or a `::before` or `::after` of the picture or a box around it.[^check-image-fade] A radial or conic gradient counts only when it is opaque at its outer edge, as a vignette is; a glow that fades out adds light, and passes. A linear mask is read along its line, so a picture outside the bands where it isn't opaque, such as the middle of a list that fades at its edges, passes; a mask the check can't read that way (radial, diagonal, sized or placed) counts as fading every picture under it.[^check-mask-ramp][^check-image-fade] See [Pictures end on a hard edge](#pictures-end-on-a-hard-edge). |
| `axe` | Serious and critical axe-core violations, at a phone and a laptop size. |
| `broken-image` | A picture that loaded empty: a missing file, or one that is no picture.[^check-pages] |
| `http-error` | A page that answered with a status other than 2xx, or did not answer.[^check-pages] |
| `not-ready` | A page that gave no ready signal in time.[^check-pages] It is checked as it is, but never passes.[^check-pages] |

It also measures how a page responds, each against a budget:[^check-measured]

| Rule | What it measures | Budget |
| --- | --- | --- |
| `layout-shift` | How far the page moved under the reader while it loaded: its cumulative layout shift, scored as browsers score it, leaving out shifts just after input.[^check-shift] The close-up outlines the element whose own shift scored highest.[^check-shift] | 0.1[^check-budgets] |
| `first-content` | How long the page took to draw its largest text or picture, its largest contentful paint.[^check-measured] A skeleton draws neither, so a page that shows one first is timed to the content that replaces it.[^check-measured] | 2500 ms[^check-budgets] |
| `inp` | How long a press of a control you list took to paint: its longest event, from the press to the next frame drawn after its handlers ran, at the 75th percentile of several presses.[^check-measured] | 200 ms[^check-budgets] |

It walks each page as a person would, at the same size and theme it presses at, and measures [Ouro Feel](https://github.com/ourostack/ouro-ui/blob/main/feel/README.md)'s numbers on each step:[^check-jank]

| Rule | What it measures | Budget |
| --- | --- | --- |
| `jank` | Hovering each card-sized link or button, opening and closing each popup and disclosure (`aria-haspopup`, `aria-expanded`, `popovertarget`, `<summary>`), scrolling the page and each region that scrolls, and panning each surface you drag (`cursor: grab`), three times each, at most three of each kind a page.[^check-jank] A step fails when its longest frame, the median of its runs, is over the budget; or when even its best run forces more than 50 layouts (layout reads with a change still waiting to be laid out, Feel's `forcedLayouts`) or, hovering, scrolling or panning, shifts the page by more than 0.01, as a card that grows under the pointer does; opening a disclosure moves what follows it on purpose.[^check-jank] It never opens what `inp` never presses: links away, submit buttons and destructive controls.[^check-jank] `"walk": false` in `ouro-check.json` turns it off. | 250 ms[^check-budgets] |
| `repaint` | Before the walk, at rest: an endless animation that repaints every frame, because it animates something other than `transform`, `opacity`, `translate`, `rotate` or `scale` (a dash offset, a background position, a colour), or anything inside an SVG drawing.[^check-repaint] Read from `document.getAnimations()`, so it needs no timing. The walk runs without reduced motion, as most people see a page; the rest of the check runs with it, so pictures hold still.[^check-repaint] | none |

The budgets are the thresholds browsers' own field data calls good.[^check-budgets] Each measured finding records its number, its budget and their unit in `report.json` (`value`, `budget` and `unit`), so a later run can be compared with it.[^check-measured] `--no-measured` skips the measured rules.[^check-measured]

### Design rules

The check also holds pages to design rules that measurement can decide, after Refactoring UI (Wathan and Schoger). Each came from a page a person found wrong, and each has a fixture that fails and one that passes:[^check-design]

| Rule | What it finds |
| --- | --- |
| `giant-picture` | A banner-shaped picture (scenery, 1.8 times as wide as tall or wider) in the flow, leading a content item, such as a work entry or a card with its own heading, that outweighs its words: it fills the item's width, is over 55% of its height and over 1.25 times the height of the rest.[^check-design-limits] Show the work itself, a screenshot or the component, or a small picture beside the words. A picture of the work, squarer, may be as big as it likes, and so may a figure's picture, which is its subject.[^check-design] |
| `cramped-heading` | A heading, with the icon on its row, closer to a picture or a filled or framed box above it than half its font size (a quarter, for its own card's picture). What follows a heading belongs to it, so only the space above is judged.[^check-design] |
| `nested-frame` | A frame inside a frame: a framed box hugging another within 6px on every side (a double border); or a rounded, filled or framed box whose child has an edge of its own (a fill, a frame, or a picture that runs to its corner, not an icon or a clear logo) and sits near its corner with a radius that isn't the outer radius less the inset, so the corners don't nest.[^check-design] |
| `baked-corner` | A picture or video whose own pixels draw a corner inside the page's frame (the roundest clipping box it fills, past a wrapper of zero size), such as a screen recording of a window with its dark corner showing in a rounded frame.[^check-corner-frame] Read from the pixels, on the video's first frame, at two corners or more in the same colour.[^check-design] |
| `type-scale` | More than 10 text sizes, or more than 3 font weights, on a page.[^check-design] |
| `shadow-scale` | More than 5 different shadows on a page.[^check-design] |
| `grey-on-colour` | Grey text on a coloured background, which reads washed out: use a shade of the background's own hue.[^check-design] |
| `heading-hierarchy` | A heading drawn larger than the heading of higher rank it sits under, each at the largest size its text is drawn at.[^check-design] |
| `https` | For a site on the web, once a run: `http://` that doesn't answer with a 301 or 308 to `https://`, an `https://` with no `Strict-Transport-Security` of a year or more, or a bare name's `www.` twin (or a `www.` site's bare name) that moves anywhere but to `https://` or doesn't answer over HTTPS.[^check-https] Local addresses are left out.[^check-https] |

`blurry-image` covers videos too: a video drawn larger than its frames at the screen's density.[^check-video]

Line length stays opt-in ([Long lines are opt-in](#long-lines-are-opt-in)); contrast is axe's. To keep a finding on purpose, mark it with `data-ouro-allow` and a reason, as below.

### Pressing is opt-in

`inp` presses real controls, and a press does what it says on whatever server your app talks to: a "Send", "Delete" or "Buy" pressed against a staging app connected to a real account sends, deletes or buys. So the check presses only the controls you list: those its `press` selectors match in `ouro-check.json`, and those marked `data-ouro-check-press`. With neither, it presses nothing.[^check-opt-in] Even when listed, it never presses a control with a destructive tone or inside one (Ouro's and shadcn's destructive classes, or `data-tone` or `data-variant` set to `destructive`), one marked `data-ouro-check-no-press`, a link, or a form's submit button, and it skips a listed element whose middle is one of those.[^check-press] List controls whose press only changes what the page shows, such as a tab, a disclosure or a filter, and point the check at made-up data.

It presses each listed control 5 times, or as often as `pressRepeat` says, and presses Escape after each press to close what it opened.[^check-repeat] The finding is the 75th percentile of the presses, and `report.json` records each press's time in `samples`, so one slow press on a busy machine doesn't make a finding.[^check-repeat] It presses up to 24 controls a page, at 1440×900 (or the widest size you give) in the first theme, in a browser context of its own, after the contact sheet's shot.[^check-budgets]

`ouro-check.json` can list the controls and change the budgets:[^check-opt-in]

```json
{
  "press": ["[role=tab]", "[data-filter]"],
  "pressRepeat": 7,
  "budgets": { "inp": 150, "layout-shift": 0.05, "first-content": 2000 }
}
```

### States reached by presses

To check an app in views it reaches by presses, such as an open chat or a call, list them under `states` in `ouro-check.json`: for a page, as the check names it, each state's name and the controls to press in turn to reach it, as Playwright selectors. The check presses its way to each state and checks it as a page of its own, named after the page and the state.[^check-states] A press that finds nothing to press makes the state a page that did not load. As with `press`, list presses that only change what the page shows, and point the check at made-up data.

```json
{
  "states": {
    "/?mock=1": { "a chat open": ["text=Launch planning"], "the calendar": ["role=button[name=Calendar]"] }
  }
}
```

Each page and state loads afresh in a browser context of its own, so what one saves (an app's last view) reaches no other, a route in its address's hash included; and its finite animations run to their end, up to 2 s, before the rules judge it.[^check-settle]

`layout-shift` and `first-content` read one load of each page at each size, and `inp` a few presses, so a result just over its budget can be the runner rather than the page. Check a borderline finding before you fix it: run the check on that page again, or raise `pressRepeat`. A finding well over its budget, or one that shows at several sizes, is the page.[^check-measured]

A new rule can start without failing a build: waive it on all pages, with the reason, and remove the waiver once its findings are fixed.[^check-shard] This repository's own site does that while the measured rules settle.[^check-site]

Add it, build your app, run it on the built folder (or on URLs), and fix what it reports:

```sh
npx shadcn@latest add ourostack/ouro-ui/ouro-check#v1.3.9
node lib/ouro/check/check.ts dist
```

`ouro-check` installs `lib/ouro/check/` and names `playwright` and `axe-core` as devDependencies, without a version.[^kit-versions] It writes `ouro-check/report.json`, `summary.md`, a contact sheet of every size a page was checked at in `sheets/`, and a captioned close-up of each finding in `findings/`, at most 40 a page.[^check-many] Its exit code is the one every Ouro tool gives, from the Ouro AX kit's table, so it can gate CI:[^check-exit]

| Exit | Meaning |
| --- | --- |
| `0` | Nothing found that `ouro-check.json` does not waive. |
| `1` | An error: the check itself stopped before it finished, as when the browser would not start. It prints why. |
| `2` | A usage problem, such as a folder that does not exist. |
| `3` | Findings to fix: the summary lists them. |



- `--pages "docs/**"` checks only the pages a glob matches; `--sizes 390x844,1440x900` and `--themes light` narrow the sweep.
- `--shard 1/4` checks the first of four shares, and `node lib/ouro/check/check.ts merge <out folders>…` joins the shares' folders into one report, the same as one run's.[^check-shard]
- `--before <earlier report.json>` adds a captioned before and after for each finding gone since.[^check-before]
- A page that draws after it loads says when it is ready: it fires `ouro:ready` (or an event you name with `--ready-event`), or sets `data-app-ready`. The check waits up to 15 seconds, then checks the page as it is.[^check-ready]

To keep a finding on purpose, mark the element with `data-ouro-allow="<rule>"` and a reason in `data-ouro-allow-why`; an allow without a reason does not count.[^check-allow] Every opt-out with its reason goes into `report.json`, under `allowances`.[^check-allowances]

If your app's own rules keep `data-ouro-*` for Ouro's components, use the plain aliases instead. They are part of the check's interface and are not deprecated. Each takes its reason as its value, and like `data-ouro-allow`, it counts only with one; a reason of spaces is none:[^check-aliases]

| Alias | Opts out of |
| --- | --- |
| `data-overlap-ignore="<reason>"` | `overlap` |
| `data-long-lines-ok="<reason>"` | `long-lines` |
| `data-clip-ok="<reason>"` | `clipped-text` |
| `data-scroll-x="<reason>"` | `sideways-scroll` |
| `data-size-ignore="<reason>"` | `sideways-scroll`, `clipped-text`, `long-lines` and `blurry-image`; a broken picture is broken at any size, so it is still a finding |
| `data-image-fade-ok="<reason>"` | `image-fade`, on the picture, a box around it or the overlay[^check-image-fade-allow] |

An element that still sticks out past the screen makes the page scroll sideways, so give its content a scroller of its own (`overflow-x: auto`); the alias stops the rule naming the element, not the page.[^check-allow] To waive a rule on whole pages, list it in `ouro-check.json`, with the reason:

```json
{ "waive": { "docs/legacy/**": { "long-lines": "Imported articles keep their layout until they are rewritten." } } }
```

### Long lines are opt-in

How long a line of text may run is a design choice, so the check assumes no measure and never asks you to cap text width.[^check-measure] `long-lines` runs only where `ouro-check.json` declares the measure your design or the request already sets.[^check-measure] Every other rule runs by default.[^check-rules]

```json
{ "measure": { "**": "100 chars", "main .chat-message": "800px" } }
```

- A key that starts with `/`, such as `/docs/**`, or one made only of `*`, is a page glob; it holds the prose on the pages it matches: `p`, `li`, `dd`, `blockquote`, `figcaption` and `[data-prose]`. `"**"` matches every page.[^check-measure] Any other key is a CSS selector, which may hold a `/` of its own, and it holds exactly the elements it matches on every page, a container of paragraphs included.[^check-measure] An element two keys hold is checked against the first.[^check-measure]
- A measure is `px` (how wide a rendered line may be), `ch` (the width of that many zeros in the element's own font) or `chars`. `"100 chars"` counts the characters a rendered line holds on average, as the rule always has, so it is met by how the text is composed, not by capping its CSS width.[^check-chars]
- A measure that is none of these, or a selector the browser cannot read, makes the check exit `2`.[^check-exit]

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
      - uses: ourostack/ouro-ui/.github/actions/check@v1.3.9
        with:
          targets: dist
          shard: ${{ matrix.shard }}/4
  screens-report:
    needs: screens
    if: ${{ !cancelled() }}
    runs-on: ubuntu-latest
    steps:
      # Check out and install first.
      - uses: ourostack/ouro-ui/.github/actions/check@v1.3.9
        with:
          merge: "true"
```

### Pictures end on a hard edge

End a picture on a hard edge, or put it on a solid band. Don't fade it into the page, or into nothing, at any edge, by a mask, an overlay or a pseudo-element's wash. Keep light painted into the picture itself, and gradients that are not over a picture, such as a painted sky band or a skeleton's shimmer. The screen check's `image-fade` rule finds a fade the browser draws. `fades.ts`, which `ouro-check` installs beside `check.ts`, finds one in the source before anything is built: every gradient used as a mask in a stylesheet, a style attribute, a Tailwind class (an arbitrary `mask-image` property or `mask` value, or one of Tailwind's gradient mask utilities) or a style object.[^fades]

```sh
node lib/ouro/check/fades.ts src
```

It reads `.css`, `.scss`, `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.astro`, `.html`, `.svelte` and `.vue` files, skipping `node_modules`, build output (`dist`, `build`, `storybook-static`, `coverage`) and hidden folders.[^fades-files] Each finding gives the file, the line, the declaration and the fix, and it exits 3 when there is one, 0 when there is none and 2 on a usage problem, as `check.ts` does.[^fades-exit] A mask that fades text or controls rather than a picture, such as a row that scrolls sideways or a folded paragraph, stays when its line, or the comment just above it, says why, `fade-ok: <reason>`; a marker without a reason does not count.[^fades-ok] Ouro HX's own such masks (Tabs' overflow, Collapsible's fold and the scroll fade) carry one, and this repository's CI runs `fades.ts` over `registry/` and `site/` in the required `ci` check.[^fades-ci]

### Pictures at the widths a screen needs

A `blurry-image` finding means the screen draws a picture larger than its file. `ouro-images` writes each raster picture in a folder as AVIF and WebP at each of 320, 640, 960, 1280, 1920, 2560, 3840 and 5120 pixels wide that is narrower than the picture, and at its own width, with `images.json` listing the srcset of each.[^images] `images.json` records what each picture's files were made from, its bytes and the options, so a second run writes only what changed, and a new `--quality` writes them all again.[^images-kept] It turns a photo upright as its EXIF orientation says, and leaves out an animated picture, which would lose its frames; serve that one as it is.[^images-upright]

```sh
npx shadcn@latest add ourostack/ouro-ui/ouro-images#v1.3.9
node lib/ouro/images/images.ts pictures --out public/images --base /images/
```

Then draw each picture from the manifest, and the browser takes the smallest file that is sharp on its screen:

```tsx
import images from "../public/images/images.json";

const hero = images["hero.png"];

<picture>
  {hero.sources.map((source) => <source key={source.type} type={source.type} srcSet={source.srcset} sizes="100vw" />)}
  <img src={hero.src} width={hero.width} height={hero.height} alt="The team at the launch" />
</picture>;
```

`ouro-images` installs `lib/ouro/images/images.ts` and names `sharp` as a devDependency.

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
[^vague-failure-copy]: test:scripts/kits/source-rules.test.mjs::vague-failure-copy > finds a vague phrase in a string, a template literal's static parts and JSX text, counted where it is written; test:scripts/kits/source-rules.test.mjs::vague-failure-copy > counts a bare failure only as a whole text: not a count, a template with a substitution or JSX text beside other children verify:testExists(scripts/kits/source-rules.test.mjs::vague-failure-copy > finds a vague phrase in a string, a template literal's static parts and JSX text, counted where it is written) verify:testExists(scripts/kits/source-rules.test.mjs::vague-failure-copy > counts a bare failure only as a whole text: not a count, a template with a substitution or JSX text beside other children) verify:testExists(scripts/kits/source-rules.test.mjs::vague-failure-copy > skips strings that are not copy: specifiers, types, keys, tagged templates, compared values, non-copy attributes and properties, and one lowercase token) verify:testExists(scripts/kits/source-rules.test.mjs::vague-failure-copy > lets a text through that holds a failureCopyAllow match, case-sensitive) verify:testExists(scripts/kits/source-rules.test.mjs::vague-failure-copy > stops on a failureCopyAllow that is not a list, or an entry with an empty match or no reason, naming the entry and the fix) verify:testExists(scripts/kits/source-rules.test.mjs::main > --base: the settings at the base ref > fails a new failureCopyAllow match like a new exclude, unless a match at the base is part of it, and records it with a reason)
[^render-index]: test:scripts/kits/source-rules.test.mjs::render-index > finds each builder: Map, Set, RegExp, Object.fromEntries, Object.groupBy and Map.groupBy; test:scripts/kits/source-rules.test.mjs::render-index > finds one in JSX, a hook's argument, a custom hook, an arrow component, memo, forwardRef and a class's render; test:scripts/kits/source-rules.test.mjs::render-index > passes an index built in useMemo, a lazy initializer, an effect, an event handler or at module scope; test:scripts/kits/source-rules.test.mjs::render-index > passes an empty Map or Set, another constructor, and a function that is no component, hook or render; test:scripts/kits/source-rules.test.mjs::render-index > leaves a callback that runs during render uncounted, a known gap; test:scripts/kits/source-rules.test.mjs::render-index > never makes the component around it a hand-rolled control at its call sites; test:scripts/kits/source-rules.test.mjs::render-index > names the store, useMemo and module-scope fix in its message; test:scripts/kits/source-rules.test.mjs::render-index > skips a route handler, an all-capitals function and a capitalised function in a .ts file, and still finds a hook there verify:testExists(scripts/kits/source-rules.test.mjs::render-index > finds each builder: Map, Set, RegExp, Object.fromEntries, Object.groupBy and Map.groupBy) verify:testExists(scripts/kits/source-rules.test.mjs::render-index > finds one in JSX, a hook's argument, a custom hook, an arrow component, memo, forwardRef and a class's render) verify:testExists(scripts/kits/source-rules.test.mjs::render-index > passes an index built in useMemo, a lazy initializer, an effect, an event handler or at module scope) verify:testExists(scripts/kits/source-rules.test.mjs::render-index > passes an empty Map or Set, another constructor, and a function that is no component, hook or render) verify:testExists(scripts/kits/source-rules.test.mjs::render-index > leaves a callback that runs during render uncounted, a known gap) verify:testExists(scripts/kits/source-rules.test.mjs::render-index > never makes the component around it a hand-rolled control at its call sites) verify:testExists(scripts/kits/source-rules.test.mjs::render-index > names the store, useMemo and module-scope fix in its message) verify:testExists(scripts/kits/source-rules.test.mjs::render-index > skips a route handler, an all-capitals function and a capitalised function in a .ts file, and still finds a hook there)
[^layout-animation]: test:scripts/kits/source-rules.test.mjs::layout-animation > finds transition-all and a transition of a layout property in a class, under any variant, counted where it is written; test:scripts/kits/source-rules.test.mjs::layout-animation > passes a class that animates only transform, opacity or colour, and Tailwind's plain transition; test:scripts/kits/source-rules.test.mjs::layout-animation > finds a transition style value, an element's animate() keyframes and Motion's animate, exit and while props; test:scripts/kits/source-rules.test.mjs::layout-animation > finds a stylesheet's transition of a layout property or all, @apply transition-all, and keyframes that set a layout property; test:scripts/kits/source-rules.test.mjs::layout-animation > reads a transition value as a shorthand or a property list; test:scripts/kits/source-rules.test.mjs::layout-animation > reads a shorthand of keywords only, or with a zero or missing duration, as naming no property verify:testExists(scripts/kits/source-rules.test.mjs::layout-animation > finds transition-all and a transition of a layout property in a class, under any variant, counted where it is written) verify:testExists(scripts/kits/source-rules.test.mjs::layout-animation > passes a class that animates only transform, opacity or colour, and Tailwind's plain transition) verify:testExists(scripts/kits/source-rules.test.mjs::layout-animation > finds a transition style value, an element's animate() keyframes and Motion's animate, exit and while props) verify:testExists(scripts/kits/source-rules.test.mjs::layout-animation > finds a stylesheet's transition of a layout property or all, @apply transition-all, and keyframes that set a layout property) verify:testExists(scripts/kits/source-rules.test.mjs::layout-animation > reads a transition value as a shorthand or a property list) verify:testExists(scripts/kits/source-rules.test.mjs::layout-animation > reads a shorthand of keywords only, or with a zero or missing duration, as naming no property)
[^compositor]: https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count verify:urlOk(https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count)
[^layout-allowed]: test:scripts/source-rules.test.mjs::no component or theme file animates a layout property unless layoutAnimationAllowed says why, and every allowance is still used; scripts/layout-animation-allowed.json verify:testExists(scripts/source-rules.test.mjs::no component or theme file animates a layout property unless layoutAnimationAllowed says why, and every allowance is still used) verify:fileLine(scripts/layout-animation-allowed.json, /accordion-styles/) verify:fileLine(scripts/layout-animation-allowed.json, /collapsible-styles/) verify:fileLine(scripts/layout-animation-allowed.json, /checklist-styles/)
[^gated-load]: test:scripts/kits/source-rules.test.mjs::gated-load > finds a load on the window's focus or blur, on return to the page, and in their on… handlers; test:scripts/kits/source-rules.test.mjs::gated-load > lets rendering-only gates through: an animation or caret paused, what is drawn windowed, a media stream verify:testExists(scripts/kits/source-rules.test.mjs::gated-load > finds a load on the window's focus or blur, on return to the page, and in their on… handlers) verify:testExists(scripts/kits/source-rules.test.mjs::gated-load > finds a load an idle wait or an observer decides, and one that waits on an in-view or idle hook) verify:testExists(scripts/kits/source-rules.test.mjs::gated-load > finds a load under a document.hidden, visibilityState or hasFocus condition, after an early return too) verify:testExists(scripts/kits/source-rules.test.mjs::gated-load > lets rendering-only gates through: an animation or caret paused, what is drawn windowed, a media stream) verify:testExists(scripts/kits/source-rules.test.mjs::gated-load > lets saving on hide through: sendBeacon, and a fetch with keepalive or another method) verify:testExists(scripts/kits/source-rules.test.mjs::gated-load > never makes the component around it a hand-rolled control at its call sites) verify:testExists(scripts/kits/source-rules.test.mjs::gated-load > finds an element that fetches only as it nears the screen, and an address that waits on a gate)
[^gated-load-escape]: test:scripts/kits/source-rules.test.mjs::main > --base: the ratchet > gives a gated load's rise the eager-loading advice, and lets it through once a reason is recorded verify:testExists(scripts/kits/source-rules.test.mjs::main > --base: the ratchet > gives a gated load's rise the eager-loading advice, and lets it through once a reason is recorded)
[^wrappers]: test:scripts/kits/source-rules.test.mjs::the ratchet against real changes > counts every hop of a wrapper chain, and terminates on a cycle; test:scripts/kits/source-rules.test.mjs::call sites > counts each use of an app component that hand-rolls a control, and re-exported third-party controls verify:testExists(scripts/kits/source-rules.test.mjs::the ratchet against real changes > counts every hop of a wrapper chain, and terminates on a cycle) verify:testExists(scripts/kits/source-rules.test.mjs::call sites > counts each use of an app component that hand-rolls a control, and re-exported third-party controls)
[^fingerprints]: test:scripts/kits/source-rules.test.mjs::fingerprints > do not change when lines move, and report the new line; test:scripts/kits/source-rules.test.mjs::fingerprints > record only the stable props, in a fixed order, literal or as written verify:testExists(scripts/kits/source-rules.test.mjs::fingerprints > do not change when lines move, and report the new line) verify:testExists(scripts/kits/source-rules.test.mjs::fingerprints > record only the stable props, in a fixed order, literal or as written)
[^check-jank]: test:scripts/check/check.test.mts::Ouro check's design rules > fails each seed case where a person saw it, with numbers that say why verify:testExists(scripts/check/check.test.mts::Ouro check's design rules > fails each seed case where a person saw it, with numbers that say why) verify:fileLine(registry/ouro/check/check.ts, /^const MAX_FORCED = 50;$/) verify:fileLine(registry/ouro/check/check.ts, /^const MAX_STEP_SHIFT = 0.01;$/) verify:fileLine(registry/ouro/check/check.ts, /^const WALK_EACH = 3;$/) verify:fileLine(registry/ouro/check/check.ts, /^const WALK_RUNS = 3;$/)
[^check-design]: test:scripts/check/check.test.mts::Ouro check > finds each rule on its fail page and nothing on any pass page, with a report, a contact sheet and close-ups; test:scripts/check/check.test.mts::Ouro check's design rules > fails each seed case where a person saw it, with numbers that say why verify:testExists(scripts/check/check.test.mts::Ouro check > finds each rule on its fail page and nothing on any pass page, with a report, a contact sheet and close-ups) verify:testExists(scripts/check/check.test.mts::Ouro check's design rules > fails each seed case where a person saw it, with numbers that say why)
[^check-repaint]: test:scripts/check/check.test.mts::Ouro check > finds each rule on its fail page and nothing on any pass page, with a report, a contact sheet and close-ups verify:testExists(scripts/check/check.test.mts::Ouro check > finds each rule on its fail page and nothing on any pass page, with a report, a contact sheet and close-ups) verify:fileLine(registry/ouro/check/check.ts, /contextFor\(width, height, theme, "no-preference"\)/)
[^check-design-limits]: registry/ouro/check/design-check.ts verify:fileLine(registry/ouro/check/design-check.ts, /pictureShare = 0.55, pictureRatio = 1.25, pictureMin = 240, headingRoom = 0.5, hugPx = 6, maxSizes = 10, maxWeights = 3, maxShadows = 5/) verify:fileLine(registry/ouro/check/design-check.ts, /p.width \/ p.height >= 1.8/)
[^check-https]: test:scripts/check/check.test.mts::Ouro check's design rules > https: a site moves http:// to https:// with a 301 and asks for HSTS for a year, and so does its www. name verify:testExists(scripts/check/check.test.mts::Ouro check's design rules > https: a site moves http:// to https:// with a 301 and asks for HSTS for a year, and so does its www. name) verify:fileLine(registry/ouro/check/check.ts, /^const HSTS_MIN = 31536000;$/)
[^check-video]: registry/ouro/check/size-check.ts verify:fileLine(registry/ouro/check/size-check.ts, /^  for \(const video of document.querySelectorAll\("video"\)\) \{$/)
[^check-rules]: test:scripts/check/check.test.mts::Ouro check > finds each rule on its fail page and nothing on any pass page, with a report, a contact sheet and close-ups verify:testExists(scripts/check/check.test.mts::Ouro check > finds each rule on its fail page and nothing on any pass page, with a report, a contact sheet and close-ups)
[^check-many]: test:scripts/check/check.test.mts::Ouro check > takes at most 40 close-ups a page, the first of each finding, in a run and in a merge verify:testExists(scripts/check/check.test.mts::Ouro check > takes at most 40 close-ups a page, the first of each finding, in a run and in a merge)
[^check-exit]: test:scripts/check/check.test.mts::Ouro check's command > exits as every Ouro tool does: the Ouro AX kit's 0 ok, 1 error and 2 usage, then 3 for findings; test:scripts/check/check.test.mts::Ouro check's command > exits 3 on gated findings, writes the step summary, and exits 0 when the config waives them; test:scripts/check/check.test.mts::Ouro check's command > exits 2 when Playwright, axe-core, the config, the earlier report, a shard's report or the pages are missing, and 1 when it cannot run verify:testExists(scripts/check/check.test.mts::Ouro check's command > exits as every Ouro tool does: the Ouro AX kit's 0 ok, 1 error and 2 usage, then 3 for findings) verify:testExists(scripts/check/check.test.mts::Ouro check's command > exits 3 on gated findings, writes the step summary, and exits 0 when the config waives them) verify:testExists(scripts/check/check.test.mts::Ouro check's command > exits 2 when Playwright, axe-core, the config, the earlier report, a shard's report or the pages are missing, and 1 when it cannot run)
[^check-shard]: test:scripts/check/check.test.mts::Ouro check > a sharded run, merged, finds what one run does, with every shot, and a config gates the merge again verify:testExists(scripts/check/check.test.mts::Ouro check > a sharded run, merged, finds what one run does, with every shot, and a config gates the merge again)
[^check-before]: test:scripts/check/check.test.mts::Ouro check > gives a finding gone since --before a captioned before and after, and none to one still there at another size verify:testExists(scripts/check/check.test.mts::Ouro check > gives a finding gone since --before a captioned before and after, and none to one still there at another size)
[^check-ready]: test:test/check-in-page.test.ts::readiness > is ready once the page fires a ready event, marks itself ready, or has drawn its h1 verify:testExists(test/check-in-page.test.ts::readiness > is ready once the page fires a ready event, marks itself ready, or has drawn its h1)
[^check-image-fade]: test:scripts/check/check.test.mts::Ouro check > finds each rule on its fail page and nothing on any pass page, with a report, a contact sheet and close-ups; test:test/check-in-page.test.ts::findImageFades > finds a picture faded by a gradient mask on itself or a box around it, by either mask property; test:test/check-in-page.test.ts::findImageFades > finds a picture that a gradient to transparent covers: an overlay, or a ::before or ::after of the picture or a box around it verify:testExists(test/check-in-page.test.ts::findImageFades > finds a picture faded by a gradient mask on itself or a box around it, by either mask property) verify:testExists(test/check-in-page.test.ts::findImageFades > finds a picture that a gradient to transparent covers: an overlay, or a ::before or ::after of the picture or a box around it)
[^check-image-fade-allow]: test:test/check-in-page.test.ts::findImageFades > passes a picture with a hard edge, on a solid band, beside or under a gradient, hidden, or allowed with a reason verify:testExists(test/check-in-page.test.ts::findImageFades > passes a picture with a hard edge, on a solid band, beside or under a gradient, hidden, or allowed with a reason) verify:fileLine(registry/ouro/check/in-page.ts, /^  "data-image-fade-ok": "image-fade",$/)
[^fades]: test:scripts/check/fades.test.mts::the fade check > finds a gradient mask in a stylesheet: mask-image, -webkit-mask-image, mask and -webkit-mask, over several lines too; test:scripts/check/fades.test.mts::the fade check > finds a gradient mask in Tailwind: an arbitrary property or value, and every gradient mask utility, under any variant; test:scripts/check/fades.test.mts::the fade check > finds a gradient mask in a style object or a setProperty call verify:testExists(scripts/check/fades.test.mts::the fade check > finds a gradient mask in a stylesheet: mask-image, -webkit-mask-image, mask and -webkit-mask, over several lines too) verify:testExists(scripts/check/fades.test.mts::the fade check > finds a gradient mask in Tailwind: an arbitrary property or value, and every gradient mask utility, under any variant) verify:testExists(scripts/check/fades.test.mts::the fade check > finds a gradient mask in a style object or a setProperty call)
[^fades-files]: test:scripts/check/fades.test.mts::the fade check > reads every source an app styles pictures in, and never dependencies, build output or hidden folders verify:testExists(scripts/check/fades.test.mts::the fade check > reads every source an app styles pictures in, and never dependencies, build output or hidden folders)
[^fades-exit]: test:scripts/check/fades.test.mts::the fade check's command > prints each finding with its place, its declaration and the fix, and exits 3; test:scripts/check/fades.test.mts::the fade check's command > prints its usage for --help, exits 2 on a usage problem, and 1 when a file cannot be read verify:testExists(scripts/check/fades.test.mts::the fade check's command > prints each finding with its place, its declaration and the fix, and exits 3) verify:testExists(scripts/check/fades.test.mts::the fade check's command > prints its usage for --help, exits 2 on a usage problem, and 1 when a file cannot be read)
[^fades-ok]: test:scripts/check/fades.test.mts::the fade check > passes a gradient mask that says why on its line or the line before, and only with a reason verify:testExists(scripts/check/fades.test.mts::the fade check > passes a gradient mask that says why on its line or the line before, and only with a reason) verify:testExists(scripts/check/fades.test.mts::the fade check > passes a gradient mask whose reason is anywhere in the comment just above it, a block comment's continuation lines too)
[^fades-ci]: test:scripts/check/fades.test.mts::the fade check > keeps Ouro HX's own masks, which fade text and controls, each with its reason; .github/workflows/ci.yml verify:testExists(scripts/check/fades.test.mts::the fade check > keeps Ouro HX's own masks, which fade text and controls, each with its reason) verify:fileLine(.github/workflows/ci.yml, /^      - run: node registry\/ouro\/check\/fades\.ts registry site$/) verify:ciJob(ci)
[^check-allow]: test:test/check-in-page.test.ts::findSizeIssues: sideways-scroll > names the page when only an allowed element sticks out, and passes a page that allows it with a reason verify:testExists(test/check-in-page.test.ts::findSizeIssues: sideways-scroll > names the page when only an allowed element sticks out, and passes a page that allows it with a reason)
[^check-sizes]: registry/ouro/check/check.ts verify:fileLine(registry/ouro/check/check.ts, /^  \[320, 640\], /) verify:fileLine(registry/ouro/check/check.ts, /\[3840, 2160\],$/) verify:fileLine(registry/ouro/check/check.ts, /^  \[640, 360\], \[720, 420\], \[900, 500\], \[1000, 600\],$/) verify:fileLine(registry/ouro/check/check.ts, /^const dprAt = \(width: number\) => \(width <= 3072 \? 2 : 1\);$/) verify:testExists(scripts/check/check.test.mts::Ouro check > draws a screen wider than 3072px at density 1, holds its pictures to that, and records the density of each finding)
[^check-truncate]: test:test/check-in-page.test.ts::findSizeIssues: clipped-text > passes text that fits, hidden text, a block with block children, allowed clamps, and truncation whose whole text is still there; test:test/check-in-page.test.ts::findSizeIssues: clipped-text > finds text cut across by its box, and an ellipsis or a line clamp that leaves the whole text nowhere verify:testExists(test/check-in-page.test.ts::findSizeIssues: clipped-text > passes text that fits, hidden text, a block with block children, allowed clamps, and truncation whose whole text is still there) verify:testExists(test/check-in-page.test.ts::findSizeIssues: clipped-text > finds text cut across by its box, and an ellipsis or a line clamp that leaves the whole text nowhere)
[^check-measured]: test:scripts/check/check.test.mts::Ouro check > measures layout shift, first content and each press against their budgets, presses at one size and theme, and records each number verify:testExists(scripts/check/check.test.mts::Ouro check > measures layout shift, first content and each press against their budgets, presses at one size and theme, and records each number)
[^check-shift]: test:test/check-measure.test.ts::listenForMeasures > scores the largest burst of shifts no input caused, and keeps the element that moved most verify:testExists(test/check-measure.test.ts::listenForMeasures > scores the largest burst of shifts no input caused, and keeps the element that moved most)
[^check-press]: test:test/check-measure.test.ts::markPressables > marks and names the listed controls, shown and enabled, up to the limit, and never a destructive one, a link or a form submit; test:test/check-measure.test.ts::pressPoint > gives no point where the press would click a control it never presses, such as a destructive button in a listed wrapper verify:testExists(test/check-measure.test.ts::markPressables > marks and names the listed controls, shown and enabled, up to the limit, and never a destructive one, a link or a form submit) verify:testExists(test/check-measure.test.ts::pressPoint > gives no point where the press would click a control it never presses, such as a destructive button in a listed wrapper)
[^check-opt-in]: test:scripts/check/check.test.mts::Ouro check > presses only what a page or the config lists, never a destructive control, as often as the config says; test:test/check-measure.test.ts::markPressables > marks nothing unless it is listed for pressing verify:testExists(scripts/check/check.test.mts::Ouro check > presses only what a page or the config lists, never a destructive control, as often as the config says) verify:testExists(test/check-measure.test.ts::markPressables > marks nothing unless it is listed for pressing)
[^check-repeat]: test:scripts/check/check.test.mts::Ouro check > measures layout shift, first content and each press against their budgets, presses at one size and theme, and records each number verify:testExists(scripts/check/check.test.mts::Ouro check > measures layout shift, first content and each press against their budgets, presses at one size and theme, and records each number) verify:fileLine(registry/ouro/check/check.ts, /^const PRESS_REPEAT = 5;$/)
[^check-budgets]: registry/ouro/check/check.ts verify:fileLine(registry/ouro/check/check.ts, /^const BUDGETS: Budgets = Object.freeze\(\{ inp: 200, "layout-shift": 0.1, "first-content": 2500, jank: 250 \}\);$/) verify:fileLine(registry/ouro/check/check.ts, /^const MAX_PRESSES = 24;$/) verify:fileLine(registry/ouro/check/check.ts, /^const INP_SIZE = "1440x900";$/)
[^check-site]: .github/ouro-check.json verify:fileLine(.github/ouro-check.json, /"inp": "/) verify:fileLine(.github/workflows/screens.yml, /config: .github\/ouro-check.json/)
[^check-pages]: test:test/check-in-page.test.ts::findSizeIssues: broken-image > finds a picture that loaded empty, named as a blurry one would be, unless allowed with a reason; test:scripts/check/check.test.mts::Ouro check > fails a page that answers an error or does not answer, and checks nothing else on it; test:scripts/check/check.test.mts::Ouro check > checks a page that never settles once its waits run out verify:testExists(test/check-in-page.test.ts::findSizeIssues: broken-image > finds a picture that loaded empty, named as a blurry one would be, unless allowed with a reason) verify:testExists(scripts/check/check.test.mts::Ouro check > fails a page that answers an error or does not answer, and checks nothing else on it) verify:testExists(scripts/check/check.test.mts::Ouro check > checks a page that never settles once its waits run out)
[^check-allowances]: test:test/check-in-page.test.ts::aliases > lists every opt-out with a reason, and none without one; test:scripts/check/check.test.mts::Ouro check > records each opt-out once a page with its reason, plain aliases included, and keeps them through a merge verify:testExists(test/check-in-page.test.ts::aliases > lists every opt-out with a reason, and none without one) verify:testExists(scripts/check/check.test.mts::Ouro check > records each opt-out once a page with its reason, plain aliases included, and keeps them through a merge)
[^check-aliases]: test:test/check-in-page.test.ts::aliases > counts a plain alias only with its reason as its value, as data-ouro-allow does only with data-ouro-allow-why; test:test/check-in-page.test.ts::aliases > lists every opt-out with a reason, and none without one verify:testExists(test/check-in-page.test.ts::aliases > counts a plain alias only with its reason as its value, as data-ouro-allow does only with data-ouro-allow-why) verify:testExists(test/check-in-page.test.ts::aliases > lists every opt-out with a reason, and none without one) verify:fileLine(registry/ouro/check/in-page.ts, /^  "data-size-ignore": "sideways-scroll clipped-text long-lines blurry-image",$/)
[^images]: test:scripts/images/images.test.mts::Ouro images > writes each picture as AVIF and WebP at each width, and a manifest with the srcset of each; test:scripts/images/images.test.mts::Ouro images > plans each width narrower than the picture, then its own verify:testExists(scripts/images/images.test.mts::Ouro images > writes each picture as AVIF and WebP at each width, and a manifest with the srcset of each) verify:testExists(scripts/images/images.test.mts::Ouro images > plans each width narrower than the picture, then its own) verify:fileLine(registry/ouro/images/images.ts, /^const WIDTHS = \[320, 640, 960, 1280, 1920, 2560, 3840, 5120\];$/)
[^images-kept]: test:scripts/images/images.test.mts::Ouro images > keeps a picture's files while its bytes and options are the same, and writes them again when either changes verify:testExists(scripts/images/images.test.mts::Ouro images > keeps a picture's files while its bytes and options are the same, and writes them again when either changes)
[^images-upright]: test:scripts/images/images.test.mts::Ouro images > turns a photo upright as its EXIF orientation says, and percent-encodes an address with a space or a #; test:scripts/images/images.test.mts::Ouro images > reads a source folder inside the out folder, and leaves out an animated picture verify:testExists(scripts/images/images.test.mts::Ouro images > turns a photo upright as its EXIF orientation says, and percent-encodes an address with a space or a #) verify:testExists(scripts/images/images.test.mts::Ouro images > reads a source folder inside the out folder, and leaves out an animated picture)
[^check-corner-frame]: test:test/check-design-in-page.test.ts::listCornerMedia > lists pictures, videos and canvases, with the radius of the frame they fill (past a wrapper that draws no box) and the colour behind it verify:testExists(test/check-design-in-page.test.ts::listCornerMedia > lists pictures, videos and canvases, with the radius of the frame they fill (past a wrapper that draws no box) and the colour behind it)
[^check-states]: test:scripts/check/check.test.mts::Ouro check > checks a state a page reaches by presses as a page of its own, and fails one whose press finds nothing verify:testExists(scripts/check/check.test.mts::Ouro check > checks a state a page reaches by presses as a page of its own, and fails one whose press finds nothing)
[^check-settle]: test:scripts/check/check.test.mts::Ouro check > checks a state a page reaches by presses as a page of its own, and fails one whose press finds nothing; test:scripts/check/check.test.mts::Ouro check > judges a page once its animations have run, as a person sees it after a moment; test:scripts/check/check.test.mts::Ouro check > names a page by site and path across several sites, a URL by its host and path, and the home page home verify:testExists(scripts/check/check.test.mts::Ouro check > judges a page once its animations have run, as a person sees it after a moment) verify:testExists(scripts/check/check.test.mts::Ouro check > names a page by site and path across several sites, a URL by its host and path, and the home page home) verify:testExists(scripts/check/check.test.mts::Ouro check > checks a state a page reaches by presses as a page of its own, and fails one whose press finds nothing)
[^check-overlap-picture]: test:test/check-in-page.test.ts::findOverlaps > leaves out the part of a picture a clipping box cuts away, and a label on an opaque backing of its own, but not one on a see-through backing verify:testExists(test/check-in-page.test.ts::findOverlaps > leaves out the part of a picture a clipping box cuts away, and a label on an opaque backing of its own, but not one on a see-through backing)
[^check-mask-ramp]: test:test/check-in-page.test.ts::findImageFades > reads a linear mask's ramp along its line and finds only a picture in the part it fades, and any picture under a mask it can't read so verify:testExists(test/check-in-page.test.ts::findImageFades > reads a linear mask's ramp along its line and finds only a picture in the part it fades, and any picture under a mask it can't read so)
[^check-measure]: test:scripts/check/check.test.mts::Ouro check > checks long lines only against a measure the project declares: none without one, a page glob's prose, or a selector's elements; test:test/check-in-page.test.ts::findSizeIssues: long-lines > counts columns side by side as lines of their own, and a run of short items as a list, not prose; test:test/check-in-page.test.ts::findSizeIssues: long-lines > finds nothing without a declared measure, however long the lines run; test:test/check-in-page.test.ts::findSizeIssues: long-lines > holds the elements a selector names to a measure in px, and leaves the rest alone; test:test/check-in-page.test.ts::findSizeIssues: long-lines > holds prose to a measure in ch, the width of so many zeros in its own font verify:testExists(scripts/check/check.test.mts::Ouro check > checks long lines only against a measure the project declares: none without one, a page glob's prose, or a selector's elements) verify:testExists(test/check-in-page.test.ts::findSizeIssues: long-lines > finds nothing without a declared measure, however long the lines run) verify:testExists(test/check-in-page.test.ts::findSizeIssues: long-lines > holds the elements a selector names to a measure in px, and leaves the rest alone) verify:testExists(test/check-in-page.test.ts::findSizeIssues: long-lines > holds prose to a measure in ch, the width of so many zeros in its own font) verify:testExists(test/check-in-page.test.ts::findSizeIssues: long-lines > counts columns side by side as lines of their own, and a run of short items as a list, not prose)
[^check-chars]: test:test/check-in-page.test.ts::findSizeIssues: long-lines > with 100 chars on the prose, finds prose whose lines average more than 100 characters, as the rule always counted, and marks an element once per finding verify:testExists(test/check-in-page.test.ts::findSizeIssues: long-lines > with 100 chars on the prose, finds prose whose lines average more than 100 characters, as the rule always counted, and marks an element once per finding)
[^not-bare]: test:scripts/kits/source-rules.test.mjs::vague-failure-copy > keeps the detector Ouro AX shares: six phrases and the bare failure pattern verify:testExists(scripts/kits/source-rules.test.mjs::vague-failure-copy > keeps the detector Ouro AX shares: six phrases and the bare failure pattern)
