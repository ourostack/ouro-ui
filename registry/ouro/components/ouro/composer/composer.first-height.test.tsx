import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import { Composer } from "@/registry/ouro/components/ouro/composer/composer";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

describe("Composer first height", () => {
  it("reads the frame in its first animation pass, not during the mount commit", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const frames: FrameRequestCallback[] = [];
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => frames.push(callback));
    const getHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight")!.get!;
    let reads = 0;
    const height = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      if (this.hasAttribute("data-ouro-composer-frame")) reads++;
      return getHeight.call(this) as number;
    });
    try {
      flushSync(() => root.render(<Composer label="Reply" onSend={() => {}} />));
      expect(reads).toBe(0);
      await act(async () => frames.splice(0).forEach((callback) => callback(performance.now())));
      expect(reads).toBe(1);
    } finally {
      raf.mockRestore();
      height.mockRestore();
      await act(async () => root.unmount());
      host.remove();
    }
  });

  it("takes a mode selected before the first frame without animating from an unknown height", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const frames: FrameRequestCallback[] = [];
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => frames.push(callback));
    const moving = vi.fn();
    host.addEventListener("ouro-composer-move", moving);
    const getHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight")!.get!;
    let reads = 0;
    const height = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      if (this.hasAttribute("data-ouro-composer-frame")) reads++;
      return getHeight.call(this) as number;
    });
    try {
      flushSync(() => root.render(<Composer label="Reply" expanded={false} onSend={() => {}} />));
      flushSync(() => root.render(<Composer label="Reply" expanded onSend={() => {}} />));
      const frame = host.querySelector<HTMLElement>("[data-ouro-composer-frame]")!;
      expect(frame.hasAttribute("data-ouro-moving")).toBe(false);
      expect(moving).not.toHaveBeenCalled();
      const before = reads;
      await act(async () => frames.splice(0).forEach((callback) => callback(performance.now())));
      expect(reads).toBe(before);
      expect(frame.hasAttribute("data-ouro-moving")).toBe(false);
      expect(frame.style.minHeight).toBe("");
    } finally {
      raf.mockRestore();
      height.mockRestore();
      await act(async () => root.unmount());
      host.remove();
    }
  });

  it("keeps a measured expanded box still when its props rerender without changing mode", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const frames: FrameRequestCallback[] = [];
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => frames.push(callback));
    const moving = vi.fn();
    host.addEventListener("ouro-composer-move", moving);
    try {
      flushSync(() => root.render(<Composer label="Reply" expanded toolbar={<span>Formatting</span>} onSend={() => {}} />));
      await act(async () => frames.splice(0).forEach((callback) => callback(performance.now())));
      flushSync(() => root.render(<Composer label="Reply" expanded placeholder="Keep writing" toolbar={<span>Formatting</span>} onSend={() => {}} />));
      expect(moving).not.toHaveBeenCalled();
      expect(host.querySelector("[data-ouro-composer-frame]")!.hasAttribute("data-ouro-moving")).toBe(false);
    } finally {
      raf.mockRestore();
      await act(async () => root.unmount());
      host.remove();
    }
  });
});
