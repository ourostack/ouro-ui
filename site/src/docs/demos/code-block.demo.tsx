import { type JSX } from "react";
import { CodeBlock } from "@/registry/ouro/components/ouro/code-block/code-block";

// The live demo at the top of docs/code-block/: the component as an app would use it, with its props, nothing else.

const config = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({ plugins: [react()] });`;

// Terminal output as `tmux capture-pane -e` saves it: the escape codes dim the thinking.
const capture = `\x1b[2mthinking: they want a listing, so I'll call list_files\x1b[0m
\x1b[36m→ list_files\x1b[39m \x1b[90m{ "path": "." }\x1b[0m
There are three files here: agent.ts, package.json and README.md.`;

export default function CodeBlockDemo(): JSX.Element {
  return (
    <div className="grid max-w-lg gap-3">
      <CodeBlock language="bash" code="npm install --save-dev vitest" />
      <CodeBlock title="vite.config.ts" language="ts" code={config} />
      <CodeBlock title="What I saw" language="ansi" code={capture} copy={false} wrap />
    </div>
  );
}
