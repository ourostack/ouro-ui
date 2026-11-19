# Part names

Ouro HX names every element it styles with a `data-slot` attribute, as shadcn/ui does, so an app that styles with plain CSS rather than Tailwind can reach any part of a component, and a test or an agent can find it, by a name that stays put.[^every-part] The names are a contract: they change only with a note in [UPGRADING.md](../../UPGRADING.md).

## The names

- A component's root is named after the component, the same name its `data-ouro` carries: `data-slot="badge"`, `data-slot="dialog"`.
- A part is named after the component and the part: `dialog-title`, `alert-description`, `hero-media`.[^every-part]
- Every name starts with its component's, so `[data-slot="dialog-title"]` never matches the title of a Card inside the dialog.[^stem-prefix]
- When a component draws another component as one of its parts, the part's name wins: CodeBlock's copy button is `code-block-copy`, not `copy-button`.[^part-wins]

Each component's page lists its names under "Part names", such as [Alert's](../Alert.md#part-names).[^docs-check] Ouro's names follow shadcn's where the part is the same (`dialog-title`, `select-trigger`, `slider-thumb`), so a selector written for a shadcn component often finds its Ouro counterpart.

## Style a component from plain CSS

Write the rules in your own stylesheet, outside any `@layer`. Tailwind puts the components' utilities in its `utilities` layer, and a rule outside every layer wins over a layered one whatever its specificity, so your rule needs no `!important`.[^unlayered]

```css
[data-slot="badge"] {
  background-color: var(--accent);
}

[data-slot="alert-title"] {
  letter-spacing: 0.01em;
}

[data-slot="dialog"] [data-slot="dialog-title"] {
  font-family: var(--font-heading);
}
```

Read colours, radii and fonts from the theme's variables (`var(--primary)`, `var(--radius)`), as the components do, so your rules follow light and dark and the app's theme.

Select by the name, not by the element or the classes: which element a part is, where it sits in the tree and its Tailwind classes may change in any release; the name may not.

## What the contract covers

- **Tokens first.** A theme's variables (`--primary`, `--radius`, `--font-heading`) restyle the components at once and are still the main way to change how Ouro looks. Reach for a part name for what the tokens cannot say.
- **`className` stays layout.** A component's `className` is for layout, as before (see [Theming](theming.md)); a part name is how an app's own stylesheet reaches the inside of a component.
- **Names change only with a note.** A release that renames or removes a part name says so in [UPGRADING.md](../../UPGRADING.md) with the old and new names. A rename also changes the component's docs page, so it shows in the pull request.[^docs-check]
- **State attributes stay as they are.** Style a state with the attribute the component already sets beside the name (`[data-slot="switch"][data-checked]`, `[data-slot="dialog"][data-starting-style]`).

## For contributors

Give every JSX element that has a `className` a literal `data-slot`, written first on the element, so a `{...props}` spread after it lets a parent rename the part. `node scripts/part-names.mts` lists any element without one, and `scripts/part-names.test.mjs` fails on it.[^every-part]

[^every-part]: test:scripts/part-names.test.mjs::every element a registry component styles carries a part name that starts with its stem verify:testExists(scripts/part-names.test.mjs::every element a registry component styles carries a part name that starts with its stem) verify:testExists(scripts/part-names.test.mjs::the part-name scan fails an HTML element or a package's component with classes and no name, a name that is not a literal, not kebab case or not its stem's)
[^stem-prefix]: test:scripts/part-names.test.mjs::the part-name scan fails an HTML element or a package's component with classes and no name, a name that is not a literal, not kebab case or not its stem's verify:testExists(scripts/part-names.test.mjs::the part-name scan fails an HTML element or a package's component with classes and no name, a name that is not a literal, not kebab case or not its stem's)
[^part-wins]: test:test/part-names.test.tsx::part names > name a component another renders as its own part after that part, so a rule for the part reaches only it verify:testExists(test/part-names.test.tsx::part names > name a component another renders as its own part after that part, so a rule for the part reaches only it)
[^unlayered]: test:test/part-names.test.tsx::part names > let an app's plain CSS, outside any layer, restyle a root and a part over the component's own utilities verify:testExists(test/part-names.test.tsx::part names > let an app's plain CSS, outside any layer, restyle a root and a part over the component's own utilities)
[^docs-check]: scripts/gen-docs.mts verify:fileLine(scripts/gen-docs.mts, /## Part names/)
