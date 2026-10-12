import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { Attachment } from "@/registry/ouro/components/ouro/message/attachment";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { rotate } from "@/registry/ouro/lib/ouro/testing/rotate";

// Runs in the `touch` project: Chromium as a 390x844 phone with a coarse pointer.

let root: Root | undefined;
const nodes: Element[] = [];
afterEach(async () => {
  await act(async () => root?.unmount());
  for (const node of nodes.splice(0)) node.remove();
  await rotate(390, 844);
});

async function render() {
  const host = document.createElement("div");
  host.style.padding = "24px";
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  await act(async () => root!.render(<Attachment name="menu.pdf" size={2048} href="/menu.pdf" onRemove={() => {}} />));
  return host.querySelector<HTMLElement>('[data-ouro="attachment"]')!;
}

/** Whether a tap 21px from the center in each direction still lands on the control. */
function hasTouchTarget(control: Element) {
  const rect = control.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const hits = (x: number, y: number) => control.contains(document.elementFromPoint(x, y));
  return hits(cx, cy - 21) && hits(cx, cy + 21) && hits(cx - 21, cy) && hits(cx + 21, cy);
}

it.each([
  ["portrait", 390, 844],
  ["landscape", 844, 390],
])("gives the link and the remove button 44px targets and 16px text on a %s phone", async (_name, width, height) => {
  await rotate(width, height);
  const attachment = await render();
  const link = attachment.querySelector("a")!;
  const remove = attachment.querySelector("button")!;
  expect(link.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  expect(hasTouchTarget(remove)).toBe(true);
  expect(getComputedStyle(attachment).fontSize).toBe("16px");
});

it("keeps the remove button's target off the link, so a tap on the link's edge opens the file", async () => {
  const attachment = await render();
  const link = attachment.querySelector("a")!;
  const remove = attachment.querySelector("button")!;
  const edge = link.getBoundingClientRect();
  expect(link.contains(document.elementFromPoint(edge.right - 1, edge.top + edge.height / 2))).toBe(true);
  expect(remove.getBoundingClientRect().left).toBeGreaterThanOrEqual(edge.right);
});
