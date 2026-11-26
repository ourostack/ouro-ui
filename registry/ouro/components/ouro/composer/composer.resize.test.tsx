import { useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { commands, userEvent } from "vitest/browser";
import { Composer } from "@/registry/ouro/components/ouro/composer/composer";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { expectMotion, parseDuration } from "@/registry/ouro/lib/ouro/testing/motion";

const roots: Root[] = [];
let hosts: HTMLElement[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) root.unmount();
  for (const host of hosts) host.remove();
  hosts = [];
});

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.padding = "48px 24px";
  host.style.width = "480px";
  document.body.append(host);
  hosts.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    get edge() {
      return host.querySelector<HTMLElement>('[data-ouro-control="composer"][data-ouro-part="resize-edge"]')!;
    },
    get textarea() {
      return host.querySelector<HTMLTextAreaElement>("textarea")!;
    },
  };
}

const line = (textarea: HTMLElement) => parseFloat(getComputedStyle(textarea).lineHeight);
const offset = (textarea: HTMLElement) => {
  const style = getComputedStyle(textarea);
  return parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
};
const height = (textarea: HTMLElement) => textarea.getBoundingClientRect().height;
const wholeLines = (textarea: HTMLElement) => (height(textarea) - offset(textarea)) / line(textarea);
const label = "Resize the reply box";

