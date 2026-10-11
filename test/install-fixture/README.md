# Install fixture

A fresh Vite + React + TypeScript + Tailwind v4 app that CI copies to a temporary folder,
runs `shadcn init` in, and installs every Ouro UI registry item into
(`scripts/install-test.sh`). The import alias is `~/`, not the registry source's `@/`,
so an import the CLI failed to rewrite fails the type check. `vitest.config.ts`,
`playwright.config.ts` and `.storybook/` are what an app adds when it follows the
`ouro-testing` item's docs.
