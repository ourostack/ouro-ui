import { type JSX } from "react";
import { CodeBlock } from "@/registry/ouro/components/ouro/code-block/code-block";

// The live demo at the top of docs/code-block/: the component as an app would use it, with its props, nothing else.

const config = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({ plugins: [react()] });`;

export default function CodeBlockDemo(): JSX.Element {
  return (
    <div className="grid max-w-lg gap-3">
      <CodeBlock language="bash" code="npm install --save-dev vitest" />
      <CodeBlock title="vite.config.ts" language="ts" code={config} />
    </div>
  );
}
