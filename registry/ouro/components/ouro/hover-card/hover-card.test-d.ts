import { createElement, type ComponentProps, type ReactElement } from "react";
import { expectTypeOf } from "vitest";
import { HoverCard, type HoverCardProps } from "@/registry/ouro/components/ouro/hover-card/hover-card";

// Type tests: `pnpm typecheck` compiles this file, and every `@ts-expect-error`
// fails the check if the line below it stops being an error.

const link = createElement("a", { href: "/cooks/ari" }) as ReactElement;

expectTypeOf<{ trigger: ReactElement; children: "Preview" }>().toExtend<HoverCardProps>();
expectTypeOf<{ trigger: ReactElement; children: "Preview"; side: "top"; align: "start"; className: "w-96" }>().toExtend<HoverCardProps>();
expectTypeOf<ComponentProps<typeof HoverCard>>().toEqualTypeOf<HoverCardProps>();

// A trigger and a preview are required.
expectTypeOf<{ children: "Preview" }>().not.toExtend<HoverCardProps>();
expectTypeOf<{ trigger: ReactElement }>().not.toExtend<HoverCardProps>();
// Named options only, and no timing props.
expectTypeOf<{ trigger: ReactElement; children: "Preview"; side: "under" }>().not.toExtend<HoverCardProps>();
expectTypeOf<{ trigger: ReactElement; children: "Preview"; openDelay: 0 }>().not.toExtend<HoverCardProps>();
expectTypeOf<{ trigger: ReactElement; children: "Preview"; closeDelay: 0 }>().not.toExtend<HoverCardProps>();
expectTypeOf<{ trigger: ReactElement; content: "Preview" }>().not.toExtend<HoverCardProps>();

// @ts-expect-error -- no trigger
createElement(HoverCard, { children: "Preview" });
createElement(HoverCard, { trigger: link, children: "Preview" });
