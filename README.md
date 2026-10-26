# Ouro HX

Designed down to the last tap and the last prop. Interactions that feel right to the humans using them. Code that's obvious to the agents building with them.

Under construction. Ouro HX is the component library within Ouro UI. Ouro AX is coming soon; its scope is still being defined. The repository, `@ouro` namespace and install addresses are unchanged.

```sh
npx shadcn@latest search 'ourostack/ouro-ui#v1.2.5'     # list the items
npx shadcn@latest view 'ourostack/ouro-ui/dialog#v1.2.5' # read one item
npx shadcn@latest add ourostack/ouro-ui/dialog#v1.2.5    # install it
```

A GitHub source is `owner/repo#ref`; an item is `owner/repo/item#ref`. `@v1.2.5`, `github:` and `/tree/` URLs don't work. The same commands and the item list, for agents: [llms.txt](https://ourostack.github.io/ouro-ui/llms.txt).

Ouro HX is copy-in source in the shadcn/ui registry format: the shadcn CLI copies each component into your app, and your app's own Tailwind CSS v4 compiles its classes.[^tailwind-4] Like shadcn/ui's own items, a component item installs only the component's source; its tests are a separate, optional item. The components read shadcn's theme variables (`--primary`, `--background`, `--radius`…), so an app that already has a shadcn theme keeps it.

```tsx
import { Button } from "@/components/ouro/button/button";
import { Dialog } from "@/components/ouro/dialog/dialog";

<Dialog title="Edit recipe" trigger={<Button>Edit</Button>}>
  <RecipeForm />
</Dialog>;
```

These are the paths in your app once the CLI has installed a component, with your components alias in place of `@/components` (`aliases.components` in `components.json`). The files in this repository and the `docs/` pages use the registry source paths, `@/registry/ouro/components/ouro/button/button`, which the CLI rewrites on install. The components need `react` and `react-dom` 19; the CLI installs the rest (`@base-ui/react`, `clsx`, `tailwind-merge`).[^runtime-deps] They don't depend on the Motion library[^no-motion]: motion is CSS, and reduced motion is honored in CSS.[^reduced-motion] If your app animates with Motion, wrap it in `<MotionConfig reducedMotion="user">`.

## Install

Ouro HX is under construction.

### Quick start

```sh
# Existing Vite/Next app with Tailwind CSS v4 and an "@/*" path alias:
npx shadcn@latest init --base base --preset nova --yes --no-monorepo
# Once per app, before your first component: the tokens every component needs.
npx shadcn@latest add ourostack/ouro-ui/ouro-base#v1.2.5
npx shadcn@latest add ourostack/ouro-ui/dialog#v1.2.5
```

- Add `ouro-base` once, before your first component. It is the only item that writes to your stylesheet (apart from the optional `ouro-theme`), so no later add touches it (from v0.8.0; in v0.7.0 every component still installs it, and an add can rewrite the stylesheet).[^ouro-base-only][^v0.8.0][^v0.7.0] [Installing](docs/guides/installing.md) says what it writes.

- Pass `--base base`: Ouro HX is built on Base UI. Don't pass `-t`/`--template` in an existing app; it adds shadcn's `components/ui/button.tsx`.
- New Vite app? Add `@tailwindcss/vite`, `@import "tailwindcss";`, a Vite `@` alias, and `"paths": { "@/*": ["./src/*"] }` in both `tsconfig.json` and `tsconfig.app.json` (no `baseUrl` on TypeScript 6) before `init`. shadcn reads the root file, and `tsc -b` builds the app one.
- `--preset nova` lets `init` run without prompts. It sets shadcn's starting theme, font and icons (nova adds the Geist font, `lucide-react` and `tw-animate-css`), which Ouro components read like any shadcn theme. The install test runs `nova` and `vega`; other presets are untested.

### Next.js

In a Next.js App Router app, `init` writes `"rsc": true`, so the components keep their `"use client"` line and a Server Component page can render them, parts included. Pass them only what can cross from the server: elements, strings, numbers, and a server action (`"use server"`) for `ConfirmDialog`'s `onConfirm`. CI builds such an app with `next build` (`scripts/install-test.sh next`).

In a React Router app, `OuroProvider` needs a small adapter, because the router's `Link` takes `to`; [OuroProvider](docs/OuroProvider.md) has both files in full.

`OuroProvider` routes `href`s through `next/link` and groups tooltips. It comes with every component that renders links (`button`, `link`, `card`, `item`, `table` and the navigation components) and with `tooltip`.[^provider-deps] With only other components installed, such as `dialog` above, add it by name (v0.7.0 has no such item: there it comes with every component):[^v0.7.0]

