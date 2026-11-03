import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { AgentPresence, type AgentPresenceLabels, type AgentPresenceProps, type ListeningAgent } from "@/registry/ouro/components/ouro/agent-presence/agent-presence";
import type { ComponentAx } from "@/registry/ouro/ax/component";
import { agentPresenceAx } from "@/registry/ouro/components/ouro/agent-presence/agent-presence-styles";

// Type tests: `pnpm typecheck` compiles this file.

const agents: ListeningAgent[] = [{ id: "inbox", name: "inbox agent", doing: "listening for your name" }];

expectTypeOf<{ label: "Agents listening"; agents: ListeningAgent[]; onStop: (id: string) => void }>().toExtend<AgentPresenceProps>();
expectTypeOf<{
  label: string;
  agents: readonly ListeningAgent[];
  onStop: (id: string) => void;
  onStopAll: () => void;
  size: "lg";
  compact: true;
  unread: true;
  labels: AgentPresenceLabels;
  className: "ms-auto";
}>().toExtend<AgentPresenceProps>();
expectTypeOf<ComponentProps<typeof AgentPresence>>().toEqualTypeOf<AgentPresenceProps>();
expectTypeOf<{ id: "notes"; name: "notes agent" }>().toExtend<ListeningAgent>();
expectTypeOf<{ one: (name: string) => string; stop: "Arrêter" }>().toExtend<AgentPresenceLabels>();

// label, agents and onStop are required.
expectTypeOf<{ agents: ListeningAgent[]; onStop: (id: string) => void }>().not.toExtend<AgentPresenceProps>();
expectTypeOf<{ label: string; onStop: (id: string) => void }>().not.toExtend<AgentPresenceProps>();
expectTypeOf<{ label: string; agents: ListeningAgent[] }>().not.toExtend<AgentPresenceProps>();
// An agent needs its id and name.
expectTypeOf<{ name: "inbox agent" }>().not.toExtend<ListeningAgent>();

// Guessed props and values name the fix.
expectTypeOf<{ label: string; agents: ListeningAgent[]; onStop: (id: string) => void; size: "xs" }>().not.toExtend<AgentPresenceProps>();
expectTypeOf<{ label: string; agents: ListeningAgent[]; onStop: (id: string) => void; listeners: ListeningAgent[] }>().not.toExtend<AgentPresenceProps>();
expectTypeOf<{ label: string; agents: ListeningAgent[]; onStop: (id: string) => void; onRemove: () => void }>().not.toExtend<AgentPresenceProps>();
expectTypeOf<{ label: string; agents: ListeningAgent[]; onStop: (id: string) => void; autoHide: true }>().not.toExtend<AgentPresenceProps>();
expectTypeOf<{ label: string; agents: ListeningAgent[]; onStop: (id: string) => void; variant: "compact" }>().not.toExtend<AgentPresenceProps>();

// The agent side is a checked Ouro AX declaration.
expectTypeOf(agentPresenceAx).toEqualTypeOf<ComponentAx>();

// @ts-expect-error size is "sm", "md" or "lg".
createElement(AgentPresence, { label: "Agents listening", agents, onStop: () => {}, size: "xs" });
