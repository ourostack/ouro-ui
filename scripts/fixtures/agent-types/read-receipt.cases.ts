import { type AgentCase, hint } from "./shared.ts";

/** The read-receipt snippets in read-receipt.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "readReceipt01",
    habit: "readBy for who has seen it",
    tsc: [
      `error TS2741: Property ''Use readers={[{ name, src }]}'' is missing in type '{ name: string; }[]' but required in type '{ 'Use readers={[{ name, src }]}': never; }'.`,
    ],
    dev: '<ReadReceipt readers={[{ name: "Ana Lind", src: ana }]} />',
    names: ["tsc", "dev"],
  },
  { id: "readReceipt02", habit: "a max number of faces", tsc: [hint("number", "It shows three faces and counts the rest")], dev: "<ReadReceipt readers={readers} />", names: ["tsc", "dev"] },
];

/** Valid read-receipt snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["readReceiptOk01"];
