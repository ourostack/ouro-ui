// What agents write with plan-approval: snippets whose cases are in plan-approval.cases.ts.
import { PlanApproval } from "@/registry/ouro/components/ouro/plan-approval/plan-approval";

export const planApproval01 = <PlanApproval title="Your agent's plan" onAccept={() => {}}>Roast it.</PlanApproval>;
export const planApproval02 = <PlanApproval title="Your agent's plan" plan="Roast it.">Roast it.</PlanApproval>;
export const planApprovalOk01 = <PlanApproval title="Your agent's plan" onApprove={() => {}} onRequestChanges={() => {}} answering="approve" answer={{ decision: "approved", by: "Ana", app: "their phone", at: "9:41", feedback: "None" }} approveLabel="Go" requestChangesLabel="Change it" feedbackLabel="How?" sendLabel="Ask" cancelLabel="Never mind" headingLevel={2} className="max-w-xl">Roast it.</PlanApproval>;
