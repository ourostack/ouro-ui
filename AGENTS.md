# Contributing to Ouro UI

Rules for people and coding agents who change this repository. (Consumers read `README.md` and `docs/`, not this file.)

## Project constraints

- Copy-in source distributed as a shadcn/ui registry; MIT license, repository `https://github.com/ourostack/ouro-ui`. There is no npm package and no build: apps compile the components with their own Tailwind CSS v4.
- No code is copied from Tailwind Catalyst or Tailwind Plus. Ideas only.
- Touch targets are at least 44px on coarse pointers (`@media (pointer: coarse)`).
- With `prefers-reduced-motion: reduce`, no transform or position change animates. Opacity may still animate.
- The default breakpoint `sm` is 640px. Below it, `Dialog` with `presentation="auto"` renders as a sheet.
- CI gates, in order: `pnpm run docs --check`, type check, lint, unit and browser tests with 100% line and branch coverage (measured over `registry/**`, without stories and `registry/ouro/testing/`), the script tests, and the Storybook build.
- Never add AI attribution to commits, pull requests, code or docs (no `Co-Authored-By`, no "Generated with").

## Dev message format

Exact format: `[ouro-ui] <Component>: <what's wrong>. Fix: <exact code>.`

- Emit each message once per component instance.
- Strip messages in production with the bare `process.env.NODE_ENV !== "production"` form, with no `typeof process` guard, so bundlers replace it statically and drop the dead branch. Put the check at each warn call site (`if (process.env.NODE_ENV !== "production") devWarn(...)`), and build `devThrow`'s fix argument only inside a development branch. `scripts/dev-strip.test.mjs` bundles a probe with Vite in production mode and asserts the message strings are gone.
- Consumers need a bundler that defines `process.env.NODE_ENV` (Vite, Next.js, webpack and React Router all do). Without one, dev messages are not stripped and the bare reference throws in a browser.

## Appearance classes warn

A `className` token warns when, after removing variants (split on `:` outside `[...]`) and a leading or trailing `!`, its base matches `/^(bg|text|border|rounded|shadow|font|ring|from|via|to|fill|stroke)-/` or is exactly `border`, `rounded`, `shadow` or `ring`, or when `dark` appears at any variant position. Ordinary layout classes (`mt-4`, `w-full`, `grid-cols-2`, `size-4`) never warn, and neither do text wrapping, text overflow and table layout classes that share a prefix (`text-wrap`, `text-nowrap`, `text-balance`, `text-pretty`, `text-ellipsis`, `text-clip`, `border-collapse`, `border-separate`, `border-spacing-*`). Alignment classes (`text-left|center|right|justify|start|end`) also warn, and the message points to the component's `align` prop where one exists (the `alignHint` argument), or else shows the class on a parent element. Hints are exact code, such as `tone="destructive"`. A component may pass a hint function that picks the fix from the offending token (`registry/ouro/lib/appearance-hints.ts` maps `bg-red-500` to `tone="destructive"` and `text-lg` to `size="lg"`); pass hints only in development (`process.env.NODE_ENV !== "production" ? hint : ""`) so their text is stripped.

## Rules for writing components (spec section 4)

1. Props-first: the default export takes props that describe the whole thing; building-block parts live in the component's `-parts` file and their JSDoc says when to use them.
2. Anything that "always" applies is a required prop (`title` with `hideTitle`, `label` with `hideLabel`, `legend`, `name`); leaving it out is a type error.
3. One state, one prop: `error`, `loading`, `disabled`, `required` each handle all of their ARIA, messaging and animation.
4. Appearance comes from named options (`tone`, `variant`, `size`) that map to theme tokens, never color names or classes.
5. `className` is for layout only; warn in development about appearance classes and give common layout needs a prop (for example `fullWidth`).
6. The prop agents guess is the prop that exists: use the common name, or declare it as `never` with JSDoc pointing to the real prop (`isLoading?: never`).
7. Mode-dependent types follow the mode with discriminated unions (`multiple` makes `Select` use `string[]`; `href` makes `Button` a link).
8. Parts check where they are: outside their parent they throw in development with the correct JSX shape; where it is safe, the parent wraps loose children instead.
9. Docs live in the types: every export has JSDoc with a one-line purpose, a minimal example and "use X instead when" guidance; `README.md` holds the catalog and `docs/<component>.md` a page per component.
10. Behavior and motion are the component's job (dialog-to-sheet on phones, focus, touch targets, durations, springs, reduced motion); no component takes a duration or easing prop, motion comes from theme tokens. Each Motion-driven component wraps its own Motion usage in `MotionConfig reducedMotion="user"` (or uses `useReducedMotion`) and must not rely on `OuroProvider`, which is optional.
11. Errors teach: every dev message uses the format above.
12. Higher-level patterns capture whole interactions agents assemble badly (`ConfirmDialog`, later `EditSheet`).

## Layout

