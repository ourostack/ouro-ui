# Ouro UI

React components with handcrafted interactions, designed for coding agents to use correctly without a skill.

```sh
npx shadcn@latest search 'ourostack/ouro-ui#v0.2.0'     # list the items
npx shadcn@latest view 'ourostack/ouro-ui/dialog#v0.2.0' # read one item
npx shadcn@latest add ourostack/ouro-ui/dialog#v0.2.0    # install it
```

A GitHub source is `owner/repo#ref`; an item is `owner/repo/item#ref`. `@v0.2.0`, `github:` and `/tree/` URLs don't work. The same commands and the item list, for agents: [llms.txt](https://ourostack.github.io/ouro-ui/llms.txt).

Ouro UI is copy-in source in the shadcn/ui registry format: the shadcn CLI copies each component into your app, and your app's own Tailwind CSS v4 compiles its classes. Like shadcn/ui's own items, a component item installs only the component's source; its tests are a separate, optional item. The components read shadcn's theme variables (`--primary`, `--background`, `--radius`…), so an app that already has a shadcn theme keeps it.

```tsx
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Dialog } from "@/registry/ouro/components/ouro/dialog/dialog";

<Dialog title="Edit recipe" trigger={<Button>Edit</Button>}>
  <RecipeForm />
</Dialog>;
```

Import paths in this repository and its docs are the registry source paths. The shadcn CLI rewrites them to your app's aliases when it installs a component: `@/registry/ouro/components/ouro/button/button` becomes `@/components/ouro/button/button`. The components need `react` and `react-dom` 19; the CLI installs the rest (`@base-ui/react`, `clsx`, `tailwind-merge`). They need no animation library: motion is CSS, and reduced motion is honored in CSS. If your app animates with Motion, wrap it in `<MotionConfig reducedMotion="user">`.

## Install

Ouro UI is alpha.

### Quick start

```sh
# Existing Vite/Next app with Tailwind CSS v4 and an "@/*" path alias:
npx shadcn@latest init --base base --preset nova --yes --no-monorepo
npx shadcn@latest add ourostack/ouro-ui/dialog#v0.2.0
```

- Pass `--base base`: Ouro UI is built on Base UI. Don't pass `-t`/`--template` in an existing app; it adds shadcn's `components/ui/button.tsx`.
- New Vite app? Add `@tailwindcss/vite`, `@import "tailwindcss";`, a Vite `@` alias and `"paths": { "@/*": ["./src/*"] }` (no `baseUrl` on TypeScript 6) before `init`.

### Details

