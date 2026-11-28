import { type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { PlanApproval, type PlanAnswer, type PlanApprovalProps } from "@/registry/ouro/components/ouro/plan-approval/plan-approval";

// Type tests: `pnpm typecheck` compiles this file.

expectTypeOf<{ title: "Plan"; children: "Roast it" }>().toExtend<PlanApprovalProps>();
expectTypeOf<{
  title: "Plan";
  children: "Roast it";
  onApprove: () => void;
  onRequestChanges: (feedback: string) => void;
  answering: "changes";
  answer: PlanAnswer;
  approveLabel: "Go";
  requestChangesLabel: "Change it";
  feedbackLabel: "How?";
  sendLabel: "Ask";
  cancelLabel: "Never mind";
  headingLevel: 2;
  className: "max-w-xl";
}>().toExtend<PlanApprovalProps>();
expectTypeOf<{ decision: "changes-requested"; by: "you"; app: "this app"; at: "9:41"; feedback: "Less rice" }>().toExtend<PlanAnswer>();
expectTypeOf<ComponentProps<typeof PlanApproval>>().toEqualTypeOf<PlanApprovalProps>();

// The title and the plan are required; an answer needs its decision and who gave it.
expectTypeOf<{ children: "Roast it" }>().not.toExtend<PlanApprovalProps>();
expectTypeOf<{ title: "Plan" }>().not.toExtend<PlanApprovalProps>();
expectTypeOf<{ decision: "approved" }>().not.toExtend<PlanAnswer>();
expectTypeOf<{ decision: "maybe"; by: "you" }>().not.toExtend<PlanAnswer>();

// Guessed props name the fix.
expectTypeOf<{ title: "T"; children: "P"; onAccept: () => void }>().not.toExtend<PlanApprovalProps>();
expectTypeOf<{ title: "T"; children: "P"; onReject: () => void }>().not.toExtend<PlanApprovalProps>();
expectTypeOf<{ title: "T"; children: "P"; plan: "Roast it" }>().not.toExtend<PlanApprovalProps>();
expectTypeOf<{ title: "T"; children: "P"; status: "approved" }>().not.toExtend<PlanApprovalProps>();
