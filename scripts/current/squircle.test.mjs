import assert from "node:assert/strict";
import { test } from "node:test";
import ts from "typescript";
import { buildConfigs, wireSquircles } from "./squircle.mjs";

const PLUGIN = "src/lib/ouro/squircle-corners.ts";
/** The syntax errors TypeScript finds in a config file, as its bundler would parse it. */
const syntaxErrors = (path, text) => ts.transpileModule(text, { fileName: path, reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.ESNext, allowJs: true } }).diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
const wire = (files, plugin = PLUGIN) => wireSquircles({ dir: "", files: new Map(Object.entries(files)), plugin });

const ASTRO = `// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://ouroboros.bot',
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()]
  },
});
`;

test("squircles: an Astro config gets the plugin in its vite options, imported in its own quotes, and still parses", () => {
  const result = wire({ "astro.config.mjs": ASTRO });
  assert.equal(result.held, null);
  const text = result.files["astro.config.mjs"];
  assert.equal(
    text,
    ASTRO.replace("import react from '@astrojs/react';\n", "import react from '@astrojs/react';\nimport { squircleCorners } from './src/lib/ouro/squircle-corners';\n").replace("  vite: {\n", "  vite: {\n    css: { postcss: { plugins: [squircleCorners()] } },\n"),
  );
  assert.deepEqual(syntaxErrors("astro.config.mjs", text), []);
  assert.ok(result.notes.some((note) => note.includes("`astro.config.mjs`") && note.includes("`squircleCorners()`")), "the pull request says where it wired the plugin");
});

test("squircles: an Astro config with no vite options gets them", () => {
  const text = wire({ "astro.config.ts": 'import { defineConfig } from "astro/config";\nexport default defineConfig({\n  site: "https://example.test",\n});\n' }).files["astro.config.ts"];
  assert.equal(text, 'import { defineConfig } from "astro/config";\nimport { squircleCorners } from "./src/lib/ouro/squircle-corners";\nexport default defineConfig({\n  vite: { css: { postcss: { plugins: [squircleCorners()] } } },\n  site: "https://example.test",\n});\n');
});

test("squircles: a Vite config written as a function adds postcss to its own css options, never to a nested css key such as Vitest's", () => {
  const vite = [
    'import { defineConfig } from "vite";',
    'import react from "@vitejs/plugin-react"',
    "",
    "const label = `css: { ${1 + 1} }`;",
    "export default defineConfig(({ command }) => ({",
    "  plugins: [react()],",
    "  test: { css: true, name: '}' },",
    "  css: { devSourcemap: command === \"serve\" },",
    "}));",
    "",
  ].join("\n");
  const result = wire({ "vite.config.ts": vite });
  const text = result.files["vite.config.ts"];
  assert.equal(text, vite.replace('import react from "@vitejs/plugin-react"\n', 'import react from "@vitejs/plugin-react"\nimport { squircleCorners } from "./src/lib/ouro/squircle-corners"\n').replace("  css: { devSourcemap", "  css: { postcss: { plugins: [squircleCorners()] }, devSourcemap"));
  assert.deepEqual(syntaxErrors("vite.config.ts", text), []);
});

test("squircles: a package's config imports the plugin relative to its own folder", () => {
  const result = wireSquircles({ dir: "apps/web/", files: new Map([["apps/web/vite.config.ts", 'import { defineConfig } from "vite";\nexport default defineConfig({});\n']]), plugin: "apps/web/src/lib/ouro/squircle-corners.ts" });
  assert.equal(result.files["apps/web/vite.config.ts"], 'import { defineConfig } from "vite";\nimport { squircleCorners } from "./src/lib/ouro/squircle-corners";\nexport default defineConfig({ css: { postcss: { plugins: [squircleCorners()] } } });\n');
});

test("squircles: a build that already names squircleCorners() is left as it is", () => {
  const result = wire({ "vite.config.ts": 'import { squircleCorners } from "./src/lib/ouro/squircle-corners";\nexport default { css: { postcss: { plugins: [squircleCorners()] } } };\n', "vitest.config.ts": "export default {};\n" });
  assert.deepEqual(result, { files: {}, notes: [], held: null });
});

test("squircles: an app whose PostCSS plugins live in a postcss.config file is held back, with the lines to add", () => {
  const result = wire({ "vite.config.ts": 'import { defineConfig } from "vite";\nexport default defineConfig({});\n', "postcss.config.js": 'export default { plugins: { "@tailwindcss/postcss": {} } };\n' });
  assert.deepEqual(result.files, {});
  assert.match(result.held, /`postcss\.config\.js`/);
  assert.match(result.held, /squircleCorners\(\)/);
  assert.match(result.held, /lib-squircle-corners/, "it names the item to install");
});

test("squircles: a config Ouro Current cannot read the options of, or none at all, holds the update back and says why", () => {
  assert.match(wire({ "vite.config.ts": "const config = { plugins: [] };\nexport default config;\n" }).held, /`vite\.config\.ts`/);
  assert.match(wire({ "vite.config.ts": 'export default defineConfig({ css: { postcss: "./postcss" } });\n' }).held, /`vite\.config\.ts`/, "PostCSS options of its own are the app's");
  assert.match(wire({ "vite.config.ts": "export default defineConfig({ css: cssOptions });\n" }).held, /`vite\.config\.ts`/);
  assert.match(wire({}).held, /no `vite\.config` or `astro\.config`/);
  assert.match(wire({ "vite.config.ts": "export default {};\n", "astro.config.mjs": "export default {};\n" }).held, /`astro\.config\.mjs` and `vite\.config\.ts`/);
});

test("squircles: another Vite config that builds the app's CSS apart from the wired one is named, and one that reads the wired one is not", () => {
  const result = wire({
    "vite.config.ts": "export default {};\n",
    "vitest.config.ts": 'import { mergeConfig } from "vitest/config";\nimport viteConfig from "./vite.config";\nexport default mergeConfig(viteConfig, {});\n',
    "vitest.ouro.config.ts": "export default { test: {} };\n",
  });
  assert.equal(result.held, null);
  assert.ok(result.notes.some((note) => note.includes("`vitest.ouro.config.ts`")));
  assert.ok(!result.notes.some((note) => note.includes("`vitest.config.ts`")));
});

test("squircles: the build configs are the package's own Vite, Vitest, Astro and PostCSS configs, outside node_modules", () => {
  const paths = ["vite.config.ts", "vitest.ouro.config.ts", "astro.config.mjs", "postcss.config.cjs", ".storybook/vite.config.ts", "playwright.config.ts", "node_modules/x/vite.config.js", "apps/web/vite.config.ts", "src/vite.config.ts.snap"];
  assert.deepEqual(buildConfigs(paths, "").sort(), [".storybook/vite.config.ts", "astro.config.mjs", "postcss.config.cjs", "vite.config.ts", "vitest.ouro.config.ts"]);
  assert.deepEqual(buildConfigs(paths, "apps/web/"), ["apps/web/vite.config.ts"]);
});
