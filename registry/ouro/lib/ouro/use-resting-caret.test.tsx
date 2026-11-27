import { useRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRestingCaret, type RestingCaretOptions } from "@/registry/ouro/lib/ouro/use-resting-caret";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

type Kind = "textarea" | "input" | "rich" | "none";
type Props = { kind?: Kind; policy?: RestingCaretOptions | undefined; readOnly?: boolean; disabled?: boolean; empty?: boolean; type?: string; rtl?: boolean; tabIndex?: number | null };
let host: HTMLDivElement;
let root: Root;
let wake: () => void;
const unsubscribe = vi.fn();
const onHeld = vi.fn();
const subscribeWake = vi.fn((listener: () => void) => { wake = listener; return unsubscribe; });
const policy = { enabled: true, subscribeWake, onHeld };

function Harness({ kind = "textarea", policy: permission, readOnly = false, disabled = false, empty = false, type = "text", rtl = false, tabIndex = 3 }: Props) {
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLDivElement | null>(null);
  useRestingCaret(ref, permission, readOnly, disabled, type);
  const text = empty ? "" : "A good idea deserves a little room.\nAnd a quiet moment.";
  let control: ReactNode;
  if (kind === "none") control = null;
  else if (kind === "rich") control = <div ref={(node) => { ref.current = node; }} data-test-harness tabIndex={tabIndex ?? (readOnly && !disabled ? 0 : undefined)} contentEditable={!readOnly && !disabled} suppressContentEditableWarning>{empty ? <p><br /></p> : <p>{text}</p>}</div>;
  else if (kind === "input") control = <input ref={(node) => { ref.current = node; }} data-test-harness type={type} readOnly={readOnly} disabled={disabled} defaultValue={text} />;
  else control = <textarea ref={(node) => { ref.current = node; }} data-test-harness readOnly={readOnly} disabled={disabled} defaultValue={text} />;
  return <div dir={rtl ? "rtl" : "ltr"} style={{ position: "relative", border: "2px solid", padding: 8, width: 240, font: "16px/24px monospace" }}>{control}</div>;
}

async function render(props: Props = {}) {
  await act(() => root.render(<Harness policy={policy} {...props} />));
  return host.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLDivElement>("[data-test-harness]")!;
}
async function rest(box: HTMLElement) {
  box.focus();
  await act(() => vi.advanceTimersByTime(30_000));
}
const caret = () => host.querySelector<HTMLElement>("[data-ouro-steady-caret]");

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  onHeld.mockClear();
  subscribeWake.mockClear();
  unsubscribe.mockClear();
});

