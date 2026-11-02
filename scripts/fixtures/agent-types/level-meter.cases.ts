import { type AgentCase, hint } from "./shared.ts";

/** The level-meter snippets in level-meter.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "levelMeter01", habit: "the level as level", tsc: [hint("number", "Use <LevelMeter value={0.4}>")], dev: "<LevelMeter value={level}>", names: ["tsc", "dev"] },
  {
    id: "levelMeter02",
    habit: "a level meter with no label",
    tsc: [`error TS2741: Property 'label' is missing in type '{ value: number; }' but required in type 'LevelMeterProps'.`],
    names: ["tsc"],
  },
  { id: "levelMeter03", habit: "the bars as segments", tsc: [hint("number", "Use <LevelMeter bars={8}>")], dev: "<LevelMeter bars={10}>", names: ["tsc", "dev"] },
  { id: "levelMeter04", habit: "the level as a percentage", tsc: [], dev: "<LevelMeter value={percent / 100}>", names: ["dev"] },
];

/** Valid level-meter snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["levelMeterValid"];
