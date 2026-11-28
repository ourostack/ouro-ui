// What agents write with tool-call: snippets whose cases are in tool-call.cases.ts.
import { ToolCall } from "@/registry/ouro/components/ouro/tool-call/tool-call";

export const toolCall01 = <ToolCall name="Read file" status="done" state="input-streaming" />;
export const toolCall02 = <ToolCall name="Read file" status="done" args="roast.md" />;
export const toolCall03 = <ToolCall name="Read file" status="done" result="# Roast" />;
export const toolCallOk01 = <ToolCall name="Ran command" status="failed" detail="npm test" duration={4.2} output="1 failed" outputLanguage="ansi" defaultOpen open={false} onOpenChange={() => {}} className="mt-1" />;
