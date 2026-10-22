import { createElement, type ComponentProps, type MouseEvent } from "react";
import { expectTypeOf } from "vitest";
import { AgentNote, type AgentNoteHandler, type AgentNoteProps, type AgentNoteSaveHandler } from "@/registry/ouro/components/ouro/agent-note/agent-note";

// Type tests: `pnpm typecheck` compiles this file.

expectTypeOf<AgentNoteHandler>().toEqualTypeOf<(revision: string | undefined, event: MouseEvent<HTMLElement>) => void>();
expectTypeOf<AgentNoteSaveHandler>().toEqualTypeOf<(text: string, revision: string | undefined, event: MouseEvent<HTMLElement>) => boolean | void | Promise<boolean | void>>();
expectTypeOf<{ text: "Hi"; author: "agent"; name: "Ouro" }>().toExtend<AgentNoteProps>();
expectTypeOf<{
  text: "Hi";
  author: "human";
  name: "Ouro";
  time: "5 min ago";
  source: "Based on 3 messages";
  pinned: true;
  revision: "r1";
  onPin: AgentNoteHandler;
  onUnpin: AgentNoteHandler;
  onSave: (text: string) => Promise<boolean>;
  onDismiss: AgentNoteHandler;
  maxLength: 500;
  label: "Note";
  agentLabel: "Agent";
  editedLabel: "Edited by you";
  pinnedLabel: "Pinned";
  keptLabel: "Kept.";
  changedLabel: "Changed.";
  pinButtonLabel: "Pin";
  unpinButtonLabel: "Unpin";
  editButtonLabel: "Edit";
  saveButtonLabel: "Save";
  cancelButtonLabel: "Cancel";
  dismissButtonLabel: "Dismiss";
  className: "mt-2";
}>().toExtend<AgentNoteProps>();
expectTypeOf<ComponentProps<typeof AgentNote>>().toEqualTypeOf<AgentNoteProps>();

// text, author and name are required, and the author is a person or an agent.
expectTypeOf<{ author: "agent"; name: "Ouro" }>().not.toExtend<AgentNoteProps>();
expectTypeOf<{ text: "Hi"; name: "Ouro" }>().not.toExtend<AgentNoteProps>();
expectTypeOf<{ text: "Hi"; author: "agent" }>().not.toExtend<AgentNoteProps>();
expectTypeOf<{ text: "Hi"; author: "person"; name: "Ouro" }>().not.toExtend<AgentNoteProps>();

// Guessed props name the fix.
type Valid = { text: "Hi"; author: "agent"; name: "Ouro" };
expectTypeOf<Valid & { children: "Hi" }>().not.toExtend<AgentNoteProps>();
expectTypeOf<Valid & { by: "agent" }>().not.toExtend<AgentNoteProps>();
expectTypeOf<Valid & { basis: "Based on" }>().not.toExtend<AgentNoteProps>();
expectTypeOf<Valid & { onEdit: () => void }>().not.toExtend<AgentNoteProps>();

// @ts-expect-error author is required.
createElement(AgentNote, { text: "Hi", name: "Ouro" });
