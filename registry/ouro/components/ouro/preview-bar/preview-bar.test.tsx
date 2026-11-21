import { useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { PreviewBar, type PreviewBarProps } from "@/registry/ouro/components/ouro/preview-bar/preview-bar";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { watchAnnouncements } from "@/registry/ouro/lib/ouro/testing/announcements";

const roots: Root[] = [];
let mounted: Element[] = [];

function props(extra: Partial<PreviewBarProps> = {}): PreviewBarProps & { onCompareChange: Mock<(comparing: boolean) => void> } {
  return { label: "Trying the Ocean theme", onKeep: vi.fn(), onDiscard: vi.fn(), onCompareChange: vi.fn<(comparing: boolean) => void>(), ...extra } as ReturnType<typeof props>;
}

async function render(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  const part = (name: "compare" | "discard" | "keep") => host.querySelector<HTMLButtonElement>(`[data-ouro-control="preview-bar"][data-ouro-part="${name}"]`)!;
  return { host, part, bar: () => host.querySelector<HTMLElement>('[data-ouro="preview-bar"]')!, rerender: (next: ReactNode) => act(async () => root.render(next)) };
}

const key = (target: EventTarget, type: "keydown" | "keyup", init: KeyboardEventInit) => act(async () => void target.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init })));
const pointer = (target: EventTarget, type: string, init: PointerEventInit = {}) => act(async () => void target.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, ...init })));

let warn: Mock<(...args: unknown[]) => void>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {}) as unknown as typeof warn;
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
});

/** Moves the clock a press is timed by. */
function clock(start = 1000) {
  let now = start;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  return (ms: number) => void (now += ms);
}

