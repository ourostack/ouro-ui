import { CopyPrompt } from "@/components/ouro/copy-prompt/copy-prompt";

// expect: data-ouro="copy-prompt"
// expect: Ouro, suggest a layout for my mornings.
export default function CopyPromptSection() {
  return <CopyPrompt text="Ouro, suggest a layout for my mornings." />;
}
