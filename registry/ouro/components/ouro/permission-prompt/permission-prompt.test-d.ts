import { type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { PermissionPrompt, type PermissionAnswer, type PermissionPromptProps } from "@/registry/ouro/components/ouro/permission-prompt/permission-prompt";

// Type tests: `pnpm typecheck` compiles this file.

expectTypeOf<{ title: "Your agent wants to run a command" }>().toExtend<PermissionPromptProps>();
expectTypeOf<{
  title: "T";
  detail: "npm install";
  reason: "Why";
  risk: "high";
  onAllow: () => void;
  onDeny: () => void;
  answering: "allow";
  answer: PermissionAnswer;
  allowLabel: "Allow";
  denyLabel: "Not now";
  headingLevel: 2;
  className: "max-w-xl";
}>().toExtend<PermissionPromptProps>();
expectTypeOf<{ decision: "denied"; by: "you"; app: "the desktop app"; at: "9:41" }>().toExtend<PermissionAnswer>();
expectTypeOf<ComponentProps<typeof PermissionPrompt>>().toEqualTypeOf<PermissionPromptProps>();

// title is required; an answer needs its decision and who gave it.
expectTypeOf<{ detail: "npm install" }>().not.toExtend<PermissionPromptProps>();
expectTypeOf<{ decision: "allowed" }>().not.toExtend<PermissionAnswer>();
expectTypeOf<{ decision: "maybe"; by: "you" }>().not.toExtend<PermissionAnswer>();

// An unknown risk and guessed props name the fix.
expectTypeOf<{ title: "T"; risk: "critical" }>().not.toExtend<PermissionPromptProps>();
expectTypeOf<{ title: "T"; onApprove: () => void }>().not.toExtend<PermissionPromptProps>();
expectTypeOf<{ title: "T"; onReject: () => void }>().not.toExtend<PermissionPromptProps>();
expectTypeOf<{ title: "T"; command: "npm install" }>().not.toExtend<PermissionPromptProps>();
expectTypeOf<{ title: "T"; description: "Why" }>().not.toExtend<PermissionPromptProps>();
expectTypeOf<{ title: "T"; status: "allowed" }>().not.toExtend<PermissionPromptProps>();
