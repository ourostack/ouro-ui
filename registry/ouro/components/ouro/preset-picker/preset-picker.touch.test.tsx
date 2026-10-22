import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { PresetPicker } from "@/registry/ouro/components/ouro/preset-picker/preset-picker";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Runs in the `touch` project: Chromium as a 390x844 phone with a coarse pointer.

let root: Root | undefined;
const nodes: Element[] = [];
afterEach(async () => {
  await act(async () => root?.unmount());
  for (const node of nodes.splice(0)) node.remove();
});

it("gives each PresetPicker card a target at least 44px tall to a finger, one card per row", async () => {
  expect(matchMedia("(pointer: coarse)").matches).toBe(true);
  const host = document.createElement("div");
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <PresetPicker
        label="Layouts"
        items={[
          { value: "chats", label: "Chats first" },
          { value: "focus", label: "Focus" },
        ]}
        value="chats"
        onValueChange={() => {}}
      />,
    ),
  );
  const cards = [...host.querySelectorAll<HTMLElement>('[data-ouro-control="preset-picker"]')];
  expect(cards).toHaveLength(2);
  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    expect(rect.height).toBeGreaterThanOrEqual(44);
    expect(rect.width).toBeGreaterThanOrEqual(44);
  }
  expect(cards[1]!.getBoundingClientRect().top).toBeGreaterThan(cards[0]!.getBoundingClientRect().bottom);
});
