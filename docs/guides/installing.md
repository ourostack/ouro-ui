# Installing

Add `ouro-base` once per app, then add components; no later add changes your stylesheet or your test-tool versions. Every command below uses the newest release tag; the README's quick start has the same steps.[^release-tag] The code compiles with TypeScript 5.9.3 or newer; only `lib-claims` and `ouro-source-rules` need 6.0.3.[^typescript]

## Once per app

In an app with Tailwind CSS v4 and an `@/*` path alias, run shadcn's `init` once, with the Base UI base, then add the base tokens:

```sh
npx shadcn@latest init --base base --preset nova --yes --no-monorepo
npx shadcn@latest add ourostack/ouro-ui/ouro-base#v1.2.10
```

`ouro-base` is the only Ouro UI item that writes to your stylesheet (the file `components.json` names in `tailwind.css`), apart from the optional `ouro-theme`. It adds what a shadcn theme lacks and the components need:

- `--success`, `--warning`, their foregrounds and `--destructive-foreground`, with defaults that pass 4.5:1 on shadcn's stock themes.[^stock-contrast]
- `--input`, the border color of every field, and `--radius` with its `--radius-sm` to `--radius-4xl` scale, at shadcn's stock values.[^field-tokens] A theme without them draws fields with no visible border and square corners.[^field-tokens]
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

A variable your stylesheet already has keeps your value: the CLI adds only the ones that are missing. It adds the radius scale to `@theme inline` the same way, so an app that never defined `--radius-lg` there gets shadcn's scale in place of Tailwind's defaults; set `--radius` to change it.[^field-tokens]

This one add also reformats the file, as shadcn@4.21.1 does for any item that carries CSS on Tailwind CSS v4: it adds `@custom-variant dark (&:is(.dark *));` when the file has no `@custom-variant`, and collapses blank lines.[^shadcn-css] Review that diff once. No component and no tests item carries CSS, so the CLI does not open the file again.[^stylesheet-items]

To change a token afterwards, edit it where the CLI wrote it, or set it in a `:root` rule of your own. Add `ouro-base` again only when a release's notes say it has new tokens.

## Adding components

```sh
npx shadcn@latest add ourostack/ouro-ui/dialog#v1.2.10
```

A component installs its own files in `components/ouro/<component>/`, the components it renders, and only the helpers it imports, one file each in `lib/ouro/`.[^lands] Its install message names what came with it. It adds the npm packages it imports (`@base-ui/react`, `clsx`, `tailwind-merge`) and nothing for tests.

A component that finds no `ouro-base` tokens still installs, type checks and builds, but renders without them: a `Sheet` with no backdrop, layer or spring, a field with no border.[^theme-check] In development, the first Ouro UI component to mount checks the page once and logs `[ouro-ui] theme: ouro-base is not in this page's CSS …` with the command to run. Production builds contain no such check.[^dev-strip]

`OuroProvider` comes with every component that renders links (`button`, `link`, `card`, `item`, `table` and the navigation components) and with `tooltip`.[^provider-deps] An app with none of those adds it by name, `ourostack/ouro-ui/lib-ouro-provider#v1.2.10` ([OuroProvider](../OuroProvider.md); v0.7.0 has no such item, because there it comes with every component).[^v0.7.0]

## What an add changes in package.json

- Test tools (`vitest`, `@vitest/browser-playwright`, `playwright`, `@playwright/test`, `storybook`, `@storybook/react-vite`) come only with the `-tests` items, and without a version: the CLI installs one only when your `package.json` has no entry for it, so a version you pinned stays, and nothing is upgraded or downgraded. v0.7.0's items still carry versions: after `add`, restore every test-tool version you had pinned (`git diff package.json`).[^v0.7.0] The versions the tests need are in [Testing](testing.md).
- Runtime packages carry a caret range, such as `@base-ui/react@^1.8.0`, so a new app never gets a breaking major.[^caret-ranges] shadcn@4.21.1 hands that range to your package manager on every add.[^caret-ranges] A version inside the range stays installed; an exact pin or a `~` range on one of these packages is rewritten to a caret range, so pin it again after an add if you need to.

