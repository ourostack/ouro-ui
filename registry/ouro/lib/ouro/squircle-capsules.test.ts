import { afterEach, describe, expect, it, vi } from "vitest";
import { capsuleHalf, installSquircleCapsules } from "@/registry/ouro/lib/ouro/squircle-capsules";

describe("capsule measure", () => {
  afterEach(() => vi.restoreAllMocks());

  it("takes half the shorter side in eighths of a pixel", () => {
    expect(capsuleHalf(100, 31.8)).toBe(15.875);
    expect(capsuleHalf(20, 40)).toBe(10);
  });

  it("does nothing where corner-shape is drawn", () => {
    const observe = vi.spyOn(ResizeObserver.prototype, "observe");
    const stop = installSquircleCapsules(document);
    expect(observe).not.toHaveBeenCalled();
    stop();
  });

  it("does nothing where a clip path shape is missing", () => {
    vi.spyOn(CSS, "supports").mockReturnValue(false);
    expect(installSquircleCapsules(document)()).toBeUndefined();
  });

  it("measures a capsule the plugin waits on, and leaves a round control alone", async () => {
    vi.spyOn(CSS, "supports").mockImplementation((prop: string) => prop === "clip-path");
    const style = document.createElement("style");
    style.textContent = ".cap { --sq-tl: var(--sq-half); width: 100px; height: 30px; display: block }";
    style.textContent += "@media all { .nested { --sq-tr: var(--sq-half); width: 60px; height: 20px; display: block } } .plain { width: 50px; height: 20px; display: block } @page { margin: 0 }";
    document.head.append(style);
    const nested = document.createElement("div");
    nested.className = "nested";
    const plain = document.createElement("div");
    plain.className = "plain";
    document.body.append(nested, plain);
    const cap = document.createElement("div");
    cap.className = "cap";
    const round = document.createElement("div");
    round.className = "cap";
    round.setAttribute("data-ouro-avatar-presence", "");
    document.body.append(cap, round);
    const stop = installSquircleCapsules(document);
    await expect.poll(() => cap.style.getPropertyValue("--sq-half")).toBe("15px");
    expect(cap.style.getPropertyValue("--sq-capsule-radius")).toBe(`${15 * 0.543}px`);
    expect(round.style.getPropertyValue("--sq-half")).toBe("");
    await expect.poll(() => nested.style.getPropertyValue("--sq-half")).toBe("10px");
    expect(plain.style.getPropertyValue("--sq-half")).toBe("");
    const later = cap.cloneNode() as HTMLElement;
    document.body.append(later);
    await expect.poll(() => later.style.getPropertyValue("--sq-half")).toBe("15px");
    stop();
    style.remove();
    cap.remove();
    round.remove();
    later.remove();
    nested.remove();
    plain.remove();
  });
});
