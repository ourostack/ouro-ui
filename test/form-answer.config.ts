import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL("..", import.meta.url)),
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("..", import.meta.url)) }, dedupe: ["react", "react-dom"] },
  test: {
    environment: "jsdom",
    include: ["registry/ouro/lib/ouro/form-errors.test.ts", "test/form-answer.probe.tsx"],
    expect: { poll: { timeout: 10_000 } },
    coverage: {
      provider: "istanbul",
      include: ["registry/ouro/lib/ouro/form-errors.ts"],
      reportsDirectory: ".tmp/adopt-a-form-value/node-coverage",
      reporter: ["text", "json"],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
