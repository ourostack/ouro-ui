# Changes in this release

- Fixed: [Docs pin leaves its open pull request alone](scripts/workflows.test.mjs "verify:testExists(scripts/workflows.test.mjs::Docs pin leaves an open pull request alone only when it holds the same docs, merges cleanly and no check failed)") when it already holds the docs a push to main would generate, so a busy main no longer restarts its CI.
- Fixed: [A Sidebar label longer than its column wraps onto more lines](registry/ouro/components/ouro/sidebar/sidebar.test.tsx "verify:testExists(registry/ouro/components/ouro/sidebar/sidebar.test.tsx::Sidebar long labels > wraps a label longer than the column onto more lines, inside the row, with no ellipsis)") instead of widening the list past the column and being clipped at its edge.
