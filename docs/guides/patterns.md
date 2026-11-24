# Page patterns

Whole pages built from Ouro's components, which an app installs into its own components folder and then changes, as shadcn's blocks are. Start from one when you build a page it covers: the theme draws it, so the page needs no stylesheet of its own, and what you change is the fields, the numbers and the copy.[^axe]

A pattern brings the components it uses, through the `@ouro` namespace. Add it once the app has Ouro's theme and base tokens, as step 3 of the [agent quickstart](agent-quickstart.md) adds them:[^deps]

```sh
npx shadcn@latest add @ouro/settings-page --yes
```

Then render it, and change it to what you are building:

```tsx
import { SettingsPage } from "@/components/patterns/settings-page";

export default function App() {
  return <SettingsPage onSave={(settings) => api.saveSettings(settings)} onDelete={() => api.deleteAccount()} />;
}
```

## `settings-page`

A header with the light and dark toggle, a profile form the browser validates, and a danger zone that confirms before it deletes.[^settings] `onSave` gets the settings once the browser's checks and the page's own pass; return field errors, such as `{ email: "That email is in use." }`, to show them on their fields. `onDelete` runs after the person confirms. Change the `Settings` type, the fields and the copy to your app's.

```sh
npx shadcn@latest add @ouro/settings-page --yes
```

## `dashboard-page`

A header with the light and dark toggle, the numbers that matter in cards with how each moved, a chart of the last months and a table of recent activity.[^dashboard] It takes `stats`, `months` and `activity`, and shows made-up data without them, so it renders as installed. Change the cards, the chart's series and the table's columns to what your app tracks.

```sh
npx shadcn@latest add @ouro/dashboard-page --yes
```

## `list-detail-page`

A header with the light and dark toggle, a list you can search, and the detail of the entry chosen beside it; on a phone the list comes first, and choosing an entry shows its detail in its place, with a way back.[^list-detail] It takes `entries` and a `title`, and shows made-up entries without them. Change the `Entry` type and the detail to what your app shows.

```sh
npx shadcn@latest add @ouro/list-detail-page --yes
```

## What to test

A pattern's own behaviour is tested in Ouro, in Chromium and WebKit:[^axe][^settings][^dashboard] the checks before a save, errors on their fields, the saved message, the confirmation before a delete, the dashboard's empty table, and the list's search and the way back on a phone.[^list-detail] Test only what you add, such as where `onSave` sends the settings. The JSDoc at the top of a pattern's file lists what it does, what the app wires up and the props of the parts it uses, so you can change it without opening the components.

## What it costs

What a pattern adds to an app is held to a ceiling.[^size] A pull request that grows a pattern by more than its budget over the commit it merges into (1 KiB of JavaScript, 512 bytes of CSS) fails CI, naming the components and packages that grew, so a ceiling main has nearly reached fails only the change that crosses it.[^size-gate] When main's run on that commit has not measured it yet, the base is the nearest earlier commit on main that was measured, and the log names it.[^size-walk] A pattern over its ceiling on main opens or updates an issue instead.[^size-main] Measured over a bare Vite app with React and Ouro's stylesheet, in gzip bytes: `settings-page` adds 105,063 of JavaScript and 13,737 of CSS,[^size-settings] `list-detail-page` adds 85,796 and 9,731,[^size-list-detail] and `dashboard-page` adds 86,430 and 10,598, with its chart.[^size-dashboard]

How long a pattern takes to paint is held too, on a 390px phone with its CPU slowed four times: a pattern that paints a quarter later than its baseline, against a bare app loaded beside it on the same runner, fails CI, and so does that bare app, which every pattern's paint includes, against the runner's speed.[^paint] On the runners that set the baselines, `list-detail-page` painted in 326 ms and `settings-page` in 402 beside a bare app's 148 and 152, and `dashboard-page` in 438 beside a bare app's 168, its chart drawn by 804.[^paint-numbers]

## When it's done

Build the app and run [Ouro check](guardrails.md): a page is done when the build passes and the check reports `0 finding(s)`. Its `off-theme` rule names the token to use for any colour, radius, shadow or font a change writes past the theme.

