import { type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { ReadReceipt, type ReadReceiptProps } from "@/registry/ouro/components/ouro/read-receipt/read-receipt";

// Type tests: `pnpm typecheck` compiles this file.

expectTypeOf<{ readers: [] }>().toExtend<ReadReceiptProps>();
expectTypeOf<{ readers: [{ name: "Ana Lind"; src: "/ana.jpg"; idForColor: "u-1"; initials: "A" }]; label: (names: readonly string[]) => string; className: "ms-auto" }>().toExtend<ReadReceiptProps>();
expectTypeOf<ComponentProps<typeof ReadReceipt>>().toEqualTypeOf<ReadReceiptProps>();

// readers is required, and each needs a name.
expectTypeOf<{ label: (names: readonly string[]) => string }>().not.toExtend<ReadReceiptProps>();
expectTypeOf<{ readers: [{ src: "/ana.jpg" }] }>().not.toExtend<ReadReceiptProps>();

// Guessed props name the fix.
expectTypeOf<{ readers: []; readBy: [] }>().not.toExtend<ReadReceiptProps>();
expectTypeOf<{ readers: []; seenBy: [] }>().not.toExtend<ReadReceiptProps>();
expectTypeOf<{ readers: []; max: 3 }>().not.toExtend<ReadReceiptProps>();
