import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import comments from "./scripts/lint/comments.mjs";

export default tseslint.config(
  // ouro-feel-probe.js is built from feel/probe/probe.ts, which is linted (scripts/registry.mts feelProbeScript).
  { ignores: ["dist", "coverage", "storybook-static", "_site", "node_modules", ".tmp", "site/dist", "test/install-fixture", "test/install-fixture-tests", "test/install-fixture-upgrade", "test/install-fixture-next", "test/install-fixture-themes", "scripts/agent-usability/runs", "scripts/agent-benchmark/vendor", "scripts/ouro-actions", "scripts/ouro-census/**/fixtures", "scripts/agent-benchmark/fixture/generated", "scripts/agent-benchmark/results", "test-results", "playwright-report", "registry/ouro/feel/ouro-feel-probe.js"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    // Destructuring a prop out of `rest` is how components drop it before spreading to the DOM.
    files: ["registry/**/*.{ts,tsx}"],
    rules: { "@typescript-eslint/no-unused-vars": ["error", { ignoreRestSiblings: true }] },
  },
  {
    plugins: { comments },
    rules: { "comments/no-orphan-doc": "error" },
  },
  {
    files: ["**/*.{mjs,js}"],
    languageOptions: { globals: { process: "readonly", console: "readonly" } },
  },
);
