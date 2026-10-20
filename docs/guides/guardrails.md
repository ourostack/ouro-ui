# Guardrails

Two optional kits hold an app to Ouro UI the way Ouro UI holds itself: every control a person can reach is an Ouro control, and the number that are not can only fall. The **census** (`ouro-census`) measures the running app, page by page and state by state. The **source rule** (`ouro-source-rules`) reads the app's source and finds the controls still built by hand. Each keeps a committed baseline, so every change is a reviewed diff, and each refuses a rise unless you record why.

Add them from the same place and release tag as your components:

```sh
npx shadcn@latest add ourostack/ouro-ui/ouro-census#v1.1.0 ourostack/ouro-ui/ouro-source-rules#v1.1.0
```

`ouro-census` installs `e2e/ouro-census/` and names `@playwright/test` and `axe-core` as devDependencies. `ouro-source-rules` installs `scripts/ouro-source-rules.mjs` and names `typescript` and `postcss`. Like the test kit, they carry no version, so the CLI installs a package only when your app lacks it.

## The census

A control's identity is one line: its role, its accessible name, its Ouro marker and part (`data-ouro-control` / `data-ouro-part`, `-` when there is none) and its context, the nearest landmark, dialog or named group, else the nearest `data-testid`. Never its position:

```text
button "Save" [button/root] in main
option "Weekly" [select/item] in dialog "Repeat"
link "Notes" [-/-] in testid "note-actions"
```

A state's census is the exact multiset of its visible controls. Whitespace in names collapses, and a relative time ("2 minutes ago") or a calendar date ("Jun 1, 2026") becomes `<relative time>` or `<date>`, so a name never depends on when the run happened.

### List the journeys

A journey is a page your app renders, as the visitor who sees it, and the states a person can open on it: dialogs, menus, sheets, popovers, disclosures. Each state starts from a fresh load of the journey's `path`; its `action` only opens things and never submits, so the census never changes your test data.

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

`projects` lists every Playwright project the spec runs in; a run that leaves one out fails the merge. `componentsDir` is where your app installs Ouro components: a marker naming no file there fails an enrolled journey. Pass `prepare` to wait for hydration after each load, and your own `test` to use your fixtures. Each test fails when the page answers another status (`status`, 200 by default) or redirects, since it would measure some other page.

### Run it and accept changes

Each worker writes its census to `ouro-census/` (or `OURO_CENSUS_DIR`). After the run, merge them and keep the result as the run's artifact, pass or fail:

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

Each state must equal `e2e/ouro-census/census.baseline.json` exactly: an added, removed, renamed, re-marked or duplicated control fails with a diff, and a state the baseline lacks fails with "no baseline". To accept a change, rewrite the baseline from the run and commit it:

```sh
node e2e/ouro-census/census-update.mjs <run-id>          # downloads the artifact with gh
node e2e/ouro-census/census-update.mjs census-actual.json # or reads a local file
```

The census must be deterministic. Before baselining new journeys, run the same commit twice and compare: `node e2e/ouro-census/census-compare.mjs <run-id> <run-id>` fails, naming every difference, unless both runs recorded the same multisets. Measure lists of run-specific data (this run's users, anything another test creates) in a state that cannot show it, such as a search that matches nothing.

### Enrol and ratchet

An enrolled journey fails on any control without an Ouro marker. An unenrolled one is measured, and its unmarked count may only fall, state by state on each project: a fall in one state never pays for a rise in another. The update refuses a rise unless `--allow-regression "<reason>"` says why, and records it under `$allowedRegressions` until the next update. It also refuses to drop a journey or state the baseline has unless `--remove <journey>` (or `<project/journey/state>`) names it and `--remove-reason "<reason>"` says why; a renamed journey is a drop plus a new one, and may not start with more unmarked controls than the one it replaces. Enrol each journey once its controls are all Ouro's.

## The source rule

The source rule reads every `.ts` and `.tsx` file under your source folder with the TypeScript compiler, and every `.css` file with PostCSS, skipping the Ouro installs (`components/ouro/`, `lib/ouro/`), tests, stories and declarations. It finds:

- a raw `<button>`, `<a>` (and React Router's `Link`), visible `<input>`, `<select>`, `<textarea>`, `<details>`/`<summary>`; a hidden input and the anchor Ouro's `Link` renders through `OuroProvider` are exempt;
- `contentEditable`, a positive `tabIndex`, an interactive `role=`, and click, key, pointer or touch handlers on a plain element;
- any `data-ouro*` attribute your code writes;
- elements from another UI-control library (Headless UI, Radix, Base UI used directly, React Aria, Ariakit, MUI, Chakra, vaul, cmdk, sonner);
- control-state styling: `focus:`, `active:`, `aria-pressed:`, `data-[state=open]:` and the like in a `className`, and stylesheet rules that put such state on a class or a `data-*` hook;
- every use of a component of yours that renders any of these, however deep the wrapping.

Each offender is a fingerprint, `file::component::category::tag::props`, never a line number, so moving code keeps it. Record where your app starts, commit the baseline, then check on every change:

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
| `ouroDirs` | `<src>/components/ouro/`, `<src>/lib/ouro/` | Where your app installs Ouro UI; never read. |
| `exclude` | none | More folders not to read, such as generated code. |
| `hookPrefix` | none | Read stylesheet state only on your own hooks (`.app-…`, `[data-app-…]`), not on every class. |
| `baseline` | `ouro-source-rules.baseline.json` | Where the baseline lives. |
