import { useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Composer } from "@/registry/ouro/components/ouro/composer/composer";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { useRestingCaret } from "@/registry/ouro/lib/ouro/use-resting-caret";

let host: HTMLDivElement;
let root: Root;
let wake: () => void;
const policy = { enabled: true, onHeld: vi.fn(), subscribeWake: (listener: () => void) => { wake = listener; return vi.fn(); } };
function Draft({ format, readOnly, defaultValue }: { format: "plain" | "rich"; readOnly: boolean; defaultValue: string }) {
  const [box, setBox] = useState<HTMLTextAreaElement | HTMLDivElement | null>(null);
  useRestingCaret(box, policy, readOnly, false);
  return <Composer ref={setBox} label="Reply" defaultValue={defaultValue} onSend={() => {}} format={format} readOnly={readOnly} />;
}
async function render(format: "plain" | "rich", readOnly = false, defaultValue = "hello") {
  if (!host?.isConnected) {
    host = document.createElement("div");
    host.style.width = "360px";
    document.body.append(host);
    root = createRoot(host);
  }
  await act(() => root.render(<Draft format={format} readOnly={readOnly} defaultValue={defaultValue} />));
  if (format === "rich") await expect.element(page.getByRole("textbox", { name: "Reply" })).toHaveAttribute("contenteditable", String(!readOnly));
  return host.querySelector<HTMLElement>(format === "rich" ? "[contenteditable]" : "textarea")!;
}
afterEach(async () => {
  vi.useRealTimers();
  await act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("Composer resting caret", () => {
  it("reattaches to a rich editor without losing its insertion point after a held empty plain editor", async () => {
    vi.spyOn(CSS, "supports").mockReturnValue(false);
    await render("rich", false, "");
    const plain = await render("plain", false, "");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    plain.focus();
    wake();
    await act(() => vi.advanceTimersByTime(30_000));
    const rich = await render("rich", false, "");
    expect(document.activeElement).toBe(rich);
    expect(rich.contains(document.getSelection()!.anchorNode)).toBe(true);
    wake();
    await act(() => vi.advanceTimersByTime(30_000));
    expect(rich.contentEditable).toBe("false");
    vi.useRealTimers();
    await userEvent.keyboard("x");
    expect(rich.textContent).toBe("x");
  });

  it("places the steady caret on a new empty rich paragraph", async () => {
    vi.spyOn(CSS, "supports").mockReturnValue(false);
    const box = await render("rich");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    box.focus();
    const range = document.createRange();
    range.selectNodeContents(box);
    range.collapse(false);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    await userEvent.keyboard("{Shift>}{Enter}{/Shift}");
    const paragraph = box.lastElementChild!;
    wake();
    await act(() => vi.advanceTimersByTime(30_000));
    const steady = host.querySelector<HTMLElement>("[data-ouro-steady-caret]")!;
    expect(steady.hidden).toBe(false);
    expect(steady.getBoundingClientRect().top).toBeGreaterThanOrEqual(paragraph.getBoundingClientRect().top);
    expect(steady.getBoundingClientRect().bottom).toBeLessThanOrEqual(paragraph.getBoundingClientRect().bottom + 1);
  });

  for (const format of ["plain", "rich"] as const) {
    it(`resumes ${format} writing with the first letter intact`, async () => {
      const box = await render(format);
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
      box.focus();
      if (box instanceof HTMLTextAreaElement) box.setSelectionRange(5, 5);
      else {
        const range = document.createRange();
        range.selectNodeContents(box);
        range.collapse(false);
        document.getSelection()!.removeAllRanges();
        document.getSelection()!.addRange(range);
      }
      wake();
      await act(() => vi.advanceTimersByTime(30_000));
      expect(box.dataset.caretRest).toBe("idle");
      expect(document.activeElement).toBe(box);
      const native = CSS.supports("caret-animation", "manual");
      expect(box instanceof HTMLTextAreaElement ? box.readOnly : !box.isContentEditable).toBe(!native);
      expect(box.style.getPropertyValue("caret-animation")).toBe(native ? "manual" : "");
      vi.useRealTimers();
      await userEvent.keyboard("x");
      expect(box instanceof HTMLTextAreaElement ? box.value : box.textContent).toBe("hellox");
    });

    it(`keeps the caller's ${format} readOnly state when it arrives during rest`, async () => {
      const box = await render(format);
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
      box.focus();
      wake();
      await act(() => vi.advanceTimersByTime(30_000));
      await render(format, true);
      expect(box instanceof HTMLTextAreaElement ? box.readOnly : box.contentEditable === "false").toBe(true);
      if (format === "rich") expect(box.tabIndex).toBe(0);
    });
  }
});