- `registry/ouro/ui/<component>/`: components, their parts, tests and stories.
- `registry/ouro/lib/`: shared helpers (`cn`, dev messages, the className check, `OuroProvider`, tone names, `env.d.ts`, which declares `process.env.NODE_ENV` so apps without `@types/node` typecheck; `pnpm typecheck` also checks the registry source without Node types).
- `registry/ouro/hooks/`: `useMediaQuery`, `useKeyboardScrollable` and the backdrop anchor.
- `registry/ouro/testing/`: the `act` helper and the custom browser commands.
- `registry/ouro/theme/ouro-theme.css`: the Ouro default theme in shadcn's format.
- `app.css`: the repository as its own app. It imports Tailwind and the theme and scans `registry/`; Storybook and the Vitest projects compile it with `@tailwindcss/vite`.
- `test/`: the story-wide accessibility test, the screenshot test and their baselines.
- Imports between registry files use `@/registry/ouro/...`, which the shadcn CLI rewrites to an app's aliases on install. `@/` resolves to the repository root (tsconfig `paths` and the Vite alias).

## Component conventions

- Every component root carries `data-ouro="<component>"`, so apps can exclude Ouro UI subtrees from global rules.
- Style with plain Tailwind utilities on shadcn's token names (`bg-primary`, `text-muted-foreground`, `border-border`, `rounded-lg`), merged with `cn(...)` with the app's `className` last, so the app's layout classes win. There is no prefix and no stylesheet per component.
- `tone` values are the theme token names: `primary`, `secondary`, `destructive`, `success`, `warning`. `variant="soft"` is the tone at 10% behind tone-colored text (`bg-destructive/10 text-destructive`). A tone or variant that is not one of ours (`tone="danger"`, shadcn's `variant="destructive"`) renders the default and warns with the fix.
- There is no reset, so reset what the browser sets (button borders, backgrounds, margins on `<p>` and headings, `box-sizing`) in the component's own classes.
- Class strings are literals so Tailwind finds them; `app.css` scans `registry/`. Stories lay out with inline styles and the theme variables (`var(--muted-foreground)`).
- Interactive controls use the `press` utility (spring release, quick color easing), a `motion-safe:` press scale of `--ouro-press-scale`, and `<TouchTarget />` (`registry/ouro/ui/touch-target/touch-target.tsx`) as the first child of a `relative` root for the 44px coarse-pointer hit area.
- Dark mode is the `.dark` class on an ancestor, as in shadcn. The OS setting alone does not switch it.
- Keyframes are namespaced (`ouro-spin`), never Tailwind's global `spin` or `pulse`.
- Motion tokens keep the `--ouro-` prefix (`--ouro-spring-duration`, `--ouro-ease-spring`); `registry/ouro/theme/theme.test.tsx` checks the spring against Motion's `spring(0.4, 0.15)` and checks every text pair at 4.5:1 in light and dark.

## Workflow

- Use pnpm 10. Run `pnpm run docs --check`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:scripts` and `pnpm build-storybook` before opening a pull request.
- `docs/<Export>.md`, `docs/parts.md` and the catalog in `README.md` (between the `catalog` markers) are generated from the JSDoc and prop types in `registry/` by `pnpm run docs` (always with `run`: bare `pnpm docs` is pnpm's `npm docs`, which opens a browser) (`scripts/gen-docs.mts`, TypeScript compiler API) and committed; CI runs `pnpm run docs --check`. Edit the JSDoc, never the output. Generation fails when an export lacks a purpose or an `@example`, when a component lacks a "use X instead when" sentence, or when a new export has no catalog group (`groups` in the script). Tag an export that is shared between registry files but not for apps with `@internal`.
- `test/stories.test.tsx` renders every story through `composeStories` and runs axe (zero violations) closed and with each overlay open, light and dark, at 390px and 1280px, in Chromium and WebKit. A new `*.stories.tsx` file must be added to `test/stories.tsx`; a controlled story that opens from a plain button lists it in `plainOpeners` there.
- Screenshot baselines (`test/__screenshots__/**/*-linux.png`, light, dark and reduced motion at 390px and 1280px) come from Linux CI only. To refresh them, run the `visual-baselines.yml` workflow on your branch, download its `visual-baselines` artifact into `test/__screenshots__`, review and commit. CI compares with `pnpm test:visual` in its `visual` job. Both workflows pin `ubuntu-24.04`, the image that rendered the baselines; moving to a new image means regenerating them. Local runs on macOS write `*-darwin.png` files, which git ignores.
- Test with Vitest browser mode. Projects: `chromium`, `webkit`, `touch` (files named `*.touch.test.ts(x)`, Chromium as a 390x844 touch phone) and `visual` (files named `*.visual.test.ts(x)`, only when `CI_VISUAL=1`).
- Custom browser commands live in `registry/ouro/testing/commands.ts`: `commands.emulateMedia({ reducedMotion, colorScheme })`, `commands.drag({ from, to, steps, durationMs, hold })` (`hold` keeps the button down so a test can inspect the mid-drag state; release with `pointerPress({ action: "up" })`), `commands.flick`, `commands.tap` and `commands.pointerPress({ selector, action })` (holds the real mouse down so `:active` applies). Drag tests run in Chromium only.
- Contributors need Node 22.18 or later (`devEngines`; `.node-version` pins 24) because the scripts run through Node's type stripping.
