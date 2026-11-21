# Part names

Ouro HX names the parts of its most-styled components with a `data-slot` attribute, the names shadcn/ui gives its own parts, so a stylesheet that is written in plain CSS, code ported from shadcn/ui and a test can reach a part by a name that stays put.[^shadcn-names]

## The named components

Every styled element of these components carries a name: Alert, Badge, Button, Card, Checkbox, Dialog, Field (its label, control and description), Popover, Select, Separator, Sheet, Switch, Tabs, TextField and Tooltip.[^named] Their names are a contract: a release that renames one says so in [UPGRADING.md](../../UPGRADING.md).

The other components are not named yet. `scripts/part-names-baseline.json` counts each one's styled elements with no name, and that count may only shrink.[^ratchet] A component joins the named list when its count reaches zero.[^ratchet]

## The naming rule

- A part is named as shadcn/ui names the same part: `dialog-title`, `card-header`, `sheet-content`, `select-trigger`. Where shadcn's name is for a different element, Ouro's part takes shadcn's name for the same thing: `input` is TextField's control and `label` is Field's label.[^alias]
- A part Ouro has and shadcn does not is named for its component and the part: `alert-body`, `card-rise`, `dialog-scroller`.
- A component's root carries the component's name, as `button` and `card` do.[^roots] Dialog, Popover, Select, Sheet and Tooltip name their popup `<component>-content`, as shadcn names it.[^popups] A Field's root is named for its owner: `text-field`, `checkbox`.[^alias]
- Names are kebab case, and a component's own parts start with its name.[^scan]

A parent can rename a part by passing its own `data-slot`. Ouro writes the name before the props it spreads, so the parent's name wins: `<Button data-slot="save-button">` renders `save-button`, not `button`.[^parent-wins]

## Style a part from plain CSS

Write the rules in your own stylesheet, outside any `@layer`. A rule outside every layer wins over a layered one whatever its specificity, so the component's own utilities need no override.[^unlayered]

```css
[data-slot="alert"] {
  border-style: dashed;
}

[data-slot="card-title"] {
  letter-spacing: 0.01em;
}

[data-slot="dialog-content"] [data-slot="dialog-title"] {
  font-family: var(--font-heading);
}
```

Read colours, radii and fonts from the theme's variables (`var(--primary)`, `var(--radius)`), as the components do, so your rules follow light and dark and the app's theme.

Select by the name, not by the element, its place in the tree or its Tailwind classes: those may change in any release, and the name does not.

## Beside shadcn/ui components

Ouro uses shadcn's attribute, and some names are the same as shadcn's (`card`, `button`, `dialog-title`). So in an app with both, a rule written for a shadcn part also styles the Ouro part of that name. To keep a rule to one library, select Ouro's component by its `data-ouro` value: `[data-ouro="card"]` is Ouro's Card, and `[data-slot="card"]:not([data-ouro])` is shadcn's.[^roots]

## For contributors

A styled element in a named component needs a literal `data-slot`, written before any `{...props}` spread. `node scripts/part-names.mts` lists the elements with no name, and `scripts/part-names.test.mjs` fails on them, on a name that is not kebab case or does not start with its component's name, and on a count in the baseline that rose or fell.[^scan][^ratchet] `node scripts/part-names.mts --write` lowers the baseline's counts to the current ones once a component's names have landed.[^ratchet]

[^shadcn-names]: https://github.com/shadcn-ui/ui/blob/45bbf9ba23c9c0f63d38887947e5fb06f59c7da3/apps/v4/registry/new-york-v4/ui/dialog.tsx verify:urlOk(https://github.com/shadcn-ui/ui/blob/45bbf9ba23c9c0f63d38887947e5fb06f59c7da3/apps/v4/registry/new-york-v4/ui/dialog.tsx) verify:testExists(scripts/part-names.test.mjs::the named components carry the shadcn names their roots and parts use, and an Ouro-only part starts with its stem)
[^named]: scripts/part-names-baseline.json verify:testExists(scripts/part-names.test.mjs::every element a named component styles carries a part name, and the other components hold their ratchet)
[^ratchet]: scripts/part-names-baseline.json verify:testExists(scripts/part-names.test.mjs::the ratchet fails when a component's unnamed count rises or falls, and writes the count back when it falls) verify:testExists(scripts/part-names.test.mjs::every element a named component styles carries a part name, and the other components hold their ratchet)
[^scan]: test:scripts/part-names.test.mjs::the part-name scan fails a named component's unnamed element, a name that is not a literal, not kebab case, not its stem's, or after a spread verify:testExists(scripts/part-names.test.mjs::the part-name scan fails a named component's unnamed element, a name that is not a literal, not kebab case, not its stem's, or after a spread)
[^popups]: test:scripts/part-names.test.mjs::the named components carry the shadcn names their roots and parts use, and an Ouro-only part starts with its stem verify:testExists(scripts/part-names.test.mjs::the named components carry the shadcn names their roots and parts use, and an Ouro-only part starts with its stem)
[^roots]: test:test/part-names.test.tsx::part names > name the roots and parts of Button, Card, Badge and Alert as shadcn names them verify:testExists(test/part-names.test.tsx::part names > name the roots and parts of Button, Card, Badge and Alert as shadcn names them)
[^alias]: test:test/part-names.test.tsx::part names > name a TextField's input and label, and a Checkbox's box and indicator, as shadcn names them verify:testExists(test/part-names.test.tsx::part names > name a TextField's input and label, and a Checkbox's box and indicator, as shadcn names them)
[^parent-wins]: test:test/part-names.test.tsx::part names > keep a name a parent passes, so an app can rename a part of a component verify:testExists(test/part-names.test.tsx::part names > keep a name a parent passes, so an app can rename a part of a component)
[^unlayered]: test:test/part-names.test.tsx::part names > let an app's plain CSS, outside any layer, restyle a named part over the component's own utilities verify:testExists(test/part-names.test.tsx::part names > let an app's plain CSS, outside any layer, restyle a named part over the component's own utilities)
