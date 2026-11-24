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
    document.head.append(style);
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
    const later = cap.cloneNode() as HTMLElement;
    document.body.append(later);
    await expect.poll(() => later.style.getPropertyValue("--sq-half")).toBe("15px");
    stop();
    style.remove();
    cap.remove();
    round.remove();
    later.remove();
  });
});
