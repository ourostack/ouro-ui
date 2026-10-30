import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { ConversationList } from "@/registry/ouro/components/ouro/conversation-list/conversation-list";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Runs in the `touch` project: Chromium as a 390x844 phone with a coarse pointer.

let root: Root | undefined;
const nodes: Element[] = [];
afterEach(async () => {
  await act(async () => root?.unmount());
  for (const node of nodes.splice(0)) node.remove();
});

it("gives each ConversationList row and section header a target at least 44px tall to a finger, even when compact", async () => {
  expect(matchMedia("(pointer: coarse)").matches).toBe(true);
  const host = document.createElement("div");
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <ConversationList
        label="Conversations"
        density="compact"
        items={[
          { id: "trail", title: "Trail crew", avatar: false },
          { id: "ada", title: "Ada Lovelace", section: "pinned" },
        ]}
        sections={[{ id: "pinned", title: "Pinned" }]}
        onSelect={() => {}}
      />,
    ),
  );
  const rows = [...host.querySelectorAll<HTMLElement>('[data-ouro-control="conversation-list"]')];
  expect(rows).toHaveLength(3);
  for (const row of rows) {
    const rect = row.getBoundingClientRect();
    expect(rect.height).toBeGreaterThanOrEqual(44);
    expect(rect.width).toBeGreaterThanOrEqual(44);
  }
});
