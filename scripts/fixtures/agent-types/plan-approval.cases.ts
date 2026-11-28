import { type AgentCase, hint } from "./shared.ts";

/** The plan-approval snippets in plan-approval.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "planApproval01", habit: "onAccept, as in approval UIs", tsc: [hint("() => void", "Use <PlanApproval onApprove={approve}>")], dev: "<PlanApproval onApprove={approve}>", names: ["tsc", "dev"] },
  { id: "planApproval02", habit: "a plan prop for the plan", tsc: [hint("string", 'Pass the plan as children: <PlanApproval title="Plan">{plan}</PlanApproval>')], dev: '<PlanApproval title="Plan">{plan}</PlanApproval>', names: ["tsc", "dev"] },
];

/** Valid plan-approval snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["planApprovalOk01"];
