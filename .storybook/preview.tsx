import type { Preview } from "@storybook/react-vite";
import { withThemeByClassName } from "@storybook/addon-themes";
import "../app.css";

const preview: Preview = {
  parameters: {
    layout: "centered",
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
