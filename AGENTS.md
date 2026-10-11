# Contributing to Ouro UI

Rules for people and coding agents who change this repository. (Consumers read `README.md` and `docs/`, not this file.)

## Project constraints

- Package `@ouro.bot/ui`, MIT license, repository `https://github.com/ourostack/ouro-ui`.
- No code is copied from Tailwind Catalyst or Tailwind Plus. Ideas only.
- Touch targets are at least 44px on coarse pointers (`@media (pointer: coarse)`).
- With `prefers-reduced-motion: reduce`, no transform or position change animates. Opacity may still animate.
- The default breakpoint `sm` is 640px. Below it, `Dialog` with `presentation="auto"` renders as a sheet.
- CI gates: type check, lint, unit and browser tests with 100% line and branch coverage (the coverage gate measures `src/**` only), build, and the package-contents check.
- Never add AI attribution to commits, pull requests, code or docs (no `Co-Authored-By`, no "Generated with").

## Dev message format

Exact format: `[ouro-ui] <Component>: <what's wrong>. Fix: <exact code>.`

- Emit each message once per component instance.
- Strip messages in production with the bare `process.env.NODE_ENV !== "production"` form, with no `typeof process` guard, so bundlers replace it statically and drop the dead branch. Put the check at each warn call site (`if (process.env.NODE_ENV !== "production") devWarn(...)`), and build `devThrow`'s fix argument only inside a development branch. `scripts/dev-strip.test.mjs` bundles a probe with Vite in production mode and asserts the message strings are gone.
- Consumers need a bundler that defines `process.env.NODE_ENV` (Vite, Next.js, webpack and React Router all do). Without one, dev messages are not stripped and the bare reference throws in a browser.

## Appearance classes warn

A `className` token warns when, after removing variants (split on `:` outside `[...]`) and a leading or trailing `!`, its base matches `/^(bg|text|border|rounded|shadow|font|ring|from|via|to|fill|stroke)-/` or is exactly `border`, `rounded`, `shadow` or `ring`, or when `dark` appears at any variant position. Ordinary layout classes (`mt-4`, `w-full`, `grid-cols-2`, `size-4`) never warn, and neither do text wrapping, text overflow and table layout classes that share a prefix (`text-wrap`, `text-nowrap`, `text-balance`, `text-pretty`, `text-ellipsis`, `text-clip`, `border-collapse`, `border-separate`, `border-spacing-*`). Alignment classes (`text-left|center|right|justify|start|end`) also warn, and the message points to the component's `align` prop where one exists (the `alignHint` argument), or else shows the class on a parent element. Hints are exact code, such as `tone="danger"`. A component may pass a hint function that picks the fix from the offending token (`src/internal/appearanceHints.ts` maps `bg-red-500` to `tone="danger"` and `text-lg` to `size="lg"`); pass hints only in development (`process.env.NODE_ENV !== "production" ? hint : ""`) so their text is stripped.

## Rules for writing components (spec section 4)

1. Props-first: the default export takes props that describe the whole thing; building-block parts live at `@ouro.bot/ui/parts` and their JSDoc says when to use them.
2. Anything that "always" applies is a required prop (`title` with `hideTitle`, `label` with `hideLabel`, `legend`, `name`); leaving it out is a type error.
3. One state, one prop: `error`, `loading`, `disabled`, `required` each handle all of their ARIA, messaging and animation.
4. Appearance comes from named options (`tone`, `variant`, `size`) that map to theme tokens, never color names or classes.
5. `className` is for layout only; warn in development about appearance classes and give common layout needs a prop (for example `fullWidth`).
6. The prop agents guess is the prop that exists: use the common name, or declare it as `never` with JSDoc pointing to the real prop (`isLoading?: never`).
7. Mode-dependent types follow the mode with discriminated unions (`multiple` makes `Select` use `string[]`; `href` makes `Button` a link).
8. Parts check where they are: outside their parent they throw in development with the correct JSX shape; where it is safe, the parent wraps loose children instead.
9. Docs live in the types: every export has JSDoc with a one-line purpose, a minimal example and "use X instead when" guidance; the root `index.d.ts` opens with a catalog; `README.md` and `docs/<component>.md` ship in the package.
10. Behavior and motion are the component's job (dialog-to-sheet on phones, focus, touch targets, durations, springs, reduced motion); no component takes a duration or easing prop, motion comes from theme tokens. Each Motion-driven component wraps its own Motion usage in `MotionConfig reducedMotion="user"` (or uses `useReducedMotion`) and must not rely on `OuroProvider`, which is optional.
11. Errors teach: every dev message uses the format above.
12. Higher-level patterns capture whole interactions agents assemble badly (`ConfirmDialog`, later `EditSheet`).

## Component conventions

