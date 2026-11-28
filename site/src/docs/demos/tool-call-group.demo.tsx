import { type JSX } from "react";
import { ToolCallGroup } from "@/registry/ouro/components/ouro/tool-call/tool-call-group";

// The live demo at the top of docs/tool-call-group/: the component as an app would use it, with its props, nothing else.

export default function ToolCallGroupDemo(): JSX.Element {
  return (
    <div className="grid w-full max-w-xl gap-3">
      <ToolCallGroup
        calls={[
          { id: "read", name: "Read file", detail: "recipes/roast.md", status: "done", duration: 0.4 },
          { id: "search", name: "Searched the web", detail: "rice on the stove for six", status: "running" },
        ]}
      />
      <ToolCallGroup
        calls={[
          { id: "read", name: "Read file", detail: "recipes/roast.md", status: "done", duration: 0.4, output: "# Roast\n\nOven at 200°C for an hour." },
          { id: "search", name: "Searched the web", detail: "rice on the stove for six", status: "done", duration: 2.1 },
          { id: "test", name: "Ran command", detail: "npm test", status: "failed", duration: 4.2, output: "Tests  1 passed, 1 failed" },
        ]}
      />
    </div>
  );
}
