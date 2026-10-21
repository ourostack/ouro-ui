// What agents write with copy-button: snippets whose cases are in copy-button.cases.ts.
import { CopyButton } from "@/registry/ouro/components/ouro/copy-button/copy-button";

export const copyButton01 = <CopyButton value="x" text="sk-123" />;
export const copyButton02 = <CopyButton value="sk-123">Copy key</CopyButton>;
export const copyButtonOk01 = <CopyButton value="sk-123" label="Copy key" copiedLabel="Key copied" hideLabel variant="plain" className="ms-auto" />;