describe("Composer resizable edge", () => {
  it("is a focusable horizontal separator named by resizeLabel, with its range in px that refreshes on focus", async () => {
    const view = await render(<Composer label="Reply" resizable resizeLabel={label} rows={2} maxRows={6} onSend={() => {}} />);
    const edge = view.edge;
    expect(edge.getAttribute("role")).toBe("separator");
    expect(edge.getAttribute("aria-orientation")).toBe("horizontal");
    expect(edge.getAttribute("aria-label")).toBe(label);
    expect(edge.tabIndex).toBe(0);
    edge.focus();
    await expect.poll(() => Number(edge.getAttribute("aria-valuenow"))).toBeCloseTo(height(view.textarea), 0);
    expect(Number(edge.getAttribute("aria-valuemin"))).toBeCloseTo(2 * line(view.textarea) + offset(view.textarea), 0);
    expect(Number(edge.getAttribute("aria-valuemax"))).toBeGreaterThanOrEqual(6 * line(view.textarea) + offset(view.textarea) - 1);
    expect(edge.getAttribute("data-ouro-edge")).toBe("focus");
  });

  it("draws no edge unless resizable", async () => {
    const view = await render(<Composer label="Reply" onSend={() => {}} />);
    expect(view.edge).toBeNull();
  });

  it("moves a line with ArrowUp and ArrowDown, and to the smallest and largest with Home and End, reporting each", async () => {
    const onHeightChange = vi.fn();
    const view = await render(<Composer label="Reply" resizable resizeLabel={label} rows={1} maxRows={4} onHeightChange={onHeightChange} onSend={() => {}} />);
    view.edge.focus();
    await userEvent.keyboard("{ArrowUp}");
    await expect.poll(() => wholeLines(view.textarea)).toBeCloseTo(2, 1);
    await userEvent.keyboard("{ArrowUp}");
    await expect.poll(() => wholeLines(view.textarea)).toBeCloseTo(3, 1);
    expect(onHeightChange).toHaveBeenLastCalledWith(Math.round(3 * line(view.textarea) + offset(view.textarea)));
    await userEvent.keyboard("{ArrowDown}");
    await expect.poll(() => wholeLines(view.textarea)).toBeCloseTo(2, 1);
    await userEvent.keyboard("{End}");
    await expect.poll(() => wholeLines(view.textarea)).toBeGreaterThanOrEqual(4);
    await userEvent.keyboard("{Home}");
    await expect.poll(() => wholeLines(view.textarea)).toBeCloseTo(1, 1);
    expect(onHeightChange).toHaveBeenLastCalledWith(null);
  });

  it("drags from the press with no threshold, snapping to whole lines that count the padding and border", async () => {
    const onHeightChange = vi.fn();
    const view = await render(<Composer label="Reply" resizable resizeLabel={label} rows={1} maxRows={6} onHeightChange={onHeightChange} onSend={() => {}} />);
    const rect = view.edge.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    await commands.drag({ from: [x, y], to: [x, y - 2.4 * line(view.textarea)], steps: 6, durationMs: 200 });
    await expect.poll(() => wholeLines(view.textarea)).toBeCloseTo(3, 1);
    expect(onHeightChange).toHaveBeenCalledTimes(1);
    expect(onHeightChange).toHaveBeenCalledWith(Math.round(3 * line(view.textarea) + offset(view.textarea)));
  });

  it("takes focus from a press on it, so the keys work straight after", async () => {
    const view = await render(<Composer label="Reply" resizable resizeLabel={label} rows={1} onSend={() => {}} />);
    await userEvent.click(view.edge);
    expect(document.activeElement).toBe(view.edge);
  });

  it("is named 'Resize the message box' unless the app names it", async () => {
    const view = await render(<Composer label="Reply" resizable onSend={() => {}} />);
    expect(view.edge.getAttribute("aria-label")).toBe("Resize the message box");
  });

  it("reads its floor from rows and its ceiling from maxRows, or from 60% of the window when that is taller", async () => {
    const tall = await render(<Composer label="Reply" resizable resizeLabel={label} rows={2} maxRows={50} onSend={() => {}} />);
    tall.edge.focus();
    const l = line(tall.textarea);
    const o = offset(tall.textarea);
    await expect.poll(() => tall.edge.getAttribute("aria-valuemin")).toBe(String(Math.round(2 * l + o)));
    expect(tall.edge.getAttribute("aria-valuemax")).toBe(String(Math.round(50 * l + o)));
    const short = await render(<Composer label="Reply" resizable resizeLabel={label} rows={1} maxRows={1} onSend={() => {}} />);
    short.edge.focus();
    await expect.poll(() => short.edge.getAttribute("aria-valuemax")).toBe(String(Math.floor(window.innerHeight * 0.6)));
  });

  it("leaves a controlled height to the app: a key reports the new height and the box stays until the app sets it", async () => {
    const onHeightChange = vi.fn();
    const view = await render(<Composer label="Reply" resizable resizeLabel={label} rows={1} height={100} onHeightChange={onHeightChange} onSend={() => {}} />);
    const before = height(view.textarea);
    view.edge.focus();
    await userEvent.keyboard("{ArrowUp}");
    await expect.poll(() => onHeightChange.mock.calls.length).toBe(1);
    expect(onHeightChange.mock.calls[0]![0]).toBeGreaterThan(before - 1);
    expect(height(view.textarea)).toBeCloseTo(before, 0);
  });

  it("reports null when released at its smallest", async () => {
    const onHeightChange = vi.fn();
    const view = await render(<Composer label="Reply" resizable resizeLabel={label} rows={1} defaultHeight={80} onHeightChange={onHeightChange} onSend={() => {}} />);
    view.edge.focus();
    await userEvent.keyboard("{Home}");
    await expect.poll(() => onHeightChange.mock.calls.at(-1)).toEqual([null]);
  });

  it("holds a controlled height on the nearest whole line, and follows the app's value", async () => {
    let set: (value: number | null) => void = () => {};
    function Controlled() {
      const [value, setValue] = useState<number | null>(null);
      set = setValue;
      return <Composer label="Reply" resizable resizeLabel={label} rows={1} height={value} onHeightChange={setValue} onSend={() => {}} />;
    }
    const view = await render(<Controlled />);
    await act(async () => set(Math.round(4 * line(view.textarea) + offset(view.textarea)) + 3));
    await expect.poll(() => wholeLines(view.textarea)).toBeCloseTo(4, 1);
    view.edge.focus();
    await userEvent.keyboard("{ArrowDown}");
    await expect.poll(() => wholeLines(view.textarea)).toBeCloseTo(3, 1);
  });

  it("fades its line in on a drag with opacity only, at rest and with reduced motion", async () => {
    const view = await render(<Composer label="Reply" resizable resizeLabel={label} rows={1} maxRows={6} onSend={() => {}} />);
    const fast = parseDuration(getComputedStyle(document.documentElement).getPropertyValue("--ouro-duration-fast"));
    const lineEl = view.edge.querySelector<HTMLElement>('[data-ouro-part="resize-line"]')!;
    expect(getComputedStyle(lineEl).opacity).toBe("0");
    try {
      for (const reduced of [false, true]) {
        await commands.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
        view.edge.setAttribute("data-dragging", "");
        await expectMotion(lineEl, { stem: "composer", state: "data-dragging", properties: { opacity: fast }, reduced });
        view.edge.removeAttribute("data-dragging");
        await expect.poll(() => getComputedStyle(lineEl).opacity).toBe("0");
      }
    } finally {
      await commands.emulateMedia({ reducedMotion: "no-preference" });
    }
  });
});
