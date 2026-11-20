import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { NumberField } from "@/registry/ouro/components/ouro/number-field/number-field";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { watchLayoutReads } from "@/registry/ouro/lib/ouro/testing/layout-reads";
import { pressTab } from "@/registry/ouro/lib/ouro/testing/tab";

let root: Root | undefined;
let host: HTMLElement | undefined;

async function mount() {
  host = document.createElement("div");
  host.style.padding = "24px";
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <div style={{ display: "grid", gap: 16, maxWidth: 360 }}>
        <Button>Open</Button>
        <TextField label="Name" />
        <Button>Save</Button>
      </div>,
    ),
  );
  return {
    open: host.querySelectorAll("button")[0]!,
    save: host.querySelectorAll("button")[1]!,
    input: host.querySelector("input")!,
    box: host.querySelector<HTMLElement>("[data-ouro-input-group]")!,
  };
}

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  document.documentElement.removeAttribute("data-ouro-modality");
});

const ring = (element: Element) => {
  const style = getComputedStyle(element);
  return style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
};

describe("keyboard-only focus rings", () => {
  it("draws no ring on a button that a press focused, and one on the first Tab", async () => {
    const { open, save } = await mount();
    await userEvent.click(open);
    expect(document.activeElement).toBe(open);
    expect(document.documentElement.dataset.ouroModality).toBe("pointer");
    expect(ring(open)).toBe(false);
    await pressTab();
    await pressTab();
    expect(document.activeElement).toBe(save);
    expect(document.documentElement.dataset.ouroModality).toBe("keyboard");
    expect(ring(save)).toBe(true);
  });

  it("marks a text field that a press focused with a border tone and no ring", async () => {
    const { box, input } = await mount();
    const rest = getComputedStyle(box).borderColor;
    await userEvent.click(input);
    expect(document.activeElement).toBe(input);
    expect(ring(box)).toBe(false);
    const ringColor = getComputedStyle(document.documentElement).getPropertyValue("--ring").trim();
    const probe = document.createElement("i");
    probe.style.color = ringColor;
    document.body.append(probe);
    const expected = getComputedStyle(probe).color;
    probe.remove();
    await expect.poll(() => getComputedStyle(box).borderColor).toBe(expected);
    expect(expected).not.toBe(rest);
  });

  it("rings a text field that the keyboard focused, with its border at rest", async () => {
    const { open, box, input } = await mount();
    await userEvent.click(open);
    const rest = getComputedStyle(box).borderColor;
    await pressTab();
    expect(document.activeElement).toBe(input);
    expect(ring(box)).toBe(true);
    expect(getComputedStyle(box).borderColor).toBe(rest);
  });

  it("rings the field a script focuses after a key press, and not after a press", async () => {
    const { open, box, input } = await mount();
    open.focus();
    await userEvent.keyboard("{Enter}");
    input.focus();
    expect(ring(box)).toBe(true);
    input.blur();
    await userEvent.click(open);
    input.focus();
    expect(ring(box)).toBe(false);
    expect(ring(open)).toBe(false);
  });

  it("changes nothing for a lone modifier, or a moving mouse, after a key press", async () => {
    const { open, box, input } = await mount();
    await userEvent.click(open);
    await userEvent.keyboard("{Shift}");
    expect(document.documentElement.dataset.ouroModality).toBe("pointer");
    await userEvent.tab();
    expect(ring(box)).toBe(true);
    document.dispatchEvent(new PointerEvent("pointermove", { pointerType: "mouse" }));
    expect(document.activeElement).toBe(input);
    expect(ring(box)).toBe(true);
  });

  it("draws no ring on a number field that a press focused, and one for the keyboard", async () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root!.render(<NumberField label="Count" />));
    const group = host.querySelector<HTMLElement>("[data-ouro-number-field-group]")!;
    const input = host.querySelector("input")!;
    await userEvent.click(input);
    expect(ring(group)).toBe(false);
    input.blur();
    await userEvent.keyboard("{ArrowDown}");
    input.focus();
    expect(ring(group)).toBe(true);
  });

  it("reads no layout when the input changes", async () => {
    await mount();
    const watch = watchLayoutReads();
    document.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "mouse" }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    document.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "mouse" }));
    watch.stop();
    expect(watch.names()).toEqual([]);
  });
});
