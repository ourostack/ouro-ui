import { type JSX } from "react";
import { ThinkingBlock } from "@/registry/ouro/components/ouro/thinking-block/thinking-block";

// The live demo at the top of docs/thinking-block/: the component as an app would use it, with its props, nothing else.

export default function ThinkingBlockDemo(): JSX.Element {
  return (
    <div className="grid w-full max-w-xl gap-3">
      <ThinkingBlock streaming>{"The person wants a dinner for six that one oven can finish at once.\n\nThe roast needs the oven at 200°C for an hour, so the sides have to share that heat or cook on the stove."}</ThinkingBlock>
      <ThinkingBlock duration={12}>
        {"The person wants a dinner for six that one oven can finish at once.\n\nRoasted carrots fit beside the roast; the rice and the greens can go on the stove in the last twenty minutes."}
      </ThinkingBlock>
    </div>
  );
}
