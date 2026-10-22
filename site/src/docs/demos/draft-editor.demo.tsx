import { useState, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { DraftEditor, type DraftSegment } from "@/registry/ouro/components/ouro/draft-editor/draft-editor";

// The live demo at the top of docs/draft-editor/: the component as an app would use it, with its props, nothing else.

const initial: DraftSegment[] = [
  { author: "human", text: "Thanks for the notes. " },
  { author: "agent", text: "I can meet on Friday at ten." },
];

export default function DraftEditorDemo(): JSX.Element {
  const [draft, setDraft] = useState({ text: initial.map((segment) => segment.text).join(""), segments: initial });
  return (
    <DraftEditor
      label="Reply"
      placeholder="Write a reply"
      value={draft.text}
      segments={draft.segments}
      onValueChange={(text, segments = []) => setDraft({ text, segments })}
      readiness="ready-for-review"
      readinessBy={{ author: "agent", name: "Ouro" }}
      actions={<Button>Send</Button>}
      className="max-w-md"
    />
  );
}
