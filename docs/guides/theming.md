# Theming

Ouro HX parts paint themselves from a small set of CSS variables, the ones a shadcn/ui theme sets. Change them and your app changes coats: buttons, menus, dialogs, charts and focus rings, without touching a component.

You can try it on the [home page](/): pick one of the coloured dots near the top, or open "Theme" in the header.

## Start from a preset

On the home page, choose a preset under "Repaint the whole ship", then press "Copy theme". Paste what you copied at the end of your global CSS. It brings `:root`, `.dark`, `@theme inline` and the preset's fonts. "Copy tokens only" brings just the variables, if you already load your own fonts.

The default look, Pearl, is what `ouro-theme` installs:

```sh
npx shadcn@latest add ourostack/ouro-ui/ouro-theme#v1.3.48
```

## Mix your own paint

A theme's personality lives in a handful of lines. Put these after your theme's CSS and change the values:

```css
:root {
  --primary: #1a7f37;
  --primary-foreground: #ffffff;
  --ring: #1a7f37;
  --radius: 0.5rem;
}
.dark {
  --primary: #3fb950;
  --primary-foreground: #04170a;
  --ring: #3fb950;
}
```

- `--primary` is your brand colour: the main button, links, the checked box, the chosen tab.
- `--primary-foreground` is the text that sits on it. Keep it readable: at least 4.5 to 1 against `--primary`.
- `--ring` is the focus ring that keyboard users follow.
- `--radius` sets the corners. `0rem` is square; `1rem` is pebble-round.

The maker on the home page, under "Or mix your own paint", writes these lines for you while the sample repaints.

## Go further

The other variables cover the rest of the room: `--background` and `--foreground` for the page, `--card` and `--popover` for raised surfaces, `--muted` and `--muted-foreground` for quiet text, `--border` and `--input` for lines, `--destructive` for danger, `--chart-1` to `--chart-5` for data. Ouro HX also reads `--font-heading` for headings and the `--shadow-xs` to `--shadow-xl` scale for depth.

Headings are set a little tighter at each larger size, which suits a sans-serif.[^tighter] A serif heading font has less room between its letters, so with one in `--font-heading`, set `--ouro-heading-tracking` in `:root` to the share of that tightening to keep: `0.5` for half, `0` for the font's own spacing. It defaults to `1`.[^tracking]

### Dark mode

Set light values in `:root` and dark values in `.dark`. Ouro HX switches with the `dark` class on `<html>`, as shadcn/ui does.

A site that marks dark mode another way, such as `data-theme="dark"` on `<html>` with the system setting when no theme is chosen, keys its dark values to that instead, and redefines Tailwind's `dark` variant to match, so Ouro HX's `dark:` styles, Hero's night art among them, follow the same signal.[^variant]

```css
@custom-variant dark {
  &:where([data-theme="dark"], [data-theme="dark"] *) {
    @slot;
  }
  @media (prefers-color-scheme: dark) {
    &:where(:root:not([data-theme="light"]) *) {
      @slot;
    }
  }
}
```

## Live

The site's Live theme is Pearl under your own sky. It reads only your device's clock and time zone, so nothing asks for your location. At dawn the page turns rosy, by day it is Pearl's blue, at dusk it goes golden and at night it lights indigo lanterns. The porthole's sky, sun and sea follow along. Your own app can do the same by swapping a few of the variables above on a timer.

[^tracking]: registry/ouro/components/ouro/text/heading.test.tsx verify:testExists(registry/ouro/components/ouro/text/heading.test.tsx::Heading tracking > scales the tightening by the theme's --ouro-heading-tracking, so a serif heading font can keep its own spacing)

[^tighter]: registry/ouro/components/ouro/text/heading.test.tsx verify:testExists(registry/ouro/components/ouro/text/heading.test.tsx::Heading tracking > tightens as the text grows: none at body size, more at each larger size)

[^variant]: registry/ouro/components/ouro/hero/hero.tsx verify:fileLine(registry/ouro/components/ouro/hero/hero.tsx, /dark: "hidden dark:block"/)
