import { type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { ConversationFind, type ConversationFindProps } from "@/registry/ouro/components/ouro/conversation-find/conversation-find";

// Type tests: `pnpm typecheck` compiles this file.

expectTypeOf<{ label: "Find"; query: ""; onQueryChange: (query: string) => void; count: 0; current: null; onCurrentChange: (current: number) => void; onClose: () => void }>().toExtend<ConversationFindProps>();
expectTypeOf<{
  label: "Find";
  query: "a";
  onQueryChange: (query: string) => void;
  count: 3;
  current: 1;
  onCurrentChange: (current: number) => void;
  onClose: () => void;
  partial: true;
  placeholder: "Find";
  previousLabel: "Previous";
  nextLabel: "Next";
  closeLabel: "Close";
  noMatchesLabel: "None";
  resultLabel: (current: number, count: number) => string;
  className: "mt-2";
}>().toExtend<ConversationFindProps>();
expectTypeOf<ComponentProps<typeof ConversationFind>>().toEqualTypeOf<ConversationFindProps>();

// The label, the query, the count, the current match and the callbacks are required.
expectTypeOf<{ query: ""; onQueryChange: (query: string) => void; count: 0; current: null; onCurrentChange: (current: number) => void; onClose: () => void }>().not.toExtend<ConversationFindProps>();
expectTypeOf<{ label: "Find"; query: ""; onQueryChange: (query: string) => void; count: 0; current: null; onCurrentChange: (current: number) => void }>().not.toExtend<ConversationFindProps>();

// Guessed props name the fix.
expectTypeOf<{ value: "a" }>().not.toExtend<ConversationFindProps>();
expectTypeOf<{ onNext: () => void }>().not.toExtend<ConversationFindProps>();
