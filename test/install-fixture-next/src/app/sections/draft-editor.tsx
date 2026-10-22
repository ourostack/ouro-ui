import { DraftEditor } from "@/components/ouro/draft-editor/draft-editor";

async function saveDraft(_text: string) {
  "use server";
}

// expect: data-ouro="draft-editor"
// expect: Ouro shared draft
// expect: Ready for your review
export default function DraftEditorSection() {
  return (
    <DraftEditor
      label="Reply"
      value="Ouro shared draft"
      segments={[{ author: "agent", text: "Ouro shared draft" }]}
      readiness="ready-for-review"
      onValueChange={saveDraft}
    />
  );
}
