// What agents write with copy-prompt: snippets whose cases are in copy-prompt.cases.ts.
import { CopyPrompt } from "@/registry/ouro/components/ouro/copy-prompt/copy-prompt";

export const copyPrompt01 = <CopyPrompt text="Summarize my week." prompt="Summarize my week." />;
export const copyPromptOk01 = <CopyPrompt text="Summarize my week." label="Copy" copiedLabel="Copied" failedLabel="Couldn't copy" onCopy={() => {}} className="mt-2" />;
