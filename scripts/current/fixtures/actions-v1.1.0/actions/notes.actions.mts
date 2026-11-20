// A small app's declarations, for Ouro Current's tests. actions/generated holds what Ouro UI core v1.1.0's generator
// wrote from them, as an app that has not generated them again since: core v1.2.0 adds `title` and a consequential
// action's `_meta` to the MCP and WebMCP projections, so the generator Ouro UI vendors now writes them differently.
import { defineAction, defineActions, field } from "../tools/ouro-actions/ouro-actions.mts";

const ok = field.boolean({ label: "Done", description: "True when the app did it." });

export const listNotes = defineAction({
  id: "notes",
  consent: "read",
  label: "List the notes",
  description: "Every note, newest first.",
  agent: "List the notes. Read-only.",
  input: {},
  output: { ok },
  cli: "notes",
});

export const deleteNote = defineAction({
  id: "delete",
  consent: "consequential",
  label: "Delete a note",
  description: "Delete one note for good.",
  agent: "Delete one note. A person says yes first.",
  input: { id: field.string({ label: "Note", description: "The note's id.", arg: true }) },
  output: { ok },
  cli: "delete",
});

export default defineActions("notes", [listNotes, deleteNote], { tool: "notes" });