[^axe]: test:test/patterns.test.tsx::SettingsPage > is a whole page: a main landmark, its heading, the theme toggle, the profile form and the danger zone, and passes axe; test:test/patterns.test.tsx::DashboardPage > is a whole page: a heading, a card per number, headed by the number with its label, with how it moved, a chart and the recent activity, and passes axe verify:testExists(test/patterns.test.tsx::SettingsPage > is a whole page: a main landmark, its heading, the theme toggle, the profile form and the danger zone, and passes axe) verify:testExists(test/patterns.test.tsx::DashboardPage > is a whole page: a heading, a card per number, headed by the number with its label, with how it moved, a chart and the recent activity, and passes axe)
[^settings]: test:test/patterns.test.tsx::SettingsPage > saves only once the browser's checks and its own pass, shows a returned error on its field, and says when it saved; test:test/patterns.test.tsx::SettingsPage > deletes the account only once the person confirms, then starts the form over verify:testExists(test/patterns.test.tsx::SettingsPage > saves only once the browser's checks and its own pass, shows a returned error on its field, and says when it saved) verify:testExists(test/patterns.test.tsx::SettingsPage > deletes the account only once the person confirms, then starts the form over)
[^dashboard]: test:test/patterns.test.tsx::DashboardPage > draws the numbers, months and rows it is given, and says when there is no activity verify:testExists(test/patterns.test.tsx::DashboardPage > draws the numbers, months and rows it is given, and says when there is no activity)
[^deps]: test:scripts/registry.test.mjs::registryDependencies are the same-repo items each item imports, as full unpinned addresses verify:testExists(scripts/registry.test.mjs::registryDependencies are the same-repo items each item imports, as full unpinned addresses)
[^list-detail]: test:test/patterns.test.tsx::ListDetailPage > shows the entry a row's press chooses, and marks that row shown; test:test/patterns.test.tsx::ListDetailPage > on a phone shows the list first, the detail in its place once chosen with focus on its heading, and Back to the row; test:test/patterns.test.tsx::ListDetailPage > narrows the list as you search, says how many match to a screen reader, and says when nothing matches verify:testExists(test/patterns.test.tsx::ListDetailPage > shows the entry a row's press chooses, and marks that row shown) verify:testExists(test/patterns.test.tsx::ListDetailPage > on a phone shows the list first, the detail in its place once chosen with focus on its heading, and Back to the row) verify:testExists(test/patterns.test.tsx::ListDetailPage > narrows the list as you search, says how many match to a screen reader, and says when nothing matches)
[^size]: test:scripts/pattern-size.test.mjs::every page pattern adds no more JavaScript and CSS than its ceiling, gzip bytes over a bare app; test:scripts/pattern-size.test.mjs::a pattern over its ceiling fails naming what grew since the ceiling was set, one within it passes, and one with no ceiling fails with the fix verify:testExists(scripts/pattern-size.test.mjs::every page pattern adds no more JavaScript and CSS than its ceiling, gzip bytes over a bare app) verify:testExists(scripts/pattern-size.test.mjs::a pattern over its ceiling fails naming what grew since the ceiling was set, one within it passes, and one with no ceiling fails with the fix)
[^size-gate]: test:scripts/size-gate.test.mjs::a pull request that grows a size by more than its budget fails, and says by how much it grew; test:scripts/size-gate.test.mjs::a pull request is judged by its own growth over its base, so one a little over a ceiling main had nearly reached passes; test:scripts/pattern-size.test.mjs::each pattern's sizes reach the size gate with their ceilings and the budget a pull request may add verify:testExists(scripts/size-gate.test.mjs::a pull request that grows a size by more than its budget fails, and says by how much it grew) verify:testExists(scripts/size-gate.test.mjs::a pull request is judged by its own growth over its base, so one a little over a ceiling main had nearly reached passes) verify:testExists(scripts/pattern-size.test.mjs::each pattern's sizes reach the size gate with their ceilings and the budget a pull request may add)
[^size-walk]: test:scripts/size-gate.test.mjs::with no report for the commit a pull request merges into, the base is the nearest first-parent ancestor that has one verify:testExists(scripts/size-gate.test.mjs::with no report for the commit a pull request merges into, the base is the nearest first-parent ancestor that has one)
[^size-main]: test:scripts/size-gate.test.mjs::on main a size over its ceiling is a breach to report, not a failed run, and run by hand the ceiling decides verify:testExists(scripts/size-gate.test.mjs::on main a size over its ceiling is a breach to report, not a failed run, and run by hand the ceiling decides) verify:fileLine(.github/workflows/size-ceilings.yml, /A size is over its ceiling on main/)
[^size-settings]: scripts/pattern-size.mjs verify:fileLine(scripts/pattern-size.mjs, /"settings-page": \{ js: 105_063 \+ 1024, css: 13_737 \+ 512 \}/)
[^size-list-detail]: scripts/pattern-size.mjs verify:fileLine(scripts/pattern-size.mjs, /"list-detail-page": \{ js: 85_796 \+ 1024, css: 9_731 \+ 512 \}/)
[^size-dashboard]: scripts/pattern-size.mjs verify:fileLine(scripts/pattern-size.mjs, /"dashboard-page": \{ js: 86_430 \+ 1024, css: 10_598 \+ 512 \}/)
[^paint]: site/e2e/patterns.latency.spec.ts verify:fileLine(site/e2e/patterns.latency.spec.ts, /BARE_BASELINE\.median \* \(loop \/ BARE_BASELINE\.loop\) \* 1\.5/) verify:fileLine(site/e2e/patterns.latency.spec.ts, /const PHONE = \{ width: 390, height: 844 \};/) verify:fileLine(site/e2e/patterns.latency.spec.ts, /baseline\.median \* \(bare \/ baseline\.bare\) \* 1\.25/) verify:fileLine(site/e2e/patterns.latency.spec.ts, /for \(const app of \[BARE, name\]\)/)
[^paint-numbers]: site/e2e/patterns.latency.spec.ts verify:fileLine(site/e2e/patterns.latency.spec.ts, /"dashboard-page": \{ paint: \{ median: 438, bare: 168 \}, plot: \{ median: 804, bare: 168 \} \}/) verify:fileLine(site/e2e/patterns.latency.spec.ts, /"list-detail-page": \{ paint: \{ median: 326, bare: 148 \} \}/) verify:fileLine(site/e2e/patterns.latency.spec.ts, /"settings-page": \{ paint: \{ median: 402, bare: 152 \} \}/)
