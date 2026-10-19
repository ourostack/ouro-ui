# Ouro HX

Designed down to the last tap and the last prop. Interactions that feel right to the humans using them. Code that's obvious to the agents building with them.

Under construction. Ouro HX is the component library within Ouro UI. Ouro AX is coming soon; its scope is still being defined. The repository, `@ouro` namespace and install addresses are unchanged.

```sh
npx shadcn@latest search 'ourostack/ouro-ui#v1.0.2'     # list the items
npx shadcn@latest view 'ourostack/ouro-ui/dialog#v1.0.2' # read one item
npx shadcn@latest add ourostack/ouro-ui/dialog#v1.0.2    # install it
```

A GitHub source is `owner/repo#ref`; an item is `owner/repo/item#ref`. `@v1.0.2`, `github:` and `/tree/` URLs don't work. The same commands and the item list, for agents: [llms.txt](https://ourostack.github.io/ouro-ui/llms.txt).

Ouro HX is copy-in source in the shadcn/ui registry format: the shadcn CLI copies each component into your app, and your app's own Tailwind CSS v4 compiles its classes. Like shadcn/ui's own items, a component item installs only the component's source; its tests are a separate, optional item. The components read shadcn's theme variables (`--primary`, `--background`, `--radius`…), so an app that already has a shadcn theme keeps it.

```tsx
import { Button } from "@/components/ouro/button/button";
import { Dialog } from "@/components/ouro/dialog/dialog";

<Dialog title="Edit recipe" trigger={<Button>Edit</Button>}>
  <RecipeForm />
</Dialog>;
```

These are the paths in your app once the CLI has installed a component, with your components alias in place of `@/components` (`aliases.components` in `components.json`). The files in this repository and the `docs/` pages use the registry source paths, `@/registry/ouro/components/ouro/button/button`, which the CLI rewrites on install. The components need `react` and `react-dom` 19; the CLI installs the rest (`@base-ui/react`, `clsx`, `tailwind-merge`). They need no animation library: motion is CSS, and reduced motion is honored in CSS. If your app animates with Motion, wrap it in `<MotionConfig reducedMotion="user">`.

## Install

Ouro HX is under construction.

### Quick start

```sh
# Existing Vite/Next app with Tailwind CSS v4 and an "@/*" path alias:
npx shadcn@latest init --base base --preset nova --yes --no-monorepo
# Once per app, before your first component: the tokens every component needs.
npx shadcn@latest add ourostack/ouro-ui/ouro-base#v1.0.2
npx shadcn@latest add ourostack/ouro-ui/dialog#v1.0.2
```

- Add `ouro-base` once, before your first component. It is the only item that writes to your stylesheet (apart from the optional `ouro-theme`), so no later add touches it (from v0.8.0; in v0.7.0 every component still installs it, and an add can rewrite the stylesheet). [Installing](docs/guides/installing.md) says what it writes.

- Pass `--base base`: Ouro HX is built on Base UI. Don't pass `-t`/`--template` in an existing app; it adds shadcn's `components/ui/button.tsx`.
- New Vite app? Add `@tailwindcss/vite`, `@import "tailwindcss";`, a Vite `@` alias, and `"paths": { "@/*": ["./src/*"] }` in both `tsconfig.json` and `tsconfig.app.json` (no `baseUrl` on TypeScript 6) before `init`. shadcn reads the root file, and `tsc -b` builds the app one.
- `--preset nova` lets `init` run without prompts. It sets shadcn's starting theme, font and icons (nova adds the Geist font, `lucide-react` and `tw-animate-css`), which Ouro components read like any shadcn theme. The install test runs `nova` and `vega`; other presets are untested.

### Next.js

In a Next.js App Router app, `init` writes `"rsc": true`, so the components keep their `"use client"` line and a Server Component page can render them, parts included. Pass them only what can cross from the server: elements, strings, numbers, and a server action (`"use server"`) for `ConfirmDialog`'s `onConfirm`. CI builds such an app with `next build` (`scripts/install-test.sh next`).

In a React Router app, `OuroProvider` needs a small adapter, because the router's `Link` takes `to`; [OuroProvider](docs/OuroProvider.md) has both files in full.

`OuroProvider` routes `href`s through `next/link` and groups tooltips. It comes with every component that renders links (`button`, `link`, `card`, `item`, `table` and the navigation components) and with `tooltip`. With only other components installed, such as `dialog` above, add it by name (v0.7.0 has no such item: there it comes with every component):

```sh
npx shadcn@latest add ourostack/ouro-ui/lib-ouro-provider#v1.0.2
```

Put it in a client file, because a Server Component can't pass `Link`, a function, to a client component. `app/providers.tsx`:

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

