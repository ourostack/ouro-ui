import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { OuroMcpApp, type OuroMcpAppProps } from "@/registry/ouro/components/ouro/mcp-app/ouro-mcp-app";
import type { A2UIHandoff } from "@/registry/ouro/components/ouro/a2ui-surface/a2ui-surface";
import type { McpAppHostLink } from "@/registry/ouro/lib/ouro/mcp-app";

// Type tests: `pnpm typecheck` compiles this file.

declare const catalog: unknown;
declare const host: McpAppHostLink;

expectTypeOf<{ catalog: unknown }>().toExtend<OuroMcpAppProps>();
expectTypeOf<{ catalog: unknown; host: McpAppHostLink; handoffUrl: (h: A2UIHandoff) => string; appInfo: { name: "Recipes"; version: "1.0.0" }; className: "max-w-md" }>().toExtend<OuroMcpAppProps>();
expectTypeOf<ComponentProps<typeof OuroMcpApp>>().toEqualTypeOf<OuroMcpAppProps>();

// The view calls each action's tool through the host: it takes no onAction.
expectTypeOf<{ catalog: unknown; onAction: () => void }>().not.toExtend<OuroMcpAppProps>();

// @ts-expect-error catalog is required: tool results carry only its id.
createElement(OuroMcpApp, { host });
createElement(OuroMcpApp, { catalog });
