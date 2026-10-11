import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  // registry/: the stories each item ships. stories/: repository-only stories (references).
  stories: ["../registry/**/*.stories.@(ts|tsx)", "../stories/**/*.stories.@(ts|tsx)"],
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
