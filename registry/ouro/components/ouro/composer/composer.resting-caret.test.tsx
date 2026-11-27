import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Composer } from "@/registry/ouro/components/ouro/composer/composer";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

let host: HTMLDivElement;
let root: Root;
let wake: () => void;
const policy = { enabled: true, onHeld: vi.fn(), subscribeWake: (listener: () => void) => { wake = listener; return vi.fn(); } };
async function render(format: "plain" | "rich", readOnly = false) {
  if (!host?.isConnected) {
    host = document.createElement("div");
    host.style.width = "360px";
    document.body.append(host);
    root = createRoot(host);
  }
  await act(() => root.render(<Composer label="Reply" defaultValue="hello" onSend={() => {}} format={format} readOnly={readOnly} restingCaret={policy} />));
  if (format === "rich") await expect.element(page.getByRole("textbox", { name: "Reply" })).toHaveAttribute("contenteditable", String(!readOnly));
  return host.querySelector<HTMLElement>(format === "rich" ? "[contenteditable]" : "textarea")!;
}
afterEach(async () => {
  vi.useRealTimers();
  await act(() => root.unmount());
  host.remove();
});

describe("Composer resting caret", () => {
  it("places the steady caret on a new empty rich paragraph", async () => {
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
