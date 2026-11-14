import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  // registry/: the stories each item ships. stories/: repository-only stories (references).
  stories: ["../registry/**/*.stories.@(ts|tsx)", "../stories/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-a11y", "@storybook/addon-docs", "@storybook/addon-themes"],
  framework: "@storybook/react-vite",
  // app.css compiles the registry source with Tailwind, as an app does.
  viteFinal: (viteConfig) => {
    // A scratch build under .tmp/ (the MCP app host spec writes an .html there) made Vite
    // reload every open story page mid-test (ourostack/ouro-ui#1272).
    const watched = viteConfig.server?.watch?.ignored;
    const ignored = watched === undefined ? [] : Array.isArray(watched) ? watched : [watched];
    return {
      ...viteConfig,
      resolve: { ...viteConfig.resolve, alias: { ...viteConfig.resolve?.alias, "@": fileURLToPath(new URL("..", import.meta.url)) } },
      plugins: [...(viteConfig.plugins ?? []), tailwindcss()],
      server: {
        ...viteConfig.server,
        watch: { ...viteConfig.server?.watch, ignored: [...ignored, "**/.tmp/**", "**/test-results/**", "**/playwright-report/**"] },
      },
    };
  },
};

export default config;
