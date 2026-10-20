import { CodeBlock } from "@/components/ouro/code-block/code-block";

// expect: data-ouro="code-block"
// expect: data-language="bash"
// expect: ouro code block
export default function CodeBlockSection() {
  return <CodeBlock language="bash" code="echo ouro code block" />;
}
