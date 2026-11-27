import { useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRestingCaret } from "@/registry/ouro/lib/ouro/use-resting-caret";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

let host: HTMLDivElement;
let root: Root;
let wake: () => void;
const policy = { enabled: true, subscribeWake: (listener: () => void) => { wake = listener; return () => {}; }, onHeld: () => {} };

function Editor({ kind = "textarea" }: { kind?: "textarea" | "input" | "rich" }) {
  const [box, setBox] = useState<HTMLInputElement | HTMLTextAreaElement | HTMLDivElement | null>(null);
  useRestingCaret(box, policy, false, false);
  if (kind === "rich") return <div ref={setBox} data-test-harness contentEditable suppressContentEditableWarning tabIndex={0} />;
  if (kind === "input") return <input ref={setBox} data-test-harness />;
  return <textarea ref={setBox} data-test-harness />;
}

async function editor(kind?: "textarea" | "input" | "rich") {
  await act(() => root.render(<Editor {...(kind ? { kind } : {})} />));
  const box = host.firstElementChild as HTMLTextAreaElement;
  box.style.cssText = "font:20px/32px monospace;box-sizing:border-box;width:240px;height:120px;padding:4.5px 8.5px;border:1.5px solid;caret-color:rgb(18,52,86)";
  return box;
}
async function hold(box: HTMLElement) {
  box.focus();
  await act(() => vi.advanceTimersByTime(30_000));
  return host.querySelector<HTMLElement>("[data-ouro-steady-caret]")!;
}
const redraw = () => document.dispatchEvent(new Event("selectionchange"));

beforeEach(() => {
  host = document.createElement("div");
  host.style.cssText = "position:relative;margin:17.25px;padding:13.25px";
  document.body.append(host);
  root = createRoot(host);
  vi.spyOn(CSS, "supports").mockReturnValue(false);
  vi.spyOn(navigator, "platform", "get").mockReturnValue("Linux");
  vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(2);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("resting caret geometry", () => {
  it("uses the empty rich editor's padded text origin and follows blank paragraphs at either side of a break", async () => {
    const box = await editor("rich");
    const field = box.getBoundingClientRect();
    const style = getComputedStyle(box);
    box.focus();
    document.getSelection()!.collapse(box, 0);
    const caret = await hold(box);
    const before = caret.getBoundingClientRect();
    const contentLeft = field.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
    const contentTop = field.top + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop);
    expect(Math.abs(before.left - contentLeft)).toBeLessThanOrEqual(1);
    expect(before.top).toBe(Math.round(contentTop * 2) / 2);
    expect(before.height).toBe(20);
    box.innerHTML = "<p style='margin:0'>First line</p><p style='margin:0'><br></p>";
    const paragraph = box.lastChild!;
    const breakRange = document.createRange();
    breakRange.selectNode(paragraph.firstChild!);
    const line = breakRange.getBoundingClientRect();
    for (const offset of [0, 1]) {
      document.getSelection()!.collapse(paragraph, offset);
      redraw();
      expect(caret.hidden).toBe(false);
      expect(caret.getBoundingClientRect().height).toBe(Math.round(line.height));
      expect(Math.abs(caret.getBoundingClientRect().top - line.top)).toBeLessThanOrEqual(1);
    }
  });

  it("centres a native input's glyphs in its content height, including asymmetric padding", async () => {
    const box = await editor("input");
    box.style.paddingBottom = "12.5px";
    box.value = "A";
    box.setSelectionRange(0, 0);
    const caret = await hold(box);
    const before = caret.getBoundingClientRect();
    expect(caret.hidden).toBe(false);
    box.style.height = "160px";
    window.dispatchEvent(new Event("resize"));
    expect(caret.getBoundingClientRect().top - before.top).toBe(20);
    box.style.paddingTop = "12.5px";
    window.dispatchEvent(new Event("resize"));
    expect(caret.getBoundingClientRect().top - before.top).toBe(24);
  });

  it("measures without leaking a visible, accessible or interactive mirror into the document", async () => {
    const box = await editor();
    box.value = "A long unbroken word that wraps naturally";
    box.setSelectionRange(2, 2);
    const append = document.body.append.bind(document.body);
    const measurements: HTMLElement[] = [];
    vi.spyOn(document.body, "append").mockImplementation((...nodes) => {
      append(...nodes);
      for (const node of nodes) {
        if (node instanceof HTMLDivElement && node !== host) {
          measurements.push(node);
          const style = getComputedStyle(node);
          expect(style.visibility).toBe("hidden");
          expect(style.pointerEvents).toBe("none");
          expect(node.getAttribute("aria-hidden")).toBe("true");
        }
      }
    });
    await hold(box);
    expect(measurements.length).toBeGreaterThan(0);
    expect(measurements.every(node => !node.isConnected)).toBe(true);
    const before = host.querySelector<HTMLElement>("[data-ouro-steady-caret]")!.getBoundingClientRect();
    box.style.transform = "translate(16px, 24px)";
    window.dispatchEvent(new Event("resize"));
    const after = host.querySelector<HTMLElement>("[data-ouro-steady-caret]")!.getBoundingClientRect();
    expect(after.left - before.left).toBe(16);
    expect(after.top - before.top).toBe(24);
  });

  it("tracks horizontal scrolling in both writing directions and the end of an empty line", async () => {
    const box = await editor("input");
    box.style.width = "120px";
    box.value = "A long unbroken word that extends beyond the field";
    box.setSelectionRange(3, 3);
    let caret = await hold(box);
    const before = caret.getBoundingClientRect();
    box.scrollLeft = 8;
    box.dispatchEvent(new Event("scroll"));
    expect(caret.getBoundingClientRect().left - before.left).toBe(-8);
    wake();
    box.style.direction = "rtl";
    box.value = "שלום עולם";
    box.setSelectionRange(2, 2);
    box.scrollLeft = 0;
    caret = await hold(box);
    const rtl = caret.getBoundingClientRect();
    expect(caret.hidden).toBe(false);
    expect(rtl.left).toBeGreaterThan(box.getBoundingClientRect().left + 40);
    wake();
    box.value = "";
    box.setSelectionRange(0, 0);
    caret = await hold(box);
    expect(caret.hidden).toBe(false);
  });
});
