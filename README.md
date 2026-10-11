# Ouro UI

React components with handcrafted interactions, designed for coding agents to use correctly without a skill.

```sh
npx shadcn@latest search 'ourostack/ouro-ui#v0.3.0'     # list the items
npx shadcn@latest view 'ourostack/ouro-ui/dialog#v0.3.0' # read one item
npx shadcn@latest add ourostack/ouro-ui/dialog#v0.3.0    # install it
```

A GitHub source is `owner/repo#ref`; an item is `owner/repo/item#ref`. `@v0.3.0`, `github:` and `/tree/` URLs don't work. The same commands and the item list, for agents: [llms.txt](https://ourostack.github.io/ouro-ui/llms.txt).

Ouro UI is copy-in source in the shadcn/ui registry format: the shadcn CLI copies each component into your app, and your app's own Tailwind CSS v4 compiles its classes. Like shadcn/ui's own items, a component item installs only the component's source; its tests are a separate, optional item. The components read shadcn's theme variables (`--primary`, `--background`, `--radius`…), so an app that already has a shadcn theme keeps it.

```tsx
import { Button } from "@/components/ouro/button/button";
import { Dialog } from "@/components/ouro/dialog/dialog";

<Dialog title="Edit recipe" trigger={<Button>Edit</Button>}>
  <RecipeForm />
</Dialog>;
```

These are the paths in your app once the CLI has installed a component, with your components alias in place of `@/components` (`aliases.components` in `components.json`). The files in this repository and the `docs/` pages use the registry source paths, `@/registry/ouro/components/ouro/button/button`, which the CLI rewrites on install. The components need `react` and `react-dom` 19; the CLI installs the rest (`@base-ui/react`, `clsx`, `tailwind-merge`). They need no animation library: motion is CSS, and reduced motion is honored in CSS. If your app animates with Motion, wrap it in `<MotionConfig reducedMotion="user">`.

## Install

Ouro UI is alpha.

### Quick start

```sh
# Existing Vite/Next app with Tailwind CSS v4 and an "@/*" path alias:
npx shadcn@latest init --base base --preset nova --yes --no-monorepo
npx shadcn@latest add ourostack/ouro-ui/dialog#v0.3.0
```

- Pass `--base base`: Ouro UI is built on Base UI. Don't pass `-t`/`--template` in an existing app; it adds shadcn's `components/ui/button.tsx`.
- New Vite app? Add `@tailwindcss/vite`, `@import "tailwindcss";`, a Vite `@` alias, and `"paths": { "@/*": ["./src/*"] }` in both `tsconfig.json` and `tsconfig.app.json` (no `baseUrl` on TypeScript 6) before `init`. shadcn reads the root file, and `tsc -b` builds the app one.
- `--preset nova` lets `init` run without prompts. It sets shadcn's starting theme, font and icons (nova adds the Geist font, `lucide-react` and `tw-animate-css`), which Ouro components read like any shadcn theme. The install test runs `nova` and `vega`; other presets are untested.

### Next.js

In a Next.js App Router app, `init` writes `"rsc": true`, so the components keep their `"use client"` line and a Server Component page can render them, parts included. Pass them only what can cross from the server: elements, strings, numbers, and a server action (`"use server"`) for `ConfirmDialog`'s `onConfirm`. CI builds such an app with `next build` (`scripts/install-test.sh next`).

To route `href`s through `next/link`, put `OuroProvider` in a client file, because a Server Component can't pass `Link`, a function, to a client component. `app/providers.tsx`:

```tsx
"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { OuroProvider } from "@/lib/ouro/ouro-provider";

// A Server Component can't pass next/link's Link (a function) to a Client Component, so the
// provider gets it here, in a client file.
export function Providers({ children }: { children: ReactNode }) {
  return <OuroProvider linkComponent={Link}>{children}</OuroProvider>;
}
```

Then wrap the app in `app/layout.tsx`, which stays a Server Component:

