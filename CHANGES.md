# Changes in this release

- Fix: Item's and Card's shipped tests find the rule that hides revealed actions where the app's Tailwind leaves it nested and writes `opacity: 0%`, as Tailwind 4.1 does, so they pass in an app on 4.1 ([test](registry/ouro/components/ouro/item/item.test.tsx "verify:testExists(registry/ouro/components/ouro/item/item.test.tsx::Item > finds the hiding rule where the app's Tailwind leaves it nested, as 4.1 does, so the check above holds there too)")).