- Every component root carries `data-ouro="<component>"`, so apps can exclude Ouro UI subtrees from global rules.
- There is no reset, so reset what the browser sets (button borders, backgrounds, margins on `<p>` and headings, `box-sizing`) in the component's own classes.
- A component whose rules read better as CSS than as utilities (Sheet's transforms over Base UI's `--drawer-*` variables) keeps them in its own stylesheet, imported from `src/styles.css` and wrapped in `@layer components`, with selectors on its `data-ouro` attributes.
- Class strings are literals so Tailwind finds them; Tailwind scans `src` except tests, type tests, stories and `src/generated`. Stories therefore lay out with inline styles and `--ouro-*` variables.
- Interactive controls use the `ou:press` utility (spring release, quick color easing), a `motion-safe:` press scale of `--ouro-press-scale`, and `<TouchTarget />` (`src/internal/TouchTarget.tsx`) as the first child of a `relative` root for the 44px coarse-pointer hit area.
- Dark mode is set on the root: `data-theme` on `<html>` (via `ThemeScript`) or the OS setting, which always works. A scheme set on a wrapper (`color-scheme: dark` on a subtree) needs native `light-dark()`; a consumer pipeline that lowers `light-dark()` (Lightning CSS, Tailwind's optimizer) resolves the tokens once at the root. `dist/styles.css` ships native `light-dark()`, and Storybook keeps it native (`optimize: false`, modern `cssTarget`) so its side-by-side dark panels render.
- Keyframes are namespaced (`ouro-spin`), never Tailwind's global `spin` or `pulse`.

## Workflow

- Use pnpm 10. Run `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test`, `pnpm test:scripts`, `pnpm check:package` and `pnpm build-storybook` before opening a pull request. Build before test: the package-contents tests read `dist`.
- `docs/<Export>.md`, `docs/parts.md`, the catalog in `README.md` (between the `catalog` markers) and the catalog JSDoc at the top of `src/index.ts` are generated from the JSDoc and prop types in `src/` by `pnpm run docs` (always with `run`: bare `pnpm docs` is pnpm's `npm docs`, which opens a browser) (`scripts/gen-docs.mts`, TypeScript compiler API) and committed; CI runs `pnpm run docs --check`. Edit the JSDoc, never the output. Generation fails when an export lacks a purpose or an `@example`, when a component lacks a "use X instead when" sentence, or when a new export has no catalog group (`groups` in the script). `tsdown.config.ts` copies the catalog to the top of `dist/index.d.ts`, and `docs/` ships in the package.
- `src/stories.test.tsx` renders every story through `composeStories` and runs axe (zero violations) closed and with each overlay open, light and dark, at 390px and 1280px, in Chromium and WebKit. A new `*.stories.tsx` file must be added to `test/stories.tsx`; a controlled story that opens from a plain button lists it in `plainOpeners` there.
- Screenshot baselines (`src/__screenshots__/**/*-linux.png`, light, dark and reduced motion at 390px and 1280px) come from Linux CI only. To refresh them, run the `visual-baselines.yml` workflow on your branch, download its `visual-baselines` artifact into `src/__screenshots__`, review and commit. CI compares with `pnpm test:visual`. Local runs on macOS write `*-darwin.png` files, which git ignores.
- Test with Vitest browser mode. Projects: `chromium`, `webkit`, `touch` (files named `*.touch.test.ts(x)`, Chromium as a 390x844 touch phone) and `visual` (files named `*.visual.test.ts(x)`, only when `CI_VISUAL=1`).
- Custom browser commands live in `vitest.commands.ts`: `commands.emulateMedia({ reducedMotion, colorScheme })`, `commands.drag({ from, to, steps, durationMs, hold })` (`hold` keeps the button down so a test can inspect the mid-drag state; release with `pointerPress({ action: "up" })`) and `commands.pointerPress({ selector, action })` (holds the real mouse down so `:active` applies). Drag tests run in Chromium only.
- `motion` is a peer dependency (and a dev dependency) so apps do not load two copies.
- `src/generated/theme.css` is generated from `src/theme/ouro.ts` by `pnpm theme` (also run by `pnpm build`) and committed. CI runs `pnpm theme --check`. Never edit it by hand. Tokens are plain custom properties in `@layer base`, so Tailwind never drops them.
- Contributors need Node 22.18 or later (`devEngines`; `.node-version` pins 24) because `scripts/build-theme.mts` runs through Node's type stripping. `engines` stays `>=22` for consumers.
- Soft variants (`soft-<tone>` backgrounds) take `<tone>-ink` text (`ou:text-accent-ink`), never the plain tone: the plain tone fails 4.5:1 on its own soft background in light mode. `src/theme/contrast.test.tsx` checks every pair in light and dark.
