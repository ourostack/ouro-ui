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

## `dashboard-page`

A header with the light and dark toggle, the numbers that matter in cards with how each moved, a chart of the last months and a table of recent activity.[^dashboard] It takes `stats`, `months` and `activity`, and shows made-up data without them, so it renders as installed. Change the cards, the chart's series and the table's columns to what your app tracks.

## When it's done

Build the app and run [Ouro check](guardrails.md): a page is done when the build passes and the check reports `0 finding(s)`. Its `off-theme` rule names the token to use for any colour, radius, shadow or font a change writes past the theme.

[^axe]: test:test/patterns.test.tsx::SettingsPage > is a whole page: a main landmark, its heading, the theme toggle, the profile form and the danger zone, and passes axe; test:test/patterns.test.tsx::DashboardPage > is a whole page: a heading, a card per number, headed by the number with its label, with how it moved, a chart and the recent activity, and passes axe verify:testExists(test/patterns.test.tsx::SettingsPage > is a whole page: a main landmark, its heading, the theme toggle, the profile form and the danger zone, and passes axe) verify:testExists(test/patterns.test.tsx::DashboardPage > is a whole page: a heading, a card per number, headed by the number with its label, with how it moved, a chart and the recent activity, and passes axe)
[^settings]: test:test/patterns.test.tsx::SettingsPage > saves only once the browser's checks and its own pass, shows a returned error on its field, and says when it saved; test:test/patterns.test.tsx::SettingsPage > deletes the account only once the person confirms, then starts the form over verify:testExists(test/patterns.test.tsx::SettingsPage > saves only once the browser's checks and its own pass, shows a returned error on its field, and says when it saved) verify:testExists(test/patterns.test.tsx::SettingsPage > deletes the account only once the person confirms, then starts the form over)
[^dashboard]: test:test/patterns.test.tsx::DashboardPage > draws the numbers, months and rows it is given, and says when there is no activity verify:testExists(test/patterns.test.tsx::DashboardPage > draws the numbers, months and rows it is given, and says when there is no activity)
[^deps]: test:scripts/registry.test.mjs::registryDependencies are the same-repo items each item imports, as full unpinned addresses verify:testExists(scripts/registry.test.mjs::registryDependencies are the same-repo items each item imports, as full unpinned addresses)
