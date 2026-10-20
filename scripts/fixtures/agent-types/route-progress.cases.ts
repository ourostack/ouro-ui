import { type AgentCase, hint } from "./shared.ts";

/** The route-progress snippets in route-progress.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "routeProgress01", habit: "a loading flag", tsc: [hint("boolean", 'Use <RouteProgress active={navigation.state !== "idle"} />')], dev: '<RouteProgress active={navigation.state !== "idle"} />', names: ["tsc", "dev"] },
  { id: "routeProgress02", habit: "an amount, as Progress takes", tsc: [hint("number", "RouteProgress has no amount; use <Progress value={50}> for a known one")], dev: "<Progress value={50}>", names: ["tsc", "dev"] },
];

/** Valid route-progress snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["routeProgressOk01"];
