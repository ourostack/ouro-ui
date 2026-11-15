import { createElement, type ReactNode } from "react";
import { expectTypeOf } from "vitest";
import { ThreadLayout, type ThreadLayoutProps } from "@/registry/ouro/components/ouro/thread-layout/thread-layout";

// Type tests: `pnpm typecheck` compiles this file.

expectTypeOf<{ conversation: "list" }>().toExtend<ThreadLayoutProps>();
expectTypeOf<{ conversation: "list"; thread: null }>().toExtend<ThreadLayoutProps>();
expectTypeOf<{ conversation: "list"; thread: ReactNode; className: "h-96" }>().toExtend<ThreadLayoutProps>();

// conversation is required; thread is optional.
expectTypeOf<{ thread: null }>().not.toExtend<ThreadLayoutProps>();

// A guessed prop names the fix.
expectTypeOf<{ conversation: "list"; rail: "thread" }>().not.toExtend<ThreadLayoutProps>();

// @ts-expect-error conversation is required.
createElement(ThreadLayout, {});
