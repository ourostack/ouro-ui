import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "coverage", "storybook-static", "node_modules", ".tmp", "site/dist"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    // Destructuring a prop out of `rest` is how components drop it before spreading to the DOM.
    files: ["registry/**/*.{ts,tsx}", "src/**/*.{ts,tsx}"],
    rules: { "@typescript-eslint/no-unused-vars": ["error", { ignoreRestSiblings: true }] },
  },
  {
    files: ["**/*.{mjs,js}"],
    languageOptions: { globals: { process: "readonly", console: "readonly" } },
  },
);
