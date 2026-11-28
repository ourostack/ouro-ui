import { type JSX } from "react";
import { ToolCall } from "@/registry/ouro/components/ouro/tool-call/tool-call";

// The live demo at the top of docs/tool-call/: the component as an app would use it, with its props, nothing else.

export default function ToolCallDemo(): JSX.Element {
  return (
    <div className="grid w-full max-w-xl">
      <ToolCall name="Searched the web" detail="one-oven dinner for six" status="running" />
      <ToolCall name="Read file" detail="recipes/roast.md" status="done" duration={0.4} output={"# Roast\n\nOven at 200°C for an hour.\nRest for fifteen minutes before carving."} outputLanguage="md" />
      <ToolCall name="Ran command" detail="npm test" status="failed" duration={4.2} output={"✓ scales a recipe for six\n✗ fits the rice on the stove\n\nTests  1 passed, 1 failed"} />
      <ToolCall name="Edit file" detail="recipes/roast.md" status="waiting" />
    </div>
  );
}
