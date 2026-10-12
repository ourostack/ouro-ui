import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { Chart, ChartContainer, type ChartConfig, type ChartProps, type ChartSeries } from "@/registry/ouro/components/ouro/chart/chart";

// Type tests: `pnpm typecheck` compiles this file.

interface Month {
  month: string;
  cooked: number;
  saved: number;
}
const months: Month[] = [{ month: "January", cooked: 12, saved: 4 }];

// An interface row works, and config, categoryKey and tones are checked against it.
expectTypeOf<{ title: "Cooking"; data: Month[]; categoryKey: "month"; config: { cooked: { label: "Cooked" } } }>().toExtend<ChartProps<Month>>();
expectTypeOf<{ label: "Cooked"; tone: "chart-3" }>().toExtend<ChartSeries>();
expectTypeOf<{ label: "Burnt"; tone: "destructive" }>().toExtend<ChartSeries>();
expectTypeOf<{ month: { label: "Month" }; cooked: { label: "Cooked"; tone: "chart-1" } }>().toExtend<ChartConfig<Month>>();
expectTypeOf<ComponentProps<typeof ChartContainer>>().toEqualTypeOf<ComponentProps<typeof Chart>>();

// title, data, categoryKey and config are required; categoryKey and config keys must be keys of the row.
expectTypeOf<{ data: Month[]; categoryKey: "month"; config: { cooked: { label: "Cooked" } } }>().not.toExtend<ChartProps<Month>>();
expectTypeOf<{ title: "Cooking"; data: Month[]; categoryKey: "week"; config: { cooked: { label: "Cooked" } } }>().not.toExtend<ChartProps<Month>>();
expectTypeOf<{ baked: { label: "Baked" } }>().not.toExtend<ChartConfig<Month>>();
// Colors come from tones: shadcn's color and theme are type errors, as are color names.
expectTypeOf<{ label: "Cooked"; color: "#f00" }>().not.toExtend<ChartSeries>();
expectTypeOf<{ label: "Cooked"; theme: { light: "#f00"; dark: "#0f0" } }>().not.toExtend<ChartSeries>();
expectTypeOf<{ label: "Cooked"; tone: "red" }>().not.toExtend<ChartSeries>();
expectTypeOf<{ title: "Cooking"; data: Month[]; categoryKey: "month"; config: { cooked: { label: "Cooked" } }; type: "pie" }>().not.toExtend<ChartProps<Month>>();

// @ts-expect-error title is required.
createElement(Chart<Month>, { data: months, categoryKey: "month", config: { cooked: { label: "Cooked" } } });
