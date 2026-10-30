import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Inspector } from "@/registry/ouro/components/ouro/inspector/inspector";
import { Toaster } from "@/registry/ouro/components/ouro/toast/toaster";
import { toast } from "@/registry/ouro/lib/ouro/toast";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(async () => {
  await act(async () => {
    toast.dismiss();
    root?.unmount();
  });
  host?.remove();
});

const outlines = () => [...document.querySelectorAll<HTMLElement>("[data-ouro-inspector-outline]")];
const names = () => outlines().map((outline) => outline.querySelector('[data-ouro-part="tag"]')!.textContent);
const toasts = () => [...document.querySelectorAll('[data-ouro="toast"]')];

/** The box the toasts fill together on the screen, whole pixels. */
function stack() {
  const boxes = toasts().map((item) => item.getBoundingClientRect());
  const left = Math.min(...boxes.map((box) => box.left));
  const top = Math.min(...boxes.map((box) => box.top));
  return [left, top, Math.max(...boxes.map((box) => box.right)) - left, Math.max(...boxes.map((box) => box.bottom)) - top].map(Math.round);
}

describe("Inspector over a Toaster", () => {
  it("outlines a Toaster only while it shows a toast, around its toasts", async () => {
    host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);
    await act(async () =>
      root!.render(
        <>
          <Button>Save recipe</Button>
          <Toaster />
          <Inspector open onOpenChange={() => {}} />
        </>,
      ),
    );
    // The Toaster's region is in the page from the start, with no toast in it.
    expect(document.querySelector('[data-ouro="toaster"]')).not.toBeNull();
    await expect.poll(names).toEqual(["button"]);
    // Two toasts that stay until dismissed: the newest in front, the older one peeking out above it, smaller.
    await act(async () => {
      toast("Recipe saved", { duration: Infinity });
      toast("Shopping list shared", { duration: Infinity });
    });
    await expect.poll(names).toEqual(["button", "toaster"]);
    await expect.poll(() => document.getAnimations().filter((animation) => animation.playState === "running").length).toBe(0);
    await expect
      .poll(() => {
        const { left, top, width, height } = outlines()[1]!.getBoundingClientRect();
        return [left, top, width, height].map(Math.round);
      })
      .toEqual(stack());
    await act(async () => {
      toast.dismiss();
    });
    await expect.poll(names).toEqual(["button"]);
  });
});
