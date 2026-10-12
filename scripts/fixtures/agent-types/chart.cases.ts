import { type AgentCase, hint, notAssignable } from "./shared.ts";

const colorFix = '{ label: "Cooked", tone: "chart-1" }';
const row = "{ month: string; cooked: number; saved: number; }";

/** The chart snippets in chart.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "chart01",
    habit: "shadcn's ChartContainer, which has no title",
    tsc: [
      `error TS2741: Property 'title' is missing in type '{ data: ${row}[]; categoryKey: "month"; config: { cooked: { label: string; }; }; }' but required in type 'ChartOwnProps<${row}>'.`,
    ],
    dev: '<Chart title="Recipes cooked per month">',
    names: ["tsc", "dev"],
  },
  {
    id: "chart02",
    habit: "shadcn's color in the config",
    tsc: [hint("string", `Colors come from the theme. Use ${colorFix}`)],
    dev: `{ cooked: ${colorFix} }`,
    names: ["tsc", "dev"],
  },
  {
    id: "chart03",
    habit: "a color name as the tone",
    tsc: [notAssignable('"blue"', `ChartTone | (string & { 'Use "chart-1" to "chart-5", "primary", "destructive", "success" or "warning"': never; }) | undefined`)],
    dev: `{ cooked: ${colorFix} }`,
    names: ["tsc", "dev"],
  },
  {
    id: "chart04",
    habit: "a chart type Chart does not draw",
    tsc: [notAssignable('"pie"', `ChartType | (string & { 'Use "bar", "line" or "area"; for another chart pass recharts children': never; }) | undefined`)],
    dev: '<Chart type="bar">',
    names: ["tsc", "dev"],
  },
  {
    id: "chart05",
    habit: "shadcn's ChartTooltipContent as content",
    tsc: [
      `error TS2741: Property ''ChartTooltip draws its content from config. Use <ChartTooltip />'' is missing in type 'ReactElement<any, any>' but required in type '{ 'ChartTooltip draws its content from config. Use <ChartTooltip />': never; }'.`,
    ],
    dev: "<ChartTooltip />",
    names: ["tsc", "dev"],
  },
];

/** Valid chart snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["chartOk01", "chartOk02"];
