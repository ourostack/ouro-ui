import { createElement, type ComponentProps, type MouseEvent, type ReactElement } from "react";
import { expectTypeOf } from "vitest";
import type { AvatarPresence } from "@/registry/ouro/components/ouro/avatar/avatar";
import { Message, type MessageAction, type MessageProps, type MessageQuote } from "@/registry/ouro/components/ouro/message/message";

// Type tests: `pnpm typecheck` compiles this file.

expectTypeOf<{ role: "user"; name: "Ana" }>().toExtend<MessageProps>();
expectTypeOf<{ role: "assistant"; name: "Ouro"; avatar: "/ouro.png"; streaming: true; streamingLabel: "Écrit"; children: "Hi"; attachments: null }>().toExtend<MessageProps>();
expectTypeOf<{ role: "system"; name: "Ouro"; avatar: false }>().toExtend<MessageProps>();
expectTypeOf<ComponentProps<typeof Message>>().toEqualTypeOf<MessageProps>();
expectTypeOf<{
  role: "assistant";
  name: "Mara Quill";
  variant: "chat";
  avatar: ReactElement;
  time: "9:41 AM";
  dateTime: "2026-05-04T09:41";
  continued: true;
  footer: ReactElement;
  thread: null;
  actions: readonly MessageAction[];
  menu: readonly [{ label: "Copy link"; onClick: () => void }];
  actionsLabel: "Actions";
  menuLabel: "More";
}>().toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ana"; variant: "post"; subject: "Agenda" }>().toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ana"; variant: "reply" }>().toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ana"; variant: "reply"; actionsPlacement: "corner" }>().toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ana"; variant: "chat"; actionsPlacement: "beside" }>().toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ana"; failed: { onRetry: () => void; onDelete: () => void }; failedLabel: "No enviado" }>().toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ana"; failed: { onRetry: () => void } | false }>().toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ana"; failed: false }>().toExtend<MessageProps>();
expectTypeOf<{ role: "assistant"; name: "Halden"; nameTag: "AI agent" }>().toExtend<MessageProps>();
expectTypeOf<{ role: "assistant"; name: "Ana"; variant: "chat"; presence: "busy"; presenceLabel: "In a meeting" }>().toExtend<MessageProps>();
// A presence that may be missing, with its label, type checks as it is.
expectTypeOf<{ role: "assistant"; name: "Ana"; presence: AvatarPresence | undefined; presenceLabel: string }>().toExtend<MessageProps>();
expectTypeOf<{ key: "reply"; label: "Reply"; icon: "↩"; onClick: (event: MouseEvent<HTMLElement>) => void; disabled: true }>().toExtend<MessageAction>();
// A quote says who wrote it and what; it may be a button, an avatar and a label of its own.
expectTypeOf<{ role: "user"; name: "Ana"; quote: { author: "Grace"; excerpt: "Lunch?"; onActivate: () => void; label: "Quoting Grace" } }>().toExtend<MessageProps>();
expectTypeOf<{ author: "Grace"; excerpt: "Lunch?"; avatar: ReactElement }>().toExtend<MessageQuote>();
expectTypeOf<{ author: "Grace" }>().not.toExtend<MessageQuote>();
expectTypeOf<{ excerpt: "Lunch?" }>().not.toExtend<MessageQuote>();
// An action needs a label, for its name and tooltip.
expectTypeOf<{ key: "reply"; icon: "↩"; onClick: () => void }>().not.toExtend<MessageAction>();

// role and name are required; other roles and the names agents bring from other chat kits name the fix.
expectTypeOf<{ name: "Ana" }>().not.toExtend<MessageProps>();
expectTypeOf<{ role: "user" }>().not.toExtend<MessageProps>();
expectTypeOf<{ role: "bot"; name: "Ouro" }>().not.toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ana"; from: "user" }>().not.toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ana"; sender: "Ana" }>().not.toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ana"; content: "Hi" }>().not.toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ana"; variant: "bubble" }>().not.toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ana"; variant: "reply"; actionsPlacement: "right" }>().not.toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ana"; own: true }>().not.toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ana"; timestamp: "9:41" }>().not.toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ana"; replyTo: "message-1" }>().not.toExtend<MessageProps>();
// A message that did not send always offers another try, and its buttons come with failed.
expectTypeOf<{ role: "user"; name: "Ana"; failed: true }>().not.toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ana"; failed: { onDelete: () => void } }>().not.toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ana"; onRetry: () => void }>().not.toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ana"; status: "failed" }>().not.toExtend<MessageProps>();
// A presence needs the words it says; unknown presences name the fix.
expectTypeOf<{ role: "assistant"; name: "Ana"; presence: "busy" }>().not.toExtend<MessageProps>();
expectTypeOf<{ role: "assistant"; name: "Ana"; presence: "dnd"; presenceLabel: "Busy" }>().not.toExtend<MessageProps>();

// @ts-expect-error name is required.
createElement(Message, { role: "user" });
// @ts-expect-error presence needs presenceLabel.
createElement(Message, { role: "assistant", name: "Ana", presence: "busy" });