describe("PreviewBar", () => {
  it("is a named group with the label, Compare, Throw away and Keep", async () => {
    const { bar, part } = await render(<PreviewBar {...props()} />);
    expect(bar().getAttribute("role")).toBe("group");
    expect(bar().getAttribute("aria-labelledby")).toBe(bar().querySelector("span")!.id);
    expect(bar().textContent).toContain("Trying the Ocean theme");
    expect(part("compare").textContent).toBe("Compare");
    expect(part("discard").textContent).toBe("Throw away");
    expect(part("keep").textContent).toBe("Keep");
  });

  it("takes the words of its buttons and the Compare key", async () => {
    const { part } = await render(<PreviewBar {...props({ keepLabel: "Apply", discardLabel: "Undo", compareLabel: "Before", compareKey: "b" })} />);
    expect([part("keep").textContent, part("discard").textContent, part("compare").textContent]).toEqual(["Apply", "Undo", "Before"]);
    expect(part("compare").getAttribute("aria-keyshortcuts")).toBe("b");
  });

  it("calls onKeep and onDiscard from their buttons", async () => {
    const p = props();
    const { part } = await render(<PreviewBar {...p} />);
    await act(async () => part("keep").click());
    await act(async () => part("discard").click());
    expect(p.onKeep).toHaveBeenCalledTimes(1);
    expect(p.onDiscard).toHaveBeenCalledTimes(1);
  });

  it("throws the change away on Escape in the bar, unless something inside already handled it", async () => {
    const p = props();
    const { part } = await render(<PreviewBar {...p} />);
    await key(part("keep"), "keydown", { key: "Escape" });
    expect(p.onDiscard).toHaveBeenCalledTimes(1);
    part("keep").addEventListener("keydown", (event) => event.preventDefault());
    await key(part("keep"), "keydown", { key: "Escape" });
    expect(p.onDiscard).toHaveBeenCalledTimes(1);
    await key(part("keep"), "keydown", { key: "a" });
    expect(p.onDiscard).toHaveBeenCalledTimes(1);
  });

  it("applies the app's layout class", async () => {
    const { bar } = await render(<PreviewBar {...props({ className: "mt-6" })} />);
    expect(bar().className).toContain("mt-6");
  });

  describe("announcement", () => {
    it("says each new proposal once, and not again on later renders", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const announced = watchAnnouncements();
      try {
        const p = props();
        const { rerender } = await render(<PreviewBar {...p} />);
        await act(() => vi.advanceTimersByTimeAsync(1500));
        expect(announced.count("Trying the Ocean theme")).toBe(1);
        await rerender(<PreviewBar {...p} keepLabel="Apply" />);
        await act(() => vi.advanceTimersByTimeAsync(1500));
        expect(announced.count("Trying the Ocean theme")).toBe(1);
        await rerender(<PreviewBar {...p} label="Trying the Forest theme" />);
        await act(() => vi.advanceTimersByTimeAsync(1500));
        expect(announced.count("Trying the Forest theme")).toBe(1);
      } finally {
        announced.stop();
      }
    });

    it("says the countdown's meaning in words, and never the ticking numbers", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const announced = watchAnnouncements();
      try {
        const { host } = await render(<PreviewBar {...props({ seconds: 5 })} />);
        for (let second = 0; second < 3; second++) await act(() => vi.advanceTimersByTimeAsync(1000));
        expect(announced.count("Trying the Ocean theme. Reverts in 5 seconds unless you keep it.")).toBe(1);
        expect(announced.changes).toHaveLength(1);
        expect(host.querySelector("[data-slot=preview-bar-countdown]")!.textContent).toBe("2s");
      } finally {
        announced.stop();
      }
    });

    it("says the app's own announcement instead", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const announced = watchAnnouncements();
      try {
        await render(<PreviewBar {...props({ announcement: "Ocean theme on trial" })} />);
        await act(() => vi.advanceTimersByTimeAsync(1500));
        expect(announced.count("Ocean theme on trial")).toBe(1);
      } finally {
        announced.stop();
      }
    });
  });

  describe("countdown", () => {
    it("is drawn in view, hidden from screen readers, and absent without seconds", async () => {
      const { host } = await render(<PreviewBar {...props({ seconds: 30 })} />);
      const countdown = host.querySelector("[data-slot=preview-bar-countdown]")!;
      expect(countdown.getAttribute("aria-hidden")).toBe("true");
      expect(countdown.textContent).toBe("30s");
      await render(<PreviewBar {...props()} />);
      expect(mounted[1]!.querySelector("[data-slot=preview-bar-countdown]")).toBeNull();
    });

    it("throws the change away at zero, once", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const p = props({ seconds: 2 });
      await render(<PreviewBar {...p} />);
      await act(() => vi.advanceTimersByTimeAsync(1000));
      expect(p.onDiscard).not.toHaveBeenCalled();
      await act(() => vi.advanceTimersByTimeAsync(5000));
      expect(p.onDiscard).toHaveBeenCalledTimes(1);
    });

    it("waits while the person compares, and goes on after", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      clock();
      const p = props({ seconds: 3 });
      const { part, host } = await render(<PreviewBar {...p} />);
      await key(document.body, "keydown", { key: "c" });
      await act(() => vi.advanceTimersByTimeAsync(10_000));
      expect(host.querySelector("[data-slot=preview-bar-countdown]")!.textContent).toBe("3s");
      expect(p.onDiscard).not.toHaveBeenCalled();
      await key(document.body, "keyup", { key: "c" });
      expect(part("compare").getAttribute("aria-pressed")).toBe("true");
    });

    it("starts over for a new proposal", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const p = props({ seconds: 5 });
      const { host, rerender } = await render(<PreviewBar {...p} />);
      await act(() => vi.advanceTimersByTimeAsync(2000));
      await rerender(<PreviewBar {...p} label="Trying the Forest theme" />);
      expect(host.querySelector("[data-slot=preview-bar-countdown]")!.textContent).toBe("5s");
    });
  });

  describe("compare", () => {
    it("is a toggle button that starts off", async () => {
      const { part } = await render(<PreviewBar {...props()} />);
      expect(part("compare").getAttribute("aria-pressed")).toBe("false");
      expect(part("compare").getAttribute("aria-keyshortcuts")).toBe("c");
    });

    it("switches on and off by a click, as a screen reader presses it", async () => {
      clock();
      const p = props();
      const { part, bar } = await render(<PreviewBar {...p} />);
      await act(async () => part("compare").click());
      expect(part("compare").getAttribute("aria-pressed")).toBe("true");
      expect(bar().hasAttribute("data-ouro-comparing")).toBe(true);
      expect(p.onCompareChange).toHaveBeenLastCalledWith(true);
      await act(async () => part("compare").click());
      expect(part("compare").getAttribute("aria-pressed")).toBe("false");
      expect(bar().hasAttribute("data-ouro-comparing")).toBe(false);
      expect(p.onCompareChange).toHaveBeenLastCalledWith(false);
      expect(p.onCompareChange).toHaveBeenCalledTimes(2);
    });

    it("shows the original only while the pointer holds the button", async () => {
      const tick = clock();
      const p = props();
      const { part } = await render(<PreviewBar {...p} />);
      await pointer(part("compare"), "pointerdown");
      expect(part("compare").getAttribute("aria-pressed")).toBe("true");
      tick(600);
      await pointer(window, "pointerup");
      expect(part("compare").getAttribute("aria-pressed")).toBe("false");
      expect(p.onCompareChange.mock.calls).toEqual([[true], [false]]);
      await act(async () => part("compare").click());
      expect(part("compare").getAttribute("aria-pressed")).toBe("false");
    });

    it("lets a quick tap by pointer switch it on, and the next tap off, without the click doing it twice", async () => {
      const tick = clock();
      const { part } = await render(<PreviewBar {...props()} />);
      await pointer(part("compare"), "pointerdown");
      tick(50);
      await pointer(window, "pointerup");
      await act(async () => part("compare").click());
      expect(part("compare").getAttribute("aria-pressed")).toBe("true");
      tick(1000);
      await pointer(part("compare"), "pointerdown");
      tick(50);
      await pointer(window, "pointercancel");
      await act(async () => part("compare").click());
      expect(part("compare").getAttribute("aria-pressed")).toBe("false");
    });

    it("ignores a press by a button other than the main one", async () => {
      const { part } = await render(<PreviewBar {...props()} />);
      await pointer(part("compare"), "pointerdown", { button: 2 });
      expect(part("compare").getAttribute("aria-pressed")).toBe("false");
    });

    it("shows the original only while Space or Enter is held on the button, and a tap toggles", async () => {
      const tick = clock();
      const { part } = await render(<PreviewBar {...props()} />);
      for (const k of [" ", "Enter"]) {
        await key(part("compare"), "keydown", { key: k });
        await key(part("compare"), "keydown", { key: k, repeat: true });
        expect(part("compare").getAttribute("aria-pressed")).toBe("true");
        tick(800);
        await key(part("compare"), "keyup", { key: k });
        expect(part("compare").getAttribute("aria-pressed")).toBe("false");
      }
      await key(part("compare"), "keydown", { key: " " });
      tick(50);
      await key(part("compare"), "keyup", { key: " " });
      expect(part("compare").getAttribute("aria-pressed")).toBe("true");
      await key(part("compare"), "keydown", { key: "x" });
      await key(part("compare"), "keyup", { key: "x" });
      expect(part("compare").getAttribute("aria-pressed")).toBe("true");
    });

    it("ends a hold when focus leaves the button", async () => {
      const tick = clock();
      const { part } = await render(<PreviewBar {...props()} />);
      part("compare").focus();
      await key(part("compare"), "keydown", { key: " " });
      tick(800);
      await act(async () => part("compare").blur());
      expect(part("compare").getAttribute("aria-pressed")).toBe("false");
    });

    it("shows the original only while the Compare key is held, from anywhere on the page", async () => {
      const tick = clock();
      const p = props();
      const { part } = await render(<PreviewBar {...p} />);
      await key(document.body, "keydown", { key: "C" });
      await key(document.body, "keydown", { key: "C", repeat: true });
      expect(part("compare").getAttribute("aria-pressed")).toBe("true");
      tick(900);
      await key(document.body, "keyup", { key: "c" });
      expect(part("compare").getAttribute("aria-pressed")).toBe("false");
      expect(p.onCompareChange.mock.calls).toEqual([[true], [false]]);
      await key(document.body, "keyup", { key: "x" });
    });

    it("counts one press at a time, and ignores a release it did not see the press of", async () => {
      const tick = clock();
      const p = props();
      const { part } = await render(<PreviewBar {...p} />);
      await key(document.body, "keyup", { key: "c" });
      await pointer(part("compare"), "pointerdown");
      await key(document.body, "keydown", { key: "c" });
      tick(800);
      await pointer(window, "pointerup");
      expect(part("compare").getAttribute("aria-pressed")).toBe("false");
      expect(p.onCompareChange.mock.calls).toEqual([[true], [false]]);
    });

    it("leaves the key to typing, to shortcuts and to anything that handled it", async () => {
      const { part, host } = await render(
        <div>
          <input aria-label="Name" />
          <div contentEditable suppressContentEditableWarning aria-label="Notes" />
          <PreviewBar {...props()} />
        </div>,
      );
      await key(host.querySelector("input")!, "keydown", { key: "c" });
      await key(host.querySelector("[contenteditable]")!, "keydown", { key: "c" });
      for (const mod of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) await key(document.body, "keydown", { key: "c", ...mod });
      document.body.addEventListener("keydown", (event) => event.preventDefault(), { once: true, capture: true });
      await key(document.body, "keydown", { key: "c" });
      expect(part("compare").getAttribute("aria-pressed")).toBe("false");
    });

    it("has no key when compareKey is false", async () => {
      const { part } = await render(<PreviewBar {...props({ compareKey: false })} />);
      expect(part("compare").hasAttribute("aria-keyshortcuts")).toBe(false);
      await key(document.body, "keydown", { key: "c" });
      expect(part("compare").getAttribute("aria-pressed")).toBe("false");
    });

    it("stops listening for the pointer's release when the bar goes away mid-press, and when a second press starts", async () => {
      const signals: AbortSignal[] = [];
      const add = window.addEventListener.bind(window);
      vi.spyOn(window, "addEventListener").mockImplementation(((type: string, listener: EventListener, options?: AddEventListenerOptions) => {
        if (type === "pointerup" && options?.signal) signals.push(options.signal);
        add(type, listener, options);
      }) as typeof window.addEventListener);
      const { part, rerender } = await render(<PreviewBar {...props()} />);
      await pointer(part("compare"), "pointerdown");
      await pointer(part("compare"), "pointerdown");
      expect(signals.map((signal) => signal.aborted)).toEqual([true, false]);
      await rerender(null);
      expect(signals[1]!.aborted).toBe(true);
    });

    it("stops listening for the key when the bar goes away, and tells the app the original is not shown", async () => {
      clock();
      const p = props();
      const { rerender } = await render(<PreviewBar {...p} />);
      await key(document.body, "keydown", { key: "c" });
      await rerender(<div />);
      expect(p.onCompareChange).toHaveBeenLastCalledWith(false);
      expect(p.onCompareChange).toHaveBeenCalledTimes(2);
      await key(document.body, "keydown", { key: "c" });
      expect(p.onCompareChange).toHaveBeenCalledTimes(2);
    });

    it("does not tell the app on unmount when it was not comparing", async () => {
      const p = props();
      const { rerender } = await render(<PreviewBar {...p} />);
      await rerender(<div />);
      expect(p.onCompareChange).not.toHaveBeenCalled();
    });

    it("goes back to the proposal when a new one arrives", async () => {
      clock();
      const p = props();
      const { part, rerender } = await render(<PreviewBar {...p} />);
      await act(async () => part("compare").click());
      await rerender(<PreviewBar {...p} label="Trying the Forest theme" />);
      expect(part("compare").getAttribute("aria-pressed")).toBe("false");
      expect(p.onCompareChange).toHaveBeenLastCalledWith(false);
    });
  });

  describe("focus", () => {
    it("hands focus to the next control when Keep takes the bar away", async () => {
      function Page() {
        const [open, setOpen] = useState(true);
        return (
          <div>
            {open ? <PreviewBar {...props({ onKeep: () => setOpen(false) })} /> : null}
            <button type="button">After</button>
          </div>
        );
      }
      const { part, host } = await render(<Page />);
      part("keep").focus();
      await act(async () => part("keep").click());
      expect(host.querySelector("[data-ouro=preview-bar]")).toBeNull();
      await expect.poll(() => document.activeElement?.textContent).toBe("After");
    });
  });

  describe("development messages", () => {
    it("names the fix for onAccept and for timeout", async () => {
      await render(<PreviewBar {...props()} {...({ onAccept: () => {}, timeout: 5 } as unknown as object)} />);
      const text = warn.mock.calls.map((call) => String(call[0]));
      expect(text).toContain("[ouro-ui] PreviewBar: onAccept is not a prop; the button that keeps the change is onKeep. Fix: <PreviewBar onKeep={() => {}} />.");
      expect(text).toContain("[ouro-ui] PreviewBar: timeout is not a prop; the countdown is seconds. Fix: <PreviewBar seconds={30} />.");
    });

    it("names the prop for an appearance class", async () => {
      await render(<PreviewBar {...props({ className: "bg-red-500" })} />);
      expect(warn.mock.calls.some((call) => String(call[0]).includes('remove "bg-red-500"'))).toBe(true);
    });
  });

  it("renders on the server with the countdown and the toggle off", () => {
    const html = renderToString(<PreviewBar {...props({ seconds: 9 })} />);
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("9s");
  });
});
