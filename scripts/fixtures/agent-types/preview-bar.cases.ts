import { type AgentCase, hint } from "./shared.ts";

/** The preview-bar snippets in preview-bar.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "previewBar01", habit: "onAccept for keeping", tsc: [hint("() => void", "Use onKeep={() => ...}")], dev: "<PreviewBar onKeep={() => {}} />", names: ["tsc", "dev"] },
  { id: "previewBar02", habit: "timeout for the countdown", tsc: [hint("number", "Use seconds={30}")], dev: "<PreviewBar seconds={30} />", names: ["tsc", "dev"] },
];

/** Valid preview-bar snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["previewBarOk01"];
