# Changes in this release

- ouro-base: `ouro-disclosure`, `ouro-disclosure-summary` and `ouro-disclosure-panel` draw a `<details>` disclosure as `Collapsible` draws its title, for pages that run without a script, and the Ouro source rule counts them, and a row laid out around an open one with `:has(.ouro-disclosure[open])`, as Ouro's. Add `ouro-base` again to get them; the plain stylesheet `site/public/css/ouro-base.css` has them too.