- The CLI reads `registry.json` at this repository's root. A [release](https://github.com/ourostack/ouro-ui/releases) tag such as `#v1.0.2` installs the item and every Ouro dependency (`ouro-lib`, `button` and so on) at that tag. Without a ref, items come from `main`, which is for contributors: it can hold changes no release has yet. A `#<branch>` or `#<sha>` ref pins only the item you name; its Ouro dependencies come from `main`.
- Or add the `@ouro` namespace to `components.json` once, `"registries": { "@ouro": "https://ourostack.github.io/ouro-ui/r/{name}.json" }`, and run `npx shadcn@latest add @ouro/ouro-base @ouro/dialog` (`@ouro/ouro-base` once per app, as above). The namespace serves the newest release, the same code as `#v1.0.2`.
- Components land in `components/ouro/<component>/`, beside shadcn's `components/ui/`, and the helpers they import in `lib/ouro/`, one file each: a component installs only the helpers it imports. No component installs `ouro-base`; you add it once, as above. If you skip it, nothing fails to build, so in development the first Ouro HX component to mount logs the command to run.
- `init` is shadcn's: it writes `lib/utils.ts` and adds `cn`, `class-variance-authority`, `lucide-react` and `tw-animate-css`. Ouro HX doesn't use them; keep them for shadcn components. Ouro never writes to `components/ui/`, so don't pass `--overwrite` on a first install.
- Tests are optional. Each component's Vitest browser tests, type tests, stories and Playwright spec are its `-tests` item, with the tests of everything the component installs: `npx shadcn@latest add ourostack/ouro-ui/dialog#v1.0.2 ourostack/ouro-ui/dialog-tests#v1.0.2`. CI verifies 100% line and branch coverage of the installed runtime files for five sets: button, dialog, sheet, the forms set and their union (the [Testing guide](https://ourostack.github.io/ouro-ui/docs/testing/) lists the forms set). Other items receive their full test dependency closure but are not measured individually. `ouro-tests` adds every component with all of its tests in one command. The install message of `ouro-testing` (the test kit the `-tests` items bring) lists the config files to add, then run `npx vitest run`.
- The tests need Vitest 4.1.11 or later in browser mode, Playwright 1.58.1 or later and Storybook 10.2.10 or later. Ouro HX's own CI runs them on Vitest 5 only; Vitest 4 is the stated minimum, not a tested one. A `-tests` item names those tools without a version, so the CLI installs one only when your app lacks it and never changes a version you have. v0.7.0's items still carry versions: after `add`, restore every test-tool version you had pinned (`git diff package.json`). [Testing](docs/guides/testing.md) has the requirements, what to do on Vitest 4, and how to find Ouro HX's fields in your own tests.
- In a Vite or React Router app the components keep their `"use client";` line, which is harmless there. [Installing](docs/guides/installing.md#vite-and-react-router-apps-the-use-client-notice) says why, and how to drop Rollup's notice about it.
- For the Ouro look, add `ourostack/ouro-ui/ouro-theme#v1.0.2`. Skip it to keep your app's shadcn theme.
- To update to the newest release, list the changed files with `npx shadcn@latest add ourostack/ouro-ui/<item>#v1.0.2 --dry-run` (or `@ouro/<item>`), review each one marked overwrite with `--diff <path>`, then add the item again at the same ref with `--overwrite` (with its `-tests` item if you have it: `add <item> <item>-tests --overwrite`) and reapply your edits. Coming from v0.1.0? Follow [Upgrading from v0.1.0](#upgrading-from-v010) instead.

### Upgrading from v0.1.0

<!-- upgrade:start -->
v0.1.0 installed each component with its tests, and v0.2.0 moves some shared helpers to new files, so update every Ouro component in one go. Run the commands in your app's root, the folder with `components.json`. They find your folders the way shadcn does, from the aliases in `components.json` and the `paths` in your tsconfig (`npx shadcn@latest info` shows them), so they work in a `src/` or an `app/` layout as written.

#### What changed, by version

What an app on v0.1.0 has to know beyond these steps. The release notes list every change.

- **v0.2.0:** each component's tests became an optional `<name>-tests` item, some helpers moved to new files (step 4), and v0.1.0's self-referential theme lines can go (step 2).
- **v0.3.0:** sheets and dialogs stack at `--ouro-layer`, a z-index of 50 by default, instead of level 0, so an app element at z-index 1 to 49 that used to show above an open sheet or dialog now sits under it. Raise the token in a `:root` rule of your own if your app has fixed bars above z-50 (see "Theme" in the README), and drop any portal z-index workaround. A controlled `Dialog` opened by a touch or pen tap focuses its popup instead of its first input, and `ConfirmDialog`'s `finalFocus` applies only after a confirmed action; drop workarounds for either. Every coverage hint is `/* istanbul ignore … @preserve */`, so a build plugin that kept the hints can go. A `-tests` item sets Vitest to `^5`.
- **v0.3.1:** every component starts with `"use client"`, so Next.js App Router pages can render them, and the `@ouro` namespace serves the newest release instead of `main`.
- **After v0.7.0:** a required field's `*` is drawn with CSS on a new element around the label and is no longer a `<span data-ouro-required>` inside it, so tests that expected the label text "Email*" now find "Email". The clear, show-password and choose-date buttons in TextField and DatePicker are named by hidden text, not `aria-label`, so replace `button[aria-label="…"]` selectors with `[data-ouro-clear]`, `[data-ouro-show-password]` or `[data-ouro-choose-date]`. The same goes for a file's remove button in FileField (`[data-ouro-file-remove]`), Combobox's clear and chip remove buttons (`[data-ouro-combobox-clear]`, `[data-ouro-combobox-chip-remove]`) and NumberField's steppers (`[data-ouro-increment]`, `[data-ouro-decrement]`). A remove button's hidden text holds the file or item name, so a loose `getByText("pasta.png")` now finds it too; pass `{ exact: true }`. `FieldLabel`'s `className` now goes on the new element around the label, which also carries `[data-ouro-required]`, and a group's label `id` is on the inner `<span>`; `style`, `id`, `data-*` and handlers still go on the `<label>`. A numeric `size` on TextField is now a type error and a development warning; set a width with `className="w-40"`. `FormErrors` values are now `ErrorMessages | null | undefined`, so code that reads `errors.email` as `string | string[]` no longer type checks until it handles `null` and React nodes. For action answers, import `formErrors` from `@/lib/ouro/form-answer` and pass `errors={formErrors(actionData, actionData?.errors)}` from the initial render; this replaces the unreleased separate `result` prop. It identifies equal new answers while keeping cleared fields masked on pending/client renders and rendering current uncleared messages. Cached/reused answers need `{ key: acceptedAnswerKey }`, changed on actual acceptance, not submit start. Raw records remain compatible but content-only. Reconstruct the value beside Form after JSON/spread/cloning or server-component transport: only messages serialize, not private identity; a safely transported acceptance key can identify the locally reconstructed answer. On a phone, a Link that is not in running text is now a box at least 44px tall and wide that takes its room in the layout, so a column of links grows; pass `inline` to a link in a sentence inside your own `<div>` or `<span>`. A Form's top message element exists only while there is a message. Component roots no longer set `m-0`, so a parent's `space-y-*` now spaces them; remove any margin you added to work around that.
- **v0.8.0:** no component installs `ouro-base`; add it once (step 1 does), and later adds leave your stylesheet alone. A component installs only the helpers it imports, one item per file in `lib/ouro`, and a `-tests` item brings the tests of everything its component installs. The `-tests` items no longer set a version for Vitest, Storybook or Playwright. The specs import `test` and `expect` from `e2e/ouro-fixtures.ts`, a file of yours (step 1). `lib/ouro/use-dev-warnings.ts` is now `lib/ouro/use-dev-messages.ts` (step 4). Earlier releases installed every helper in `lib/ouro` with any component, and an update deletes nothing: audit references before deleting unused historical helpers and their own tests (step 5). `OuroProvider` now comes only with the components that render links and with `tooltip`; your copy stays, and a new app adds `lib-ouro-provider` by name.

- **After v0.8.2:** `ouroTestProjects({ page })` also sizes the touch project's Playwright host, preventing Vitest 4 from scaling landscape touch frames. The logical touch viewport still starts at 390x844 with mobile/touch input, but an explicitly enlarged host changes outer-window/screen dimensions and screen orientation; do not treat those as hardware-phone measurements. Without `page`, the touch host stays 390x844. On Vitest 4, retain a host large enough for every requested test viewport, such as the Testing guide's 1600x1200 example.

- **v1.0.0:** the first stable release keeps the component APIs, theme tokens, defaults and test-tool minimums from v0.8.4. An app already on v0.8.4 needs no component API migration: review the update with `--dry-run` and `--diff`, then overwrite only the items it already uses and reapply its local edits. Runtime components and their optional `-tests` items remain separate; keep your app-owned fixtures and test configuration. Apps on older releases still need the applicable migration steps above and below.

- **After v1.0.2:** sheets, and a Menu shown as a bottom sheet, read their shadow from `--ouro-shadow-sheet-<side>`, which only a fresh `ouro-base` adds (step 1 adds it again); without it a sheet draws no shadow. Every other shadow reads shadcn's `--shadow-*` tokens, headings and overlay titles `--font-heading` and Kbd `--font-mono`, so a theme that sets them now restyles Ouro too; Kbd is monospaced unless your theme's `--font-mono` says otherwise.

- **After v1.0.1:** `formErrors` now declares its already-frozen message arrays readonly. Keep mutable `FormErrors` and `ErrorMessages` for raw builders; annotate returned snapshots as `FormErrorValue` or `ReadonlyFormErrors`, or let their type infer. Form, EditSheet, field `error` props and the normalization helper accept readonly projections. This corrects a false mutation permission, so a snapshot no longer fits a mutable raw-map annotation. TypeScript's `Array.isArray` narrows to `any[]` and can bypass readonly; unchanged runtime freezing still rejects container mutation, without deeply freezing React nodes.

#### 0. Commit first

`--overwrite` replaces every Ouro file, including files you edited. Commit before you start. Afterwards, `git diff` shows your own edits being overwritten, so reapply the ones you need.

Review the diff of your Tailwind CSS file too, the one `components.json` names in `tailwind.css`, because step 1 adds `ouro-base`, the one item that writes there, and `shadcn add` rewrites more than Ouro's tokens. It adds `@custom-variant dark (&:is(.dark *));` when the file has no `@custom-variant` (shadcn does this for any item with theme variables on Tailwind CSS v4, and it overrides a `darkMode` setting in a Tailwind config), adds the tokens your file lacks to `:root`, `.dark` and `@theme inline` (among them `--input`, `--radius` and the radius scale, if your theme has none), collapses blank lines and can drop the final newline. Keep the new lines and step 2's deletions, and revert the rest. After this upgrade no component add opens the file again.

#### 1. Update every Ouro component, with its tests

Update every Ouro component in your app, not only the items you typed: v0.1.0 added each component's dependencies too, so an app that added only `dialog` also has `button` and `sheet`. Each component is one `.tsx` file in your `components/ouro/` folder (`dialog/` holds `dialog` and `confirm-dialog`, and `text/` holds `text` and `heading`). Add each one as `<name>` and `<name>-tests`, plus `ouro-base`, in one command at the same ref, with `--overwrite` (without it the CLI stops to ask about each file). For the app that added only `dialog`, that is `ouro-base button button-tests dialog dialog-tests sheet sheet-tests`. No component installs `ouro-base` any more, so this is where your stylesheet gets the tokens added since v0.1.0.

This command finds the components, prints them and adds them. If it finds none, it stops before adding anything; run it in the folder with `components.json`. If you use the Ouro theme, add `ourostack/ouro-ui/ouro-theme#v1.0.2` to the `add` in it.

```sh
( p() { npx shadcn@latest info --json | node -p "JSON.parse(require('fs').readFileSync(0, 'utf8')).config.resolvedPaths.$1"; }; ouro="$(p components)/ouro"; items=$(find "$ouro" -name '*.tsx' ! -name '*-parts.tsx' ! -name '*.test.tsx' ! -name '*.stories.tsx' 2>/dev/null | sed -E 's|.*/(.*)\.tsx$|\1|' | sort); [ -n "$items" ] || { echo "No Ouro components in $ouro. Run this in the folder with components.json." >&2; exit 1; }; echo "Updating: $(echo "$items" | paste -sd " " -)"; npx shadcn@latest add $(echo "$items" | sed -E 's|.*|ourostack/ouro-ui/&#v1.0.2 ourostack/ouro-ui/&-tests#v1.0.2|') ourostack/ouro-ui/ouro-base#v1.0.2 --overwrite )
```

This keeps the tests v0.1.0 installed, deletes none of your files and adds no component you didn't have. shadcn may print `Skipped N files: (files might be identical, use --overwrite to overwrite)` even with `--overwrite`: those files already equal the release's, so nothing was missed. The `-tests` items name Vitest, Storybook and Playwright without a version, so the versions in your `package.json` stay as they are. v0.7.0's items still carry versions: after an add at v0.7.0, restore every test-tool version you had pinned (`git diff package.json`): Vitest and its companions, Playwright and Storybook. The tests need Vitest 4.1.11 or later, Playwright 1.58.1 or later and Storybook 10.2.10 or later; update those yourself if yours are older (the README's "Details" links the Testing page). The specs in `e2e/ouro` now import `test` and `expect` from `e2e/ouro-fixtures.ts`, a file of yours: add it with the one line `export { expect, test } from "@playwright/test";`, or export your own fixtures from it.

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
- `useDevWarnings`: from `lib/ouro/use-dev-warnings` to `lib/ouro/use-dev-messages`. Delete the old `lib/ouro/use-dev-warnings.ts`; nothing imports it after step 1.

#### 5. Delete the helpers nothing imports

Releases before v0.8.0 installed every helper in `lib/ouro` with any component. From v0.8.0 a component installs only the helpers it imports, but an update deletes nothing. Remove unused historical helpers rather than excluding them from coverage.

Before deleting anything, perform a read-only import/reference audit across the whole app, including scripts, tests, stories and configuration outside `src/`. Use the app's actual tsconfig and bundler aliases to resolve references to each helper's full path. Check relative imports, explicit extensions, re-exports and dynamic imports too; an importing file with the same basename is still a different file. A text search for `lib/ouro/<name>` alone cannot prove a helper is unused.

Delete a helper and its own tests only after verifying that no remaining app file or retained Ouro file references it (references from that helper's own tests do not require keeping an otherwise unused helper). Audit again after each removal: another historical helper may have been used only by the one you removed. If a reference is unresolved or you cannot verify a file's use, keep it until you can. Keep `ouro-provider.tsx` if you mean to use it and have not yet, and retain ambient declarations such as `env.d.ts` that the app's type check needs even without an import.

Then type check and build your app. CI runs steps 1 to 3 on a v0.1.0 app, with these commands read from this file (`scripts/install-test.sh upgrade`).
<!-- upgrade:end -->

### Items

<!-- items:start -->
<!-- Generated by scripts/gen-docs.mts from the JSDoc in registry/. Do not edit; run `pnpm run docs`. -->

Components: `button`, `text`, `heading`, `sheet`, `dialog`, `confirm-dialog`, `field`, `fieldset`, `link`, `text-field`, `text-area`, `checkbox`, `checkbox-group`, `radio-group`, `switch`, `form`, `edit-sheet`, `select`, `native-select`, `number-field`, `slider`, `combobox`, `toaster`, `spinner`, `progress`, `skeleton`, `avatar`, `badge`, `alert`, `separator`, `kbd`, `popover`, `tooltip`, `hover-card`, `menu`, `command`, `tabs`, `segmented-control`, `accordion`, `collapsible`, `show-more`, `card`, `item`, `item-group`, `empty`, `scroll-area`, `aspect-ratio`, `stack`, `row`, `navbar`, `sidebar`, `sidebar-layout`, `stacked-layout`, `auth-layout`, `breadcrumb`, `pagination`, `navigation-menu`, `table`, `description-list`, `toggle`, `toggle-group`, `button-group`, `otp-field`, `file-field`, `color-field`, `swipe-actions`, `reorderable`, `calendar`, `date-picker`, `carousel`, `resizable`, `chart`, `message`, `message-list`, `attachment`.

Each component has an optional `<name>-tests` item (`button-tests`) with its Vitest browser tests, type tests, stories and Playwright spec; it also installs the tests of everything the component installs. `ouro-tests` adds every component with all of its tests, and `ouro-testing` is the test kit the `-tests` items bring.

Once per app: `ouro-base`, the tokens every component needs in your stylesheet. Optional: `ouro-theme`, the Ouro look.

Helpers, one item per file in `lib/ouro`, each installed with the components that import it (you don't add them by name; `ouro-lib` is all of them, and a helper with tests has a `<name>-tests` item): `lib-announce`, `lib-appearance-hints`, `lib-class-name-check`, `lib-cn`, `lib-control-ref`, `lib-current-path`, `lib-dev`, `lib-env`, `lib-floating`, `lib-form-answer`, `lib-key-shortcuts`, `lib-last-input`, `lib-open-mode`, `lib-ouro-provider`, `lib-refs`, `lib-router-link`, `lib-server-element`, `lib-spring`, `lib-stretched-link`, `lib-toast`, `lib-tones`, `lib-touch-target`, `lib-use-backdrop-anchor`, `lib-use-command-shortcut`, `lib-use-dev-messages`, `lib-use-drag`, `lib-use-field`, `lib-use-keyboard-scrollable`, `lib-use-media-query`, `lib-use-ouro`, `lib-use-sheet-presentation`.
<!-- items:end -->

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
- **ButtonGroup** — Related buttons joined into one control, such as Previous, a page number and Next, or a split button. [Docs](docs/ButtonGroup.md)
- **Toggle** — A button that stays pressed until it is pressed again, such as Bold in a text toolbar. [Docs](docs/Toggle.md)
- **ToggleGroup** — A row of related toggles that share one value, such as text alignment or bold, italic and underline in a toolbar. [Docs](docs/ToggleGroup.md)

### Text

- **Heading** — A section title, `<h1>` to `<h6>`, in the theme's foreground color. [Docs](docs/Heading.md)
- **Kbd** — A keyboard shortcut, in the reader's platform's notation: `keys={["mod", "k"]}` shows ⌘K on a Mac, iPhone or iPad and Ctrl+K elsewhere. [Docs](docs/Kbd.md)
- **Link** — A text link that navigates through your router. [Docs](docs/Link.md)
- **Text** — Body text in the theme's type scale and colors. [Docs](docs/Text.md)

### Forms

- **Calendar** — A month grid to pick a day or a range of days, with the arrow keys or a press. [Docs](docs/Calendar.md)
- **Checkbox** — A labeled checkbox on the Field contract, with the label to its right: pass `label`, and `checked` with `onCheckedChange` (or `defaultChecked`). [Docs](docs/Checkbox.md)
- **CheckboxGroup** — A group of checkboxes under one legend, on the Field contract, for picking any number of choices: pass `legend`, and `options` (or `Checkbox` children). [Docs](docs/CheckboxGroup.md)
- **ColorField** — A color on the Field contract: a swatch that opens the system color picker, next to the same color as hex text, kept in step both ways. [Docs](docs/ColorField.md)
- **Combobox** — A text input that filters a list of items as people type, on the Field contract: pass `label`, `items`, and `error` from your server action or client check. [Docs](docs/Combobox.md)
- **DatePicker** — A labeled date field. [Docs](docs/DatePicker.md)
- **Field** — A labeled form control: the label, an optional description, the control and its error, wired together with ids that match between the server and the browser. [Docs](docs/Field.md)
- **Fieldset** — A titled group of related fields, such as an address, rendered as a `<fieldset>` named by its legend. [Docs](docs/Fieldset.md)
- **FileField** — A labeled file input with a drop zone, on the Field contract. [Docs](docs/FileField.md)
- **Form** — A form that validates with the browser's own constraints (`required`, `type="email"`, `pattern`) and shows server errors on the matching fields. [Docs](docs/Form.md)
- **NativeSelect** — A labeled native `<select>` on the Field contract: pass `label`, `options` (or `<option>` children) and `error`. [Docs](docs/NativeSelect.md)
- **NumberField** — A labeled number input on the Field contract: pass `label`, and `error` from your server action or client check. [Docs](docs/NumberField.md)
- **OtpField** — A one-time code entry on the Field contract: one slot per character, with focus that moves as the person types, a whole code pasted at once, and `autoComplete="one-time-code"` so phones offer the code from a text message. [Docs](docs/OtpField.md)
- **Radio** — One choice in a `RadioGroup`, with its label to its right. [Docs](docs/Radio.md)
- **RadioGroup** — A group of radios under one legend, on the Field contract, for picking exactly one choice: pass `legend`, and `options` (or `Radio` children). [Docs](docs/RadioGroup.md)
- **Select** — A labeled list of choices on the Field contract: pass `label`, `options` (or `SelectItem` children) and `error` from your server action or client check. [Docs](docs/Select.md)
- **Slider** — A labeled slider on the Field contract: pass `label`, and a `defaultValue` (or `value` with `onValueChange`). [Docs](docs/Slider.md)
- **Switch** — A labeled on/off switch on the Field contract, with the label to its right: pass `label`, and `checked` with `onCheckedChange` (or `defaultChecked`). [Docs](docs/Switch.md)
- **TextArea** — A labeled multi-line text field on the Field contract, a native `<textarea>`: pass `label`, and `error` from your server action or client check. [Docs](docs/TextArea.md)
- **TextField** — A labeled one-line text input on the Field contract: pass `label`, and `error` from your server action or client check. [Docs](docs/TextField.md)

### Overlays

- **ConfirmDialog** — Asks the user to confirm an action, with Cancel focused first. [Docs](docs/ConfirmDialog.md)
- **Dialog** — A dialog that presents itself for the screen: a centered dialog on wider screens and a bottom sheet you can drag away on phones (below 640px). [Docs](docs/Dialog.md)
- **EditSheet** — Edits something in a form inside a dialog: the whole interaction, done right. [Docs](docs/EditSheet.md)
- **HoverCard** — A preview of where a link goes, shown when a mouse rests on the link or the keyboard focuses it: a cook's profile, a recipe's summary. [Docs](docs/HoverCard.md)
- **Popover** — A small non-modal panel beside its trigger, for a short form or a few choices: a share link, filters, a quick edit. [Docs](docs/Popover.md)
- **Sheet** — A panel that slides in from an edge and is dragged back to dismiss: the mobile form of a dialog. [Docs](docs/Sheet.md)
- **Tooltip** — A short label that appears beside its trigger on hover and keyboard focus, for an icon button's purpose or a control's shortcut. [Docs](docs/Tooltip.md)

### Menus

- **Command** — A command palette: a searchable list of every action in the app, in a dialog. [Docs](docs/Command.md)
- **Menu** — A list of actions that opens from a button, from a right-click or long press, or from a menubar, with one API for all three. [Docs](docs/Menu.md)
- **MenuBar** — A row of menus, as at the top of a desktop app: File, Edit, View. [Docs](docs/MenuBar.md)
- **MenuCheckboxItem** — An on/off setting in a `Menu`, with a check mark when it is on. [Docs](docs/MenuCheckboxItem.md)
- **MenuGroup** — Items under a label in a `Menu`, such as "Recipe" and "Account" sections. [Docs](docs/MenuGroup.md)
- **MenuItem** — One action in a `Menu`: `onClick` runs it, `href` makes it a link, `shortcut` shows its keys and `tone="destructive"` marks an action that cannot be undone. [Docs](docs/MenuItem.md)
- **MenuRadioGroup** — One choice of several in a `Menu`, such as a sort order: its `MenuRadioItem`s show a mark on the chosen one, and choosing keeps the menu open. [Docs](docs/MenuRadioGroup.md)
- **MenuRadioItem** — One choice in a `MenuRadioGroup`, marked when it is the group's value. [Docs](docs/MenuRadioItem.md)
- **MenuSeparator** — A line between items in a `Menu`, to set apart a group of actions such as the destructive ones at the end. [Docs](docs/MenuSeparator.md)
- **MenuSub** — A nested menu in a `Menu`: an item that opens more items beside it, on hover, click or the arrow key. [Docs](docs/MenuSub.md)

### Feedback

- **Progress** — A bar that shows how far along a task is, or that it is under way when you can't tell. [Docs](docs/Progress.md)
- **Spinner** — A spinning ring that says something is loading. [Docs](docs/Spinner.md)
- **toast** — Shows a toast: a short message that appears at the bottom of the screen, is read to screen readers once, and dismisses itself. [Docs](docs/toast.md)
- **Toaster** — Shows the toasts you send with `toast("Saved")` from `@/lib/ouro/toast`: render it once, at the root of your app, inside `OuroProvider` if you use one, or alone. [Docs](docs/Toaster.md)

### Display

- **Alert** — An inline message in the page: something saved, something failed, something to know before going on. [Docs](docs/Alert.md)
- **Avatar** — A person's picture, or their initials until it loads or when it fails. [Docs](docs/Avatar.md)
- **AvatarGroup** — Avatars stacked with a slight overlap, such as the cooks on a recipe, with a "+N" count after `max`. [Docs](docs/AvatarGroup.md)
- **Badge** — A short label for a status, category or count: "Draft", "Vegan", "3". [Docs](docs/Badge.md)
- **Card** — A surface that groups one thing's content: a media slot across the top, a title with a description and an action, a body, and a footer. [Docs](docs/Card.md)
- **Carousel** — A row of slides the user swipes or steps through with Previous and Next buttons: recipe photos, a few featured cards. [Docs](docs/Carousel.md)
- **DescriptionList** — One thing's details as pairs of a term and its value: a recipe's prep time and servings, an order's date and total, an account's email. [Docs](docs/DescriptionList.md)
- **Empty** — What a list, search or page shows when it has nothing in it: an icon, a title that says what is empty, a sentence on what to do, and the action that does it. [Docs](docs/Empty.md)
- **Separator** — A thin line in the theme's border color between groups of content, horizontal or vertical. [Docs](docs/Separator.md)
- **Skeleton** — A shimmering placeholder in the shape of content that is still loading. [Docs](docs/Skeleton.md)

### Lists

- **Accordion** — A stack of titles that each open their own content, for FAQs and long settings pages. [Docs](docs/Accordion.md)
- **Collapsible** — One section that opens and closes under its title, such as nutrition facts under a recipe. [Docs](docs/Collapsible.md)
- **Item** — One row of a list: leading media, a title with a description, and trailing actions. [Docs](docs/Item.md)
- **ItemGroup** — A list of `Item` rows, with an optional label that names it, lines between the rows, and what to show when it is empty. [Docs](docs/ItemGroup.md)
- **Reorderable** — A list the user puts in order: recipe steps, a queue, favorites. [Docs](docs/Reorderable.md)
- **ShowMore** — "Show more" for a long list or a long text. [Docs](docs/ShowMore.md)
- **SwipeActions** — A list row with actions beside it that a horizontal swipe reveals: swipe toward the start for the `trailing` actions (Delete, Archive), toward the end for the `leading` ones (Pin). [Docs](docs/SwipeActions.md)

### Layout

- **AspectRatio** — A frame that keeps an image, video or map at a fixed shape while its width follows the layout, so the page does not jump when the media loads. [Docs](docs/AspectRatio.md)
- **Resizable** — Panels side by side (or stacked) with a draggable handle between each pair: a file list beside an editor, a preview above a console. [Docs](docs/Resizable.md)
- **ResizableHandle** — The draggable line between two panels in a `ResizablePanelGroup`, a focusable window splitter (`role="separator"`) for the panel before it. [Docs](docs/ResizableHandle.md)
- **ResizablePanel** — One resizable area of a `Resizable` (or `ResizablePanelGroup`), sized in percent of the group. [Docs](docs/ResizablePanel.md)
- **ResizablePanelGroup** — A group of panels with handles you place yourself, shadcn's shape: `ResizablePanel` and `ResizableHandle` elements as direct children. [Docs](docs/ResizablePanelGroup.md)
- **Row** — Lays its children out side by side with an even gap, centered up and down. [Docs](docs/Row.md)
- **ScrollArea** — A scrolling region with a slim scrollbar that matches the theme, inside a height you set. [Docs](docs/ScrollArea.md)
- **Stack** — Lays its children out top to bottom with an even gap. [Docs](docs/Stack.md)

### Navigation

- **AuthLayout** — The page for signing in, signing up or resetting a password: one `Card` in the middle of the screen, with your brand, the title as the page's `<h1>`, the form, and a line under the card. [Docs](docs/AuthLayout.md)
- **Breadcrumb** — The trail from the top of the site to the current page: a labelled `<nav>` with an ordered list of links, the last item marked `aria-current="page"`. [Docs](docs/Breadcrumb.md)
- **Navbar** — The bar across the top of an app: your brand, the main links and a few controls, with the current page marked `aria-current="page"` and a bar at the start edge, distinct from hover and press highlights. [Docs](docs/Navbar.md)
- **NavigationMenu** — A row of links where some open a panel of further links, each with a line of description: the navigation of a site with more pages than fit in a bar. [Docs](docs/NavigationMenu.md)
- **Pagination** — Page navigation for a long list: Previous, the page numbers with gaps, and Next, with the current page marked `aria-current="page"`. [Docs](docs/Pagination.md)
- **SegmentedControl** — An iOS-style segmented control: a row of equal segments with a raised thumb that slides to the checked one, for switching how one view shows its content in place, such as list or grid. [Docs](docs/SegmentedControl.md)
- **Sidebar** — The column of links down the side of an app, in sections, with the current page marked `aria-current="page"` and a bar at the start edge, distinct from hover and press highlights. [Docs](docs/Sidebar.md)
- **SidebarLayout** — The shell of an app with a `Sidebar`: the sidebar beside the page from 640px up, in view while the page scrolls, and a sticky top bar with the sidebar's menu button below 640px. [Docs](docs/SidebarLayout.md)
- **StackedLayout** — The shell of an app with a `Navbar`: the bar across the top, in view while the page scrolls, and the page below it in a centered column. [Docs](docs/StackedLayout.md)
- **Tabs** — Tabs that switch between panels in place: an accessible tab list with roving focus, arrow-key navigation, a line that slides to the selected tab, and 44px tabs on touch screens. [Docs](docs/Tabs.md)

### Data

- **Chart** — A chart drawn in the theme's colors, which people can use without seeing it: a figure named by its `title`, a summary for screen readers, and a table of every value (visible with `showTable`). [Docs](docs/Chart.md)
- **ChartContainer** — shadcn's name for `Chart`: the same component with the same props, so code ported from shadcn's chart docs finds it. [Docs](docs/ChartContainer.md)
- **ChartLegend** — The legend for a recharts chart inside `Chart`: each series' marker shape and label from the chart's `config`, under the plot. [Docs](docs/ChartLegend.md)
- **ChartTooltip** — The tooltip for a recharts chart inside `Chart`: the category, then each series' marker, label and value from the chart's `config`, in the theme's popover colors. [Docs](docs/ChartTooltip.md)
- **Table** — A data table: a caption, column headers, and rows, from `columns` and `rows` or from parts. [Docs](docs/Table.md)

### Chat

- **Attachment** — A file attached to a chat message, or waiting to be sent with one: its icon, name and size. [Docs](docs/Attachment.md)
- **Message** — One message in a chat: who wrote it, their avatar and what they wrote, with any attachments under it. [Docs](docs/Message.md)
- **MessageList** — A conversation: `Message`s in a scrolling, labeled region that opens at the newest one. [Docs](docs/MessageList.md)

### App setup

- **OuroProvider** — Optional app-level provider that routes internal `href`s through your router's link and groups tooltips: once one `Tooltip` shows, its neighbours open instantly instead of each waiting its own delay. [Docs](docs/OuroProvider.md)

### Parts

- **Parts** — building blocks for Dialog, Field, Popover, Select, Sheet, Table and Tabs, only for layouts the props cannot express. [Docs](docs/parts.md)
<!-- catalog:end -->

## Theme

Two stylesheets ship with the components, as registry items that write into your app's CSS:

- `ouro-base` (`registry/ouro/theme/ouro-base.css`) is required in every app: add it once, before your first component. No component installs it, so it is the only add that writes to your stylesheet. It adds what shadcn's themes lack: `--success`, `--warning` and their foregrounds, and `--destructive-foreground`, with defaults that pass 4.5:1 on shadcn's stock themes; the motion tokens (`--ouro-spring-duration`, `--ouro-ease-spring` and the other `--ouro-*` values); the `press` transition; and the spinner keyframes. For a theme that has neither, it also adds `--input`, the border color of every field, and `--radius` with its scale, at shadcn's stock values; a theme that has them keeps its own.
- `ouro-theme` (`registry/ouro/theme/ouro-theme.css`) is optional: the Ouro color look as a shadcn theme, light values on `:root` and dark values on `.dark`. An app that already has a shadcn theme keeps its own.

Dark mode follows the `.dark` class, as in shadcn. To change a color, set its variable in your theme.

To change any `--ouro-*` token (the spring and durations, `--ouro-press-scale`, the backdrop color and opacity, `--ouro-layer`), set it in a `:root` or `.dark` rule of your own after the Ouro tokens, outside any `@layer`, such as `:root { --ouro-press-scale: 0.98; }` at the end of your CSS file. A rule of your own survives adding `ouro-base` again, which rewrites the lines it wrote.

Sheets and dialogs stack at `--ouro-layer`, a z-index of 50 by default, the level of shadcn's overlays. If your app has fixed bars above z-50, raise it the same way, such as `:root { --ouro-layer: 60; }`; no class edit is needed. At an equal z-index the open sheet or dialog still wins, because its portal is the last child of `<body>`.

## License

MIT
