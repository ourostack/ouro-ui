import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { NavigationRail } from "@/registry/ouro/components/ouro/navigation-rail/navigation-rail";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Runs in the `touch` project: Chromium as a 390x844 phone with a coarse pointer.

let root: Root | undefined;
const nodes: Element[] = [];
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  for (const node of nodes.splice(0)) node.remove();
});

const icon = <svg viewBox="0 0 24 24" />;

it("gives every item at least 44px for a finger, labels or not, and opens no tooltip on a tap", async () => {
  expect(matchMedia("(pointer: coarse)").matches).toBe(true);
  const host = document.createElement("div");
  host.style.cssText = "display: flex; height: 600px";
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  const items = ["Activity", "Chat", "Calendar"].map((label) => ({ label, onClick: () => {}, icon }));
  for (const hideLabels of [false, true]) {
    await act(async () => root!.render(<NavigationRail label="Main" items={items} hideLabels={hideLabels} />));
    const buttons = [...host.querySelectorAll<HTMLElement>("[data-ouro-control]")];
    expect(buttons).toHaveLength(3);
    for (const button of buttons) {
      const rect = button.getBoundingClientRect();
      expect(rect.width).toBeGreaterThanOrEqual(44);
      expect(rect.height).toBeGreaterThanOrEqual(44);
      expect(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest("button")).toBe(button);
    }
  }
  await userEvent.click(page.getByRole("button", { name: "Chat" }));
  await act(async () => {});
  expect(document.querySelector('[data-ouro="tooltip"]')).toBeNull();
});
