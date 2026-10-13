import { type AgentCase, hint } from "./shared.ts";

/** The slider snippets in slider.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "slider01", habit: "a range prop for two thumbs", tsc: [hint("boolean", "Pass a value array: <Slider defaultValue={[20, 80]}>")], dev: "<Slider defaultValue={[20, 80]}>", names: ["tsc", "dev"] },
  { id: "slider02", habit: "MUI's valueLabelDisplay", tsc: [hint("string", "Use <Slider showValue>")], dev: "<Slider showValue>", names: ["tsc", "dev"] },
  { id: "slider03", habit: "required, as on other form controls", tsc: [hint("boolean", "A slider always has a value: <Slider defaultValue={50}>")], dev: "<Slider defaultValue={50}>", names: ["tsc", "dev"] },
  { id: "slider04", habit: "an onChange handler", tsc: [hint("() => void", "Use <Slider onValueChange={(value) => ...}>")], dev: "<Slider onValueChange={(value) => …}>", names: ["tsc", "dev"] },
];

/** Valid slider snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["sliderOk01"];
