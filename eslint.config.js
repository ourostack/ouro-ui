import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "coverage", "storybook-static", "_site", "node_modules", ".tmp", "site/dist", "test/install-fixture", "test/install-fixture-tests", "test/install-fixture-upgrade", "test/install-fixture-next", "test/install-fixture-themes", "scripts/agent-usability/runs", "test-results", "playwright-report"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    // Destructuring a prop out of `rest` is how components drop it before spreading to the DOM.
    files: ["registry/**/*.{ts,tsx}"],
    rules: { "@typescript-eslint/no-unused-vars": ["error", { ignoreRestSiblings: true }] },
  },
  {
    files: ["**/*.{mjs,js}"],
    languageOptions: { globals: { process: "readonly", console: "readonly" } },
  },
);
