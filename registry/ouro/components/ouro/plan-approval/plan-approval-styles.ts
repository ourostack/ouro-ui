export { feedbackClass, planApprovalAx, settledClass };

import { defineComponentAx } from "@/registry/ouro/ax/component";

// The agent side and class strings for PlanApproval, apart from the component so its file exports only components
// (React Fast Refresh). Class strings are literal so the app's Tailwind finds them when it compiles.

/**
 * The answer's line, muted, in place of the buttons.
 *
 * @internal
 */
const settledClass =
  "m-0 flex min-w-0 items-center gap-2 text-sm text-muted-foreground outline-ring outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid";

/**
 * What the person asked to change, under the answer: muted, behind a line at its start edge.
 *
 * @internal
 */
const feedbackClass =
  "m-0 box-border min-w-0 border-0 border-s-2 border-solid border-border ps-3 text-sm text-muted-foreground whitespace-pre-wrap wrap-break-word";

/**
 * PlanApproval's agent side, declared with Ouro AX's `defineComponentAx`. An agent may read its plan and how the person
 * answered. Approve and Request changes are the person's: an agent never approves its own plan, so no agent door offers
 * them.
 *
 * @example
 * planApprovalAx.actions.map((action) => action.id); // ["approve", "request-changes"]
 * @claim "Approve and Request changes are the person's" registry/ouro/components/ouro/plan-approval/plan-approval.test.tsx verify:testExists(registry/ouro/components/ouro/plan-approval/plan-approval.test.tsx::PlanApproval > declares approve and request-changes the person's, each on the button that does it)
 */
const planApprovalAx = defineComponentAx({
  component: "PlanApproval",
  reads: [
    {
      id: "plan",
      summary: "The plan the agent asked the person to approve, and how the person answered.",
      fields: ["title", "plan", "decision", "feedback"],
      consent: "none",
    },
  ],
  actions: [
    { id: "approve", summary: "Approve the plan, so the agent starts on it.", effect: "private", personOnly: "You can't approve a plan for the person; only they can." },
    { id: "request-changes", summary: "Ask the agent to change the plan, saying what should change.", effect: "private", personOnly: "You can't answer a plan for the person; only they can." },
  ],
});
