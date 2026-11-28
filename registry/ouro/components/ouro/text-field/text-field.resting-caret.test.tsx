import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

let root: Root;
let host: HTMLDivElement;
let wake: () => void;
const policy = { enabled: true, onHeld: vi.fn(), subscribeWake: (listener: () => void) => { wake = listener; return vi.fn(); } };
async function render(readOnly = false) {
  if (!host?.isConnected) {
    host = document.createElement("div");
    host.style.width = "320px";
    document.body.append(host);
    root = createRoot(host);
  }
  await act(() => root.render(<TextField label="Title" defaultValue="hello" readOnly={readOnly} restingCaret={policy} />));
  return host.querySelector("input")!;
}
afterEach(async () => {
  vi.useRealTimers();
  await act(() => root.unmount());
  host.remove();
});

describe("TextField resting caret", () => {
  it("keeps a backward selection and accepts the first character after a host wake", async () => {
    const box = await render();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    box.focus();
    box.setSelectionRange(1, 4, "backward");
    wake();
    await act(() => vi.advanceTimersByTime(30_000));
    const native = CSS.supports("caret-animation", "manual");
    expect(box.readOnly).toBe(!native);
    expect([box.selectionStart, box.selectionEnd, box.selectionDirection]).toEqual([1, 4, "backward"]);
    const caret = host.querySelector<HTMLElement>("[data-ouro-steady-caret]");
    if (native) expect(caret).toBeNull();
    else expect(caret!.hidden).toBe(true);
    wake();
    vi.useRealTimers();
    await userEvent.keyboard("x");
    expect(box.value).toBe("hxo");
  });

  it("honours readOnly arriving while held instead of making the field editable", async () => {
    const box = await render();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    box.focus();
    wake();
    await act(() => vi.advanceTimersByTime(30_000));
    await render(true);
    expect(box.readOnly).toBe(true);
  });
});
