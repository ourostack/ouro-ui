import { createElement, type ReactNode, type RefObject } from "react";
import { expectTypeOf } from "vitest";
import { ThreadRail, type ThreadRailProps } from "@/registry/ouro/components/ouro/thread-rail/thread-rail";

// Type tests: `pnpm typecheck` compiles this file.

type Focus = RefObject<HTMLElement | null>;

expectTypeOf<{ label: "Thread"; onClose: () => void }>().toExtend<ThreadRailProps>();
expectTypeOf<{
  label: "Thread";
  title: "Ana's replies";
  detail: "Design reviews";
  meta: "2 replies";
  onClose: () => void;
  closeLabel: "Hide replies";
  initialFocus: Focus;
  autoFocus: false;
  returnFocus: Focus;
  children: ReactNode;
  className: "w-96";
}>().toExtend<ThreadRailProps>();

// label and onClose are required.
expectTypeOf<{ onClose: () => void }>().not.toExtend<ThreadRailProps>();
expectTypeOf<{ label: "Thread" }>().not.toExtend<ThreadRailProps>();

// Guessed props name the fix.
expectTypeOf<{ label: "Thread"; onClose: () => void; open: true }>().not.toExtend<ThreadRailProps>();
expectTypeOf<{ label: "Thread"; onClose: () => void; onOpenChange: () => void }>().not.toExtend<ThreadRailProps>();

// @ts-expect-error label is required.
createElement(ThreadRail, { onClose: () => {} });
