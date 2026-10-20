import { type AgentCase, hint } from "./shared.ts";

/** The image-field snippets in image-field.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "imageField01", habit: "onChange for the chosen file", tsc: [hint("() => void", "Use onFileChange={(file) => ...}")], dev: "<ImageField onFileChange={(file) => {}} />", names: ["tsc", "dev"] },
  { id: "imageField02", habit: "maxFileSize, as other upload widgets say", tsc: [hint("number", "Use maxSize={5 * 1024 * 1024}")], dev: "<ImageField maxSize={5242880} />", names: ["tsc", "dev"] },
];

/** Valid image-field snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["imageFieldOk01"];
