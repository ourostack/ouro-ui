// Type tests: `pnpm typecheck` compiles this file, and every `@ts-expect-error`
// fails the check if the line below it stops being an error.
import { createElement, type ComponentProps, type ComponentType, type SVGProps } from "react";
import { expectTypeOf } from "vitest";
import { Button, type ButtonProps } from "@/registry/ouro/ui/button/button";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

// Valid shapes.
expectTypeOf<{ children: "Go" }>().toExtend<ButtonProps>();
expectTypeOf<{ children: "Go"; type: "submit"; loading: true }>().toExtend<ButtonProps>();
expectTypeOf<{ children: "Go"; href: "/x"; target: "_blank"; rel: "noopener" }>().toExtend<ButtonProps>();
expectTypeOf<{
  children: "Go";
  tone: "danger";
  variant: "soft";
  size: "lg";
  fullWidth: true;
  startIcon: Icon;
  endIcon: Icon;
}>().toExtend<ButtonProps>();
expectTypeOf<ComponentProps<typeof Button>>().toEqualTypeOf<ButtonProps>();

// The guessed names are declared `never`, so they fail with JSDoc pointing to the real prop.
expectTypeOf<{ children: "Go"; isLoading: true }>().not.toExtend<ButtonProps>();
expectTypeOf<{ children: "Go"; color: "red" }>().not.toExtend<ButtonProps>();
expectTypeOf<{ children: "Go"; asChild: true }>().not.toExtend<ButtonProps>();
expectTypeOf<{ children: "Go"; leftIcon: Icon }>().not.toExtend<ButtonProps>();
expectTypeOf<{ children: "Go"; rightIcon: Icon }>().not.toExtend<ButtonProps>();

// A link is not a submit button, and cannot be natively disabled.
expectTypeOf<{ children: "Go"; href: "/x"; type: "submit" }>().not.toExtend<ButtonProps>();
expectTypeOf<{ children: "Go"; href: "/x"; disabled: true }>().not.toExtend<ButtonProps>();

// Appearance is named, never a color.
expectTypeOf<{ children: "Go"; tone: "red" }>().not.toExtend<ButtonProps>();
expectTypeOf<{ children: "Go"; variant: "ghost" }>().not.toExtend<ButtonProps>();

// Children are required.
expectTypeOf<{ type: "button" }>().not.toExtend<ButtonProps>();

// The same checks through JSX.
// @ts-expect-error isLoading is not a prop; use loading.
createElement(Button, { isLoading: true, children: "Go" });
// @ts-expect-error href and type="submit" cannot be combined.
createElement(Button, { href: "/x", type: "submit", children: "Go" });
