import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../registry/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-a11y", "@storybook/addon-docs"],
  framework: "@storybook/react-vite",
  // `src/styles.css` uses Tailwind v4 directives, so Vite needs the plugin.
  // Keep native light-dark(), as dist/styles.css ships it: Tailwind's optimizer
  // and Vite's CSS minifier would otherwise lower it to variables that only follow
  // a stylesheet's color-scheme, so the stories' dark panels would render light.
  viteFinal: (viteConfig) => ({
    ...viteConfig,
    resolve: { ...viteConfig.resolve, alias: { ...viteConfig.resolve?.alias, "@": fileURLToPath(new URL("..", import.meta.url)) } },
    build: { ...viteConfig.build, cssTarget: ["chrome123", "edge123", "firefox120", "safari17.5"] },
    plugins: [...(viteConfig.plugins ?? []), tailwindcss({ optimize: false })],
  }),
};

export default config;