## The tests are optional

Each component has a `<name>-tests` item with its Vitest browser tests, type tests, stories and Playwright spec, and the tests of everything the component installed.[^tests-closure] CI verifies 100% line and branch coverage of the installed runtime files for five sets: button, dialog, sheet, the forms set and their union.[^subsets] Other items receive their full test dependency closure but are not measured individually. [Testing](testing.md) lists the forms set, says what the tests need and how to run them.

## Updating

List what a release changes with `npx shadcn@latest add ourostack/ouro-ui/<item>#v1.2.10 --dry-run`, review each changed file with `--diff <path>`, then add the item again with `--overwrite` and reapply your edits. Files Ouro UI never ships are never overwritten: your stylesheet (after `ouro-base`), `e2e/ouro-fixtures.ts`, and your Vitest, Storybook and Playwright configs.[^not-shipped]

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
[^field-tokens]: registry/ouro/theme/ouro-base.css verify:testExists(scripts/install-check.test.mjs::an install whose stylesheet lacks the field border color or the radius scale fails) verify:fileLine(registry/ouro/theme/ouro-base.css, /--radius-4xl/)
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
[^stylesheet-items]: test:scripts/registry.test.mjs::only ouro-base and ouro-theme touch the app's stylesheet, and no other item installs them verify:testExists(scripts/registry.test.mjs::only ouro-base and ouro-theme touch the app's stylesheet, and no other item installs them)
[^lands]: test:scripts/registry.test.mjs::helpers land in lib/ouro and the test kit in lib/ouro/testing and e2e/ouro; test:scripts/registry.test.mjs::each lib helper is its own item, so an item installs only the helpers it imports verify:testExists(scripts/registry.test.mjs::helpers land in lib/ouro and the test kit in lib/ouro/testing and e2e/ouro) verify:testExists(scripts/registry.test.mjs::each lib helper is its own item, so an item installs only the helpers it imports)
[^theme-check]: test:registry/ouro/lib/ouro/dev.test.ts::checkTheme > names the command that adds ouro-base, once per page, when the token is unset verify:testExists(registry/ouro/lib/ouro/dev.test.ts::checkTheme > names the command that adds ouro-base, once per page, when the token is unset)
[^dev-strip]: test:scripts/dev-strip.test.mjs::a Vite production bundle removes every dev message string verify:testExists(scripts/dev-strip.test.mjs::a Vite production bundle removes every dev message string)
[^not-shipped]: test:scripts/registry.test.mjs::only ouro-base and ouro-theme touch the app's stylesheet, and no other item installs them; test:scripts/registry.test.mjs::runtime items ship no tests, stories, specs or test tooling, and never pull in the test kit; test:scripts/registry.test.mjs::every registry file ships in exactly one item, except the repository's own theme test verify:testExists(scripts/registry.test.mjs::only ouro-base and ouro-theme touch the app's stylesheet, and no other item installs them) verify:testExists(scripts/registry.test.mjs::runtime items ship no tests, stories, specs or test tooling, and never pull in the test kit) verify:testExists(scripts/registry.test.mjs::every registry file ships in exactly one item, except the repository's own theme test)
[^use-client-notices]: https://github.com/vitejs/vite-plugin-react/blob/04cac5020e349f452d76c5a4f6d788ad4b38930a/packages/common/warning.ts#L8-L22; https://github.com/vitejs/vite/issues/15012 verify:urlOk(https://github.com/vitejs/vite-plugin-react/blob/04cac5020e349f452d76c5a4f6d788ad4b38930a/packages/common/warning.ts#L8-L22) verify:urlOk(https://github.com/vitejs/vite/issues/15012) verify:fileLine(package.json, /"@vitejs.plugin-react": "\^6\.1\.1"/)
