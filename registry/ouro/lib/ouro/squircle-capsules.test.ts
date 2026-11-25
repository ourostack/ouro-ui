import { afterEach, describe, expect, it, vi } from "vitest";
import { capsuleHalf, installSquircleCapsules } from "@/registry/ouro/lib/ouro/squircle-capsules";

describe("capsule measure", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("takes half the shorter side in eighths of a pixel", () => {
    expect(capsuleHalf(100, 31.8)).toBe(15.875);
    expect(capsuleHalf(20, 40)).toBe(10);
  });

  it("does nothing where corner-shape is drawn", () => {
    // Fully supported either way: an OR bails here on corner-shape alone; a mistaken AND would not.
    const supports = vi.spyOn(CSS, "supports").mockReturnValue(true);
    const mutationObserve = vi.spyOn(MutationObserver.prototype, "observe");
    const stop = installSquircleCapsules(document);
    expect(supports).toHaveBeenCalledWith("corner-shape", "squircle");
    expect(mutationObserve).not.toHaveBeenCalled();
    stop();
  });

  it("does nothing where a clip path shape is missing", () => {
    const supports = vi.spyOn(CSS, "supports").mockReturnValue(false);
    const mutationObserve = vi.spyOn(MutationObserver.prototype, "observe");
    const stop = installSquircleCapsules(document);
    expect(supports).toHaveBeenCalledWith("corner-shape", "squircle");
    expect(supports).toHaveBeenCalledWith("clip-path", "shape(from 0 0, close)");
    expect(mutationObserve).not.toHaveBeenCalled();
    expect(stop()).toBeUndefined();
  });

  it("leaves no capsule selector to find, and does not try an empty one", () => {
    // An iframe's fresh document has no stylesheets of its own, unlike the shared test document, which already
    // carries the app's own squircle-corner rules; querySelectorAll("") throws, so the guard must stop watch() first.
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const frameDoc = iframe.contentDocument!;
    expect(frameDoc.styleSheets.length).toBe(0);
    vi.spyOn(frameDoc.defaultView!.CSS, "supports").mockImplementation((prop: string) => prop === "clip-path");
    const querySelectorAll = vi.spyOn(frameDoc, "querySelectorAll");
    const stop = installSquircleCapsules(frameDoc);
    expect(querySelectorAll).not.toHaveBeenCalled();
    stop();
    iframe.remove();
  });

  it("writes a capsule's variables once per distinct half, not once per resize notification", () => {
    vi.spyOn(CSS, "supports").mockImplementation((prop: string) => prop === "clip-path");
    let capturedCallback: ResizeObserverCallback | undefined;
    class StubResizeObserver {
      constructor(cb: ResizeObserverCallback) {
        capturedCallback = cb;
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    }
    vi.stubGlobal("ResizeObserver", StubResizeObserver);
    const el = document.createElement("div");
    const setProperty = vi.spyOn(el.style, "setProperty");
    const entry = (inline: number, block: number) =>
      ({ target: el, borderBoxSize: [{ inlineSize: inline, blockSize: block }] }) as unknown as ResizeObserverEntry;
    const stop = installSquircleCapsules(document);
    capturedCallback!([entry(100, 20)], {} as ResizeObserver);
    expect(setProperty).toHaveBeenCalledTimes(2);
    // Same half (min side unchanged at 20) from a different box: the dedup guard skips the repeat write.
    capturedCallback!([entry(150, 20)], {} as ResizeObserver);
    expect(setProperty).toHaveBeenCalledTimes(2);
    // A genuinely different half writes again.
    capturedCallback!([entry(150, 40)], {} as ResizeObserver);
    expect(setProperty).toHaveBeenCalledTimes(4);
    stop();
  });

  it("observes each matching element's border box exactly once, even watched again", async () => {
    vi.spyOn(CSS, "supports").mockImplementation((prop: string) => prop === "clip-path");
    const observe = vi.spyOn(ResizeObserver.prototype, "observe");
    const style = document.createElement("style");
    style.textContent = ".once { --sq-half: 0; width: 40px; height: 20px; display: block }";
    document.head.append(style);
    const el = document.createElement("div");
    el.className = "once";
    document.body.append(el);
    const stop = installSquircleCapsules(document);
    expect(observe).toHaveBeenCalledExactlyOnceWith(el, { box: "border-box" });
    // A later mutation re-runs watch(); an element already watched is not observed twice.
    document.body.append(document.createElement("span"));
    await Promise.resolve();
    await Promise.resolve();
    expect(observe).toHaveBeenCalledOnce();
    stop();
    style.remove();
    el.remove();
  });

  it("stops both observers and forgets every watched element", async () => {
    vi.spyOn(CSS, "supports").mockImplementation((prop: string) => prop === "clip-path");
    const resizeDisconnect = vi.spyOn(ResizeObserver.prototype, "disconnect");
    const mutationObserve = vi.spyOn(MutationObserver.prototype, "observe");
    const mutationDisconnect = vi.spyOn(MutationObserver.prototype, "disconnect");
    const stop = installSquircleCapsules(document);
    expect(mutationObserve).toHaveBeenCalledExactlyOnceWith(document.documentElement, { childList: true, subtree: true });
    const observe = vi.spyOn(ResizeObserver.prototype, "observe");
    const style = document.createElement("style");
    style.textContent = ".after-stop { --sq-half: 0; width: 40px; height: 20px; display: block }";
    document.head.append(style);
    // Before stop(), a mutation still runs watch(), proving this check means something.
    const before = document.createElement("div");
    before.className = "after-stop";
    document.body.append(before);
    await expect.poll(() => observe.mock.calls.length).toBe(1);
    stop();
    expect(resizeDisconnect).toHaveBeenCalledOnce();
    expect(mutationDisconnect).toHaveBeenCalledOnce();
    const after = document.createElement("div");
    after.className = "after-stop";
    document.body.append(after);
    await Promise.resolve();
    await Promise.resolve();
    // A mutation after stop() finds no watcher left to run watch() again.
    expect(observe).toHaveBeenCalledOnce();
    style.remove();
    before.remove();
    after.remove();
  });

  it("measures a capsule the plugin waits on, and leaves a round control alone", async () => {
    vi.spyOn(CSS, "supports").mockImplementation((prop: string) => prop === "clip-path");
    const style = document.createElement("style");
    // A keyframe step's rule carries --sq-half in its cssText but has no cssRules of its own, unlike a style or
    // grouping rule; it goes first so a mistaken recursion into it throws before .cap and .nested are reached,
    // losing both instead of leaving them already collected.
    style.textContent = "@keyframes probe { 0% { --sq-half: 9px } }";
    style.textContent += ".cap { --sq-tl: var(--sq-half); width: 100px; height: 30px; display: block }";
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
