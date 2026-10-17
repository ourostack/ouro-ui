# Installing

Add `ouro-base` once per app, then add components; no later add changes your stylesheet or your test-tool versions. Every command below uses the newest release tag; the README's quick start has the same steps.

## Once per app

In an app with Tailwind CSS v4 and an `@/*` path alias, run shadcn's `init` once, with the Base UI base, then add the base tokens:

```sh
npx shadcn@latest init --base base --preset nova --yes --no-monorepo
npx shadcn@latest add ourostack/ouro-ui/ouro-base#v1.0.0
```

`ouro-base` is the only Ouro UI item that writes to your stylesheet (the file `components.json` names in `tailwind.css`), apart from the optional `ouro-theme`. It adds what a shadcn theme lacks and the components need:

- `--success`, `--warning`, their foregrounds and `--destructive-foreground`, with defaults that pass 4.5:1 on shadcn's stock themes.
- `--input`, the border color of every field, and `--radius` with its `--radius-sm` to `--radius-4xl` scale, at shadcn's stock values. A theme without them draws fields with no visible border and square corners.
- The `--ouro-*` motion tokens, `--ouro-layer` (the z-index of sheets and dialogs), the `press` utility and the keyframes for spinners, progress bars and skeletons.

A variable your stylesheet already has keeps your value: the CLI adds only the ones that are missing. It adds the radius scale to `@theme inline` the same way, so an app that never defined `--radius-lg` there gets shadcn's scale in place of Tailwind's defaults; set `--radius` to change it.

This one add also reformats the file, as the shadcn CLI does for any item that carries CSS: it adds `@custom-variant dark (&:is(.dark *));` when the file has no `@custom-variant`, collapses blank lines and drops the final newline. Review that diff once. No component and no tests item carries CSS, so the CLI does not open the file again.

To change a token afterwards, edit it where the CLI wrote it, or set it in a `:root` rule of your own. Add `ouro-base` again only when a release's notes say it has new tokens.

## Adding components

```sh
npx shadcn@latest add ourostack/ouro-ui/dialog#v1.0.0
```

A component installs its own files in `components/ouro/<component>/`, the components it renders, and only the helpers it imports, one file each in `lib/ouro/`. Its install message names what came with it. It adds the npm packages it imports (`@base-ui/react`, `clsx`, `tailwind-merge`) and nothing for tests.

A component that finds no `ouro-base` tokens still installs, type checks and builds, but renders without them: a `Sheet` with no backdrop, layer or spring, a field with no border. In development, the first Ouro UI component to mount checks the page once and logs `[ouro-ui] theme: ouro-base is not in this page's CSS …` with the command to run. Production builds contain no such check.

`OuroProvider` comes with every component that renders links (`button`, `link`, `card`, `item`, `table` and the navigation components) and with `tooltip`. An app with none of those adds it by name, `ourostack/ouro-ui/lib-ouro-provider#v1.0.0` ([OuroProvider](../OuroProvider.md); v0.7.0 has no such item, because there it comes with every component).

## What an add changes in package.json

- Test tools (`vitest`, `@vitest/browser-playwright`, `playwright`, `@playwright/test`, `storybook`, `@storybook/react-vite`) come only with the `-tests` items, and without a version: the CLI installs one only when your `package.json` has no entry for it, so a version you pinned stays, and nothing is upgraded or downgraded. v0.7.0's items still carry versions: after `add`, restore every test-tool version you had pinned (`git diff package.json`). The versions the tests need are in [Testing](testing.md).
- Runtime packages carry a caret range, such as `@base-ui/react@^1.8.0`, so a new app never gets a breaking major. The CLI hands that range to your package manager on every add. A version inside the range stays installed; an exact pin or a `~` range on one of these packages is rewritten to a caret range, so pin it again after an add if you need to.

## The tests are optional

Each component has a `<name>-tests` item with its Vitest browser tests, type tests, stories and Playwright spec, and the tests of everything the component installed. CI verifies 100% line and branch coverage of the installed runtime files for five sets: button, dialog, sheet, the forms set and their union. Other items receive their full test dependency closure but are not measured individually. [Testing](testing.md) lists the forms set, says what the tests need and how to run them.

## Updating

List what a release changes with `npx shadcn@latest add ourostack/ouro-ui/<item>#v1.0.0 --dry-run`, review each file marked overwrite with `--diff <path>`, then add the item again with `--overwrite` and reapply your edits. Files Ouro UI never ships are never overwritten: your stylesheet (after `ouro-base`), `e2e/ouro-fixtures.ts`, and your Vitest, Storybook and Playwright configs.

## Vite and React Router apps: the "use client" notice

Every component file starts with `"use client";`, which Next.js needs. In an app whose `components.json` has `"rsc": false` the shadcn CLI is meant to remove that line, but its check never matches a directive followed by a semicolon, and matches only every other file without one, so the line stays in every file. It is harmless: React ignores it outside a Server Components build.

Rollup reports it during `vite build` with two notices per file. The first is `Module level directives cause errors when bundled, "use client" in "…" was ignored` (code `MODULE_LEVEL_DIRECTIVE`). The second follows from the first when the build writes source maps: `Error when using sourcemap for reporting an error: Can't resolve original location of error.` (code `SOURCEMAP_ERROR`), at the start of the same file, where the directive was. `@vitejs/plugin-react` silences both for you, with the two conditions below. A build without that plugin, such as a React Router framework build, can drop them in `vite.config.ts`:

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
