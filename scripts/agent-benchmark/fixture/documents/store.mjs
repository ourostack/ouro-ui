/* global structuredClone */
// Ouro MD's documents and one handler per action declared in document.actions.mts (Ouro MD's own declarations). A
// synthetic library shaped like the folders Ouro MD serves: made-up documents, no person's files. The handlers follow
// Ouro MD's (Sources/OuroMD/DocumentActionHandlers.swift): a document is named by its name or its path, and a missing
// one means the document on screen; append adds a new paragraph at the end; replace asks first. Every door changes
// state only through these handlers, so a task's postcondition reads the same state whichever arm ran it.
import { AppError } from "../app-error.mjs";

/** Where the made-up folder lives. Paths are absolute, as Ouro MD's are, or relative to this folder. */
export const ROOT = "/documents";

/** The library every trial starts from. A fresh deep copy per trial, so no trial sees another's changes. */
export const SEED = Object.freeze({
  documents: [
    { path: `${ROOT}/Plan.md`, markdown: "# Plan\n\n- [x] Book the ferry\n- [ ] Pack the charts\n", modified: "2026-11-12T09:30:00Z" },
    { path: `${ROOT}/Notes.md`, markdown: "# Notes\n\nHarbor master: Ines Duarte, +351 21 555 0142.\n\nThe ferry leaves at 07:40 from pier 3.\n", modified: "2026-11-13T17:05:00Z" },
    { path: `${ROOT}/Trips/Lisbon plan.md`, markdown: "# Lisbon plan\n\n- [ ] Find a tram map\n", modified: "2026-11-10T08:00:00Z" },
    { path: `${ROOT}/Scratch.md`, markdown: "scratch\n", modified: "2026-11-14T21:45:00Z" },
  ],
  onScreen: `${ROOT}/Notes.md`,
});

/** A document's name, as Ouro MD shows it: its file name without `.md`. */
export const nameOf = (file) => file.split("/").at(-1).replace(/\.md$/i, "");
/** The folder a document sits in, relative to the served folder ("" for the top). */
export const folderOf = (file) => file.slice(ROOT.length + 1).split("/").slice(0, -1).join("/");

/** Thrown for input a handler refuses. */
export class DocumentError extends AppError {}

const PAGE = 20_000;

/** A new library from the seed, with the handlers that change it. */
export function createStore(seed = SEED) {
  const state = structuredClone(seed);
  const locate = (reference) => {
    const text = typeof reference === "string" ? reference.trim() : "";
    if (!text) {
      const front = state.documents.find((doc) => doc.path === state.onScreen);
      if (!front) throw new DocumentError("No document is on screen. Name one: list_documents gives the names.");
      return front;
    }
    const lower = text.toLowerCase();
    const absolute = text.startsWith("/") ? text : `${ROOT}/${text}`;
    const found =
      state.documents.find((doc) => doc.path === absolute || doc.path === `${absolute}.md`) ??
      state.documents.filter((doc) => nameOf(doc.path).toLowerCase() === lower).at(0);
    if (!found) throw new DocumentError(`No document is called ${JSON.stringify(text)}. List the documents for their names and paths.`);
    return found;
  };
  const markdownOf = (markdown) => {
    if (typeof markdown !== "string") throw new DocumentError("markdown must be text.");
    return markdown;
  };
  const touch = (doc) => {
    doc.modified = "2026-11-15T12:00:00Z";
  };
  const handlers = {
    list_documents: ({ query }) => {
      const words = String(query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
      const found = state.documents.filter((doc) => words.every((word) => `${nameOf(doc.path)} ${folderOf(doc.path)}`.toLowerCase().includes(word)));
      return { documents: found.map((doc) => `${nameOf(doc.path)}  ${doc.path}`).join("\n"), count: found.length };
    },
    read_document: ({ document, from }) => {
      const doc = locate(document);
      const letters = Array.from(doc.markdown);
      const start = typeof from === "number" && from > 0 ? Math.floor(from) : 0;
      const end = Math.min(letters.length, start + PAGE);
      return { markdown: letters.slice(start, end).join(""), name: nameOf(doc.path), path: doc.path, length: letters.length, ...(end < letters.length ? { next: end } : {}) };
    },
    append_to_document: ({ markdown, document }) => {
      const doc = locate(document);
      const added = markdownOf(markdown).trim();
      if (!added) throw new DocumentError("There is nothing to add: markdown is empty.");
      doc.markdown = `${doc.markdown.replace(/\s+$/, "")}\n\n${added}\n`;
      touch(doc);
      return { state: "done", summary: `Added ${Array.from(added).length} characters to the end of ${nameOf(doc.path)}.`, checked: "Read the document back after the edit." };
    },
    replace_document: ({ markdown, document, confirmed }) => {
      const doc = locate(document);
      const text = markdownOf(markdown);
      if (confirmed !== true) {
        return {
          state: "needs-human",
          summary: `Replacing ${nameOf(doc.path)} overwrites every line. Ask the person whether to replace it; nothing changed.`,
          next: `replace_document with confirmed: true, once the person has said yes`,
        };
      }
      doc.markdown = text;
      touch(doc);
      return { state: "done", summary: `Replaced ${nameOf(doc.path)}.`, checked: "Read the document back after the edit." };
    },
    open_document: ({ document }) => {
      const doc = locate(document);
      state.onScreen = doc.path;
      return { summary: `Opened ${nameOf(doc.path)}.` };
    },
  };
  return { state, handlers };
}
