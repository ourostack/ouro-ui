import type { Preview } from "@storybook/react-vite";
import { withThemeByClassName } from "@storybook/addon-themes";
import "../app.css";

const preview: Preview = {
  parameters: {
    layout: "centered",
    // This panel runs axe with Storybook's defaults, which turn off the `region` rule (content
    // outside every landmark) because a story renders bare. It is a viewer, not the gate: the gate
    // is test/story-axe.ts, which runs every rule, `region` included, on each story placed in a
    // page's <main> with its popups portalled into that <main>, so a popup that escapes the page's
    // landmarks fails there.
    a11y: { test: "error" },
  },
  // Dark mode is shadcn's `.dark` class on <html>; the toolbar switches it.
  decorators: [
    withThemeByClassName({
      themes: { light: "", dark: "dark" },
      defaultTheme: "light",
      parentSelector: "html",
    }),
  ],
};

export default preview;
