# Testing

Ouro UI's tests install beside each component and run in your app, in real browsers, against your theme.[^tests-in-app] They need Vitest 4.1.11 or later in browser mode, Playwright 1.58.1 or later, axe-core 4.13.0 or later and, for the stories and specs, Storybook 10.2.10 or later; no item sets a version, so your pins stay.[^minimums] This page covers what the test kit needs, what to do on Vitest 4, and how to find Ouro UI's fields in your own tests.[^vitest-4-section]

## What the tests need

| Package | Needs | Ouro UI's CI runs |
| --- | --- | --- |
| `vitest`, `@vitest/browser-playwright` | 4.1.11 or later, in browser mode[^minimums] | 5.0.3[^ci-versions] |
| `playwright`, `@playwright/test` | 1.58.1 or later, with Chromium and WebKit installed (`npx playwright install chromium webkit`)[^minimums] | 1.63.0[^ci-versions] |
| `storybook`, `@storybook/react-vite` | 10.2.10 or later, only for the stories and the specs in `e2e/ouro`[^minimums] | 10.6.1[^ci-versions] |
| `axe-core` | 4.13.0 or later: `audit` throws on an older one, naming the version it found[^axe-minimum] | 4.13.0[^ci-axe] |

The `-tests` items list these as devDependencies without a version. The shadcn CLI installs a package only when your `package.json` has no entry for it, so an add never upgrades or downgrades a tool you already have.[^test-versions] v0.7.0's items still carry versions: after `add`, restore every test-tool version you had pinned (`git diff package.json`).[^v0.7.0] Each item's `meta.requires` in the registry holds the same minimums for tools that read it.[^test-versions] The CLI does not check them, so an older tool your app already has stays; `audit` is why axe-core's minimum matters, and it checks it each time it runs.[^axe-minimum]

The tests do not run in jsdom or happy-dom. They drag, flick and measure, so they need a browser.

## Install and run

```sh
npx shadcn@latest add ourostack/ouro-ui/dialog#v1.2.7 ourostack/ouro-ui/dialog-tests#v1.2.7
```

A `<name>-tests` item installs the component's tests, type tests, stories and spec, the tests of every component and helper that came with it, and `ouro-testing`, the test kit.[^tests-closure] CI verifies 100% line and branch coverage of the installed runtime files for five sets: button, dialog, sheet, the forms set and their union.[^subsets] The forms set is `field`, `fieldset`, `text-field`, `text-area`, `checkbox`, `checkbox-group`, `radio-group`, `switch`, `form`, `select`, `native-select` and `combobox`. Other items receive their full test dependency closure but are not measured individually. This closure guarantee does not establish execution coverage for every item alone.[^subsets] `ouro-tests` adds every component with all of its tests.[^ouro-tests]

Then add the config files the `ouro-testing` install message prints: `vitest.config.ts`, a Storybook and a Playwright config if your app has none, and `e2e/ouro-fixtures.ts`. The Vitest config is:

```ts
import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";
import { ouroTestProjects } from "./src/lib/ouro/testing/vitest.ts";

export default mergeConfig(viteConfig, defineConfig({ test: { projects: ouroTestProjects({ css: "./src/index.css" }) } }));
```

`ouroTestProjects` returns three projects: `ouro-chromium`, `ouro-webkit` and `ouro-touch` (Chromium as a 390x844 touch phone, for files named `*.touch.test.tsx`).[^projects] Run them with `npx vitest run`, and the specs with `npx playwright test e2e/ouro`.

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
- The specs in `e2e/ouro` import `test` and `expect` from `e2e/ouro-fixtures.ts`. That file is yours and no item ships it, so no add overwrites it.[^fixtures-yours] Export your own `test` from it to run the specs with your fixtures.

## Vitest 4[^minimums]

The tests are written for Vitest 5 and run on Vitest 4.1.11 or later with two changes.[^ci-versions][^minimums] An app that must stay on Vitest 4, for example for `@cloudflare/vitest-pool-workers`, makes them once.[^minimums]

1. Pass `page` to `ouroTestProjects`:

```ts
ouroTestProjects({ css: "./src/index.css", page: { width: 1600, height: 1200 } })
```

Vitest 4 scales the test frame down when the Playwright host page is smaller than the viewport a test asks for, and the tests ask for up to 1280x844.[^touch-host] A scaled frame moves native mouse and touch input off its targets and makes measured sizes fractional, so the drag, sheet, sizing and landscape touch tests fail without this. Choose a host page large enough for every requested viewport. Vitest 5 does not scale the frame and needs no `page`.[^touch-host]

