import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { commands } from "vitest/browser";
import { SnapPiP } from "@/registry/ouro/components/ouro/snap-pip/snap-pip";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Real touch input on a phone-sized page (the ouro-touch project): a finger throws the picture
// as a mouse does, the page does not scroll under it, and the picture is far bigger than a 44px
// touch target.

let root: Root | undefined;
let stage: HTMLElement | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  stage?.remove();
});

async function render(onCornerChange: (corner: string) => void) {
  stage = document.createElement("div");
  Object.assign(stage.style, { position: "relative", width: "360px", height: "600px" });
  document.body.append(stage);
  root = createRoot(stage);
  await act(async () => root!.render(<SnapPiP label="Your camera" onCornerChange={onCornerChange} />));
  return stage.querySelector<HTMLElement>('[data-ouro="snap-pip"]')!;
}

const middle = (element: Element): [number, number] => {
  const rect = element.getBoundingClientRect();
  return [rect.left + rect.width / 2, rect.top + rect.height / 2];
};

describe("SnapPiP on a phone", () => {
  it("is thrown by a finger to the corner it points at, and takes the touch from the page", async () => {
    const onCornerChange = vi.fn();
    const element = await render(onCornerChange);
    const box = element.getBoundingClientRect();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(getComputedStyle(element).touchAction).toBe("none");
    const [x, y] = middle(element);
    const scroll = scrollY;
    await commands.touchDrag({ from: [x, y], to: [x - 120, y - 200], steps: 8, durationMs: 80 });
    await expect.poll(() => onCornerChange.mock.calls).toEqual([["top-left"]]);
    await expect.poll(() => element.hasAttribute("data-ouro-settling")).toBe(false);
    expect(element.style.translate).toBe("16px 16px");
    expect(scrollY).toBe(scroll);
  });
});
