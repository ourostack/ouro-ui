import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { AgentHandoff, type AgentHandoffProps } from "@/registry/ouro/components/ouro/agent-handoff/agent-handoff";

// Type tests: `pnpm typecheck` compiles this file.

expectTypeOf<{ label: "Hand it to your agent"; prompt: "Read https://example.com/llms.txt" }>().toExtend<AgentHandoffProps>();
expectTypeOf<{
  label: "Hand it to your agent";
  prompt: "Read it";
  caption: "Paste it.";
  aside: null;
  copyLabel: "Copy";
  copiedLabel: "Copied";
  failedMessage: "Select it.";
  className: "mt-8";
  id: "handoff";
}>().toExtend<AgentHandoffProps>();
expectTypeOf<ComponentProps<typeof AgentHandoff>>().toEqualTypeOf<AgentHandoffProps>();

// label and prompt are required.
expectTypeOf<{ prompt: "Read it" }>().not.toExtend<AgentHandoffProps>();
expectTypeOf<{ label: "Hand it over" }>().not.toExtend<AgentHandoffProps>();

// Guessed props name the fix.
expectTypeOf<{ label: "L"; prompt: "P"; text: "Read it" }>().not.toExtend<AgentHandoffProps>();
expectTypeOf<{ label: "L"; prompt: "P"; value: "Read it" }>().not.toExtend<AgentHandoffProps>();
expectTypeOf<{ label: "L"; prompt: "P"; command: "npx shadcn add" }>().not.toExtend<AgentHandoffProps>();
expectTypeOf<{ label: "L"; prompt: "P"; title: "Hand it over" }>().not.toExtend<AgentHandoffProps>();
expectTypeOf<{ label: "L"; prompt: "P"; description: "Paste it." }>().not.toExtend<AgentHandoffProps>();
expectTypeOf<{ label: "L"; prompt: "P"; hint: "Paste it." }>().not.toExtend<AgentHandoffProps>();

// @ts-expect-error text is not a prop.
createElement(AgentHandoff, { label: "L", prompt: "P", text: "Read it" });
