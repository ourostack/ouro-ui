import { ToolCall } from "@/components/ouro/tool-call/tool-call";

// expect: data-ouro="tool-call"
// expect: Rendered on the server
export default function ToolCallSection() {
  return <ToolCall name="Read file" detail="Rendered on the server" status="done" duration={0.4} />;
}
