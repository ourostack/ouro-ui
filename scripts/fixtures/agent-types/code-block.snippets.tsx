// What agents write with code-block: snippets whose cases are in code-block.cases.ts.
import { CodeBlock } from "@/registry/ouro/components/ouro/code-block/code-block";

export const codeBlock01 = <CodeBlock code="npm i" lang="bash" />;
export const codeBlock02 = <CodeBlock code="export {};" filename="app.ts" />;
export const codeBlockOk01 = <CodeBlock code="npm i" language="bash" title="Install" copyLabel="Copy command" wrap className="max-h-80" />;
