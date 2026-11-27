import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Avatar } from "@/registry/ouro/components/ouro/avatar/avatar";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Command, type CommandItem } from "@/registry/ouro/components/ouro/command/command";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// A palette that jumps to any person or chat draws a row for every result, and redraws them as the search
// changes, so a row's elements and class names are paid once per row, each time: every element is one more
// style to compute, and every class name one more set of rules the engine matches against it. Each budget is
// what the row draws now, with room for two more class names (a small fix, such as a forced-colours edge) and
// none for another element: an element costs the most, so one more must be paid for by a cut elsewhere in the
// row. A cut lowers the budget.

const icon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 12h16" />
  </svg>
);

const rows: { row: string; item: CommandItem; elements: number; classes: number }[] = [
  { row: "a plain row", item: { label: "Plain", onSelect: () => {} }, elements: 2, classes: 34 },
  { row: "a row with an icon", item: { label: "With an icon", onSelect: () => {}, icon }, elements: 5, classes: 41 },
  { row: "a person's row, with their avatar", item: { label: "Ana Lind", onSelect: () => {}, avatar: <Avatar name="Ana Lind" alt="" size="xs" /> }, elements: 5, classes: 59 },
  {
    row: "a person's row with a presence dot",
    item: { label: "Ben Ito", onSelect: () => {}, avatar: <Avatar name="Ben Ito" alt="" size="xs" presence="busy" presenceLabel="Busy" /> },
    elements: 8,
    classes: 74,
  },
  { row: "a row with a description", item: { label: "Described", onSelect: () => {}, description: "A line under the label" }, elements: 4, classes: 42 },
  { row: "a row with a shortcut", item: { label: "Shortcut", onSelect: () => {}, shortcut: ["mod", "k"] }, elements: 7, classes: 59 },
  {
    row: "a chat's row with everything: avatar, description, unread mark and shortcut",
    item: {
      label: "Cy Voss",
      onSelect: () => {},
      avatar: <Avatar name="Cy Voss" alt="" size="xs" />,
      description: "See you at nine",
      unread: true,
      mark: <Badge>3</Badge>,
      shortcut: ["mod", "3"],
    },
    elements: 15,
    classes: 120,
  },
];

let unmount: (() => Promise<void>) | undefined;
afterEach(async () => {
  await unmount?.();
  unmount = undefined;
});

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.dataset["testHarness"] = "";
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(node));
  unmount = async () => {
    await act(async () => root.unmount());
    host.remove();
  };
}

describe("Command row weight", () => {
  it.each(rows)("draws $row in no more than $elements elements and $classes class names", async ({ item, elements, classes }) => {
    await render(<Command title="Go to" open onOpenChange={() => {}} items={[item]} />);
    await expect.poll(() => document.querySelector("[data-ouro-command-value]")).not.toBeNull();
    const row = document.querySelector<HTMLElement>("[data-ouro-command-value]")!;
    const drawn = [row, ...row.querySelectorAll("*")];
    const drawnClasses = drawn.reduce((sum, element) => sum + element.classList.length, 0);
    expect(drawn.length, "elements").toBeLessThanOrEqual(elements);
    expect(drawnClasses, "class names").toBeLessThanOrEqual(classes);
  });
});
