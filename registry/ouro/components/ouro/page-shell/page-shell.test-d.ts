import { expectTypeOf } from "vitest";
import { PageSection, PageShell, type PageSectionProps, type PageShellProps } from "@/registry/ouro/components/ouro/page-shell/page-shell";

// Type tests: `pnpm typecheck` compiles this file.

expectTypeOf<{ className: "mt-8"; id: "top" }>().toExtend<PageShellProps>();
expectTypeOf<{ className: "mt-8"; "aria-label": "Work" }>().toExtend<PageSectionProps>();
expectTypeOf(PageShell).parameter(0).toEqualTypeOf<PageShellProps>();
expectTypeOf(PageSection).parameter(0).toEqualTypeOf<PageSectionProps>();
