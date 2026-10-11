# Contributing to Ouro UI

Rules for people and coding agents who change this repository. (Consumers read `README.md` and `docs/`, not this file.)

## Project constraints

- Copy-in source distributed as a shadcn/ui registry; MIT license, repository `https://github.com/ourostack/ouro-ui`. There is no npm package and no build: apps compile the components with their own Tailwind CSS v4.
- No code is copied from Tailwind Catalyst or Tailwind Plus. Ideas only.
- Touch targets are at least 44px on coarse pointers (`@media (pointer: coarse)`).
- With `prefers-reduced-motion: reduce`, no transform or position change animates. Opacity may still animate.
- The default breakpoint `sm` is 640px. Below it, `Dialog` with `presentation="auto"` renders as a sheet.
- CI gates: `pnpm run docs --check`, type check, lint, unit and browser tests with 100% line and branch coverage (measured over `registry/**`, without stories, `registry/ouro/lib/ouro/testing/` and `registry/ouro/e2e/`), the script tests and the Storybook build (job `ci`); `pnpm registry --check` and `shadcn registry validate` (job `registry`); the end-to-end specs against Storybook (job `e2e`); and the install test (job `install`: the `shadcn`, `ouro` and `namespace` variants).
- Never add AI attribution to commits, pull requests, code or docs (no `Co-Authored-By`, no "Generated with").

## Dev message format

Exact format: `[ouro-ui] <Component>: <what's wrong>. Fix: <exact code>.`

- Emit each message once per component instance.
- Strip messages in production with the bare `process.env.NODE_ENV !== "production"` form, with no `typeof process` guard, so bundlers replace it statically and drop the dead branch. Put the check at each warn call site (`if (process.env.NODE_ENV !== "production") devWarn(...)`), and build `devThrow`'s fix argument only inside a development branch. `scripts/dev-strip.test.mjs` bundles a probe with Vite in production mode and asserts the message strings are gone.
- Consumers need a bundler that defines `process.env.NODE_ENV` (Vite, Next.js, webpack and React Router all do). Without one, dev messages are not stripped and the bare reference throws in a browser.

## Appearance classes warn

A `className` token warns when, after removing variants (split on `:` outside `[...]`) and a leading or trailing `!`, its base matches `/^(bg|text|border|rounded|shadow|font|ring|from|via|to|fill|stroke)-/` or is exactly `border`, `rounded`, `shadow` or `ring`, or when `dark` appears at any variant position. Ordinary layout classes (`mt-4`, `w-full`, `grid-cols-2`, `size-4`) never warn, and neither do text wrapping, text overflow and table layout classes that share a prefix (`text-wrap`, `text-nowrap`, `text-balance`, `text-pretty`, `text-ellipsis`, `text-clip`, `border-collapse`, `border-separate`, `border-spacing-*`). Alignment classes (`text-left|center|right|justify|start|end`) also warn, and the message points to the component's `align` prop where one exists (the `alignHint` argument), or else shows the class on a parent element. Hints are exact code, such as `tone="destructive"`. A component may pass a hint function that picks the fix from the offending token (`registry/ouro/lib/ouro/appearance-hints.ts` maps `bg-red-500` to `tone="destructive"` and `text-lg` to `size="lg"`); pass hints only in development (`process.env.NODE_ENV !== "production" ? hint : ""`) so their text is stripped.

## Rules for writing components (spec section 4)

1. Props-first: the default export takes props that describe the whole thing; building-block parts live in the component's `-parts` file and their JSDoc says when to use them.
2. Anything that "always" applies is a required prop (`title` with `hideTitle`, `label` with `hideLabel`, `legend`, `name`); leaving it out is a type error.
3. One state, one prop: `error`, `loading`, `disabled`, `required` each handle all of their ARIA, messaging and animation.
4. Appearance comes from named options (`tone`, `variant`, `size`) that map to theme tokens, never color names or classes.
5. `className` is for layout only; warn in development about appearance classes and give common layout needs a prop (for example `fullWidth`).
6. The prop agents guess is the prop that exists: use the common name, or declare it as a hint type that nothing is assignable to, with JSDoc pointing to the real prop (`isLoading?: { 'Use <Button loading>': never }`), so the type error names the fix. A plain `never` reads as `undefined`, a literal type, and TypeScript then drops the hover JSDoc of every prop on a union-typed element; `scripts/agent-types.test.mjs` checks both the error text and the hover. Habitual values of an enum prop (shadcn's `variant="destructive"`) get one `string & { '<the fixes>': never }` member, kept short so `tsc` prints the whole union.
7. Mode-dependent types follow the mode with discriminated unions (`multiple` makes `Select` use `string[]`; `href` makes `Button` a link).
8. Parts check where they are: outside their parent they throw in development with the correct JSX shape; where it is safe, the parent wraps loose children instead.
9. Docs live in the types: every export has JSDoc with a one-line purpose, a minimal example and "use X instead when" guidance; `README.md` holds the catalog and `docs/<component>.md` a page per component.
10. Behavior and motion are the component's job (dialog-to-sheet on phones, focus, touch targets, durations, springs, reduced motion); no component takes a duration or easing prop, motion comes from theme tokens. Components animate with CSS only (Base UI's `data-starting-style`/`data-ending-style` transitions, the theme spring as a `linear()` easing) and honor reduced motion with `motion-reduce:`/`motion-safe:` variants and `prefers-reduced-motion` queries. No registry item depends on the `motion` package; it is a dev dependency here only for the RedwoodUI reference story and the theme test's spring check. A component that ever needs Motion must wrap its own usage in `MotionConfig reducedMotion="user"` (or use `useReducedMotion`) and must not rely on `OuroProvider`, which is optional.
11. Errors teach: every dev message uses the format above.
12. Higher-level patterns capture whole interactions agents assemble badly (`ConfirmDialog`, later `EditSheet`).

