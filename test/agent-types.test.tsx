// The development-message channel for the agent snippets in
// scripts/fixtures/agent-types/<item>.snippets.tsx: each snippet's case (<item>.cases.ts) says
// the `Fix:` that a console warning or a thrown error must name. The fixtures are loaded
// through `import.meta.glob`, which the type check does not follow, because their snippets are
// type errors on purpose. scripts/agent-types.test.mjs checks the type check and hover channels.
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import type { AgentCase } from "@/scripts/fixtures/agent-types/shared";

const snippets = Object.assign(
  {},
  ...Object.values(import.meta.glob("../scripts/fixtures/agent-types/*.snippets.tsx", { eager: true })),
) as Record<string, ReactElement>;
const caseFiles = Object.values(
  import.meta.glob<{ agentCases: AgentCase[]; validSnippets: string[] }>("../scripts/fixtures/agent-types/*.cases.ts", { eager: true }),
);
const agentCases = caseFiles.flatMap((file) => file.agentCases);
const validSnippets = caseFiles.flatMap((file) => file.validSnippets);

/** What a snippet says in development: the error it throws on render, or its console warnings. */
async function devMessages(element: ReactElement): Promise<string[]> {
  try {
    renderToString(element);
  } catch (error) {
    return [String((error as Error).message)];
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  await act(async () => root.unmount());
  host.remove();
  return warn.mock.calls.map((call: unknown[]) => String(call[0]));
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("agent snippets in development", () => {
  it.each(agentCases.filter((item) => item.dev !== undefined).map((item) => [item.id, item.habit, item.dev!] as const))(
    "%s (%s) names the fix: %s",
    async (id, _habit, fix) => {
      const messages = await devMessages(snippets[id]!);
      expect(messages.length).toBeGreaterThan(0);
      for (const message of messages) expect(message).toMatch(/^\[ouro-ui\] \w+: /);
      expect(messages.some((message) => message.includes(`Fix: ${fix}`))).toBe(true);
    },
  );

  it.each(validSnippets)("%s is valid and says nothing", async (id) => {
    expect(await devMessages(snippets[id]!)).toEqual([]);
  });
});
