import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { DraftReview } from "@/registry/ouro/components/ouro/draft-review/draft-review";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Runs in the `touch` project: Chromium as a 390x844 phone with a coarse pointer.

let root: Root | undefined;
const nodes: Element[] = [];
afterEach(async () => {
  await act(async () => root?.unmount());
  for (const node of nodes.splice(0)) node.remove();
});

it("gives each of DraftReview's buttons a target at least 44px square to a finger", async () => {
  expect(matchMedia("(pointer: coarse)").matches).toBe(true);
  const host = document.createElement("div");
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <DraftReview
        segments={[
          { kind: "same", text: "I can meet on " },
          { kind: "insert", text: "Friday", changeId: "day" },
          { kind: "delete", text: " Thanks!", changeId: "thanks" },
        ]}
        changes={[
          { id: "day", author: "agent", name: "Ouro", source: "Based on 3 messages" },
          { id: "thanks", author: "human", name: "Ada" },
        ]}
        onAccept={() => {}}
        onReject={() => {}}
        onAcceptAll={() => {}}
        onRejectAll={() => {}}
        onShowSource={() => {}}
      />,
    ),
  );
  const buttons = [...host.querySelectorAll<HTMLElement>('[data-ouro-control="draft-review"]')];
  expect(buttons.map((button) => button.dataset.ouroPart)).toEqual(["accept-all", "reject-all", "show-source", "accept", "reject", "accept", "reject"]);
  for (const button of buttons) {
    const rect = (button.querySelector<HTMLElement>("[data-ouro-touch-target]") ?? button).getBoundingClientRect();
    expect(rect.height, button.dataset.ouroPart).toBeGreaterThanOrEqual(44);
    expect(rect.width, button.dataset.ouroPart).toBeGreaterThanOrEqual(44);
  }
});
