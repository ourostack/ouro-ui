# Static CSS

Ouro HX's tokens also come as plain stylesheets, for a page with no build step and no Tailwind: a status page, a report or a prototype written in HTML.[^files] They hold the tokens only. Components still install with shadcn.

## Use them

Link `ouro-base.css` first, then one theme:

```html
<link rel="stylesheet" href="css/ouro-base.css" />
<link rel="stylesheet" href="css/themes/chart.css" />
```

Then use the tokens in your own CSS:

```css
body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-sans);
}

h1,
h2 {
  font-family: var(--font-heading);
}

.panel {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.status-done {
  color: var(--success);
}

.status-waiting {
  color: var(--warning);
}

@media (prefers-reduced-motion: no-preference) {
  .loading {
    animation: ouro-pulse 2s var(--ouro-ease-in-out) infinite;
  }
}
```

## The files

They live in [`site/public/css/`](../../site/public/css/):

| File                  | What it holds                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `ouro-base.css`       | The radius scale, the success and warning colors, motion durations and easings, the overlay layer and the `ouro-*` keyframes.[^base]        |
| `ouro-theme.css`      | Ouro HX's default theme: shadcn/ui's color tokens in light and dark.[^tokens]                                                               |
| `themes/<preset>.css` | One of the site's theme presets, with its fonts: `sleek`, `abyss`, `brass`, `chart`, `coral` or `cookbook`.[^fonts] |

`ouro-base.css` leaves out the `press` utility, which needs Tailwind; its header names what it leaves out.[^base] A preset's fonts load from `../../fonts/`, so keep `css/` and `fonts/` side by side when you copy them.[^fonts]

## Dark mode

Put `class="dark"` or `class="light"` on `<html>` to choose a mode. Without either class, the page follows the system's setting (`prefers-color-scheme`).[^dark] The system rule has the specificity of `:root`, so a `:root` rule of yours that comes after these files still wins.[^dark]

## Where to get them

- Copy `site/public/css/` and `site/public/fonts/` from a commit into your site, keeping the two folders side by side.
- Or link the copies the site serves from its `css/` folder, which change when the site does.
- Or pin a commit through a CDN that mirrors GitHub, such as jsDelivr: `https://cdn.jsdelivr.net/gh/ourostack/ouro-ui@<commit>/site/public/css/ouro-base.css`.

Keep the MIT notice at the top of each file. The fonts carry the SIL Open Font License, in `site/public/fonts/LICENSE.txt`.[^licence]

## Changing them

Don't edit the files. Edit `registry/ouro/theme/ouro-base.css`, `registry/ouro/theme/ouro-theme.css` or `site/src/themes/<preset>.css`, then run `pnpm site:static-css`. `site:build` runs it with `--check` and fails when a file is stale.[^stale]

[^files]: test:site/scripts/static-css.test.mjs::the files are plain CSS: no Tailwind at-rules, imports or nested rules verify:testExists(site/scripts/static-css.test.mjs::the files are plain CSS: no Tailwind at-rules, imports or nested rules)

[^base]: test:site/scripts/static-css.test.mjs::ouro-base keeps every value of ouro-base.css, turns @theme inline into :root and leaves out the press utility verify:testExists(site/scripts/static-css.test.mjs::ouro-base keeps every value of ouro-base.css, turns @theme inline into :root and leaves out the press utility)

[^tokens]: test:site/scripts/static-css.test.mjs::every token of each theme reaches its file, in light and dark verify:testExists(site/scripts/static-css.test.mjs::every token of each theme reaches its file, in light and dark)

[^fonts]: test:site/scripts/static-css.test.mjs::a preset's fonts load from site/public/fonts, by a path that holds on Pages and in the repository verify:testExists(site/scripts/static-css.test.mjs::a preset's fonts load from site/public/fonts, by a path that holds on Pages and in the repository)

[^dark]: test:site/scripts/static-css.test.mjs::each .dark block is mirrored for the system's dark mode, at :root's specificity, unless the page chose .light or .dark verify:testExists(site/scripts/static-css.test.mjs::each .dark block is mirrored for the system's dark mode, at :root's specificity, unless the page chose .light or .dark)

[^licence]: test:site/scripts/static-css.test.mjs::each file names its source, says not to edit it, and carries the MIT notice; site/public/fonts/LICENSE.txt verify:testExists(site/scripts/static-css.test.mjs::each file names its source, says not to edit it, and carries the MIT notice) verify:fileLine(site/public/fonts/LICENSE.txt, /SIL OPEN FONT LICENSE/)

[^stale]: test:site/scripts/static-css.test.mjs::the committed files under site/public/css are what the script writes; package.json verify:testExists(site/scripts/static-css.test.mjs::the committed files under site/public/css are what the script writes) verify:fileLine(package.json, /static-css\.mts --check/)