```tsx
import type { ReactNode } from "react";
import { Providers } from "./providers";
import "./globals.css";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

### Details

- The CLI reads `registry.json` at this repository's root. A [release](https://github.com/ourostack/ouro-ui/releases) tag such as `#v0.3.0` installs the item and every Ouro dependency (`ouro-lib`, `button` and so on) at that tag. Without a ref, items come from `main`, which is for contributors: it can hold changes no release has yet. A `#<branch>` or `#<sha>` ref pins only the item you name; its Ouro dependencies come from `main`.
- Or add the `@ouro` namespace to `components.json` once, `"registries": { "@ouro": "https://ourostack.github.io/ouro-ui/r/{name}.json" }`, and run `npx shadcn@latest add @ouro/dialog`. The namespace serves the newest release, the same code as `#v0.3.0`.
- Components land in `components/ouro/<component>/`, beside shadcn's `components/ui/`, and the shared helpers in `lib/ouro/`. The base tokens (`ouro-base`) are added to your CSS with any component, and `ouro-lib` comes with any component too; you don't need to add either.
- `init` is shadcn's: it writes `lib/utils.ts` and adds `cn`, `class-variance-authority`, `lucide-react` and `tw-animate-css`. Ouro UI doesn't use them; keep them for shadcn components. Ouro never writes to `components/ui/`, so don't pass `--overwrite` on a first install.
- Tests are optional. Each component's Vitest browser tests, type tests, stories and Playwright spec are its `-tests` item, which also adds Vitest, Storybook and Playwright as devDependencies: `npx shadcn@latest add ourostack/ouro-ui/dialog#v0.3.0 ourostack/ouro-ui/dialog-tests#v0.3.0`. `ouro-tests` adds every component with all of its tests in one command. The install message of `ouro-testing` (the test kit the `-tests` items bring) lists the config files to add, then run `npx vitest run`.
- A `-tests` item sets Vitest to `^5`, the version its tests are verified on: the shadcn CLI installs a devDependency's range with your package manager, which upgrades an older pin (npm installs the newest matching version even under a range such as `^4.1.0 || ^5.0.0`). An app pinned to Vitest 4, for example by `@cloudflare/vitest-pool-workers`, keeps its pin by not adding the `-tests` items; the components need none of them. To keep the pin and still add the tests, re-pin only the Vitest packages after `shadcn add`: `npm install -D vitest@^4.1.0 @vitest/browser-playwright@^4.1.0`, or `pnpm add -D vitest@^4.1.0 @vitest/browser-playwright@^4.1.0`. Leave the other packages the items added. Ouro's tests then run on Vitest 4, which we don't verify.
- For the Ouro look, add `ourostack/ouro-ui/ouro-theme#v0.3.0`. Skip it to keep your app's shadcn theme.
- To update to the newest release, list the changed files with `npx shadcn@latest add ourostack/ouro-ui/<item>#v0.3.0 --dry-run` (or `@ouro/<item>`), review each one marked overwrite with `--diff <path>`, then add the item again at the same ref with `--overwrite` (with its `-tests` item if you have it: `add <item> <item>-tests --overwrite`) and reapply your edits. Coming from v0.1.0? Follow [Upgrading from v0.1.0](#upgrading-from-v010) instead.

### Upgrading from v0.1.0

<!-- upgrade:start -->
v0.1.0 installed each component with its tests, and v0.2.0 moves some shared helpers to new files, so update every Ouro component in one go. Run the commands in your app's root, the folder with `components.json`. They find your folders the way shadcn does, from the aliases in `components.json` and the `paths` in your tsconfig (`npx shadcn@latest info` shows them), so they work in a `src/` or an `app/` layout as written.

#### 0. Commit first

`--overwrite` replaces every Ouro file, including files you edited. Commit before you start. Afterwards, `git diff` shows your own edits being overwritten, so reapply the ones you need.

#### 1. Update every Ouro component, with its tests

Update every Ouro component in your app, not only the items you typed: v0.1.0 added each component's dependencies too, so an app that added only `dialog` also has `button` and `sheet`. Each component is one `.tsx` file in your `components/ouro/` folder (`dialog/` holds `dialog` and `confirm-dialog`, and `text/` holds `text` and `heading`). Add each one as `<name>` and `<name>-tests`, plus `ouro-lib-tests`, in one command at the same ref, with `--overwrite` (without it the CLI stops to ask about each file). For the app that added only `dialog`, that is `button button-tests dialog dialog-tests sheet sheet-tests ouro-lib-tests`.

This command finds the components, prints them and adds them. If it finds none, it stops before adding anything; run it in the folder with `components.json`. If you use the Ouro theme, add `ourostack/ouro-ui/ouro-theme#v0.3.0` to the `add` in it.

```sh
( p() { npx shadcn@latest info --json | node -p "JSON.parse(require('fs').readFileSync(0, 'utf8')).config.resolvedPaths.$1"; }; ouro="$(p components)/ouro"; items=$(find "$ouro" -name '*.tsx' ! -name '*-parts.tsx' ! -name '*.test.tsx' ! -name '*.stories.tsx' 2>/dev/null | sed -E 's|.*/(.*)\.tsx$|\1|' | sort); [ -n "$items" ] || { echo "No Ouro components in $ouro. Run this in the folder with components.json." >&2; exit 1; }; echo "Updating:" $items; npx shadcn@latest add $(echo "$items" | sed -E 's|.*|ourostack/ouro-ui/&#v0.3.0 ourostack/ouro-ui/&-tests#v0.3.0|') ourostack/ouro-ui/ouro-lib-tests#v0.3.0 --overwrite )
```

This keeps the tests v0.1.0 installed, deletes none of your files and adds no component you didn't have. The `-tests` items set Vitest, Storybook and Playwright in `package.json` to the versions Ouro tests against. Check `package.json` afterwards and restore any pin you need; Ouro's tests may not run on an older Vitest.

#### 2. Remove the self-referential theme lines

v0.1.0 wrote a line into `@theme inline` for each Ouro token that points at itself, such as `--ouro-press-scale: var(--ouro-press-scale);`, and `--color-ouro-backdrop-color: var(--ouro-backdrop-color);`. Delete them from your Tailwind CSS file, the one `components.json` names in `tailwind.css`. The values stay in `:root` and `.dark`. This command finds the file and deletes the lines:

```sh
perl -i -ne 'print unless /^\s*--(color-)?ouro-[\w-]+:\s*var\(--ouro-[\w-]+\);\s*$/' "$(npx shadcn@latest info --json | node -p "JSON.parse(require('fs').readFileSync(0, 'utf8')).config.resolvedPaths.tailwindCss")"
```

#### 3. Optional: drop Ouro's tests

To keep only the components, delete the files Ouro owns for its tests: the test, type-test and story files in your `components/ouro/` and `lib/ouro/` folders, the test kit in `lib/ouro/testing` and the specs in `e2e/ouro`. The command stops if it can't find those folders.

```sh
( p() { npx shadcn@latest info --json | node -p "JSON.parse(require('fs').readFileSync(0, 'utf8')).config.resolvedPaths.$1"; }; c="$(p components)/ouro"; l="$(p lib)/ouro"; [ -d "$c" ] && [ -d "$l" ] || { echo "No Ouro folders at $c and $l. Run this in the folder with components.json." >&2; exit 1; }; find "$c" "$l" \( -name '*.test.ts' -o -name '*.test.tsx' -o -name '*.test-d.ts' -o -name '*.stories.tsx' \) -delete; find "$l/testing" e2e/ouro -delete )
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

To change any `--ouro-*` token (the spring and durations, `--ouro-press-scale`, the backdrop color and opacity, `--ouro-layer`), set it in a `:root` or `.dark` rule of your own after the Ouro tokens, outside any `@layer`, such as `:root { --ouro-press-scale: 0.98; }` at the end of your CSS file. Don't edit the lines shadcn wrote for the Ouro tokens, because every `shadcn add` of an Ouro item rewrites them.

Sheets and dialogs stack at `--ouro-layer`, a z-index of 50 by default, the level of shadcn's overlays. If your app has fixed bars above z-50, raise it the same way, such as `:root { --ouro-layer: 60; }`; no class edit is needed. At an equal z-index the open sheet or dialog still wins, because its portal is the last child of `<body>`.

## License

MIT
