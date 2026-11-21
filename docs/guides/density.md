# Density

Density is how much room a screen gives its spacing: a compact screen fits more on it, a roomy one reads more easily. Ouro UI takes density from one variable, Tailwind's `--spacing`, and keeps fixed sizes apart from it, so a compact app does not shrink its icons and avatars with its gaps.[^proof]

## What follows density

Gaps, padding and margins follow `--spacing`: `gap-3` and `py-2` are multiples of it.[^spacing] A row's height follows it too when padding sets that height, as a ConversationList row's does, so a compact app tightens its rows.[^proof]

## What doesn't

Fixed sizes read `--ouro-size-*` variables instead. They are defined in `ouro-base.css` in rem, a quarter rem per step: `--ouro-size-8` is `2rem`, and a dot in the step is written as an underscore, as in `--ouro-size-2_5`. Components size those parts with the named utilities ouro-base registers for them, such as `size-ouro-8`, which [read their tokens](registry/ouro/theme/theme.test.tsx "verify:testExists(registry/ouro/theme/theme.test.tsx::fixed sizes > lets an app theme a fixed size by its token, which the named utility reads)"). `--spacing` does not change them.[^tokens]

The fixed parts that use them today are an avatar's box, an avatar group's "+N" count, a conversation row's icon, mark and more button, and the coarse pointer's 44px target.[^floor] Avatar, AvatarGroup and ConversationList read the tokens; other components still size some fixed parts with spacing classes until their own changes land.

## Floors

A row or control a finger touches stays at least 44px tall at every density, so the target is the same size on a phone whatever the app's `--spacing` is.[^floor] It is set with `min-h-ouro-11`, which reads `--ouro-size-11`, not with spacing.

## Set density and a fixed size in your app

Set `--spacing` in an unlayered `:root` rule after your theme, to make a screen compact:

```css
:root {
  --spacing: 0.2rem;
}
```

Set a `--ouro-size-*` variable the same way to theme one fixed size. This one makes the small avatar larger:

```css
:root {
  --ouro-size-8: 2.25rem;
}
```

[^proof]: test:registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx::ConversationList > keeps its avatars' size while its rows tighten at a compact density verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx::ConversationList > keeps its avatars' size while its rows tighten at a compact density)
[^spacing]: registry/ouro/components/ouro/conversation-list/conversation-list.tsx verify:fileLine(registry/ouro/components/ouro/conversation-list/conversation-list.tsx, /density === "compact" \? "py-1\.5" : "py-2"/)
[^tokens]: registry/ouro/theme/ouro-base.css verify:fileLine(registry/ouro/theme/ouro-base.css, /--ouro-size-8: 2rem;/) verify:testExists(registry/ouro/theme/theme.test.tsx::fixed sizes > keeps a fixed size at its step under a compact --spacing, where a spacing-scale size shrinks)
[^floor]: test:registry/ouro/components/ouro/conversation-list/conversation-list.touch.test.tsx::gives each ConversationList row and section header a target at least 44px tall to a finger, even when compact verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.touch.test.tsx::gives each ConversationList row and section header a target at least 44px tall to a finger, even when compact) verify:fileLine(registry/ouro/components/ouro/conversation-list/conversation-list.tsx, /pointer-coarse:min-h-ouro-11/)
