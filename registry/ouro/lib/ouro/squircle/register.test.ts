import { afterEach, describe, expect, it } from "vitest";
import { registerHyperellipse } from "./register";

const nextFrames = async (count = 3): Promise<void> => {
  for (let i = 0; i < count; i++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
};

const mount = (): { box: HTMLElement; cleanup: () => void } => {
  const style = document.createElement("style");
  style.textContent =
    ".sq{width:80px;height:80px;border-radius:24px;background:red;--corner-shape:squircle}";
  const box = document.createElement("div");
  box.className = "sq";
  document.head.append(style);
  document.body.append(box);
  return {
    box,
    cleanup: () => {
      style.remove();
      box.remove();
    },
  };
};

describe("registerHyperellipse in a real browser", () => {
  let controller: ReturnType<typeof registerHyperellipse> | undefined;
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    controller?.destroy();
    cleanup?.();
    controller = undefined;
    cleanup = undefined;
  });

  it("reports whether this engine draws corner-shape natively", () => {
    controller = registerHyperellipse();
    expect(controller.supported).toBe(CSS.supports("corner-shape", "squircle"));
    expect(controller.active).toBe(!controller.supported);
  });

  it("draws the squircle with clip-path when forced, whatever the engine", async () => {
    const { box, cleanup: remove } = mount();
    cleanup = remove;
    controller = registerHyperellipse({ force: true });
    expect(controller.active).toBe(true);
    await expect
      .poll(() => getComputedStyle(box).clipPath, { timeout: 5000 })
      .not.toBe("none");
    await nextFrames();
    controller.destroy();
    controller = undefined;
    await expect.poll(() => getComputedStyle(box).clipPath).toBe("none");
  });

  it("returns the same controller on a second call", () => {
    controller = registerHyperellipse({ force: true });
    expect(registerHyperellipse()).toBe(controller);
  });
});
