# Beside an incumbent design system

A company with a design system of its own will not take on a second one, and Ouro HX does not ask it to. This guide adopts Ouro HX one page at a time beside the incumbent library, with the incumbent's tokens drawing the colors, and with the guardrail kits recording what the incumbent still draws rather than failing it.

Ouro HX is copy-in source: nothing replaces the incumbent's package, and an app keeps both until the last page moves.

## What the app needs first

Ouro HX compiles in an app with Tailwind CSS v4, a shadcn-style `@/*` alias and React 19.[^floor] [Installing](installing.md) lists the steps. An app on an older toolchain moves to those first, as its own change, and the incumbent keeps working while it does. Nothing here works around that floor.

## 1. Give Ouro the incumbent's tokens

Ouro HX paints from shadcn's token names (`--primary`, `--background`, `--border`, `--ring`), which components read at runtime.[^tokens] Add `ouro-base` once, skip the optional `ouro-theme`, and set those names from the incumbent's own variables in your global CSS:

```css
:root {
  --background: var(--acme-surface-default);
  --foreground: var(--acme-text-default);
  --primary: var(--acme-brand-500);
  --primary-foreground: var(--acme-text-on-brand);
  --border: var(--acme-border-subtle);
  --ring: var(--acme-focus);
}
```

A page now takes the incumbent's colors from one place, so a change to the incumbent's tokens reaches the Ouro parts on it too. Radius, shadows and fonts come from the theme the same way: [Theming](theming.md) lists the names.[^only-base]

## 2. Adopt page by page

Add the components a page needs, and replace the incumbent's controls on that page. The two libraries can sit in one tree, because Ouro parts carry no class prefix and no stylesheet of their own.[^noprefix]

Do not make the first move a page's whole worth of components. Pick a page with few controls, move it, and run the kits below before the next.

## 3. Record the incumbent in the baselines

The [guardrail kits](guardrails.md) are built for an app that is not clean yet. They record where the app starts and only let the count fall.

- **Source rule.** The source rule finds elements from another UI-control library, such as MUI, Chakra or Radix, in your source. Run `node scripts/ouro-source-rules.mjs --write-baseline` once: the incumbent's controls become the starting point, a new one fails, and a fixed one fails until the baseline drops it.[^baseline] The incumbent's controls pass today and cannot grow.
- **Census.** Leave a journey unenrolled while the incumbent still draws part of its page. Its unmarked controls are counted, and the count may only fall in each state.[^census] Set `enrolled: true` once the page has moved, and any control without an Ouro marker fails from then on.[^census]

A pull request that moves a page lowers both counts, and the diff shows it.

## 4. Keep the incumbent where Ouro has no part yet

When the incumbent has a control Ouro HX lacks, leave it in the baseline, and add the missing part to Ouro UI first when it is a general one: [Contributing](https://github.com/ourostack/ouro-ui/blob/main/AGENTS.md) says how.

## What Ouro does not do

It does not read the incumbent's components or tokens by itself, and it does not remove the incumbent's package. It also does not wrap an incumbent control to make it pass the source rule: a wrapped control is still found, however deep the wrapping.

[^floor]: test/install-fixture/package.json verify:fileLine(test/install-fixture/package.json, /"tailwindcss": "\^4\./)
[^noprefix]: AGENTS.md verify:fileLine(AGENTS.md, /Give a component neither a class prefix nor a stylesheet of its own/)
[^tokens]: test/theme-tokens.test.tsx verify:fileLine(test/theme-tokens.test.tsx, /sentinel/)
[^only-base]: test:scripts/registry.test.mjs::only ouro-base, ouro-plain and ouro-theme touch the app's stylesheet, and no other item installs them verify:testExists(scripts/registry.test.mjs::only ouro-base, ouro-plain and ouro-theme touch the app's stylesheet, and no other item installs them)
[^baseline]: scripts/kits/source-rules.test.mjs verify:testExists(scripts/kits/source-rules.test.mjs::the baseline > fails a new offender, and one more of a known fingerprint)
[^census]: scripts/kits/census-update.test.mjs verify:testExists(scripts/kits/census-update.test.mjs::checkCensusState > lets an unenrolled journey hold unmarked controls) verify:testExists(scripts/kits/census-update.test.mjs::the unmarked ratchet > refuses a rise in one state even when another state of the journey falls by as much)
