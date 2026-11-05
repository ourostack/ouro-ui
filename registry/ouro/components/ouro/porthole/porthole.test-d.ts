import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { Porthole, type PortholeFixed, type PortholeProps } from "@/registry/ouro/components/ouro/porthole/porthole";
import type { PortholeItem, PortholeSource } from "@/registry/ouro/lib/ouro/porthole-view";

// Type tests: `pnpm typecheck` compiles this file.

declare const source: PortholeSource;
declare const fixed: PortholeFixed;

expectTypeOf<{ source: PortholeSource; label: "Status" }>().toExtend<PortholeProps>();
expectTypeOf<{ source: PortholeFixed; label: "Status"; defaultOpen: true; freshWithinMs: 30_000; heartbeatTimeoutMs: 5_000; troubleAfterMs: 5_000 }>().toExtend<PortholeProps>();
expectTypeOf<{
  source: PortholeSource;
  label: "Status";
  labels: { fresh: "Gerade aktualisiert"; dismiss: "Ausblenden" };
  onAction: (item: PortholeItem, actionId: string) => void;
  onDismiss: (item: PortholeItem) => void;
  className: "ms-auto";
  id: "status";
}>().toExtend<PortholeProps>();
expectTypeOf<ComponentProps<typeof Porthole>>().toEqualTypeOf<PortholeProps>();

// source and label are required.
expectTypeOf<{ label: "Status" }>().not.toExtend<PortholeProps>();
expectTypeOf<{ source: PortholeSource }>().not.toExtend<PortholeProps>();

// A fixed source is plain data; one without its beat is not a source.
expectTypeOf<{ source: { snapshot: PortholeFixed["snapshot"] }; label: "Status" }>().not.toExtend<PortholeProps>();

// Guessed props name the fix.
expectTypeOf<{ source: PortholeSource; label: "Status"; items: [] }>().not.toExtend<PortholeProps>();
expectTypeOf<{ source: PortholeSource; label: "Status"; status: "error" }>().not.toExtend<PortholeProps>();

createElement(Porthole, { source, label: "Status" });
createElement(Porthole, { source: fixed, label: "Status" });
// @ts-expect-error label is required.
createElement(Porthole, { source });
