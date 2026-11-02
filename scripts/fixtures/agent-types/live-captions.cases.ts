import { type AgentCase, hint, notAssignable } from "./shared.ts";

/** The live-captions snippets in live-captions.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "liveCaptions01", habit: "the lines as captions", tsc: [`error TS2741: Property ''Use <LiveCaptions lines={lines}>'' is missing in type 'LiveCaptionLine[]' but required in type '{ 'Use <LiveCaptions lines={lines}>': never; }'.`], dev: "<LiveCaptions lines={lines}>", names: ["tsc", "dev"] },
  {
    id: "liveCaptions02",
    habit: "a caption band with no label",
    tsc: [`error TS2741: Property 'label' is missing in type '{ lines: LiveCaptionLine[]; }' but required in type 'LiveCaptionsProps'.`],
    names: ["tsc"],
  },
  { id: "liveCaptions03", habit: "reading captions aloud as readAloud", tsc: [hint("boolean", "Use <LiveCaptions announce>")], dev: "<LiveCaptions announce>", names: ["tsc", "dev"] },
  { id: "liveCaptions04", habit: "a final line as isFinal", tsc: [hint("boolean", "Use final: true")], dev: "{ id, speaker, text, final: true }", names: ["tsc", "dev"] },
  {
    id: "liveCaptions05",
    habit: "an extra-large caption size",
    tsc: [notAssignable('"xl"', `"sm" | "md" | "lg" | (string & { 'Use "sm", "md" or "lg"': never; }) | undefined`)],
    dev: '<LiveCaptions size="md">',
    names: ["tsc", "dev"],
  },
];

/** Valid live-captions snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["liveCaptionsValid"];