`page` sizes the host of all three projects.[^touch-host] The touch test frame still starts at 390x844 and rotates to 844x390; `hasTouch`, mobile mode and the coarse pointer remain enabled.[^touch-host] With the example above, the host's outer window and screen are 1600x1200 and report landscape orientation even while the test frame is portrait.[^touch-host] The frame's layout/media-query viewport is the phone-sized one. These are native input tests in a logical phone frame, not measurements of a physical phone's screen, orientation or safe-area insets. Without `page`, the touch host still defaults to 390x844.[^touch-host]

2. Use Playwright 1.64 or later, or skip two WebKit tests in `sheet.test.tsx` that compare a height to `100dvh` exactly under Vitest 4's scaled frame: "sits at the bottom edge, fits its content and keeps clear of the top" and "covers the visible screen on a page scrolled 2000px".[^sheet-dvh-tests]

Ouro UI's repository CI runs Vitest 5.[^ci-versions] The `page` option also has a native-input consumer regression on Vitest 4.1.11 with Playwright 1.64: portrait, landscape and portrait restoration keep scale 1 and origin 0, preserve coarse touch input, and run the unchanged SwipeActions touch tests.[^vitest-4-regression] This is not coverage of every tooling/browser combination.[^vitest-4-regression]

## Finding fields in tests

These lookups are the same in Playwright (`page.getByRole`) and in Vitest browser mode (`page.getByRole` from `vitest/browser`). `test/finding-fields.test.tsx` in Ouro UI's repository asserts each one.[^finding-fields]

| To find | Use | Why |
| --- | --- | --- |
| A labelled field | `getByRole("textbox", { name: "Email", exact: true })` | The label names the input. `exact` keeps "Email" from also matching "Work email". |
| A required field | The same: `getByRole("textbox", { name: "Email", exact: true })`, or `getByLabel("Email", { exact: true })` | The required marker is drawn with CSS beside the label, not in its text. Both lookups use "Email" without `*`. |
| A password field | `getByRole("textbox", { name: "Password", exact: true })`, or `getByLabel("Password", { exact: true })` | Playwright and Vitest give a password input the `textbox` role. The "Show password" button is named by hidden text, not `aria-label`, so a loose label lookup also finds the input alone. Find the button by its role and name. In Testing Library a password input has no role: use `getByLabelText("Password", { exact: true })`, required or not.[^password-role] |
| A field's error | `getByText("Enter an email address.")`, or assert on the field: `toHaveAccessibleDescription("Enter an email address.")` and `toHaveAttribute("aria-invalid", "true")` | The error is the field's description. It is not an alert, so `getByRole("alert")` does not find it. |
| The form's message | `getByRole("alert").filter({ hasText: "We could not save your changes." })` | A `Form` renders an alert only while there is a message. An accepted new answer inserts a new alert with its text already present; a form without a message has no alert.[^form-alert] Filtering by text checks the actual message rather than another alert on the page. |

Other controls: a `Select` and a `Combobox` are `getByRole("combobox", { name })`; a `Checkbox` is `getByRole("checkbox", { name })`; a `Switch` is `getByRole("switch", { name })`; a `RadioGroup` is `getByRole("radiogroup", { name })` with `getByRole("radio", { name })` inside.

