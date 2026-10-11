# Changes in this release

Re-add your Ouro items with `--overwrite` to get the first two.

- Every component, its parts, `OuroProvider` and the hook modules in `lib/ouro` now start with `"use client"`, so a Next.js App Router page, a Server Component by default, can render Ouro components. Before, `next build` failed with "This React Hook only works in a Client Component". Vite and other apps without React Server Components are unaffected.
- `ouroTestProjects` (in `ouro-testing`) now finds its setup file on Windows too.
- The `@ouro` namespace now serves the newest release instead of `main`, so `npx shadcn@latest add @ouro/<item>` installs released code only. To install unreleased code from `main`, use `ourostack/ouro-ui/<item>` without a ref.
