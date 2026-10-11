// Type tests: `pnpm typecheck` compiles this file.
import { expectTypeOf } from "vitest";
import type { HeadingProps } from "@/registry/ouro/ui/text/heading";
import type { TextProps } from "@/registry/ouro/ui/text/text";

expectTypeOf<{ children: "a"; as: "span"; tone: "muted"; size: "lg"; align: "center" }>().toExtend<TextProps>();
expectTypeOf<{ children: "a"; truncate: true }>().toExtend<TextProps>();
expectTypeOf<{ children: "a"; lines: 2 }>().toExtend<TextProps>();
expectTypeOf<{ children: "a"; as: "h2" }>().not.toExtend<TextProps>();
expectTypeOf<{ children: "a"; color: "red" }>().not.toExtend<TextProps>();
expectTypeOf<{ children: "a"; tone: "danger" }>().not.toExtend<TextProps>();
// truncate is one line; lines clamps to many. Use one.
expectTypeOf<{ children: "a"; truncate: true; lines: 2 }>().not.toExtend<TextProps>();

expectTypeOf<{ children: "a"; level: 2; size: "xl" }>().toExtend<HeadingProps>();
// level is required: it sets the tag and the document outline.
expectTypeOf<{ children: "a" }>().not.toExtend<HeadingProps>();
expectTypeOf<{ children: "a"; level: 7 }>().not.toExtend<HeadingProps>();
expectTypeOf<{ children: "a"; level: 1; as: "h2" }>().not.toExtend<HeadingProps>();
