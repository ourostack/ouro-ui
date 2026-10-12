import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { Resizable, ResizableHandle, type ResizableHandleProps, ResizablePanel, ResizablePanelGroup, type ResizablePanelGroupProps, type ResizablePanelProps, type ResizableProps } from "@/registry/ouro/components/ouro/resizable/resizable";

// Type tests: `pnpm typecheck` compiles this file, and every `@ts-expect-error`
// fails the check if the line below it stops being an error.

expectTypeOf<{ children: "Panels" }>().toExtend<ResizableProps>();
expectTypeOf<{
  children: "Panels";
  orientation: "vertical";
  autoSaveId: "editor";
  onLayout: (sizes: number[]) => void;
  handleLabel: "Resize {panel}";
  className: "h-96";
}>().toExtend<ResizableProps>();
expectTypeOf<ComponentProps<typeof Resizable>>().toEqualTypeOf<ResizableProps>();
expectTypeOf<ComponentProps<typeof ResizablePanelGroup>>().toEqualTypeOf<ResizablePanelGroupProps>();
expectTypeOf<ComponentProps<typeof ResizableHandle>>().toEqualTypeOf<ResizableHandleProps>();
expectTypeOf<{ label: "Files"; defaultSize: 25; minSize: 15; maxSize: 50; id: "files"; className: "p-4"; children: "Body" }>().toExtend<ResizablePanelProps>();
expectTypeOf<{ "aria-label": "Resize the preview" }>().toExtend<ResizableHandleProps>();

// A panel needs a label; it names the handle after it.
expectTypeOf<{ defaultSize: 50 }>().not.toExtend<ResizablePanelProps>();
// Named options only, and shadcn's props are hint types.
expectTypeOf<{ children: "Panels"; orientation: "row" }>().not.toExtend<ResizableProps>();
expectTypeOf<{ children: "Panels"; direction: "vertical" }>().not.toExtend<ResizableProps>();
expectTypeOf<{ children: "Panels"; direction: "vertical" }>().not.toExtend<ResizablePanelGroupProps>();
expectTypeOf<{ withHandle: true }>().not.toExtend<ResizableHandleProps>();

// @ts-expect-error label is required.
createElement(ResizablePanel, { defaultSize: 50 });
