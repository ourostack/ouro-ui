# Installing

Add `ouro-base` once per app, then add components; no later add changes your stylesheet or your test-tool versions. Every command below uses the newest release tag; the README's quick start has the same steps.[^release-tag] The code compiles with TypeScript 5.9.3 or newer, and new apps use TypeScript 7 (the install test's Vite app is on 7.0.2); only `lib-claims` and `ouro-source-rules` need 6.0.3.[^typescript]

## Start a new app

Ouro HX goes into a React app set up with Tailwind CSS and an `@/*` import alias. These steps make one, then [Once per app](#once-per-app) adds Ouro HX to it. An app you already have skips to that section.

### Vite

Create the app, then add Tailwind CSS and Node's types (for `vite.config.ts`):

```sh
npm create vite@latest my-app -- --template react-ts
cd my-app
npm install
npm install -D tailwindcss @tailwindcss/vite @types/node
```

Replace everything in `src/index.css` with Tailwind:

```css
@import "tailwindcss";
```

Give `vite.config.ts` Tailwind's plugin and the `@` alias:

```ts
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
```

Add the same alias under `compilerOptions` in both `tsconfig.json` and `tsconfig.app.json`, creating `compilerOptions` in `tsconfig.json`, which has none. shadcn reads the first file, and `tsc -b` builds the app with the second. Leave out `baseUrl`, which TypeScript 6 and later refuse:

```json
"paths": { "@/*": ["./src/*"] }
```

These are the install test's own Vite app, which it builds after every add, with `~` where you write `@`.[^vite-fixture] Then run [Once per app](#once-per-app).

### Next.js

`create-next-app` sets up Tailwind CSS and the alias itself:

```sh
npx create-next-app@latest my-app --ts --tailwind --app --src-dir --import-alias "@/*" --yes
cd my-app
```

Then run [Once per app](#once-per-app), and wrap the app in [OuroProvider](../OuroProvider.md), which sends links through `next/link`. For dark mode, wrap it in [ColorSchemeProvider](../ColorSchemeProvider.md) too and put a [ColorSchemeToggle](../ColorSchemeToggle.md) in the header.

## Once per app

In an app with Tailwind CSS v4 and an `@/*` path alias, run shadcn's `init` once, with the Base UI base, then add the base tokens:

```sh
npx shadcn@latest init --base base --preset nova --yes --no-monorepo
npx shadcn@latest add ourostack/ouro-ui/ouro-base#v1.3.619
```

`ouro-base` is the only Ouro UI item that writes to your stylesheet (the file `components.json` names in `tailwind.css`), apart from the optional `ouro-theme` and `ouro-plain`. It adds what a shadcn theme lacks and the components need:

- `--success`, `--warning`, their foregrounds and `--destructive-foreground`, with defaults that pass 4.5:1 on shadcn's stock themes.[^stock-contrast]
- `--input`, the border color of every field, and `--radius` with its `--radius-sm` to `--radius-4xl` scale, at shadcn's stock values.[^field-tokens] A theme without them draws fields with no visible border and square corners.[^field-tokens] The `--radius-ouro-sm` to `--radius-ouro-4xl` steps are the ones components round with, so they carry `--ouro-radius-scale` and `--ouro-corner-fallback` even in a theme that has shadcn's `--radius-*` steps.
- The `--ouro-*` motion tokens, `--ouro-layer` (the z-index of sheets and dialogs), `--ouro-shadow-sheet-bottom`, `-top`, `-left` and `-right` (the shadow under a sheet from each side), the `press` utility and the keyframes for spinners, progress bars and skeletons.[^ouro-base-contents]
Every other shadow and font comes from shadcn's standard tokens, so a theme that sets them restyles the components: `--shadow-lg` under popovers, menus, selects, comboboxes, navigation menus and toasts, `--shadow-xl` under dialogs, `--shadow-sm` under the slider and switch thumbs and the segmented control's indicator, `--font-heading` for `Heading` and the dialog, sheet and popover titles (the surrounding font when your theme has none) (`Kbd` keeps the surrounding font, as shadcn's does).[^theme-tokens] Tailwind defines the shadows itself, so `ouro-base` adds none of them.[^theme-tokens]

The solid primary `Button`, the page's main action, reads `--ouro-action` and `--ouro-action-foreground` when your theme sets them, and `--primary` and `--primary-foreground` when it does not, as a button and with `href` as a link.[^action-token] It is the only part that reads them: soft, outline and plain primary Buttons, `Link`, checkboxes, switches, radios, toggles and the current tab keep `--primary`.[^action-token] A `Link` is text in a sentence and the action colour is a fill, so for a link that looks like the main action, use `<Button href>`. Set the tokens to give your actions their own colour. `ouro-base` leaves them unset, so the fallback works in a theme scoped to part of a page too.[^action-token]

```css
:root {
  --ouro-action: oklch(0.25 0.01 60); /* charcoal actions */
  --ouro-action-foreground: oklch(0.98 0.01 90);
  --primary: oklch(0.55 0.1 60); /* brass selection */
}
```

A variable your stylesheet already has keeps your value: the CLI adds only the ones that are missing. It adds the radius scale to `@theme inline` the same way, so an app that never defined `--radius-lg` there gets shadcn's scale in place of Tailwind's defaults; set `--radius` to change it.[^field-tokens] The `--radius-ouro-*` steps are new names, so the CLI always adds them, even when your theme has shadcn's `--radius-*` steps and keeps its own.[^field-tokens]

This one add also reformats the file, as shadcn@4.21.1 does for any item that carries CSS on Tailwind CSS v4: it adds `@custom-variant dark (&:is(.dark *));` when the file has no `@custom-variant`, and collapses blank lines.[^shadcn-css] Review that diff once. No component and no tests item carries CSS, so the CLI does not open the file again.[^stylesheet-items]

To change a token afterwards, set it in a `:root` rule of your own, after Ouro's. Add `ouro-base` again only when a release's notes say it has new tokens.

Ouro Current, which keeps an app's Ouro UI on the newest release, moves `ouro-base` out of your stylesheet into a file of its own on its first update: `ouro/ouro-base.css` beside the stylesheet, imported right after `@import "tailwindcss"`.[^import-file] Your own values stay in the stylesheet, after the import, so they win; what only copied an older `ouro-base` goes.[^import-file] After that, a release replaces the file whole, so an older copy of a rule doesn't outlive the release that changed it.[^import-file] Leave the file as it is and override in your stylesheet: Ouro Current leaves a file you edited alone and names it in its pull request.[^import-file]

### Focus on a page opened at a place

Add [fragmentFocusScript](../fragmentFocusScript.md) once, too, first in `<body>`, so that Safari keeps a person's focus on a page whose address names a place on it (`/guide#install`).[^fragment-focus] Without it, Safari jumps back to that place and takes focus as later stylesheets load, once the page finished parsing, or a link to the place was followed, while a stylesheet was still loading, such as a route's CSS your script adds as the page starts (ourostack/ouro-ui#2224): an open menu closes, and a field loses the person mid-word. Other browsers don't, and the script leaves them alone. Ouro check names a page without it (`fragment-focus`).[^fragment-focus-rule]

```sh
npx shadcn@latest add ourostack/ouro-ui/lib-fragment-focus-script#v1.3.619
```

In Vite, from `vite.config.ts`'s plugins, as an inline script after the stylesheets:

```ts
import { fragmentFocusScript } from "./src/lib/ouro/fragment-focus-script.ts";

const fragmentFocus = {
  name: "fragment-focus",
  transformIndexHtml: () => [{ tag: "script", children: fragmentFocusScript(), injectTo: "body-prepend" as const }],
};
```

In Next.js, in the root layout: `<body><script dangerouslySetInnerHTML={{ __html: fragmentFocusScript() }} />{children}</body>`.

### Markup that is not an Ouro component

A page that builds rows and controls as strings, or prerenders them to read without a script, can't render Ouro's components there. For that markup, add `ouro-plain` once, after `ouro-base`: it gives the markup Ouro's states as classes, each drawn as its component draws it. No component installs it, so an app built only from components doesn't carry its CSS.[^plain-item] A page without Tailwind loads the plain stylesheet `ouro-plain.css` from [the static CSS](static-css.md) instead.

```sh
npx shadcn@latest add ourostack/ouro-ui/ouro-plain#v1.3.619
```

- The focus ring and row states: `ouro-focus-ring` draws the ring the components draw on keyboard focus, `ouro-focus-ring-inset` draws it inside the box for a row or cell a scroller would clip, and `ouro-row` tints a row that opens something while a mouse rests on it and while it is pressed, as a linked `Item` does.[^plain-classes] The Ouro source rule counts these classes as Ouro's, and names them as the fix for a focus or press state written by hand.[^plain-classes-rule]
- A skip link, the ring on a box and what shows on hover or focus:[^plain-states] `ouro-skip-link` is a skip link drawn as `SkipLink` draws it, hidden until it has focus; point it at an element with `tabindex="-1"` and `ouro-focus-target`, which takes the focus with no outline, as the layouts' main does. `ouro-focus-ring-within` draws the focus ring on a label or box whose control inside has keyboard focus, as `TextField` rings its box: a label around a visually hidden radio or checkbox, or the box around an input. `ouro-reveal` shows row actions, or a card beside the one in use, only while the mouse rests on it or on its `ouro-reveal-host`, or while focus is in either, as `SegmentedControl`'s `revealOnHover` does, and from the start on a touch screen. The source rule counts all of them as Ouro's.[^plain-states-rule]

  ```html
  <a class="ouro-skip-link" href="#main">Skip to main content</a>
  <main id="main" tabindex="-1" class="ouro-focus-target">…</main>
  <label class="ouro-focus-ring-within"><input type="radio" name="who" class="sr-only" /> <span>Mine</span></label>
  <li class="ouro-row ouro-reveal-host">Customer <span class="ouro-reveal"><button>Archive</button></span></li>
  ```
- Links, toggles, choices and options:[^plain-state-classes] `ouro-nav-link` draws a link in a nav or list as `Link` in the text colour, and marks the one with `aria-current` as `Link`'s current does; `ouro-toggle` on a button with `aria-pressed` draws `Toggle`; labels with `ouro-segment` around radios or checkboxes, in an `ouro-segmented` group, draw `SegmentedControl`, the browser checking the input; and `ouro-option` on an option with `aria-selected` draws `Command`'s highlighted item. The source rule counts them as Ouro's, and names them as the fix for a current, pressed or checked state written by hand.[^plain-state-classes-rule]

  ```html
  <nav><a class="ouro-nav-link" href="/today" aria-current="page">Today</a> <a class="ouro-nav-link" href="/lab">Lab</a></nav>
  <button class="ouro-toggle" aria-pressed="true">Mine</button>
  <div class="ouro-segmented"><label class="ouro-segment"><input type="radio" name="who" checked /> Mine</label><label class="ouro-segment"><input type="radio" name="who" /> Everyone</label></div>
  ```
- A disclosure that opens without a script: `<details class="ouro-disclosure">` with `<summary class="ouro-disclosure-summary">` and its content in `ouro-disclosure-panel` draws the title as `Collapsible` draws it, with its chevron, which turns over while open and snaps under reduced motion, and the focus ring, at least 44px tall on a touch screen.[^disclosure] The source rule counts these elements as Ouro's, and a row laid out by whether the disclosure inside it is open (`tr:has(.ouro-disclosure[open]) .cell`) too.[^disclosure-rule]

  ```html
  <details class="ouro-disclosure">
    <summary class="ouro-disclosure-summary">Why it matters</summary>
    <div class="ouro-disclosure-panel">Customers see the answer before they ask.</div>
  </details>
  ```

## A strict Content Security Policy

When your pages are served with a policy that refuses inline styles (`style-src 'self'`, with no `'unsafe-inline'` or nonce), wrap the app in `<OuroProvider strictCsp>` in place of Base UI's `CSPProvider`. Under it no Ouro UI part adds a `<style>` element, and the page breaks no rule of that policy, in Chromium and WebKit.[^strict-csp] Styles set from script still apply. The Ouro source rule counts a bare `CSPProvider` and names this fix.[^csp-rule]

In an engine without native `corner-shape` (a WebKit web view), true squircles come from one build-time step, with nothing loaded at runtime: add `squircleCorners()` from `lib/ouro/squircle-corners` (the `lib-squircle-corners` item, added the way the other items are) to the PostCSS plugins of the app's bundler (`css: { postcss: { plugins: [squircleCorners()] } }` in Vite) and the rules that round a corner come out with a `clip-path: shape()` squircle in WebKit and `corner-shape: squircle` where the engine has it. Corners that are round by design (a pill, a circle, half the box) stay round.

## Adding components

```sh
npx shadcn@latest add ourostack/ouro-ui/dialog#v1.3.619
```

A component installs its own files in `components/ouro/<component>/`, the components it renders, and only the helpers it imports, one file each in `lib/ouro/`.[^lands] Its install message names what came with it. It adds the npm packages it imports (`@base-ui/react`, `clsx`, `tailwind-merge`) and nothing for tests.

A component that finds no `ouro-base` tokens still installs, type checks and builds, but renders without them: a `Sheet` with no backdrop, layer or spring, a field with no border.[^theme-check] In development, the first Ouro UI component to mount checks the page once and logs `[ouro-ui] theme: ouro-base is not in this page's CSS …` with the command to run. Production builds contain no such check.[^dev-strip]

`OuroProvider` comes with every component that renders links (`button`, `link`, `card`, `item`, `table` and the navigation components) and with `tooltip`.[^provider-deps] An app with none of those adds it by name, `ourostack/ouro-ui/lib-ouro-provider#v1.3.619` ([OuroProvider](../OuroProvider.md); v0.7.0 has no such item, because there it comes with every component).[^v0.7.0]

## What an add changes in package.json

- Test tools (`vitest`, `@vitest/browser-playwright`, `playwright`, `@playwright/test`, `storybook`, `@storybook/react-vite`) come only with the `-tests` items, and without a version: the CLI installs one only when your `package.json` has no entry for it, so a version you pinned stays, and nothing is upgraded or downgraded. v0.7.0's items still carry versions: after `add`, restore every test-tool version you had pinned (`git diff package.json`).[^v0.7.0] The versions the tests need are in [Testing](testing.md).
- Runtime packages carry a caret range, such as `@base-ui/react@^1.8.0`, so a new app never gets a breaking major.[^caret-ranges] shadcn@4.21.1 hands that range to your package manager on every add.[^caret-ranges] A version inside the range stays installed; an exact pin or a `~` range on one of these packages is rewritten to a caret range, so pin it again after an add if you need to.
- The registry in your lockfile's `resolved` URLs is whatever npm is configured to use on the machine that ran the add, so a machine-wide private registry ends up in the lockfile. A project `.npmrc` with `registry=https://registry.npmjs.org/`, or a lockfile generated in CI, keeps it out.

## The tests are optional

Each component has a `<name>-tests` item with its Vitest browser tests, type tests, stories and Playwright spec, and the tests of everything the component installed.[^tests-closure] CI verifies 100% line and branch coverage of the installed runtime files for five sets: button, dialog, sheet, the forms set and their union.[^subsets] Other items receive their full test dependency closure but are not measured individually. [Testing](testing.md) lists the forms set, says what the tests need and how to run them.

## Changing a component

Change any component in your app whenever your app needs it: the copied files are yours, and you and your agents don't need to ask first. If the change would help other apps too, such as a missing option, a bug fix or a fix for keyboard or screen reader users, also open a pull request to [ourostack/ouro-ui](https://github.com/ourostack/ouro-ui) with the change and a test, so the next release carries it, and link that pull request in a comment beside your change. The comment tells whoever next [updates](#updating) the component whether a release has the change yet.

## Updating

List what a release changes with `npx shadcn@latest add ourostack/ouro-ui/<item>#v1.3.619 --dry-run`, review each changed file with `--diff <path>`, then add the item again with `--overwrite` and reapply your edits. Files Ouro UI never ships are never overwritten: your stylesheet (after `ouro-base`), `e2e/ouro-fixtures.ts`, and your Vitest, Storybook and Playwright configs.[^not-shipped]

### Check that ouro-base has not drifted

An older copy of an `ouro-base` rule left in your stylesheet keeps drawing after the release that changed it. Ouro check ships a check for that: `node scripts/ouro/check/base-check.ts` reads the release your install record pins (`.github/ouro-hx-installed.json`), compares your stylesheet with `ouro-base` at that tag, and exits 1 on drift.[^base-check] Where your stylesheet imports `ouro/ouro-base.css`, that file must be the tag's, and anything your stylesheet sets that `ouro-base` sets must be on your override list, `.github/ouro-base-overrides.json`, with the reason: `{ ":root --ouro-layer": "above the app's fixed header" }`. A line that repeats `ouro-base`'s own value fails too, so a later release's value reaches the app; `--input` and `--radius` are your theme's and need no line.[^base-check] Run it in CI beside your tests.

## Vite and React Router apps: the "use client" notice

Every component file starts with `"use client";`, which Next.js needs.[^use-client] In an app whose `components.json` has `"rsc": false` shadcn@4.21.1 is meant to remove that line, but its check never matches a directive followed by a semicolon, and matches only every other file without one, so the line stays in every file.[^shadcn-rsc] It is harmless: React ignores it outside a Server Components build.

Rollup reports it during `vite build` with two notices per file.[^use-client-notices] The first is `Module level directives cause errors when bundled, "use client" in "…" was ignored` (code `MODULE_LEVEL_DIRECTIVE`). The second follows from the first when the build writes source maps: `Error when using sourcemap for reporting an error: Can't resolve original location of error.` (code `SOURCEMAP_ERROR`), at the start of the same file, where the directive was. `@vitejs/plugin-react` 6.1.1 silences both for you, with the two conditions below.[^use-client-notices] A build without that plugin, such as a React Router framework build, can drop them in `vite.config.ts`:

```ts
build: {
  rollupOptions: {
    onwarn(warning, defaultHandler) {
      if (warning.code === "MODULE_LEVEL_DIRECTIVE" && /["']use client["']/.test(warning.message)) return;
      // The source map notice for the same directive, at the first character of the file.
      if (warning.code === "SOURCEMAP_ERROR" && warning.message.includes("resolve original location") && warning.pos === 0) return;
      defaultHandler(warning);
    },
  },
},
```

[^release-tag]: scripts/latest-release.mjs verify:testExists(scripts/latest-release.test.mjs::every #vX.Y.Z or @vX.Y.Z literal in the docs names package.json's ouro.latestRelease) verify:fileLine(scripts/latest-release.mjs, /docs\/guides\/installing\.md/)
[^typescript]: package.json verify:fileLine(package.json, /typescript@5\.9\.3 -- tsc -p tsconfig\.registry\.json/) verify:fileLine(.github/workflows/ci.yml, /pnpm typecheck:oldest/) verify:fileLine(registry.json, /"typescript": ">=6\.0\.3"/)
[^action-token]: test:test/action-token.test.tsx::the action token > repaints the solid primary Button, as a button and as a link, and leaves every selection on --primary; test:test/action-token.test.tsx::the action token > follows a theme scoped to part of the page and its dark values verify:testExists(test/action-token.test.tsx::the action token > repaints the solid primary Button, as a button and as a link, and leaves every selection on --primary) verify:testExists(test/action-token.test.tsx::the action token > follows a theme scoped to part of the page and its dark values)
[^stock-contrast]: test/stock-theme.test.tsx; test/shadcn-stock.css verify:fileLine(test/stock-theme.test.tsx, /4\.5/) verify:ciJob(ci)
[^field-tokens]: registry/ouro/theme/ouro-base.css verify:testExists(scripts/install-check.test.mjs::an install whose stylesheet lacks the field border color or the radius scale fails) verify:testExists(scripts/install-check.test.mjs::an install whose --radius-ouro-lg does not read --ouro-radius-scale fails, so an app's own radius steps cannot stand in for Ouro's) verify:fileLine(registry/ouro/theme/ouro-base.css, /--radius-4xl/) verify:fileLine(registry/ouro/theme/ouro-base.css, /--radius-ouro-lg: calc/)
[^theme-tokens]: test/theme-tokens.test.tsx verify:testExists(test/theme-tokens.test.tsx::standard shadow and font tokens > falls back to the inherited font for headings when the theme names none, and Kbd always keeps it) verify:fileLine(test/theme-tokens.test.tsx, /--shadow-lg/)
[^provider-deps]: scripts/registry.mts verify:testExists(scripts/registry.test.mjs::a component that renders links brings OuroProvider, which only the app imports)
[^v0.7.0]: https://github.com/ourostack/ouro-ui/releases/tag/v0.7.0 verify:urlOk(https://github.com/ourostack/ouro-ui/releases/tag/v0.7.0)
[^caret-ranges]: registry.json; https://github.com/shadcn-ui/ui/blob/3502dbcde11d1eaf967a47ac375744dc336641f3/packages/registry/src/utils/updaters/update-dependencies.ts#L177-L206 verify:testExists(scripts/registry.test.mjs::npm dependencies are pinned to the ranges this repository tests) verify:fileLine(registry.json, /"@base-ui\/react@\^1\./) verify:urlOk(https://github.com/shadcn-ui/ui/blob/3502dbcde11d1eaf967a47ac375744dc336641f3/packages/registry/src/utils/updaters/update-dependencies.ts#L177-L206)
[^tests-closure]: scripts/registry.mts verify:testExists(scripts/registry.test.mjs::a -tests item installs the tests of every item it installs: link-tests brings text-tests)
[^subsets]: scripts/subset-coverage.mjs verify:testExists(scripts/subset-coverage.test.mjs::CI checks the button, the dialog, the sheet and the forms set, each alone and together)
[^use-client]: scripts/source-rules.mjs verify:testExists(scripts/source-rules.test.mjs::every runtime registry file that renders or calls hooks starts with "use client", so a Next.js Server Component can render it) verify:testExists(scripts/install-check.test.mjs::an installed file that lost its source's "use client" fails)
[^shadcn-rsc]: https://github.com/shadcn-ui/ui/blob/3502dbcde11d1eaf967a47ac375744dc336641f3/packages/registry/src/utils/transformers/transform-rsc.ts#L4-L15; scripts/install-test.sh verify:urlOk(https://github.com/shadcn-ui/ui/blob/3502dbcde11d1eaf967a47ac375744dc336641f3/packages/registry/src/utils/transformers/transform-rsc.ts#L4-L15) verify:fileLine(scripts/install-test.sh, /lost ."use client."; under ."rsc.": false/) verify:ciJob(ci.yml#install)
[^ouro-base-contents]: registry/ouro/theme/ouro-base.css verify:fileLine(registry/ouro/theme/ouro-base.css, /--ouro-shadow-sheet-bottom/) verify:fileLine(registry/ouro/theme/ouro-base.css, /--ouro-shadow-sheet-left/) verify:fileLine(registry/ouro/theme/ouro-base.css, /--ouro-layer:/) verify:fileLine(registry/ouro/theme/ouro-base.css, /@utility press/)
[^shadcn-css]: https://github.com/shadcn-ui/ui/blob/3502dbcde11d1eaf967a47ac375744dc336641f3/packages/registry/src/utils/updaters/update-css-vars.ts#L91-L124 verify:urlOk(https://github.com/shadcn-ui/ui/blob/3502dbcde11d1eaf967a47ac375744dc336641f3/packages/registry/src/utils/updaters/update-css-vars.ts#L91-L124)
[^import-file]: test:scripts/current/current.test.mjs::Ouro HX moves a stylesheet that holds ouro-base's rules to an import of ouro-base's own file, keeps the app's own values after it, and tracks the file by hash verify:testExists(scripts/current/current.test.mjs::Ouro HX moves a stylesheet that holds ouro-base's rules to an import of ouro-base's own file, keeps the app's own values after it, and tracks the file by hash)
[^stylesheet-items]: test:scripts/registry.test.mjs::only ouro-base, ouro-plain and ouro-theme touch the app's stylesheet, and no other item installs them verify:testExists(scripts/registry.test.mjs::only ouro-base, ouro-plain and ouro-theme touch the app's stylesheet, and no other item installs them)
[^lands]: test:scripts/registry.test.mjs::helpers land in lib/ouro and the test kit in lib/ouro/testing and e2e/ouro; test:scripts/registry.test.mjs::each lib helper is its own item, so an item installs only the helpers it imports verify:testExists(scripts/registry.test.mjs::helpers land in lib/ouro and the test kit in lib/ouro/testing and e2e/ouro) verify:testExists(scripts/registry.test.mjs::each lib helper is its own item, so an item installs only the helpers it imports)
[^theme-check]: test:registry/ouro/lib/ouro/dev.test.ts::checkTheme > names the command that adds ouro-base, once per page, when the token is unset verify:testExists(registry/ouro/lib/ouro/dev.test.ts::checkTheme > names the command that adds ouro-base, once per page, when the token is unset)
[^dev-strip]: test:scripts/dev-strip.test.mjs::a Vite production bundle removes every dev message string verify:testExists(scripts/dev-strip.test.mjs::a Vite production bundle removes every dev message string)
[^base-check]: test:scripts/check/base-check.test.mts::the Ouro base check > beside the import: an override the list names passes, one it does not is drift, a copy is drift, and a stale line is drift verify:testExists(scripts/check/base-check.test.mts::the Ouro base check > beside the import: an override the list names passes, one it does not is drift, a copy is drift, and a stale line is drift) verify:testExists(scripts/check/base-check.test.mts::the Ouro base check > checks an app by its pin: the imported file must hash to the pin's record, and a monorepo package finds the pin above it)
[^not-shipped]: test:scripts/registry.test.mjs::only ouro-base, ouro-plain and ouro-theme touch the app's stylesheet, and no other item installs them; test:scripts/registry.test.mjs::runtime items ship no tests, stories, specs or test tooling, and never pull in the test kit; test:scripts/registry.test.mjs::every registry file ships in exactly one item, except the repository's own theme test verify:testExists(scripts/registry.test.mjs::only ouro-base, ouro-plain and ouro-theme touch the app's stylesheet, and no other item installs them) verify:testExists(scripts/registry.test.mjs::runtime items ship no tests, stories, specs or test tooling, and never pull in the test kit) verify:testExists(scripts/registry.test.mjs::every registry file ships in exactly one item, except the repository's own theme test)
[^use-client-notices]: https://github.com/vitejs/vite-plugin-react/blob/04cac5020e349f452d76c5a4f6d788ad4b38930a/packages/common/warning.ts#L8-L22; https://github.com/vitejs/vite/issues/15012 verify:urlOk(https://github.com/vitejs/vite-plugin-react/blob/04cac5020e349f452d76c5a4f6d788ad4b38930a/packages/common/warning.ts#L8-L22) verify:urlOk(https://github.com/vitejs/vite/issues/15012) verify:fileLine(package.json, /"@vitejs.plugin-react": "\^6\.1\.1"/)
[^strict-csp]: test:test/strict-csp.test.tsx::under style-src 'self' > OuroProvider strictCsp adds no <style> element, and the page breaks no rule of its policy, in every part that would add one verify:testExists(test/strict-csp.test.tsx::under style-src 'self' > OuroProvider strictCsp adds no <style> element, and the page breaks no rule of its policy, in every part that would add one)
[^csp-rule]: test:scripts/kits/source-rules.test.mjs::third-party-control > points Base UI's CSPProvider to OuroProvider strictCsp, which it does not count verify:testExists(scripts/kits/source-rules.test.mjs::third-party-control > points Base UI's CSPProvider to OuroProvider strictCsp, which it does not count)
[^plain-classes]: test:registry/ouro/theme/theme.test.tsx::focus and row classes for plain markup > draws the ring Ouro's controls draw on keyboard focus: ouro-focus-ring outside the box, ouro-focus-ring-inset inside it verify:testExists(registry/ouro/theme/theme.test.tsx::focus and row classes for plain markup > draws the ring Ouro's controls draw on keyboard focus: ouro-focus-ring outside the box, ouro-focus-ring-inset inside it) verify:testExists(registry/ouro/theme/theme.test.tsx::focus and row classes for plain markup > tints a row while a mouse rests on it, and more while it is pressed)
[^plain-classes-rule]: test:scripts/kits/source-rules.test.mjs::Ouro's focus and row classes for plain markup > counts ouro-plain's own rules in the app's stylesheet as Ouro's, and the classes in markup as no control state verify:testExists(scripts/kits/source-rules.test.mjs::Ouro's focus and row classes for plain markup > counts ouro-plain's own rules in the app's stylesheet as Ouro's, and the classes in markup as no control state) verify:testExists(scripts/kits/source-rules.test.mjs::Ouro's focus and row classes for plain markup > still counts a hand-written state beside an Ouro class, and names the Ouro classes as the fix for focus and press)
[^disclosure]: test:registry/ouro/theme/theme.test.tsx::disclosure classes for pages with no script > draws the title as Collapsible does, with no browser marker, and opens on Enter with no script, turning the chevron over verify:testExists(registry/ouro/theme/theme.test.tsx::disclosure classes for pages with no script > draws the title as Collapsible does, with no browser marker, and opens on Enter with no script, turning the chevron over) verify:testExists(registry/ouro/theme/theme.test.tsx::disclosure classes for pages with no script > turns the chevron on the motion tokens, and snaps it under reduced motion) verify:testExists(registry/ouro/theme/plain-classes.touch.test.tsx::disclosure classes on a touch screen > make the title at least 44px tall, at the 16px text size)
[^disclosure-rule]: test:scripts/kits/source-rules.test.mjs::ouro-plain's disclosure for pages with no script > counts a row laid out by whether the Ouro disclosure inside it is open as Ouro's, and still counts an open state the app draws itself verify:testExists(scripts/kits/source-rules.test.mjs::ouro-plain's disclosure for pages with no script > counts <details class="ouro-disclosure"> and its <summary class="ouro-disclosure-summary"> as Ouro's, and names them as the fix for a hand-drawn one) verify:testExists(scripts/kits/source-rules.test.mjs::ouro-plain's disclosure for pages with no script > counts a row laid out by whether the Ouro disclosure inside it is open as Ouro's, and still counts an open state the app draws itself)
[^plain-states]: test:registry/ouro/theme/theme.test.tsx::skip link, focus target, focus ring within and reveal classes for plain markup > hides the skip link until it has focus, then shows it with the ring, and its target takes focus with no outline, with no script verify:testExists(registry/ouro/theme/theme.test.tsx::skip link, focus target, focus ring within and reveal classes for plain markup > hides the skip link until it has focus, then shows it with the ring, and its target takes focus with no outline, with no script) verify:testExists(registry/ouro/theme/theme.test.tsx::skip link, focus target, focus ring within and reveal classes for plain markup > rings a label around a visually hidden radio while the radio has keyboard focus, as TextField rings its box) verify:testExists(registry/ouro/theme/theme.test.tsx::skip link, focus target, focus ring within and reveal classes for plain markup > shows what it reveals to a mouse only while the pointer rests on its host or focus is in it, keeping its room) verify:testExists(registry/ouro/theme/plain-classes.touch.test.tsx::plain classes on a touch screen > show what ouro-reveal hides from a mouse from the start, and make the focused skip link 44px tall)
[^plain-states-rule]: test:scripts/kits/source-rules.test.mjs::Ouro's focus and row classes for plain markup > exempts exactly the classes ouro-plain defines, and counts an app's own .ouro- class like any other verify:testExists(scripts/kits/source-rules.test.mjs::Ouro's focus and row classes for plain markup > exempts exactly the classes ouro-plain defines, and counts an app's own .ouro- class like any other)
[^plain-state-classes]: test:registry/ouro/theme/theme.test.tsx::current, toggle, segment and option classes for plain markup > selects the segment whose radio is checked, by click or arrow key, and rings it on keyboard focus verify:testExists(registry/ouro/theme/theme.test.tsx::current, toggle, segment and option classes for plain markup > draws links as Link in the text colour, and marks the current one as Link's current does, semibold with a 2px primary underline) verify:testExists(registry/ouro/theme/theme.test.tsx::current, toggle, segment and option classes for plain markup > draws a pressed toggle as Toggle's outline variant does, tinted with the primary colour) verify:testExists(registry/ouro/theme/theme.test.tsx::current, toggle, segment and option classes for plain markup > selects the segment whose radio is checked, by click or arrow key, and rings it on keyboard focus) verify:testExists(registry/ouro/theme/theme.test.tsx::current, toggle, segment and option classes for plain markup > highlights the selected option as Command does)
[^plain-state-classes-rule]: test:scripts/kits/source-rules.test.mjs::Ouro's focus and row classes for plain markup > names ouro-nav-link, ouro-toggle and ouro-segment as the fix for a current, pressed or checked state written by hand verify:testExists(scripts/kits/source-rules.test.mjs::Ouro's focus and row classes for plain markup > names ouro-nav-link, ouro-toggle and ouro-segment as the fix for a current, pressed or checked state written by hand) verify:testExists(scripts/kits/source-rules.test.mjs::Ouro's focus and row classes for plain markup > exempts exactly the classes ouro-plain defines, and counts an app's own .ouro- class like any other)
[^plain-item]: test:scripts/registry.test.mjs::only ouro-base, ouro-plain and ouro-theme touch the app's stylesheet, and no other item installs them verify:testExists(scripts/registry.test.mjs::only ouro-base, ouro-plain and ouro-theme touch the app's stylesheet, and no other item installs them)
[^vite-fixture]: test:scripts/new-app-steps.test.mjs::the guide's new Vite app steps write the install test's Vite app, with @ for its ~ verify:testExists(scripts/new-app-steps.test.mjs::the guide's new Vite app steps write the install test's Vite app, with @ for its ~) verify:fileLine(scripts/install-test.sh, /npx tsc -b/)
[^fragment-focus]: test:site/e2e/fragment-focus.spec.ts::fragmentFocusScript > keeps focus as later styles load, on a page opened at a place while its stylesheet loads verify:testExists(site/e2e/fragment-focus.spec.ts::fragmentFocusScript > keeps focus as later styles load, on a page opened at a place while its stylesheet loads) verify:testExists(site/e2e/fragment-focus.spec.ts::fragmentFocusScript > keeps focus as later styles load, after a link to a place on the page is followed while a stylesheet loads, and still goes there)
[^fragment-focus-rule]: test:test/check-in-page.test.ts::findFragmentFocusIssues > finds a page with a stylesheet and no fragmentFocusScript, marked on the page verify:testExists(test/check-in-page.test.ts::findFragmentFocusIssues > finds a page with a stylesheet and no fragmentFocusScript, marked on the page)