describe("resting caret host contract", () => {
  it("stays inert without host permission", async () => {
    let box = await render({ policy: undefined });
    await rest(box);
    expect(box.dataset.caretRest).toBeUndefined();
    box = await render({ policy: { ...policy, enabled: false } });
    await rest(box);
    expect(subscribeWake).not.toHaveBeenCalled();
    expect(onHeld).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    await render({ kind: "none" });
  });

  it("keeps one deadline while typing and leaves no timer while resting, covered or unfocused", async () => {
    const box = await render();
    box.focus();
    expect(vi.getTimerCount()).toBe(1);
    await act(() => vi.advanceTimersByTime(20_000));
    box.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    await act(() => vi.advanceTimersByTime(10_000));
    expect(box.dataset.caretRest).toBe("blinks");
    expect(vi.getTimerCount()).toBe(1);
    await act(() => vi.advanceTimersByTime(20_000));
    expect(box.dataset.caretRest).toBe("idle");
    expect(vi.getTimerCount()).toBe(0);
    box.blur();
    expect(caret()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("holds a covered editor, wakes before its own handler, and ignores input elsewhere", async () => {
    const box = await render({ policy: { ...policy, occluded: true } });
    box.focus();
    expect(box.dataset.caretRest).toBe("covered");
    expect(vi.getTimerCount()).toBe(0);
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(onHeld).toHaveBeenLastCalledWith(true);
    const editableAtInput: boolean[] = [];
    box.addEventListener("keydown", () => editableAtInput.push(!(box as HTMLTextAreaElement).readOnly));
    box.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    expect(editableAtInput).toEqual([true]);
    expect(box.dataset.caretRest).toBe("blinks");
    await render({ policy: { ...policy, occluded: false } });
    expect(vi.getTimerCount()).toBe(1);
  });

  it("keeps an existing steady caret through a cover change and hides it for a text selection", async () => {
    const box = await render() as HTMLTextAreaElement;
    await rest(box);
    const steady = caret();
    await render({ policy: { ...policy, occluded: true } });
    expect(caret()).toBe(steady);
    expect(onHeld).toHaveBeenCalledOnce();
    box.setSelectionRange(1, 4, "backward");
    document.dispatchEvent(new Event("selectionchange"));
    expect(caret()!.hidden).toBe(true);
    expect(box.selectionDirection).toBe("backward");
  });

  it("does not leave a replacement caret when the host wakes synchronously from onHeld", async () => {
    const box = await render({ policy: { ...policy, onHeld: (held) => { if (held) wake(); } } });
    await rest(box);
    expect((box as HTMLTextAreaElement).readOnly).toBe(false);
    expect(caret()).toBeNull();
    expect(vi.getTimerCount()).toBe(1);
  });

  it("does not rearm after a synchronous host revocation during wake", async () => {
    const permission = { ...policy, onHeld: (held: boolean) => {
      if (!held) flushSync(() => root.render(<Harness policy={{ ...policy, enabled: false }} />));
    } };
    const box = await render({ policy: permission });
    await rest(box);
    await act(() => wake());
    await act(() => vi.advanceTimersByTime(30_000));
    expect((box as HTMLTextAreaElement).readOnly).toBe(false);
    expect(caret()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("hides the steady caret with the page and lets the engine handle an unfocused window", async () => {
    const box = await render();
    box.focus();
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(box.dataset.caretRest).toBe("hidden");
    expect((box as HTMLTextAreaElement).readOnly).toBe(true);
    expect(caret()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect((box as HTMLTextAreaElement).readOnly).toBe(false);
    await rest(box);
    const focus = vi.spyOn(document, "hasFocus").mockReturnValue(false);
    window.dispatchEvent(new Event("blur"));
    expect(box.dataset.caretRest).toBe("background");
    expect(caret()).toBeNull();
    expect((box as HTMLTextAreaElement).readOnly).toBe(false);
    focus.mockReturnValue(true);
    window.dispatchEvent(new Event("focus"));
    expect(box.dataset.caretRest).toBe("blinks");
  });

  it("wakes for paste, drag, pointer and input-method events without resting mid-word", async () => {
    const box = await render();
    for (const type of ["paste", "dragenter", "dragover", "drop", "pointerdown", "beforeinput", "input", "compositionupdate", "compositionstart"]) {
      await rest(box);
      box.dispatchEvent(new Event(type));
      expect((box as HTMLTextAreaElement).readOnly, type).toBe(false);
    }
    await act(() => vi.advanceTimersByTime(60_000));
    expect((box as HTMLTextAreaElement).readOnly).toBe(false);
    box.dispatchEvent(new Event("compositionend"));
    await act(() => vi.advanceTimersByTime(30_000));
    expect((box as HTMLTextAreaElement).readOnly).toBe(true);
  });

  it("preserves empty input focus and disables a held field without changing its readOnly prop", async () => {
    const box = await render({ kind: "input", empty: true });
    await rest(box);
    expect(document.activeElement).toBe(box);
    expect(caret()!.getBoundingClientRect().height).toBeGreaterThan(0);
    await render({ kind: "input", empty: true, disabled: true });
    expect((box as HTMLInputElement).readOnly).toBe(false);
    expect(caret()).toBeNull();
    wake();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("leaves native input types without a text selection editable", async () => {
    const box = await render({ kind: "input", type: "email", empty: true });
    await rest(box);
    expect(box.dataset.caretRest).toBeUndefined();
    expect((box as HTMLInputElement).readOnly).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    const text = await render({ kind: "input", empty: true });
    await rest(text);
    expect((text as HTMLInputElement).readOnly).toBe(true);
    await render({ kind: "input", type: "email", empty: true });
    expect((text as HTMLInputElement).readOnly).toBe(false);
  });

  it("restores rich editability without leaving a temporary tabindex or a late host wake", async () => {
    const box = await render({ kind: "rich", tabIndex: null });
    await rest(box);
    expect(box.getAttribute("tabindex")).toBe("0");
    wake();
    expect(box.hasAttribute("tabindex")).toBe(false);
    await rest(box);
    await render({ kind: "rich", tabIndex: null, readOnly: true });
    expect(box.contentEditable).toBe("false");
    await render({ kind: "rich", tabIndex: null });
    await rest(box);
    await render({ kind: "rich", tabIndex: null, disabled: true });
    expect(box.contentEditable).toBe("false");
    expect(box.hasAttribute("tabindex")).toBe(false);
    wake();
    expect(box.contentEditable).toBe("false");
  });

  it("does not claim a caller's externally read-only editor", async () => {
    const box = await render();
    (box as HTMLTextAreaElement).readOnly = true;
    await rest(box);
    expect(onHeld).not.toHaveBeenCalled();
    await render({ kind: "rich" });
    const rich = host.querySelector<HTMLDivElement>("[data-test-harness]")!;
    rich.tabIndex = 0;
    rich.contentEditable = "false";
    await rest(rich);
    expect(onHeld).not.toHaveBeenCalled();
  });

  it("keeps rich text selection, restores tabindex, and releases on host disable", async () => {
    const box = await render({ kind: "rich" });
    box.focus();
    const text = box.querySelector("p")!.firstChild!;
    document.getSelection()!.setBaseAndExtent(text, 4, text, 4);
    await rest(box);
    expect(box.contentEditable).toBe("false");
    expect(caret()!.hidden).toBe(false);
    expect(document.getSelection()!.anchorOffset).toBe(4);
    wake();
    expect(box.contentEditable).toBe("true");
    expect(box.getAttribute("tabindex")).toBe("3");
    await rest(box);
    await render({ kind: "rich", policy: { ...policy, enabled: false } });
    expect(box.contentEditable).toBe("true");
    expect(caret()).toBeNull();
    expect(unsubscribe).toHaveBeenCalledOnce();
    wake();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not paint over a rich selection or a selection outside the editor", async () => {
    const box = await render({ kind: "rich" });
    box.focus();
    const text = box.querySelector("p")!.firstChild!;
    document.getSelection()!.setBaseAndExtent(text, 1, text, 4);
    await rest(box);
    expect(caret()!.hidden).toBe(true);
    document.getSelection()!.removeAllRanges();
    document.dispatchEvent(new Event("selectionchange"));
    expect(caret()!.hidden).toBe(true);
    wake();
    await render({ kind: "rich", empty: true });
    box.focus();
    document.getSelection()!.collapse(box.firstChild!, 0);
    await rest(box);
    expect(caret()!.getBoundingClientRect().height).toBeGreaterThan(0);
    document.getSelection()!.collapse(box.firstChild!, 1);
    document.dispatchEvent(new Event("selectionchange"));
    expect(caret()!.hidden).toBe(false);
    const emptyText = document.createTextNode("");
    box.style.minHeight = "24px";
    box.replaceChildren(emptyText);
    document.getSelection()!.collapse(emptyText, 0);
    document.dispatchEvent(new Event("selectionchange"));
    expect(caret()!.hidden).toBe(false);
    box.replaceChildren();
    document.getSelection()!.collapse(box, 0);
    document.dispatchEvent(new Event("selectionchange"));
    expect(caret()!.hidden).toBe(false);
  });

  it("follows selection and scrolling without a wake and hides a caret outside the text viewport", async () => {
    const box = await render({ rtl: true });
    const area = box as HTMLTextAreaElement;
    area.style.cssText = "width: 200px; height: 48px; font: 16px/24px monospace";
    await rest(box);
    area.setSelectionRange(area.value.length, area.value.length);
    document.dispatchEvent(new Event("selectionchange"));
    expect(caret()!.hidden).toBe(true);
    area.scrollTop = area.scrollHeight;
    area.dispatchEvent(new Event("scroll"));
    expect(caret()!.hidden).toBe(false);
    expect(area.readOnly).toBe(true);
    const before = caret()!.getBoundingClientRect();
    host.style.paddingTop = "24px";
    window.dispatchEvent(new Event("resize"));
    const after = caret()!.getBoundingClientRect();
    expect(after.top - before.top).toBe(24);
  });
});
