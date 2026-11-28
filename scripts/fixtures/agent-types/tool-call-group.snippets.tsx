// What agents write with tool-call-group: snippets whose cases are in tool-call-group.cases.ts.
import { ToolCallGroup } from "@/registry/ouro/components/ouro/tool-call/tool-call-group";

export const toolCallGroup01 = <ToolCallGroup calls={[]} title="Read the recipe" />;
export const toolCallGroupOk01 = <ToolCallGroup calls={[{ id: "read", name: "Read file", status: "done" }]} summary="Read the recipe" open defaultOpen={false} onOpenChange={() => {}} className="mt-2" />;
