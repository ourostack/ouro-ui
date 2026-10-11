# Install fixture

A fresh Vite + React + TypeScript + Tailwind v4 app that CI copies to a temporary folder,
runs `shadcn init` in, and installs every Ouro UI component into
(`scripts/install-test.sh`). The import alias is `~/`, not the registry source's `@/`,
so an import the CLI failed to rewrite fails the type check. It has no test config, like
a new app: the install test checks that the runtime items add no tests. Then it copies in
`test/install-fixture-tests/` (`vitest.config.ts`, `playwright.config.ts` and
`.storybook/`, what an app adds when it follows the `ouro-testing` item's docs) and adds
`ouro-tests`.
