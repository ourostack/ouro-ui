import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../registry/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-a11y", "@storybook/addon-docs", "@storybook/addon-themes"],
  framework: "@storybook/react-vite",
  // app.css compiles the registry source with Tailwind, as an app does.
  viteFinal: (viteConfig) => ({
    ...viteConfig,
    resolve: { ...viteConfig.resolve, alias: { ...viteConfig.resolve?.alias, "@": fileURLToPath(new URL("..", import.meta.url)) } },
    plugins: [...(viteConfig.plugins ?? []), tailwindcss()],
  }),
};

export default config;
