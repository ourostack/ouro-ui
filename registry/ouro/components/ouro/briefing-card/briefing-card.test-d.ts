import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { BriefingCard, type BriefingCardItem, type BriefingCardProps } from "@/registry/ouro/components/ouro/briefing-card/briefing-card";

// Type tests: `pnpm typecheck` compiles this file.

expectTypeOf<{ title: "Weekly sync"; items: BriefingCardItem[] }>().toExtend<BriefingCardProps>();
expectTypeOf<{
  title: "Weekly sync";
  detail: "In 25 min";
  status: "Needs you";
  statusTone: "warning";
  items: readonly BriefingCardItem[];
  note: null;
  actions: null;
  headingLevel: 2;
  className: "mt-2";
  id: "brief";
}>().toExtend<BriefingCardProps>();
expectTypeOf<{ id: "chat"; label: "Chat"; content: "2 new" }>().toExtend<BriefingCardItem>();
expectTypeOf<ComponentProps<typeof BriefingCard>>().toEqualTypeOf<BriefingCardProps>();

// title and items are required; the heading level is 2 to 6.
expectTypeOf<{ items: BriefingCardItem[] }>().not.toExtend<BriefingCardProps>();
expectTypeOf<{ title: "Weekly sync" }>().not.toExtend<BriefingCardProps>();
expectTypeOf<{ title: "Weekly sync"; items: BriefingCardItem[]; headingLevel: 1 }>().not.toExtend<BriefingCardProps>();

// Guessed props and values name the fix.
type Valid = { title: "Weekly sync"; items: BriefingCardItem[] };
expectTypeOf<Valid & { statusTone: "danger" }>().not.toExtend<BriefingCardProps>();
expectTypeOf<Valid & { sections: BriefingCardItem[] }>().not.toExtend<BriefingCardProps>();
expectTypeOf<Valid & { heading: "Weekly sync" }>().not.toExtend<BriefingCardProps>();

// @ts-expect-error items is required.
createElement(BriefingCard, { title: "Weekly sync" });
