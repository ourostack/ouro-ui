# Changes in this release

- Changed: [`ouro-base` grows the root type a step on a very wide screen at 1x: 112.5% from 2400px wide and 125% (20px) from 3200px, then stops](registry/ouro/theme/theme.test.tsx "verify:testExists(registry/ouro/theme/theme.test.tsx::wide-screen type > grows the root a step at 2400px and another at 3200px, then stops at 20px, so a 4K screen at 1x reads at a laptop's size)"), so a 4K display reads at a laptop's size in every app. An app's own `html { font-size }` outside any layer still wins.
