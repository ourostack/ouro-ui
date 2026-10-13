# Upgrading from v0.1.0

> **Reading this file on GitHub?** Replace each `{{latestRelease}}` below with the newest release tag, the `#v…` ref in the README's install command. The README, the site's Updating page and the release notes show this note with the tag filled in.

v0.1.0 installed each component with its tests, and v0.2.0 moves some shared helpers to new files, so update every Ouro component in one go. Run the commands in your app's root, the folder with `components.json`. They find your folders the way shadcn does, from the aliases in `components.json` and the `paths` in your tsconfig (`npx shadcn@latest info` shows them), so they work in a `src/` or an `app/` layout as written.

#### What changed, by version

What an app on v0.1.0 has to know beyond these steps. The release notes list every change.

- **v0.2.0:** each component's tests became an optional `<name>-tests` item, some helpers moved to new files (step 4), and v0.1.0's self-referential theme lines can go (step 2).
- **v0.3.0:** sheets and dialogs stack at `--ouro-layer`, a z-index of 50 by default, instead of level 0, so an app element at z-index 1 to 49 that used to show above an open sheet or dialog now sits under it. Raise the token in a `:root` rule of your own if your app has fixed bars above z-50 (see "Theme" in the README), and drop any portal z-index workaround. A controlled `Dialog` opened by a touch or pen tap focuses its popup instead of its first input, and `ConfirmDialog`'s `finalFocus` applies only after a confirmed action; drop workarounds for either. Every coverage hint is `/* istanbul ignore … @preserve */`, so a build plugin that kept the hints can go. A `-tests` item sets Vitest to `^5`.
- **v0.3.1:** every component starts with `"use client"`, so Next.js App Router pages can render them, and the `@ouro` namespace serves the newest release instead of `main`.
- **After v0.7.0:** a required field's `*` is drawn with CSS on a new element around the label and is no longer a `<span data-ouro-required>` inside it, so tests that expected the label text "Email*" now find "Email". The clear, show-password and choose-date buttons in TextField and DatePicker are named by hidden text, not `aria-label`, so replace `button[aria-label="…"]` selectors with `[data-ouro-clear]`, `[data-ouro-show-password]` or `[data-ouro-choose-date]`. The same goes for a file's remove button in FileField (`[data-ouro-file-remove]`), Combobox's clear and chip remove buttons (`[data-ouro-combobox-clear]`, `[data-ouro-combobox-chip-remove]`) and NumberField's steppers (`[data-ouro-increment]`, `[data-ouro-decrement]`). A remove button's hidden text holds the file or item name, so a loose `getByText("pasta.png")` now finds it too; pass `{ exact: true }`. `FieldLabel`'s `className` now goes on the new element around the label, which also carries `[data-ouro-required]`, and a group's label `id` is on the inner `<span>`; `style`, `id`, `data-*` and handlers still go on the `<label>`. A numeric `size` on TextField is now a type error and a development warning; set a width with `className="w-40"`. `FormErrors` values are now `ErrorMessages | null | undefined`, so code that reads `errors.email` as `string | string[]` no longer type checks until it handles `null` and React nodes. Pass `result={actionData}` to a Form whose errors come from a server action, so an answer equal to the last one shows its messages again. On a phone, a Link that is not in running text is now a 44px-tall box that takes its room in the layout, so a column of links grows; pass `inline` to a link in a sentence inside your own `<div>` or `<span>`. A Form's top message element exists only while there is a message. Component roots no longer set `m-0`, so a parent's `space-y-*` now spaces them; remove any margin you added to work around that.

#### 0. Commit first

`--overwrite` replaces every Ouro file, including files you edited. Commit before you start. Afterwards, `git diff` shows your own edits being overwritten, so reapply the ones you need.

Review the diff of your Tailwind CSS file too, the one `components.json` names in `tailwind.css`, because `shadcn add` rewrites more than Ouro's tokens there. It adds `@custom-variant dark (&:is(.dark *));` when the file has no `@custom-variant` (shadcn does this for any item with theme variables on Tailwind CSS v4, and it overrides a `darkMode` setting in a Tailwind config), re-adds Ouro's color defaults to `:root` and `.dark`, re-indents lines and can drop the final newline. Keep only the new `--ouro-*` lines and step 2's deletions, and revert the rest. Do the same for `package.json`: see "Details" in the README for keeping your test-tool pins.

#### 1. Update every Ouro component, with its tests

Update every Ouro component in your app, not only the items you typed: v0.1.0 added each component's dependencies too, so an app that added only `dialog` also has `button` and `sheet`. Each component is one `.tsx` file in your `components/ouro/` folder (`dialog/` holds `dialog` and `confirm-dialog`, and `text/` holds `text` and `heading`). Add each one as `<name>` and `<name>-tests`, plus `ouro-lib-tests`, in one command at the same ref, with `--overwrite` (without it the CLI stops to ask about each file). For the app that added only `dialog`, that is `button button-tests dialog dialog-tests sheet sheet-tests ouro-lib-tests`.

This command finds the components, prints them and adds them. If it finds none, it stops before adding anything; run it in the folder with `components.json`. If you use the Ouro theme, add `ourostack/ouro-ui/ouro-theme#{{latestRelease}}` to the `add` in it.

```sh
( p() { npx shadcn@latest info --json | node -p "JSON.parse(require('fs').readFileSync(0, 'utf8')).config.resolvedPaths.$1"; }; ouro="$(p components)/ouro"; items=$(find "$ouro" -name '*.tsx' ! -name '*-parts.tsx' ! -name '*.test.tsx' ! -name '*.stories.tsx' 2>/dev/null | sed -E 's|.*/(.*)\.tsx$|\1|' | sort); [ -n "$items" ] || { echo "No Ouro components in $ouro. Run this in the folder with components.json." >&2; exit 1; }; echo "Updating: $(echo "$items" | paste -sd " " -)"; npx shadcn@latest add $(echo "$items" | sed -E 's|.*|ourostack/ouro-ui/&#{{latestRelease}} ourostack/ouro-ui/&-tests#{{latestRelease}}|') ourostack/ouro-ui/ouro-lib-tests#{{latestRelease}} --overwrite )
```

This keeps the tests v0.1.0 installed, deletes none of your files and adds no component you didn't have. shadcn may print `Skipped N files: (files might be identical, use --overwrite to overwrite)` even with `--overwrite`: those files already equal the release's, so nothing was missed. The `-tests` items set Vitest, Storybook and Playwright in `package.json` to the versions Ouro tests against. After `add`, restore every test-tool version you had pinned (`git diff package.json`): Vitest and its companions, Playwright and Storybook. Ouro's tests may not run on older versions, which we don't verify.

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
