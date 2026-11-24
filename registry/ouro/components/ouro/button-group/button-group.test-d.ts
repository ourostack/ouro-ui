import { type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { ButtonGroup, type ButtonGroupProps } from "@/registry/ouro/components/ouro/button-group/button-group";

// A call site's props, typed as the component takes them. A case below keeps children in the props object because it
// checks the props a call passes, children among them, and a .ts file has no JSX to put children in; an app's lint
// (react(no-children-prop)) flags children passed in createElement's props, so the check doesn't call createElement.
const propsOf = <P>(value: P): P => value;

// Type tests: `pnpm typecheck` compiles this file, and every `@ts-expect-error`
// fails the check if the line below it stops being an error.

expectTypeOf<{ label: "Pagination"; children: "x" }>().toExtend<ButtonGroupProps>();
expectTypeOf<{ label: "Pagination"; children: "x"; fullWidth: true; className: "mt-4" }>().toExtend<ButtonGroupProps>();

// The label is required: a group needs a name.
expectTypeOf<{ children: "x" }>().not.toExtend<ButtonGroupProps>();

// Looks belong to each Button; a group is always a joined row.
expectTypeOf<{ label: "Pagination"; children: "x"; variant: "outline" }>().not.toExtend<ButtonGroupProps>();
expectTypeOf<{ label: "Pagination"; children: "x"; tone: "secondary" }>().not.toExtend<ButtonGroupProps>();
expectTypeOf<{ label: "Pagination"; children: "x"; size: "sm" }>().not.toExtend<ButtonGroupProps>();
expectTypeOf<{ label: "Pagination"; children: "x"; orientation: "vertical" }>().not.toExtend<ButtonGroupProps>();
expectTypeOf<{ label: "Pagination"; children: "x"; isAttached: true }>().not.toExtend<ButtonGroupProps>();

// @ts-expect-error label is required.
propsOf<ComponentProps<typeof ButtonGroup>>({ children: "x" });
// @ts-expect-error variant goes on each Button.
propsOf<ComponentProps<typeof ButtonGroup>>({ label: "Pagination", variant: "outline", children: "x" });

// glass is a boolean.
expectTypeOf<{ label: "History"; children: "x"; glass: true }>().toExtend<ButtonGroupProps>();
