import { useState, type JSX } from "react";
import { AgentNote } from "@/registry/ouro/components/ouro/agent-note/agent-note";

// The live demo at the top of docs/agent-note/: the component as an app would use it, with its props, nothing else.
// The app acts only on a person's click about the note on screen.

export default function AgentNoteDemo(): JSX.Element {
  const [note, setNote] = useState({ text: "Sam asks for the rollout numbers before the review.", author: "agent" as "agent" | "human", pinned: false, revision: 1 });
  const current = String(note.revision);
  return (
    <AgentNote
      text={note.text}
      author={note.author}
      name="Ouro"
      time="5 min ago"
      source="Based on 3 messages"
      pinned={note.pinned}
      revision={current}
      onPin={(revision, event) => event.isTrusted && revision === current && setNote({ ...note, pinned: true })}
      onUnpin={(revision, event) => event.isTrusted && revision === current && setNote({ ...note, pinned: false })}
      onSave={(text, _revision, event) => {
        // Not a person's click: the editor stays open, and nothing is saved.
        if (!event.isTrusted) return false;
        setNote({ ...note, text, author: "human", revision: note.revision + 1 });
      }}
      className="max-w-md"
    />
  );
}
