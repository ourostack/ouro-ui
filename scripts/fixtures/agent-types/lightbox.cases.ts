import { type AgentCase } from "./shared.ts";

/** The lightbox snippets in lightbox.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "lightbox01",
    habit: "a lightbox library's slides",
    tsc: [
      "error TS2741: Property ''Use images={[{ src, alt }]}'' is missing in type '{ src: string; alt: string; }[]' but required in type '{ 'Use images={[{ src, alt }]}': never; }'.",
    ],
    dev: '<Lightbox label="Kitchen photos" images={[{ src, alt }]}>',
    names: ["tsc", "dev"],
  },
  {
    id: "lightbox02",
    habit: "a lightbox with no name",
    tsc: [`error TS2741: Property 'label' is missing in type '{ images: { src: string; alt: string; }[]; }' but required in type 'LightboxProps'.`],
    names: ["tsc"],
  },
];

/** Valid lightbox snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["lightboxOk01"];
