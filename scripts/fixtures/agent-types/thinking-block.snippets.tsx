// What agents write with thinking-block: snippets whose cases are in thinking-block.cases.ts.
import { ThinkingBlock } from "@/registry/ouro/components/ouro/thinking-block/thinking-block";

export const thinkingBlock01 = <ThinkingBlock isStreaming>The roast needs an hour.</ThinkingBlock>;
export const thinkingBlock02 = <ThinkingBlock title="Checked the ratios">The roast needs an hour.</ThinkingBlock>;
export const thinkingBlock03 = <ThinkingBlock content="The roast needs an hour.">The roast needs an hour.</ThinkingBlock>;
export const thinkingBlockOk01 = <ThinkingBlock streaming={false} duration={12} summary="Planned the oven" open={false} defaultOpen onOpenChange={() => {}} className="mt-2">The roast needs an hour.</ThinkingBlock>;
