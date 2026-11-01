# Theming

Ouro HX parts paint themselves from a small set of CSS variables, the ones a shadcn/ui theme sets. Change them and your app changes coats: buttons, menus, dialogs, charts and focus rings, without touching a component.

You can try it on the [home page](/): pick one of the coloured dots near the top, or open "Theme" in the header.

## Start from a preset

On the home page, choose a preset under "Repaint the whole ship", then press "Copy theme". Paste what you copied at the end of your global CSS. It brings `:root`, `.dark`, `@theme inline` and the preset's fonts. "Copy tokens only" brings just the variables, if you already load your own fonts.

The default look, Pearl, is what `ouro-theme` installs:

```sh
npx shadcn@latest add ourostack/ouro-ui/ouro-theme#v1.2.14
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

Set light values in `:root` and dark values in `.dark`. Ouro HX switches with the `dark` class on `<html>`, as shadcn/ui does.

## Live

The site's Live theme is Pearl under your own sky. It reads only your device's clock and time zone, so nothing asks for your location. At dawn the page turns rosy, by day it is Pearl's blue, at dusk it goes golden and at night it lights indigo lanterns. The porthole's sky, sun and sea follow along. Your own app can do the same by swapping a few of the variables above on a timer.
