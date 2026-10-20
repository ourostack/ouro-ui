import { type AgentCase, hint } from "./shared.ts";

/** The image-cropper snippets in image-cropper.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "imageCropper01", habit: "aspectRatio, as CSS says", tsc: [hint("number", "Use aspect={16 / 9}")], dev: "<ImageCropper aspect={16 / 9} />", names: ["tsc", "dev"] },
];

/** Valid image-cropper snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["imageCropperOk01"];