These lookups describe the current source, not v0.7.0's behavior.[^finding-fields] In v0.7.0, required labels include `*` in their text, password buttons also match loose label lookups, and Form keeps an empty alert region.[^v0.8.0] When upgrading from that release, update those selectors and empty-alert assertions; the required field's accessible name stays the same.

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
const token = (name: string) => parseDuration(getComputedStyle(document.documentElement).getPropertyValue(name));
await act(() => box.click());
await Promise.all([
  expectMotion(tick, { stem: "checkbox", state: "data-checked", properties: { "stroke-dashoffset": token("--ouro-duration-draw") }, reduced: false }),
  expectMotion(box, { stem: "checkbox", state: "data-checked", properties: ["background-color", "border-color"], reduced: false }),
]);
```

The part, or an element around it inside the part's own component (`[data-ouro]`), must carry the state's attribute when you call a helper (`data-checked`, or `data-swiping=left` for a value), so render outside the state and change into it; a checked row or an open overlay around the component does not count. A transition or CSS animation the browser cancels mid-way counts only when one takes its place on the same element (a transition of the same property, or a CSS animation of the same name) or 90% of its duration had passed.[^motion-cancel] The replacement may still be running when the helper next reads the part, or, on a slow frame, may have begun and ended, uncancelled, in between: the helper listens for the part's transition and animation events while it waits. A replacement for another property or animation, or one that is itself cancelled, does not count. `reduced` must match the page's reduced-motion setting (`commands.emulateMedia({ reducedMotion: "reduce" })`). A DOM `click()` keeps a pointer's press scale out of the motion you measure. Each helper also records what it proved in the test's meta; Ouro UI's own CI holds every component's declared motion to those records, and in your app nothing reads them.[^motion-records]

## Proving announcements

`lib/ouro/testing/announcements.ts` records what live regions announce, so a test proves a screen reader hears a message once per change, in the right region. Start `watchAnnouncements()` before the change. It records, once per region for each batch of DOM changes, the text added to or changed inside a live region already on the page (`role="status"`, `role="alert"`, `role="log"` or `aria-live`, portals included), and the text an assertive region (`role="alert"` or `aria-live="assertive"`) is added with.[^announcements-batch] A polite region added with its text records nothing until that text changes, because screen readers generally don't announce a new polite region's first content; render the region empty and fill it, as Ouro's components do. Only exposed text counts: nothing under `aria-hidden="true"` or `aria-live="off"`, nothing outside the region (text added beside it in the same subtree), and nothing from a render that leaves the text as it was.

```ts
const announcements = watchAnnouncements();
await userEvent.click(page.getByRole("button", { name: "Save" }));
await expect.poll(() => announcements.count("Saved")).toBe(1);
expect(announcements.matching("Saved")[0]!.region.getAttribute("role")).toBe("status");
announcements.stop();
```

`changes` lists every announcement in order, each with its `region` and `text`; `matching(text)` and `count(text)` find those whose text includes `text`.[^announcements] Toast's tests use it.

[^minimums]: scripts/registry.mts verify:fileLine(scripts/registry.mts, /vitest: "4\.1\.11"/) verify:fileLine(scripts/registry.mts, /playwright: "1\.58\.1"/) verify:fileLine(scripts/registry.mts, /storybook: "10\.2\.10"/) verify:fileLine(scripts/registry.mts, /"axe-core": "4\.13\.0"/) verify:testExists(scripts/registry.test.mjs::devDependencies are named without a version, so the CLI installs it only when the app lacks it and never changes a version the app has)
[^ci-versions]: package.json verify:equals(package.json#devDependencies.vitest)=5.0.3 verify:equals(package.json#devDependencies.playwright)=1.63.0 verify:equals(package.json#devDependencies.storybook)=10.6.1
[^ci-axe]: pnpm-lock.yaml verify:fileLine(pnpm-lock.yaml, /^  axe-core@4\.13\.0:$/)
[^axe-minimum]: registry/ouro/lib/ouro/testing/axe.ts verify:testExists(registry/ouro/lib/ouro/testing/axe.test.ts::audit > refuses an axe-core older than 4.13.0, naming the version it needs and the version it found) verify:testExists(scripts/registry.test.mjs::the ouro-testing message names axe-core's minimum, the one audit checks when it runs)
[^vitest-4-section]: docs/guides/testing.md verify:fileLine(docs/guides/testing.md, /^## .*Vitest 4/)
[^v0.7.0]: https://github.com/ourostack/ouro-ui/releases/tag/v0.7.0 verify:urlOk(https://github.com/ourostack/ouro-ui/releases/tag/v0.7.0)
[^v0.8.0]: https://github.com/ourostack/ouro-ui/releases/tag/v0.8.0 verify:urlOk(https://github.com/ourostack/ouro-ui/releases/tag/v0.8.0)
[^tests-closure]: scripts/registry.mts verify:testExists(scripts/registry.test.mjs::a -tests item installs the tests of every item it installs: link-tests brings text-tests)
[^subsets]: scripts/subset-coverage.mjs verify:testExists(scripts/subset-coverage.test.mjs::CI checks the button, the dialog, the sheet and the forms set, each alone and together) verify:fileLine(.github/workflows/ci.yml, /node scripts\/subset-coverage\.mjs/)
[^ouro-tests]: scripts/registry.mts verify:testExists(scripts/registry.test.mjs::ouro-tests installs every -tests item: the whole suite in one command)
[^projects]: registry/ouro/lib/ouro/testing/vitest.ts verify:fileLine(registry/ouro/lib/ouro/testing/vitest.ts, /ouro-touch/) verify:fileLine(registry/ouro/lib/ouro/testing/vitest.ts, /390x844/)
[^touch-host]: registry/ouro/lib/ouro/testing/vitest.ts verify:testExists(scripts/testing-kit.test.mjs::page sizes every Playwright host while the touch frame keeps its phone viewport and input) verify:testExists(scripts/testing-kit.test.mjs::ouroTestProjects leaves the page size to Vitest unless the app sets one) verify:fileLine(registry/ouro/lib/ouro/testing/vitest.ts, /1280x844/)
[^sheet-dvh-tests]: registry/ouro/components/ouro/sheet/sheet.test.tsx verify:testExists(registry/ouro/components/ouro/sheet/sheet.test.tsx::opening and closing > sits at the bottom edge, fits its content and keeps clear of the top) verify:testExists(registry/ouro/components/ouro/sheet/sheet.test.tsx::Sheet iOS backdrop rule > covers the visible screen on a page scrolled 2000px)
[^vitest-4-regression]: https://github.com/ourostack/ouro-ui/pull/99 verify:urlOk(https://github.com/ourostack/ouro-ui/pull/99)
[^finding-fields]: test/finding-fields.test.tsx verify:testExists(test/finding-fields.test.tsx::Finding fields in tests, as the Testing page says > finds a required field by role and name, or by its exact label without the marker)
[^motion-cancel]: registry/ouro/lib/ouro/testing/motion.ts verify:testExists(test/motion.test.ts::expectMotion > lets a transition end that the browser cancels once it has run 90% of its duration) verify:fileLine(registry/ouro/lib/ouro/testing/motion.ts, /progress < 0\.9/)
[^motion-records]: scripts/motion-coverage.mts verify:testExists(test/motion.test.ts::motion records > move into the test's meta when it finishes) verify:ciJob(motion-coverage)
[^announcements]: registry/ouro/lib/ouro/testing/announcements.ts verify:testExists(registry/ouro/lib/ouro/testing/announcements.test.tsx::records the text each live region exposes, polite and assertive, once per change)
[^tests-in-app]: test:scripts/registry.test.mjs::each component has an opt-in -tests item with its tests, type tests, stories and spec; .github/workflows/ci.yml verify:testExists(scripts/registry.test.mjs::each component has an opt-in -tests item with its tests, type tests, stories and spec) verify:ciJob(ci.yml#install)
[^test-versions]: test:scripts/registry.test.mjs::devDependencies are named without a version, so the CLI installs it only when the app lacks it and never changes a version the app has verify:testExists(scripts/registry.test.mjs::devDependencies are named without a version, so the CLI installs it only when the app lacks it and never changes a version the app has)
[^fixtures-yours]: test:scripts/registry.test.mjs::every registry file ships in exactly one item, except the repository's own theme test verify:testExists(scripts/registry.test.mjs::every registry file ships in exactly one item, except the repository's own theme test)
[^password-role]: test:test/finding-fields.test.tsx::Finding fields in tests, as the Testing page says > finds a password field by role and name too, required or not, apart from its show button; https://www.w3.org/TR/html-aria/#el-input-password verify:testExists(test/finding-fields.test.tsx::Finding fields in tests, as the Testing page says > finds a password field by role and name too, required or not, apart from its show button) verify:urlOk(https://www.w3.org/TR/html-aria/#el-input-password)
[^form-alert]: test:test/finding-fields.test.tsx::Finding fields in tests, as the Testing page says > finds the form's message in its alert region only when there is a message verify:testExists(test/finding-fields.test.tsx::Finding fields in tests, as the Testing page says > finds the form's message in its alert region only when there is a message)
[^announcements-batch]: test:registry/ouro/lib/ouro/testing/announcements.test.tsx::counts a change in an existing status region once, its exposed text only; test:registry/ouro/lib/ouro/testing/announcements.test.tsx::counts an alert added with its text, and leaves out a polite region's initial text; test:registry/ouro/lib/ouro/testing/announcements.test.tsx::records the text each live region exposes, polite and assertive, once per change verify:testExists(registry/ouro/lib/ouro/testing/announcements.test.tsx::counts a change in an existing status region once, its exposed text only) verify:testExists(registry/ouro/lib/ouro/testing/announcements.test.tsx::counts an alert added with its text, and leaves out a polite region's initial text) verify:testExists(registry/ouro/lib/ouro/testing/announcements.test.tsx::records the text each live region exposes, polite and assertive, once per change)
