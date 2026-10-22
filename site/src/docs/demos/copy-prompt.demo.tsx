import type { JSX } from "react";
import { CopyPrompt } from "@/registry/ouro/components/ouro/copy-prompt/copy-prompt";

// The live demo at the top of docs/copy-prompt/: the component as an app would use it, with its props, nothing else.

export default function CopyPromptDemo(): JSX.Element {
  return <CopyPrompt text="Suggest a layout for my mornings: customer chats first, then my calendar." className="max-w-md" />;
}
