import { type AgentCase, hint, notAssignable } from "./shared.ts";

/** The attachment snippets in attachment.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "attachment01",
    habit: "url for the file's address",
    tsc: [hint("string", 'Use <Attachment name="menu.pdf" href="/menu.pdf" />')],
    dev: '<Attachment name="menu.pdf" href="/menu.pdf" />',
    names: ["tsc", "dev"],
  },
  {
    id: "attachment02",
    habit: "onDelete for removing it",
    tsc: [hint("() => void", 'Use <Attachment name="menu.pdf" onRemove={remove} />')],
    dev: '<Attachment name="menu.pdf" onRemove={remove} />',
    names: ["tsc", "dev"],
  },
  {
    id: "attachment03",
    habit: "fileName for the name",
    tsc: [hint("string", 'Use <Attachment name="menu.pdf" />')],
    dev: '<Attachment name="menu.pdf" />',
    names: ["tsc", "dev"],
  },
  {
    id: "attachment04",
    habit: "an app's name for the kind",
    tsc: [notAssignable('"excel"', `AttachmentKind | (string & { 'Use "doc", "sheet", "slides", "pdf", "image", "video", "audio", "zip", "code" or "file"': never; }) | undefined`)],
    dev: '<Attachment name="notes" kind="doc" />',
    names: ["tsc", "dev"],
  },
];

/** Valid attachment snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["attachmentOk01", "attachmentOk02"];
