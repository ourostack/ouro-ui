# Upgrading from v0.1.0

v0.1.0 installed each component with its tests, and v0.2.0 moves some shared helpers to new files, so update every Ouro component in one go. Run the commands in your app's root, the folder with `components.json`. They find your folders the way shadcn does, from the aliases in `components.json` and the `paths` in your tsconfig (`npx shadcn@latest info` shows them), so they work in a `src/` or an `app/` layout as written.

#### 0. Commit first

`--overwrite` replaces every Ouro file, including files you edited. Commit before you start. Afterwards, `git diff` shows your own edits being overwritten, so reapply the ones you need.

#### 1. Update every Ouro component, with its tests

Update every Ouro component in your app, not only the items you typed: v0.1.0 added each component's dependencies too, so an app that added only `dialog` also has `button` and `sheet`. Each component is one `.tsx` file in your `components/ouro/` folder (`dialog/` holds `dialog` and `confirm-dialog`, and `text/` holds `text` and `heading`). Add each one as `<name>` and `<name>-tests`, plus `ouro-lib-tests`, in one command at the same ref, with `--overwrite` (without it the CLI stops to ask about each file). For the app that added only `dialog`, that is `button button-tests dialog dialog-tests sheet sheet-tests ouro-lib-tests`.

This command finds the components, prints them and adds them. If it finds none, it stops before adding anything; run it in the folder with `components.json`. If you use the Ouro theme, add `ourostack/ouro-ui/ouro-theme#{{latestRelease}}` to the `add` in it.

```sh
( p() { npx shadcn@latest info --json | node -p "JSON.parse(require('fs').readFileSync(0, 'utf8')).config.resolvedPaths.$1"; }; ouro="$(p components)/ouro"; items=$(find "$ouro" -name '*.tsx' ! -name '*-parts.tsx' ! -name '*.test.tsx' ! -name '*.stories.tsx' 2>/dev/null | sed -E 's|.*/(.*)\.tsx$|\1|' | sort); [ -n "$items" ] || { echo "No Ouro components in $ouro. Run this in the folder with components.json." >&2; exit 1; }; echo "Updating:" $items; npx shadcn@latest add $(echo "$items" | sed -E 's|.*|ourostack/ouro-ui/&#{{latestRelease}} ourostack/ouro-ui/&-tests#{{latestRelease}}|') ourostack/ouro-ui/ouro-lib-tests#{{latestRelease}} --overwrite )
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
