import { ThinkingBlock } from "@/components/ouro/thinking-block/thinking-block";

// expect: data-ouro="thinking-block"
// expect: Thought for 12 seconds
export default function ThinkingBlockSection() {
  return <ThinkingBlock duration={12}>Rendered on the server</ThinkingBlock>;
}
