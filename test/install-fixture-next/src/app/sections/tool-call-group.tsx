import { ToolCallGroup } from "@/components/ouro/tool-call/tool-call-group";

// expect: data-ouro="tool-call-group"
// expect: Ran 1 tool
export default function ToolCallGroupSection() {
  return <ToolCallGroup calls={[{ id: "read", name: "Read file", detail: "Rendered on the server", status: "done" }]} />;
}
