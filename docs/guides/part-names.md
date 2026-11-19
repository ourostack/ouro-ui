# Part names

Ouro HX names every element it styles with a `data-slot` attribute, as shadcn/ui does, so an app that styles with plain CSS rather than Tailwind can reach any part of a component, and a test or an agent can find it, by a name that stays put.[^every-part] The names are a contract: they change only with a note in [UPGRADING.md](../../UPGRADING.md).

## The names

- A component's root is named after the component, the same name its `data-ouro` carries: `data-slot="badge"`, `data-slot="dialog"`.
- A part is named after the component and the part: `dialog-title`, `alert-description`, `hero-media`.[^every-part]
- A component's own parts start with its name, so `[data-slot="dialog-title"]` is the dialog's title, never a title of the Card inside it, which is `card-title`.[^stem-prefix]
- When a component draws another component as one of its parts, the part's name goes on that component's root: CodeBlock's copy button is `code-block-copy`, not `copy-button`.[^part-wins] The parts inside it keep their own names, so select them under the part: `[data-slot="code-block-copy"] [data-slot="copy-button-trigger"]`.

Each component's page lists its names under "Part names", such as [Alert's](../Alert.md#part-names).[^docs-check]

## Style a component from plain CSS

Write the rules in your own stylesheet, outside any `@layer`. Tailwind puts the components' utilities in its `utilities` layer, and a rule outside every layer wins over a layered one whatever its specificity, so your rule needs no `!important`.[^unlayered]

```css
[data-slot="alert"] {
  border-style: dashed;
}

[data-slot="alert-title"] {
  letter-spacing: 0.01em;
}

[data-slot="dialog"] [data-slot="dialog-title"] {
  font-family: var(--font-heading);
}
```

Badge, Button and Card paint their fill and border from `--ouro-bg` and `--ouro-bd`, and Dialog's popup its fill from `--ouro-bg`, because where a browser has no `corner-shape` a layer under the element draws them.[^surface] Set those, not `background-color` or `border-color`:

```css
[data-slot="badge"] {
  --ouro-bg: var(--accent);
  --ouro-bd: transparent;
}
```

Read colours, radii and fonts from the theme's variables (`var(--primary)`, `var(--radius)`), as the components do, so your rules follow light and dark and the app's theme.

Select by the name, not by the element or the classes: which element a part is, where it sits in the tree and its Tailwind classes may change in any release; the name may not.

## What the contract covers

- **Tokens first.** A theme's variables (`--primary`, `--radius`, `--font-heading`) restyle the components at once and are still the main way to change how Ouro looks. Reach for a part name for what the tokens cannot say.
- **`className` stays layout.** A component's `className` is for layout, as before (see [Theming](theming.md)); a part name is how an app's own stylesheet reaches the inside of a component.
- **Names change only with a note.** A release that renames or removes a part name says so in [UPGRADING.md](../../UPGRADING.md) with the old and new names. A rename also changes the component's docs page, so it shows in the pull request.[^docs-check]
- **State attributes stay as they are.** Style a state with the attribute the component already sets beside the name (`[data-slot="switch-track"][data-checked]`, `[data-slot="dialog"][data-starting-style]`).

## Beside shadcn/ui components

Ouro uses shadcn's attribute, and some names are the same as shadcn's (`card`, `button`, `dialog-title`). So in an app with both, a rule written for a shadcn part also styles the Ouro part of that name, and shadcn's own classes that look for a name around them (`in-data-[slot=card-content]:…`) apply inside an Ouro part of that name too. To keep a rule to one library, go through the root: only Ouro's roots carry `data-ouro`, its parts don't. So `[data-slot="card"]:not([data-ouro])` is shadcn's Card and `[data-ouro="card"]` Ouro's, and for a part, `[data-slot="card"]:not([data-ouro]) [data-slot="card-content"]` is shadcn's and `[data-ouro="card"] [data-slot="card-content"]` Ouro's. `:not([data-ouro])` on a part alone matches both.

## For contributors

Give every JSX element that has a `className`, and every Heading or Text a component draws, a literal `data-slot`, written before any `{...props}` spread, so the spread lets a parent rename the part. `node scripts/part-names.mts` lists any element without one, and `scripts/part-names.test.mjs` fails on it.[^every-part]

[^every-part]: test:scripts/part-names.test.mjs::every element a registry component styles carries a part name that starts with its stem verify:testExists(scripts/part-names.test.mjs::every element a registry component styles carries a part name that starts with its stem) verify:testExists(scripts/part-names.test.mjs::the part-name scan fails an HTML element or a package's component with classes and no name, a name that is not a literal, not kebab case or not its stem's)
[^stem-prefix]: test:scripts/part-names.test.mjs::the part-name scan fails an HTML element or a package's component with classes and no name, a name that is not a literal, not kebab case or not its stem's verify:testExists(scripts/part-names.test.mjs::the part-name scan fails an HTML element or a package's component with classes and no name, a name that is not a literal, not kebab case or not its stem's)
[^part-wins]: test:test/part-names.test.tsx::part names > name a component another renders as its own part after that part, so a rule for the part reaches only it verify:testExists(test/part-names.test.tsx::part names > name a component another renders as its own part after that part, so a rule for the part reaches only it)
[^unlayered]: test:test/part-names.test.tsx::part names > let an app's plain CSS, outside any layer, restyle a root and a part over the component's own utilities verify:testExists(test/part-names.test.tsx::part names > let an app's plain CSS, outside any layer, restyle a root and a part over the component's own utilities)
[^surface]: registry/ouro/theme/ouro-base.css verify:fileLine(registry/ouro/theme/ouro-base.css, /\[data-ouro-squircle\]\[class\*="bg-\(--ouro-bg\)"\]/) verify:testExists(test/part-names.test.tsx::part names > let an app's plain CSS, outside any layer, restyle a root and a part over the component's own utilities)
[^docs-check]: scripts/gen-docs.mts verify:fileLine(scripts/gen-docs.mts, /## Part names/)