## Layout

The layout mirrors where shadcn installs files, so the CLI's import rewrite lands them in `components/ouro/` and `lib/ouro/` (spec §3).

- `registry/ouro/components/ouro/<component>/`: components, their parts, tests and stories.
- `registry/ouro/lib/ouro/`: shared helpers and hooks (`cn`, dev messages, the className check, `OuroProvider`, tone names, `useMediaQuery`, `useKeyboardScrollable`, the backdrop anchor, `TouchTarget`, and `env.d.ts`, which declares `process.env.NODE_ENV` so apps without `@types/node` typecheck; `pnpm typecheck` also checks the registry source without Node types).
- `registry/ouro/lib/ouro/testing/`: the test kit the `ouro-testing` item ships: the `act` helper, the custom browser commands, `pageCss()`, the act-warning setup and `ouroTestProjects` (`vitest.ts`), the Vitest browser projects apps add to their config. This repository's `vitest.config.ts` uses the same projects.
- `registry/ouro/e2e/ouro/`: one Playwright spec per component, installed to an app's `e2e/ouro/`, and `story.ts`, which opens a story by id in the Storybook at `OURO_E2E_URL` (default `http://localhost:6006`). Specs ship as `registry:file`, which the CLI does not rewrite, so they import only `@playwright/test` and `./story`.
- `registry/ouro/theme/ouro-base.css`: required in every app. The success and warning pairs and `--destructive-foreground` (which shadcn's themes lack), the `--ouro-*` motion tokens, the `press` utility and the keyframes.
- `registry/ouro/theme/ouro-theme.css`: optional. The Ouro color look as a shadcn theme (`:root` and `.dark` values only).
- `app.css`: the repository as its own app. It imports Tailwind, `ouro-base.css` and `ouro-theme.css`, adds the `@custom-variant dark` and `@theme inline` mapping `shadcn init` writes, and scans `registry/`; Storybook and the Vitest projects compile it with `@tailwindcss/vite`.
- `stories/reference/`: repository-only stories, such as the Sheet feel comparison with RedwoodUI's ActionSheet; they ship in no item.
- `registry.json`: the shadcn registry, generated by `pnpm registry` (`scripts/registry.mts`) and committed; see Registry below.
- `test/install-fixture/`: the fresh Vite app the install test (`scripts/install-test.sh`) copies, runs `shadcn init` in and installs every item into.
- `test/`: the story-wide accessibility test, the screenshot test and their baselines, and `stock-theme.test.tsx`, which checks every tone and variant at 4.5:1 under stock shadcn variables (`test/shadcn-stock.css`, copied from `shadcn init`) plus `ouro-base.css`, and under the Ouro theme.
- `site/`: the landing page and docs site (https://ourostack.github.io/ouro-ui/), built with Vite from the root dependencies, not a workspace package. Docs pages render the generated `docs/*.md`; each registry item's page is `docs/<item name>/`. `pnpm site:build` writes `site/dist` (prerendered HTML per route), `pnpm site:dev` serves it. The "Agents read the types" examples live in `site/src/agents/examples.ts`; `pnpm site:messages` regenerates their compiler output (`site:build` and `pnpm test:scripts` fail when it is stale), and the `site` Vitest project checks each quoted dev message against the real component.
- Imports between registry files use `@/registry/ouro/...`, which the shadcn CLI rewrites to an app's aliases on install. `@/` resolves to the repository root (tsconfig `paths` and the Vite alias).

## Component conventions

- Every component root carries `data-ouro="<component>"`, so apps can exclude Ouro UI subtrees from global rules.
- Style with plain Tailwind utilities on shadcn's token names (`bg-primary`, `text-muted-foreground`, `border-border`, `rounded-lg`), merged with `cn(...)` with the app's `className` last, so the app's layout classes win. There is no prefix and no stylesheet per component.
- A layout property the app may override (`h-*`, `px-*`) is one unprefixed class at every width. When it changes at a breakpoint, the class reads a variable and the breakpoint sets the variable (`h-(--ouro-button-h) [--ouro-button-h:…] sm:[--ouro-button-h:…]`), so tailwind-merge replaces it with the app's class.
- `tone` values are the theme token names: `primary`, `secondary`, `destructive`, `success`, `warning`. `secondary` has shadcn's meaning: a quiet surface (`bg-secondary text-secondary-foreground`), never a text color, so Text's `secondary` is the muted foreground. `variant="soft"` is the tone at 10% behind text in the tone mixed 20% toward the foreground (shadcn's stock destructive fails 4.5:1 on its own tint otherwise). Focus outlines use `outline-ring` for every tone. A tone, variant or size that is not one of ours (`tone="danger"`, shadcn's `variant="destructive"` or `size="icon"`) renders the default and warns with the fix.
- There is no reset, so reset what the browser sets (button borders, backgrounds, margins on `<p>` and headings, `box-sizing`) in the component's own classes.
- Class strings are literals so Tailwind finds them; `app.css` scans `registry/`. Stories lay out with inline styles and the theme variables (`var(--muted-foreground)`).
- Interactive controls use the `press` utility (spring release, quick color easing), a `motion-safe:` press scale of `--ouro-press-scale`, and `<TouchTarget />` (`registry/ouro/lib/ouro/touch-target.tsx`) as the first child of a `relative` root for the 44px coarse-pointer hit area.
- Dark mode is the `.dark` class on an ancestor, as in shadcn. The OS setting alone does not switch it.
- Keyframes are namespaced (`ouro-spin`), never Tailwind's global `spin` or `pulse`.
- Every variable Ouro UI adds that is not a shadcn color uses the `--ouro-` prefix (`--ouro-spring-duration`, `--ouro-sheet-gap`); `registry/ouro/theme/theme.test.tsx` checks the spring against Motion's `spring(0.4, 0.15)` and checks the Ouro theme's text pairs at 4.5:1 in light and dark.

## Workflow

- Use pnpm 10. Run `pnpm run docs --check`, `pnpm registry --check`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:scripts`, `pnpm test:e2e` and `pnpm build-storybook` before opening a pull request.
- `docs/<Export>.md`, `docs/parts.md` and the catalog in `README.md` (between the `catalog` markers) are generated from the JSDoc and prop types in `registry/` by `pnpm run docs` (always with `run`: bare `pnpm docs` is pnpm's `npm docs`, which opens a browser) (`scripts/gen-docs.mts`, TypeScript compiler API) and committed; CI runs `pnpm run docs --check`. Edit the JSDoc, never the output. Generation fails when an export lacks a purpose or an `@example`, when a component lacks a "use X instead when" sentence, or when a new export has no catalog group (`groups` in the script). Tag an export that is shared between registry files but not for apps with `@internal`.
- `test/stories.test.tsx` renders every story through `composeStories` and runs axe (zero violations) closed and with each overlay open, light and dark, at 390px and 1280px, in Chromium and WebKit. A new `*.stories.tsx` file must be added to `test/stories.tsx`; a controlled story that opens from a plain button lists it in `plainOpeners` there.
- Screenshot baselines (`test/__screenshots__/**/*-linux.png`, light, dark and reduced motion at 390px and 1280px) come from Linux CI only. To refresh them, run the `visual-baselines.yml` workflow on your branch, download its `visual-baselines` artifact into `test/__screenshots__`, review and commit. CI compares with `pnpm test:visual` in its `visual` job. Both workflows pin `ubuntu-24.04`, the image that rendered the baselines; moving to a new image means regenerating them. Local runs on macOS write `*-darwin.png` files, which git ignores.
- Test with Vitest browser mode. Projects: `ouro-chromium`, `ouro-webkit`, `ouro-touch` (files named `*.touch.test.ts(x)`, Chromium as a 390x844 touch phone), from `ouroTestProjects`, and `visual` (files named `*.visual.test.ts(x)`, only when `CI_VISUAL=1`).
- Tests ship to apps, so they hold under any shadcn theme: compare with the theme's computed variables, never with Ouro's hex values (`themeColor` in `button.test.tsx`), and read compiled CSS with `pageCss()`, never by importing `app.css`. A component's tests, stories and spec import only its own item and the items it depends on.
- End-to-end specs: `pnpm test:e2e` starts Storybook and runs `registry/ouro/e2e/` in Chromium and WebKit.
- Custom browser commands live in `registry/ouro/lib/ouro/testing/commands.ts`: `commands.emulateMedia({ reducedMotion, colorScheme })`, `commands.drag({ from, to, steps, durationMs, hold })` (`hold` keeps the button down so a test can inspect the mid-drag state; release with `pointerPress({ action: "up" })`), `commands.flick`, `commands.tap` and `commands.pointerPress({ selector, action })` (holds the real mouse down so `:active` applies). Drag tests run in Chromium only.
- Contributors need Node 22.18 or later (`devEngines`; `.node-version` pins 24) because the scripts run through Node's type stripping.

## Registry

- `registry.json` is generated; never edit it. Run `pnpm registry` after adding, renaming or moving a registry file, changing an import, a theme CSS file, a dependency version or a component's JSDoc purpose, and commit the result. CI fails on a stale file.
- `scripts/registry.mts` derives everything from the layout: a component item ships `<stem>.tsx`, `<stem>-parts.tsx`, their tests (`registry:component`), stories and `e2e/ouro/<stem>.spec.ts` (`registry:file`), targeted at `@components/ouro/<folder>/` and `~/e2e/ouro/`. `registryDependencies` come from the `@/registry/...` imports, as full unpinned addresses (`ourostack/ouro-ui/<item>`; release tags pin them, see Pages and releases); npm `dependencies` and `devDependencies` come from the imports, at the range in this repository's `package.json`. The theme items' `cssVars` and `css` come from `registry/ouro/theme/*.css`; a theme file may hold only `:root`, `.dark`, `@theme inline`, `@utility` and `@keyframes`. Descriptions and docs messages come from `docs/<Component>.md`.
- Stories and tests count as imports, so an item can depend on another Ouro item only through them (`sheet` and `heading` depend on `button` through their stories and tests). That is accepted: everything ships with each component.
- `ouro-theme` is a `registry:theme` (it replaces the app's colors, and the CLI warns before that); `ouro-base` is a `registry:item`, because it only adds variables.
- The `ouro-testing` docs message prints the files an app adds to run the shipped tests and specs (`testingSetup` in the script). `test/install-fixture` uses those files verbatim, and the registry test fails if they drift.
- A new component goes in the script's `components` list; a registry file no item ships fails the generator unless it is in `repoOnly`.
- The shadcn CLI is pinned to `shadcn@4.21.1` in `.github/workflows/ci.yml`, `pages.yml` and `scripts/install-test.sh`.
- The install test (`scripts/install-test.sh <shadcn|ouro|namespace> <dir>`) runs locally too; the `ouro` variant fetches `ouro-theme` from GitHub, so push first. Refs are not inherited by `registryDependencies`, so the script installs from a locally built copy of the registry whose dependencies point at the built item files (`--deps <dir>/{name}.json`). The `namespace` variant builds the registry as Pages serves it, serves it on localhost, registers `@ouro` in the app's `components.json` and installs `@ouro/dialog`, checking that every dependency came through the namespace. The `github` variant is the ref-less install from `main`; CI runs it (job `install-github`) after each push to main.

## Pages and releases

- `pages.yml` publishes https://ourostack.github.io/ouro-ui/ after CI passes on a push to main (`workflow_run`; also runnable by hand): the site at `/`, Storybook at `/storybook/`, and the `@ouro` namespace registry at `/r/<item>.json` and `/r/registry.json`. The namespace build is `scripts/registry.mts --deps "@ouro/{name}"` followed by `shadcn build`, so each item's same-repo dependencies resolve through the namespace. The namespace always serves main.
- Release by running the Release workflow (`release.yml`) with a `version` such as `0.1.0` (Actions, or `gh workflow run release.yml -f version=0.1.0`). It checks that CI passed on main's head, force-pushes `release/v<version>` from main with every same-repo `registryDependency` in `registry.json` pinned to `#v<version>` and a `version` field (`pnpm registry --release <version>`), and runs CI on that commit (dispatched, because pushes made with `GITHUB_TOKEN` trigger no workflows; it waits on the run for that exact commit). When CI passes, it tags the commit, creates the GitHub release with the items and both install commands, and deletes the branch. There is no pull request.
- Main is never pinned: only the tag points at the release commit. `pnpm registry --check` reads the `version` field, so CI on the release branch checks the pinned file; on main and on pull requests into main it fails on a `version` field or a `#v` dependency.
- Rerunning is safe. If the tag exists and has a release, the workflow exits with a notice. A failed run deletes its branch, so rerun after fixing the cause. Recovery:
  - CI failed on the release branch: fix main, then run Release again.
  - The tag exists without a GitHub release (the run fails and says so): delete the tag with `git push origin :refs/tags/v<version>`, then run Release again.
  - A wrong release was published: delete it with `gh release delete v<version> --cleanup-tag`, then release a new version (prefer a new version over reusing a published tag).
- `ourostack/ouro-ui/<item>#v<version>` installs the item and all its Ouro dependencies at that tag, because the tagged `registry.json` names them with the same tag.
