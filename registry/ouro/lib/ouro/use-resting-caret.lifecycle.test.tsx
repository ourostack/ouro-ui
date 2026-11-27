import { useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { useRestingCaret, type RestingCaretOptions } from "@/registry/ouro/lib/ouro/use-resting-caret";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

type Box = HTMLTextAreaElement | HTMLDivElement;
type Props = {
  box: Box;
  policy?: RestingCaretOptions | undefined;
  readOnly?: boolean;
  disabled?: boolean;
};
let host: HTMLDivElement;
let mount: HTMLDivElement;
let root: Root;
let wakes: Array<() => void>;
let policy: RestingCaretOptions;
let onHeld: Mock<(held: boolean) => void>;
let unsubscribe: Mock<() => void>;

function Hook({ box, policy: permission, readOnly = false, disabled = false }: Props) {
  useRestingCaret(box, permission, readOnly, disabled);
  return null;
}

function OwnedEditor({ rich = false, readOnly = false, disabled = false, tabIndex }: {
  rich?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  tabIndex?: number | undefined;
}) {
  const [box, setBox] = useState<Box | null>(null);
  useRestingCaret(box, policy, readOnly, disabled);
  return rich
    ? <div ref={setBox} data-test-harness contentEditable={!readOnly && !disabled} tabIndex={tabIndex ?? (readOnly && !disabled ? 0 : undefined)} suppressContentEditableWarning>Draft text</div>
    : <textarea ref={setBox} data-test-harness readOnly={readOnly} disabled={disabled} defaultValue="Draft text" />;
}

function editor(rich = false) {
  const box = document.createElement(rich ? "div" : "textarea");
  if (box instanceof HTMLTextAreaElement) box.value = "Draft text";
  else {
    box.contentEditable = "true";
    box.textContent = "Draft text";
  }
  host.append(box);
  return box;
}

async function render(box: Box, permission: RestingCaretOptions | undefined = policy) {
  await act(() => root.render(<Hook box={box} policy={permission} />));
}

async function advance(ms: number) {
  await act(() => vi.advanceTimersByTime(ms));
}

async function hold(box: Box) {
  box.focus();
  await advance(30_000);
}

const caret = () => host.querySelector<HTMLElement>("[data-ouro-steady-caret]");

beforeEach(() => {
  host = document.createElement("div");
  host.style.cssText = "position:relative;font:16px/24px monospace";
  mount = document.createElement("div");
  host.append(mount);
  document.body.append(host);
  root = createRoot(mount);
  wakes = [];
  onHeld = vi.fn();
  unsubscribe = vi.fn();
  policy = { enabled: true, onHeld, subscribeWake: (wake) => { wakes.push(wake); return unsubscribe; } };
  vi.spyOn(CSS, "supports").mockReturnValue(false);
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
});

afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("resting caret lifecycle ownership", () => {
  it("rests exactly at the deadline, including the remaining interval after input", async () => {
    const box = editor() as HTMLTextAreaElement;
    await render(box);
    box.focus();
    await advance(29_999);
    expect(box.readOnly).toBe(false);
    expect(box.dataset.caretRest).toBe("blinks");
    await advance(1);
    expect(box.readOnly).toBe(true);
    expect(onHeld.mock.calls).toEqual([[true]]);
    expect(vi.getTimerCount()).toBe(0);

    wakes[0]!();
    await advance(20_000);
    const schedule = vi.spyOn(globalThis, "setTimeout");
    box.dispatchEvent(new Event("input"));
    box.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    expect(schedule).not.toHaveBeenCalled();
    schedule.mockRestore();
    expect(vi.getTimerCount()).toBe(1);
    await advance(10_000);
    expect(box.readOnly).toBe(false);
    expect(vi.getTimerCount()).toBe(1);
    await advance(19_999);
    expect(box.readOnly).toBe(false);
    await advance(1);
    expect(box.readOnly).toBe(true);
    expect(onHeld.mock.calls).toEqual([[true], [false], [true]]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["keydown", "pointerdown", "beforeinput", "input", "paste", "dragenter", "dragover", "drop", "compositionstart", "compositionupdate", "compositionend"])(
    "releases the host hold before an earlier target bubbling %s handler can stop propagation",
    async (type) => {
      const box = editor() as HTMLTextAreaElement;
      const received: Array<{ readOnly: boolean; held: unknown }> = [];
      box.addEventListener(type, (event) => {
        received.push({ readOnly: box.readOnly, held: onHeld.mock.lastCall?.[0] });
        event.stopImmediatePropagation();
      });
      await render(box);
      await hold(box);
      box.dispatchEvent(new Event(type, { bubbles: true }));
      expect(received).toEqual([{ readOnly: false, held: false }]);
      expect(caret()).toBeNull();
    },
  );

  it("cancels the blink deadline throughout composition and starts a fresh one at its end", async () => {
    const box = editor() as HTMLTextAreaElement;
    await render(box);
    box.focus();
    await advance(20_000);
    box.dispatchEvent(new Event("compositionstart"));
    expect(box.dataset.caretRest).toBe("composing");
    expect(vi.getTimerCount()).toBe(0);
    await advance(60_000);
    box.dispatchEvent(new Event("compositionupdate"));
    expect(box.readOnly).toBe(false);
    expect(box.dataset.caretRest).toBe("composing");
    expect(onHeld).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    box.dispatchEvent(new Event("compositionend"));
    expect(box.dataset.caretRest).toBe("blinks");
    expect(vi.getTimerCount()).toBe(1);
    await advance(29_999);
    expect(box.readOnly).toBe(false);
    await advance(1);
    expect(box.readOnly).toBe(true);
  });

  it("releases every subscribed listener, observed element and pending deadline on revocation", async () => {
    const box = editor();
    const add = vi.spyOn(EventTarget.prototype, "addEventListener");
    const remove = vi.spyOn(EventTarget.prototype, "removeEventListener");
    const observe = vi.spyOn(ResizeObserver.prototype, "observe");
    const disconnect = vi.spyOn(ResizeObserver.prototype, "disconnect");
    await render(box);
    box.focus();
    expect(vi.getTimerCount()).toBe(1);
    const registrations = add.mock.calls.flatMap((args, index) => {
      const target = add.mock.contexts[index];
      return target === box || target === document || target === window ? [{ target, args }] : [];
    });
    expect(registrations.length).toBeGreaterThan(0);
    expect(observe.mock.calls.map(([target]) => target)).toEqual([box, host]);
    const observer = observe.mock.contexts[0];
    expect(observe.mock.contexts[1]).toBe(observer);
    await render(box, { ...policy, enabled: false });
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(disconnect.mock.contexts).toContain(observer);
    expect(vi.getTimerCount()).toBe(0);
    for (const { target, args } of registrations) {
      const capture = (options: boolean | AddEventListenerOptions | undefined) => typeof options === "boolean" ? options : options?.capture ?? false;
      expect(remove.mock.calls.some((removed, index) =>
        remove.mock.contexts[index] === target && removed[0] === args[0]
        && removed[1] === args[1] && capture(removed[2]) === capture(args[2]),
      ), `release ${args[0]} on ${target === box ? "editor" : target === document ? "document" : "window"}`).toBe(true);
    }
    expect(box.dataset.caretRest).toBeUndefined();
  });

  it("ignores an old host wake without resetting a replacement subscription's deadline", async () => {
    const box = editor() as HTMLTextAreaElement;
    await render(box);
    box.focus();
    const stale = wakes[0]!;
    await render(box, { ...policy, subscribeWake: (wake) => { wakes.push(wake); return unsubscribe; } });
    await advance(20_000);
    stale();
    await advance(10_000);
    expect(box.readOnly).toBe(true);
    expect(onHeld.mock.calls).toEqual([[true]]);
    await render(box, { ...policy, enabled: false });
    expect(box.readOnly).toBe(false);
    expect(caret()).toBeNull();
    onHeld.mockClear();
    for (const wake of wakes) wake();
    await advance(60_000);
    expect(onHeld).not.toHaveBeenCalled();
    expect(box.dataset.caretRest).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("drops a held editor and its resources when the hook unmounts", async () => {
    const box = editor() as HTMLTextAreaElement;
    await render(box);
    await hold(box);
    expect(caret()).not.toBeNull();
    await act(() => root.render(null));
    expect(box.readOnly).toBe(false);
    expect(caret()).toBeNull();
    expect(box.dataset.caretRest).toBeUndefined();
    expect(onHeld.mock.calls).toEqual([[true], [false]]);
    expect(unsubscribe).toHaveBeenCalledOnce();
    wakes[0]!();
    box.dispatchEvent(new Event("input"));
    box.dispatchEvent(new Event("focus"));
    expect(vi.getTimerCount()).toBe(0);
    expect(box.dataset.caretRest).toBeUndefined();
  });

  it.each([false, true])("preserves newly committed caller readOnly while releasing a rich=%s hold", async (rich) => {
    await act(() => root.render(<OwnedEditor rich={rich} />));
    const box = mount.querySelector<Box>("[data-test-harness]")!;
    await hold(box);
    await act(() => root.render(<OwnedEditor rich={rich} readOnly />));
    if (box instanceof HTMLTextAreaElement) expect(box.readOnly).toBe(true);
    else {
      expect(box.contentEditable).toBe("false");
      expect(box.getAttribute("tabindex")).toBe("0");
    }
    expect(onHeld.mock.calls).toEqual([[true], [false]]);
    expect(caret()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([undefined, -1, 7])("returns a rich editor's caller tabindex %s on wake and on disable", async (tabIndex) => {
    await act(() => root.render(<OwnedEditor rich tabIndex={tabIndex} />));
    const box = mount.querySelector<HTMLDivElement>("[data-test-harness]")!;
    // An explicit negative tabindex is programmatically focusable, like contenteditable.
    await hold(box);
    expect(box.contentEditable).toBe("false");
    expect(box.getAttribute("tabindex")).toBe("0");
    wakes[0]!();
    expect(box.contentEditable).toBe("true");
    expect(box.getAttribute("tabindex")).toBe(tabIndex === undefined ? null : String(tabIndex));
    await hold(box);
    await act(() => root.render(<OwnedEditor rich disabled tabIndex={tabIndex} />));
    expect(box.contentEditable).toBe("false");
    expect(box.getAttribute("tabindex")).toBe(tabIndex === undefined ? null : String(tabIndex));
    expect(caret()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("releases a text hold without turning a caller-disabled field read-only", async () => {
    await act(() => root.render(<OwnedEditor />));
    const box = mount.querySelector<HTMLTextAreaElement>("textarea")!;
    await hold(box);
    await act(() => root.render(<OwnedEditor disabled />));
    expect(box.disabled).toBe(true);
    expect(box.readOnly).toBe(false);
    wakes[0]!();
    expect(box.disabled).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("holds once across cover and visibility changes, without leaving a background decoration", async () => {
    const box = editor() as HTMLTextAreaElement;
    await render(box);
    box.focus();
    await render(box, { ...policy, occluded: true });
    expect(box.dataset.caretRest).toBe("covered");
    expect(box.readOnly).toBe(true);
    expect(caret()).not.toBeNull();
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(box.dataset.caretRest).toBe("hidden");
    expect(caret()).toBeNull();
    expect(onHeld.mock.calls).toEqual([[true]]);
    expect(vi.getTimerCount()).toBe(0);
    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(box.dataset.caretRest).toBe("covered");
    expect(caret()).not.toBeNull();
    expect(onHeld.mock.calls).toEqual([[true]]);
    wakes[0]!();
    expect(box.readOnly).toBe(false);
    expect(box.dataset.caretRest).toBe("blinks");
    expect(caret()).toBeNull();
    expect(onHeld.mock.calls).toEqual([[true], [false]]);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("reconsiders an already focused fallback editor on attachment, but not an unfocused one", async () => {
    const box = editor() as HTMLTextAreaElement;
    box.setSelectionRange(3, 5, "backward");
    const selection = [box.selectionStart, box.selectionEnd, box.selectionDirection];
    const selections = vi.spyOn(box, "setSelectionRange");
    await render(box);
    expect(selections).not.toHaveBeenCalled();
    box.focus();
    await render(box, { ...policy, enabled: false });
    selections.mockClear();
    await render(box);
    expect(selections).toHaveBeenCalled();
    expect([box.selectionStart, box.selectionEnd, box.selectionDirection]).toEqual(selection);
    expect(document.activeElement).toBe(box);
    expect(box.readOnly).toBe(false);
    expect(box.dataset.caretRest).toBe("blinks");
  });

  it("uses native animation without touching selection where supported and respects a caller animation override", async () => {
    vi.mocked(CSS.supports).mockRestore();
    const native = CSS.supports("caret-animation", "manual");
    const box = editor() as HTMLTextAreaElement;
    box.style.setProperty("caret-animation", "auto", "important");
    box.focus();
    const selections = vi.spyOn(box, "setSelectionRange");
    await render(box);
    expect(selections.mock.calls.length === 0).toBe(native);
    await advance(30_000);
    expect(box.style.getPropertyValue("caret-animation")).toBe(native ? "manual" : "");
    expect(box.readOnly).toBe(!native);
    expect(caret() === null).toBe(native);
    wakes[0]!();
    expect(box.style.getPropertyValue("caret-animation")).toBe(native ? "auto" : "");
    expect(box.style.getPropertyPriority("caret-animation")).toBe(native ? "important" : "");
    await advance(30_000);
    box.style.removeProperty("caret-animation");
    wakes[0]!();
    expect(box.style.getPropertyValue("caret-animation")).toBe("");
    expect(selections.mock.calls.length === 0).toBe(native);
  });

  it("keeps background and unfocused editors out of the host hold until a fresh foreground deadline", async () => {
    const box = editor() as HTMLTextAreaElement;
    const foreground = vi.mocked(document.hasFocus);
    foreground.mockReturnValue(false);
    await render(box);
    expect(box.dataset.caretRest).toBe("no-caret");
    box.focus();
    expect(box.dataset.caretRest).toBe("background");
    await advance(60_000);
    expect(box.readOnly).toBe(false);
    expect(onHeld).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    foreground.mockReturnValue(true);
    window.dispatchEvent(new Event("focus"));
    expect(box.dataset.caretRest).toBe("blinks");
    await advance(29_999);
    expect(box.readOnly).toBe(false);
    await advance(1);
    expect(box.readOnly).toBe(true);
    box.blur();
    expect(box.dataset.caretRest).toBe("no-caret");
    expect(box.readOnly).toBe(false);
    expect(caret()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
