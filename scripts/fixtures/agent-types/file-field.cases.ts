import { type AgentCase, hint } from "./shared.ts";

/** The file-field snippets in file-field.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "fileField01",
    habit: "a maxFileSize prop",
    tsc: [hint("number", "Use <FileField maxSize={5 * 1024 * 1024}>")],
    dev: "<FileField maxSize={5000000}>",
    names: ["tsc", "dev"],
  },
  {
    id: "fileField02",
    habit: "FilePond's acceptedFileTypes",
    tsc: [
      `error TS2741: Property ''Use <FileField accept="image/*,.pdf">'' is missing in type 'string[]' but required in type '{ 'Use <FileField accept="image/*,.pdf">': never; }'.`,
    ],
    dev: '<FileField accept="image/png">',
    names: ["tsc", "dev"],
  },
];

/** Valid file-field snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["fileFieldOk"];
