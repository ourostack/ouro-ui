import { createElement } from "react";
import { expectTypeOf } from "vitest";
import { Composer, type ComposerProps } from "@/registry/ouro/components/ouro/composer/composer";

// Type tests: `pnpm typecheck` compiles this file, and every `@ts-expect-error`
// fails the check if the line below it stops being an error.

// Valid shapes: the least it takes, and every prop.
expectTypeOf<{ label: "Message"; onSend: (text: string) => void }>().toExtend<ComposerProps>();
expectTypeOf<{
  label: "Message";
  onSend: (text: string) => void;
  value: "Hi";
  onValueChange: (value: string) => void;
  placeholder: "Write a message";
  sendOn: "mod-enter";
  sendLabel: "Post";
  sending: true;
  sendingLabel: "Posting";
  sendDisabledReason: "Sending is off";
  disabled: false;
  attachments: null;
  attachmentsLabel: "Files";
  actions: null;
  toolbar: false;
  description: "Ctrl+Enter to send";
  highlights: [{ start: 0; end: 2; label: "Suggested" }];
  rows: 2;
  maxRows: 6;
  name: "message";
  maxLength: 500;
  onPaste: () => void;
  className: "mt-2";
}>().toExtend<ComposerProps>();

// The label and onSend are required.
expectTypeOf<{ onSend: (text: string) => void }>().not.toExtend<ComposerProps>();
expectTypeOf<{ label: "Message" }>().not.toExtend<ComposerProps>();

// sendOn is a named key.
for (const sendOn of ["enter", "mod-enter"] as const) createElement(Composer, { label: "Message", onSend: () => {}, sendOn });
expectTypeOf<{ label: "Message"; onSend: () => void; sendOn: "shift-enter" }>().not.toExtend<ComposerProps>();

// The guessed names are hint types that name the real prop.
expectTypeOf<{ label: "Message"; onSend: () => void; onSubmit: () => void }>().not.toExtend<ComposerProps>();
expectTypeOf<{ label: "Message"; onSend: () => void; submitOnEnter: true }>().not.toExtend<ComposerProps>();
expectTypeOf<{ label: "Message"; onSend: () => void; enterToSend: true }>().not.toExtend<ComposerProps>();
expectTypeOf<{ label: "Message"; onSend: () => void; loading: true }>().not.toExtend<ComposerProps>();
expectTypeOf<{ label: "Message"; onSend: () => void; sendDisabled: true }>().not.toExtend<ComposerProps>();

// The same checks through JSX.
// @ts-expect-error onSend is required.
createElement(Composer, { label: "Message" });
// @ts-expect-error sending is the prop.
createElement(Composer, { label: "Message", onSend: () => {}, loading: true });
