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
npx shadcn@latest add ourostack/ouro-ui/dialog#v1.0.2 ourostack/ouro-ui/dialog-tests#v1.0.2
```

A `<name>-tests` item installs the component's tests, type tests, stories and spec, the tests of every component and helper that came with it, and `ouro-testing`, the test kit. CI verifies 100% line and branch coverage of the installed runtime files for five sets: button, dialog, sheet, the forms set and their union. The forms set is `field`, `fieldset`, `text-field`, `text-area`, `checkbox`, `checkbox-group`, `radio-group`, `switch`, `form`, `select`, `native-select` and `combobox`. Other items receive their full test dependency closure but are not measured individually. This closure guarantee does not establish execution coverage for every item alone. `ouro-tests` adds every component with all of its tests.

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

Vitest 4 scales the test frame down when the Playwright host page is smaller than the viewport a test asks for, and the tests ask for up to 1280x844. A scaled frame moves native mouse and touch input off its targets and makes measured sizes fractional, so the drag, sheet, sizing and landscape touch tests fail without this. Choose a host page large enough for every requested viewport. Vitest 5 does not scale the frame and needs no `page`.

`page` sizes the host of all three projects. The touch test frame still starts at 390x844 and rotates to 844x390; `hasTouch`, mobile mode and the coarse pointer remain enabled. With the example above, the host's outer window and screen are 1600x1200 and report landscape orientation even while the test frame is portrait. The frame's layout/media-query viewport is the phone-sized one. These are native input tests in a logical phone frame, not measurements of a physical phone's screen, orientation or safe-area insets. Without `page`, the touch host still defaults to 390x844.

2. Use Playwright 1.64 or later, or skip two WebKit tests. Vitest 4 sizes the test frame with a CSS transform, and under it the WebKit that Playwright 1.58 ships measures `100dvh` a fraction of a pixel short (811.999939px of 812); with Playwright 1.64 it does not. Two tests in `sheet.test.tsx` compare that height exactly and fail there, in WebKit only: "sits at the bottom edge, fits its content and keeps clear of the top" and "covers the visible screen on a page scrolled 2000px". They pass in Chromium and in the touch project, and in WebKit on Vitest 5.

Ouro UI's repository CI runs Vitest 5. The `page` option also has a native-input consumer regression on Vitest 4.1.11 with Playwright 1.64: portrait, landscape and portrait restoration keep scale 1 and origin 0, preserve coarse touch input, and run the unchanged SwipeActions touch tests. This is not coverage of every tooling/browser combination.

## Finding fields in tests

These lookups are the same in Playwright (`page.getByRole`) and in Vitest browser mode (`page.getByRole` from `vitest/browser`). `test/finding-fields.test.tsx` in Ouro UI's repository asserts each one.

| To find | Use | Why |
| --- | --- | --- |
| A labelled field | `getByRole("textbox", { name: "Email", exact: true })` | The label names the input. `exact` keeps "Email" from also matching "Work email". |
| A required field | The same: `getByRole("textbox", { name: "Email", exact: true })`, or `getByLabel("Email", { exact: true })` | The required marker is drawn with CSS beside the label, not in its text. Both lookups use "Email" without `*`. |
| A password field | `getByRole("textbox", { name: "Password", exact: true })`, or `getByLabel("Password", { exact: true })` | Playwright and Vitest give a password input the `textbox` role. The "Show password" button is named by hidden text, not `aria-label`, so a loose label lookup also finds the input alone. Find the button by its role and name. In Testing Library a password input has no role: use `getByLabelText("Password", { exact: true })`, required or not. |
| A field's error | `getByText("Enter an email address.")`, or assert on the field: `toHaveAccessibleDescription("Enter an email address.")` and `toHaveAttribute("aria-invalid", "true")` | The error is the field's description. It is not an alert, so `getByRole("alert")` does not find it. |
| The form's message | `getByRole("alert").filter({ hasText: "We could not save your changes." })` | A `Form` renders an alert only while there is a message. An accepted new answer inserts a new alert with its text already present; a form without a message has no alert. Filtering by text checks the actual message rather than another alert on the page. |

Other controls: a `Select` and a `Combobox` are `getByRole("combobox", { name })`; a `Checkbox` is `getByRole("checkbox", { name })`; a `Switch` is `getByRole("switch", { name })`; a `RadioGroup` is `getByRole("radiogroup", { name })` with `getByRole("radio", { name })` inside.

These lookups describe the current source, not v0.7.0's behavior. In v0.7.0, required labels include `*` in their text, password buttons also match loose label lookups, and Form keeps an empty alert region. When upgrading from that release, update those selectors and empty-alert assertions; the required field's accessible name stays the same.

## Choosing an option in a Select

Open the list and choose with real pointer events: `locator.click()` in Playwright, `userEvent.click()` from `vitest/browser`. The options act on pointer events, so a synthetic `fireEvent.click` chooses nothing.

```ts
await page.getByRole("combobox", { name: "Course" }).click();
await page.getByRole("option", { name: "Main" }).click();
```

A `Select` with `multiple` posts one entry per chosen value under its `name`; read them with `formData.getAll("tags")`.

## Proving motion

`lib/ouro/testing/motion.ts` proves what a state change animates, one part at a time. Change the state, then call `expectMotion` before any other `await`: it reads the CSS transitions and animations running on the element, fails unless they are exactly the properties you name (no missing and no extra property, with durations in milliseconds when you give them), and waits for them to end. `expectNoMotion` proves a part does not move, a frame after the change. The element needs a `data-ouro-part`; Ouro UI's animated parts carry one (Checkbox's `box` and `tick`).

```ts
const fast = parseDuration(getComputedStyle(document.documentElement).getPropertyValue("--ouro-duration-fast"));
await act(() => box.click());
await Promise.all([
  expectMotion(tick, { stem: "checkbox", state: "data-checked", properties: { opacity: fast, scale: fast }, reduced: false }),
  expectMotion(box, { stem: "checkbox", state: "data-checked", properties: ["background-color", "border-color"], reduced: false }),
]);
```

`reduced` must match the page's reduced-motion setting (`commands.emulateMedia({ reducedMotion: "reduce" })`). A DOM `click()` keeps a pointer's press scale out of the motion you measure. Each helper also records what it proved in the test's meta; Ouro UI's own CI holds every component's declared motion to those records, and in your app nothing reads them.
