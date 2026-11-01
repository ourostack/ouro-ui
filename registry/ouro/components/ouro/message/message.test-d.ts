import { createElement, type ComponentProps, type MouseEvent, type ReactElement } from "react";
import { expectTypeOf } from "vitest";
import type { AvatarPresence } from "@/registry/ouro/components/ouro/avatar/avatar";
import { Message, type MessageAction, type MessageProps, type MessageQuote } from "@/registry/ouro/components/ouro/message/message";

// Type tests: `pnpm typecheck` compiles this file.

expectTypeOf<{ role: "user"; name: "Ada" }>().toExtend<MessageProps>();
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
expectTypeOf<{ role: "user"; name: "Ada"; variant: "post"; subject: "Agenda" }>().toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ada"; variant: "reply" }>().toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ada"; variant: "reply"; actionsPlacement: "corner" }>().toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ada"; variant: "chat"; actionsPlacement: "beside" }>().toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ada"; failed: { onRetry: () => void; onDelete: () => void }; failedLabel: "No enviado" }>().toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ada"; failed: { onRetry: () => void } | false }>().toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ada"; failed: false }>().toExtend<MessageProps>();
expectTypeOf<{ role: "assistant"; name: "Ada"; variant: "chat"; presence: "busy"; presenceLabel: "In a meeting" }>().toExtend<MessageProps>();
// A presence that may be missing, with its label, type checks as it is.
expectTypeOf<{ role: "assistant"; name: "Ada"; presence: AvatarPresence | undefined; presenceLabel: string }>().toExtend<MessageProps>();
expectTypeOf<{ key: "reply"; label: "Reply"; icon: "↩"; onClick: (event: MouseEvent<HTMLElement>) => void; disabled: true }>().toExtend<MessageAction>();
// A quote says who wrote it and what; it may be a button, an avatar and a label of its own.
expectTypeOf<{ role: "user"; name: "Ada"; quote: { author: "Grace"; excerpt: "Lunch?"; onActivate: () => void; label: "Quoting Grace" } }>().toExtend<MessageProps>();
expectTypeOf<{ author: "Grace"; excerpt: "Lunch?"; avatar: ReactElement }>().toExtend<MessageQuote>();
expectTypeOf<{ author: "Grace" }>().not.toExtend<MessageQuote>();
expectTypeOf<{ excerpt: "Lunch?" }>().not.toExtend<MessageQuote>();
// An action needs a label, for its name and tooltip.
expectTypeOf<{ key: "reply"; icon: "↩"; onClick: () => void }>().not.toExtend<MessageAction>();

// role and name are required; other roles and the names agents bring from other chat kits name the fix.
expectTypeOf<{ name: "Ada" }>().not.toExtend<MessageProps>();
expectTypeOf<{ role: "user" }>().not.toExtend<MessageProps>();
expectTypeOf<{ role: "bot"; name: "Ouro" }>().not.toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ada"; from: "user" }>().not.toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ada"; sender: "Ada" }>().not.toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ada"; content: "Hi" }>().not.toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ada"; variant: "bubble" }>().not.toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ada"; variant: "reply"; actionsPlacement: "right" }>().not.toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ada"; own: true }>().not.toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ada"; timestamp: "9:41" }>().not.toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ada"; replyTo: "message-1" }>().not.toExtend<MessageProps>();
// A message that did not send always offers another try, and its buttons come with failed.
expectTypeOf<{ role: "user"; name: "Ada"; failed: true }>().not.toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ada"; failed: { onDelete: () => void } }>().not.toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ada"; onRetry: () => void }>().not.toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ada"; status: "failed" }>().not.toExtend<MessageProps>();
// A presence needs the words it says; unknown presences name the fix.
expectTypeOf<{ role: "assistant"; name: "Ada"; presence: "busy" }>().not.toExtend<MessageProps>();
expectTypeOf<{ role: "assistant"; name: "Ada"; presence: "dnd"; presenceLabel: "Busy" }>().not.toExtend<MessageProps>();

// @ts-expect-error name is required.
createElement(Message, { role: "user" });
// @ts-expect-error presence needs presenceLabel.
createElement(Message, { role: "assistant", name: "Ada", presence: "busy" });
