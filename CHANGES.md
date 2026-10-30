# Changes in this release

- The site, docs, Storybook and `@ouro` namespace moved to https://ui.ouro.bot/, so a `components.json` can name `https://ui.ouro.bot/r/{name}.json`.
- New: the tokens as plain stylesheets for pages without Tailwind, `site/public/css/ouro-base.css`, `ouro-theme.css` and `themes/<preset>.css`, which follow the system's dark mode unless the page sets `.light` or `.dark` ([guide](https://github.com/ourostack/ouro-ui/blob/main/docs/guides/static-css.md), [test](https://github.com/ourostack/ouro-ui/blob/main/site/scripts/static-css.test.mjs "verify:testExists(site/scripts/static-css.test.mjs::each .dark block is mirrored for the system's dark mode, at :root's specificity, unless the page chose .light or .dark)")).
