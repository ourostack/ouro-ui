# Testing

Ouro UI's tests install beside each component and run in your app, in real browsers, against your theme. They need Vitest 4.1.11 or later in browser mode, Playwright 1.58.1 or later and, for the stories and specs, Storybook 10.2.10 or later; no item sets a version, so your pins stay. This page covers what the test kit needs, what to do on Vitest 4, and how to find Ouro UI's fields in your own tests.

## What the tests need

| Package | Needs | Ouro UI's CI runs |
| --- | --- | --- |
| `vitest`, `@vitest/browser-playwright` | 4.1.11 or later, in browser mode | 5.0.3 |
| `playwright`, `@playwright/test` | 1.58.1 or later, with Chromium and WebKit installed (`npx playwright install chromium webkit`) | 1.63.0 |
| `storybook`, `@storybook/react-vite` | 10.2.10 or later, only for the stories and the specs in `e2e/ouro` | 10.6.1 |

The `-tests` items list these as devDependencies without a version. The shadcn CLI installs a package only when your `package.json` has no entry for it, so an add never upgrades or downgrades a tool you already have. v0.7.0's items still carry versions: after `add`, restore every test-tool version you had pinned (`git diff package.json`). Each item's `meta.requires` in the registry holds the same minimums for tools that read it.

The tests do not run in jsdom or happy-dom. They drag, flick and measure, so they need a browser.

## Install and run

```sh
npx shadcn@latest add ourostack/ouro-ui/dialog#v0.7.0 ourostack/ouro-ui/dialog-tests#v0.7.0
```

A `<name>-tests` item installs the component's tests, type tests, stories and spec, the tests of every component and helper that came with it, and `ouro-testing`, the test kit. The installed tests cover the installed files to 100% of lines and branches, whichever components you chose; Ouro UI's CI checks that for the button, the dialog, the sheet and the form controls as a set. `ouro-tests` adds every component with all of its tests.

Then add the config files the `ouro-testing` install message prints: `vitest.config.ts`, a Storybook and a Playwright config if your app has none, and `e2e/ouro-fixtures.ts`. The Vitest config is:

```ts
import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";
import { ouroTestProjects } from "./src/lib/ouro/testing/vitest.ts";

export default mergeConfig(viteConfig, defineConfig({ test: { projects: ouroTestProjects({ css: "./src/index.css" }) } }));
```

`ouroTestProjects` returns three projects: `ouro-chromium`, `ouro-webkit` and `ouro-touch` (Chromium as a 390x844 touch phone, for files named `*.touch.test.tsx`). Run them with `npx vitest run`, and the specs with `npx playwright test e2e/ouro`.

To measure coverage of the installed files, use the same settings as Ouro UI's repository:

```ts
coverage: {
  provider: "istanbul",
  include: ["src/components/ouro/**/*.{ts,tsx}", "src/lib/ouro/**/*.{ts,tsx}"],
  exclude: ["**/*.stories.tsx", "**/*.test.{ts,tsx}", "**/*.test-d.ts", "**/*.d.ts", "src/lib/ouro/testing/**"],
  thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
},
```

## What the test kit enforces

- A test fails when it writes anything to the console: a React `act()` warning, a development message from Ouro UI or Base UI, a stray `console.log`. A test that expects a message mocks the method and asserts on the mock: `vi.spyOn(console, "error").mockImplementation(() => {})`. The rule applies to your own tests too if you run them in these projects.
- In `ouro-touch`, a test that leaves the page zoomed fails.
- The specs in `e2e/ouro` import `test` and `expect` from `e2e/ouro-fixtures.ts`. That file is yours and no item ships it, so no add overwrites it. Export your own `test` from it to run the specs with your fixtures.

## Vitest 4

The tests are written for Vitest 5 and run on Vitest 4.1.11 or later with two changes. An app that must stay on Vitest 4, for example for `@cloudflare/vitest-pool-workers`, makes them once.

1. Pass `page` to `ouroTestProjects`:

```ts
ouroTestProjects({ css: "./src/index.css", page: { width: 1600, height: 1200 } })
```

Vitest 4 scales the test frame down when the Playwright page is smaller than the viewport a test asks for, and the tests ask for up to 1280x844. A scaled frame moves real-mouse drags off their targets and makes measured sizes fractional, so the drag, sheet and sizing tests fail without this. Vitest 5 does not scale the frame and needs no `page`.

2. Use Playwright 1.64 or later, or skip two WebKit tests. Vitest 4 sizes the test frame with a CSS transform, and under it the WebKit that Playwright 1.58 ships measures `100dvh` a fraction of a pixel short (811.999939px of 812); with Playwright 1.64 it does not. Two tests in `sheet.test.tsx` compare that height exactly and fail there, in WebKit only: "sits at the bottom edge, fits its content and keeps clear of the top" and "covers the visible screen on a page scrolled 2000px". They pass in Chromium and in the touch project, and in WebKit on Vitest 5.

Ouro UI's CI runs Vitest 5 only. The Vitest 4 minimums are the versions the first app to adopt the tests runs them on, with these two changes, to 100% coverage.

## Finding fields in tests

These lookups are the same in Playwright (`page.getByRole`) and in Vitest browser mode (`page.getByRole` from `vitest/browser`). `test/finding-fields.test.tsx` in Ouro UI's repository asserts each one.

| To find | Use | Why |
| --- | --- | --- |
| A labelled field | `getByRole("textbox", { name: "Email", exact: true })` | The label names the input. `exact` keeps "Email" from also matching "Work email". |
| A required field | The same: `getByRole("textbox", { name: "Email", exact: true })` | The required marker `*` is hidden from assistive technology, so the accessible name is still "Email". The label's text is "Email*", so `getByLabel("Email", { exact: true })` finds nothing; use the role, or `getByLabel("Email*", { exact: true })`. |
| A password field | `getByRole("textbox", { name: "Password", exact: true })` | Playwright and Vitest give a password input the `textbox` role. The field also renders a "Show password" button, so `getByLabel("Password")` without `exact` finds two elements. In Testing Library a password input has no role: use `getByLabelText("Password", { exact: true })`, with the `*` when the field is required. |
| A field's error | `getByText("Enter an email address.")`, or assert on the field: `toHaveAccessibleDescription("Enter an email address.")` and `toHaveAttribute("aria-invalid", "true")` | The error is the field's description. It is not an alert, so `getByRole("alert")` does not find it. |
| The form's message | `getByRole("alert").filter({ hasText: "We could not save your changes." })` | A `Form` always renders its alert region, empty until there is a message, so a bare `getByRole("alert")` finds an empty element and cannot tell you a message arrived. Filter by text, or use `filter({ hasText: /\S/ })` for any message. |

Other controls: a `Select` and a `Combobox` are `getByRole("combobox", { name })`; a `Checkbox` is `getByRole("checkbox", { name })`; a `Switch` is `getByRole("switch", { name })`; a `RadioGroup` is `getByRole("radiogroup", { name })` with `getByRole("radio", { name })` inside.

The required marker, the password button and the empty alert region are being reworked. When a release changes one, its notes say so and this table changes with it.

## Choosing an option in a Select

Open the list and choose with real pointer events: `locator.click()` in Playwright, `userEvent.click()` from `vitest/browser`. The options act on pointer events, so a synthetic `fireEvent.click` chooses nothing.

```ts
await page.getByRole("combobox", { name: "Course" }).click();
await page.getByRole("option", { name: "Main" }).click();
```

A `Select` with `multiple` posts one entry per chosen value under its `name`; read them with `formData.getAll("tags")`.