- The CLI reads `registry.json` at this repository's root. A [release](https://github.com/ourostack/ouro-ui/releases) tag such as `#v0.2.0` installs the item and every Ouro dependency (`ouro-lib`, `button` and so on) at that tag. Without a ref, items come from `main`. A `#<branch>` or `#<sha>` ref pins only the item you name; its Ouro dependencies come from `main`.
- Or add the `@ouro` namespace to `components.json` once, `"registries": { "@ouro": "https://ourostack.github.io/ouro-ui/r/{name}.json" }`, and run `npx shadcn@latest add @ouro/dialog`. The namespace serves `main`.
- Components land in `components/ouro/<component>/`, beside shadcn's `components/ui/`, and the shared helpers in `lib/ouro/`. The base tokens (`ouro-base`) are added to your CSS with any component, and `ouro-lib` comes with any component too; you don't need to add either.
- `init` is shadcn's: it writes `lib/utils.ts` and adds `cn`, `class-variance-authority`, `lucide-react` and `tw-animate-css`. Ouro UI doesn't use them; keep them for shadcn components. Ouro never writes to `components/ui/`, so don't pass `--overwrite` on a first install.
- Tests are optional. Each component's Vitest browser tests, type tests, stories and Playwright spec are its `-tests` item, which also adds Vitest, Storybook and Playwright as devDependencies: `npx shadcn@latest add ourostack/ouro-ui/dialog#v0.2.0 ourostack/ouro-ui/dialog-tests#v0.2.0`. `ouro-tests` adds every component with all of its tests in one command. The install message of `ouro-testing` (the test kit the `-tests` items bring) lists the config files to add, then run `npx vitest run`.
- For the Ouro look, add `ourostack/ouro-ui/ouro-theme`. Skip it to keep your app's shadcn theme.
- To update, list the changed files with `npx shadcn@latest add ourostack/ouro-ui/<item> --dry-run`, review each one marked overwrite with `--diff <path>`, then add the item again with `--overwrite` (with its `-tests` item if you have it: `add <item> <item>-tests --overwrite`) and reapply your edits. Coming from v0.1.0? Follow [Upgrading from v0.1.0](#upgrading-from-v010) instead.

### Upgrading from v0.1.0

<!-- upgrade:start -->
v0.1.0 installed each component with its tests, and v0.2.0 moves some shared helpers to new files, so update every Ouro component in one go. The commands assume your components live under `src/` (`src/components/ouro`, `src/lib/ouro`). If the aliases in your `components.json` point elsewhere, such as `app/`, use those paths instead.

#### 0. Commit first

`--overwrite` replaces every Ouro file, including files you edited. Commit before you start. Afterwards, `git diff` shows your own edits being overwritten, so reapply the ones you need.

#### 1. Update every Ouro component, with its tests

Update every Ouro component in your app, not only the items you typed: v0.1.0 added each component's dependencies too, so an app that added only `dialog` also has `button` and `sheet`. Each component is one `.tsx` file under `components/ouro/` (`dialog/` holds `dialog` and `confirm-dialog`, and `text/` holds `text` and `heading`). List them:

```sh
find src/components/ouro -name '*.tsx' ! -name '*-parts.tsx' ! -name '*.test.tsx' ! -name '*.stories.tsx'
```

Add each one as `<name>` and `<name>-tests`, plus `ouro-lib-tests`, in one command at the same ref, with `--overwrite` (without it the CLI stops to ask about each file). For the app that added only `dialog`, that is `button button-tests dialog dialog-tests sheet sheet-tests ouro-lib-tests`. This command builds the list from the same files and adds them; if you use the Ouro theme, add `ourostack/ouro-ui/ouro-theme#v0.2.0` to it:

```sh
npx shadcn@latest add $(find src/components/ouro -name '*.tsx' ! -name '*-parts.tsx' ! -name '*.test.tsx' ! -name '*.stories.tsx' | sed -E 's|.*/(.*)\.tsx$|ourostack/ouro-ui/\1#v0.2.0 ourostack/ouro-ui/\1-tests#v0.2.0|') ourostack/ouro-ui/ouro-lib-tests#v0.2.0 --overwrite
```

This keeps the tests v0.1.0 installed, deletes none of your files and adds no component you didn't have. The `-tests` items set Vitest, Storybook and Playwright in `package.json` to the versions Ouro tests against. Check `package.json` afterwards and restore any pin you need; Ouro's tests may not run on an older Vitest.

#### 2. Remove the self-referential theme lines

v0.1.0 wrote a line into `@theme inline` for each Ouro token that points at itself, such as `--ouro-press-scale: var(--ouro-press-scale);`, and `--color-ouro-backdrop-color: var(--ouro-backdrop-color);`. Delete them from your Tailwind CSS file, the one `components.json` names in `tailwind.css`. The values stay in `:root` and `.dark`. This command finds the file and deletes the lines:

```sh
perl -i -ne 'print unless /^\s*--(color-)?ouro-[\w-]+:\s*var\(--ouro-[\w-]+\);\s*$/' "$(node -p 'require("./components.json").tailwind.css')"
```

#### 3. Optional: drop Ouro's tests

To keep only the components, delete the files Ouro owns for its tests: the test, type-test and story files under the Ouro folders, the test kit in `lib/ouro/testing` and the specs in `e2e/ouro`:

```sh
find src/components/ouro src/lib/ouro \( -name '*.test.ts' -o -name '*.test.tsx' -o -name '*.test-d.ts' -o -name '*.stories.tsx' \) -delete
find src/lib/ouro/testing e2e/ouro -delete
```

Then remove the `ouroTestProjects` import and call from your Vitest config. Only if Ouro's tests were the only tests using them, also delete `vitest.config.ts`, `playwright.config.ts` and `.storybook/`, and uninstall `vitest`, `@vitest/browser-playwright`, `playwright`, `@playwright/test`, `storybook` and `@storybook/react-vite` with your package manager.

#### 4. Change imports of moved helpers

If your own code imports these helpers, change the import:

- `useOuro`: from `lib/ouro/ouro-provider` to `lib/ouro/use-ouro`.
- `sheetSides`, `sideWarning`, `sheetHint`, `iosBackdrop` and `footerClass`: from `components/ouro/sheet/sheet-parts` to `components/ouro/sheet/sheet-styles`.
- `dialogSizes` and `dialogSizeWarning`: from `components/ouro/dialog/dialog-parts` to `components/ouro/dialog/dialog-styles`.
- `alignClasses` and `checkAlign`: from `components/ouro/text/text` to `components/ouro/text/text-styles`.

Then type check and build your app. CI runs steps 1 to 3 on a v0.1.0 app, with these commands read from this file (`scripts/install-test.sh upgrade`).
<!-- upgrade:end -->

Items: `button`, `text`, `heading`, `sheet`, `dialog`, `confirm-dialog`, plus `ouro-base` and `ouro-lib`, which every component brings, and the optional `ouro-theme`. Tests, all optional: `button-tests`, `text-tests`, `heading-tests`, `sheet-tests`, `dialog-tests`, `confirm-dialog-tests`, `ouro-lib-tests`, the test kit `ouro-testing` that they bring, and `ouro-tests`, which adds them all.

## For agents

Each component has a page in `docs/` with its purpose, an example, every prop, its modes and what to use instead. The same text is in the JSDoc, so your editor shows it on hover.

- **Props first.** Each component's props describe the whole thing. Parts (`dialog-parts`, `sheet-parts`) are an escape hatch, only for layouts the props cannot express.
- **What always applies is required.** A Dialog or Sheet needs a `title`; hide it with `hideTitle`.
- **Appearance comes from named props**: `tone` (`primary`, `secondary`, `destructive`, `success`, `warning`, each named after the theme variable it reads, with shadcn's meaning), `variant` and `size`. There are no color names.
- **`className` is for layout only**: margins, width and grid placement. Your classes always win. Appearance classes (`bg-*`, `text-<color>`, `rounded-*`, `font-*`, `dark:*`…) warn in development with the prop to use instead.
- **The prop you guess is the prop that exists**, or the type error names the real one: `isLoading` says to use `loading`, and shadcn's `variant="destructive"` says to use `tone="destructive"`.
- **Modes follow the types.** `href` makes a Button a link; a Dialog takes either `trigger` or `open` with `onOpenChange`.
- **Dev messages teach**, in one format: `[ouro-ui] <Component>: <what's wrong>. Fix: <exact code>.` They are stripped from production builds.
- **axe in WebKit flags Base UI's focus guards; exclude them.** While a Dialog, ConfirmDialog or Sheet is open, WebKit gives Base UI's focus guards `role="button"` without a name so VoiceOver's cursor stays trapped, and axe reports `aria-command-name`. That is expected: `new AxeBuilder({ page }).exclude("[data-base-ui-focus-guard]")`, or spread `axeExclude` from `lib/ouro/testing/axe.ts` (in `ouro-testing`).

## Components

<!-- catalog:start -->
<!-- Generated by scripts/gen-docs.mts from the JSDoc in registry/. Do not edit; run `pnpm run docs`. -->

### Actions

- **Button** — A button, or a link styled as one. [Docs](docs/Button.md)

### Text

- **Heading** — A section title, `<h1>` to `<h6>`, in the theme's foreground color. [Docs](docs/Heading.md)
- **Text** — Body text in the theme's type scale and colors. [Docs](docs/Text.md)

### Overlays

- **ConfirmDialog** — Asks the user to confirm an action, with Cancel focused first. [Docs](docs/ConfirmDialog.md)
- **Dialog** — A dialog that presents itself for the screen: a centered dialog on wider screens and a bottom sheet you can drag away on phones (below 640px). [Docs](docs/Dialog.md)
- **Sheet** — A panel that slides in from an edge and is dragged back to dismiss: the mobile form of a dialog. [Docs](docs/Sheet.md)

### App setup

- **OuroProvider** — Optional app-level provider that routes internal `href`s through your router's link. [Docs](docs/OuroProvider.md)

### Parts

- **Parts** — building blocks for Dialog and Sheet, only for layouts the props cannot express. [Docs](docs/parts.md)
<!-- catalog:end -->

## Theme

Two stylesheets ship with the components, as registry items that write into your app's CSS:

- `ouro-base` (`registry/ouro/theme/ouro-base.css`) is required in every app, and every component installs it. It adds what shadcn's themes lack: `--success`, `--warning` and their foregrounds, and `--destructive-foreground`, with defaults that pass 4.5:1 on shadcn's stock themes; the motion tokens (`--ouro-spring-duration`, `--ouro-ease-spring` and the other `--ouro-*` values); the `press` transition; and the spinner keyframes.
- `ouro-theme` (`registry/ouro/theme/ouro-theme.css`) is optional: the Ouro color look as a shadcn theme, light values on `:root` and dark values on `.dark`. An app that already has a shadcn theme keeps its own.

Dark mode follows the `.dark` class, as in shadcn. To change a color, set its variable in your theme.

## License

MIT