```sh
npx shadcn@latest add ourostack/ouro-ui/lib-ouro-provider#v1.2.5
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

- The CLI reads `registry.json` at this repository's root. A [release](https://github.com/ourostack/ouro-ui/releases) tag such as `#v1.2.5` installs the item and every Ouro dependency (`ouro-lib`, `button` and so on) at that tag.[^release-pins] Without a ref, items come from `main`, which is for contributors: it can hold unreleased changes. A `#<branch>` or `#<sha>` ref pins only the item you name; its Ouro dependencies come from `main`.
- Or add the `@ouro` namespace to `components.json` once, `"registries": { "@ouro": "https://ourostack.github.io/ouro-ui/r/{name}.json" }`, and run `npx shadcn@latest add @ouro/ouro-base @ouro/dialog` (`@ouro/ouro-base` once per app, as above). The namespace serves the newest release, the same code as `#v1.2.5`.[^namespace]
- Components land in `components/ouro/<component>/`, beside shadcn's `components/ui/`, and the helpers they import in `lib/ouro/`, one file each: a component installs only the helpers it imports.[^lands] No component installs `ouro-base`; you add it once, as above.[^ouro-base-only] If you skip it, overlays have no backdrop or motion and fields no border, and in development the first Ouro HX component to mount logs the command to run.[^theme-check]
- `init` is shadcn's: it writes `lib/utils.ts` and adds `cn`, `class-variance-authority`, `lucide-react` and `tw-animate-css`. Ouro HX doesn't use them; keep them for shadcn components. Ouro never writes to `components/ui/`, so don't pass `--overwrite` on a first install.[^not-ui]
- Tests are optional. Each component's Vitest browser tests, type tests, stories and Playwright spec are its `-tests` item, with the tests of everything the component installs[^tests-closure]: `npx shadcn@latest add ourostack/ouro-ui/dialog#v1.2.5 ourostack/ouro-ui/dialog-tests#v1.2.5`. CI verifies 100% line and branch coverage of the installed runtime files for five sets: button, dialog, sheet, the forms set and their union (the [Testing guide](https://ourostack.github.io/ouro-ui/docs/testing/) lists the forms set).[^subsets] Other items receive their full test dependency closure but are not measured individually. `ouro-tests` adds every component with all of its tests in one command.[^ouro-tests] The install message of `ouro-testing` (the test kit the `-tests` items bring) lists the config files to add, then run `npx vitest run`.
- The tests need Vitest 4.1.11 or later in browser mode, Playwright 1.58.1 or later and Storybook 10.2.10 or later.[^minimums] Ouro HX's own CI runs them on Vitest 5 only; Vitest 4 is the stated minimum, not a tested one.[^vitest-5][^minimums] A `-tests` item names those tools without a version, so the CLI installs one only when your app lacks it and never changes a version you have.[^test-versions] v0.7.0's items still carry versions: after `add`, restore every test-tool version you had pinned (`git diff package.json`).[^v0.7.0] [Testing](docs/guides/testing.md) has the requirements, what to do on Vitest 4, and how to find Ouro HX's fields in your own tests.[^testing-guide]
- In a Vite or React Router app the components keep their `"use client";` line, which is harmless there. [Installing](docs/guides/installing.md#vite-and-react-router-apps-the-use-client-notice) says why, and how to drop Rollup's notice about it.
- For the Ouro look, add `ourostack/ouro-ui/ouro-theme#v1.2.5`. Skip it to keep your app's shadcn theme.
- To update to the newest release, list the changed files with `npx shadcn@latest add ourostack/ouro-ui/<item>#v1.2.5 --dry-run` (or `@ouro/<item>`), review each one marked overwrite with `--diff <path>`, then add the item again at the same ref with `--overwrite` (with its `-tests` item if you have it: `add <item> <item>-tests --overwrite`) and reapply your edits. Coming from v0.1.0? Follow [Upgrading from v0.1.0](#upgrading-from-v010) instead.

### Upgrading from v0.1.0

<!-- upgrade:start -->
v0.1.0 installed each component with its tests, and v0.2.0 moves some shared helpers to new files, so update every Ouro component in one go.[^upgrade-v0.1.0][^upgrade-v0.2.0] Run the commands in your app's root, the folder with `components.json`. They find your folders the way shadcn does, from the aliases in `components.json` and the `paths` in your tsconfig (`npx shadcn@latest info` shows them), so they work in a `src/` or an `app/` layout as written.

#### What changed, by version

What an app on v0.1.0 has to know beyond these steps.[^upgrade-test] The release notes list every change.[^upgrade-releases]

- **v0.2.0:** each component's tests became an optional `<name>-tests` item, some helpers moved to new files (step 4), and v0.1.0's self-referential theme lines can go (step 2).[^upgrade-v0.2.0]
- **v0.3.0:** sheets and dialogs stack at `--ouro-layer`, a z-index of 50 by default, instead of level 0, so an app element at z-index 1 to 49 that used to show above an open sheet or dialog now sits under it.[^upgrade-v0.3.0] Raise the token in a `:root` rule of your own if your app has fixed bars above z-50 (see "Theme" in the README), and drop any portal z-index workaround. A controlled `Dialog` opened by a touch or pen tap focuses its popup instead of its first input, and `ConfirmDialog`'s `finalFocus` applies only after a confirmed action; drop workarounds for either. Every coverage hint is `/* istanbul ignore … @preserve */`, so a build plugin that kept the hints can go.[^upgrade-hints] A `-tests` item sets Vitest to `^5`.
- **v0.3.1:** every component starts with `"use client"`, so Next.js App Router pages can render them, and the `@ouro` namespace serves the newest release instead of `main`.[^upgrade-v0.3.1]
- **After v0.7.0:** a required field's `*` is drawn with CSS on a new element around the label and is no longer a `<span data-ouro-required>` inside it, so tests that expected the label text "Email*" now find "Email".[^upgrade-v0.8.0] The clear, show-password and choose-date buttons in TextField and DatePicker are named by hidden text, not `aria-label`, so replace `button[aria-label="…"]` selectors with `[data-ouro-clear]`, `[data-ouro-show-password]` or `[data-ouro-choose-date]`. The same goes for a file's remove button in FileField (`[data-ouro-file-remove]`), Combobox's clear and chip remove buttons (`[data-ouro-combobox-clear]`, `[data-ouro-combobox-chip-remove]`) and NumberField's steppers (`[data-ouro-increment]`, `[data-ouro-decrement]`). A remove button's hidden text holds the file or item name, so a loose `getByText("pasta.png")` now finds it too; pass `{ exact: true }`. `FieldLabel`'s `className` now goes on the new element around the label, which also carries `[data-ouro-required]`, and a group's label `id` is on the inner `<span>`; `style`, `id`, `data-*` and handlers still go on the `<label>`. A numeric `size` on TextField is now a type error and a development warning; set a width with `className="w-40"`. `FormErrors` values are now `ErrorMessages | null | undefined`, so code that reads `errors.email` as `string | string[]` no longer type checks until it handles `null` and React nodes.[^upgrade-v0.8.0] For action answers, import `formErrors` from `@/lib/ouro/form-answer` and pass `errors={formErrors(actionData, actionData?.errors)}` from the initial render; this replaces the unreleased separate `result` prop. It identifies equal new answers while keeping cleared fields masked on pending/client renders and rendering current uncleared messages. Cached/reused answers need `{ key: acceptedAnswerKey }`, changed on actual acceptance, not submit start. Raw records remain compatible but content-only. Reconstruct the value beside Form after JSON/spread/cloning or server-component transport: only messages serialize, not private identity; a safely transported acceptance key can identify the locally reconstructed answer. On a phone, a Link that is not in running text is now a box at least 44px tall and wide that takes its room in the layout, so a column of links grows; pass `inline` to a link in a sentence inside your own `<div>` or `<span>`.[^upgrade-link-box] A Form's top message element exists only while there is a message. Component roots no longer set `m-0`, so a parent's `space-y-*` now spaces them; remove any margin you added to work around that.[^upgrade-v0.8.0]
- **v0.8.0:** no component installs `ouro-base`; add it once (step 1 does), and later adds leave your stylesheet alone.[^upgrade-v0.8.0] A component installs only the helpers it imports, one item per file in `lib/ouro`, and a `-tests` item brings the tests of everything its component installs.[^upgrade-v0.8.0] The `-tests` items no longer set a version for Vitest, Storybook or Playwright.[^upgrade-test-versions] The specs import `test` and `expect` from `e2e/ouro-fixtures.ts`, a file of yours (step 1).[^upgrade-v0.8.0] `lib/ouro/use-dev-warnings.ts` is now `lib/ouro/use-dev-messages.ts` (step 4).[^upgrade-v0.8.0] Earlier releases installed every helper in `lib/ouro` with any component, and an update deletes nothing: audit references before deleting unused historical helpers and their own tests (step 5).[^upgrade-v0.8.0] `OuroProvider` now comes only with the components that render links and with `tooltip`; your copy stays, and a new app adds `lib-ouro-provider` by name.

- **After v0.8.2:** `ouroTestProjects({ page })` also sizes the touch project's Playwright host, preventing Vitest 4 from scaling landscape touch frames.[^upgrade-touch-host] The logical touch viewport still starts at 390x844 with mobile/touch input, but an explicitly enlarged host changes outer-window/screen dimensions and screen orientation; do not treat those as hardware-phone measurements.[^upgrade-touch-host] Without `page`, the touch host stays 390x844.[^upgrade-touch-host] On Vitest 4, retain a host large enough for every requested test viewport, such as the Testing guide's 1600x1200 example.[^upgrade-touch-host]

- **v1.0.0:** the first stable release keeps the component APIs, theme tokens, defaults and test-tool minimums from v0.8.4.[^upgrade-v1.0.0] An app already on v0.8.4 needs no component API migration: review the update with `--dry-run` and `--diff`, then overwrite only the items it already uses and reapply its local edits.[^upgrade-v1.0.0] Runtime components and their optional `-tests` items remain separate; keep your app-owned fixtures and test configuration. Apps on older releases still need the applicable migration steps above and below.

- **After v1.0.2:** sheets, and a Menu shown as a bottom sheet, read their shadow from `--ouro-shadow-sheet-<side>`, and Checkbox's tick draws over `--ouro-duration-draw`, both of which only a fresh `ouro-base` adds (step 1 adds it again); without it a sheet draws no shadow and the tick appears at once.[^upgrade-v1.1.0] Every other shadow reads shadcn's `--shadow-*` tokens, and headings and overlay titles `--font-heading`, so a theme that sets them now restyles Ouro too.[^upgrade-v1.1.0][^upgrade-theme-tokens]

- **After v1.0.1:** `formErrors` now declares its already-frozen message arrays readonly.[^upgrade-v1.0.2] Keep mutable `FormErrors` and `ErrorMessages` for raw builders; annotate returned snapshots as `FormErrorValue` or `ReadonlyFormErrors`, or let their type infer. Form, EditSheet, field `error` props and the normalization helper accept readonly projections. This corrects a false mutation permission, so a snapshot no longer fits a mutable raw-map annotation.[^upgrade-v1.0.2] TypeScript's `Array.isArray` narrows to `any[]` and can bypass readonly; unchanged runtime freezing still rejects container mutation, without deeply freezing React nodes.

- **After v1.2.2:** `Button` accepts `reloadDocument` for a document request through an internal `href`, and its downloads use a plain anchor like `Link`'s.[^upgrade-document-download] A false or null `download` no longer forces document navigation; pass `reloadDocument` when a resource route needs it without a download.[^upgrade-document-download]

- **After v1.2.4:** Select, Menu, Combobox, Popover, Tooltip, HoverCard and NavigationMenu open their popups at the end of `<body>` unless `OuroProvider` is given a `portalContainer`, and in development each warns once when it opens outside every landmark of a page with a `<main>`.[^upgrade-portal-container] To keep popups in a landmark, make `const popups = useRef<HTMLDivElement>(null)`, wrap the app in `<OuroProvider portalContainer={popups}>` and render `<div ref={popups} />` last inside `<main>`, outside any element with a `transform`, `filter` or `contain`, which would clip or move the popups. In a Next.js App Router layout, which is a server component, put the provider and the ref in a small client component. Inside a dialog your app draws itself, wrap its content in `<OuroProvider portalContainer={null}>` so its popups open where Base UI puts them.[^upgrade-portal-null] Dialogs, sheets and toasts still open at the end of `<body>`. The landmark warning goes to `console.warn`, so a test that fails on console output fails until the popups are in a landmark. SidebarLayout's `header` now renders in a `<header>`, the page's banner, so remove a banner your page draws around SidebarLayout.[^upgrade-sidebar-header] The `testing/axe` kit has a new `audit`, which fails every violation at any impact and every result axe could not decide unless it measures it, in both color schemes.[^upgrade-audit] The `ouro-testing` item now names `axe-core` among its devDependencies, so an update adds it to an app that lacks it.[^upgrade-axe-core]

#### 0. Commit first

`--overwrite` replaces every Ouro file, including files you edited.[^upgrade-shadcn-add] Commit before you start. Afterwards, `git diff` shows your own edits being overwritten, so reapply the ones you need.

Review the diff of your Tailwind CSS file too, the one `components.json` names in `tailwind.css`, because step 1 adds `ouro-base`, the one item that writes there, and `shadcn add` rewrites more than Ouro's tokens. It adds `@custom-variant dark (&:is(.dark *));` when the file has no `@custom-variant` (shadcn@4.21.1 does this for any item with theme variables on Tailwind CSS v4), adds the tokens your file lacks to `:root`, `.dark` and `@theme inline` (among them `--input`, `--radius` and the radius scale, if your theme has none), and collapses blank lines.[^upgrade-shadcn-css] Keep the new lines and step 2's deletions, and revert the rest. After this upgrade no component add opens the file again.[^upgrade-v0.8.0]

#### 1. Update every Ouro component, with its tests

Update every Ouro component in your app, not only the items you typed: v0.1.0 added each component's dependencies too, so an app that added only `dialog` also has `button` and `sheet`. Each component is one `.tsx` file in your `components/ouro/` folder (`dialog/` holds `dialog` and `confirm-dialog`, and `text/` holds `text` and `heading`).[^upgrade-v0.1.0] Add each one as `<name>` and `<name>-tests`, plus `ouro-base`, in one command at the same ref, with `--overwrite` (without it the CLI stops to ask about each file). For the app that added only `dialog`, that is `ouro-base button button-tests dialog dialog-tests sheet sheet-tests`. No component installs `ouro-base` any more, so this is where your stylesheet gets the tokens added since v0.1.0.[^upgrade-v0.8.0]

This command finds the components, prints them and adds them. If it finds none, it stops before adding anything[^upgrade-none]; run it in the folder with `components.json`. If you use the Ouro theme, add `ourostack/ouro-ui/ouro-theme#v1.2.5` to the `add` in it.

```sh
( p() { npx shadcn@latest info --json | node -p "JSON.parse(require('fs').readFileSync(0, 'utf8')).config.resolvedPaths.$1"; }; ouro="$(p components)/ouro"; items=$(find "$ouro" -name '*.tsx' ! -name '*-parts.tsx' ! -name '*.test.tsx' ! -name '*.stories.tsx' 2>/dev/null | sed -E 's|.*/(.*)\.tsx$|\1|' | sort); [ -n "$items" ] || { echo "No Ouro components in $ouro. Run this in the folder with components.json." >&2; exit 1; }; echo "Updating: $(echo "$items" | paste -sd " " -)"; npx shadcn@latest add $(echo "$items" | sed -E 's|.*|ourostack/ouro-ui/&#v1.2.5 ourostack/ouro-ui/&-tests#v1.2.5|') ourostack/ouro-ui/ouro-base#v1.2.5 --overwrite )
```

This keeps the tests v0.1.0 installed, deletes none of your files and adds no component you didn't have. shadcn may print `Skipped N files: (files might be identical, use --overwrite to overwrite)` even with `--overwrite`: those files already equal the release's, so nothing was missed.[^upgrade-shadcn-add] The `-tests` items name Vitest, Storybook and Playwright without a version, so the versions in your `package.json` stay as they are. v0.7.0's items still carry versions: after an add at v0.7.0, restore every test-tool version you had pinned (`git diff package.json`): Vitest and its companions, Playwright and Storybook.[^upgrade-v0.7.0] The tests need Vitest 4.1.11 or later, Playwright 1.58.1 or later and Storybook 10.2.10 or later; update those yourself if yours are older (the README's "Details" links the Testing page).[^upgrade-minimums] The specs in `e2e/ouro` now import `test` and `expect` from `e2e/ouro-fixtures.ts`, a file of yours: add it with the one line `export { expect, test } from "@playwright/test";`, or export your own fixtures from it.

#### 2. Remove the self-referential theme lines

v0.1.0 wrote a line into `@theme inline` for each Ouro token that points at itself, such as `--ouro-press-scale: var(--ouro-press-scale);`, and `--color-ouro-backdrop-color: var(--ouro-backdrop-color);`.[^upgrade-self-reference] Delete them from your Tailwind CSS file, the one `components.json` names in `tailwind.css`. The values stay in `:root` and `.dark`. This command finds the file and deletes the lines:

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

Releases before v0.8.0 installed every helper in `lib/ouro` with any component.[^upgrade-v0.8.0] From v0.8.0 a component installs only the helpers it imports, but an update deletes nothing.[^upgrade-v0.8.0] Remove unused historical helpers rather than excluding them from coverage.

Before deleting anything, perform a read-only import/reference audit across the whole app, including scripts, tests, stories and configuration outside `src/`. Use the app's actual tsconfig and bundler aliases to resolve references to each helper's full path. Check relative imports, explicit extensions, re-exports and dynamic imports too; an importing file with the same basename is still a different file. A text search for `lib/ouro/<name>` alone cannot prove a helper is unused.

Delete a helper and its own tests only after verifying that no remaining app file or retained Ouro file references it (references from that helper's own tests do not require keeping an otherwise unused helper). Check again after each removal: another historical helper may have been used only by the one you removed. If a reference is unresolved or you cannot verify a file's use, keep it until you can. Keep `ouro-provider.tsx` if you mean to use it and have not yet, and retain ambient declarations such as `env.d.ts` that the app's type check needs even without an import.

Then type check and build your app. CI runs steps 1 to 3 on a v0.1.0 app, with these commands read from this file (`scripts/install-test.sh upgrade`).[^upgrade-test]

[^upgrade-test]: scripts/install-test.sh; scripts/upgrade-note.mjs verify:testExists(scripts/upgrade-note.test.mjs::the upgrade install test runs the note's commands and copies none) verify:ciJob(install-upgrade)
[^upgrade-releases]: https://github.com/ourostack/ouro-ui/releases; .github/workflows/release.yml; scripts/release-commit.sh verify:urlOk(https://github.com/ourostack/ouro-ui/releases) verify:fileLine(.github/workflows/release.yml, /scripts\/release-commit\.sh "\$VERSION"/) verify:fileLine(scripts/release-commit.sh, /changes\.mjs assemble/)
[^upgrade-v0.1.0]: https://github.com/ourostack/ouro-ui/releases/tag/v0.1.0 verify:urlOk(https://github.com/ourostack/ouro-ui/releases/tag/v0.1.0)
[^upgrade-v0.2.0]: https://github.com/ourostack/ouro-ui/releases/tag/v0.2.0 verify:urlOk(https://github.com/ourostack/ouro-ui/releases/tag/v0.2.0)
[^upgrade-v0.3.0]: https://github.com/ourostack/ouro-ui/releases/tag/v0.3.0 verify:urlOk(https://github.com/ourostack/ouro-ui/releases/tag/v0.3.0) verify:fileLine(registry/ouro/theme/ouro-base.css, /--ouro-layer: 50;/)
[^upgrade-v0.3.1]: https://github.com/ourostack/ouro-ui/releases/tag/v0.3.1 verify:urlOk(https://github.com/ourostack/ouro-ui/releases/tag/v0.3.1)
[^upgrade-v0.7.0]: https://github.com/ourostack/ouro-ui/releases/tag/v0.7.0 verify:urlOk(https://github.com/ourostack/ouro-ui/releases/tag/v0.7.0)
[^upgrade-v0.8.0]: https://github.com/ourostack/ouro-ui/releases/tag/v0.8.0 verify:urlOk(https://github.com/ourostack/ouro-ui/releases/tag/v0.8.0) verify:testExists(scripts/registry.test.mjs::only ouro-base and ouro-theme touch the app's stylesheet, and no other item installs them) verify:testExists(scripts/registry.test.mjs::each lib helper is its own item, so an item installs only the helpers it imports)
[^upgrade-v1.0.0]: https://github.com/ourostack/ouro-ui/releases/tag/v1.0.0 verify:urlOk(https://github.com/ourostack/ouro-ui/releases/tag/v1.0.0)
[^upgrade-v1.0.2]: https://github.com/ourostack/ouro-ui/releases/tag/v1.0.2 verify:urlOk(https://github.com/ourostack/ouro-ui/releases/tag/v1.0.2) verify:fileLine(registry/ouro/lib/ouro/form-answer.ts, /Snapshot arrays are readonly/)
[^upgrade-v1.1.0]: https://github.com/ourostack/ouro-ui/releases/tag/v1.1.0 verify:urlOk(https://github.com/ourostack/ouro-ui/releases/tag/v1.1.0) verify:fileLine(registry/ouro/theme/ouro-base.css, /--ouro-shadow-sheet-/) verify:fileLine(registry/ouro/theme/ouro-base.css, /--ouro-duration-draw:/)
[^upgrade-document-download]: https://github.com/ourostack/ouro-ui/releases/tag/v1.2.2; registry/ouro/components/ouro/button/button.test.tsx; registry/ouro/components/ouro/link/link.test.tsx verify:urlOk(https://github.com/ourostack/ouro-ui/releases/tag/v1.2.2) verify:testExists(registry/ouro/components/ouro/button/button.test.tsx::link branch > uses the document for reloadDocument and downloads, retaining router navigation otherwise) verify:testExists(registry/ouro/components/ouro/link/link.test.tsx::Link > treats only a present download as document navigation, including an empty filename)
[^upgrade-hints]: scripts/source-rules.mjs verify:testExists(scripts/source-rules.test.mjs::every istanbul hint in registry/ carries @preserve, so it survives esbuild in an app)
[^upgrade-link-box]: registry/ouro/components/ouro/link/link.touch.test.tsx verify:testExists(registry/ouro/components/ouro/link/link.touch.test.tsx::gives a link on its own line a 44px box, centred on its text)
[^upgrade-touch-host]: registry/ouro/lib/ouro/testing/vitest.ts; https://github.com/ourostack/ouro-ui/releases/tag/v0.8.3 verify:urlOk(https://github.com/ourostack/ouro-ui/releases/tag/v0.8.3) verify:testExists(scripts/testing-kit.test.mjs::page sizes every Playwright host while the touch frame keeps its phone viewport and input) verify:testExists(scripts/testing-kit.test.mjs::ouroTestProjects leaves the page size to Vitest unless the app sets one) verify:fileLine(registry/ouro/lib/ouro/testing/vitest.ts, /390x844/) verify:fileLine(docs/guides/testing.md, /1600/)
[^upgrade-theme-tokens]: test/theme-tokens.test.tsx verify:testExists(test/theme-tokens.test.tsx::standard shadow and font tokens > falls back to the inherited font for headings when the theme names none, and Kbd always keeps it)
[^upgrade-shadcn-add]: https://ui.shadcn.com/docs/cli verify:urlOk(https://ui.shadcn.com/docs/cli)
[^upgrade-shadcn-css]: https://github.com/shadcn-ui/ui/blob/3502dbcde11d1eaf967a47ac375744dc336641f3/packages/registry/src/utils/updaters/update-css-vars.ts#L91-L124 verify:urlOk(https://github.com/shadcn-ui/ui/blob/3502dbcde11d1eaf967a47ac375744dc336641f3/packages/registry/src/utils/updaters/update-css-vars.ts#L91-L124) verify:testExists(scripts/install-check.test.mjs::a complete install passes, for each variant and stage)
[^upgrade-minimums]: scripts/registry.mts verify:fileLine(scripts/registry.mts, /vitest: "4\.1\.11"/) verify:fileLine(scripts/registry.mts, /playwright: "1\.58\.1"/) verify:fileLine(scripts/registry.mts, /storybook: "10\.2\.10"/)
[^upgrade-self-reference]: https://github.com/ourostack/ouro-ui/releases/tag/v0.2.0; scripts/install-check.mjs verify:urlOk(https://github.com/ourostack/ouro-ui/releases/tag/v0.2.0) verify:testExists(scripts/install-check.test.mjs::a token that refers to itself fails)
[^upgrade-test-versions]: test:scripts/registry.test.mjs::devDependencies are named without a version, so the CLI installs it only when the app lacks it and never changes a version the app has verify:testExists(scripts/registry.test.mjs::devDependencies are named without a version, so the CLI installs it only when the app lacks it and never changes a version the app has)
[^upgrade-none]: UPGRADING.md verify:fileLine(UPGRADING.md, /\[ -n "\$items" \] \|\| \{ echo "No Ouro components/)
[^upgrade-portal-container]: registry/ouro/lib/ouro/portal-container.test.tsx verify:testExists(registry/ouro/lib/ouro/portal-container.test.tsx::usePortalContainer > leaves a popup at the end of <body>, Base UI's default, without a portalContainer) verify:testExists(registry/ouro/lib/ouro/portal-container.test.tsx::usePortalContainer > warns once, in development, when a popup opens outside every landmark of a page that has a main)
[^upgrade-portal-null]: registry/ouro/lib/ouro/portal-container.test.tsx verify:testExists(registry/ouro/lib/ouro/portal-container.test.tsx::usePortalContainer > gives popups Base UI's own place again inside an OuroProvider whose portalContainer is null, as an app's own dialog needs)
[^upgrade-sidebar-header]: registry/ouro/components/ouro/sidebar/sidebar-layout.test.tsx verify:testExists(registry/ouro/components/ouro/sidebar/sidebar-layout.test.tsx::SidebarLayout > puts the header in the page's banner landmark, and draws no empty landmark without one)
[^upgrade-audit]: registry/ouro/lib/ouro/testing/axe.test.ts verify:testExists(registry/ouro/lib/ouro/testing/axe.test.ts::audit > fails a violation whatever its impact: content outside every landmark is only moderate)
[^upgrade-axe-core]: scripts/registry.test.mjs verify:testExists(scripts/registry.test.mjs::npm dependencies are pinned to the ranges this repository tests)
<!-- upgrade:end -->

### Items

<!-- items:start -->
<!-- Generated by scripts/gen-docs.mts from the JSDoc in registry/. Do not edit; run `pnpm run docs`. -->

Components: `button`, `text`, `heading`, `sheet`, `dialog`, `confirm-dialog`, `field`, `fieldset`, `link`, `text-field`, `text-area`, `checkbox`, `checkbox-group`, `radio-group`, `switch`, `form`, `edit-sheet`, `select`, `native-select`, `number-field`, `slider`, `combobox`, `toaster`, `spinner`, `progress`, `skeleton`, `avatar`, `badge`, `alert`, `separator`, `kbd`, `popover`, `tooltip`, `hover-card`, `menu`, `command`, `tabs`, `segmented-control`, `accordion`, `collapsible`, `show-more`, `card`, `item`, `item-group`, `empty`, `scroll-area`, `aspect-ratio`, `stack`, `row`, `navbar`, `sidebar`, `sidebar-layout`, `stacked-layout`, `auth-layout`, `breadcrumb`, `pagination`, `navigation-menu`, `table`, `description-list`, `toggle`, `toggle-group`, `button-group`, `otp-field`, `file-field`, `color-field`, `swipe-actions`, `reorderable`, `calendar`, `date-picker`, `carousel`, `resizable`, `chart`, `message`, `message-list`, `attachment`, `checklist`, `inspector`, `skip-link`, `tab-bar`, `route-progress`, `color-scheme-toggle`, `page-header`, `copy-button`, `code-block`, `timer`, `timer-tray`, `celebrate`, `choice-card`, `image-cropper`, `image-field`, `share-button`, `sync-status`, `local-date`, `relative-time`, `install-prompt`, `conversation-list`, `attention-card`, `reaction-bar`.

Each component has an optional `<name>-tests` item (`button-tests`) with its Vitest browser tests, type tests, stories and Playwright spec; it also installs the tests of everything the component installs. `ouro-tests` adds every component with all of its tests, and `ouro-testing` is the test kit the `-tests` items bring.

Once per app: `ouro-base`, the tokens every component needs in your stylesheet. Optional: `ouro-theme`, the Ouro look.

Guardrails, optional: `ouro-census`, which holds the pages and states your journeys list to a baseline of their visible controls, and `ouro-source-rules`, which finds the controls your source still builds by hand ([Guardrails guide](https://ourostack.github.io/ouro-ui/docs/guardrails/)).

Helpers, one item per file in `lib/ouro`, each installed with the components that import it (you don't add them by name; `ouro-lib` is all of them, and a helper with tests has a `<name>-tests` item): `lib-announce`, `lib-appearance-hints`, `lib-claims`, `lib-class-name-check`, `lib-cn`, `lib-color-scheme`, `lib-color-scheme-script`, `lib-control-ref`, `lib-current-path`, `lib-dev`, `lib-env`, `lib-feedback`, `lib-floating`, `lib-focus-handoff`, `lib-form-answer`, `lib-key-shortcuts`, `lib-last-input`, `lib-open-mode`, `lib-ouro-provider`, `lib-portal-container`, `lib-refs`, `lib-router-link`, `lib-server-element`, `lib-share`, `lib-spring`, `lib-stretched-link`, `lib-toast`, `lib-tones`, `lib-touch-target`, `lib-use-backdrop-anchor`, `lib-use-command-shortcut`, `lib-use-dev-messages`, `lib-use-drag`, `lib-use-field`, `lib-use-install-prompt`, `lib-use-keyboard-scrollable`, `lib-use-media-query`, `lib-use-ouro`, `lib-use-sheet-presentation`, `lib-use-timer`. No component imports `lib-claims`: add it by name to mark your own copy's claims with `claim()`.
<!-- items:end -->

## For agents

Each component has a page in `docs/` with its purpose, an example, every prop, its modes and what to use instead.[^docs-pages] The same text is in the JSDoc, so your editor shows it on hover.

- **Props first.** A component's props describe the whole thing. Parts (`dialog-parts`, `sheet-parts`) are an escape hatch, only for layouts the props cannot express.
- **What a component needs is required.** A Dialog or Sheet needs a `title`; hide it with `hideTitle`.
- **Appearance comes from named props**: `tone` (`primary`, `secondary`, `destructive`, `success`, `warning`, named after the theme variables they read, with shadcn's meaning), `variant` and `size`, in place of color names.
- **`className` is for layout only**: margins, width and grid placement. Components merge your `className` with `cn`, where a later class wins.[^cn-wins] Appearance classes (`bg-*`, `text-<color>`, `rounded-*`, `font-*`, `dark:*`…) warn in development with the prop to use instead.
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
- **canShare** — Whether the browser has a share sheet for this data: most phones and Safari do, most desktop browsers do not. [Docs](docs/canShare.md)
- **colorSchemeScript** — The script that sets the page's color scheme before it paints, so a reload in dark mode never flashes light. [Docs](docs/colorSchemeScript.md)
- **ColorSchemeToggle** — The control that switches the app between light, dark and the system's scheme, and keeps the choice. [Docs](docs/ColorSchemeToggle.md)
- **CopyButton** — A button that puts a piece of text on the clipboard: an API key, a link, a command. [Docs](docs/CopyButton.md)
- **copyText** — Puts text on the clipboard: through the Clipboard API, or a text selection where the page may not use it (plain http, an older browser). [Docs](docs/copyText.md)
- **share** — Shares a link through the system's share sheet, or copies it where there is none, and says which happened. [Docs](docs/share.md)
- **ShareButton** — A button that shares a link: through the system's share sheet where there is one (phones, Safari), and by copying it where there is not, when it says "Link copied" for two seconds and screen readers hear it once. [Docs](docs/ShareButton.md)
- **Toggle** — A button that stays pressed until it is pressed again, such as Bold in a text toolbar. [Docs](docs/Toggle.md)
- **ToggleGroup** — A row of related toggles that share one value, such as text alignment or bold, italic and underline in a toolbar. [Docs](docs/ToggleGroup.md)
- **useColorScheme** — The person's color scheme, the scheme the page shows, and the setter that changes both, for a control of your own. [Docs](docs/useColorScheme.md)

### Text

- **claim** — Marks a sentence of copy as a claim, with the primary source it comes from and a check that it still holds. [Docs](docs/claim.md)
- **Heading** — A section title, `<h1>` to `<h6>`, in the theme's foreground color. [Docs](docs/Heading.md)
- **Kbd** — A keyboard shortcut, in the reader's platform's notation: `keys={["mod", "k"]}` shows ⌘K on a Mac, iPhone or iPad and Ctrl+K elsewhere. [Docs](docs/Kbd.md)
- **Link** — A text link that navigates through your router. [Docs](docs/Link.md)
- **LocalDate** — A date (and time) in the reader's own time zone and language, in a `<time>` that carries the exact instant. [Docs](docs/LocalDate.md)
- **RelativeTime** — How long ago (or how soon) something happens, in the reader's language: "3 days ago", "yesterday", "in 5 minutes", "now", kept current while it shows. [Docs](docs/RelativeTime.md)
- **Text** — Body text in the theme's type scale and colors. [Docs](docs/Text.md)

### Forms

- **Calendar** — A month grid to pick a day or a range of days, with the arrow keys or a press. [Docs](docs/Calendar.md)
- **Checkbox** — A labeled checkbox on the Field contract, with the label to its right: pass `label`, and `checked` with `onCheckedChange` (or `defaultChecked`). [Docs](docs/Checkbox.md)
- **CheckboxGroup** — A group of checkboxes under one legend, on the Field contract, for picking any number of choices: pass `legend`, and `options` (or `Checkbox` children). [Docs](docs/CheckboxGroup.md)
- **ChoiceCard** — A set of choices shown as cards, each with a picture, a label and a line of description, for picking exactly one: a cover photo, a plan, a layout. [Docs](docs/ChoiceCard.md)
- **ColorField** — A color on the Field contract: a swatch that opens the system color picker, next to the same color as hex text, kept in step both ways. [Docs](docs/ColorField.md)
- **Combobox** — A text input that filters a list of items as people type, on the Field contract: pass `label`, `items`, and `error` from your server action or client check. [Docs](docs/Combobox.md)
- **DatePicker** — A labeled date field. [Docs](docs/DatePicker.md)
- **Field** — A labeled form control: the label, an optional description, the control and its error, wired together with ids that match between the server and the browser. [Docs](docs/Field.md)
- **Fieldset** — A titled group of related fields, such as an address, rendered as a `<fieldset>` named by its legend. [Docs](docs/Fieldset.md)
- **FileField** — A labeled file input with a drop zone, on the Field contract. [Docs](docs/FileField.md)
- **Form** — A form that validates with the browser's own constraints (`required`, `type="email"`, `pattern`) and shows server errors on the matching fields. [Docs](docs/Form.md)
- **ImageCropper** — A dialog for cropping a photo to a shape before it is used: drag the photo (or move it the way the arrow keys point) to choose what shows in the frame, zoom with the slider (or Plus and Minus), and Save hands the cropped image to `onCrop` as a `File`, ready for a form or an upload. [Docs](docs/ImageCropper.md)
- **ImageField** — A field for one photo, shown large: the photo already saved (`src`) or the one just chosen, with Choose photo (Change photo once one shows) and Remove. [Docs](docs/ImageField.md)
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

- **buzz** — Vibrates the device in a short alert pattern, where it can (most Android phones; not iOS or desktops). [Docs](docs/buzz.md)
- **Celebrate** — A small moment of celebration for something the person finished: confetti bursts from a badge with the message ("List cleared") and screen readers hear the message once. [Docs](docs/Celebrate.md)
- **chime** — Plays a short alert, three soft tones, for something that just finished: a timer at zero. [Docs](docs/chime.md)
- **createChimeContext** — Makes an audio context for `chime`, or returns `null` where the browser has no Web Audio. [Docs](docs/createChimeContext.md)
- **formatDuration** — Seconds as a clock reads them: `9:05`, or `1:02:03` from an hour up. [Docs](docs/formatDuration.md)
- **InstallPrompt** — A quiet offer to install the web app, shown only where the browser can install it (Chromium on Android and desktops), never while it already runs installed, and not again for two weeks after Not now. [Docs](docs/InstallPrompt.md)
- **Progress** — A bar that shows how far along a task is, or that it is under way when you can't tell. [Docs](docs/Progress.md)
- **resetTimer** — Cancels or dismisses a timer by its timerId, including when its screen is not mounted. [Docs](docs/resetTimer.md)
- **restoreTimer** — Imports a saved countdown, leaving an existing native timer intact. [Docs](docs/restoreTimer.md)
- **RouteProgress** — The thin bar across the top of the screen while the app loads the next page or submits a form, so a click that waits on the server never feels frozen: one global affordance instead of a pending state on every action. [Docs](docs/RouteProgress.md)
- **Spinner** — A spinning ring that says something is loading. [Docs](docs/Spinner.md)
- **SyncStatus** — One line that says where the person's changes are: Saved, Saving…, Offline (kept on this device) or Couldn't save, each with its icon, and Retry while there is a problem. [Docs](docs/SyncStatus.md)
- **Timer** — A countdown timer with its own controls: the time left in large numbers, Start, then Pause and Cancel, Resume when paused, and at zero "Time's up" with Dismiss and Restart. [Docs](docs/Timer.md)
- **TimerTray** — The timers that are running, paused or finished, in one strip, so a person who leaves a timer's screen can still see it count down, hear it at zero, and stop it. [Docs](docs/TimerTray.md)
- **toast** — Shows a toast: a short message that appears at the bottom of the screen, is read to screen readers once, and dismisses itself. [Docs](docs/toast.md)
- **Toaster** — Shows the toasts you send with `toast("Saved")` from `@/lib/ouro/toast`: render it once, at the root of your app, inside `OuroProvider` if you use one, or alone. [Docs](docs/Toaster.md)
- **useInstallPrompt** — Whether the browser offers to install this web app, and the means to offer it at a good moment rather than when the browser chooses: `install()` opens the browser's own install dialog, `dismiss()` puts the offer away for two weeks. [Docs](docs/useInstallPrompt.md)
- **useTimer** — A countdown timer that keeps time by the clock, not by ticks, so it stays right in a background tab, across a reload (with `timerId`) and when the screen sleeps. [Docs](docs/useTimer.md)

### Display

- **Alert** — An inline message in the page: something saved, something failed, something to know before going on. [Docs](docs/Alert.md)
- **Avatar** — A person's picture, or their initials until it loads or when it fails. [Docs](docs/Avatar.md)
- **AvatarGroup** — Avatars stacked with a slight overlap, such as the cooks on a recipe, with a "+N" count after `max`. [Docs](docs/AvatarGroup.md)
- **Badge** — A short label for a status, category or count: "Draft", "Vegan", "3". [Docs](docs/Badge.md)
- **Card** — A surface that groups one thing's content: a media slot across the top, a title with a description and an action, a body, and a footer. [Docs](docs/Card.md)
- **Carousel** — A row of slides the user swipes or steps through with Previous and Next buttons: recipe photos, a few featured cards. [Docs](docs/Carousel.md)
- **CodeBlock** — Code or a command on a muted surface in the theme's monospace font, with a caption and a button that copies it. [Docs](docs/CodeBlock.md)
- **DescriptionList** — One thing's details as pairs of a term and its value: a recipe's prep time and servings, an order's date and total, an account's email. [Docs](docs/DescriptionList.md)
- **Empty** — What a list, search or page shows when it has nothing in it: an icon, a title that says what is empty, a sentence on what to do, and the action that does it. [Docs](docs/Empty.md)
- **Separator** — A thin line in the theme's border color between groups of content, horizontal or vertical. [Docs](docs/Separator.md)
- **Skeleton** — A shimmering placeholder in the shape of content that is still loading. [Docs](docs/Skeleton.md)

### Lists

- **Accordion** — A stack of titles that each open their own content, for FAQs and long settings pages. [Docs](docs/Accordion.md)
- **Checklist** — A list of things to tick off, such as a recipe's ingredients or a shopping list: each row a checkbox the whole row toggles, with an optional value and action. [Docs](docs/Checklist.md)
- **Collapsible** — One section that opens and closes under its title, such as nutrition facts under a recipe. [Docs](docs/Collapsible.md)
- **Item** — One row of a list: leading media, a title with a description, and trailing actions. [Docs](docs/Item.md)
- **ItemGroup** — A list of `Item` rows, with an optional label that names it, lines between the rows, and what to show when it is empty. [Docs](docs/ItemGroup.md)
- **Reorderable** — A list the user puts in order: recipe steps, a queue, favorites. [Docs](docs/Reorderable.md)
- **ShowMore** — "Show more" for a long list or a long text. [Docs](docs/ShowMore.md)
- **SwipeActions** — A list row with actions beside it that a horizontal swipe reveals: swipe toward the start for the `trailing` actions (Delete, Archive), toward the end for the `leading` ones (Pin). [Docs](docs/SwipeActions.md)

### Layout

- **AspectRatio** — A frame that keeps an image, video or map at a fixed shape while its width follows the layout, so the page does not jump when the media loads. [Docs](docs/AspectRatio.md)
- **PageHeader** — The top of a page: its title with an optional line above it (`eyebrow`), a description under it, the page's actions beside it, and a trail and an image above. [Docs](docs/PageHeader.md)
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
- **SkipLink** — The "Skip to main content" link a keyboard or screen-reader user meets first on every page, so one Tab and Enter jump past the header and navigation. [Docs](docs/SkipLink.md)
- **StackedLayout** — The shell of an app with a `Navbar`: the bar across the top, in view while the page scrolls, and the page below it in a centered column. [Docs](docs/StackedLayout.md)
- **TabBar** — The bar of tabs at the bottom of a phone screen: two to five of the app's top-level pages, each an icon over a short label, with the current page marked `aria-current="page"` and an accent wash. [Docs](docs/TabBar.md)
- **Tabs** — Tabs that switch between panels in place: an accessible tab list with roving focus, arrow-key navigation, a line that slides to the selected tab, and 44px tabs on touch screens. [Docs](docs/Tabs.md)

### Data

- **Chart** — A chart drawn in the theme's colors, which people can use without seeing it: a figure named by its `title`, a summary for screen readers, and a table of every value (visible with `showTable`). [Docs](docs/Chart.md)
- **ChartContainer** — shadcn's name for `Chart`: the same component with the same props, so code ported from shadcn's chart docs finds it. [Docs](docs/ChartContainer.md)
- **ChartLegend** — The legend for a recharts chart inside `Chart`: each series' marker shape and label from the chart's `config`, under the plot. [Docs](docs/ChartLegend.md)
- **ChartTooltip** — The tooltip for a recharts chart inside `Chart`: the category, then each series' marker, label and value from the chart's `config`, in the theme's popover colors. [Docs](docs/ChartTooltip.md)
- **Table** — A data table: a caption, column headers, and rows, from `columns` and `rows` or from parts. [Docs](docs/Table.md)

### Chat

- **Attachment** — A file attached to a chat message, or waiting to be sent with one: its icon, name and size. [Docs](docs/Attachment.md)
- **AttentionCard** — Something that waits on the person: a mention, a question asked of them or a request still unanswered. [Docs](docs/AttentionCard.md)
- **ConversationList** — A list of conversations to choose from: each row shows the avatar, the title, when the latest message arrived and a line of it, and marks unread conversations with a bold title and a dot. [Docs](docs/ConversationList.md)
- **Message** — One message in a chat: who wrote it, their avatar and what they wrote, with any attachments under it. [Docs](docs/Message.md)
- **MessageList** — A conversation: `Message`s in a scrolling, labeled region that opens at the newest one. [Docs](docs/MessageList.md)
- **ReactionBar** — A message's reactions: each one's emoji and how many chose it, with the person's own pressed and tinted, and quick reactions to add with a single press. [Docs](docs/ReactionBar.md)

### App setup

- **ColorSchemeProvider** — Keeps the page's color scheme: it applies the person's choice (`light`, `dark` or `system`) as the `.dark` class on `<html>`, which is how shadcn themes switch, keeps it in `localStorage`, and follows the system's setting live while the choice is `system`. [Docs](docs/ColorSchemeProvider.md)
- **Inspector** — X-ray for a page built with Ouro HX: outlines every Ouro component on the page with its name, linked to its docs, and lists them all for keyboard and screen reader users. [Docs](docs/Inspector.md)
- **OuroProvider** — Optional app-level provider that routes internal `href`s through your router's link and groups tooltips: once one `Tooltip` shows, its neighbours open instantly instead of each waiting its own delay. [Docs](docs/OuroProvider.md)

### Parts

- **Parts** — building blocks for Checklist, Dialog, Field, Popover, Select, Sheet, Table and Tabs, only for layouts the props cannot express. [Docs](docs/parts.md)
<!-- catalog:end -->

## Theme

Ouro HX ships its stylesheets as registry items that write into your app's CSS:

- `ouro-base` (`registry/ouro/theme/ouro-base.css`) is required in every app: add it once, before your first component.[^ouro-base-required] No component installs it, so it is the only add that writes to your stylesheet.[^ouro-base-only] It adds what shadcn's themes lack: `--success`, `--warning` and their foregrounds, and `--destructive-foreground`, with defaults that pass 4.5:1 on shadcn's stock themes[^stock-contrast]; the motion tokens (`--ouro-spring-duration`, `--ouro-ease-spring` and the other `--ouro-*` values); the `press` transition; and the spinner keyframes.[^ouro-base-contents] For a theme that has neither, it also adds `--input`, the border color of every field, and `--radius` with its scale, at shadcn's stock values; a theme that has them keeps its own.[^field-tokens]
- `ouro-theme` (`registry/ouro/theme/ouro-theme.css`) is optional: the Ouro color look as a shadcn theme, light values on `:root` and dark values on `.dark`. An app that already has a shadcn theme keeps its own.

Dark mode follows the `.dark` class, as in shadcn. To change a color, set its variable in your theme.

To change any `--ouro-*` token (the spring and durations, `--ouro-press-scale`, the backdrop color and opacity, `--ouro-layer`), set it in a `:root` or `.dark` rule of your own after the Ouro tokens, outside any `@layer`, such as `:root { --ouro-press-scale: 0.98; }` at the end of your CSS file. A rule of your own survives adding `ouro-base` again, which rewrites the lines it wrote.

Sheets and dialogs stack at `--ouro-layer`, a z-index of 50 by default, the level of the Base UI dialog of shadcn@4.21.1.[^ouro-layer] If your app has fixed bars above z-50, raise it the same way, such as `:root { --ouro-layer: 60; }`; no class edit is needed. At an equal z-index the open sheet or dialog still wins, because its portal is the last child of `<body>`.

## License

MIT

[^tailwind-4]: test/install-fixture/package.json verify:fileLine(test/install-fixture/package.json, /"tailwindcss": "\^4\./) verify:ciJob(install)
[^runtime-deps]: package.json; registry.json verify:fileLine(test/install-fixture/package.json, /"react": "\^19\./) verify:fileLine(registry.json, /"@base-ui\/react@/) verify:testExists(scripts/registry.test.mjs::npm dependencies are pinned to the ranges this repository tests)
[^ouro-base-only]: scripts/registry.mts verify:testExists(scripts/registry.test.mjs::only ouro-base and ouro-theme touch the app's stylesheet, and no other item installs them)
[^v0.8.0]: https://github.com/ourostack/ouro-ui/releases/tag/v0.8.0 verify:urlOk(https://github.com/ourostack/ouro-ui/releases/tag/v0.8.0) verify:fileLine(UPGRADING.md, /\*\*v0\.8\.0:\*\* no component installs `ouro-base`/)
[^v0.7.0]: https://github.com/ourostack/ouro-ui/releases/tag/v0.7.0 verify:urlOk(https://github.com/ourostack/ouro-ui/releases/tag/v0.7.0)
[^provider-deps]: scripts/registry.mts verify:testExists(scripts/registry.test.mjs::a component that renders links brings OuroProvider, which only the app imports) verify:fileLine(scripts/registry.mts, /entry\.name === "lib-router-link" \|\| entry\.name === "tooltip"/)
[^release-pins]: scripts/registry.mts verify:testExists(scripts/registry.test.mjs::--release pins every same-repo dependency to the release tag and records the version)
[^namespace]: .github/workflows/pages.yml verify:testExists(scripts/workflows.test.mjs::Pages names GitHub's newest release before it builds, whatever main's package.json says)
[^tests-closure]: scripts/registry.mts verify:testExists(scripts/registry.test.mjs::a -tests item installs the tests of every item it installs: link-tests brings text-tests)
[^subsets]: scripts/subset-coverage.mjs verify:testExists(scripts/subset-coverage.test.mjs::CI checks the button, the dialog, the sheet and the forms set, each alone and together) verify:fileLine(.github/workflows/ci.yml, /node scripts\/subset-coverage\.mjs/)
[^ouro-tests]: scripts/registry.mts verify:testExists(scripts/registry.test.mjs::ouro-tests installs every -tests item: the whole suite in one command)
[^minimums]: scripts/registry.mts verify:fileLine(scripts/registry.mts, /vitest: "4\.1\.11"/) verify:fileLine(scripts/registry.mts, /playwright: "1\.58\.1"/) verify:fileLine(scripts/registry.mts, /storybook: "10\.2\.10"/)
[^vitest-5]: package.json verify:fileLine(package.json, /"vitest": "5\./) verify:fileLine(.github/workflows/ci.yml, /pnpm test/)
[^testing-guide]: docs/guides/testing.md verify:fileLine(docs/guides/testing.md, /Vitest 4/)
[^docs-pages]: scripts/gen-docs.mts verify:testExists(scripts/gen-docs.test.mjs::a component doc has purpose, import, example, props, and use-instead guidance) verify:testExists(scripts/gen-docs.test.mjs::there is one doc per component, plus parts)
[^ouro-base-required]: registry/ouro/lib/ouro/dev.ts verify:testExists(scripts/readme-steps.test.mjs::every published first-install command through @ouro adds ouro-base, which no component brings) verify:fileLine(registry/ouro/lib/ouro/dev.ts, /ouro-layer/)
[^stock-contrast]: test/stock-theme.test.tsx; test/shadcn-stock.css verify:fileLine(test/stock-theme.test.tsx, /4\.5/) verify:ciJob(ci)
[^ouro-base-contents]: registry/ouro/theme/ouro-base.css verify:fileLine(registry/ouro/theme/ouro-base.css, /--success:/) verify:fileLine(registry/ouro/theme/ouro-base.css, /--destructive-foreground:/) verify:fileLine(registry/ouro/theme/ouro-base.css, /--ouro-ease-spring:/) verify:fileLine(registry/ouro/theme/ouro-base.css, /@keyframes ouro-spin/)
[^field-tokens]: registry/ouro/theme/ouro-base.css verify:testExists(scripts/install-check.test.mjs::an install whose stylesheet lacks the field border color or the radius scale fails) verify:testExists(scripts/install-check.test.mjs::stripFieldTokens removes --input, --radius and their @theme mappings, and nothing else)
[^ouro-layer]: registry/ouro/theme/ouro-base.css; https://github.com/shadcn-ui/ui/blob/3502dbcde11d1eaf967a47ac375744dc336641f3/apps/v4/registry/bases/base/ui/dialog.tsx#L33-L53; scripts/install-test.sh verify:fileLine(registry/ouro/theme/ouro-base.css, /--ouro-layer: 50;/) verify:urlOk(https://github.com/shadcn-ui/ui/blob/3502dbcde11d1eaf967a47ac375744dc336641f3/apps/v4/registry/bases/base/ui/dialog.tsx#L33-L53) verify:fileLine(scripts/install-test.sh, /grep -c 'z-50' src.components.ui.dialog.tsx/) verify:ciJob(ci.yml#install)
[^no-motion]: test:scripts/registry.test.mjs::npm dependencies are pinned to the ranges this repository tests verify:testExists(scripts/registry.test.mjs::npm dependencies are pinned to the ranges this repository tests)
[^reduced-motion]: test:scripts/motion-coverage.test.mjs::a motion state with no reduced-motion record for a part fails, even when that part's reduced list is empty; .github/workflows/ci.yml verify:testExists(scripts/motion-coverage.test.mjs::a motion state with no reduced-motion record for a part fails, even when that part's reduced list is empty) verify:ciJob(ci.yml#motion-coverage)
[^lands]: test:scripts/registry.test.mjs::helpers land in lib/ouro and the test kit in lib/ouro/testing and e2e/ouro; test:scripts/registry.test.mjs::each lib helper is its own item, so an item installs only the helpers it imports verify:testExists(scripts/registry.test.mjs::helpers land in lib/ouro and the test kit in lib/ouro/testing and e2e/ouro) verify:testExists(scripts/registry.test.mjs::each lib helper is its own item, so an item installs only the helpers it imports)
[^theme-check]: test:registry/ouro/lib/ouro/dev.test.ts::checkTheme > names the command that adds ouro-base, once per page, when the token is unset verify:testExists(registry/ouro/lib/ouro/dev.test.ts::checkTheme > names the command that adds ouro-base, once per page, when the token is unset)
[^not-ui]: scripts/install-check.mjs; .github/workflows/ci.yml verify:fileLine(scripts/install-check.mjs, /an Ouro item landed in components\/ui/) verify:ciJob(ci.yml#install)
[^test-versions]: test:scripts/registry.test.mjs::devDependencies are named without a version, so the CLI installs it only when the app lacks it and never changes a version the app has verify:testExists(scripts/registry.test.mjs::devDependencies are named without a version, so the CLI installs it only when the app lacks it and never changes a version the app has)
[^cn-wins]: test:registry/ouro/lib/ouro/cn.test.ts::lets a later class win over an earlier one that sets the same property verify:testExists(registry/ouro/lib/ouro/cn.test.ts::lets a later class win over an earlier one that sets the same property)
